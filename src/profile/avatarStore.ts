import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

export const avatarKeyForUser = (userId: string) => `ljxmoney.profile.avatar.${userId}`;
export const avatarCloudPathKeyForUser = (userId: string) => `ljxmoney.profile.avatar-path.${userId}`;
export const avatarSyncActionKeyForUser = (userId: string) => `ljxmoney.profile.avatar-action.${userId}`;
export const avatarDeleteQueueKeyForUser = (userId: string) => `ljxmoney.profile.avatar-delete-queue.${userId}`;
export const displayNameKeyForUser = (userId: string) => `ljxmoney.profile.display-name.${userId}`;
export const displayNamePendingKeyForUser = (userId: string) => `ljxmoney.profile.display-name-pending.${userId}`;

export const resolveProfileDisplayName = (
  displayName: string | null | undefined,
  email: string | null | undefined,
  fallback: string,
) => displayName?.trim() || email?.split('@')[0]?.trim() || fallback;

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

export interface ProfileAvatarState {
  avatars: Record<string, string | null>;
  avatarPaths: Record<string, string | null>;
  avatarDeletePaths: Record<string, string[]>;
  avatarSyncActions: Record<string, 'upload' | 'remove' | null>;
  avatarRevisions: Record<string, number>;
  displayNames: Record<string, string | null>;
  displayNamePending: Record<string, boolean>;
  hydrated: Record<string, boolean>;
  hydrateUser: (userId: string) => Promise<string | null>;
  setDisplayNameForUser: (userId: string, displayName: string | null) => Promise<void>;
  applyRemoteProfile: (userId: string, displayName: string | null, avatarPath: string | null) => Promise<void>;
  completeDisplayNameSync: (userId: string, displayName: string | null) => Promise<void>;
  setAvatarForUser: (userId: string, uri: string | null) => Promise<void>;
  setCachedAvatarForUser: (userId: string, uri: string | null, avatarPath: string | null) => Promise<void>;
  completeAvatarSync: (userId: string, revision: number, avatarPath: string | null) => Promise<boolean>;
  getAvatarRevision: (userId: string) => number;
  queueAvatarCloudDelete: (userId: string, path: string) => Promise<void>;
  clearAvatarCloudDelete: (userId: string, path: string) => Promise<void>;
  clearAvatarForUser: (userId: string) => Promise<void>;
  clearAll: () => void;
}

