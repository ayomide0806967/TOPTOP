import { apiFetch } from '../../../shared/apiClient.js';

class AuthServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AuthServiceError';
    if (options.cause) this.cause = options.cause;
  }
}

class AuthService extends EventTarget {
  constructor() {
    super();
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
    if (this.initialised) return this.state;
    this.initialised = true;
    return this._refreshSession();
  }

  async signIn(email, password) {
    try {
      await apiFetch('/api/auth/sign-in/email', {
        method: 'POST',
        body: { email, password, rememberMe: true },
      });
      return this._refreshSession();
    } catch (error) {
      throw new AuthServiceError(
        'Sign-in failed. Check your credentials and try again.',
        { cause: error }
      );
    }
  }

  async signOut() {
    try {
      await apiFetch('/api/auth/sign-out', { method: 'POST' });
    } finally {
      this._setState({
        status: 'needs-login',
        user: null,
        profile: null,
        error: null,
      });
    }
  }

  async _refreshSession() {
    this._setState({ ...this.state, status: 'checking' });

    try {
      const payload = await apiFetch('/api/me');
      const user = payload.user || null;
      const profile = payload.profile || null;

      if (!user) {
        this._setState({
          status: 'needs-login',
          user: null,
          profile: null,
          error: null,
        });
        return this.state;
      }

      if (!profile) {
        const error = new AuthServiceError(
          'Profile not found. Please create an admin profile for this account.'
        );
        this._setState({ status: 'unauthorised', user, profile: null, error });
        return this.state;
      }

      if ((profile.subscription_status || '').toLowerCase() === 'suspended') {
        const error = new AuthServiceError('This account has been suspended.');
        this._setState({ status: 'unauthorised', user, profile, error });
        return this.state;
      }

      if (profile.role !== 'admin') {
        const roleLabel =
          typeof profile.role === 'string' && profile.role.trim()
            ? profile.role.trim()
            : 'unknown';
        const error = new AuthServiceError(
          `Admin role required. Current role is "${roleLabel}".`
        );
        this._setState({ status: 'unauthorised', user, profile, error });
        return this.state;
      }

      this._setState({
        status: 'authenticated',
        user,
        profile,
        error: null,
      });
      return this.state;
    } catch (error) {
      if (error?.status === 401) {
        this._setState({
          status: 'needs-login',
          user: null,
          profile: null,
          error: null,
        });
        return this.state;
      }

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
