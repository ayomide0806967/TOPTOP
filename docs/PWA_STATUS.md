# PWA Status (Temporary Disable)

**Updated:** December 24, 2025  
**Owner:** Learner web app

We temporarily disabled the Progressive Web App layer to simplify debugging and avoid stale cache issues while the community chat is being refactored.

## What changed

- `apps/learner/src/pwa-bootstrap.js` now removes any manifest/theme metadata and unregisters service workers instead of registering a new one.
- All existing pages still import `pwa-bootstrap.js`, but the script exits early after the teardown. No service workers are left controlling the scope.

## How to re-enable later

1. Restore the previous registration logic (see git history for `pwa-bootstrap.js`).
2. Re-introduce the manifest (`manifest.webmanifest`) and theme-color meta tag if needed.
3. Deploy and prompt users to refresh so the new worker can take control.

> ℹ️ Because we unregister everything on load, there are no offline capabilities or install prompts until the script is reverted.
