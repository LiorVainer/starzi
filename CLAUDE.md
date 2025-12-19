# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Starzi is a multilingual movie discovery and alert platform focused on Israeli cinema. It combines data from TMDB and OMDb APIs, enriches it with localized content (Hebrew & English), and helps users discover movies, track releases, and receive alerts when movies matching their criteria hit theaters.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma + PostgreSQL, Better Auth, shadcn/ui, Tailwind CSS 4, Motion/Framer Motion, next-intl.

## Essential Commands

### Development
```bash
pnpm dev                    # Start dev server with Turbopack (localhost:3000)
pnpm build                  # Generate Prisma client + production build
pnpm start                  # Serve production build
pnpm lint                   # Next.js lint (App Router preset)
pnpm eslint                 # Raw ESLint on src/
pnpm eslint:fix             # Auto-fix linting issues
```

### Database
```bash
pnpm prisma:dev             # Run migrations in development
pnpm prisma:deploy          # Deploy migrations to production
pnpm prisma:reset           # Reset database (force, skip seed)
pnpm prisma:seed            # Seed database
pnpm prisma:generate        # Generate Prisma client
pnpm prisma:studio          # Open Prisma Studio GUI
pnpm db:push                # Push schema changes (accept data loss)
```

### API Client Generation
```bash
pnpm generate:imdbapi-client    # Generate IMDB API client from Swagger
pnpm generate:omdbapi-client    # Generate OMDb API client from Swagger
```

### Testing
There is no automated test suite yet. Manual testing is documented in PRs. Future testing will use React Testing Library or Playwright.

## Architecture & Structure

### Multilingual Translation System

Starzi uses a **multi-table translation pattern** for i18n. Core entities (Movies, Actors, Genres) store language-agnostic fields in base tables, while localized content lives in dedicated translation tables:

- `Movie` → `MovieTranslation` (title, description, originalTitle, posterUrl, backdropUrl per language)
- `Actor` → `ActorTranslation` (name, biography per language)
- `Genre` → `GenreTranslation` (name per language)

Supported languages are defined in the `Language` enum (`he_IL`, `en_US`). Each translation table has a unique constraint on `[entityId, language]`.

**When querying:** Always use the DAL layer to automatically handle language-specific projections. Do NOT write raw Prisma queries that fetch translations—use `MoviesDAL.getMoviesWithLanguageTranslation(language)` or similar DAL methods.

### Data Access Layer (DAL)

All database operations go through DAL classes in `dal/`:

- `MoviesDAL` (dal/movies.dal.ts) - Movie queries, translations, trailers, genres, cast
- `GenresDAL` (dal/genres.dal.ts) - Genre queries with translations
- `ActorsDAL` (dal/actors.dal.ts) - Actor queries with translations
- `FollowsDAL`, `TriggersDAL`, `UserPreferencesDAL` - User notification system

DAL classes encapsulate Prisma queries and provide:
- Language-specific transformations (e.g., `transformToLanguageSpecific`)
- Bulk operations with chunking (MAX_BATCH = 400)
- Type-safe query builders
- Consistent projections and pagination

**Important:** Do NOT bypass the DAL with direct Prisma client calls in application code. DAL methods handle translation fallbacks, batching, and consistent return types.

### Ingestion Pipeline

Movie data ingestion utilities live in `src/lib/ingestion/`:

- `movieIngestion.ts` - Orchestrates TMDB/OMDb data fetching, diff detection, and database upserts
- `cache.ts` - In-memory cache singleton for movies, actors, genres (used during ingestion)
- `utils.ts` - Batching, retry logic, and helper functions
- `types.ts` - Ingestion-specific types

The pipeline fetches "Now Playing" movies from TMDB, enriches them with OMDb ratings/votes, and bulk-inserts/updates translations, cast, genres, and trailers. Existing movies are diffed before updating.

### Notification & Trigger System

