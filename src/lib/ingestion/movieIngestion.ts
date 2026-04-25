import { DAL } from '@/dal';
import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import { tmdb } from '@/lib/api-clients';
import { SEED_CONFIG } from '@/constants/seed-config';
import { CastPayload, FetchedCastMember, FetchedMovie, IngestionConfig, MovieFeed, MoviePayload } from './types';
import { chunkArray } from './utils';
import { Language, Prisma } from '@prisma/client';
import Bluebird from 'bluebird';

const ingestionLogger = logger.scope('ingestion');

export async function ingestMoviesBatch(dal: DAL, moviesFeed: MovieFeed[], config: IngestionConfig) {
    return withSentrySpan('ingest.batch', 'Ingest movies batch', async () => {
        ingestionLogger.info('Ingesting movies batch', { count: moviesFeed.length, status: config.movieStatus });
        const chunks = chunkArray(moviesFeed, SEED_CONFIG.MOVIE_PROCESSING_CONCURRENCY);
        for (const chunk of chunks) {
            await processMovieChunk(dal, chunk, config);
        }
    });
}

async function processMovieChunk(dal: DAL, chunk: MovieFeed[], config: IngestionConfig) {
    const fetchedMovies = await fetchMoviesDetails(chunk);
    const moviePayloads = await buildMoviePayloads(fetchedMovies, config);
    await writeToDatabase(dal, moviePayloads, config);
}

async function fetchMoviesDetails(movies: MovieFeed[]): Promise<FetchedMovie[]> {
    return Bluebird.map(
        movies,
        async (movie) => {
            const [details, translations, credits, videos] = await Promise.all([
                tmdb.movies.details(movie.tmdbId),
                tmdb.movies.translations(movie.tmdbId),
                tmdb.movies.credits(movie.tmdbId),
                tmdb.movies.videos(movie.tmdbId),
            ]);

            const castWithDetails: FetchedCastMember[] = await Bluebird.map(
                credits.cast?.slice(0, SEED_CONFIG.MAX_CAST_MEMBERS_PER_MOVIE) ?? [],
                async (person) => {
                    const personDetails = await tmdb.people.details(person.id);

                    return {
                        ...personDetails,
                        character: person.character,
                        order: person.order,
                    };
                },
                { concurrency: 5 },
            );

            return {
                base: movie,
                details,
                translations: translations.translations,
                credits: { ...credits, cast: castWithDetails },
                videos: videos.results,
            };
        },
        { concurrency: SEED_CONFIG.MOVIE_PROCESSING_CONCURRENCY },
    );
}

async function buildMoviePayloads(fetchedMovies: FetchedMovie[], config: IngestionConfig): Promise<MoviePayload[]> {
    const payloads: MoviePayload[] = [];

    for (const movie of fetchedMovies) {
        const { details, videos, credits, translations } = movie;

        const translationEn = translations.find((t) => t.iso_639_1 === 'en');
        const translationHe = translations.find((t) => t.iso_639_1 === 'he');

        const createPayload: Prisma.MovieCreateManyInput = {
            id: details.imdb_id!,
            imdbId: details.imdb_id!,
            tmdbId: details.id,
            status: config.movieStatus,
            runtime: details.runtime,
            releaseDate: details.release_date ? new Date(details.release_date) : null,
            originalLanguage: details.original_language === 'he' ? Language.he_IL : Language.en_US,
        };

        const translationPayloads: Prisma.MovieTranslationCreateManyInput[] = [
            {
                movieId: createPayload.imdbId,
                language: Language.en_US,
                title: translationEn?.data.title || details.title,
                description: translationEn?.data.overview || details.overview,
                originalTitle: details.original_title,
                posterUrl: details.poster_path ? `${SEED_CONFIG.TMDB_POSTER_BASE_URL}${details.poster_path}` : null,
            },
            {
                movieId: createPayload.imdbId,
                language: Language.he_IL,
                title: translationHe?.data.title || details.title,
                description: translationHe?.data.overview || details.overview,
                originalTitle: details.original_title,
                posterUrl: details.poster_path ? `${SEED_CONFIG.TMDB_POSTER_BASE_URL}${details.poster_path}` : null,
            },
        ];

        const trailerPayloads: Prisma.TrailerCreateManyInput[] = videos
            .filter((v) => v.type === 'Trailer' && v.site === 'YouTube')
            .map((t) => ({
                movieId: createPayload.imdbId,
                title: t.name,
                youtubeId: t.key,
                language: Language.en_US, // TMDB videos are not localized well
                url: `https://www.youtube.com/watch?v=${t.key}`,
            }));

        const castPayloads: CastPayload[] = [];
        if (credits.cast) {
            for (const person of credits.cast) {
                const actorId = person.imdb_id || `tmdb-${person.id}`;
                const actorCreate: Prisma.ActorCreateManyInput = {
                    id: actorId,
                    imdbId: actorId, // Use real imdb_id, fallback to tmdb-id
                    tmdbId: person.id,
                    profileUrl: person.profile_path
                        ? `${SEED_CONFIG.TMDB_POSTER_BASE_URL}${person.profile_path}`
                        : null,
                    popularity: person.popularity,
                    birthday: person.birthday ? new Date(person.birthday) : null,
                    deathday: person.deathday ? new Date(person.deathday) : null,
                    placeOfBirth: person.place_of_birth,
                };

                const actorTranslations: Prisma.ActorTranslationCreateManyInput[] = [
                    {
                        actorId: actorCreate.imdbId,
                        language: Language.en_US,
                        name: person.name,
                        biography: person.biography,
                    },
                ];

                const castConnection: Omit<Prisma.CastCreateManyInput, 'actorId'> = {
                    movieId: createPayload.imdbId,
                    character: person.character,
                    order: person.order,
                };

                castPayloads.push({
                    create: actorCreate,
                    translations: actorTranslations,
                    connection: castConnection,
                });
            }
        }

        payloads.push({
            create: createPayload,
            translations: translationPayloads,
            trailers: trailerPayloads,
            genres: details.genres.map((g) => g.id),
            cast: castPayloads,
        });
    }

    return payloads;
}

