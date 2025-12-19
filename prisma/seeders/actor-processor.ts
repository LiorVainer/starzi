import { tmdb } from '@/lib/api-clients';
import { Language, Prisma } from '@prisma/client';
import Bluebird from 'bluebird';
import type { DAL } from '@/dal';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import type { MovieData } from './movie-processor';
import { SEED_CONFIG } from './seed-config';
import type { PersonDetails } from 'tmdb-ts';

type CastMember = {
    id: number;
    name: string;
    character: string;
    order: number;
    profile_path: string | null;
    popularity: number;
};

const actorLogger = logger.scope('processor:actors');
const actorBatchLogger = logger.scope('processor:actor-batch');

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processMovieActors(movieData: MovieData, dal: DAL): Promise<void> {
    const { baseMovie, credits, detailsEn } = movieData;

    await withSentrySpan(
        'processor.actor.movie',
        `Process actors for ${detailsEn.title}`,
        async () => {
            const cast = credits.cast?.slice(0, SEED_CONFIG.MAX_CAST_MEMBERS_PER_MOVIE) ?? [];
            const metadata = {
                imdbId: baseMovie.id,
                tmdbId: movieData.tmdbId,
                title: detailsEn.title,
                castCount: cast.length,
            };

            if (!cast.length) {
                actorLogger.info('No cast found for movie', metadata);
                Sentry.logger.info('catalog.actor.none_for_movie', metadata);

                Sentry.withScope((scope) => {
                    scope.setLevel('info');
                    scope.setTag('processor', 'movie-actors');
                    scope.setContext('movie', metadata);
                    Sentry.captureMessage('catalog.actor.none_for_movie');
                });
                return;
            }

            actorLogger.info('Processing actors for movie', metadata);
            Sentry.logger.info('catalog.actor.process_movie.start', metadata);

            await Bluebird.map(
                cast,
                async (person: CastMember, index: number) => {
                    await delay(index > 0 ? SEED_CONFIG.DB_OPERATION_DELAY : 0);

                    const actorMetadata = {
                        tmdbId: person.id,
                        name: person.name,
                        character: person.character ?? null,
                        order: person.order ?? null,
                        movie: metadata,
                    };

                    await withSentrySpan(
                        'processor.actor.individual',
                        `Process actor ${person.name}`,
                        async () => {
                            actorLogger.info('Processing actor', actorMetadata);
                            Sentry.logger.info('catalog.actor.process.start', actorMetadata);

                            try {
                                const actorDetailsEn = (await tmdb.people.details(
                                    person.id,
                                    undefined,
                                    SEED_CONFIG.DEFAULT_LANGUAGES.SECONDARY,
                                )) as PersonDetails;
                                await delay(50);
                                const actorDetailsHe = (await tmdb.people.details(
                                    person.id,
                                    undefined,
                                    SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY,
                                )) as PersonDetails;

                                const actorCreateInput: Prisma.ActorCreateInput = {
                                    imdbId: actorDetailsEn.imdb_id ?? `tmdb-${person.id}`,
                                    tmdbId: person.id,
                                    profileUrl: person.profile_path
                                        ? `${SEED_CONFIG.TMDB_POSTER_BASE_URL}${person.profile_path}`
                                        : null,
                                    popularity: person.popularity ?? null,
                                    birthday: actorDetailsEn.birthday ? new Date(actorDetailsEn.birthday) : null,
                                    deathday: actorDetailsEn.deathday ? new Date(actorDetailsEn.deathday) : null,
                                    placeOfBirth: actorDetailsEn.place_of_birth ?? null,
                                };

                                const baseActor = await dal.actors.upsertBase(actorCreateInput);
                                actorLogger.info('Upserted actor base', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                });
                                Sentry.logger.info('catalog.actor.base_upserted', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                });

                                await delay(25);

                                const translationEn: Omit<Prisma.ActorTranslationCreateInput, 'actor' | 'language'> = {
                                    name: actorDetailsEn.name ?? 'Unknown',
                                    biography: actorDetailsEn.biography ?? null,
                                };

                                const translationHe: Omit<Prisma.ActorTranslationCreateInput, 'actor' | 'language'> = {
                                    name: actorDetailsHe.name ?? actorDetailsEn.name ?? 'Unknown',
                                    biography: actorDetailsHe.biography ?? actorDetailsEn.biography ?? null,
                                };

                                await dal.actors.upsertTranslation(baseActor.id, Language.en_US, translationEn);
                                await delay(25);
                                await dal.actors.upsertTranslation(baseActor.id, Language.he_IL, translationHe);

                                actorLogger.info('Actor translations upserted', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                });
                                Sentry.logger.info('catalog.actor.translations_upserted', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                    languages: ['en-US', 'he-IL'],
                                });

                                await delay(25);

                                const castConnection: Parameters<typeof dal.actors.connectToMovie>[2] = {
                                    character: person.character ?? null,
                                    order: person.order ?? null,
                                };

                                await dal.actors.connectToMovie(baseMovie.id, baseActor.id, castConnection);

                                actorLogger.info('Actor connected to movie', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                });
                                Sentry.logger.info('catalog.actor.linked_to_movie', {
                                    ...actorMetadata,
                                    actorId: baseActor.id,
                                });

                                Sentry.withScope((scope) => {
                                    scope.setLevel('info');
                                    scope.setTag('processor', 'movie-actors');
                                    scope.setContext('actor', {
                                        ...actorMetadata,
                                        actorId: baseActor.id,
                                        imdbId: actorCreateInput.imdbId,
                                    });
                                    scope.setContext('translations', {
                                        languages: ['en-US', 'he-IL'],
                                    });
                                    Sentry.captureMessage('catalog.actor.processed');
                                });
                            } catch (error) {
                                const err = error instanceof Error ? error : new Error(String(error));
                                actorLogger.error('Failed to process actor', err);
                                Sentry.logger.error('catalog.actor.process_failed', {
                                    ...actorMetadata,
                                    error: err.message,
                                });

                                Sentry.withScope((scope) => {
                                    scope.setLevel('error');
                                    scope.setTag('processor', 'movie-actors');
                                    scope.setContext('actor', actorMetadata);
                                    scope.setContext('error', { message: err.message, stack: err.stack });
                                    Sentry.captureException(err);
                                });
                            }
                        },
                        {
                            data: actorMetadata,
                            tags: {
                                processor: 'movie-actors',
                            },
                        },
                    );
                },
                { concurrency: SEED_CONFIG.ACTOR_PROCESSING_CONCURRENCY },
            );

            actorLogger.info('Completed actors for movie', metadata);
            Sentry.logger.info('catalog.actor.process_movie.complete', metadata);

            Sentry.withScope((scope) => {
                scope.setLevel('info');
                scope.setTag('processor', 'movie-actors');
                scope.setContext('movie', metadata);
                Sentry.captureMessage('catalog.actor.process_movie.complete');
            });
        },
        {
            data: {
                movie: {
                    tmdbId: movieData.tmdbId,
                    imdbId: baseMovie.id,
                    title: detailsEn.title,
                },
            },
            tags: {
                processor: 'movie-actors',
            },
        },
    );
}