Users can create **Triggers** (with multiple **TriggerConditions**) to get notified when movies matching criteria are released:

- `Follow` table - tracks followed actors/genres by user
- `Trigger` table - user-defined alert rules (e.g., "High-rated Action with Emma Stone")
- `TriggerCondition` table - individual conditions (ACTOR, GENRE, RATING, DURATION_MIN, DURATION_MAX)
- `Notification` table - sent notifications linked to triggers and movies

Enums: `FollowType` (ACTOR, GENRE), `TriggerConditionType` (ACTOR, GENRE, RATING, DURATION_MIN, DURATION_MAX), `NotifyMethod` (EMAIL; SMS/PUSH are commented for future).

### Authentication

- **Better Auth** (v1.2.4) with Prisma adapter
- Providers: Email/password + Google OAuth
- Tables: `User`, `Session`, `Account`, `Verification`
- Sessions stored in HttpOnly cookies with IP + user agent tracking
- Auth config: `src/lib/auth.ts`
- Auth routes: `/api/auth/[...all]` (Better Auth handler)

### Internationalization (i18n)

- **next-intl** with locale-prefixed routing (`/en/*`, `/he/*`)
- Default locale: `he` (Hebrew)
- Middleware: `middleware.ts` - enforces locale prefixes
- Translation files: `messages/en.json`, `messages/he.json`
- RTL support for Hebrew (`dir="rtl"` applied in layouts)

All user-facing pages are locale-aware. Server actions and DAL methods accept a `language` parameter to return localized data.

### Cron Jobs & Background Tasks

- QStash (Upstash) integration for scheduled jobs
- Vercel Cron routes in `src/app/api/cron/`
  - `now-playing-refresh/route.ts` - refreshes catalog, sends email notifications via Resend + @react-email

### API Clients

- `src/lib/api-clients.ts` - exports `tmdb` (tmdb-ts) and `omdb` clients
- IMDB/OMDb clients generated from Swagger specs in `swagger/` folder
- Use typed clients instead of raw axios/fetch

### Server Actions

Defined in `src/app/actions/`:

- `searchMovies.ts` - TMDB search + OMDb enrichment (returns `SearchedMovie[]`)
- `actors.ts` - Actor-related actions
- Mark actions with `'use server'` directive

When filtering/searching "Now Playing" movies, use `searchNowPlayingMovies` which queries the local database with Redis caching (12-hour TTL).

## Code Style & Conventions

### Formatting (from eslint.config.mjs)
- **Indentation:** 4 spaces (not tabs)
- **Quotes:** Single quotes
- **Line Width:** 120 characters
- **Prettier:** Enabled with warn-level enforcement
- **ESLint:** Extends Next.js, React Hooks, TypeScript ESLint, Promise, Prettier
- **Ignored directories:** `src/components/ui/**`, `src/components/animate-ui/**`, `.copilot/**`

### TypeScript
- **Strict mode:** Enabled
- **Path aliases:**
  - `@/*` → `src/*`
  - `@/dal` → `./dal/index.ts`
- **Enums:** Defined in Prisma schema (Language, FollowType, TriggerConditionType, NotifyMethod, MovieStatus)
- **Type generation:** Prisma generates types; always run `pnpm prisma:generate` after schema changes

### Components
- **Naming:** PascalCase for components, kebab-case for files
- **UI Components:** shadcn/ui components in `src/components/ui/` - do NOT modify without good reason
- **Animations:** Use Motion/Framer Motion with staggered children (0.08-0.1s delays), cubic bezier easing `[0.4, 0, 0.2, 1]`
- **Server Components by default:** Mark client components with `'use client'` directive only when needed

### Database
- **Prisma schema:** `prisma/schema.prisma`
- **Migrations:** Always create migrations with `pnpm prisma:dev`
- **Seeding:** Seed scripts in `prisma/seed.ts` and `prisma/seed-genres-only.ts`
- **Binary targets:** `["native", "windows", "debian-openssl-1.1.x"]` for cross-platform support