export const createProfileAvatarStore = (storage: StateStorage) =>
  create<ProfileAvatarState>()((set, get) => ({
    avatars: {},
    avatarPaths: {},
    avatarDeletePaths: {},
    avatarSyncActions: {},
    avatarRevisions: {},
    displayNames: {},
    displayNamePending: {},
    hydrated: {},
    hydrateUser: async (userId) => {
      try {
        const [avatar, avatarPath, avatarSyncAction, avatarDeleteQueue, displayName, displayNamePending] = await Promise.all([
          storage.getItem(avatarKeyForUser(userId)),
          storage.getItem(avatarCloudPathKeyForUser(userId)),
          storage.getItem(avatarSyncActionKeyForUser(userId)),
          storage.getItem(avatarDeleteQueueKeyForUser(userId)),
          storage.getItem(displayNameKeyForUser(userId)),
          storage.getItem(displayNamePendingKeyForUser(userId)),
        ]);
        const avatarUri = avatar && avatar !== '' ? avatar : null;
        const action = avatarSyncAction === 'upload' || avatarSyncAction === 'remove'
          ? avatarSyncAction
          : null;
        let deletePaths: string[] = [];
        try {
          const parsed: unknown = avatarDeleteQueue ? JSON.parse(avatarDeleteQueue) : [];
          if (Array.isArray(parsed)) {
            deletePaths = parsed.filter((path): path is string => typeof path === 'string');
          }
        } catch {
          deletePaths = [];
        }
        set((state) => ({
          avatars: { ...state.avatars, [userId]: avatarUri },
          avatarPaths: { ...state.avatarPaths, [userId]: avatarPath || null },
          avatarDeletePaths: { ...state.avatarDeletePaths, [userId]: deletePaths },
          avatarSyncActions: { ...state.avatarSyncActions, [userId]: action },
          displayNames: { ...state.displayNames, [userId]: displayName || null },
          displayNamePending: { ...state.displayNamePending, [userId]: displayNamePending === '1' },
          hydrated: { ...state.hydrated, [userId]: true },
        }));
        return avatarUri;
      } catch {
        set((state) => ({
          avatars: { ...state.avatars, [userId]: null },
          avatarPaths: { ...state.avatarPaths, [userId]: null },
          avatarDeletePaths: { ...state.avatarDeletePaths, [userId]: [] },
          avatarSyncActions: { ...state.avatarSyncActions, [userId]: null },
          displayNames: { ...state.displayNames, [userId]: null },
          displayNamePending: { ...state.displayNamePending, [userId]: false },
          hydrated: { ...state.hydrated, [userId]: true },
        }));
        return null;
      }
    },
    setDisplayNameForUser: async (userId, displayName) => {
      const next = displayName?.trim() || null;
      set((state) => ({
        displayNames: { ...state.displayNames, [userId]: next },
        displayNamePending: { ...state.displayNamePending, [userId]: true },
      }));
      try {
        if (next) {
          await storage.setItem(displayNameKeyForUser(userId), next);
        } else {
          await storage.removeItem(displayNameKeyForUser(userId));
        }
      } catch {
        // Keep the local identity visible and retry cloud sync later.
      }
      try {
        await storage.setItem(displayNamePendingKeyForUser(userId), '1');
      } catch {
        // Keep the local identity visible and retry cloud sync later.
      }
    },
    applyRemoteProfile: async (userId, displayName, avatarPath) => {
      const state = get();
      const keepLocalName = Boolean(state.displayNamePending[userId]);
      const nextName = keepLocalName ? state.displayNames[userId] ?? null : displayName;
      const nextPath = avatarPath;
      set((current) => ({
        displayNames: { ...current.displayNames, [userId]: nextName },
        avatarPaths: { ...current.avatarPaths, [userId]: nextPath },
      }));
      try {
        const writes: Promise<unknown>[] = [
          Promise.resolve(nextName
            ? storage.setItem(displayNameKeyForUser(userId), nextName)
            : storage.removeItem(displayNameKeyForUser(userId))),
          Promise.resolve(nextPath
            ? storage.setItem(avatarCloudPathKeyForUser(userId), nextPath)
            : storage.removeItem(avatarCloudPathKeyForUser(userId))),
        ];
        if (!keepLocalName) {
          writes.push(Promise.resolve(storage.removeItem(displayNamePendingKeyForUser(userId))));
          set((current) => ({
            displayNamePending: { ...current.displayNamePending, [userId]: false },
          }));
        }
        await Promise.all(writes);
      } catch {
        // Cloud profile state is still available in memory for this session.
      }
    },
    completeDisplayNameSync: async (userId, displayName) => {
      if ((get().displayNames[userId] ?? null) !== displayName) {
        return;
      }
      set((state) => ({
        displayNamePending: { ...state.displayNamePending, [userId]: false },
      }));
      try {
        await storage.removeItem(displayNamePendingKeyForUser(userId));
      } catch {
        // The remote name is authoritative after the successful upsert.
      }
    },
    setAvatarForUser: async (userId, uri) => {
      const next = uri?.trim() || null;
      const revision = (get().avatarRevisions[userId] ?? 0) + 1;
      const action = next ? 'upload' : 'remove';
      set((state) => ({
        avatars: { ...state.avatars, [userId]: next },
        avatarSyncActions: { ...state.avatarSyncActions, [userId]: action },
        avatarRevisions: { ...state.avatarRevisions, [userId]: revision },
      }));
      try {
        if (next) {
          await storage.setItem(avatarKeyForUser(userId), next);
        } else {
          await storage.removeItem(avatarKeyForUser(userId));
        }
      } catch {
        // Keep the local avatar visible and retry cloud sync later.
      }
      try {
        await storage.setItem(avatarSyncActionKeyForUser(userId), action);
      } catch {
        // Keep the local avatar visible and retry cloud sync later.
      }
    },
    setCachedAvatarForUser: async (userId, uri, avatarPath) => {
      set((state) => ({
        avatars: { ...state.avatars, [userId]: uri },
        avatarPaths: { ...state.avatarPaths, [userId]: avatarPath },
        avatarSyncActions: { ...state.avatarSyncActions, [userId]: null },
      }));
      try {
        const writes: Promise<unknown>[] = [
          Promise.resolve(uri ? storage.setItem(avatarKeyForUser(userId), uri) : storage.removeItem(avatarKeyForUser(userId))),
          Promise.resolve(avatarPath
            ? storage.setItem(avatarCloudPathKeyForUser(userId), avatarPath)
            : storage.removeItem(avatarCloudPathKeyForUser(userId))),
          Promise.resolve(storage.removeItem(avatarSyncActionKeyForUser(userId))),
        ];
        await Promise.all(writes);
      } catch {
        // The in-memory cache remains usable if persistence is temporarily unavailable.
      }
    },
    completeAvatarSync: async (userId, revision, avatarPath) => {
      if ((get().avatarRevisions[userId] ?? 0) !== revision) {
        return false;
      }
      set((state) => ({
        avatarPaths: { ...state.avatarPaths, [userId]: avatarPath },
        avatarSyncActions: { ...state.avatarSyncActions, [userId]: null },
      }));
      try {
        const writes: Promise<unknown>[] = [Promise.resolve(storage.removeItem(avatarSyncActionKeyForUser(userId)))];
        if (avatarPath) {
          writes.push(Promise.resolve(storage.setItem(avatarCloudPathKeyForUser(userId), avatarPath)));
        } else {
          writes.push(Promise.resolve(storage.removeItem(avatarCloudPathKeyForUser(userId))));
        }
        await Promise.all(writes);
      } catch {
        // The cloud path remains in memory for this session.
      }
      return true;
    },
    getAvatarRevision: (userId) => get().avatarRevisions[userId] ?? 0,
    queueAvatarCloudDelete: async (userId, path) => {
      const paths = [...new Set([...(get().avatarDeletePaths[userId] ?? []), path])];
      set((state) => ({
        avatarDeletePaths: { ...state.avatarDeletePaths, [userId]: paths },
      }));
      try {
        await storage.setItem(avatarDeleteQueueKeyForUser(userId), JSON.stringify(paths));
      } catch {
        // Keep the queued path in memory and retry after the next profile sync.
      }
    },
    clearAvatarCloudDelete: async (userId, path) => {
      const paths = (get().avatarDeletePaths[userId] ?? []).filter((item) => item !== path);
      set((state) => ({
        avatarDeletePaths: { ...state.avatarDeletePaths, [userId]: paths },
      }));
      try {
        if (paths.length) {
          await storage.setItem(avatarDeleteQueueKeyForUser(userId), JSON.stringify(paths));
        } else {
          await storage.removeItem(avatarDeleteQueueKeyForUser(userId));
        }
      } catch {
        // A repeated object removal is idempotent and retried after the next sync.
      }
    },
    clearAvatarForUser: async (userId) => {
      await get().setAvatarForUser(userId, null);
    },
    clearAll: () => set({
      avatars: {},
      avatarPaths: {},
      avatarDeletePaths: {},
      avatarSyncActions: {},
      avatarRevisions: {},
      displayNames: {},
      displayNamePending: {},
      hydrated: {},
    }),
  }));

export const useProfileAvatarStore = createProfileAvatarStore(AsyncStorage);
