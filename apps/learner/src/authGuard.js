import { getSupabaseClient } from '../../shared/supabaseClient.js';
import {
  deriveSessionFingerprint,
  storeSessionFingerprint,
  readSessionFingerprint,
  clearSessionFingerprint,
} from '../../shared/sessionFingerprint.js';

/**
 * Auth Guard Module
 * Ensures user authentication and provides session management
 */

class AuthGuard {
  constructor() {
    this.supabase = null;
    this.session = null;
    this.user = null;
    this.isInitialized = false;
    this.sessionMonitor = null;
  }

  startSessionMonitor() {
    if (this.sessionMonitor) {
      window.clearInterval(this.sessionMonitor);
    }
    this.sessionMonitor = window.setInterval(() => {
      this.validateActiveSession().catch((error) => {
        console.warn('[AuthGuard] Session validation check failed', error);
      });
    }, 30000);
  }

  stopSessionMonitor() {
    if (this.sessionMonitor) {
      window.clearInterval(this.sessionMonitor);
      this.sessionMonitor = null;
    }
  }

  async updateSessionFingerprint(session) {
    try {
      if (!session?.refresh_token || !this.supabase) return;
      const fingerprint = await deriveSessionFingerprint(session.refresh_token);
      if (!fingerprint) return;
      storeSessionFingerprint(fingerprint);
      const refreshedAtIso = session?.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : new Date().toISOString();
      const { error } = await this.supabase.rpc('sync_profile_session', {
        p_session_fingerprint: fingerprint,
        p_session_refreshed_at: refreshedAtIso,
      });
      if (error) {
        console.warn('[AuthGuard] Failed to sync session fingerprint', error);
      }
    } catch (error) {
      console.warn(
        '[AuthGuard] Unexpected error while syncing session fingerprint',
        error
      );
    }
  }

  async ensureSessionFingerprint() {
    if (!this.session) return null;
    let fingerprint = null;
    try {
      fingerprint = readSessionFingerprint();
    } catch (error) {
      console.warn(
        '[AuthGuard] Unable to read stored session fingerprint',
        error
      );
    }

    if (fingerprint) return fingerprint;

    try {
      if (!this.session.refresh_token) return null;
      fingerprint = await deriveSessionFingerprint(this.session.refresh_token);
      if (fingerprint) {
        storeSessionFingerprint(fingerprint);
      }
      return fingerprint;
    } catch (error) {
      console.warn('[AuthGuard] Failed to derive session fingerprint', error);
      return null;
    }
  }

  async validateActiveSession() {
    const fingerprint = await this.ensureSessionFingerprint();
    if (!fingerprint || !this.supabase) {
      return true;
    }

    try {
      const { data, error } = await this.supabase.rpc(
        'validate_profile_session',
        {
          p_session_fingerprint: fingerprint,
        }
      );
      if (error) {
        console.warn('[AuthGuard] validate_profile_session error', error);
        return true;
      }

      if (data?.valid === false) {
        clearSessionFingerprint();
        return false;
      }

      return true;
    } catch (error) {
      console.warn('[AuthGuard] Failed to validate session fingerprint', error);
      return true;
    }
  }

  async init() {
    if (this.isInitialized) return this.session;

    try {
      this.supabase = await getSupabaseClient();
      const {
        data: { session },
        error,
      } = await this.supabase.auth.getSession();

      if (error) {
        console.error('[AuthGuard] Failed to get session:', error);
        throw error;
      }

      this.session = session;
      this.user = session?.user || null;
      this.isInitialized = true;

      // Set up auth state listener
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.session = session;
        this.user = session?.user || null;

        // Handle auth events
        switch (event) {
          case 'SIGNED_OUT':
            this.stopSessionMonitor();
            clearSessionFingerprint();
            this.redirectToLogin();
            break;
          case 'SIGNED_IN':
            this.updateSessionFingerprint(session).catch((error) => {
              console.warn(
                '[AuthGuard] Failed to sync fingerprint after sign-in',
                error
              );
            });
            this.startSessionMonitor();
            break;
          case 'TOKEN_REFRESHED':
            console.log('[AuthGuard] Token refreshed successfully');
            this.updateSessionFingerprint(session).catch((error) => {
              console.warn(
                '[AuthGuard] Failed to sync fingerprint after refresh',
                error
              );
            });
            this.startSessionMonitor();
            break;
          case 'USER_UPDATED':
            console.log('[AuthGuard] User profile updated');
            break;
        }
      });

