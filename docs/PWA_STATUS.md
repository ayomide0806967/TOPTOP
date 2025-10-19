# PWA Status (Exam Only)

**Updated:** December 24, 2025  
**Owner:** Learner web app

The Progressive Web App layer now activates only on the exam experience (`exam-face` page). All other learner surfaces unload the manifest/theme metadata and unregister service workers to avoid stale caches.

## Runtime behaviour

- `apps/learner/src/pwa-bootstrap.js` inspects `window.location.pathname` for `exam-face`.
- On exam pages, it injects `manifest.webmanifest`, sets the teal theme color, and registers `service-worker.js` (with an update banner if a new worker installs).
- On all non-exam pages, it removes manifest/theme tags and unregisters any existing service workers.

This keeps offline/offline resilience focused on the exam flow without affecting the rest of the learner dashboard.
