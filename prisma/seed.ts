import { createDALs } from '@/dal';
import { fileURLToPath } from 'url';
import { basename } from 'path';
import { tmdb } from '@/lib/api-clients';
import { prisma } from '@/lib/prisma';
import { PrismaService } from '@/lib/prismaService';
import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import { MovieStatus } from '@prisma/client';
import { withSentryTransaction } from '@/lib/sentry/withTransaction';
import * as Sentry from '@sentry/nextjs';

import { ingestMoviesBatch } from '@/lib/ingestion/movieIngestion';
import { MovieFeed } from '@/lib/ingestion/types';
import { cacheGenreTranslations } from '@/lib/ingestion/cache';
import { SEED_CONFIG } from '@/constants/seed-config';
import { sendCatalogRefreshEmail } from '@/lib/email/sendCatalogRefreshEmail';

type ScopedLogger = ReturnType<typeof logger.scope>;
type CatalogRefreshOptions = {
    wrapWithTransaction?: boolean;
};

type TmdbMovieResult = { id: number; title: string };
type MovieFeedFetcher = () => Promise<{ results?: TmdbMovieResult[] }>;

type CatalogRefreshConfig = {
    scope: string;
    transactionName: string;
    feedName: string;
    sourceTag: string;
    movieStatus: MovieStatus;
    fetchMovies: MovieFeedFetcher;
    fallbackStatus?: MovieStatus;
};

const prismaService = new PrismaService(prisma);
const dal = createDALs(prismaService);

