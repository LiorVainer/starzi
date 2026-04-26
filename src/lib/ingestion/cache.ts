import type { Actor, Genre, Movie } from '@prisma/client';
import { tmdb } from '@/lib/api-clients';
import { SEED_CONFIG } from '@/constants/seed-config';
import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import * as Sentry from '@sentry/nextjs';
import Bluebird from 'bluebird';

export type MovieCacheEntry = Pick<Movie, 'id' | 'imdbId' | 'tmdbId' | 'status'> & {
    title?: string;
};

export type ActorCacheEntry = Pick<Actor, 'id' | 'imdbId' | 'tmdbId'> & {
    name?: string;
};

export type GenreCacheEntry = Pick<Genre, 'id' | 'tmdbId'> & {
    name?: string;
};

const genreCacheLogger = logger.scope('ingestion:genre-cache');
const genreTranslationCache = new Map<string, string>();

type CacheState = {
    movies: Map<string, MovieCacheEntry>;
    moviesByTmdb: Map<number, MovieCacheEntry>;
    actors: Map<string, ActorCacheEntry>;
    actorsByTmdb: Map<number, ActorCacheEntry>;
    genres: Map<number, GenreCacheEntry>;
};

const state: CacheState = {
    movies: new Map(),
    moviesByTmdb: new Map(),
    actors: new Map(),
    actorsByTmdb: new Map(),
    genres: new Map(),
};

export function cacheMovies(entries: MovieCacheEntry[]) {
    entries.forEach((entry) => {
        state.movies.set(entry.imdbId, entry);
        if (entry.tmdbId !== null) {
            state.moviesByTmdb.set(entry.tmdbId, entry);
        }
    });
}

export function cacheActors(entries: ActorCacheEntry[]) {
    entries.forEach((entry) => {
        state.actors.set(entry.imdbId, entry);
        if (entry.tmdbId !== null) {
            state.actorsByTmdb.set(entry.tmdbId, entry);
        }
    });
}

export function cacheGenres(entries: GenreCacheEntry[]) {
    entries.forEach((entry) => {
        if (entry.tmdbId !== null) {
            state.genres.set(entry.tmdbId, entry);
        }
    });
}

export function getMovieByImdbId(imdbId: string) {
    return state.movies.get(imdbId);
}

export function getMovieByTmdbId(tmdbId: number) {
    return state.moviesByTmdb.get(tmdbId);
}

export function getActorByImdbId(imdbId: string) {
    return state.actors.get(imdbId);
}

export function getActorByTmdbId(tmdbId: number) {
    return state.actorsByTmdb.get(tmdbId);
}

export function getGenreByTmdbId(tmdbId: number) {
    return state.genres.get(tmdbId);
}

export function clearCache() {
    state.movies.clear();
    state.moviesByTmdb.clear();
    state.actors.clear();
    state.actorsByTmdb.clear();
    state.genres.clear();
    genreTranslationCache.clear();
}

/**
 * Fetches and caches genre translations from TMDB for both Hebrew and English
 */
export async function cacheGenreTranslations(): Promise<void> {
    await withSentrySpan(
        'ingestion.genre.cache',
        'Cache genre translations',
        async () => {
            genreCacheLogger.info('Caching genre translations');
            Sentry.logger.info('catalog.genre.cache.start', { languages: ['en-US', 'he-IL'] });

            try {
                const [genresEn, genresHe] = await Bluebird.all([
                    tmdb.genres.movies({ language: SEED_CONFIG.TMDB_LANGUAGES.SECONDARY }),
                    tmdb.genres.movies({ language: SEED_CONFIG.TMDB_LANGUAGES.PRIMARY }),
                ]);

                genresEn.genres?.forEach((genre) => {
                    genreTranslationCache.set(`${genre.id}-${SEED_CONFIG.TMDB_LANGUAGES.SECONDARY}`, genre.name);
                });

                genresHe.genres?.forEach((genre) => {
                    genreTranslationCache.set(`${genre.id}-${SEED_CONFIG.TMDB_LANGUAGES.PRIMARY}`, genre.name);
                });

                const cacheStats = { cached: genreTranslationCache.size };
                genreCacheLogger.info('Cached genre translations', cacheStats);
                Sentry.logger.info('catalog.genre.cache.success', cacheStats);

                Sentry.withScope((scope) => {
                    scope.setLevel('info');
                    scope.setTag('processor', 'genre-cache');
                    scope.setContext('cache', cacheStats);
                    Sentry.captureMessage('catalog.genre.cache.success');
                });
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                genreCacheLogger.error('Failed to cache genre translations', err);
                Sentry.logger.error('catalog.genre.cache.failed', { error: err.message });

                Sentry.withScope((scope) => {
                    scope.setLevel('error');
                    scope.setTag('processor', 'genre-cache');
                    scope.setContext('error', { message: err.message, stack: err.stack });
                    Sentry.captureException(err);
                });
            }
        },
        {
            tags: {
                processor: 'genre-cache',
            },
            data: {
                languages: ['en-US', 'he-IL'],
            },
        },
    );
}
