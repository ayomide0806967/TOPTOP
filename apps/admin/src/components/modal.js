let modalState = null;

function getModalElements() {
  const container = document.getElementById('modal-container');
  if (!container) {
    throw new Error('Modal container element not found.');
  }
  const overlay = container.querySelector('.modal-bg');
  const content = document.getElementById('modal-content');
  return { container, overlay, content };
}

export function closeModal() {
  if (!modalState) return;
  const { container, closeButton } = modalState;
  closeButton?.removeEventListener('click', closeModal);
  document.removeEventListener('keydown', modalState.keyHandler);
  modalState.content.innerHTML = '';
  container.classList.add('hidden');
  container.classList.remove('flex');
  container.classList.remove('items-center');
  container.classList.remove('justify-center');
  modalState = null;
}

export function openModal({ title, widthClass = 'max-w-3xl', render }) {
  if (modalState) {
    closeModal();
  }
  const { container, overlay, content } = getModalElements();
  container.classList.remove('hidden');
  container.classList.add('flex', 'items-center', 'justify-center');
  overlay?.setAttribute('aria-hidden', 'true');
  overlay?.classList.add('z-0');

  content.innerHTML = `
    <div class="pointer-events-none relative z-10 flex max-h-[90vh] w-full justify-center px-4">
      <div data-role="modal-root" role="dialog" aria-modal="true" class="pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl ${widthClass}">
        <header class="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <h2 class="text-lg font-semibold text-gray-900">${title}</h2>
          <button type="button" data-role="modal-close" class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2">
            <span class="sr-only">Close</span>
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
            </svg>
          </button>
        </header>
        <div data-role="modal-body" class="px-6 py-5 overflow-y-auto"></div>
        <footer data-role="modal-footer" class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-white"></footer>
      </div>
    </div>
  `;

  const body = content.querySelector('[data-role="modal-body"]');
  const footer = content.querySelector('[data-role="modal-footer"]');
  const closeButton = content.querySelector('[data-role="modal-close"]');
  const dialogRoot = content.querySelector('[data-role="modal-root"]');

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', keyHandler);
  closeButton?.addEventListener('click', closeModal);
  dialogRoot?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  modalState = { container, overlay, content, closeButton, keyHandler };

  if (typeof render === 'function') {
    render({ body, footer, close: closeModal });
  }
}
