Reconcile Payments — Scheduling

Purpose
- Automatically activates paid subscriptions without depending on the client returning.
- Verifies any `profiles` with `pending_checkout_reference` + `pending_plan_id` directly with Paystack and activates when successful.

Function
- Edge Function: `reconcile-payments` (GET/POST)
- Targeted mode: POST body `{ "userId": "<uuid>" }` to reconcile a single user quickly.

Production Setup (Supabase Scheduled Functions)
1) Ensure secrets are configured for Edge Functions:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `PAYSTACK_SECRET_KEY` (or `PAYSTACK_LIVE_SECRET_KEY`)

2) Deploy the function:
   - From the `supabase` directory:
     - `supabase functions deploy reconcile-payments --no-verify-jwt`

3) Create a schedule (every 5 minutes example):
   - `supabase functions schedule create reconcile-every-5m --cron "*/5 * * * *" --endpoint "/reconcile-payments"`

4) Verify logs and status in the Supabase dashboard. The function returns a JSON summary: `{ processed, activated, results: [...] }`.

Optional — Targeted Reconcile from the UI
- The learner Dashboard and Resume screens invoke `reconcile-payments` for the current user when status is `pending_payment` to accelerate activation if the webhook or client callback was missed.

Notes
- The webhook (`paystack-webhook`) remains the primary activation path on `charge.success`.
- The reconciling job is an extra safety net to catch missed callbacks.
