import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

export const avatarKeyForUser = (userId: string) => `ljxmoney.profile.avatar.${userId}`;

export const getAvatarInitials = (email?: string | null, sourceName?: string | null) => {
  const nameSource = (sourceName || email || 'LjxMoney').trim();
  const fallback = 'LM';
  if (!nameSource) {
    return fallback;
  }

  const tokens = nameSource
    .split(/[@._\s-]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return fallback;
  }

  const initials = tokens
    .map((token) => token.charAt(0)?.toUpperCase() ?? '')
    .join('');

  return initials.length > 1 ? initials.slice(0, 2) : initials || fallback;
};

interface ProfileAvatarState {
  avatars: Record<string, string | null>;
  hydrated: Record<string, boolean>;
  hydrateUser: (userId: string) => Promise<string | null>;
  setAvatarForUser: (userId: string, uri: string | null) => Promise<void>;
  clearAvatarForUser: (userId: string) => Promise<void>;
  clearAll: () => void;
}

export const createProfileAvatarStore = (storage: StateStorage) =>
  create<ProfileAvatarState>()((set, get) => ({
    avatars: {},
    hydrated: {},
    hydrateUser: async (userId) => {
      const key = avatarKeyForUser(userId);
      try {
        const raw = await storage.getItem(key);
        const value = raw && raw !== '' ? raw : null;
        set((state) => ({
          avatars: { ...state.avatars, [userId]: value },
          hydrated: { ...state.hydrated, [userId]: true },
        }));
        return value;
      } catch {
        set((state) => ({
          avatars: { ...state.avatars, [userId]: null },
          hydrated: { ...state.hydrated, [userId]: true },
        }));
        return null;
      }
    },
    setAvatarForUser: async (userId, uri) => {
      const next = uri && uri.trim() ? uri : null;
      set((state) => ({ avatars: { ...state.avatars, [userId]: next } }));
      try {
        if (next) {
          await storage.setItem(avatarKeyForUser(userId), next);
        } else {
          await storage.removeItem(avatarKeyForUser(userId));
        }
      } catch {
        // Keep the in-memory state; storage failures should not crash the UI.
      }
    },
    clearAvatarForUser: async (userId) => {
      set((state) => ({
        avatars: { ...state.avatars, [userId]: null },
      }));
      try {
        await storage.removeItem(avatarKeyForUser(userId));
      } catch {
        // Fail-safe for local-only avatar state.
      }
    },
    clearAll: () => set({ avatars: {}, hydrated: {} }),
  }));

export const useProfileAvatarStore = createProfileAvatarStore(AsyncStorage);