async function writeToDatabase(dal: DAL, payloads: MoviePayload[], config: IngestionConfig) {
    const moviesToCreate = payloads.map((p) => p.create);
    const translationsToCreate = payloads.flatMap((p) => p.translations);
    const trailersToCreate = payloads.flatMap((p) => p.trailers);
    const actorsToCreate = payloads.flatMap((p) => p.cast.map((c) => c.create));

    await dal.movies.createManyBase(moviesToCreate);
    await dal.movies.createTranslationsBulk(translationsToCreate);
    await dal.movies.bulkInsertTrailers(trailersToCreate);
    await dal.actors.upsertManyBase(actorsToCreate);
    const actors = await dal.actors.findManyByImdbIds(actorsToCreate.map((actor) => actor.imdbId));
    const actorIdByImdbId = new Map(actors.map((actor) => [actor.imdbId, actor.id]));
    const getActorId = (imdbId: string) => {
        const actorId = actorIdByImdbId.get(imdbId);
        if (!actorId) {
            throw new Error(`Actor was not created for imdbId: ${imdbId}`);
        }
        return actorId;
    };

    const actorTranslationsToCreate = payloads.flatMap((p) =>
        p.cast.flatMap((c) =>
            c.translations.map((translation) => ({
                ...translation,
                actorId: getActorId(c.create.imdbId),
            })),
        ),
    );
    const castConnectionsToCreate = payloads.flatMap((p) =>
        p.cast.map((c) => ({ ...c.connection, actorId: getActorId(c.create.imdbId) })),
    );

    await dal.actors.createTranslationsBulk(actorTranslationsToCreate);
    await dal.actors.bulkConnectCast(castConnectionsToCreate);

    // Connect genres: first fetch all genres by TMDB IDs to get Prisma IDs
    const allTmdbGenreIds = Array.from(new Set(payloads.flatMap((p) => p.genres)));
    const genresFromDb = await dal.genres.findManyByTmdbIds(allTmdbGenreIds);
    const tmdbIdToPrismaId = new Map(genresFromDb.map((g) => [g.tmdbId, g.id]));

    const genreConnections = payloads
        .map((p) => ({
            movieId: p.create.imdbId,
            genreIds: p.genres.map((tmdbId) => tmdbIdToPrismaId.get(tmdbId)).filter((id): id is string => id !== undefined),
        }))
        .filter((conn) => conn.genreIds.length > 0);

    if (genreConnections.length > 0) {
        await dal.movies.bulkConnectGenres(genreConnections);
    }

    if (config.fallbackStatus) {
        const tmdbIdsToKeep = payloads.map((p) => p.create.tmdbId);
        await dal.movies.markMissingMoviesAsFallback(config.movieStatus, config.fallbackStatus, tmdbIdsToKeep);
    }
}
