# Complete Registration Flow Documentation

## Overview
This document describes the complete user registration, payment, and login flow for the CBT Fast application.

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

### Step 2: Registration (Before Payment)
- **Page**: `apps/learner/registration-before-payment.html`
- **Script**: `apps/learner/src/registration-before.js`
- **User Inputs**:
  - First Name
  - Last Name
  - Email
  - Phone Number
- **Backend Call**: `create-pending-user` function
  - Creates auth user with email (no password yet)
  - Creates profile with `subscription_status: 'pending_payment'`
  - Returns `userId`
- **Data Stored**: 
  - `registrationContact` in localStorage with userId
  - `postPaymentRegistration` prepared for next step
- **Next**: Opens Paystack checkout modal

### Step 3: Paystack Payment
- **Integration**: Paystack Popup/Inline
- **Backend Call**: `paystack-initiate` function
  - Creates payment transaction record
  - Returns Paystack checkout URL and reference
- **On Success**: Paystack callback triggers
- **On Close**: User can retry payment
- **Next**: Redirect to `registration-after-payment.html?reference={ref}`

### Step 4: Payment Verification
- **Page**: `apps/learner/registration-after-payment.html`
- **Script**: `apps/learner/src/registration-after.js`
- **Backend Call**: `paystack-verify` function
  - Verifies payment with Paystack API
  - Updates payment status to 'success'
  - Creates/updates user subscription
  - Sets subscription status to 'active'
- **Data Retrieved**: Contact info from localStorage
- **Next**: Show username/password form

### Step 5: Create Login Credentials
- **Page**: Same page (`registration-after-payment.html`)
- **User Inputs**:
  - Username (unique, 3+ chars, alphanumeric with hyphens/underscores)
  - Password (6+ chars with strength meter)
  - Confirm Password
- **Backend Call**: `finalize-registration` function
  - Checks username availability
  - Updates auth user with password
  - Updates profile with username and `subscription_status: 'active'`
  - Stores username in user_metadata
- **Auto-Login**: After successful registration
  - Calls `supabase.auth.signInWithPassword()`
  - Uses email and newly created password
- **Next**: Redirect to `admin-board.html`

### Step 6: Login (Future Sessions)
- **Page**: `apps/learner/login.html`
- **Script**: `apps/learner/src/auth.js`
- **User Inputs**: Username or Email + Password
- **Process**:
  1. If input contains '@', treat as email
  2. If no '@', lookup username in profiles table to get email
  3. Call `supabase.auth.signInWithPassword()` with email
- **On Success**: Redirect to `admin-board.html`
- **On Failure**: Show helpful error messages

### Step 7: Resume Registration
- **Page**: `apps/learner/resume-registration.html`
- **Script**: `apps/learner/src/resume-registration.js`
- **Use Case**: User paid but didn't complete username/password setup
- **User Inputs**:
  - Email
  - First Name
  - Last Name
  - Phone Number
- **Backend Call**: `find-pending-registration` function
  - Looks up user by contact details
  - Finds successful payment reference
  - Returns reference and userId
- **Next**: Redirect to `registration-after-payment.html?reference={ref}`

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
- **Purpose**: Create user account before payment
- **Input**: `{ email, firstName, lastName, phone }`
- **Output**: `{ userId }`
- **Actions**:
  - Creates auth user with email (email_confirm: true)
  - Creates profile with pending_payment status
  - Handles existing users (updates metadata)

### 2. paystack-initiate
- **Path**: `supabase/functions/paystack-initiate/` (referenced but not shown)
- **Purpose**: Initialize Paystack payment
- **Input**: `{ planId, userId, registration: { first_name, last_name, phone } }`
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
  - Sets subscription to active

### 4. finalize-registration
- **Path**: `supabase/functions/finalize-registration/index.ts`
- **Purpose**: Set username and password after payment
- **Input**: `{ userId, username, password, firstName, lastName, phone, email }`
- **Output**: `{ success: true }`
- **Actions**:
  - Validates username availability
  - Updates auth user password
  - Updates profile with username and active status
  - Stores username in user_metadata

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
