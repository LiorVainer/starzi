'use server';

import { redis } from '@/lib/upstash';
import crypto from 'crypto';
import { omdb, tmdb } from '@/lib/clients';
import { prisma } from '@/lib/prisma';
import { MoviesDAL } from '@/dal';
import { Language, Prisma } from '@prisma/client';
import type { ExternalIds } from 'tmdb-ts';
import type { Movie as OmdbMovie } from '@/lib/omdbapi';
import { SortValue } from '@/constants/sort.const';
import { MovieWithLanguageTranslation } from '@/models/movies.model';

export type SearchedMovie = {
    id: number;
    title: string;
    originalTitle: string;
    overview: string;
    releaseDate: string | null;
    poster: string | null;
    imdbId: string | null;
    imdbRating: number | null;
    imdbVotes: number | null;
};

const moviesDAL = new MoviesDAL(prisma);

export async function searchMovies(query: string): Promise<SearchedMovie[]> {
    if (!query || query.trim().length < 2) return [];

    const results = await tmdb.search.movies({
        query,
        language: 'he-IL',
    });

    return Promise.all(
        results.results.map(async (tmdbMovie) => {
            try {
                const external = (await tmdb.movies.externalIds(tmdbMovie.id)) as ExternalIds;

                let imdbRating: number | null = null;
                let imdbVotes: number | null = null;
                const imdbId: string | null = external.imdb_id ?? null;

                if (imdbId) {
                    const omdbMovie = (await omdb.title.getById({ i: imdbId })) as OmdbMovie;
                    imdbRating =
                        omdbMovie.imdbRating && omdbMovie.imdbRating !== 'N/A'
                            ? parseFloat(omdbMovie.imdbRating)
                            : null;
                    imdbVotes =
                        omdbMovie.imdbVotes && omdbMovie.imdbVotes !== 'N/A'
                            ? parseInt(omdbMovie.imdbVotes.replace(/,/g, ''), 10)
                            : null;

                    console.log({ omdbMovie });
                }

                return {
                    id: tmdbMovie.id,
                    title: tmdbMovie.title,
                    originalTitle: tmdbMovie.original_title,
                    overview: tmdbMovie.overview,
                    releaseDate: tmdbMovie.release_date,
                    poster: tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w200${tmdbMovie.poster_path}` : null,
                    imdbId,
                    imdbRating,
                    imdbVotes,
                } satisfies SearchedMovie;
            } catch {
                return {
                    id: tmdbMovie.id,
                    title: tmdbMovie.title,
                    originalTitle: tmdbMovie.original_title,
                    overview: tmdbMovie.overview,
                    releaseDate: tmdbMovie.release_date,
                    poster: tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w200${tmdbMovie.poster_path}` : null,
                    imdbId: null,
                    imdbRating: null,
                    imdbVotes: null,
                } satisfies SearchedMovie;
            }
        }),
    );
}

export type MovieFilters = {
    search?: string;
    searchDebounced?: string;
    actorName?: string;
    actorNameDebounced?: string;
    sort?: SortValue;
    selectedGenres?: number[];
    page?: number;
    pageSize?: number;
    language?: Language;
};

type NowPlayingMoviesSearchResult = {
    items: MovieWithLanguageTranslation[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export const searchNowPlayingMovies = async (filters: MovieFilters) => {
    const {
        search = '',
        searchDebounced,
        actorName = '',
        actorNameDebounced,
        sort = 'rating:desc',
        selectedGenres = [],
        page = 1,
        pageSize = 24,
        language = Language.he_IL,
    } = filters ?? {};

    const q = (searchDebounced ?? search).trim();
    const actorQuery = (actorNameDebounced ?? actorName ?? '').trim();

    // 🔑 Build a stable cache key (based on filters + locale)
    const key = `search:${language}:${crypto
        .createHash('md5')
        .update(
            JSON.stringify({
                q,
                actorQuery,
                sort,
                selectedGenres,
            }),
        )
        .digest('hex')}`;

    // 🧠 Try Redis cache first
    const cached = await redis.get<NowPlayingMoviesSearchResult | undefined>(key);
    if (cached) {
        console.log(`[cache hit] ${key}`);
        return cached;
    }

    // 🧮 Otherwise, continue with DB + TMDB lookup
    const where: Prisma.MovieWhereInput = {
        releaseDate: {
            lte: new Date(),
            gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
        },
    };

    if (q.length > 0) {
        where.translations = {
            some: {
                OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { originalTitle: { contains: q, mode: 'insensitive' } },
                ],
            },
        };
    }

    if (selectedGenres.length > 0) {
        where.genres = { some: { tmdbId: { in: selectedGenres } } };
    }

    if (actorQuery.length > 0) {
        try {
            const actorSearch = await tmdb.search.people({ query: actorQuery, language: 'he-IL' });
            const actorMatch = actorSearch.results[0];
            if (actorMatch) {
                const credits = await tmdb.people.movieCredits(actorMatch.id);
                const movieIds = (credits.cast ?? [])
                    .map((entry) => entry.id)
                    .filter((id): id is number => typeof id === 'number');
                where.tmdbId = movieIds.length > 0 ? { in: movieIds } : { in: [-1] };
            } else {
                where.tmdbId = { in: [-1] };
            }
        } catch (error) {
            console.error('searchMoviesFiltered: failed to resolve actor filter', error);
        }
    }

    const [field, direction] = (sort || 'rating:desc').split(':') as [
        'rating' | 'votes' | 'releaseDate',
        'asc' | 'desc',
    ];
    const orderBy = [{ [field]: direction }] as Prisma.MovieOrderByWithRelationInput[];

    const skip = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const take = Math.max(1, Math.min(100, pageSize));

    const [items, total] = await Promise.all([
        moviesDAL.getMoviesWithLanguageTranslation(language, { where, orderBy, skip, take }),
        moviesDAL.countMovies(where),
    ]);

    const result = {
        items,
        total,
        page,
        pageSize: take,
        totalPages: Math.ceil(total / take) || 1,
    };

    await redis.set(key, result, { ex: 60 * 60 * 12 });

    console.log(`[cache set] ${key}`);

    return result;
};

export const listGenres = async (language: Language = Language.he_IL) => {
    const genres = await prisma.genre.findMany({
        include: {
            translations: true, // Include all translations, not just the requested language
        },
        orderBy: { tmdbId: 'asc' },
    });

    // Transform to the expected GenreOption format
    return genres.map((genre) => {
        // Find translation for the requested language, fallback to English, then any available
        const requestedTranslation = genre.translations.find((t) => t.language === language);
        const englishTranslation = genre.translations.find((t) => t.language === Language.en_US);
        const anyTranslation = genre.translations[0];

        const translation = requestedTranslation || englishTranslation || anyTranslation;

        return {
            id: genre.tmdbId || 0, // Use tmdbId for filtering
            name: translation?.name || `Genre ${genre.tmdbId}`, // Use translated name with proper fallback
        };
    });
};
