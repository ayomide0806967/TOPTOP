# Testing & Observability Quickstart

## Prerequisites

- Node.js 18+
- Run `npm install` to pull dev dependencies.

## Running Unit Tests

```sh
npm test
```

This executes Vitest against files under `apps/**/__tests__/*.test.js`. The initial suite validates the scheduling timeline utilities.

## Watching Tests During Development

```sh
npm run test:watch
```

Vitest will re-run affected tests whenever the related files change.

## Instrumentation

- `apps/shared/instrumentation.js` exposes `startTiming`, `endTiming`, and `recordError` helpers.
- Scheduling RPC calls call these helpers, so browser consoles show `refresh_cycle_daily_schedule` timings and error payloads during manual QA.

## Next Targets

1. Add SQL assertions that exercise `refresh_cycle_daily_schedule` using the Supabase CLI.
2. Expand Vitest coverage to `refreshStudyCycleSchedule` (mocking the Supabase client) and learner dashboard consumers once implemented.
3. Capture rebuild run history in a lightweight admin view using the `study_cycle_schedule_runs` table.
