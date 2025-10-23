/**
 * Loading State Manager
 * Provides consistent loading indicators across the application
 */

class LoadingManager {
  constructor() {
    this.activeLoaders = new Set();
    this.globalLoaderId = 'global-loader';
  }

  createGlobalLoader() {
    if (document.getElementById(this.globalLoaderId)) return;

    const loader = document.createElement('div');
    loader.id = this.globalLoaderId;
    loader.className =
      'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 hidden';
    loader.innerHTML = `
      <div class="bg-white rounded-lg p-6 shadow-xl">
        <div class="flex flex-col items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-4 border-cyan-600 border-t-transparent"></div>
          <p class="mt-4 text-gray-700 font-medium" id="global-loader-text">Loading...</p>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
  }

  showGlobalLoader(message = 'Loading...') {
    this.createGlobalLoader();
    const loader = document.getElementById(this.globalLoaderId);
    const text = document.getElementById('global-loader-text');

    if (loader) {
      loader.classList.remove('hidden');
      if (text) text.textContent = message;
    }
  }

  hideGlobalLoader() {
    const loader = document.getElementById(this.globalLoaderId);
    if (loader) {
      loader.classList.add('hidden');
    }
  }

  createInlineLoader(container, message = 'Loading...') {
    const loaderId = `loader-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const loader = document.createElement('div');
    loader.id = loaderId;
    loader.className = 'flex items-center justify-center p-8';
    loader.innerHTML = `
      <div class="text-center">
        <div class="inline-flex items-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-gray-700">${message}</span>
        </div>
      </div>
    `;

    if (container) {
      container.innerHTML = '';
      container.appendChild(loader);
    }

    this.activeLoaders.add(loaderId);
    return loaderId;
  }

  removeLoader(loaderId) {
    const loader = document.getElementById(loaderId);
    if (loader) {
      loader.remove();
    }
    this.activeLoaders.delete(loaderId);
  }

  createSkeletonLoader(container, type = 'card', count = 3) {
    const skeletons = {
      card: `
        <div class="bg-white rounded-lg p-6 shadow-sm animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div class="space-y-3">
            <div class="h-3 bg-gray-200 rounded"></div>
            <div class="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      `,
      table: `
        <tr class="animate-pulse">
          <td class="px-4 py-3"><div class="h-4 bg-gray-200 rounded w-20"></div></td>
          <td class="px-4 py-3"><div class="h-4 bg-gray-200 rounded w-32"></div></td>
          <td class="px-4 py-3"><div class="h-4 bg-gray-200 rounded w-24"></div></td>
          <td class="px-4 py-3"><div class="h-4 bg-gray-200 rounded w-16"></div></td>
        </tr>
      `,
      question: `
        <div class="bg-white rounded-lg p-6 shadow-sm animate-pulse">
          <div class="h-5 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div class="h-4 bg-gray-200 rounded w-full mb-4"></div>
          <div class="space-y-3">
            <div class="flex items-start gap-3">
              <div class="w-4 h-4 bg-gray-200 rounded-full mt-1"></div>
              <div class="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-4 h-4 bg-gray-200 rounded-full mt-1"></div>
              <div class="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-4 h-4 bg-gray-200 rounded-full mt-1"></div>
              <div class="h-3 bg-gray-200 rounded w-4/5"></div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-4 h-4 bg-gray-200 rounded-full mt-1"></div>
              <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      `,
    };

    if (container) {
      container.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = skeletons[type] || skeletons.card;
        container.appendChild(wrapper.firstElementChild);
      }
    }
  }

  async withLoader(asyncFunction, options = {}) {
    const {
      showGlobal = false,
      message = 'Loading...',
      container = null,
      minDuration = 300,
    } = options;

    const startTime = Date.now();
    let loaderId = null;

    try {
      if (showGlobal) {
        this.showGlobalLoader(message);
      } else if (container) {
        loaderId = this.createInlineLoader(container, message);
      }

      const result = await asyncFunction();

      // Ensure minimum duration for better UX
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDuration - elapsed)
        );
      }

      return result;
    } finally {
      if (showGlobal) {
        this.hideGlobalLoader();
      } else if (loaderId) {
        this.removeLoader(loaderId);
      }
    }
  }

  clearAllLoaders() {
    this.hideGlobalLoader();
    this.activeLoaders.forEach((loaderId) => this.removeLoader(loaderId));
  }
}

// Export singleton instance
export const loadingManager = new LoadingManager();
