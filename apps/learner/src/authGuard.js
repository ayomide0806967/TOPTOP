import { getSupabaseClient } from '../../shared/supabaseClient.js';

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
  }

  async init() {
    if (this.isInitialized) return this.session;
    
    try {
      this.supabase = await getSupabaseClient();
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
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
            this.redirectToLogin();
            break;
          case 'TOKEN_REFRESHED':
            console.log('[AuthGuard] Token refreshed successfully');
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
      
      return true;
    } catch (error) {
      console.error('[AuthGuard] Auth check failed:', error);
      this.redirectToLogin(redirectUrl);
      return false;
    }
  }

  async requireRole(allowedRoles = ['learner']) {
    if (!await this.requireAuth()) return false;
    
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
      
      this.session = null;
      this.user = null;
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
