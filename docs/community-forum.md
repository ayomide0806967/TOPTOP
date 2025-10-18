# Learner Community Forum

## Overview

The learner dashboard now includes a minimalist “Community” tab in the bottom navigation. It provides threaded conversations where authenticated learners can post updates, share tips, and attach lightweight files (images, PDF/Office docs, plain text). Attachments are private to authenticated users and are served via signed URLs.

## Data model

Supabase migrations add the following tables and helpers:

- `community_threads`: top-level conversations with title, author, and timestamps.
- `community_posts`: individual messages belonging to a thread.
- `community_post_attachments`: metadata for uploaded files stored in the `community-uploads` bucket.
- `community_thread_reads`: tracks per-user read markers for badge counts.
- `community_thread_summaries`: view exposing last activity metadata for the dashboard.
- `community_mark_thread_read(thread_id uuid)`: RPC that upserts read markers and returns the new state.

Row level security allows any authenticated learner to read conversations, author their own content, and remove their own attachments, while administrators (checked via `public.is_admin()`) retain moderation capabilities (update/delete).

Attachments live in the private `community-uploads` storage bucket limited to 5 MB per file with a curated allowlist (`image/*`, PDF, Word, Excel, plain text). The front-end generates signed URLs on demand and caches them briefly.

## Front-end changes

- The bottom nav expands to five buttons (`Dashboard`, `Plan`, `Bonus`, `Community`, `Profile`) and the existing badge component now also powers unread counts for community threads.
- `apps/learner/src/dashboard.js` manages community state:
  - Fetch thread summaries + read markers.
  - Render thread list, detail view, reply composer, and attachment previews.
  - Handle thread creation and replies with client-side validation and attachment uploads.
  - Maintain local caches for profiles, posts, attachment URLs, and unread counts.
  - Subscribe to Supabase realtime changes on `community_threads` and `community_posts` for live updates.
- `apps/learner/admin-board.html` bundles new minimalist styles for the community UI (thread list cards, message bubbles, composer modal).

The feature reuses existing Supabase client utilities and toasts; all new DOM hooks live under `data-role="community-*"` selectors to avoid clashing with other sections.

## Admin & moderation follow-up

- Add an admin dashboard view (future work) to review/report threads, bulk delete content, or pin announcements.
- Consider rate limiting (Supabase Edge function or RPC) to avoid spam.
- Expand the realtime channel to handle UPDATE/DELETE events if moderation tools mutate data directly.
- Add analytics (e.g., thread/post counts, attachments volume) once the community gains traction.

## Local testing

1. Apply migrations: `supabase db push`.
2. Start the learner dashboard (existing workflow) and sign in as a learner with an active plan.
3. Use the Community tab to create a thread, attach a small image, and reply from a second account/browser.
4. Confirm unread badge counts clear after opening or tapping “Mark as read”.

> ⚠️ The forum currently relies on default Supabase storage quotas; watch attachment usage and consider lifecycle policies if needed.