export async function batchProcessActors(movieDataList: MovieData[], dal: DAL): Promise<void> {
    await withSentrySpan(
        'processor.actor.batch',
        'Batch process actors',
        async () => {
            actorBatchLogger.info('Batch processing actors', { movies: movieDataList.length });
            Sentry.logger.info('catalog.actor.batch.start', { movies: movieDataList.length });

            for (let i = 0; i < movieDataList.length; i += 1) {
                const movieData = movieDataList[i];
                const context = {
                    index: i + 1,
                    total: movieDataList.length,
                    title: movieData.detailsEn.title,
                    tmdbId: movieData.tmdbId,
                };

                actorBatchLogger.info('Processing movie actors', context);
                Sentry.logger.info('catalog.actor.batch.process_movie', context);
                await processMovieActors(movieData, dal);

                if (i < movieDataList.length - 1) {
                    await delay(SEED_CONFIG.DB_OPERATION_DELAY * 2);
                }
            }

            actorBatchLogger.info('Completed batch actor processing', { movies: movieDataList.length });
            Sentry.logger.info('catalog.actor.batch.complete', { movies: movieDataList.length });

            Sentry.withScope((scope) => {
                scope.setLevel('info');
                scope.setTag('processor', 'actor-batch');
                scope.setContext('batch', { movies: movieDataList.length });
                Sentry.captureMessage('catalog.actor.batch.complete');
            });
        },
        {
            data: {
                movies: movieDataList.length,
            },
            tags: {
                processor: 'actor-batch',
            },
        },
    );
}
