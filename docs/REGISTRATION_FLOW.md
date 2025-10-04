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
  - Creates or updates the auth user with the supplied password
  - Reserves the generated username in both auth metadata and `profiles`
  - Persists `subscription_status: 'pending_payment'`
  - Returns `{ userId, username }`
- **Data Stored**: `registrationContact` snapshot (no password) for resilience during checkout
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
```

### user_subscriptions table
```sql
- id (uuid, primary key)
- user_id (uuid, references profiles)
- plan_id (uuid, references subscription_plans)
- status (text: 'active', 'cancelled', 'expired')
- started_at (timestamp)
- expires_at (timestamp, nullable)
- price (numeric)
- currency (text)
```

## Edge Functions

### 1. create-pending-user
- **Path**: `supabase/functions/create-pending-user/index.ts`
- **Purpose**: Create/update pending learner accounts (with credentials) before payment
- **Input**: `{ email, firstName, lastName, phone, username, password }`
- **Output**: `{ userId, username }`
- **Actions**:
  - Validates username/password, ensuring uniqueness across profiles
  - Creates or updates the auth user with password + metadata (first/last name, phone, username)
  - Upserts the profile with `subscription_status: 'pending_payment'`
  - Prevents conflicts with active subscriptions (email/phone/username)

### 2. paystack-initiate
- **Path**: `supabase/functions/paystack-initiate/` (referenced but not shown)
- **Purpose**: Initialize Paystack payment
- **Input**: `{ planId, userId, registration: { first_name, last_name, phone, username } }`
- **Output**: `{ reference, amount, currency, publicKey, metadata }`

### 3. paystack-verify
- **Path**: `supabase/functions/paystack-verify/index.ts`
- **Purpose**: Verify payment with Paystack
- **Input**: `{ reference }`
- **Output**: `{ status: 'success', subscription_id, transaction_id }`
- **Actions**:
  - Calls Paystack API to verify transaction
  - Records payment in payment_transactions
  - Creates/updates user_subscriptions
  - Updates profile status to active in `_shared/paystack.ts`

### 5. find-pending-registration
- **Path**: `supabase/functions/find-pending-registration/index.ts`
- **Purpose**: Find incomplete registrations
- **Input**: `{ email, firstName, lastName, phone }`
- **Output**: `{ reference, userId }`
- **Actions**:
  - Looks up profile by contact details
  - Finds successful payment
  - Returns reference for resume flow

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

1. **Password Requirements**: Minimum 6 characters (enforced in frontend and Supabase)
2. **Username Validation**: Alphanumeric with hyphens/underscores only
3. **Email Confirmation**: Set to true during user creation
4. **Service Role Key**: Used only in Edge Functions, never exposed to client
5. **Payment Verification**: Always verified server-side with Paystack API
6. **Session Management**: Handled by Supabase Auth with secure tokens

## Future Improvements

1. Add email verification step
2. Add password reset functionality
3. Add social login options (Google, etc.)
4. Add two-factor authentication
5. Add subscription management (upgrade/downgrade)
6. Add payment history page
7. Add receipt generation and email
8. Add webhook for Paystack events