## Important Patterns

### Fetching Localized Data
```typescript
import { MoviesDAL } from '@/dal';
import { prisma } from '@/lib/prisma';
import { Language } from '@prisma/client';

const moviesDAL = new MoviesDAL(prisma);
const movies = await moviesDAL.getMoviesWithLanguageTranslation(Language.he_IL, {
    where: { status: 'NOW_PLAYING' },
    orderBy: [{ rating: 'desc' }],
    take: 20,
});
```

### Translation Fallbacks
DAL methods automatically fallback to any available translation if the requested language is missing. Genre/Actor translations follow the same pattern: prefer requested language → fallback to English → fallback to any available.

### Bulk Operations
Use DAL bulk methods (e.g., `createManyBase`, `bulkInsertTrailers`) which automatically chunk large datasets into batches of MAX_BATCH (400) to avoid query size limits.

### Redis Caching
Search results in `searchNowPlayingMovies` are cached in Upstash Redis with a stable MD5-hashed key based on filters + language. TTL: 12 hours. Check for cache hits before expensive DB queries.

### Movie Status Transitions
The `MovieStatus` enum tracks lifecycle: `NOW_PLAYING` → `LEFT_CINEMAS`. Upcoming releases use `UPCOMING`. The ingestion pipeline updates statuses based on TMDB data and can bulk-update statuses via `bulkUpdateFallbackStatuses`.

## Environment Variables

No `.env.example` file found, but required variables (inferred from code):

- `DATABASE_URL` - PostgreSQL connection string
- `TMDB_API_KEY` - TMDB API key
- `OMDB_API_KEY` - OMDb API key
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `BETTER_AUTH_SECRET` - Better Auth session secret
- Email provider keys (Resend or SendGrid)
- SMS provider keys (Messaggio or BulkGate) - future
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` - Redis caching
- `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` - QStash verification
- Vercel deployment tokens (optional)

Store credentials in `.env` (gitignored) and document new variables in the shared password manager.

## Known Gotchas

1. **Prisma Client Generation:** Always run `pnpm prisma:generate` after schema changes. The build script includes this, but manual dev changes require it.
2. **Translation Table Constraints:** Attempting to insert duplicate `[entityId, language]` pairs will fail with a unique constraint violation. Use `upsert` methods.
3. **Chunking Large Inserts:** Bulk inserts exceeding PostgreSQL limits will fail. DAL methods handle chunking automatically—use them.
4. **Locale Routing:** All pages must be under `/[locale]/` directories. Direct root paths won't match the middleware matcher.
5. **Server Actions vs API Routes:** Prefer Server Actions for mutations. API routes are used for webhooks, OAuth callbacks, and cron jobs.
6. **React 19 RC:** The project uses React 19 (release candidate). Some third-party libraries may have compatibility warnings.
7. **Redis Cache Invalidation:** Search cache has no manual invalidation. Stale data may persist for 12 hours. Consider adding cache busting on admin actions.

## Project Status & Roadmap

See `spec/current-spec.md` for detailed status and TODO list. High-level priorities:

- **High Priority:** User subscription management UI, notification preferences, cron job for rating checks, email notifications
- **Medium Priority:** Movie recommendations, advanced search filters (year range, duration), "Coming Soon" section, pagination
- **Low Priority:** SMS/Push notifications, movie playlists, admin dashboard, A/B testing, analytics
- **Technical Debt:** E2E tests (Playwright), unit tests, API rate limiting, image optimization (Next.js Image), PWA features, Sentry monitoring

## Specs & Documentation

Product specs are in `spec/`:
- `current-spec.md` - Detailed project status, implemented features, database schema
- `main-spec.md` - Original requirements
- `ingestion-plan.md` - Ingestion pipeline design
- `now-playing-mission.md` - "Now Playing" feature spec

Refer to specs when implementing new features to align with product vision.
