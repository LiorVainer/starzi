# Starzi Ingestion Refactor Plan

## Goals
- Reduce Neon compute by batching Prisma operations (createMany/updateMany) with a maximum batch size of 400.
- Introduce a module-level singleton cache for lookups and deduplication within each ingestion run.
- Avoid `executeRaw` SQL; use Prisma APIs exclusively.
- Unify movie, translation, genre, trailer, actor, cast, and fallback status updates under a single batched pipeline.
- Improve observability with Sentry spans, metrics, and batch counters.
- Document architecture changes in both `spec/ingestion-plan.md` and `REFACTORING_SUMMARY.md`.

## Current Issues
1. **Per-entity loops** in `prisma/seeders/*.ts` call Prisma `.upsert`/`.create` repeatedly, causing hundreds of round-trips per movie.
2. **Missing batching utilities**—each DAL exposes only single-row mutations, forcing higher layers to loop.
3. **Fallback status** (`markMissingMoviesAsFallback`) runs outside the main pipeline, requiring additional queries.
4. **No shared cache**—actors/genres are looked up multiple times even within the same run.
5. **Limited monitoring**—spans exist but lack batch-specific counters and timings.

## Target Architecture
1. **Ingestion Orchestrator** (`src/lib/ingestion/movieIngestion.ts`)
   - Fetch TMDB feed & details, populate singleton cache.
   - Aggregate payloads for movies, translations, genres, trailers, actors, cast, fallback updates.
   - Run batched Prisma operations via DAL helpers (≤400 per chunk) inside bounded transactions (<30s).

2. **Singleton Cache Module**
   - Lives in `src/lib/ingestion/cache.t
   - Holds maps for movies, genres, actors by TMDB/IMDB IDs.
   - Provides `getOrLoad` helpers and `flush` hooks for each batch stage.

3. **Helper Utilities** (`src/lib/ingestion/utils.ts`)
   - `chunkArray<T>(items, size = 400)`
   - `buildIdMap<T>(items, keySelector)`
   - `diffExisting({ existing, incoming, key })`
   - `batchInsert(prismaModel, data, chunkSize)`
   - `batchUpsert(prismaModel, data, chunkSize, conflictKeys)`
   - `retry<T>(fn, maxAttempts)` (for TMDB fetch/backoff)

4. **DAL Extensions**
   - `dal/movies.dal.ts`: `findManyByTmdbIds`, `createManyBase`, `createManyTranslations`, `bulkUpsertTrailers`, `bulkConnectGenres`, `bulkUpdateFallbackStatuses`.
   - `dal/genres.dal.ts`: `createManyBase`, `createManyTranslations`.
   - `dal/actors.dal.ts`: `upsertManyBase`, `createManyTranslations`, `bulkConnectCast`.
   - All methods chunk inputs ≤400 and wrap related writes in transactions where needed.

5. **Batched Pipeline Steps**
   1. **Fetch & Cache**: gather TMDB IDs, translations, credits; dedupe.
   2. **Read Existing**: single `findMany` per entity type (movies, genres, actors, cast).
   3. **Diff**: compute `toInsert`, `toUpdate`, `toSkip` for each table.
   4. **Write**: execute `createMany`/`updateMany` batches; fallback updates happen in same transaction block.
   5. **Linking**: connect genres/cast via `createMany` join records.
   6. **Monitoring**: emit Sentry spans per stage with counters (`movies_inserted`, `actors_skipped`, etc.).

## seed.ts Changes
- Replace per-movie processors with orchestrator calls.
- Configure batch size via `SEED_CONFIG.BATCH_SIZE` (default 400).
- Wrap orchestrator run in `withSentryTransaction`.
- Ensure fallback status updates execute in orchestrator transaction.
- Maintain post-run email reports.

## Documentation & Monitoring
- Update `REFACTORING_SUMMARY.md` with a concise summary of the new pipeline and DB-call reductions.
- Add runtime notes (memory expectations, batch timing, retry logic) in orchestrator JSDoc comments.
- Add Sentry metrics: batch counts, runtime per stage, fallback update stats.
- Provide guidance on verifying transaction duration stays <30s.

## Implementation Phases
1. **Utility Foundation**
   - Create `src/lib/ingestion/utils.ts` implementing chunking, diffing, and batched Prisma helpers (max batch 400, Prisma-only).
   - Add retry/backoff helpers for TMDB/OMDB calls used across processors.
2. **Singleton Cache Module**
   - Introduce `src/lib/ingestion/cache.ts` exporting a module-level singleton storing lookups for movies/genres/actors and exposing `getSnapshot()`, `prime()`, `clear()`.
   - Ensure cache integrates with utils for dedupe/diff workflows.
3. **DAL Extensions**
   - Update `dal/movies.dal.ts`, `dal/genres.dal.ts`, `dal/actors.dal.ts` to expose batched read/write APIs (createMany/updateMany/connectMany) that call the utility helpers.
   - Guarantee fallback status updates are handled via a new batched method participating in the same transaction block as other writes.
4. **Ingestion Orchestrator**
   - Build `src/lib/ingestion/movieIngestion.ts` coordinating fetch → cache → diff → write for movies, translations, genres, trailers, actors, cast, and fallback updates.
   - Wrap each major stage in `withSentrySpan`; run the full pipeline inside `withSentryTransaction`.
5. **Seed Entrypoint Updates**
   - Replace legacy processor calls in `prisma/seed.ts` (and related seed scripts) with the orchestrator.
   - Configure batch size via `SEED_CONFIG.BATCH_SIZE` (default 400) and ensure clean Prisma disconnect.
6. **Monitoring & Documentation**
   - Add counters/timing logs (movies_inserted, actors_skipped, fallback_updated) to Sentry spans.
   - Extend `REFACTORING_SUMMARY.md` after implementation with before/after DB-call counts and runtime notes.
7. **Cleanup**
   - Remove obsolete files (`prisma/seeders/*.ts`) once parity is verified.
   - Ensure Jest/unit coverage (if present) targets new utilities/DAL methods.
