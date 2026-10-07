import type { StateCreator } from 'zustand';

import type { AuthApi, AuthErrorCode, AuthState, AuthUser } from './authTypes';

const KNOWN_ERROR_CODES: AuthErrorCode[] = [
  'not-configured',
  'invalid-credentials',
  'email-not-confirmed',
  'email-exists',
  'weak-password',
  'network',
  'session-expired',
  'unknown',
];

const toErrorCode = (error: unknown): AuthErrorCode => {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && (KNOWN_ERROR_CODES as string[]).includes(code)) {
      return code as AuthErrorCode;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && /network request failed|fetch failed|failed to fetch/i.test(message)) {
      return 'network';
    }
  }
  return 'unknown';
};

/**
 * Auth state machine. Navigation is intentionally NOT gated on auth status:
 * the app is offline-first and must always open into the local finance UI
 * (this also keeps the startup path away from any deep-link/scheme code that
 * previously caused a crash).
 *
 * Lifecycle: bootstrapping -> authenticated | unauthenticated.
 */
export const createAuthStore = (api: AuthApi | null): StateCreator<AuthState> => (set) => {
  let initialized = false;
  let wasAuthenticated = false;

  const applyUser = (user: AuthUser | null) => {
    if (user) {
      wasAuthenticated = true;
      set({ status: 'authenticated', user, error: null, pending: false });
      return;
    }
    set({
      status: 'unauthenticated',
      user: null,
      pending: false,
      error: wasAuthenticated ? 'session-expired' : null,
    });
    wasAuthenticated = false;
  };

  const run = async <T>(operation: () => Promise<T>): Promise<T | null> => {
    set({ pending: true, error: null });
    try {
      return await operation();
    } catch (error) {
      set({ error: toErrorCode(error) });
      return null;
    } finally {
      set({ pending: false });
    }
  };

  return {
    status: 'bootstrapping',
    user: null,
    error: null,
    pending: false,
    configured: Boolean(api?.configured),
    initialize: async () => {
      if (initialized) {
        return;
      }
      initialized = true;
      if (!api) {
        set({ status: 'unauthenticated', configured: false });
        return;
      }
      try {
        api.subscribe(applyUser);
        const session = await api.getSession();
        applyUser(session);
      } catch {
        // Auth must never block or crash the local-first startup flow.
        set({ status: 'unauthenticated', pending: false });
      }
    },
    signIn: async (email, password) => {
      if (!api) {
        set({ error: 'not-configured' });
        return false;
      }
      const user = await run(() => api.signIn(email, password));
      if (!user) {
        return false;
      }
      applyUser(user);
      return true;
    },
    signUp: async (email, password) => {
      if (!api) {
        set({ error: 'not-configured' });
        return 'error';
      }
      set({ pending: true, error: null });
      try {
        const result = await api.signUp(email, password);
        if (result.user) {
          wasAuthenticated = true;
          set({ status: 'authenticated', user: result.user, pending: false, error: null });
          return 'signed-in';
        }
        set({ status: 'unauthenticated', pending: false, error: null });
        return 'confirm-email';
      } catch (error) {
        set({ error: toErrorCode(error), pending: false });
        return 'error';
      }
    },
    signOut: async () => {
      if (!api) {
        set({ error: 'not-configured' });
        return false;
      }
      const result = await run(() => api.signOut());
      if (result === null) {
        return false;
      }
      wasAuthenticated = false;
      set({ status: 'unauthenticated', user: null, error: null });
      return true;
    },
    sendPasswordReset: async (email) => {
      if (!api) {
        set({ error: 'not-configured' });
        return false;
      }
      return (await run(() => api.sendPasswordReset(email))) !== null;
    },
    updatePassword: async (password) => {
      if (!api) {
        set({ error: 'not-configured' });
        return false;
      }
      return (await run(() => api.updatePassword(password))) !== null;
    },
    clearError: () => set({ error: null }),
  };
};

