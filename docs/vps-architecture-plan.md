# VPS Architecture and Migration Plan

This migration is not a Supabase clone. The target is a cleaner Dokploy-hosted product with only the features we are shipping.

## Decisions

- Deploy through Dokploy using Compose.
- Use PostgreSQL as the system of record.
- Use Redis for auth/session secondary storage, short-lived tokens, rate limits, and later queues.
- Use Better Auth for username/password authentication.
- Keep browser code away from direct database access.
- Enforce authorization in server routes, not in browser helpers or Supabase RLS.
- Do not migrate exam hall, community/forum/chat, old auth providers, Supabase realtime, stale test pages, backup dashboard flows, or unused Edge Functions.

## Target Runtime

```text
Dokploy Compose
  app       Node 22 + Hono API + static file server
  postgres PostgreSQL 16/17
  redis    Redis 7
  storage  Cloudflare R2 preferred, MinIO only if all files must stay on VPS
```

The app container owns all HTTP traffic:

```text
/api/auth/*       Better Auth
/api/*            product API
/apps/*           existing static app during transition
/assets/*         static assets
```

## Recommended Server Layout

Do not put business logic directly in `server/index.js`. Keep each layer small:

```text
server/
  index.js
  config/
    env.js
  db/
    pool.js
    query.js
    tx.js
  auth/
    betterAuth.js
    requireSession.js
    requireRole.js
  routes/
    health.routes.js
    me.routes.js
    registration.routes.js
    payments.routes.js
    learner.routes.js
    admin.routes.js
    uploads.routes.js
  modules/
    profiles/
      profiles.repo.js
      profiles.service.js
      profiles.schemas.js
    subscriptions/
    payments/
    questions/
    quiz/
    admin/
    uploads/
  jobs/
    reconcilePayments.job.js
  utils/
    httpError.js
    logger.js
```

Rules:

- `routes/*` parse HTTP, validate input, call services, return JSON.
- `modules/*/*.service.js` contains business rules.
- `modules/*/*.repo.js` is the only place that writes SQL for that module.
- No route should construct SQL directly unless it is a trivial health check.
- No frontend file should call `supabase.from`, `supabase.rpc`, `supabase.storage`, or `supabase.functions.invoke` after it is migrated.

## API Surface To Build

### Auth and Profile

```text
GET  /api/me
POST /api/auth/sign-in/email       Better Auth
POST /api/auth/sign-out            Better Auth
POST /api/auth/forget-password     Better Auth
POST /api/auth/reset-password      Better Auth
```

Application profile data stays separate from Better Auth user data:

```text
better-auth user: id, email, auth metadata
profiles: role, full_name, username, phone, department, subscription status
```

### Registration

```text
POST /api/registration/pending
GET  /api/registration/pending
POST /api/registration/finalize
GET  /api/users/lookup-username
```

Only keep the registration flow currently used by the product. Remove alternate/stale registration pages after the replacement is stable.

### Payments

```text
POST /api/payments/paystack/initiate
POST /api/payments/paystack/verify
POST /api/webhooks/paystack
POST /api/jobs/reconcile-payments
```

Webhook handling must verify Paystack signatures before any database write.

### Learner Product

```text
GET  /api/learner/dashboard
GET  /api/learner/subscriptions
POST /api/learner/subscriptions/default
GET  /api/learner/quiz/today
POST /api/learner/quiz/start
POST /api/learner/quiz/:quizId/submit
GET  /api/learner/results
GET  /api/learner/announcements
```

Keep extra/free question routes only if they are confirmed as shipping:

```text
GET  /api/learner/extra-question-sets
POST /api/learner/extra-question-sets/:setId/attempts
GET  /api/learner/free-quizzes
POST /api/learner/free-quizzes/:quizId/attempts
```

### Admin Product

```text
GET    /api/admin/dashboard
GET    /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
GET    /api/admin/subscriptions
PATCH  /api/admin/subscriptions/:id
GET    /api/admin/departments
POST   /api/admin/departments
PATCH  /api/admin/departments/:id
DELETE /api/admin/departments/:id
GET    /api/admin/courses
POST   /api/admin/courses
PATCH  /api/admin/courses/:id
DELETE /api/admin/courses/:id
GET    /api/admin/topics
POST   /api/admin/topics
PATCH  /api/admin/topics/:id
DELETE /api/admin/topics/:id
GET    /api/admin/questions
POST   /api/admin/questions
PATCH  /api/admin/questions/:id
DELETE /api/admin/questions/:id
POST   /api/admin/questions/import-aiken
GET    /api/admin/announcements
POST   /api/admin/announcements
PATCH  /api/admin/announcements/:id
DELETE /api/admin/announcements/:id
```

No exam hall admin routes.

## Data Migration Scope

### Keep

- `profiles`
- `departments`
- `courses`
- `topics`
- `questions`
- `question_options`
- `subscription_products`
- `subscription_plans`
- `user_subscriptions`
- `payment_transactions`
- `daily_quizzes`
- `daily_quiz_questions`
- `global_announcements`
- free/extra quiz tables only if confirmed

### Archive Only

These can stay in a full backup but should not be restored into the production VPS app unless the product scope changes:

- `exam_hall_*`
- `community_*`
- `community_stream_*`
- Supabase realtime publication state
- old/stale registration experiments
- test-only tables or old backup tables

### Storage

Database dumps do not migrate Supabase Storage objects. Migrate `question-images` separately.

Preferred path:

1. Export Supabase Storage bucket objects.
2. Upload to Cloudflare R2.
3. Store object keys in PostgreSQL.
4. Serve images through signed URLs or `/api/uploads/question-images/:key`.

## Frontend Cleanup Plan

Current issues to fix during migration:

- `apps/admin/src/services/dataService.js` is too large and mixes every admin domain.
- `apps/learner/src/dashboard.js` mixes UI rendering, payment refresh, WhatsApp auth, realtime, quiz loading, and subscriptions.
- `apps/shared/auth.js` and `apps/shared/dataIsolation.js` are legacy token-based API assumptions and should not be used for the Better Auth path.
- Many HTML pages still hard-code Supabase config.
- `dashboard.bak.js`, test HTML pages, exam hall pages, and stale auth provider flows should not ship.

Migration rule:

Move one page at a time to `/api/*`, then remove that page's Supabase config. Do not do a partial hidden Supabase fallback in migrated pages.

## Quality Bar

- Every new API route gets input validation.
- Every write route requires an authenticated session.
- Admin routes require `profile.role = 'admin'`.
- Payment routes are idempotent by Paystack reference.
- Webhooks verify signature before reading body data as trusted.
- Use database transactions for registration, payment activation, question import, and bulk account flows.
- Use structured JSON errors: `{ "error": { "code": "...", "message": "..." } }`.
- Keep service files below roughly 300-500 lines. Split by module before they become catch-all files.
- Add tests for business services and high-risk route handlers.
- No secrets in HTML or frontend JS.

## Implementation Order

1. Create the server folder structure above.
2. Add env validation and a small logger.
3. Add `requireSession` and `requireAdmin`.
4. Build `/api/me`.
5. Port registration and username lookup.
6. Port Paystack initiate, verify, webhook, and reconcile.
7. Port learner dashboard and subscription APIs.
8. Port daily quiz start/submit/results.
9. Port admin questions/departments/courses/topics.
10. Port admin users/subscriptions.
11. Port question image upload/storage.
12. Remove excluded pages and Supabase config from migrated pages.
13. Run selective production data migration and final cutover.
