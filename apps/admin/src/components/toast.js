const TOAST_CONTAINER_ID = 'admin-toast-container';

function ensureContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-3';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, { type = 'info', duration = 4000 } = {}) {
  if (!message) return;
  const container = ensureContainer();
  const toast = document.createElement('div');
  const palette = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-900 text-white',
    warning: 'bg-amber-500 text-white',
  };
  toast.className = `px-4 py-2 text-sm rounded-md shadow-lg transition-opacity duration-300 ${palette[type] || palette.info}`;
  toast.textContent = message;
  container.appendChild(toast);

  const timeout = Math.max(1000, duration);
  const hideDelay = timeout - 300;

  const removeToast = () => {
    toast.classList.add('opacity-0');
    const handle = setTimeout(() => {
      toast.remove();
      clearTimeout(handle);
      if (!container.children.length) {
        container.remove();
      }
    }, 300);
  };

  const hideTimer = setTimeout(removeToast, hideDelay);

  toast.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
  });
  toast.addEventListener('mouseleave', () => {
    setTimeout(removeToast, 500);
  });
}
