import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import {
  createProfileAvatarStore,
  resolveProfileDisplayName,
} from './avatarStore.ts';
import { syncProfileWithAdapter, type ProfileSyncAdapter } from './profileSyncCore.ts';

const createMemoryStorage = (): StateStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

const createSyncAdapter = (
  store: ReturnType<typeof createProfileAvatarStore>,
  initialProfile: { displayName: string | null; avatarPath: string | null },
) => {
  let remoteProfile = { ...initialProfile };
  let failNextNameSave = false;
  let failNextDelete = false;
  let failNextUpload = false;
  let failNextPathSave = false;
  const deletedPaths: string[] = [];
  const downloadedPaths: string[] = [];
  const adapter: ProfileSyncAdapter = {
    store,
    fetchRemote: async () => ({ ...remoteProfile }),
    saveDisplayName: async (_userId, displayName) => {
      if (failNextNameSave) {
        failNextNameSave = false;
        throw new Error('Network request failed');
      }
      remoteProfile = { ...remoteProfile, displayName };
    },
    saveAvatarPath: async (_userId, avatarPath) => {
      if (failNextPathSave) {
        failNextPathSave = false;
        throw new Error('Network request failed');
      }
      remoteProfile = { ...remoteProfile, avatarPath };
    },
    uploadAvatar: async (_userId, uri) => {
      if (failNextUpload) {
        failNextUpload = false;
        throw new Error('Network request failed');
      }
      return `${_userId}/avatar/${uri.includes('v3') ? 'v3' : 'v2'}.jpg`;
    },
    downloadAvatar: async (_userId, path) => {
      downloadedPaths.push(path);
      return `file:///cache/${path.split('/').at(-1)}`;
    },
    deleteAvatar: async (_userId, path) => {
      if (failNextDelete) {
        failNextDelete = false;
        throw new Error('Network request failed');
      }
      deletedPaths.push(path);
    },
    isAvatarAvailable: (uri) => !uri.includes('missing'),
    removeLocalAvatar: () => undefined,
  };
  return {
    adapter,
    getRemoteProfile: () => remoteProfile,
    deletedPaths,
    downloadedPaths,
    failNextNameSave: () => { failNextNameSave = true; },
    failNextDelete: () => { failNextDelete = true; },
    failNextUpload: () => { failNextUpload = true; },
    failNextPathSave: () => { failNextPathSave = true; },
  };
};

test('Home display name prefers profile name then email prefix then localized fallback', () => {
  assert.equal(resolveProfileDisplayName('  Le Thanh Dat  ', 'user@example.com', 'You'), 'Le Thanh Dat');
  assert.equal(resolveProfileDisplayName(null, 'user@example.com', 'You'), 'user');
  assert.equal(resolveProfileDisplayName('', null, 'You'), 'You');
});

test('display names persist by user and local edits survive remote hydration until synced', async () => {
  const storage = createMemoryStorage();
  const profiles = createProfileAvatarStore(storage);
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setDisplayNameForUser('user-a', 'Name A');
  await profiles.getState().setDisplayNameForUser('user-b', 'Name B');

  await profiles.getState().applyRemoteProfile('user-a', 'Cloud A', 'user-a/avatar/cloud-v1.png');
  assert.equal(profiles.getState().displayNames['user-a'], 'Name A');
  assert.equal(profiles.getState().avatarPaths['user-a'], 'user-a/avatar/cloud-v1.png');
  assert.equal(profiles.getState().displayNames['user-b'], 'Name B');

  await profiles.getState().completeDisplayNameSync('user-a', 'Name A');
  profiles.getState().clearAll();
  const afterRestart = createProfileAvatarStore(storage);
  await afterRestart.getState().hydrateUser('user-a');
  await afterRestart.getState().hydrateUser('user-b');
  assert.equal(afterRestart.getState().displayNames['user-a'], 'Name A');
  assert.equal(afterRestart.getState().displayNames['user-b'], 'Name B');
  assert.equal(afterRestart.getState().displayNamePending['user-a'], false);
  assert.equal(afterRestart.getState().displayNamePending['user-b'], true);
});

