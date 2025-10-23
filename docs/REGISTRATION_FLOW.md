# Complete Registration Flow Documentation

## Overview

This document describes the complete user registration, payment, and login flow for the CBT Fast application.

### Iteration History

- **Iteration 1 – Two-step checkout (legacy)**: Users filled contact details, launched Paystack, and then completed credentials on a separate `registration-after-payment.html`. Resume flow existed for unfinished setups.
- **Iteration 2 – Unified checkout (current)**: A single progressive form gathers contact + credentials, auto-generates usernames, launches Paystack, and verifies payment without navigation. Auto sign-in and username reminders happen on the same page. Resume screen now only serves guidance.

## Flow Diagram

```
User Journey:
1. Browse Plans → 2. Register (Before Payment) → 3. Paystack Checkout →
4. Payment Verification → 5. Create Username/Password → 6. Auto-Login → 7. Dashboard
```

## Detailed Step-by-Step Flow

### Step 1: Plan Selection

- **Page**: Pricing/Plans page (not yet created)
- **Action**: User selects a subscription plan
- **Data Stored**: Plan ID in localStorage
- **Next**: Redirect to `registration-before-payment.html?planId={id}`

### Step 2: Unified Registration & Credentials

- **Page**: `apps/learner/registration-before-payment.html`
- **Script**: `apps/learner/src/registration-before.js`
- **User Inputs** (progressively revealed on the same page):
  - First name & last name
  - Email (uniqueness check against active subscriptions)
  - Phone number (uniqueness check against active subscriptions)
  - Password + confirmation (minimum 8 characters)
- **System Output**: Auto-generated, non-editable username (short + memorable)
- **Backend Call**: `create-pending-user`
  - Only accepts requests from whitelisted domains (`REGISTRATION_ALLOWED_ORIGINS`)
  - Creates a new auth user with the supplied password (existing accounts throw 409)
  - Reserves the generated username in auth metadata and the `profiles` table
  - Persists `subscription_status: 'pending_payment'`
  - Generates a one-hour `registrationToken`, stores its SHA-256 hash+expiry on the profile, and returns the raw token alongside `{ userId, username }`
- **Data Stored**: `registrationContact` snapshot (no password) plus the `registrationToken` (kept in memory for finalize step)
- **Next**: Launches Paystack checkout inline (no intermediate page)

### Step 3: Paystack Payment

- **Integration**: Paystack Popup/Inline
- **Backend Call**: `paystack-initiate` function
  - Creates payment transaction record
  - Returns Paystack checkout URL and reference
- **On Success**: Paystack callback triggers
- **On Close**: User can retry payment
- **Next**: Stay on the same page for automatic verification

### Step 4: Payment Verification & Auto Login

- **Trigger**: Paystack callback on the registration page
- **Backend Call**: `paystack-verify`
  - Confirms the transaction with Paystack
  - Upserts the payment record and activates the subscription via `_shared/paystack.ts`
  - Promotes the learner profile to `subscription_status: 'active'`
- **Frontend Actions**:
  - Shows an activation success message with the reserved username
  - Attempts automatic sign-in using the stored password
- Prompts the learner to save their username/password securely; provides a copy shortcut
- Calls `finalize-registration` with `{ userId, username, password, registrationToken, ... }` so the backend validates the registration token, sets the final password, and clears the token
- **Next**: Redirects to `admin-board.html` if auto sign-in works, otherwise instructs the learner to sign in manually

### Step 5: Login (Future Sessions)

- **Page**: `apps/learner/login.html`
- **Script**: `apps/learner/src/auth.js`
- **User Inputs**: Username or Email + Password
- **Process**:
  1. If input contains '@', treat as email
  2. If no '@', lookup username in profiles table to get email
  3. Call `supabase.auth.signInWithPassword()` with email
- **On Success**: Redirect to `admin-board.html`
- **On Failure**: Show helpful error messages

### Legacy Resume Flow

- **Page**: `apps/learner/resume-registration.html`
- **Status**: Informational only; directs learners to log in or reset their password because credentials are now created before payment
- **Backend**: No longer calls `find-pending-registration`

## Database Schema

### profiles table

```sql
- id (uuid, primary key, references auth.users)
- email (text)
- username (text, unique, nullable)
- first_name (text)
- last_name (text)
- full_name (text)
- phone (text)
- subscription_status (text: 'pending_payment', 'active', 'trialing', 'cancelled')
- default_subscription_id (uuid, references user_subscriptions, nullable)
- role (text: 'learner', 'admin')
- department_id (uuid, nullable)
- created_at (timestamp)
- updated_at (timestamp)
```

### payment_transactions table

```sql
- id (uuid, primary key)
- user_id (uuid, references profiles)
- plan_id (uuid, references subscription_plans)
- provider (text: 'paystack')
- reference (text, unique)
- status (text: 'pending', 'success', 'failed')
- amount (numeric)
- currency (text)
- paid_at (timestamp)
- metadata (jsonb)
- raw_response (jsonb)
- subscription_id (uuid, references user_subscriptions, nullable)
```

### user_subscriptions table

```sql
- id (uuid, primary key)
- user_id (uuid, references profiles)
- plan_id (uuid, references subscription_plans)
- status (text: 'active', 'trialing', 'past_due', 'cancelled', 'expired')
- started_at (timestamp)
- expires_at (timestamp, nullable)
- purchased_at (timestamp)
- payment_transaction_id (uuid, references payment_transactions, nullable)
- quantity (integer, defaults to 1)
- renewed_from_subscription_id (uuid, references user_subscriptions, nullable)
- price (numeric)
- currency (text)
```

