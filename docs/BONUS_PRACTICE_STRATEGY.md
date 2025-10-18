# Bonus Practice Strategy

## Goals

- Give admins a reliable workflow to curate bonus/extra question sets and target the right learners.
- Surface bonus content to learners with clear notifications and frictionless access through the existing quiz UI.
- Capture attempt history so we can measure engagement, let learners review past work, and avoid manual tracking.

## Current Gaps

- **Learner visibility**: the dashboard fetches all sets without respecting `is_active`, schedule windows, or visibility rules; there is no “new bonus” indicator.
- **Attempt tracking**: extra attempts are cached only in `sessionStorage`; closing the tab loses both progress and results, and we cannot report usage.
- **Result review**: the result page depends on the cached payload and cannot reconstruct a session once the cache is cleared.
- **Admin feedback**: admins cannot see learner engagement or confirm that sets have been attempted.

## Data Model Enhancements

- Add `extra_question_attempts` table to Supabase with:
  - `id`, `user_id`, `set_id`, `status` (`in_progress`, `completed`, `abandoned`), `attempt_number`.
  - `started_at`, `completed_at`, `duration_seconds`, `total_questions`, `correct_answers`, `score_percent`.
  - `response_snapshot` (JSON) storing the final answers for review.
- Extend `extra_question_sets` with:
  - `max_attempts_per_user` to cap retries per learner (nullable for unlimited).
  - `assignment_rules` JSON storing default distribution (`full_set`, `fixed_count`, `percentage`) plus optional plan overrides.
- Upgrade `extra_question_visibility_allows_user` to honour specific plan IDs in addition to plan tiers.
- Create `start_extra_question_attempt(p_set_id uuid)` SQL function:
  - Validates learner access via `extra_question_visibility_allows_user`.
  - Marks existing unfinished attempts as `abandoned`.
  - Creates a fresh attempt row and returns it to the client.
- Permit direct updates to attempts (with RLS enforcing `user_id = auth.uid()`).
- Optional: future RPC to summarise engagement per set for the admin dashboard.

## Learner Experience

- Fetch bonus sets filtered by access (RLS), schedule, and active status.
- Hydrate each set with the learner’s latest attempt to derive status (`new`, `in_progress`, `completed`) and last score.
- Show a badge on the bottom “Bonus” nav button when unattempted sets exist; badge count reflects the number of active sets without a completed attempt.
- Update card UI:
  - Status chips (“New”, “In progress”, “Completed”), schedule and timer summaries.
  - Primary CTA adapts: “Start practice”, “Resume practice”, or “Retake practice”.
  - Secondary CTA “View results” appears when at least one attempt is completed.
  - Distribution and attempt-limit badges explain how many questions and retries learners get.
- Apply assignment rules client-side so learners attempting a set limited to 10 questions (or 40%, 25%, etc.) only receive the configured slice.
- Enforce attempt ceilings by surfacing Supabase errors and redirecting back to the dashboard when the maximum is reached.
- Keep the dashboard “Start Daily Questions” button screaming red until the day’s quiz is completed, then cool it back to blue.
- When the learner launches a set, call `start_extra_question_attempt` and record the returned attempt id; reuse the `exam-face` experience for questions.
- On submission, persist attempt stats + snapshot, then redirect to `result-face`.
- Result page falls back to Supabase data if the cache is missing, so learners can revisit later.

## Admin Experience

- Reuse the existing extra question management screen:
  - Ensure the form writes schedule, timer, and visibility data aligned with the new learner logic.
  - Add controls for department filters, plan tiers, specific plan selection, assignment strategy (full set / fixed count / percentage), and attempt caps.
  - After launch, admins can rely on attempt metrics (future enhancement) without additional steps.
- Future iterative work: add engagement counters (attempted/Completed) and export to CSV.

## Rollout Plan

1. Ship migration + SQL helpers (`extra_question_attempts`, RPC, policies).
2. Update learner dashboard, exam, and result scripts.
3. Backfill attempt summaries if required (not needed initially because feature is new).
4. Document QA checklist (schedule gating, badge counts, distribution + attempt limits, results reopening).
5. Follow up with analytics/reporting for admins.

## QA Checklist

- New set (active + targeted) appears under Bonus, badge increments.
- Set hidden by schedule or visibility no longer appears.
- Completing an attempt updates badge counts, shows “Completed” chip, and the result page renders even after reload.
- Multiple attempts increment attempt number and keep the latest summary.
- Attempting beyond the configured limit blocks launch and returns to the dashboard with an error toast.
- Distribution rules respect fixed-count and percentage settings for each set.
