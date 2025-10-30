/**
 * Blueprint Manager Component
 * Handles quiz blueprint operations
 */

import { quizBuilderService, QuizBuilderServiceError } from '../../admin/src/services/quizBuilderService.js';
import { showToast } from './toast.js';

export class BlueprintManager {
  constructor(options = {}) {
    this.onBlueprintUpdate = options.onBlueprintUpdate;
    this.blueprints = [];
  }

  /**
   * Load all blueprints
   */
  async loadBlueprints() {
    try {
      this.blueprints = await quizBuilderService.listBlueprints();
      return this.blueprints;
    } catch (error) {
      console.error('[BlueprintManager] Failed to load blueprints:', error);
      showToast('Failed to load quizzes', { type: 'error' });
      return [];
    }
  }

  /**
   * Create a new blueprint
   */
  async createBlueprint(data) {
    try {
      const blueprint = await quizBuilderService.createBlueprint(data);
      this.blueprints.unshift(blueprint);
      showToast('Quiz created successfully', { type: 'success' });
      if (this.onBlueprintUpdate) this.onBlueprintUpdate();
      return blueprint;
    } catch (error) {
      console.error('[BlueprintManager] Failed to create blueprint:', error);
      showToast(error.message || 'Failed to create quiz', { type: 'error' });
      throw error;
    }
  }

  /**
   * Update a blueprint
   */
  async updateBlueprint(id, changes) {
    try {
      const blueprint = await quizBuilderService.updateBlueprint(id, changes);
      const index = this.blueprints.findIndex(b => b.id === id);
      if (index !== -1) {
        this.blueprints[index] = blueprint;
      }
      showToast('Quiz updated successfully', { type: 'success' });
      if (this.onBlueprintUpdate) this.onBlueprintUpdate();
      return blueprint;
    } catch (error) {
      console.error('[BlueprintManager] Failed to update blueprint:', error);
      showToast(error.message || 'Failed to update quiz', { type: 'error' });
      throw error;
    }
  }

  /**
   * Duplicate a blueprint
   */
  async duplicateBlueprint(id) {
    try {
      const blueprint = await quizBuilderService.duplicateBlueprint(id);
      this.blueprints.unshift(blueprint);
      showToast('Quiz duplicated successfully', { type: 'success' });
      if (this.onBlueprintUpdate) this.onBlueprintUpdate();
      return blueprint;
    } catch (error) {
      console.error('[BlueprintManager] Failed to duplicate blueprint:', error);
      showToast('Failed to duplicate quiz', { type: 'error' });
      throw error;
    }
  }

  /**
   * Archive a blueprint
   */
  async archiveBlueprint(id) {
    if (!confirm('Are you sure you want to archive this quiz? It can be restored later.')) {
      return;
    }

    try {
      await quizBuilderService.archiveBlueprint(id);
      const index = this.blueprints.findIndex(b => b.id === id);
      if (index !== -1) {
        this.blueprints[index].status = 'archived';
      }
      showToast('Quiz archived', { type: 'info' });
      if (this.onBlueprintUpdate) this.onBlueprintUpdate();
    } catch (error) {
      console.error('[BlueprintManager] Failed to archive blueprint:', error);
      showToast('Failed to archive quiz', { type: 'error' });
      throw error;
    }
  }

  /**
   * Get blueprint by ID
   */
  getBlueprint(id) {
    return this.blueprints.find(b => b.id === id);
  }

  /**
   * Get blueprints by status
   */
  getBlueprintsByStatus(status) {
    return this.blueprints.filter(b => b.status === status);
  }

  /**
   * Get published blueprints
   */
  getPublishedBlueprints() {
    return this.getBlueprintsByStatus('published');
  }

  /**
   * Get draft blueprints
   */
  getDraftBlueprints() {
    return this.getBlueprintsByStatus('draft');
  }

  /**
   * Get archived blueprints
   */
  getArchivedBlueprints() {
    return this.getBlueprintsByStatus('archived');
  }

