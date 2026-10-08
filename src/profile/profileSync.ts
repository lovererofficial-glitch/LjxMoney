import { useAuthStore } from '../auth/authStore';
import {
  fetchProfile,
  saveProfileAvatarPath,
  saveProfileDisplayName,
} from '../lib/profiles';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { useProfileAvatarStore } from './avatarStore';
import {
  deleteProfileAvatarFromCloud,
  downloadProfileAvatar,
  isProfileAvatarFileAvailable,
  removeLocalProfileAvatar,
  uploadProfileAvatar,
} from './avatarAssets';
import { syncProfileWithAdapter } from './profileSyncCore';

const RETRY_MS = 30_000;
let started = false;
let generation = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<void> = Promise.resolve();

const isCurrentAccount = (userId: string, expectedGeneration: number) =>
  generation === expectedGeneration && useAuthStore.getState().user?.id === userId;

export const syncProfileForUser = async (
  userId: string,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  const client = getSupabaseClient();
  if (!isSupabaseConfigured || !client) {
    const store = useProfileAvatarStore.getState();
    if (!store.hydrated[userId]) {
      await store.hydrateUser(userId);
    }
    return;
  }

  await syncProfileWithAdapter(userId, {
    store: useProfileAvatarStore,
    fetchRemote: (id) => fetchProfile(client, id),
    saveDisplayName: (id, name) => saveProfileDisplayName(client, id, name ?? ''),
    saveAvatarPath: (id, path) => saveProfileAvatarPath(client, id, path),
    uploadAvatar: (id, uri) => uploadProfileAvatar(id, uri),
    downloadAvatar: (id, path) => downloadProfileAvatar(id, path),
    deleteAvatar: (id, path) => deleteProfileAvatarFromCloud(id, path),
    isAvatarAvailable: isProfileAvatarFileAvailable,
    removeLocalAvatar: removeLocalProfileAvatar,
  }, isCurrent);
};

const runForCurrentUser = (userId: string, expectedGeneration: number) => {
  queue = queue
    .then(async () => {
      const isCurrent = () => isCurrentAccount(userId, expectedGeneration);
      if (!isCurrent()) {
        return;
      }
      const store = useProfileAvatarStore.getState();
      await store.hydrateUser(userId);
      if (!isCurrent()) {
        return;
      }

      let retryNeeded = false;
      try {
        await syncProfileForUser(userId, isCurrent);
      } catch (error) {
        if (isCurrent()) {
          retryNeeded = true;
          console.warn('Profile sync will retry when the connection is available.', error);
        }
      }

      const current = useProfileAvatarStore.getState();
      const pending = current.displayNamePending[userId] ||
        current.avatarSyncActions[userId] ||
        (current.avatarDeletePaths[userId]?.length ?? 0) > 0;
      if (isCurrent() && isSupabaseConfigured && (pending || retryNeeded)) {
        if (retryTimer) {
          clearTimeout(retryTimer);
        }
        retryTimer = setTimeout(() => runForCurrentUser(userId, expectedGeneration), RETRY_MS);
      }
    })
    .catch((error) => {
      console.error('Profile sync task failed.', error);
    });
};

export const requestProfileSyncNow = () => {
  const userId = useAuthStore.getState().user?.id ?? null;
  if (userId) {
    runForCurrentUser(userId, generation);
  }
};

export const startProfileRuntime = () => {
  if (started) {
    return;
  }
  started = true;
  const runForState = (userId: string | null) => {
    generation += 1;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (!userId) {
      useProfileAvatarStore.getState().clearAll();
      return;
    }
    runForCurrentUser(userId, generation);
  };

  const currentUserId = useAuthStore.getState().user?.id ?? null;
  if (currentUserId) {
    runForState(currentUserId);
  }
  useAuthStore.subscribe((state, previous) => {
    const nextId = state.status === 'authenticated' ? state.user?.id ?? null : null;
    const previousId = previous.status === 'authenticated' ? previous.user?.id ?? null : null;
    if (nextId !== previousId) {
      runForState(nextId);
    }
  });
};
