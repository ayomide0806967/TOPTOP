const manifestSelector = 'link[rel="manifest"]';
document.querySelectorAll(manifestSelector).forEach((link) => {
  link.remove();
});

const themeMeta = document.querySelector('meta[name="theme-color"]');
if (themeMeta) {
  themeMeta.remove();
}

const disablePwa = async () => {
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
    console.info('[PWA] Service workers unregistered (temporary disable).');
  } catch (error) {
    console.warn('[PWA] Unable to fetch registrations for teardown', error);
  }
};

disablePwa();
