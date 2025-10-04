# Registration Error Messages - Complete Guide

> **Legacy note:** Section references to `registration-after` assets reflect the deprecated two-step flow. Error handling for the new unified form now lives exclusively in `apps/learner/src/registration-before.js`.

## Overview
Complete documentation of all error messages shown to users during registration, with visual examples and code references.

---

## 🎨 Error Display Component

**Location**: `registration-after-payment.html` line 95-99

```html
<div
  id="after-feedback"
  class="mt-6 hidden rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
  role="alert"
></div>
```

**Visual Appearance**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Error message appears here                   │
└─────────────────────────────────────────────────┘
```
- **Background**: Light red (`bg-red-50`)
- **Border**: Red (`border-red-200`)
- **Text**: Dark red (`text-red-700`)
- **Size**: Small text (`text-sm`)
- **Padding**: Comfortable spacing (`px-4 py-3`)
- **Accessibility**: `role="alert"` for screen readers

---

## 📋 Complete Error Message List

### **1. Username Errors**

#### **1.1 Empty Username**
**Trigger**: User submits without entering username

**Code**: `registration-after.js` line 122-124
```javascript
if (!username || username.trim().length === 0) {
  throw new Error('Username is required.');
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Username is required.                        │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [                    ] ← Empty field
Password: [••••••••]
Confirm: [••••••••]

[Save and continue]
```

---

#### **1.2 Username Too Short**
**Trigger**: User enters less than 3 characters

**Code**: `registration-after.js` line 128-130
```javascript
if (trimmed.length < 3) {
  throw new Error('Username must be at least 3 characters long.');
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Username must be at least 3 characters long. │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [Jo] ← Only 2 characters
Password: [••••••••]
Confirm: [••••••••]

[Save and continue]
```

**Note**: HTML5 validation (`minlength="3"`) may catch this before JS

---

#### **1.3 Username Invalid Characters**
**Trigger**: User enters special characters like `@`, `!`, `#`, spaces

**Code**: `registration-after.js` line 132-134
```javascript
if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
  throw new Error('Username can only contain letters, numbers, hyphens, and underscores.');
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Username can only contain letters, numbers, hyphens, and     │
│    underscores.                                                 │
└─────────────────────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [john@doe] ← Contains @ symbol
Password: [••••••••]
Confirm: [••••••••]

[Save and continue]
```

**Note**: HTML5 validation (`pattern="[a-zA-Z0-9_-]+"`) may catch this before JS

---

#### **1.4 Username Already Taken** ⭐ KEY ERROR
**Trigger**: User tries to register with existing username

**Code**: `registration-after.js` line 152-154
```javascript
if (data && data.id !== currentUserId) {
  throw new Error('This username is already taken. Please choose another.');
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ This username is already taken. Please choose another.       │
└─────────────────────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe] ← Already exists in database
Password: [••••••••]
Confirm: [••••••••]

[Save and continue] ← Button re-enabled, user can try again
```

**Examples of Caught Duplicates**:
- Existing: `johndoe` → User tries: `johndoe` → ❌ Blocked
- Existing: `johndoe` → User tries: `JohnDoe` → ❌ Blocked (normalized)
- Existing: `johndoe` → User tries: `JOHNDOE` → ❌ Blocked (normalized)
- Existing: `johndoe` → User tries: `john_doe` → ✅ Allowed (different)

---

### **2. Password Errors**

#### **2.1 Empty Password**
**Trigger**: User submits without entering password

**Code**: `registration-after.js` line 217-220
```javascript
if (!password || password.length === 0) {
  showFeedback('Password is required.');
  return;
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Password is required.                        │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe]
Password: [          ] ← Empty field
Confirm: [••••••••]

[Save and continue]
```

---

#### **2.2 Password Too Short**
**Trigger**: User enters less than 6 characters

**Code**: `registration-after.js` line 222-225
```javascript
if (password.length < 6) {
  showFeedback('Password must be at least 6 characters long.');
  return;
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Password must be at least 6 characters long.                 │
└─────────────────────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe]
Password: [•••••] ← Only 5 characters
Confirm: [•••••]

[Save and continue]
```

**Note**: HTML5 validation (`minlength="6"`) may catch this before JS

---

#### **2.3 Passwords Don't Match**
**Trigger**: Confirm password doesn't match password

**Code**: `registration-after.js` line 227-231
```javascript
if (password !== confirmPassword) {
  passwordErrorEl?.classList.remove('hidden');
  showFeedback('Passwords do not match.');
  return;
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Passwords do not match.                      │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe]
Password: [••••••••]
Confirm: [•••••••••] ← Different length/content
Passwords do not match. ← Additional inline error

[Save and continue]
```

**Note**: Shows BOTH banner error AND inline error below confirm field

---

### **3. Payment/Setup Errors**

#### **3.1 No Payment Reference**
**Trigger**: User accesses page without completing payment

**Code**: `registration-after.js` line 309-314
```javascript
if (!reference) {
  showFeedback('No payment reference found. Please go back and try again.');
  setLoading(true);
  submitBtn.disabled = true;
  return;
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ No payment reference found. Please go back and try again.    │
└─────────────────────────────────────────────────────────────────┘

Email: [                    ]
Username: [                    ]
Password: [                    ]
Confirm: [                    ]

[Save and continue] ← Button DISABLED
```

---

#### **3.2 Payment Verification Failed**
**Trigger**: Payment verification fails with Paystack

**Code**: `registration-after.js` line 316-323
```javascript
try {
  await verifyPayment(reference);
} catch (error) {
  showFeedback(error.message || 'Payment verification failed.');
  setLoading(true);
  submitBtn.disabled = true;
  return;
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Payment verification failed.                 │
└─────────────────────────────────────────────────┘

[Form fields disabled]

[Save and continue] ← Button DISABLED
```

---

#### **3.3 User ID Not Found**
**Trigger**: User data corrupted or localStorage cleared

**Code**: `registration-after.js` line 237-240
```javascript
const userId = contactPayload?.userId;
if (!userId) {
  throw new Error('User ID not found. Please try again.');
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ User ID not found. Please try again.         │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe]
Password: [••••••••]
Confirm: [••••••••]

[Save and continue] ← Button re-enabled
```

---

### **4. Backend Errors**

#### **4.1 Backend Username Taken (Race Condition)**
**Trigger**: Another user takes username between frontend check and backend save

**Code**: `finalize-registration/index.ts` line 48-52
```typescript
if (existingUser && existingUser.id !== userId) {
  return new Response(JSON.stringify({ error: 'Username is already taken' }), {
    status: 409,
  });
}
```

**Handled by**: `registration-after.js` line 192-195
```javascript
if (data?.error) {
  console.error('[After Registration] Business error:', data.error);
  throw new Error(data.error);
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Username is already taken                    │
└─────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe] ← Can edit and try again
Password: [••••••••]
Confirm: [••••••••]

[Save and continue] ← Button re-enabled
```

---

#### **4.2 Generic Backend Error**
**Trigger**: Any other backend error (network, database, etc.)

**Code**: `registration-after.js` line 279-284
```javascript
} catch (error) {
  console.error('[After Registration] Failed to complete setup', error);
  showFeedback(
    error.message || 'We could not save your details. Please try again.'
  );
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ We could not save your details. Please try again.            │
└─────────────────────────────────────────────────────────────────┘

Email: john@example.com (readonly)
Username: [johndoe]
Password: [••••••••]
Confirm: [••••••••]

[Save and continue] ← Button re-enabled
```

---

### **5. Initialization Errors**

#### **5.1 Failed to Load Account**
**Trigger**: Error during page initialization

**Code**: `registration-after.js` line 356-361
```javascript
initialise().catch((error) => {
  console.error('[After Registration] Initialisation failed', error);
  showFeedback(
    'We could not load your account details. Please refresh the page.'
  );
  setLoading(true);
  if (submitBtn) submitBtn.disabled = true;
});
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ We could not load your account details. Please refresh the   │
│    page.                                                        │
└─────────────────────────────────────────────────────────────────┘

[Form fields may be empty or disabled]

[Save and continue] ← Button DISABLED
```

---

### **6. Success Messages** ✅

#### **6.1 Auto-Login Failed (Manual Login Required)**
**Trigger**: Registration succeeded but auto-login failed

**Code**: `registration-after.js` line 257-268
```javascript
if (signInError) {
  console.error('[After Registration] Auto sign-in failed:', signInError);
  if (containerEl && successEl) {
    containerEl.classList.add('hidden');
    successEl.classList.remove('hidden');
  }
  showFeedback(
    'Account created successfully! Please sign in with your new credentials.',
    'success'
  );
}
```

**User Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Account created successfully! Please sign in with your new   │
│    credentials.                                                 │
└─────────────────────────────────────────────────────────────────┘

[Form hidden, success screen shown]

        ✅
   You're all set!

Use your new username and password to sign in
and access your dashboard.

[Continue to sign in]  [Jump to dashboard]
```

**Note**: Green background (`bg-green-50`), green text (`text-green-700`)

---

## 📊 Error Message Summary Table

| # | Error Type | Message | User Can Retry? | Button State |
|---|------------|---------|-----------------|--------------|
| 1.1 | Empty username | "Username is required." | ✅ Yes | Enabled |
| 1.2 | Short username | "Username must be at least 3 characters long." | ✅ Yes | Enabled |
| 1.3 | Invalid chars | "Username can only contain letters, numbers, hyphens, and underscores." | ✅ Yes | Enabled |
| 1.4 | Username taken | "This username is already taken. Please choose another." | ✅ Yes | Enabled |
| 2.1 | Empty password | "Password is required." | ✅ Yes | Enabled |
| 2.2 | Short password | "Password must be at least 6 characters long." | ✅ Yes | Enabled |
| 2.3 | Password mismatch | "Passwords do not match." | ✅ Yes | Enabled |
| 3.1 | No payment ref | "No payment reference found. Please go back and try again." | ❌ No | Disabled |
| 3.2 | Payment failed | "Payment verification failed." | ❌ No | Disabled |
| 3.3 | No user ID | "User ID not found. Please try again." | ✅ Yes | Enabled |
| 4.1 | Backend username | "Username is already taken" | ✅ Yes | Enabled |
| 4.2 | Backend error | "We could not save your details. Please try again." | ✅ Yes | Enabled |
| 5.1 | Init failed | "We could not load your account details. Please refresh the page." | ❌ No | Disabled |
| 6.1 | Success | "Account created successfully! Please sign in with your new credentials." | N/A | N/A |

---

## 🎯 Key Features

### **1. Clear, Actionable Messages** ✅
- Every error tells user WHAT went wrong
- Every error tells user HOW to fix it
- No technical jargon or error codes

### **2. Form Re-enabled After Errors** ✅
```javascript
} finally {
  setLoading(false);  // Re-enables form
}
```
- User can immediately try again
- No need to refresh page
- Smooth error recovery

### **3. Multiple Error Indicators** ✅
For password mismatch:
- Banner error at top (red box)
- Inline error below field (red text)
- Visual feedback (red border on field)

### **4. Accessibility** ✅
```html
<div role="alert">
```
- Screen readers announce errors
- Semantic HTML
- Color + text (not just color)

---

## 🧪 Testing Error Messages

### **Test Script**

```javascript
// Test 1: Empty username
// Action: Leave username blank, submit
// Expected: "Username is required."

// Test 2: Short username
// Action: Enter "ab", submit
// Expected: "Username must be at least 3 characters long."

// Test 3: Invalid characters
// Action: Enter "john@doe", submit
// Expected: "Username can only contain letters, numbers, hyphens, and underscores."

// Test 4: Username taken
// Action: Enter existing username, submit
// Expected: "This username is already taken. Please choose another."

// Test 5: Empty password
// Action: Leave password blank, submit
// Expected: "Password is required."

// Test 6: Short password
// Action: Enter "12345", submit
// Expected: "Password must be at least 6 characters long."

// Test 7: Password mismatch
// Action: Enter different passwords, submit
// Expected: "Passwords do not match."

// Test 8: All valid
// Action: Enter valid data, submit
// Expected: Success message or redirect
```

---

## 📱 Mobile Responsiveness

Error messages are fully responsive:
- **Desktop**: Full width banner
- **Tablet**: Adapts to screen size
- **Mobile**: Stacks nicely, readable text

```css
class="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
```
- Uses Tailwind responsive utilities
- Maintains padding on all screens
- Text remains readable

---

## 🎨 Visual Design

### **Error State** (Red)
```
Background: #FEF2F2 (red-50)
Border: #FECACA (red-200)
Text: #B91C1C (red-700)
Icon: ⚠️
```

### **Success State** (Green)
```
Background: #F0FDF4 (green-50)
Border: #BBF7D0 (green-200)
Text: #15803D (green-700)
Icon: ✅
```

---

## 📚 Related Files

- `apps/learner/registration-after-payment.html` - Error display HTML
- `apps/learner/src/registration-after.js` - Error handling logic
- `supabase/functions/finalize-registration/index.ts` - Backend errors

---

**Last Updated**: 2025-09-30  
**Author**: Senior Developer  
**Status**: ✅ All Error Messages Documented