  /**
   * Search blueprints
   */
  searchBlueprints(query) {
    if (!query) return this.blueprints;

    const searchTerm = query.toLowerCase();
    return this.blueprints.filter(blueprint =>
      blueprint.title?.toLowerCase().includes(searchTerm) ||
      blueprint.description?.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Render blueprint cards
   */
  renderBlueprints(container, blueprints = this.blueprints) {
    if (!container) return;

    if (blueprints.length === 0) {
      container.innerHTML = this.renderEmptyState();
      return;
    }

    container.innerHTML = blueprints.map(blueprint => this.renderBlueprintCard(blueprint)).join('');
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="flex flex-col items-center justify-center text-center gap-3 py-6">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
          </svg>
        </div>
        <p class="text-sm text-slate-500 max-w-xs">No quizzes found. Create your first quiz to get started.</p>
        <button class="mt-2 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
          </svg>
          Create Quiz
        </button>
      </div>
    `;
  }

  /**
   * Render a single blueprint card
   */
  renderBlueprintCard(blueprint) {
    const statusTone = blueprint.status === 'published'
      ? 'published'
      : blueprint.status === 'archived'
        ? 'archived'
        : 'draft';

    return `
      <article class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6">
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 class="text-base font-semibold text-slate-900">${blueprint.title || 'Untitled quiz'}</h3>
              <p class="text-sm text-slate-500 mt-1 line-clamp-2">${blueprint.description || 'No description provided yet.'}</p>
            </div>
            ${this.renderBadge(blueprint.status || 'draft', statusTone)}
          </div>
          <dl class="grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-4">
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Questions</dt>
              <dd class="mt-0.5 font-medium text-slate-900">${blueprint.total_questions ?? 0}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Duration</dt>
              <dd class="mt-0.5 font-medium text-slate-900">
                ${blueprint.estimated_duration_seconds
                  ? `${Math.round(blueprint.estimated_duration_seconds / 60)} mins`
                  : 'Unset'}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Updated</dt>
              <dd class="mt-0.5">${this.formatDate(blueprint.updated_at)}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Owner</dt>
              <dd class="mt-0.5">${blueprint.owner_id ? `User ${blueprint.owner_id.slice(0, 6)}…` : 'Unknown'}</dd>
            </div>
          </dl>
          <div class="flex flex-wrap gap-2">
            <button
              class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              onclick="blueprintManager.editBlueprint('${blueprint.id}')"
            >
              Edit builder
            </button>
            <button
              class="text-sm font-medium text-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onclick="blueprintManager.duplicateBlueprint('${blueprint.id}')"
            >
              Duplicate
            </button>
            ${blueprint.status !== 'archived' ? `
              <button
                class="text-sm font-medium text-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                onclick="blueprintManager.archiveBlueprint('${blueprint.id}')"
              >
                Archive
              </button>
            ` : ''}
            <button
              class="text-sm font-medium text-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onclick="blueprintManager.viewAnalytics('${blueprint.id}')"
            >
              View analytics
            </button>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Render status badge
   */
  renderBadge(label, tone = 'default') {
    const palette = {
      default: 'bg-slate-100 text-slate-700',
      draft: 'bg-amber-100 text-amber-700',
      published: 'bg-emerald-100 text-emerald-700',
      live: 'bg-blue-100 text-blue-700',
      archived: 'bg-slate-200 text-slate-500',
      warning: 'bg-amber-100 text-amber-700',
      danger: 'bg-rose-100 text-rose-700',
    };
    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette[tone] || palette.default}">${label}</span>`;
  }

  /**
   * Format date helper
   */
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Edit blueprint (redirect to builder)
   */
  editBlueprint(id) {
    window.location.href = `../learner/exam-builder.html?blueprint=${id}`;
  }

  /**
   * View analytics (placeholder)
   */
  viewAnalytics(id) {
    showToast('Analytics view coming soon!', { type: 'info' });
  }
}

// Export for global access
window.BlueprintManager = BlueprintManager;