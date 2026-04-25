import type { Prisma, Language } from '@prisma/client';

export type PopulatedMovie = Prisma.MovieGetPayload<{
    include: { genres: true; trailers: true };
}>;

export type FullyPopulatedMovie = Prisma.MovieGetPayload<{
    include: {
        genres: {
            include: {
                translations: true;
            };
        };
        trailers: true;
        translations: true;
        cast: {
            include: {
                actor: {
                    include: {
                        translations: true;
                    };
                };
            };
            orderBy: {
                order: 'asc';
            };
        };
    };
}>;

// Define the "fully populated movie" include
// export const movieWithLanguageTranslationInclude = Prisma.validator<Prisma.MovieInclude>()({
//     genres: {
//         include: {
//             translations: true,
//         },
//     },
//     trailers: true,
//     translations: true,
//     cast: {
//         include: {
//             actor: {
//                 include: {
//                     translations: true,
//                 },
//             },
//         },
//         orderBy: { order: 'asc' },
//     },
// });
//
// export type MovieWithLanguageTranslationFull = Prisma.MovieGetPayload<{
//     include: typeof movieWithLanguageTranslationInclude;
// }>;
//
// const movie: MovieWithLanguageTranslationFull = {
//
// }

export type MovieWithLanguageTranslation = {
    id: string;
    rating: number | null;
    votes: number | null;
    releaseDate: Date | null;
    imdbId: string | null;
    originalLanguage: Language | null;
    tmdbId: number | null;
    createdAt: Date;
    updatedAt: Date;
    // Translation fields for the requested language (including posterUrl)
    title: string;
    description: string | null;
    originalTitle: string | null;
    runtime: number | null;
    posterUrl: string | null; // Now comes from translations
    // Related data with language-specific names
    genres: Array<{
        id: string;
        name: string; // Language-specific genre name
        tmdbId: number | null;
    }>;
    trailers: Array<{
        id: string;
        url: string;
        title: string;
        language: Language;
        youtubeId: string;
    }>;
    cast: Array<{
        id: string;
        character: string | null;
        order: number | null;
        actor: {
            id: string;
            profileUrl: string | null;
            tmdbId: number | null;
            imdbId: string;
            popularity: number | null;
            birthday: Date | null;
            deathday: Date | null;
            placeOfBirth: string | null;
            // Actor translation for the requested language
            name: string;
            biography: string | null;
        };
    }>;
};
