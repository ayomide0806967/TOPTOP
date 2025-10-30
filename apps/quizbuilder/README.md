# Quiz Builder (Consolidated Source)

This folder contains a consolidated copy of the Quiz Builder front‑end for simpler hosting and maintenance.

## Contents

- `quiz-builder-start.html` — pre‑landing stepper (Overview → Choose Plan → Sign in)
- `login.html` — QB login UI (disabled on this branch)
- `instructor.html` — instructor dashboard shell
- `assets/` — CSS, favicon, logo
- `src/` — page scripts
- `shared/` — shared modules (auth, router, supabase client, gating)

The same structure is packaged for deployment under `dist/quizbuilder/`.

## Build (Vite + TypeScript)

This folder can be built as a static multi‑page app using Vite. The config preserves existing HTML entries and outputs to `dist/quizbuilder/`.

1) Dev dependencies (from repo root):
- npm i -D vite typescript @types/node

2) Build commands:
- Dev server: npx vite --config apps/quizbuilder/vite.config.ts
- Production build: npx vite build --config apps/quizbuilder/vite.config.ts

Notes:
- TypeScript is enabled with `allowJs` + `checkJs` for gradual migration.
- Tailwind CSS is currently linked via `assets/tailwind.css`. You can switch to Vite/PostCSS later if desired.

## PWA Assets

- `public/manifest.webmanifest` and `public/service-worker.js` are copied to the build output root via Vite `publicDir`.
- `src/pwa-bootstrap.js` injects the manifest tag and registers the service worker.

## App & Subscription Flow

See `docs/QUIZ_BUILDER_FLOW.md` for a full explanation of flows, auth, subscriptions (seat‑based), and deployment.

## Current Defaults

- Auth is disabled in this branch. Buttons are non‑interactive with a message.
- To enable auth later, remove the temporary guards in `src/quizBuilderStart.js` and restore form interactivity in `login.html`. Then deploy.