test('avatar add, replace, remove, pending retry and logout/login remain user isolated', async () => {
  const storage = createMemoryStorage();
  const profiles = createProfileAvatarStore(storage);
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setCachedAvatarForUser('user-a', 'file:///a-cloud-v1.jpg', 'user-a/avatar/v1.jpg');

  await profiles.getState().setAvatarForUser('user-a', 'file:///a-local-v2.jpg');
  const firstRevision = profiles.getState().getAvatarRevision('user-a');
  assert.equal(profiles.getState().avatarSyncActions['user-a'], 'upload');
  assert.equal(profiles.getState().avatarPaths['user-a'], 'user-a/avatar/v1.jpg');

  await profiles.getState().setAvatarForUser('user-a', 'file:///a-local-v3.jpg');
  const latestRevision = profiles.getState().getAvatarRevision('user-a');
  assert.ok(latestRevision > firstRevision);
  assert.equal(await profiles.getState().completeAvatarSync('user-a', firstRevision, 'user-a/avatar/v2.jpg'), false);
  assert.equal(profiles.getState().avatars['user-a'], 'file:///a-local-v3.jpg');
  assert.equal(await profiles.getState().completeAvatarSync('user-a', latestRevision, 'user-a/avatar/v3.jpg'), true);
  assert.equal(profiles.getState().avatarPaths['user-a'], 'user-a/avatar/v3.jpg');
  assert.equal(profiles.getState().avatarSyncActions['user-a'], null);

  await profiles.getState().setAvatarForUser('user-a', null);
  assert.equal(profiles.getState().avatars['user-a'], null);
  assert.equal(profiles.getState().avatarSyncActions['user-a'], 'remove');
  assert.equal(profiles.getState().avatarPaths['user-a'], 'user-a/avatar/v3.jpg');
  profiles.getState().clearAll();

  const afterLogin = createProfileAvatarStore(storage);
  await afterLogin.getState().hydrateUser('user-b');
  assert.equal(afterLogin.getState().avatars['user-b'], null);
  assert.equal(afterLogin.getState().displayNames['user-b'], null);
  await afterLogin.getState().hydrateUser('user-a');
  assert.equal(afterLogin.getState().avatars['user-a'], null);
  assert.equal(afterLogin.getState().avatarPaths['user-a'], 'user-a/avatar/v3.jpg');
  assert.equal(afterLogin.getState().avatarSyncActions['user-a'], 'remove');
});

test('profile sync uploads the latest avatar version and retries old-object cleanup', async () => {
  const profiles = createProfileAvatarStore(createMemoryStorage());
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setDisplayNameForUser('user-a', 'Name A');
  await profiles.getState().setCachedAvatarForUser('user-a', 'file:///cache/v1.jpg', 'user-a/avatar/v1.jpg');
  await profiles.getState().setAvatarForUser('user-a', 'file:///cache/v2.jpg');
  const sync = createSyncAdapter(profiles, { displayName: 'Cloud A', avatarPath: 'user-a/avatar/v1.jpg' });
  sync.failNextDelete();

  await assert.rejects(() => syncProfileWithAdapter('user-a', sync.adapter));
  assert.equal(sync.getRemoteProfile().displayName, 'Name A');
  assert.equal(sync.getRemoteProfile().avatarPath, 'user-a/avatar/v2.jpg');
  assert.equal(profiles.getState().avatars['user-a'], 'file:///cache/v2.jpg');
  assert.deepEqual(profiles.getState().avatarDeletePaths['user-a'], ['user-a/avatar/v1.jpg']);

  await syncProfileWithAdapter('user-a', sync.adapter);
  assert.deepEqual(sync.deletedPaths, ['user-a/avatar/v1.jpg']);
  assert.deepEqual(profiles.getState().avatarDeletePaths['user-a'], []);
  assert.equal(sync.downloadedPaths.length, 0);
});

