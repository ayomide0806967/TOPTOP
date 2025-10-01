const manifestHref = 'manifest.webmanifest';
if (!document.querySelector('link[rel="manifest"]')) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestHref;
  document.head.appendChild(link);
}

const themeColor = '#0f172a';
if (!document.querySelector('meta[name="theme-color"]')) {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = themeColor;
  document.head.appendChild(meta);
}

function notifyUpdate() {
  const id = 'admin-pwa-update';
  if (document.getElementById(id)) return;
  const banner = document.createElement('div');
  banner.id = id;
  banner.style.position = 'fixed';
  banner.style.left = '50%';
  banner.style.bottom = '24px';
  banner.style.transform = 'translateX(-50%)';
  banner.style.zIndex = '9999';
  banner.style.background = 'linear-gradient(135deg, #2563eb, #7c3aed)';
  banner.style.color = '#ffffff';
  banner.style.padding = '10px 18px';
  banner.style.borderRadius = '999px';
  banner.style.boxShadow = '0 16px 28px rgba(79, 70, 229, 0.35)';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '10px';
  banner.innerHTML = `
    <span style="font-weight:600;">New version available</span>
    <button type="button" style="background:rgba(255,255,255,0.2);border:none;padding:6px 14px;border-radius:999px;color:#fff;font-weight:600;cursor:pointer;">Reload</button>
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
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate();
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[Admin PWA] registration failed', error);
      });
  });
}
