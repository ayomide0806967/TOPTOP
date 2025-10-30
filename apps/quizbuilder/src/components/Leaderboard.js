/**
 * Leaderboard Component
 * Live ranking display for quiz participants
 */

import { getSupabaseClient } from '../../../shared/supabaseClient.js';
import { authService } from '../../../shared/auth.js';
import { showToast } from './toast.js';

export class Leaderboard {
  constructor(options = {}) {
    this.examId = options.examId;
    this.container = options.container;
    this.showFullList = options.showFullList || false;
    this.maxDisplay = options.maxDisplay || 10;
    this.realtimeChannel = null;
    this.rankings = [];
    this.currentUser = null;
    this.isParticipant = options.isParticipant || false;
  }

  /**
   * Initialize the leaderboard
   */
  async init() {
    try {
      await this.loadInitialRankings();
      this.setupRealtimeUpdates();
      this.render();
    } catch (error) {
      console.error('[Leaderboard] Failed to initialize:', error);
      this.renderError();
    }
  }

  /**
   * Load initial rankings
   */
  async loadInitialRankings() {
    const client = await getSupabaseClient();

    let query = client
      .from('exam_leaderboard_view')
      .select('*')
      .eq('exam_id', this.examId)
      .order('score', { ascending: false })
      .order('completed_at', { ascending: true });

    if (!this.showFullList) {
      query = query.limit(this.maxDisplay);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to load rankings: ${error.message}`);
    }

    this.rankings = data || [];

    // Find current user if participant
    if (this.isParticipant) {
      this.currentUser = authService.getCurrentUser();
      if (this.currentUser) {
        const userRanking = this.rankings.find(r => r.user_id === this.currentUser.id);
        if (!userRanking && this.rankings.length >= this.maxDisplay) {
          // Load current user's ranking if not in top list
          await this.loadCurrentUserRanking();
        }
      }
    }
  }

  /**
   * Load current user's ranking (if not in top list)
   */
  async loadCurrentUserRanking() {
    if (!this.currentUser) return;

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('exam_leaderboard_view')
      .select('*')
      .eq('exam_id', this.examId)
      .eq('user_id', this.currentUser.id)
      .single();

    if (!error && data) {
      this.currentUserRanking = data;
    }
  }

  /**
   * Setup real-time updates
   */
  setupRealtimeUpdates() {
    this.setupRealtimeChannel();
  }

  /**
   * Setup real-time subscription
   */
  setupRealtimeChannel() {
    // Clean up existing channel
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
    }

    // This would connect to a Supabase real-time channel
    // For now, we'll simulate with polling
    this.startPolling();
  }

  /**
   * Start polling for updates (fallback for real-time)
   */
  startPolling() {
    this.pollingInterval = setInterval(async () => {
      try {
        await this.loadInitialRankings();
        this.render();
      } catch (error) {
        console.error('[Leaderboard] Failed to update rankings:', error);
      }
    }, 5000); // Update every 5 seconds
  }

  /**
   * Render the leaderboard
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = this.renderLeaderboard();
    this.bindEvents();
  }

  /**
   * Render leaderboard HTML
   */
  renderLeaderboard() {
    const hasRankings = this.rankings.length > 0;

    return `
      <div class="leaderboard bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <img src="./assets/academicnightingale-logo.jpg" alt="Academic Nightingale" class="h-8 w-8 rounded-lg object-cover shadow-sm" />
              <h3 class="text-lg font-semibold text-white">Live Rankings</h3>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span class="text-xs text-white">Live</span>
              </div>
              ${!this.showFullList ? `
                <button
                  class="text-xs text-white hover:text-cyan-100 transition-colors"
                  onclick="leaderboard.toggleFullList()"
                >
                  View All
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        ${hasRankings ? this.renderRankingsList() : this.renderEmptyState()}

        ${this.currentUserRanking && !this.showFullList ? this.renderCurrentUserRanking() : ''}
      </div>
    `;
  }

  /**
   * Render rankings list
   */
  renderRankingsList() {
    return `
      <div class="p-4 space-y-2">
        ${this.rankings.map((ranking, index) => this.renderRankingItem(ranking, index + 1)).join('')}
      </div>
    `;
  }

  /**
   * Render a single ranking item
   */
  renderRankingItem(ranking, position) {
    const isCurrentUser = this.currentUser && ranking.user_id === this.currentUser.id;
    const medalColors = {
      1: 'text-yellow-500',
      2: 'text-gray-400',
      3: 'text-amber-600'
    };

    return `
      <div class="flex items-center gap-4 p-3 rounded-lg ${isCurrentUser ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50'} transition-colors">
        <div class="flex items-center justify-center w-8 h-8">
          ${position <= 3 ? `
            <svg class="h-6 w-6 ${medalColors[position]}" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          ` : `
            <span class="text-sm font-medium text-slate-600">${position}</span>
          `}
        </div>

        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
            ${ranking.user_name ? ranking.user_name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-900 truncate">
              ${ranking.user_name || 'Anonymous'}
              ${isCurrentUser ? '<span class="text-xs text-cyan-600 ml-2">(You)</span>' : ''}
            </p>
            <p class="text-xs text-slate-500">
              Completed ${this.formatDate(ranking.completed_at)}
            </p>
          </div>
        </div>

        <div class="text-right">
          <p class="text-lg font-bold text-slate-900">${Math.round(ranking.score)}%</p>
          <p class="text-xs text-slate-500">${ranking.correct_answers}/${ranking.total_questions}</p>
        </div>
      </div>
    `;
  }

  /**
   * Render current user ranking (if not in top list)
   */
  renderCurrentUserRanking() {
    if (!this.currentUserRanking) return '';

    return `
      <div class="border-t border-slate-200 p-4 bg-cyan-50">
        <div class="flex items-center gap-4">
          <div class="text-sm font-medium text-cyan-700">
            #${this.currentUserRanking.rank || this.rankings.length + 1}
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-slate-900">
              Your Position
            </p>
          </div>
          <div class="text-right">
            <p class="text-lg font-bold text-cyan-600">${Math.round(this.currentUserRanking.score)}%</p>
            <p class="text-xs text-slate-500">${this.currentUserRanking.correct_answers}/${this.currentUserRanking.total_questions}</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="p-8 text-center">
        <svg class="mx-auto h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-slate-900">No rankings yet</h3>
        <p class="mt-2 text-sm text-slate-500">Complete the quiz to see rankings here!</p>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderError() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="bg-white rounded-xl border border-rose-200 shadow-sm p-6">
        <div class="text-center">
          <svg class="mx-auto h-12 w-12 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-slate-900">Unable to load rankings</h3>
          <p class="mt-2 text-sm text-slate-500">Please check your connection and try again.</p>
          <button
            class="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            onclick="leaderboard.refresh()"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 2m-15.356 2H15a8 8 0 018 8V8a8 8 0 00-8-8z" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Toggle between top 10 and full list
   */
  toggleFullList() {
    this.showFullList = !this.showFullList;
    this.maxDisplay = this.showFullList ? 1000 : 10;
    this.refresh();
  }

  /**
   * Refresh rankings
   */
  async refresh() {
    try {
      await this.loadInitialRankings();
      this.render();
    } catch (error) {
      console.error('[Leaderboard] Failed to refresh:', error);
      showToast('Failed to refresh rankings', { type: 'error' });
    }
  }

  /**
   * Bind events
   */
  bindEvents() {
    // Events are bound inline for simplicity
    // Could be moved here for better organization
  }

  /**
   * Update rankings with new data
   */
  updateRankings(newRankings) {
    this.rankings = newRankings;
    this.render();
  }

  /**
   * Add new ranking
   */
  addRanking(ranking) {
    // Insert in correct position
    const insertIndex = this.rankings.findIndex(r => r.score < ranking.score);
    if (insertIndex === -1) {
      this.rankings.push(ranking);
    } else {
      this.rankings.splice(insertIndex, 0, ranking);
    }

    // Keep only top rankings if not showing full list
    if (!this.showFullList) {
      this.rankings = this.rankings.slice(0, this.maxDisplay);
    }

    this.render();
  }

  /**
   * Update existing ranking
   */
  updateRanking(userId, updates) {
    const index = this.rankings.findIndex(r => r.user_id === userId);
    if (index !== -1) {
      this.rankings[index] = { ...this.rankings[index], ...updates };
      // Re-sort and re-render
      this.rankings.sort((a, b) => b.score - a.score);
      this.render();
    }
  }

  /**
   * Format date helper
   */
  formatDate(dateString) {
    if (!dateString) return 'Just now';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  /**
   * Destroy the leaderboard
   */
  destroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
    }
  }
}

// Export for global access
window.Leaderboard = Leaderboard;