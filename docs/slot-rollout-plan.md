# Slot & Subslot Architecture Rollout Plan

## Objectives

- Align the question scheduling system with the 30-day slot / 4×7-day subslot model.
- Guarantee fair daily distribution (250-question pools) across subscription tiers.
- Provide admin tooling for slot creation, subslot management, reuse, and activation with guardrails.
- Improve robustness via validations, logging, and deterministic scheduling.

## Workstreams

1. **Data & Service Guardrails (In Progress)**
   - Enforce slot question cap (7000) and four subslots capped at 1750 questions each.
   - Auto-generate four 7-day subslots when a slot is created; map dates to the slot window.
   - Prevent subslot activation until it reaches 1750 questions and mark unlock schedule.
   - Add reuse metadata (source slot/subslot references, department cloning support).
   - Harden Supabase interactions with validation, error handling, and retries where needed.

2. **Admin UI Workflow Enhancements**
   - Slot creation wizard with schedule preview and reuse options.
   - Revamped subslot manager (hierarchical topic selector, live counters, readiness status).
   - Activation controls respecting fullness rules and unlock dates.
   - Calendar/timeline overview showing slot and subslot readiness.

3. **Distribution & Scheduling Engine**
   - Deterministic slicing of 1750-question pools into 7 × 250 daily sets.
   - Tier-aware distribution (100/200/250) with consistent ordering across students.
   - Monitoring/alerts for upcoming subslots that are not filled/activated.
   - Surface admin insights for per-day readiness and day-offset coverage.

4. **Testing & Observability**
   - Unit/integration tests for creation, reuse, activation, and distribution logic.
   - Audit logging of slot/subslot lifecycle events.
   - Error reporting and retry strategies for Supabase RPCs.

5. **Learner Experience Adjustments**
   - Ensure learner clients consume the deterministic day pools.
   - Surface schedule/status messaging tying into the new slot/subslot model.

## Current Focus

- Implementing Workstream 1 (Data & Service Guardrails): schema constraints, service validations, and default schedule generation.

### Workstream 1 Checklist

- [x] Enforce 7,000-question slot cap and 1,750-question subslot cap via service validators.
- [x] Auto-generate four 7-day subslots during slot creation and rescheduling.
- [x] Block subslot activation (and status toggles) until the 1,750-question threshold is met.
- [x] Guard question loading/cloning routines so they respect per-subslot capacity.
- [x] Persist reuse metadata for cross-department slot cloning (planned alongside reuse workflow work).