test('profile sync restores a remote avatar when local bytes are missing', async () => {
  const profiles = createProfileAvatarStore(createMemoryStorage());
  await profiles.getState().hydrateUser('user-b');
  const sync = createSyncAdapter(profiles, {
    displayName: 'Name B',
    avatarPath: 'user-b/avatar/remote-v4.jpg',
  });

  await syncProfileWithAdapter('user-b', sync.adapter);
  assert.deepEqual(sync.downloadedPaths, ['user-b/avatar/remote-v4.jpg']);
  assert.equal(profiles.getState().avatars['user-b'], 'file:///cache/remote-v4.jpg');
  assert.equal(profiles.getState().avatarPaths['user-b'], 'user-b/avatar/remote-v4.jpg');
});

test('offline avatar upload leaves a durable pending image and retries after reconnect', async () => {
  const storage = createMemoryStorage();
  const profiles = createProfileAvatarStore(storage);
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setAvatarForUser('user-a', 'file:///cache/a-v2.jpg');
  const sync = createSyncAdapter(profiles, { displayName: 'Name A', avatarPath: null });
  sync.failNextUpload();

  await assert.rejects(() => syncProfileWithAdapter('user-a', sync.adapter));
  assert.equal(profiles.getState().avatars['user-a'], 'file:///cache/a-v2.jpg');
  assert.equal(profiles.getState().avatarSyncActions['user-a'], 'upload');

  profiles.getState().clearAll();
  const afterRestart = createProfileAvatarStore(storage);
  await afterRestart.getState().hydrateUser('user-a');
  const retry = createSyncAdapter(afterRestart, { displayName: 'Name A', avatarPath: null });
  await syncProfileWithAdapter('user-a', retry.adapter);
  assert.equal(retry.getRemoteProfile().avatarPath, 'user-a/avatar/v2.jpg');
  assert.equal(afterRestart.getState().avatarSyncActions['user-a'], null);
});

test('avatar upload retry reuses the same version when saving profile metadata fails', async () => {
  const profiles = createProfileAvatarStore(createMemoryStorage());
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setAvatarForUser('user-a', 'file:///cache/a-v2.jpg');
  const sync = createSyncAdapter(profiles, { displayName: 'Name A', avatarPath: null });
  sync.failNextPathSave();

  await assert.rejects(() => syncProfileWithAdapter('user-a', sync.adapter));
  assert.equal(profiles.getState().avatarSyncActions['user-a'], 'upload');
  await syncProfileWithAdapter('user-a', sync.adapter);
  assert.equal(sync.getRemoteProfile().avatarPath, 'user-a/avatar/v2.jpg');
  assert.equal(profiles.getState().avatarSyncActions['user-a'], null);
});

test('remote avatar removal clears the local cache and removes its private object', async () => {
  const profiles = createProfileAvatarStore(createMemoryStorage());
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setCachedAvatarForUser('user-a', 'file:///cache/old.jpg', 'user-a/avatar/old.jpg');
  const sync = createSyncAdapter(profiles, { displayName: 'Name A', avatarPath: null });

  await syncProfileWithAdapter('user-a', sync.adapter);
  assert.equal(profiles.getState().avatars['user-a'], null);
  assert.equal(profiles.getState().avatarPaths['user-a'], null);
  assert.deepEqual(sync.deletedPaths, ['user-a/avatar/old.jpg']);
});

test('local avatar removal syncs a null path before deleting the old cloud object', async () => {
  const profiles = createProfileAvatarStore(createMemoryStorage());
  await profiles.getState().hydrateUser('user-a');
  await profiles.getState().setCachedAvatarForUser('user-a', 'file:///cache/old.jpg', 'user-a/avatar/old.jpg');
  await profiles.getState().clearAvatarForUser('user-a');
  const sync = createSyncAdapter(profiles, { displayName: 'Name A', avatarPath: 'user-a/avatar/old.jpg' });

  await syncProfileWithAdapter('user-a', sync.adapter);
  assert.equal(sync.getRemoteProfile().avatarPath, null);
  assert.equal(profiles.getState().avatarSyncActions['user-a'], null);
  assert.deepEqual(sync.deletedPaths, ['user-a/avatar/old.jpg']);
});
