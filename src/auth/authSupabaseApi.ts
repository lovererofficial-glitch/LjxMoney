import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { AuthApi, AuthErrorCode, AuthUser, SignUpResult } from './authTypes';

export class AuthOperationError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthOperationError';
    this.code = code;
  }
}

export const mapAuthError = (error: unknown): AuthOperationError => {
  if (error instanceof AuthOperationError) {
    return error;
  }
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) {
    return new AuthOperationError('invalid-credentials', message);
  }
  if (/already registered|user already exists/i.test(message)) {
    return new AuthOperationError('email-exists', message);
  }
  if (/email not confirmed/i.test(message)) {
    return new AuthOperationError('email-not-confirmed', message);
  }
  if (/password should be at least|at least 6 characters/i.test(message)) {
    return new AuthOperationError('weak-password', message);
  }
  if (/network request failed|fetch failed|failed to fetch/i.test(message)) {
    return new AuthOperationError('network', message);
  }
  return new AuthOperationError('unknown', message);
};

const toAuthUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email ?? '',
});

export const createSupabaseAuthApi = (client: SupabaseClient): AuthApi => ({
  configured: true,
  getSession: async () => {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        throw mapAuthError(error);
      }
      return data.session?.user ? toAuthUser(data.session.user) : null;
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  signIn: async (email, password) => {
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        throw mapAuthError(error);
      }
      return toAuthUser(data.user);
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  signUp: async (email, password): Promise<SignUpResult> => {
    try {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) {
        throw mapAuthError(error);
      }
      if (data.session?.user) {
        return { emailConfirmationRequired: false, user: toAuthUser(data.session.user) };
      }
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        // Supabase returns an existing user with no identities for a
        // duplicate sign-up when email confirmation is enabled.
        throw new AuthOperationError('email-exists');
      }
      return { emailConfirmationRequired: true, user: null };
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  signOut: async () => {
    try {
      // Local scope: signing out must work offline and never strand the user
      // in an authenticated UI. Tokens expire server-side regardless.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) {
        throw mapAuthError(error);
      }
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  sendPasswordReset: async (email) => {
    try {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) {
        throw mapAuthError(error);
      }
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  updatePassword: async (password) => {
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        throw mapAuthError(error);
      }
    } catch (error) {
      throw mapAuthError(error);
    }
  },
  subscribe: (listener) => {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      listener(session?.user ? toAuthUser(session.user) : null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  },
});