      return this.session;
    } catch (error) {
      console.error('[AuthGuard] Initialization failed:', error);
      throw error;
    }
  }

  async requireAuth(redirectUrl = 'login.html') {
    try {
      await this.init();

      if (!this.session || !this.user) {
        this.redirectToLogin(redirectUrl);
        return false;
      }

      // Check if session is expired
      const expiresAt = this.session.expires_at;
      if (expiresAt && new Date(expiresAt * 1000) < new Date()) {
        console.warn('[AuthGuard] Session expired, redirecting to login');
        this.redirectToLogin(redirectUrl);
        return false;
      }

      this.startSessionMonitor();

      const sessionValid = await this.validateActiveSession();
      if (!sessionValid) {
        console.warn(
          '[AuthGuard] Session fingerprint mismatch detected, signing out.'
        );
        // Store a message to display on the login page
        try {
          window.sessionStorage.setItem(
            'an.auth.logout_reason',
            'session_replaced'
          );
        } catch (e) {
          console.warn('[AuthGuard] Unable to store logout reason', e);
        }
        try {
          await this.supabase.auth.signOut();
        } catch (error) {
          console.warn(
            '[AuthGuard] Failed to sign out after fingerprint mismatch',
            error
          );
        }
        try {
          await this.supabase.rpc('sync_profile_session', {
            p_session_fingerprint: null,
          });
        } catch (rpcError) {
          console.warn(
            '[AuthGuard] Failed to clear session fingerprint after mismatch',
            rpcError
          );
        }
        clearSessionFingerprint();
        this.redirectToLogin(redirectUrl);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuthGuard] Auth check failed:', error);
      this.redirectToLogin(redirectUrl);
      return false;
    }
  }

  async requireRole(allowedRoles = ['learner']) {
    if (!(await this.requireAuth())) return false;

    try {
      const { data: profile, error } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', this.user.id)
        .single();

      if (error) {
        console.error('[AuthGuard] Failed to fetch user role:', error);
        return false;
      }

      if (!allowedRoles.includes(profile.role)) {
        console.warn('[AuthGuard] User role not authorized:', profile.role);
        this.showUnauthorized();
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuthGuard] Role check failed:', error);
      return false;
    }
  }

  async signOut() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;

      this.stopSessionMonitor();
      try {
        await this.supabase.rpc('sync_profile_session', {
          p_session_fingerprint: null,
        });
      } catch (rpcError) {
        console.warn(
          '[AuthGuard] Failed to clear profile session fingerprint on sign out',
          rpcError
        );
      }

      this.session = null;
      this.user = null;
      clearSessionFingerprint();
      this.redirectToLogin();
    } catch (error) {
      console.error('[AuthGuard] Sign out failed:', error);
      throw error;
    }
  }

  redirectToLogin(redirectUrl = 'login.html') {
    // Preserve the intended destination
    const currentPath = window.location.pathname;
    const returnTo = encodeURIComponent(currentPath);
    clearSessionFingerprint();
    window.location.replace(`${redirectUrl}?returnTo=${returnTo}`);
  }

  showUnauthorized() {
    document.body.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f3f4f6;">
        <div style="max-width: 400px; padding: 2rem; background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="font-size: 1.5rem; font-weight: bold; color: #ef4444; margin-bottom: 1rem;">Unauthorized Access</h1>
          <p style="color: #6b7280; margin-bottom: 1.5rem;">You don't have permission to access this page.</p>
          <button onclick="window.location.href='admin-board.html'" style="background: #0e7490; color: white; padding: 0.5rem 1rem; border-radius: 0.25rem; border: none; cursor: pointer;">
            Go to Dashboard
          </button>
        </div>
      </div>
    `;
  }

  getUser() {
    return this.user;
  }

  getSession() {
    return this.session;
  }

  getSupabase() {
    return this.supabase;
  }
}

// Export singleton instance
export const authGuard = new AuthGuard();
