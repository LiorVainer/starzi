import { Language } from '@prisma/client';

// Seeding configuration constants with reduced concurrency to prevent connection pool exhaustion
export const SEED_CONFIG = {
    // Reduced concurrency limits to avoid database connection pool exhaustion
    MOVIE_PROCESSING_CONCURRENCY: 2,          // Reduced from 5 to 2
    TRANSLATION_PROCESSING_CONCURRENCY: 3,    // Reduced from 10 to 3
    GENRE_PROCESSING_CONCURRENCY: 2,          // Reduced from 8 to 2
    TRAILER_PROCESSING_CONCURRENCY: 3,        // Reduced from 10 to 3
    ACTOR_PROCESSING_CONCURRENCY: 1,          // Reduced from 3 to 1 (most DB intensive)
    MOVIE_ACTOR_BATCH_CONCURRENCY: 1,         // Reduced from 2 to 1
    GENRE_TRANSLATION_CONCURRENCY: 2,         // Reduced from 5 to 2

    // Data limits
    MAX_CAST_MEMBERS_PER_MOVIE: 15,
    MAX_DISPLAYED_CAST_MEMBERS: 5,

    // Image URLs
    TMDB_POSTER_BASE_URL: 'https://image.tmdb.org/t/p/w300',
    YOUTUBE_BASE_URL: 'https://www.youtube.com/watch?v=',

    // Languages (Prisma enum format)
    DEFAULT_LANGUAGES: {
        PRIMARY: Language.he_IL,
        SECONDARY: Language.en_US,
    },

    // TMDB API language codes (for API calls)
    TMDB_LANGUAGES: {
        PRIMARY: 'he-IL' as const,
        SECONDARY: 'en-US' as const,
    },

    // TMDB API settings
    TMDB_REGION: 'IL',

    // Database connection management
    DB_OPERATION_DELAY: 100, // Add small delay between operations
} as const;
