const STATIC_CACHE = 'admin-static-v1';
const RUNTIME_CACHE = 'admin-runtime-v1';
const BASE_URL = self.location.href.replace(/service-worker\.js$/, '');

const APP_SHELL = [
  './',
  './dashboard.html',
  './offline.html',
  './manifest.webmanifest',
  './src/pwa-bootstrap.js',
  './src/main.js',
  './src/components/modal.js',
  './src/components/toast.js',
  './src/state/appState.js',
  './src/utils/scheduleHealth.js',
  './src/views/index.js',
  './src/views/dashboard.js',
  './src/views/departments.js',
  './src/views/questions.js',
  './src/views/quizBuilder.js',
  './src/views/studyCycles.js',
  './src/views/subscriptions.js',
  './src/views/users.js',
  './src/views/freeQuizzes.js',
  './src/services/authService.js',
  './src/services/dataService.js',
  '../assets/academicnightingale-logo.jpg',
  '../assets/academicnightingale-icon-32.png',
  '../assets/academicnightingale-icon-192.png',
  '../assets/academicnightingale-icon-512.png',
  '../assets/tailwind.css',
];

const SHELL_SET = new Set(
  APP_SHELL.map((path) => new URL(path, BASE_URL).href)
);
const OFFLINE_URL = new URL('./offline.html', BASE_URL).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const JSDELIVR_HOST = 'cdn.jsdelivr.net';
const SUPABASE_HOST_FRAGMENT = 'supabase.co';

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const networkFetch = fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches
          .open(RUNTIME_CACHE)
          .then((cache) => cache.put(request, clone))
          .catch(() => {});
        return response;
      })
      .catch(() => cached);
    return cached ? Promise.resolve(cached) : networkFetch;
  });
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches
          .open(RUNTIME_CACHE)
          .then((cache) => cache.put(request, clone))
          .catch(() => {});
        return response;
      })
      .catch(() => cached);
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const clone = response.clone();
      caches
        .open(RUNTIME_CACHE)
        .then((cache) => cache.put(request, clone))
        .catch(() => {});
      return response;
    })
    .catch(() => caches.match(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, clone))
            .catch(() => {});
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (SHELL_SET.has(request.url)) {
      event.respondWith(cacheFirst(request));
      return;
    }
    if (accept.includes('text/html')) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, clone))
              .catch(() => {});
            return response;
          })
          .catch(() =>
            caches
              .match(request)
              .then((cached) => cached || caches.match(OFFLINE_URL))
          )
      );
      return;
    }
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname.includes(JSDELIVR_HOST)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname.includes(SUPABASE_HOST_FRAGMENT)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
