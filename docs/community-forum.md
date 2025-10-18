# Learner Community Stream

## Overview

The learner dashboard includes a lightweight “Community” tab so every authenticated learner can drop quick updates, celebrate wins, or ask for help. The interface now behaves like a single shared chat room—no threads or extra cards—so messages appear in chronological order with inline file previews. Attachments remain private to authenticated users and are served via short-lived signed URLs.

## Data model

Recent Supabase migrations introduce a flat message stream:

- `community_stream_messages`: top-level messages with author, content, and timestamps.
- `community_stream_attachments`: metadata for optional uploads linked to each message.

Both tables enforce row level security. Any authenticated learner can read the stream, insert new messages, and manage (update/delete) content they authored, while `public.is_admin()` users retain full moderation control. Attachments continue to live in the private `community-uploads` bucket (5 MB cap, curated MIME allowlist), so no storage changes are required.

Legacy tables (`community_threads`, `community_posts`, etc.) remain for historical data but are no longer used by the learner UI.

## Front-end changes

- `apps/learner/admin-board.html` now renders a single-column chat surface with a scrollable message list and a compact composer, styled with the homepage gradient palette for visual consistency. Previous thread panels and empty-state cards were removed.
- `apps/learner/src/dashboard.js` manages the new stream state:
  - Fetches the latest 200 `community_stream_messages` with their attachments.
  - Renders chat bubbles, hydrates attachment previews via signed URLs, and keeps a simple in-memory cache of author display names.
  - Handles message posting, attachment validation/upload, and optimistic UI updates.
  - Subscribes to Supabase realtime `INSERT` events on `community_stream_messages` so everyone sees new activity immediately.
- The community badge in the bottom nav now simply clears itself (no unread counter) because the experience is one continuous room.

## Admin & moderation follow-up

- Add an admin dashboard view for bulk moderation (delete messages/attachments, or temporarily mute learners).
- Introduce lightweight rate limiting or flood control via an RPC/Edge Function if spam becomes a risk.
- Extend realtime subscriptions to cover `DELETE` events once moderation tools are live.
- Capture analytics (message volume, attachment counts) after adoption stabilises.

## Local testing

1. Apply migrations: `supabase db push`.
2. Launch the learner dashboard and log in with an active plan.
3. Open the Community tab, post a message, and optionally attach a 5 MB-or-smaller file.
4. Sign in with a second learner in another browser/incognito window to confirm realtime delivery and attachment visibility.

> ⚠️ Attachment storage still relies on the default Supabase quota—monitor usage and consider lifecycle policies if the room becomes very active.
