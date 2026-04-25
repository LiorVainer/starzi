import { Language, MovieStatus, Prisma } from '@prisma/client';
import { MovieDetails, PersonDetails, Translation, Video } from 'tmdb-ts';

export type IngestionConfig = {
    language: Language;
    region: string;
    movieStatus: MovieStatus;
    fallbackStatus?: MovieStatus;
};

export type MovieFeed = {
    tmdbId: number;
    title: string;
};

export type FetchedMovie = {
    base: MovieFeed;
    details: MovieDetails;
    translations: Translation[];
    credits: { cast: FetchedCastMember[] };
    videos: Video[];
};

export type FetchedCastMember = PersonDetails & {
    character: string;
    order: number;
};

export type MoviePayload = {
    create: Prisma.MovieCreateManyInput;
    translations: Prisma.MovieTranslationCreateManyInput[];
    trailers: Prisma.TrailerCreateManyInput[];
    genres: number[];
    cast: CastPayload[];
};

export type CastPayload = {
    create: Prisma.ActorCreateInput;
    translations: Prisma.ActorTranslationCreateManyInput[];
    connection: Omit<Prisma.CastCreateManyInput, 'actorId'>;
};