### Subscription stacking & default plan selection

- Every successful payment now either extends an existing active subscription (same plan) by the plan duration or creates a fresh row when none is active. The Paystack metadata `quantity` is no longer honored, preventing users from claiming extra months client-side.
- `profiles.default_subscription_id` records the learner’s preferred plan for daily question generation. The new RPC `set_default_subscription(subscription_id uuid)` lets clients update this preference (and clears it when `null`).
- `generate_daily_quiz(p_subscription_id uuid default null, p_limit integer default null)` uses the selected subscription (or the default fallback) and will surface clear errors when the plan is expired, pending activation, or lacks a configured schedule.
- `refresh_profile_subscription_status` derives the profile-level `subscription_status` whenever subscriptions change, while preserving `pending_payment` until a plan activates.
- `payment_transactions.subscription_id` and `user_subscriptions.payment_transaction_id` link billing records for easier auditing.
- Logged-in learners who open the pricing page stay authenticated; plan selection launches Paystack checkout directly using their saved profile details, while new visitors still follow the pre-payment registration flow.
- `profiles.session_fingerprint` persists the learner's active session signature. Logging in on a new device overwrites this fingerprint, forcing previously signed-in browsers to re-authenticate.

## Edge Functions

### 1. create-pending-user

- **Path**: `supabase/functions/create-pending-user/index.ts`
- **Purpose**: Issue pending accounts and registration tokens prior to payment
- **Input**: `{ email, firstName, lastName, phone, username, password }`
- **Output**: `{ userId, username, registrationToken }`
- **Actions**:
  - Allows requests only from whitelisted origins (`REGISTRATION_ALLOWED_ORIGINS`)
  - Validates username/password uniqueness
  - Creates a new auth user (existing accounts now reject with 409)
  - Upserts the profile as `pending_payment`
  - Generates a random registration token, stores its SHA-256 hash + expiry on the profile
  - Returns the raw token to the client (must be stored temporarily for finalize step)

### 2. paystack-initiate

- **Path**: `supabase/functions/paystack-initiate/`
- **Purpose**: Initialize Paystack payment (unchanged)
- **Input/Output**: `{ planId, userId, registration: { first_name, last_name, phone, username } }` → `{ reference, amount, currency, publicKey, metadata }`

### 3. paystack-verify

- **Path**: `supabase/functions/paystack-verify/index.ts`
- **Output**: `{ status: 'success', subscription_id, transaction_id }`
- **Actions changes**:
  - `_shared/paystack.ts` now rejects underpayments, enforces `status === 'success'`, and treats quantity as 1 to prevent tampering.

### 4. finalize-registration (secured)

- **Path**: `supabase/functions/finalize-registration/index.ts`
- **Input**: `{ userId, username, password, registrationToken, firstName?, lastName?, email?, phone? }`
- **Output**: `{ success: true }`
- **Actions**:
  - Validates allowed origin and required fields
  - Hashes the provided `registrationToken` and compares it with the stored profile hash/expiry
  - Updates auth password + metadata, clears the stored token fields, refreshes subscription status
  - Rejects invalid or expired tokens, preventing account hijack

## Error Handling

### Common Errors and Solutions

1. **"User ID not found"**
   - **Cause**: userId not passed from registration-before to registration-after
   - **Solution**: Fixed by passing userId through localStorage in postPaymentRegistration

2. **"Username not found"**
   - **Cause**: User trying to login before completing registration
   - **Solution**: Error message directs to "Continue previous registration"

3. **"Username is already taken"**
   - **Cause**: Username conflict during finalize-registration
   - **Solution**: User must choose different username

4. **"Payment verification failed"**
   - **Cause**: Invalid reference or Paystack API error
   - **Solution**: User should retry or contact support

5. **"No matching pending registration found"**
   - **Cause**: Contact details don't match or no successful payment
   - **Solution**: Verify details or start new registration

## Testing Checklist

- [ ] New user can register with valid details
- [ ] Payment modal opens correctly
- [ ] Payment verification succeeds
- [ ] Username creation works
- [ ] Password strength meter displays
- [ ] Auto-login after registration works
- [ ] User can login with username
- [ ] User can login with email
- [ ] Resume registration finds pending users
- [ ] Error messages are helpful and clear

## Security Considerations

1. **Password Requirements**: Minimum 8 characters (enforced client + server).
2. **Registration Token**: Pending accounts are finalized only when the hashed token matches and hasn’t expired (1 hour default).
3. **Origin Enforcement**: `REGISTRATION_ALLOWED_ORIGINS` limits where edge functions accept requests from.
4. **Service Role Key**: Still confined to edge functions; all endpoints now require either the registration token or full Paystack verification.
5. **Payment Verification**: Underpayments or non-success statuses cause hard failure; client metadata is ignored for quantity.
6. **Session Management**: Supabase Auth continues to manage JWTs; auto-login after payment remains, but tokens are cleared if sign-in fails.
7. **Allowed Origins**: `REGISTRATION_ALLOWED_ORIGINS` environment variable restricts which web origins may invoke `create-pending-user` or `finalize-registration`.

## Future Improvements

1. Add email verification step
2. Add password reset functionality
3. Add social login options (Google, etc.)
4. Add two-factor authentication
5. Add subscription management (upgrade/downgrade)
6. Add payment history page
7. Add receipt generation and email
8. Add webhook for Paystack events
9. Automate rotation / invalidation of registration tokens after multiple failed finalization attempts
