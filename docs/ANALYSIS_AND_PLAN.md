# Project Analysis & Consolidation Plan

## Current State Snapshot

- **Front-end prototypes** live in `Main admin` and `quiz_builder`. They are static HTML + Tailwind CDN mock-ups with large inline scripts.
- **Admin panel logic** (`Main admin/admin_panel_logic.js`) is a monolithic script backed by hard-coded mock data. CRUD flows, modals, and navigation are front-end only, with no persistence.
- **Learner / quiz experience** (`quiz_builder/*.html`) is a collection of pages styled independently. There is no shared asset pipeline or module system, and logic is embedded (or missing) per page.
- **Supabase backend** scaffolding exists (`supabase/`), but migrations are empty and the JS client is a stub. There is no defined database schema, seed data, or API integration.
- **Configuration / automation** such as linting, tests, or build tooling are absent.

## Key Gaps

1. **No real data layer** – the admin application cannot read/write departments, courses, topics, questions, or schedules from Supabase.
2. **Scattered UI assets** – duplicate Tailwind configuration and inconsistent styling between admin and learner-facing surfaces.
3. **Missing domain schema** – database tables for quiz authoring, exam delivery, subscriptions, and analytics are undefined.
4. **Lack of modular front-end structure** – single large scripts prevent composability, testing, or feature growth.
5. **No seed/migration history** – environments cannot be reproduced, blocking collaboration and deployment.

## Consolidation & Refactor Goals

- **Organise apps** under `apps/` with clear separation (`admin`, `learner`) and shared utilities (`apps/shared`).
- **Introduce a data service layer** that speaks to Supabase (and falls back to local mocks for development without credentials).
- **Modularise admin UI** into view modules (dashboard, departments, courses, topics, schedules, subscriptions) with lean controllers.
- **Define robust SQL schema** covering users, content hierarchy, question bank, quiz/exam flows, scheduling, and subscriptions.
- **Provide seeds & typed enums** to support immediate local testing.
- **Document architecture** so future contributors understand responsibilities and extension points.

## Implementation Outline

1. **Restructure repository**
   - Move `Main admin` → `apps/admin` and `quiz_builder` → `apps/learner`.
   - Add `apps/shared` for colours, layout primitives, and utilities.
2. **Admin application refactor**
   - Break the monolithic script into ES modules under `apps/admin/src/` (state manager, router, views, components, services).
   - Replace `MOCK_DATA` with a `DataService` that queries Supabase tables (`departments`, `courses`, etc.) and falls back to seeded sample data when offline.
   - Implement create/update flows for departments, courses, topics, and study cycles wiring to the service layer.
   - Add lightweight form validation and user feedback.
3. **Learner application cleanup**
   - Provide a single `index.html` entry with shared styles and modular scripts for the quiz experience.
   - Extract shared JS (timers, palette, pagination) into modules under `apps/learner/src/`.
   - Align typography/spacing with shared tokens.
4. **Supabase schema & migrations**
   - Create migration introducing core tables, enums, relationships, policies, and helpful views.
   - Supply seed data for departments, courses, topics, sample questions, subscription plans, and study cycles.
5. **Developer ergonomics**
   - Add README outlining architecture, setup, scripts, and Supabase workflow.
   - Provide scripts (via `package.json`) for linting/build (future-ready even if currently placeholder).

## Deliverables for This Iteration

- Refactored admin codebase under `apps/admin` with modular JS and functional CRUD flows hitting the service layer.
- Learner-facing quiz surface relocated to `apps/learner` with shared styling tokens.
- `supabase/migrations/<timestamp>__core_schema.sql` defining schema + policies, and `supabase/seed.sql` with starter data.
- Updated Supabase client (`apps/shared/supabaseClient.js`) with environment-based configuration.
- Documentation (`docs/ANALYSIS_AND_PLAN.md`, README updates) summarising architecture, setup, and future work.

## Out of Scope (Future Considerations)

- Implementing authentication UI (Supabase Auth hooks prepared but not wired).
- Building CI/CD pipelines.
- Comprehensive automated test suite (architecture prepared for future addition).

## Scheduling Engine Deployment & Usage

- **Apply the latest migration**: run `supabase/migrations/20251001120000_department_slots.sql` so the new tables (`study_cycle_daily_buckets`, `study_cycle_schedule_runs`) and enums are present.
- **Recreate the RPC when it changes**: each time `refresh_cycle_daily_schedule` is updated in the repo, copy the `create or replace function` block into Supabase SQL Editor (or rerun the migration) to keep the hosted function in sync.
- **Rebuild from the admin UI**: the Study Cycles view now exposes a `Rebuild Schedule` button per slot. It invokes the RPC, recalculates day-by-day readiness, and refreshes the timeline cards; a toast confirms success or surfaces any errors from Supabase.
- **Empty pools still rebuild**: slots with zero questions will rebuild and show the status banner/metrics highlighting underfilled or missing days; daily quiz generation continues to block until pools meet the per-day quotas.
- **Troubleshooting**: if the button reports missing RPC/tables, ensure migrations ran under the target Supabase project. Ambiguous-column or enum errors usually mean the latest function definition hasn’t been applied.

## Scheduling Engine Testing & Observability Roadmap

- **SQL assertions**: add Supabase CLI test harness (or `npm run supabase:test`) that seeds a cycle, runs `refresh_cycle_daily_schedule`, and asserts against `study_cycle_daily_buckets` for counts, status transitions, and enum casts.
- **DataService unit coverage**: use Vitest with a mocked Supabase client to verify `refreshStudyCycleSchedule`, timeline enrichment, and error messaging (focus on `apps/admin/src/services/dataService.js`).
- **UI smoke tests**: add Playwright/Cypress scripts that stub RPC responses, click “Rebuild Schedule”, and confirm toast + timeline updates.
- **Observability hooks**: extend `apps/shared/supabaseClient.js` to emit console timing/error metrics so rebuild latency and failures surface during manual QA (later wire into real telemetry).
- **Alerting hooks**: expose a lightweight admin view summarising `study_cycle_schedule_runs` (status, missing counts) so operators can spot chronic gaps without digging into SQL.
