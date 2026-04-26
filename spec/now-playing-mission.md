## Mission: Upcoming Catalog Refresh

### Objective
Introduce an "upcoming movies" catalog refresh that mirrors the existing now-playing flow in `prisma/seed.ts`, without duplicating the heavy processing pipeline (genre cache, movie processing, trailers, translations, actors, email). The TMDB client already exposes both `nowPlaying` and `upcoming` endpoints, so we need to extract the shared logic and reuse it for both feeds.

### Proposed Approach
1. **Refactor shared refresh pipeline**  
   - Create a helper that accepts the TMDB fetcher (now playing vs upcoming), the target `MovieStatus`, and logging metadata, then runs the existing steps (genre cache → fetch feed → process movies → actors → email).  
   - Keep Sentry spans, delays (`SEED_CONFIG.DB_OPERATION_DELAY`), and transaction-wrapping behavior intact.
2. **Implement upcoming refresh**  
   - Add `refreshUpcomingCatalog` alongside `refreshNowPlayingCatalog`, delegating to the new helper with `MovieStatus.UPCOMING` (or appropriate enum) and `tmdb.movies.upcoming`.  
   - Ensure we pass the correct TMDB query params (`language`, `region`) and maintain parity in logging and email reporting.
3. **Update CLI/script entry points as needed**  
   - Decide whether to expose both refreshers via CLI flags or leave now-playing as the default script export while making upcoming callable programmatically (coordinate with user once scope is confirmed).

### Open Questions / Assumptions
- `MovieStatus` already has an `UPCOMING` status; if not, we must add it before wiring the new flow.
- Email template (`sendCatalogRefreshEmail`) can stay unchanged if we continue sending after each run.
- No additional database schema changes are expected; this is pure application logic.

### Definition of Done
- `refreshNowPlayingCatalog` still works and uses the new shared helper.
- New `refreshUpcomingCatalog` mirrors the behavior but pulls from TMDB upcoming feed and stores movies with the correct status.
- Duplicated logic between the two flows is removed.
- Type safety, linting, and existing logging/Sentry instrumentation remain intact.
