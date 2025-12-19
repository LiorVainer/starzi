import { Language, MovieStatus, Prisma } from '@prisma/client';
import { Movie as TmdbMovie, MovieDetails, PersonDetails, Video } from 'tmdb-ts';

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
    base: TmdbMovie;
    details: MovieDetails;
    translations: MovieDetails[];
    credits: { cast: PersonDetails[] };
    videos: Video[];
};

export type MoviePayload = {
    create: Prisma.MovieCreateInput;
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
