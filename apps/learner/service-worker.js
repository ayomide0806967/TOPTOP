const STATIC_CACHE = 'learner-static-v1';
const RUNTIME_CACHE = 'learner-runtime-v1';
const FONT_CACHE = 'learner-font-v1';

const APP_SHELL = [
  './',
  './index.html',
  './about-us.html',
  './admin-board.html',
  './blog.html',
  './careers.html',
  './contact.html',
  './exam-builder.html',
  './exam-face.html',
  './forgot-password.html',
  './help-center.html',
  './login.html',
  './privacy-policy.html',
  './registration-after-payement.html',
  './registration-after-payment.html',
  './registration-before-payment.html',
  './reset-password.html',
  './result-face.html',
  './resume-registration.html',
  './subscription-plans.html',
  './terms-of-service.html',
  './offline.html',
  './manifest.webmanifest',
  './shared/footer-content.html',
  './src/pwa-bootstrap.js',
  './src/auth.js',
  './src/authGuard.js',
  './src/dashboard.js',
  './src/dashboard.bak.js',
  './src/exam-face.js',
  './src/forgot-password.js',
  './src/pricing.js',
  './src/registration-after.js',
  './src/registration-before.js',
  './src/reset-password.js',
  './src/result-face.js',
  './src/resume-registration.js',
  '../assets/academicnightingale-logo.jpg',
  '../assets/partnership.png'
];

const BASE_URL = self.location.href.replace(/service-worker\.js$/, '');
const SHELL_SET = new Set(APP_SHELL.map((path) => new URL(path, BASE_URL).href));
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
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, FONT_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const TAILWIND_HOST = 'cdn.tailwindcss.com';
const GOOGLE_FONTS_HOST = 'fonts.googleapis.com';
const GOOGLE_STATIC_HOST = 'fonts.gstatic.com';
const SUPABASE_HOST_FRAGMENT = 'supabase.co';

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => cached);
  });
}

function staleWhileRevalidate(request, cacheName = RUNTIME_CACHE) {
  return caches.match(request).then((cached) => {
    const fetchPromise = fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => cached);
    return cached ? Promise.resolve(cached) : fetchPromise;
  });
}

function networkFirst(request, fallback) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || fallback));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const acceptHeader = request.headers.get('accept') || '';
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (SHELL_SET.has(request.url)) {
      event.respondWith(cacheFirst(request));
      return;
    }

    if (acceptHeader.includes('text/html')) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          })
          .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)))
      );
      return;
    }

    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname.includes(TAILWIND_HOST)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname === GOOGLE_FONTS_HOST) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.hostname === GOOGLE_STATIC_HOST) {
    event.respondWith(cacheFirst(request));
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
