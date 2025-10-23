# Question of the Day (QotD) Flow Documentation

## Overview

The Question of the Day system provides learners with daily practice questions tailored to their department. The system has been refactored to provide a better user experience by not auto-loading questions and giving users control over when to start their daily practice.

## User Flow

### 1. Dashboard (admin-board.html)

- **Initial State**: Shows QotD card without loading questions
- **Display Options**:
  - **Not Started**: Shows "Start Daily Questions" button
  - **In Progress**: Shows "Continue Quiz" button
  - **Completed**: Shows "Review Results" button with score

### 2. Starting Daily Questions

When user clicks "Start Daily Questions":

1. System checks for existing quiz for today
2. If no quiz exists, generates one via `generate_daily_quiz` RPC
3. Redirects to `exam-face.html?daily_quiz_id={id}`

### 3. Taking the Quiz (exam-face.html)

- **Features**:
  - Question navigation (Previous/Next buttons)
  - Question palette for quick navigation
  - Timer display (if time limit exists)
  - Auto-save on each answer
  - Progress tracking

- **Quiz States**:
  - `assigned`: Initial state, not started
  - `in_progress`: Started, timer running
  - `completed`: Finished, redirects to results

### 4. Viewing Results (result-face.html)

- **Display Elements**:
  - Overall score and percentage
  - Time taken vs time limit
  - Question-by-question review
  - Correct answers highlighted
  - Explanations shown for each question

- **Navigation Options**:
  - Back to Dashboard button
  - Option to generate new quiz (with confirmation)

## Technical Implementation

### Database Schema

#### daily_quizzes

- `id`: UUID primary key
- `user_id`: Reference to auth.users
- `assigned_date`: Date of quiz
- `status`: enum (assigned, in_progress, completed)
- `started_at`: Timestamp when started
- `completed_at`: Timestamp when completed
- `time_limit_seconds`: Optional time limit
- `correct_answers`: Number of correct answers
- `total_questions`: Total question count

#### daily_quiz_questions

- `id`: UUID primary key
- `daily_quiz_id`: Reference to daily_quizzes
- `question_id`: Reference to questions
- `order_index`: Question order
- `selected_option_id`: User's answer
- `is_correct`: Whether answer was correct
- `answered_at`: Timestamp of answer

### Key Files

#### Frontend

- `/apps/learner/admin-board.html` - Dashboard
- `/apps/learner/src/dashboard.js` - Dashboard logic (refactored)
- `/apps/learner/exam-face.html` - Quiz interface
- `/apps/learner/src/exam-face.js` - Quiz logic
- `/apps/learner/result-face.html` - Results page
- `/apps/learner/src/result-face.js` - Results logic

#### Shared Modules

- `/apps/shared/supabaseClient.js` - Supabase client singleton
- `/apps/shared/errorHandler.js` - Global error handling
- `/apps/shared/loadingManager.js` - Loading state management
- `/apps/learner/src/authGuard.js` - Authentication guard

### API Endpoints

#### RPC Functions

- `generate_daily_quiz(p_subscription_id uuid default null, p_limit integer default null)` - Generates quiz for current day using the selected subscription (or the learner’s default preference)
- `get_user_schedule_health()` - Gets schedule status

### Error Handling

The system handles various error scenarios:

1. **No Active Subscription**
   - Message: "You need an active subscription to access daily questions"
   - Action: Prevents quiz generation and prompts learner to pick/renew a plan

2. **Invalid Selected Plan**
   - Message: "The selected subscription is no longer active. Choose a different plan to continue."
   - Action: Refreshes subscription list and requests a new selection

3. **No Active Study Slot**
   - Message: "No active study slot for your department today"
   - Action: Shows informative message on dashboard

4. **Incomplete Question Pool**
   - Message: "Today's question pool is being prepared"
   - Action: Shows warning, allows retry later

5. **Network Errors**
   - Automatic retry with exponential backoff
   - User-friendly error messages
   - Option to retry or return to dashboard

## Security Considerations

1. **Authentication Required**: All pages require valid session
2. **User Isolation**: Users can only access their own quizzes
3. **Quiz Verification**: System verifies quiz ownership before display
4. **Session Management**: Automatic redirect on session expiry

## Performance Optimizations

1. **No Auto-loading**: Questions load only when user initiates
2. **Progressive Loading**: Questions load after quiz metadata
3. **Answer Caching**: Answers saved immediately to prevent loss
4. **Skeleton Loaders**: Visual feedback during data fetching

## User Experience Improvements

1. **Clear Status Indicators**: Visual badges for quiz status
2. **Progress Tracking**: Real-time progress bar
3. **Confirmation Dialogs**: For destructive actions
4. **Responsive Design**: Works on all device sizes
5. **Accessibility**: ARIA labels and keyboard navigation

## Testing Checklist

- [ ] User can see QotD option without questions loading
- [ ] "Start Daily Questions" button generates new quiz
- [ ] Quiz redirects to exam-face.html properly
- [ ] Questions display correctly with options
- [ ] Answers save automatically
- [ ] Timer works correctly (if applicable)
- [ ] Submit button shows confirmation for unanswered questions
- [ ] Results page shows correct score
- [ ] Review shows correct/incorrect answers
- [ ] Back to dashboard navigation works
- [ ] History shows in dashboard
- [ ] Streak calculation is accurate

## Future Enhancements

1. **Practice Mode**: Unlimited questions without daily limit
2. **Topic Selection**: Choose specific topics to practice
3. **Difficulty Levels**: Adaptive difficulty based on performance
4. **Detailed Analytics**: Performance trends over time
5. **Social Features**: Compare scores with peers
6. **Offline Support**: Cache questions for offline practice
