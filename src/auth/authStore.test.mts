import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from 'zustand';

import { AuthOperationError } from './authSupabaseApi.ts';
import type { AuthApi, AuthState, AuthUser, SignUpResult } from './authTypes.ts';
import { createAuthStore } from './authStoreCore.ts';

interface FakeApiOptions {
  session?: AuthUser | null;
  signInError?: Error;
  signUpResult?: SignUpResult;
  getSessionError?: Error;
}

const makeFakeApi = (options: FakeApiOptions = {}) => {
  let session: AuthUser | null = options.session ?? null;
  const listeners = new Set<(user: AuthUser | null) => void>();

  const api: AuthApi = {
    configured: true,
    getSession: async () => {
      if (options.getSessionError) {
        throw options.getSessionError;
      }
      return session;
    },
    signIn: async (email, password) => {
      if (options.signInError) {
        throw options.signInError;
      }
      if (!email || !password) {
        throw new AuthOperationError('invalid-credentials');
      }
      session = { id: 'user-1', email };
      listeners.forEach((listener) => listener(session));
      return session;
    },
    signUp: async () => {
      const result = options.signUpResult ?? { emailConfirmationRequired: true, user: null };
      if (result.user) {
        session = result.user;
        listeners.forEach((listener) => listener(session));
      }
      return result;
    },
    signOut: async () => {
      session = null;
      listeners.forEach((listener) => listener(null));
    },
    sendPasswordReset: async () => undefined,
    updatePassword: async () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    api,
    emitSession: (user: AuthUser | null) => {
      session = user;
      listeners.forEach((listener) => listener(user));
    },
  };
};

const makeStore = (api: AuthApi | null) => create<AuthState>(createAuthStore(api));

test('auth starts bootstrapping and resolves to unauthenticated without a session', async () => {
  const { api } = makeFakeApi();
  const store = makeStore(api);
  assert.equal(store.getState().status, 'bootstrapping');
  await store.getState().initialize();
  assert.equal(store.getState().status, 'unauthenticated');
  assert.equal(store.getState().user, null);
});

test('auth restores an existing session on initialize', async () => {
  const { api } = makeFakeApi({ session: { id: 'user-1', email: 'a@b.c' } });
  const store = makeStore(api);
  await store.getState().initialize();
  assert.equal(store.getState().status, 'authenticated');
  assert.equal(store.getState().user?.email, 'a@b.c');
});

test('auth never stays stuck in bootstrapping when session restore fails', async () => {
  const { api } = makeFakeApi({ getSessionError: new Error('storage corrupt') });
  const store = makeStore(api);
  await store.getState().initialize();
  assert.equal(store.getState().status, 'unauthenticated');
});

test('signIn authenticates and signOut returns to unauthenticated', async () => {
  const { api } = makeFakeApi();
  const store = makeStore(api);
  await store.getState().initialize();

  const signedIn = await store.getState().signIn('user@example.com', 'secret123');
  assert.equal(signedIn, true);
  assert.equal(store.getState().status, 'authenticated');

  const signedOut = await store.getState().signOut();
  assert.equal(signedOut, true);
  assert.equal(store.getState().status, 'unauthenticated');
  assert.equal(store.getState().user, null);
});

test('failed signIn exposes an error code without authenticating', async () => {
  const { api } = makeFakeApi({ signInError: new AuthOperationError('invalid-credentials') });
  const store = makeStore(api);
  await store.getState().initialize();

  const signedIn = await store.getState().signIn('user@example.com', 'wrong');
  assert.equal(signedIn, false);
  assert.equal(store.getState().status, 'unauthenticated');
  assert.equal(store.getState().error, 'invalid-credentials');

  store.getState().clearError();
  assert.equal(store.getState().error, null);
});

test('signUp requiring email confirmation keeps the user unauthenticated', async () => {
  const { api } = makeFakeApi({ signUpResult: { emailConfirmationRequired: true, user: null } });
  const store = makeStore(api);
  await store.getState().initialize();

  const result = await store.getState().signUp('user@example.com', 'secret123');
  assert.equal(result, 'confirm-email');
  assert.equal(store.getState().status, 'unauthenticated');
});

test('signUp without email confirmation authenticates immediately', async () => {
  const { api } = makeFakeApi({
    signUpResult: { emailConfirmationRequired: false, user: { id: 'user-1', email: 'a@b.c' } },
  });
  const store = makeStore(api);
  await store.getState().initialize();

  const result = await store.getState().signUp('user@example.com', 'secret123');
  assert.equal(result, 'signed-in');
  assert.equal(store.getState().status, 'authenticated');
});

test('session expiration from the auth listener marks the session expired', async () => {
  const { api, emitSession } = makeFakeApi({ session: { id: 'user-1', email: 'a@b.c' } });
  const store = makeStore(api);
  await store.getState().initialize();
  assert.equal(store.getState().status, 'authenticated');

  emitSession(null);
  assert.equal(store.getState().status, 'unauthenticated');
  assert.equal(store.getState().error, 'session-expired');
});

test('network failures map to a network error code', async () => {
  const networkError = new Error('Network request failed');
  const { api } = makeFakeApi({ signInError: networkError });
  const store = makeStore(api);
  await store.getState().initialize();

  await store.getState().signIn('user@example.com', 'secret123');
  assert.equal(store.getState().error, 'network');
});

test('unconfigured Supabase degrades gracefully to local-only mode', async () => {
  const store = makeStore(null);
  await store.getState().initialize();
  assert.equal(store.getState().status, 'unauthenticated');
  assert.equal(store.getState().configured, false);

  const signedIn = await store.getState().signIn('user@example.com', 'secret123');
  assert.equal(signedIn, false);
  assert.equal(store.getState().error, 'not-configured');
});

