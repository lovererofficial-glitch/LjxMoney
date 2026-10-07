export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

export type AuthErrorCode =
  | 'not-configured'
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-exists'
  | 'weak-password'
  | 'network'
  | 'session-expired'
  | 'unknown';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  emailConfirmationRequired: boolean;
  user: AuthUser | null;
}

/**
 * Minimal auth surface consumed by the auth store. The real implementation
 * talks to Supabase; tests inject an in-memory fake so the state machine can
 * be verified without a network.
 */
export interface AuthApi {
  readonly configured: boolean;
  getSession(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: AuthErrorCode | null;
  pending: boolean;
  configured: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<'signed-in' | 'confirm-email' | 'error'>;
  signOut: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  clearError: () => void;
}
