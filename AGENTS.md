# Repository Guidelines

## Project Structure & Module Organization
Core application code lives under `src`, with route handlers and pages in `src/app`, reusable UI grouped by domain in `src/components`, data helpers in `src/lib`, and shared types/constants in `src/types` and `src/constants`. Server-side data access logic resides in `dal`. Database schema, migrations, and seed scripts are centralized in `prisma`, while API specifications powering client generation sit in `swagger`. Static assets live in `public`, and localized message bundles are under `messages`.

## Build, Test, and Development Commands
- `pnpm dev` – Launch the Next.js dev server with Turbopack.
- `pnpm build` – Run `prisma generate` then compile the production bundle.
- `pnpm start` – Serve the previously built app.
- `pnpm lint` / `pnpm eslint` – Execute the Next.js lint preset or raw ESLint across `src`.
- `pnpm prisma:dev | prisma:deploy | prisma:seed` – Manage migrations and seed data; pair with `.env` DB settings.
- `pnpm generate:imdbapi-client` / `pnpm generate:omdbapi-client` – Regenerate typed API clients after updating Swagger specs.

## Coding Style & Naming Conventions
Prettier (see `.prettierrc`) enforces 4-space indentation, 120-character width, semicolons, and single quotes (including JSX). Run `pnpm eslint:fix` to auto-correct lint issues. Component files generally export PascalCase components, while directories and multi-part utilities use kebab-case (for example, `movie-card-collapsed.tsx`). Favor TypeScript types from `src/types` or Prisma-generated types to keep domain models consistent.

## Testing Guidelines
Automated tests are not yet wired in; new features should ship with unit or integration coverage using the agreed tooling for the feature (React Testing Library or Playwright are preferred). Place test files alongside the module (`*.test.ts(x)`) or group end-to-end suites under a dedicated `tests` directory, and update `package.json` scripts when adding a new runner. Use the acceptance notes in `spec/features` to drive scenarios and record manual verification steps in PR descriptions until automation lands.

## Commit & Pull Request Guidelines
Follow the conventional commit pattern observed in history (`feat:`, `fix:`, `refactor:` + concise description). Reference issue IDs when applicable, describe the change, testing evidence, and any schema or environment updates in the PR body, and attach relevant screenshots for UI-facing work. Before opening a PR, run `pnpm lint`, applicable Prisma commands, and any new test scripts locally.

## Database & Secrets
Update `prisma/schema.prisma` for schema changes and include matching migration files in `prisma/migrations`. Seed data helpers sit in `prisma/seed.ts`; keep them idempotent so `pnpm prisma:reset` remains safe. Never commit real credentials—use `.env` (gitignored) and document new keys in the team password manager plus the PR notes.

These examples should be used as guidance when configuring Sentry functionality within a project.

# Exception Catching

Use `Sentry.captureException(error)` to capture an exception and log the error in Sentry.
Use this in try catch blocks or areas where exceptions are expected

# Tracing Examples

Spans should be created for meaningful actions within an applications like button clicks, API calls, and function calls
Use the `Sentry.startSpan` function to create a span
Child spans can exist within a parent span

## Custom Span instrumentation in component actions

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
function TestComponent() {
  const handleTestButtonClick = () => {
    // Create a transaction/span to measure performance
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Test Button Click",
      },
      (span) => {
        const value = "some config";
        const metric = "some metric";

        // Metrics can be added to the span
        span.setAttribute("config", value);
        span.setAttribute("metric", metric);

        doSomething();
      },
    );
  };

  return (
    <button type="button" onClick={handleTestButtonClick}>
      Test Sentry
    </button>
  );
}
```

## Custom span instrumentation in API calls

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `GET /api/users/${userId}`,
    },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      return data;
    },
  );
}
```

# Logs

Where logs are used, ensure Sentry is imported using `import * as Sentry from "@sentry/nextjs"`
Enable logging in Sentry using `Sentry.init({ _experiments: { enableLogs: true } })`
Reference the logger using `const { logger } = Sentry`
Sentry offers a consoleLoggingIntegration that can be used to log specific console error types automatically without instrumenting the individual logger calls

## Configuration

In NextJS the client side Sentry initialization is in `instrumentation-client.ts`, the server initialization is in `sentry.server.config.ts` and the edge initialization is in `sentry.edge.config.ts`
Initialization does not need to be repeated in other files, it only needs to happen the files mentioned above. You should use `import * as Sentry from "@sentry/nextjs"` to reference Sentry functionality

### Baseline

```javascript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://dc97a9f321022f9aca9f036ebe765b1d@o4510223749349376.ingest.de.sentry.io/4510240079085649",

  _experiments: {
    enableLogs: true,
  },
});
```

### Logger Integration

```javascript
Sentry.init({
  dsn: "https://dc97a9f321022f9aca9f036ebe765b1d@o4510223749349376.ingest.de.sentry.io/4510240079085649",
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
```

## Logger Examples

`logger.fmt` is a template literal function that should be used to bring variables into the structured logs.

```javascript
logger.trace("Starting database connection", { database: "users" });
logger.debug(logger.fmt`Cache miss for user: ${userId}`);
logger.info("Updated profile", { profileId: 345 });
logger.warn("Rate limit reached for endpoint", {
  endpoint: "/api/results/",
  isEnterprise: false,
});
logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
});
logger.fatal("Database connection pool exhausted", {
  database: "users",
  activeConnections: 100,
});
```