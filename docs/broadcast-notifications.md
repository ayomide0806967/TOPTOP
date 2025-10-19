# Broadcast Notifications

**Updated:** December 24, 2025

Admins can now send a single broadcast message that immediately appears on every learner’s dashboard as a slim brown banner.

## How it works

1. The admin dashboard (`apps/admin/dashboard.html`) exposes a “Global notification” card with a textarea and send button.
2. Submissions are stored in the `public.global_announcements` table (see migration `20251217130000_remove_community_add_announcements.sql`).
3. The learner app fetches the most recent `is_active = true` announcement during dashboard load and whenever the tab regains focus. The message renders inside a small amber/brown banner near the top of the dashboard.

Only authenticated admins (checked via `public.is_admin()`) may insert, update, or delete announcements. Learners have read-only access.

To retire a banner without deleting history, set `is_active` to `false` from the admin UI (future enhancement) or directly via Supabase.
