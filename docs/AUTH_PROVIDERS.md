# Auth providers (Learner)

This project already uses Supabase Auth. The learner app now supports:

- Username + password (existing flow)
- Email OTP (6-digit code) + email link
- Google OAuth

## Supabase dashboard setup (required)

### 1) Email OTP

- Enable **Email** provider.
- Ensure OTP length is **6 digits** (matches the UI).
- Update the email template so users can either:
  - Copy/paste the **6-digit code** into the site, or
  - Click the **sign-in link** in the email.

The learner login UI supports both methods.

### 2) Google OAuth

- Enable **Google** provider.
- Set **Redirect URLs** to include:
  - `<YOUR_SITE>/apps/learner/login.html`
  - `<YOUR_SITE>/apps/learner/admin-board.html` (used when linking Google from the dashboard)

### 3) Account linking (recommended)

To allow an existing email account to connect Google (same account, same user), enable:

- **Manual account linking** in Supabase Auth settings

The learner dashboard includes a “Connect Google” button under **Profile & security**.

## App entry points

- Learner sign-in page: `apps/learner/login.html`
  - Google: “Continue with Google”
  - Email OTP: “Send code” + “Verify”
  - Existing: username + password

### Optional redirect parameters

The login page supports:

- `next`: relative path to redirect after successful sign-in (default: `admin-board.html`)
- `planId`: stored in `localStorage.pendingPlanId` so `subscription-plans.html` can auto-continue checkout for signed-in users

Example:

- `apps/learner/login.html?next=subscription-plans.html&planId=<UUID>`

