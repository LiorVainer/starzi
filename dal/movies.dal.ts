import { Language, Prisma, PrismaClient } from '@prisma/client';
import { FullyPopulatedMovie, MovieWithLanguageTranslation } from '@/models/movies.model';
import { redis } from '@/lib/upstash';

/**
 * Movies Data Access Layer (DAL)
 * Encapsulates all Prisma operations related to Movie, MovieTranslation, Genre, and Trailer.
 */
export class MoviesDAL {
    constructor(private prisma: PrismaClient) {}

    async findByTmdbId(tmdbId: number) {
        return this.prisma.movie.findUnique({ where: { tmdbId } });
    }

    /**
     * Finds a movie by ID with all translations and related data
     */
    async findByIdWithTranslations(movieId: string): Promise<FullyPopulatedMovie | null> {
        return this.prisma.movie.findUnique({
            where: { id: movieId },
            include: {
                genres: {
                    include: {
                        translations: true,
                    },
                },
                trailers: true,
                translations: true,
                cast: {
                    include: {
                        actor: {
                            include: {
                                translations: true,
                            },
                        },
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
        });
    }

    /**
     * Finds a movie by ID with translation for a specific language
     */
    async findByIdWithLanguageTranslation(
        movieId: string,
        language: Language,
    ): Promise<MovieWithLanguageTranslation | null> {
        const movie = await this.findByIdWithTranslations(movieId);

        if (!movie) return null;

        return this.transformToLanguageSpecific(movie, language);
    }

    async upsertBase(
        data: Pick<
            Prisma.MovieCreateInput,
            'id' | 'imdbId' | 'tmdbId' | 'rating' | 'votes' | 'status' | 'runtime' | 'releaseDate' | 'originalLanguage'
        >,
    ) {
        return this.prisma.movie.upsert({
            where: { imdbId: data.imdbId },
            create: {
                id: data.id,
                imdbId: data.imdbId,
                tmdbId: data.tmdbId,
                rating: data.rating ?? null,
                votes: data.votes ?? null,
                status: data.status ?? 'NOW_PLAYING',
                runtime: data.runtime ?? 0,
                releaseDate: data.releaseDate ?? null,
                originalLanguage: data.originalLanguage ?? null,
            },
            update: {
                rating: data.rating ?? null,
                votes: data.votes ?? null,
                status: data.status ?? 'NOW_PLAYING',
                runtime: data.runtime ?? 0,
                releaseDate: data.releaseDate ?? null,
                originalLanguage: data.originalLanguage ?? null,
            },
        });
    }

    async updateRating(imdbId: string, data: Pick<Prisma.MovieUpdateInput, 'rating' | 'votes'>) {
        return this.prisma.movie.update({
            where: { imdbId },
            data: {
                rating: data.rating ?? null,
                votes: data.votes ?? null,
            },
        });
    }

    async upsertTranslation(
        movieId: string,
        language: Language,
        data: Omit<Prisma.MovieTranslationCreateInput, 'movie' | 'language'>,
    ) {
        return this.prisma.movieTranslation.upsert({
            where: { movieId_language: { movieId, language } },
            create: {
                ...data,
                movie: { connect: { id: movieId } },
                language,
            },
            update: data,
        });
    }

    async connectGenres(movieId: string, tmdbGenreIds: number[]) {
        if (!tmdbGenreIds.length) return;

        // First, find all genre records by their TMDB IDs
        const genres = await this.prisma.genre.findMany({
            where: {
                tmdbId: { in: tmdbGenreIds },
            },
        });

        // Connect the movie to the found genres using their Prisma IDs
        await this.prisma.movie.update({
            where: { id: movieId },
            data: {
                genres: {
                    set: genres.map((genre) => ({ id: genre.id })),
                },
            },
        });
    }

    async upsertAllTrailers(movieId: string, trailers: { title: string; key: string; language: Language }[]) {
        for (const t of trailers) {
            const url = `https://www.youtube.com/watch?v=${t.key}`;
            await this.prisma.trailer.upsert({
                where: { movieId_url: { movieId, url } },
                create: {
                    movie: { connect: { id: movieId } },
                    language: t.language,
                    youtubeId: t.key,
                    title: t.title,
                    url,
                },
                update: {
                    title: t.title,
                    youtubeId: t.key,
                },
            });
        }
    }

    /**
     * Gets movies with all populated data including cast and translations
     */
    async getFullyPopulatedMovies(options?: {
        where?: Prisma.MovieWhereInput;
        orderBy?: Prisma.MovieOrderByWithRelationInput[];
        skip?: number;
        take?: number;
    }): Promise<FullyPopulatedMovie[]> {
        return this.prisma.movie.findMany({
            where: options?.where,
            orderBy: options?.orderBy,
            skip: options?.skip,
            take: options?.take,
            include: {
                genres: {
                    include: {
                        translations: true, // Include genre translations
                    },
                },
                trailers: true,
                translations: true,
                cast: {
                    include: {
                        actor: {
                            include: {
                                translations: true,
                            },
                        },
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
        });
    }

    /**
     * Gets movies with translations for a specific language
     */
    async getMoviesWithLanguageTranslation(
        language: Language,
        options?: {
            where?: Prisma.MovieWhereInput;
            orderBy?: Prisma.MovieOrderByWithRelationInput[];
            skip?: number;
            take?: number;
        },
    ): Promise<MovieWithLanguageTranslation[]> {
        const movies = await this.getFullyPopulatedMovies(options);

        return movies.map((movie) => this.transformToLanguageSpecific(movie, language));
    }

    /**
     * New: Get poster URLs for the best-rated movies.
     * Queries `movieTranslation` directly, prefers `language` if provided, orders by movie.rating and movie.votes.
     */
    async getBestRatedMoviePosters(limit = 12, language?: Language): Promise<string[]> {
        const key = `bestRatedPosters:${language || 'any'}`;
        const cached = await redis.get<string[]>(key);
        if (cached) {
            return cached;
        }

        const preferredWhere: any = { posterUrl: { not: null } };
        if (language) preferredWhere.language = language;

        const preferred = await this.prisma.movieTranslation.findMany({
            select: { movieId: true, posterUrl: true },
            where: preferredWhere,
            orderBy: [{ movie: { rating: 'desc' } }, { movie: { votes: 'desc' } }],
            take: limit,
        });

        const posters: string[] = preferred.map((p) => p.posterUrl!).filter(Boolean);

        await redis.set(key, posters, { ex: 60 * 60 * 24 });

        return posters;
    }

    /**
     * Transforms a fully populated movie to language-specific format
     */
    private transformToLanguageSpecific(movie: FullyPopulatedMovie, language: Language): MovieWithLanguageTranslation {
        // Find translation for the requested language, fallback to any available translation
        const translation = movie.translations.find((t) => t.language === language) || movie.translations[0];

        return {
            id: movie.id,
            rating: movie.rating,
            votes: movie.votes,
            releaseDate: movie.releaseDate,
            imdbId: movie.imdbId,
            originalLanguage: movie.originalLanguage,
            tmdbId: movie.tmdbId,
            createdAt: movie.createdAt,
            updatedAt: movie.updatedAt,
            // Translation fields (including posterUrl from translation)
            title: translation?.title || 'Unknown Title',
            description: translation?.description || null,
            originalTitle: translation?.originalTitle || null,
            posterUrl: translation?.posterUrl || null,
            // Transform genres with language-specific names
            genres: movie.genres.map((genre) => {
                // Find genre translation for the requested language
                const genreTranslation =
                    genre.translations.find((t) => t.language === language) || genre.translations[0];

                return {
                    id: genre.id,
                    name: genreTranslation?.name || `Genre ${genre.tmdbId}`,
                    tmdbId: genre.tmdbId,
                };
            }),
            runtime: movie.runtime,
            trailers: movie.trailers,
            cast: movie.cast.map((castMember) => {
                // Find actor translation for the requested language
                const actorTranslation =
                    castMember.actor.translations.find((t) => t.language === language) ||
                    castMember.actor.translations[0];

                return {
                    id: castMember.id,
                    character: castMember.character,
                    order: castMember.order,
                    actor: {
                        id: castMember.actor.id,
                        profileUrl: castMember.actor.profileUrl,
                        tmdbId: castMember.actor.tmdbId,
                        imdbId: castMember.actor.imdbId,
                        popularity: castMember.actor.popularity,
                        birthday: castMember.actor.birthday,
                        deathday: castMember.actor.deathday,
                        placeOfBirth: castMember.actor.placeOfBirth,
                        name: actorTranslation?.name || 'Unknown Actor',
                        biography: actorTranslation?.biography || null,
                    },
                };
            }),
        };
    }

    /**
     * Counts movies matching the given criteria
     */
    async countMovies(where?: Prisma.MovieWhereInput): Promise<number> {
        return this.prisma.movie.count({ where });
    }
}
