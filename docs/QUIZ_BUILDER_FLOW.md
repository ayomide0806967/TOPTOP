# Quiz Builder – App and Subscription Flow

This document explains how the Quiz Builder app works end‑to‑end, how subscriptions (seats) are handled, and how to enable/disable auth and deploy.

## Current Status (this branch)

- "Explore Quiz Builder" CTA is disabled on the learner homepage.
- Quiz Builder auth is temporarily disabled in UI. Buttons show a disabled state and scripts short‑circuit with a message.
- A consolidated copy of Quiz Builder lives at `apps/quizbuilder/` and a deployable bundle at `dist/quizbuilder/`.

To re‑enable, see "Enable Auth + CTA" below.

---

## App Structure

- `apps/quizbuilder/quiz-builder-start.html` – pre‑landing stepper (Overview → Choose Plan → Sign in)
- `apps/quizbuilder/login.html` – Quiz Builder login UI (email and Google; disabled by default)
- `apps/quizbuilder/instructor.html` – Instructor dashboard shell
- `apps/quizbuilder/src/` – page scripts
  - `quizBuilderStart.js` – stepper logic, plan intent, checkout kick‑off
  - `instructorDashboard.js` – instructor dashboard logic and data fetching
- `apps/quizbuilder/shared/` – auth, router, gating, supabase client
- `apps/quizbuilder/assets/` – favicon, CSS, logo

Deployable copy (same structure): `dist/quizbuilder/`

---

## High‑Level Flow (when auth is enabled)

1. Pre‑landing (Quiz Builder Start)
   - Shows features and a 3‑step wizard.
   - Step 2 lets the user pick:
     - Free (uses a small free seat quota)
     - Paid (enter seat count → checkout)

2. Auth (Email or Google)
   - Email/password uses the app’s `/api/auth/login` backend (not enabled in this branch).
   - Google uses Supabase OAuth. After redirect, the front‑end exchanges the Supabase session for the app token via the Edge Function `app-token`.

3. Subscription (Seat‑based)
   - Free: Ensure a `quiz_seat_subscriptions` record exists for the tenant (`ensure_quiz_seat_subscription`).
   - Paid: The front‑end calls the Edge Function `quiz-seat-upgrade` with `additionalSeats`, which opens a Paystack checkout. On webhook success, seats are credited (`apply_quiz_seat_credit`).

4. Instructor Dashboard
   - Displays seat usage (`quiz_subscription_summary` view), blueprints, classrooms, exams, and quick actions.

---

## Subscription/Seat Billing Internals

Database migration (required): `supabase/migrations/20251220100000_quiz_seat_billing.sql`

Creates/uses:

- `public.quiz_seat_subscriptions` – tenant seat quota (free + paid), price, currency, renewal
- `public.quiz_seat_transactions` – seat top‑ups; Paystack references
- `public.quiz_subscription_summary` – view of seat usage vs quota
- Functions:
  - `ensure_quiz_seat_subscription(p_tenant_id uuid)` – creates default subscription if missing
  - `apply_quiz_seat_credit(p_subscription_id uuid, p_additional int)` – credits paid seats

Edge Functions:

- `supabase/functions/quiz-seat-upgrade` – creates Paystack checkout and records transactions
- `supabase/functions/paystack-webhook` – verifies Paystack events and credits seats
- `supabase/functions/instructor` – instructor metrics/quizzes/classrooms API
- `supabase/functions/app-token` – exchanges Supabase OAuth session for the app token (for Quiz Builder only)

Token format (unchanged): base64 JSON payload `{ userId, tenantId, role, exp }`. The Edge Functions expect `Authorization: Bearer <token>`.

---

## Auth Enable/Disable

This branch ships with auth disabled on Quiz Builder pages.

Disable flags and states:

- Pre‑landing logic: `apps/admin/src/quizBuilderStart.js` (flag constants and guards)
- Login UI disabled: `apps/admin/login.html`
- Packaged bundle mirrors the same disables under `dist/quizbuilder/`

Enable auth again:

1) Re‑enable buttons and guards
   - In `apps/admin/src/quizBuilderStart.js`, remove the `AUTH_DISABLED` flag and guards.
   - In `apps/admin/login.html`, restore the form/button interactivity.
   - Repeat in `apps/quizbuilder/` (if you deploy from that folder) or regenerate the `dist/quizbuilder` bundle.

2) Google OAuth
   - Supabase Dashboard → Auth → Providers → Google: enable and add Client ID/Secret.
   - Supabase Dashboard → Auth → URL Config:
     - Site URL: `https://builder.academicnightingale.com`
     - Additional Redirect URLs: Quiz Builder pages.
   - Google Cloud Console (OAuth client):
     - Authorized JS origins: your builder domain
     - Authorized redirect URIs: `https://<PROJECT-REF>.supabase.co/auth/v1/callback`

3) App Token Exchange
   - Deploy `supabase/functions/app-token` and set secrets:
     - `APP_SUPABASE_URL`, `APP_SUPABASE_ANON_KEY`, `APP_SUPABASE_SERVICE_ROLE_KEY`

4) Seat Billing
   - Ensure the seat‑billing migration is applied.
   - Deploy `quiz-seat-upgrade` and `paystack-webhook` if not already deployed.

5) Re‑enable the CBT CTA (optional)
   - In `apps/learner/index.html`, set the Quiz Builder CTA to point to your deployed Quiz Builder pre‑landing instead of the disabled button.

---

## Deploy

Two options depending on hosting preference:

1) Deploy the packaged bundle
   - Deploy `dist/quizbuilder/` to your host (Cloudflare Pages/Netlify/Vercel).
   - Point `builder.academicnightingale.com` to that host.

2) Deploy from consolidated source
   - Use `apps/quizbuilder/` as your site root in the host.
   - Ensure Supabase config script (`window.__SUPABASE_CONFIG__`) is present on each HTML page.

Domain & OAuth (recommended):

- CBT: `https://www.academicnightingale.com` (GitHub Pages)
- Builder: `https://builder.academicnightingale.com` (Pages/Netlify/Vercel)

---

## Endpoints Used by the Front‑end

- `GET /api/instructor/dashboard/metrics` – instructor metrics and seat usage
- `GET /api/instructor/quizzes` – list quizzes
- `GET /api/instructor/classrooms` – list classrooms
- `POST supabase.functions.invoke('quiz-seat-upgrade')` – start seat checkout
- `POST supabase.functions.invoke('app-token')` – exchange Supabase session for app token (after Google OAuth)

All authenticated calls include `Authorization: Bearer <app-token>` (once auth is enabled).

---

## Notes

- Multi‑tenant isolation is enforced in the Edge Functions and SQL RLS policies.
- When auth is disabled, instructor routes will remain inaccessible. That is intentional on this branch.

