const manifestHref = 'manifest.webmanifest';
if (!document.querySelector('link[rel="manifest"]')) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestHref;
  document.head.appendChild(link);
}

const themeColor = '#0f766e';
if (!document.querySelector('meta[name="theme-color"]')) {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = themeColor;
  document.head.appendChild(meta);
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

if ('serviceWorker' in navigator) {
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
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate();
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] registration failed', error);
      });
  });
}
