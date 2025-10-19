const MANIFEST_HREF = 'manifest.webmanifest';
const MANIFEST_SELECTOR = 'link[rel="manifest"]';
const THEME_COLOR = '#0f766e';
const EXAM_ROUTE_KEYWORDS = ['exam-face'];

function removeManifestLinks() {
  document.querySelectorAll(MANIFEST_SELECTOR).forEach((link) => {
    link.remove();
  });
}

function removeThemeMeta() {
  const existingMeta = document.querySelector('meta[name="theme-color"]');
  if (existingMeta) {
    existingMeta.remove();
  }
}

function ensureManifestLink() {
  if (document.querySelector(MANIFEST_SELECTOR)) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = MANIFEST_HREF;
  document.head.appendChild(link);
}

function ensureThemeMeta() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR;
}

function notifyUpdate() {
  const bannerId = 'pwa-update-banner';
  if (document.getElementById(bannerId)) return;
  const banner = document.createElement('div');
  banner.id = bannerId;
  banner.style.position = 'fixed';
  banner.style.left = '50%';
  banner.style.bottom = '24px';
  banner.style.transform = 'translateX(-50%)';
  banner.style.zIndex = '9999';
  banner.style.background = 'linear-gradient(135deg, #0ea5e9, #14b8a6)';
  banner.style.color = '#ffffff';
  banner.style.padding = '12px 20px';
  banner.style.borderRadius = '999px';
  banner.style.boxShadow = '0 16px 28px rgba(15, 118, 110, 0.25)';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '12px';
  banner.innerHTML = `
    <span style="font-weight:600;">Update ready</span>
    <button type="button" style="background:rgba(255,255,255,0.18);color:#ffffff;border:none;padding:8px 14px;border-radius:999px;font-weight:600;cursor:pointer;">
      Reload
    </button>
  `;
  banner.querySelector('button').onclick = () => window.location.reload();
  document.body.appendChild(banner);
}

async function disablePwa() {
  if (!('serviceWorker' in navigator)) {
    console.info('[PWA] Service worker API unavailable; nothing to disable.');
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        try {
          await registration.unregister();
        } catch (error) {
          console.warn('[PWA] Failed to unregister service worker', error);
        }
      })
    );
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SKIP_WAITING_AND_EXIT',
      });
    }
    console.info('[PWA] Service workers unregistered (non-exam context).');
  } catch (error) {
    console.warn('[PWA] Unable to fetch registrations for teardown', error);
  }
}

function enableExamPwa() {
  ensureManifestLink();
  ensureThemeMeta();

  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Service worker API unavailable; exam mode fallback.');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .then((registration) => {
        if (!registration) return;
        if (registration.waiting) {
          notifyUpdate();
          return;
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              notifyUpdate();
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] Exam service worker registration failed', error);
      });
  });
}

const isExamExperience = EXAM_ROUTE_KEYWORDS.some((keyword) =>
  window.location.pathname.includes(keyword)
);

if (isExamExperience) {
  enableExamPwa();
} else {
  removeManifestLinks();
  removeThemeMeta();
  disablePwa();
}
