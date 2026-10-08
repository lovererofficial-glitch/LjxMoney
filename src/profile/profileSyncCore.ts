import type { Profile } from '../lib/profiles';
import type { ProfileAvatarState } from './avatarStore';

export interface ProfileSyncAdapter {
  store: { getState: () => ProfileAvatarState };
  fetchRemote: (userId: string) => Promise<Profile>;
  saveDisplayName: (userId: string, displayName: string | null) => Promise<void>;
  saveAvatarPath: (userId: string, path: string | null) => Promise<void>;
  uploadAvatar: (userId: string, uri: string) => Promise<string>;
  downloadAvatar: (userId: string, path: string) => Promise<string>;
  deleteAvatar: (userId: string, path: string) => Promise<void>;
  isAvatarAvailable: (uri: string) => boolean;
  removeLocalAvatar: (userId: string, uri: string) => void;
}

export const syncProfileWithAdapter = async (
  userId: string,
  adapter: ProfileSyncAdapter,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  let profileStore = adapter.store.getState();
  if (!profileStore.hydrated[userId]) {
    await profileStore.hydrateUser(userId);
  }
  if (!isCurrent()) {
    return;
  }
  profileStore = adapter.store.getState();

  const remote = await adapter.fetchRemote(userId);
  if (!isCurrent()) {
    return;
  }
  const localPathBeforeRemote = profileStore.avatarPaths[userId] ?? null;
  await profileStore.applyRemoteProfile(userId, remote.displayName, remote.avatarPath);

  const currentProfile = adapter.store.getState();
  if (currentProfile.displayNamePending[userId]) {
    const displayName = currentProfile.displayNames[userId] ?? null;
    await adapter.saveDisplayName(userId, displayName);
    if (!isCurrent()) {
      return;
    }
    await currentProfile.completeDisplayNameSync(userId, displayName);
  }

  const current = adapter.store.getState();
  const localUri = current.avatars[userId] ?? null;
  const activePath = current.avatarPaths[userId] ?? null;
  const avatarAction = current.avatarSyncActions[userId] ?? null;
  const avatarRevision = current.getAvatarRevision(userId);
  let localVersionMatchesRemote = Boolean(
    localUri &&
    adapter.isAvatarAvailable(localUri) &&
    localPathBeforeRemote === remote.avatarPath,
  );

  if (!avatarAction && localPathBeforeRemote && remote.avatarPath !== localPathBeforeRemote) {
    await current.queueAvatarCloudDelete(userId, localPathBeforeRemote);
  }

  if (avatarAction === 'upload') {
    if (!localUri || !adapter.isAvatarAvailable(localUri)) {
      await current.completeAvatarSync(userId, avatarRevision, activePath);
    } else {
      const newPath = await adapter.uploadAvatar(userId, localUri);
      if (!isCurrent() || current.getAvatarRevision(userId) !== avatarRevision) {
        await adapter.deleteAvatar(userId, newPath).catch(() => undefined);
        return;
      }
      await adapter.saveAvatarPath(userId, newPath);
      await current.applyRemoteProfile(
        userId,
        adapter.store.getState().displayNames[userId] ?? null,
        newPath,
      );
      if (activePath && activePath !== newPath) {
        await current.queueAvatarCloudDelete(userId, activePath);
      }
      if (!isCurrent()) {
        return;
      }
      const completed = await current.completeAvatarSync(userId, avatarRevision, newPath);
      localVersionMatchesRemote = completed;
    }
  } else if (avatarAction === 'remove') {
    await adapter.saveAvatarPath(userId, null);
    await current.applyRemoteProfile(
      userId,
      adapter.store.getState().displayNames[userId] ?? null,
      null,
    );
    if (activePath) {
      await current.queueAvatarCloudDelete(userId, activePath);
    }
    if (!isCurrent()) {
      return;
    }
    await current.completeAvatarSync(userId, avatarRevision, null);
  }

  if (!isCurrent()) {
    return;
  }
  const reconciled = adapter.store.getState();
  if (reconciled.avatarSyncActions[userId]) {
    return;
  }

  const currentLocalUri = reconciled.avatars[userId] ?? null;
  const currentPath = reconciled.avatarPaths[userId] ?? null;
  const reconcileRevision = reconciled.getAvatarRevision(userId);
  if (currentPath) {
    if (
      !currentLocalUri ||
      !adapter.isAvatarAvailable(currentLocalUri) ||
      !localVersionMatchesRemote
    ) {
      const downloadedUri = await adapter.downloadAvatar(userId, currentPath);
      const afterDownload = adapter.store.getState();
      if (
        !isCurrent() ||
        afterDownload.getAvatarRevision(userId) !== reconcileRevision ||
        afterDownload.avatarSyncActions[userId]
      ) {
        adapter.removeLocalAvatar(userId, downloadedUri);
        return;
      }
      await reconciled.setCachedAvatarForUser(userId, downloadedUri, currentPath);
      if (currentLocalUri && currentLocalUri !== downloadedUri) {
        adapter.removeLocalAvatar(userId, currentLocalUri);
      }
    }
  } else if (currentLocalUri) {
    const beforeClear = adapter.store.getState();
    if (
      beforeClear.getAvatarRevision(userId) !== reconcileRevision ||
      beforeClear.avatarSyncActions[userId]
    ) {
      return;
    }
    await reconciled.setCachedAvatarForUser(userId, null, null);
    adapter.removeLocalAvatar(userId, currentLocalUri);
  }

  const cleanupStore = adapter.store.getState();
  for (const oldPath of cleanupStore.avatarDeletePaths[userId] ?? []) {
    if (oldPath === adapter.store.getState().avatarPaths[userId]) {
      await cleanupStore.clearAvatarCloudDelete(userId, oldPath);
      continue;
    }
    await adapter.deleteAvatar(userId, oldPath);
    await cleanupStore.clearAvatarCloudDelete(userId, oldPath);
  }
};
