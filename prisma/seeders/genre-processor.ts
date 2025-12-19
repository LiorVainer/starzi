import { tmdb } from '@/lib/api-clients';
import { Language } from '@prisma/client';
import Bluebird from 'bluebird';
import type { DAL } from '@/dal';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import type { MovieData } from './movie-processor';
import { SEED_CONFIG } from './seed-config';

const processedGenres = new Set<number>();
const genreLogger = logger.scope('processor:genres');
const genreCacheLogger = logger.scope('processor:genre-cache');

export async function processMovieGenres(movieData: MovieData, dal: DAL): Promise<void> {
    const { baseMovie, detailsEn } = movieData;
    const metadata = {
        imdbId: baseMovie.id,
        tmdbId: movieData.tmdbId,
        title: detailsEn.title,
        genreCount: detailsEn.genres?.length ?? 0,
    };

    await withSentrySpan(
        'processor.genre.link',
        `Link genres for ${detailsEn.title}`,
        async () => {
            if (!detailsEn.genres?.length) {
                genreLogger.info('No genres found for movie', metadata);
                Sentry.logger.info('catalog.genre.none_for_movie', metadata);

                Sentry.withScope((scope) => {
                    scope.setLevel('info');
                    scope.setTag('processor', 'movie-genres');
                    scope.setContext('movie', metadata);
                    scope.setContext('genres', { count: 0 });
                    Sentry.captureMessage('catalog.genre.none_for_movie');
                });
                return;
            }

            for (const genre of detailsEn.genres) {
                if (processedGenres.has(genre.id)) {
                    continue;
                }

                try {
                    const baseGenre = await dal.genres.upsertBaseGenre(genre.id);
                    processedGenres.add(genre.id);

                    const genreNameEn = genre.name;
                    const genreNameHe =
                        getCachedGenreTranslation(genre.id, SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY) || genre.name;

                    await Bluebird.all([
                        dal.genres.upsertTranslation(baseGenre.id, Language.en_US, genreNameEn),
                        dal.genres.upsertTranslation(baseGenre.id, Language.he_IL, genreNameHe),
                    ]);

                    const genreContext = {
                        tmdbId: genre.id,
                        baseId: baseGenre.id,
                        names: {
                            en: genreNameEn,
                            he: genreNameHe,
                        },
                    };

                    genreLogger.info('Processed genre', genreContext);
                    Sentry.logger.info('catalog.genre.processed', genreContext);

                    Sentry.withScope((scope) => {
                        scope.setLevel('info');
                        scope.setTag('processor', 'movie-genres');
                        scope.setContext('movie', metadata);
                        scope.setContext('genre', genreContext);
                        Sentry.captureMessage('catalog.genre.processed');
                    });
                } catch (error: unknown) {
                    if ((error as { code?: string; meta?: { target?: string[] } }).code === 'P2002') {
                        genreLogger.info('Genre already exists; skipping', { tmdbId: genre.id, name: genre.name });
                        processedGenres.add(genre.id);
                        Sentry.logger.info('catalog.genre.skip_existing', { tmdbId: genre.id, name: genre.name });
                        continue;
                    }

                    const err = error instanceof Error ? error : new Error(String(error));
                    genreLogger.error('Failed to process genre', err);
                    Sentry.logger.error('catalog.genre.process_failed', {
                        tmdbId: genre.id,
                        name: genre.name,
                        error: err.message,
                    });

                    Sentry.withScope((scope) => {
                        scope.setLevel('error');
                        scope.setTag('processor', 'movie-genres');
                        scope.setContext('movie', metadata);
                        scope.setContext('genre', { tmdbId: genre.id, name: genre.name });
                        scope.setContext('error', { message: err.message, stack: err.stack });
                        Sentry.captureException(err);
                    });
                    throw err;
                }
            }

            await dal.movies.connectGenres(
                baseMovie.id,
                detailsEn.genres.map((g) => g.id),
            );
            genreLogger.info('Linked genres with movie', metadata);
            Sentry.logger.info('catalog.genre.linked_to_movie', metadata);

            Sentry.withScope((scope) => {
                scope.setLevel('info');
                scope.setTag('processor', 'movie-genres');
                scope.setContext('movie', metadata);
                scope.setContext('genres', {
                    count: detailsEn.genres.length,
                    ids: detailsEn.genres.map((genre) => genre.id),
                });
                Sentry.captureMessage('catalog.genre.linked_to_movie');
            });
        },
        {
            data: metadata,
            tags: {
                processor: 'movie-genres',
            },
        },
    );
}

const genreCache = new Map<string, string>();

export async function cacheGenreTranslations(): Promise<void> {
    await withSentrySpan(
        'processor.genre.cache',
        'Cache genre translations',
        async () => {
            genreCacheLogger.info('Caching genre translations');
            Sentry.logger.info('catalog.genre.cache.start', { languages: ['en-US', 'he-IL'] });

            try {
                const [genresEn, genresHe] = await Bluebird.all([
                    tmdb.genres.movies({ language: SEED_CONFIG.DEFAULT_LANGUAGES.SECONDARY }),
                    tmdb.genres.movies({ language: SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY }),
                ]);

                genresEn.genres?.forEach((genre) => {
                    genreCache.set(`${genre.id}-${SEED_CONFIG.DEFAULT_LANGUAGES.SECONDARY}`, genre.name);
                });

                genresHe.genres?.forEach((genre) => {
                    genreCache.set(`${genre.id}-${SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY}`, genre.name);
                });

                const cacheStats = { cached: genreCache.size };
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

export function getCachedGenreTranslation(genreId: number, language: string): string {
    const cached = genreCache.get(`${genreId}-${language}`);
    return cached || `Genre ${genreId}`;
}

export function clearProcessedGenresCache(): void {
    processedGenres.clear();
}
