# Learner Community (Retired)

The dedicated community chat has been removed from the learner dashboard. Learners no longer see a “Community” navigation button, and all client code related to threaded or room-based messaging has been deleted.

## Backend clean-up

- `community_threads`, `community_posts`, `community_stream_messages`, and all related attachment/read-tracking tables have been dropped via migration `20251217130000_remove_community_add_announcements.sql`.
- Storage policies and the private `community-uploads` bucket were removed to prevent orphaned assets.

## Replacement

Admins can now publish concise broadcast notifications from the admin dashboard. These broadcasts surface as slim brown banners near the top of the learner dashboard (see `docs/broadcast-notifications.md`).

No additional action is required after applying the latest migrations; the community UI is fully retired.
