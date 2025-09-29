# Paystack Integration

This project now relies on Paystack for subscription checkout flows. Configure the
following environment variables for Supabase Edge Functions before deploying the
updated functions:

| Variable                           | Purpose                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`              | Paystack secret key used to initialise and verify transactions.                                                                         |
| `PAYSTACK_PUBLIC_KEY`              | Public key exposed to the client for inline checkout (used as a fallback if the HTML config is not provided).                           |
| `PAYSTACK_CALLBACK_URL` (optional) | Paystack redirect URL for hosted checkout flows.                                                                                        |
| `PAYSTACK_FORWARD_URL` (optional)  | Additional webhook endpoint to forward verified events (set to `https://processpaystackwebhook-2juaft5ieq-uc.a.run.app` in production). |
| `APP_SUPABASE_SERVICE_ROLE_KEY`    | Required by the Edge Functions to write to secured tables.                                                                              |
| `APP_SUPABASE_ANON_KEY`            | Required to resolve the authenticated user context.                                                                                     |
| `APP_SUPABASE_URL`                 | Supabase project URL.                                                                                                                   |

### Supabase Edge Functions

Deploy the new functions after setting the environment variables:

- `paystack-initiate`
- `paystack-verify`
- `paystack-webhook`

Example deployment (from the `supabase` directory):

```bash
supabase functions deploy paystack-initiate --no-verify-jwt
supabase functions deploy paystack-verify --no-verify-jwt
supabase functions deploy paystack-webhook --no-verify-jwt
```

> These functions expect authenticated requests (via the `Authorization: Bearer <access_token>` header) for user-triggered operations. The webhook function validates the `x-paystack-signature` header before processing events. Legacy environment names (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) remain supported as fallbacks but are no longer recommended.

### Webhook configuration

Point the Paystack dashboard webhook URL to the deployed `paystack-webhook` function (e.g. `https://<project>.functions.supabase.co/paystack-webhook`). Events will be mirrored to `https://processpaystackwebhook-2juaft5ieq-uc.a.run.app` when `PAYSTACK_FORWARD_URL` is set.

### Database changes

The migration `20251118153000_paystack_integration.sql` introduces a new `payment_transactions` table used to audit gateway events. Ensure migrations are applied before deploying the functions:

```bash
supabase db push
```

### Client configuration

The learner subscription page (`apps/learner/subscription-plans.html`) loads the Paystack inline script and expects `window.__PAYSTACK_CONFIG__.publicKey` to be populated. For production builds, override this value via template injection or environment-specific bundling.

### Testing

- Run `npx vitest run` to execute unit tests.
- Use Paystack test cards (e.g. `5078 5078 5078 5078`) to exercise the inline checkout flow locally.
