import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from '../../../shared/supabaseClient.js';

class AuthServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AuthServiceError';
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

class AuthService extends EventTarget {
  constructor() {
    super();
    this.client = null;
    this.state = {
      status: 'initialising',
      user: null,
      profile: null,
      error: null,
    };
    this.initialised = false;
  }

  getState() {
    return this.state;
  }

  onChange(callback) {
    const handler = (event) => callback(event.detail);
    this.addEventListener('change', handler);
    return () => this.removeEventListener('change', handler);
  }

  async init() {
    if (this.initialised) {
      return this.state;
    }
    this.initialised = true;

    try {
      this.client = await getSupabaseClient();
    } catch (error) {
      const wrapped =
        error instanceof SupabaseConfigurationError
          ? new AuthServiceError(error.message, { cause: error })
          : new AuthServiceError('Unable to create Supabase client.', {
              cause: error,
            });
      this._setState({ status: 'error', error: wrapped });
      throw wrapped;
    }

    await this._refreshSession();

    this.client.auth.onAuthStateChange((_, session) => {
      this._refreshSession(session).catch((error) => {
        console.error('[AuthService] Failed to refresh session', error);
        this._setState({
          status: 'error',
          error:
            error instanceof Error
              ? error
              : new AuthServiceError('Session refresh failed.'),
        });
      });
    });

    return this.state;
  }

  async signIn(email, password) {
    console.log('[AuthService] Attempting sign in for:', email);
    if (!this.client) {
      console.log('[AuthService] Initializing client...');
      await this.init();
    }

    try {
      console.log('[AuthService] Calling signInWithPassword...');
      const { error } = await this.client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error('[AuthService] Sign-in error:', error);
        throw error;
      }
      console.log('[AuthService] Sign-in successful, refreshing session...');
      await this._refreshSession();
      console.log('[AuthService] Session refresh complete');
      return this.state;
    } catch (error) {
      console.error('[AuthService] Sign-in failed:', error);
      throw new AuthServiceError(
        'Sign-in failed. Check your credentials and try again.',
        { cause: error }
      );
    }
  }

  async signOut() {
    if (!this.client) return;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this._setState({
        status: 'needs-login',
        user: null,
        profile: null,
        error: null,
      });
    } catch (error) {
      throw new AuthServiceError('Unable to sign out.', { cause: error });
    }
  }

  async resetPasswordForUser(email) {
    if (!this.client) {
      await this.init();
    }
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error) {
      throw new AuthServiceError('Failed to send password reset email.', {
        cause: error,
      });
    }
  }

  async deleteUser(userId) {
    if (!this.client) {
      await this.init();
    }
    try {
      const { error } = await this.client.auth.admin.deleteUser(userId);
      if (error) throw error;
    } catch (error) {
      throw new AuthServiceError('Failed to delete user.', { cause: error });
    }
  }

  async deleteUsersBulk(userIds) {
    if (!this.client) {
      await this.init();
    }
    try {
      for (const userId of userIds) {
        const { error } = await this.client.auth.admin.deleteUser(userId);
        if (error) throw error;
      }
    } catch (error) {
      throw new AuthServiceError('Failed to delete users.', { cause: error });
    }
  }

  async impersonateUser(userId) {
    if (!this.client) {
      await this.init();
    }
    try {
      const { data, error } = await this.client.rpc('impersonate', {
        user_id: userId,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      throw new AuthServiceError('Failed to impersonate user.', {
        cause: error,
      });
    }
  }

  async _refreshSession(explicitSession) {
    if (!this.client) {
      console.error('[AuthService] Supabase client is not initialised');
      throw new AuthServiceError('Supabase client is not initialised.');
    }

    console.log('[AuthService] Starting session refresh...');
    this._setState({ ...this.state, status: 'checking' });

    try {
      let session = explicitSession;
      if (!session) {
        console.log('[AuthService] Getting current session...');
        const { data, error } = await this.client.auth.getSession();
        if (error) {
          console.error('[AuthService] Session error:', error);
          throw error;
        }
        session = data.session;
        console.log(
          '[AuthService] Session retrieved:',
          session ? 'Active' : 'None'
        );
      }

      if (!session) {
        console.log('[AuthService] No active session, user needs to login');
        this._setState({
          status: 'needs-login',
          user: null,
          profile: null,
          error: null,
        });
        return this.state;
      }

      console.log('[AuthService] Getting user data...');
      const { data: userData, error: userError } =
        await this.client.auth.getUser();
      if (userError) {
        console.error('[AuthService] User error:', userError);
        throw userError;
      }
      const supabaseUser = userData.user;
      if (!supabaseUser) {
        console.log('[AuthService] No user data found');
        this._setState({
          status: 'needs-login',
          user: null,
          profile: null,
          error: null,
        });
        return this.state;
      }
      console.log(
        '[AuthService] User found:',
        supabaseUser.email,
        'ID:',
        supabaseUser.id
      );

      console.log('[AuthService] Querying profile for user:', supabaseUser.id);

      // First, let's check if the profiles table exists
      console.log('[AuthService] Checking if profiles table exists...');
      const { data: profile, error: profileError } = await this.client
        .from('profiles')
        .select('id, full_name, role, subscription_status')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('[AuthService] Profile query error:', profileError);
        console.error('[AuthService] Error details:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
        });
        throw profileError;
      }

      console.log('[AuthService] Profile query result:', profile);

      if (!profile) {
        console.error(
          '[AuthService] No profile found for user:',
          supabaseUser.id
        );
        console.error(
          '[AuthService] This means the user exists in auth.users but not in public.profiles'
        );
        this._setState({
          status: 'unauthorised',
          user: supabaseUser,
          profile: null,
          error: new AuthServiceError(
            'Profile not found. Please contact administrator to set up your profile.'
          ),
        });
        return this.state;
      }

      if ((profile.subscription_status || '').toLowerCase() === 'suspended') {
        this._setState({
          status: 'unauthorised',
          user: supabaseUser,
          profile,
          error: new AuthServiceError('This account has been suspended.'),
        });
        return this.state;
      }

      if (profile.role !== 'admin') {
        const roleLabel =
          typeof profile.role === 'string' && profile.role.trim()
            ? profile.role.trim()
            : 'unknown';
        console.error(
          '[AuthService] User has role:',
          profile.role,
          'but admin role required'
        );
        this._setState({
          status: 'unauthorised',
          user: supabaseUser,
          profile,
          error: new AuthServiceError(
            `Admin role required. Current role is "${roleLabel}".`
          ),
        });
        return this.state;
      }

      console.log(
        '[AuthService] Authentication successful for admin user:',
        profile.full_name
      );
      this._setState({
        status: 'authenticated',
        user: supabaseUser,
        profile,
        error: null,
      });
      return this.state;
    } catch (error) {
      console.error('[AuthService] Session refresh failed:', error);
      console.error('[AuthService] Error stack:', error.stack);
      const wrapped =
        error instanceof AuthServiceError
          ? error
          : new AuthServiceError('Failed to validate admin session.', {
              cause: error,
            });
      this._setState({
        status: 'error',
        error: wrapped,
        user: null,
        profile: null,
      });
      throw wrapped;
    }
  }

  _setState(partial) {
    this.state = { ...this.state, ...partial };
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
  }
}

export const authService = new AuthService();
export { AuthServiceError };
