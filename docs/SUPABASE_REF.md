# Supabase Project Reference (CBT System)

This repo currently points to a single Supabase project for the main CBT system.

- Project ref: `ghnhfagydcynhkgbazbj`
- Project URL: `https://ghnhfagydcynhkgbazbj.supabase.co`
- Functions base: `https://ghnhfagydcynhkgbazbj.functions.supabase.co`

Where it’s used

- Pages set `window.__SUPABASE_CONFIG__` with the URL (and anon key) at load time. Examples:
  - `apps/learner/admin-board.html`
  - `apps/learner/exam-face.html`
  - `apps/learner/login.html`
  - `apps/admin/login.html`
  - `apps/learner/subscription-plans.html`
  - and others (search for `window.__SUPABASE_CONFIG__`).

Quiz Builder

- Dedicated project for Quiz Builder:
  - Ref: `aepoufmhrmmqyejcywgl`
  - URL: `https://aepoufmhrmmqyejcywgl.supabase.co`
  - Functions: `https://aepoufmhrmmqyejcywgl.functions.supabase.co`
  - Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlcG91Zm1ocm1tcXllamN5d2dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NzYzNTcsImV4cCI6MjA3NzQ1MjM1N30.5mgtvvD7LpCC62C_AmLQA474Uhf-61cB3NgYWB1a5tg`
- Provide on pages with `window.__QB_SUPABASE_CONFIG__ = { url, anonKey }`. If omitted, pages fall back to the global CBT config `window.__SUPABASE_CONFIG__`.

How to change it

1. Update the global config script on each HTML page (or inject at deploy time):
   ```html
   <script>
     window.__SUPABASE_CONFIG__ = {
       url: 'https://<YOUR-REF>.supabase.co',
       anonKey: '<YOUR-ANON-KEY>',
     };
   </script>
   ```
2. For Quiz Builder, optionally provide a different project:
   ```html
   <script>
     window.__QB_SUPABASE_CONFIG__ = {
       url: 'https://<YOUR-REF>.supabase.co',
       anonKey: '<YOUR-ANON-KEY>',
     };
   </script>
   ```

Notes

- Rotating the anon key requires updating the inline `anonKey` values.
- Edge functions use the same project ref; their base URL is the `functions.supabase.co` variant above.