// Utility function to format duration
function formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runSpan<T>(log: ScopedLogger, description: string, op: string, operation: () => Promise<T>): Promise<T> {
    return withSentrySpan(op, description, async () => {
        const startTime = Date.now();
        log.info(`Starting: ${description}`);
        Sentry.logger.info(`catalog.span.start.${op}`, { description });

        try {
            const result = await operation();
            const duration = Date.now() - startTime;
            log.info(`Completed: ${description} (${formatDuration(duration)})`, { durationMs: duration });
            Sentry.logger.info(`catalog.span.complete.${op}`, { description, durationMs: duration });
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            log.error(`Failed: ${description} (${formatDuration(duration)})`, error as Error);
            Sentry.logger.error(`catalog.span.failed.${op}`, {
                description,
                durationMs: duration,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    });
}

async function runCatalogRefreshJob(config: CatalogRefreshConfig, options: CatalogRefreshOptions = {}): Promise<void> {
    const { wrapWithTransaction = true } = options;
    const transactionLogger = logger.scope(config.scope);

    const executeSeed = async () => {
        const totalStartTime = Date.now();
        const refreshContext = {
            startedAt: new Date().toISOString(),
            source: 'catalog-refresh',
            feed: config.feedName,
        };

        let success = false;
        let processedCount = 0;
        let errorMessage: string | undefined;
        let totalDuration = 0;

        try {
            transactionLogger.info(`Starting ${config.feedName} catalog refresh process...`);
            transactionLogger.info(`Started at: ${new Date().toISOString()}`);
            Sentry.logger.info('catalog.refresh.start', refreshContext);
            Sentry.withScope((scope) => {
                scope.setLevel('info');
                scope.setTag('job', 'catalog-refresh');
                scope.setContext('refresh', refreshContext);
                Sentry.captureMessage('catalog.refresh.start');
            });

            await runSpan(transactionLogger, 'Genre translations caching', 'db', async () => {
                await cacheGenreTranslations();
            });

            await wait(SEED_CONFIG.DB_OPERATION_DELAY);

            const moviesResponse = await runSpan(
                transactionLogger,
                `Fetching ${config.feedName} movies`,
                'external',
                async () => {
                    transactionLogger.info(`Fetching ${config.feedName} movies from TMDB`);
                    return config.fetchMovies();
                },
            );

            const movies: MovieFeed[] = (moviesResponse.results ?? []).map((m) => ({ tmdbId: m.id, title: m.title }));
            processedCount = movies.length;

            if (!movies.length) {
                transactionLogger.warn('No movies found in TMDB feed.');
                Sentry.logger.warn('catalog.refresh.no_results', { source: config.sourceTag });
                return;
            }

            transactionLogger.info(`Found ${movies.length} movies to process`);

            await ingestMoviesBatch(dal, movies, {
                language: SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY,
                region: SEED_CONFIG.TMDB_REGION,
                movieStatus: config.movieStatus,
                fallbackStatus: config.fallbackStatus,
            });

            totalDuration = Date.now() - totalStartTime;
            transactionLogger.info(`Catalog refresh complete. Processed ${processedCount} movies.`, { processedCount });

            success = true;
        } catch (error) {
            totalDuration = Date.now() - totalStartTime;
            success = false;
            errorMessage = error instanceof Error ? error.message : String(error);

            transactionLogger.error('Catalog refresh failed', error as Error);
            transactionLogger.info(`Failed after: ${formatDuration(totalDuration)}`, { durationMs: totalDuration });

            throw error;
        } finally {
            try {
                await sendCatalogRefreshEmail({
                    success,
                    processedCount,
                    durationMs: totalDuration,
                    errorMessage,
                });
                transactionLogger.info(`Sent catalog refresh email (${success ? 'success' : 'failure'})`);
            } catch (emailError) {
                transactionLogger.error('Failed to send catalog refresh email', emailError as Error);
            }

            transactionLogger.info(`Job finished at: ${new Date().toISOString()}`);
            totalDuration = Date.now() - totalStartTime;
            transactionLogger.info(`Total duration: ${formatDuration(totalDuration)}`, {
                durationMs: totalDuration,
            });
        }
    };

    if (wrapWithTransaction) {
        await withSentryTransaction(config.transactionName, executeSeed, { op: 'job' });
        return;
    }

    await executeSeed();
}

export async function refreshNowPlayingCatalog(options: CatalogRefreshOptions = {}): Promise<void> {
    return runCatalogRefreshJob(
        {
            scope: 'catalog-refresh:now-playing',
            transactionName: 'catalog:refresh:nowPlaying',
            feedName: 'now-playing',
            sourceTag: 'tmdb.now_playing',
            movieStatus: MovieStatus.NOW_PLAYING,
            fallbackStatus: MovieStatus.LEFT_CINEMAS,
            fetchMovies: () =>
                tmdb.movies.nowPlaying({
                    language: SEED_CONFIG.TMDB_LANGUAGES.PRIMARY,
                    region: SEED_CONFIG.TMDB_REGION,
                }),
        },
        options,
    );
}

export async function refreshUpcomingCatalog(options: CatalogRefreshOptions = {}): Promise<void> {
    return runCatalogRefreshJob(
        {
            scope: 'catalog-refresh:upcoming',
            transactionName: 'catalog:refresh:upcoming',
            feedName: 'upcoming',
            sourceTag: 'tmdb.upcoming',
            movieStatus: MovieStatus.UPCOMING,
            fetchMovies: () =>
                tmdb.movies.upcoming({
                    language: SEED_CONFIG.TMDB_LANGUAGES.PRIMARY,
                    region: SEED_CONFIG.TMDB_REGION,
                }),
        },
        options,
    );
}

// Utility function for targeted refresh
export async function refreshSpecificMovie(tmdbId: number, options: CatalogRefreshOptions = {}): Promise<void> {
    const { wrapWithTransaction = true } = options;
    const transactionLogger = logger.scope('catalog-refresh:specific');

    const executeSeed = async () => {
        const startTime = Date.now();

        try {
            transactionLogger.info(`Refreshing specific movie: ${tmdbId}`);
            transactionLogger.info(`Started at: ${new Date().toISOString()}`);

            await runSpan(transactionLogger, 'Genre translations caching', 'db', async () => {
                await cacheGenreTranslations();
            });

            const movieDetails = await runSpan(
                transactionLogger,
                `Fetching movie details for ${tmdbId}`,
                'external',
                async () => tmdb.movies.details(tmdbId),
            );

            await ingestMoviesBatch(dal, [{ tmdbId, title: movieDetails.title }], {
                language: SEED_CONFIG.DEFAULT_LANGUAGES.PRIMARY,
                region: SEED_CONFIG.TMDB_REGION,
                movieStatus: MovieStatus.NOW_PLAYING,
            });

            const totalDuration = Date.now() - startTime;
            transactionLogger.info(`Successfully refreshed movie: ${movieDetails.title}`);
            transactionLogger.info(`Finished at: ${new Date().toISOString()}`);
            transactionLogger.info(`Total time: ${formatDuration(totalDuration)}`, { durationMs: totalDuration });
        } catch (error) {
            const totalDuration = Date.now() - startTime;
            transactionLogger.error(`Failed to refresh movie ${tmdbId}`, error as Error);
            transactionLogger.info(`Failed after: ${formatDuration(totalDuration)}`, {
                durationMs: totalDuration,
            });
            throw error;
        }
    };

    if (wrapWithTransaction) {
        await withSentryTransaction(`catalog:refresh:${tmdbId}`, executeSeed, { op: 'job' });
        return;
    }

    await executeSeed();
}

const isRunDirectly = basename(fileURLToPath(import.meta.url)) === 'seed.ts';

// Run as a script
if (isRunDirectly) {
    const cliLogger = logger.scope('catalog-refresh:cli');
    const feedArg = process.argv[2] === 'upcoming' ? 'upcoming' : 'now-playing';
    const runner = feedArg === 'upcoming' ? refreshUpcomingCatalog : refreshNowPlayingCatalog;

    cliLogger.info(`Starting CLI catalog refresh for ${feedArg}`);

    runner()
        .then(async () => {
            cliLogger.info('Disconnecting from database...');
            await prisma.$disconnect();
        })
        .catch(async (err) => {
            cliLogger.error(`Catalog refresh (${feedArg}) failed`, err as Error);
            await prisma.$disconnect();
            process.exit(1);
        });
}
