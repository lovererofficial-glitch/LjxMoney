import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

import { getSupabaseClient } from '../lib/supabase';

export const PROFILE_AVATAR_BUCKET = 'profile-avatars';
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const normalizeMimeType = (mimeType: string | null | undefined) => {
  const normalized = mimeType?.toLowerCase().trim();
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  return normalized && MIME_EXTENSIONS[normalized] ? normalized : null;
};

const assertPathPart = (value: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('Invalid avatar owner or version.');
  }
};

const localAvatarDirectory = (userId: string) =>
  new Directory(Paths.document, 'profile-avatars', userId);

const localAvatarFile = (userId: string, version: string, mimeType: string) =>
  new File(localAvatarDirectory(userId), `avatar-${version}.${MIME_EXTENSIONS[mimeType]}`);

export const profileAvatarObjectPath = (
  userId: string,
  version: string,
  mimeType: string,
) => {
  assertPathPart(userId);
  assertPathPart(version);
  const extension = MIME_EXTENSIONS[normalizeMimeType(mimeType) ?? ''];
  if (!extension) {
    throw new Error('Unsupported avatar image format.');
  }
  return `${userId}/avatar/${version}.${extension}`;
};

export const saveProfileAvatarLocally = async (
  userId: string,
  asset: ImagePickerAsset,
): Promise<{ uri: string; mimeType: string }> => {
  if (asset.type && asset.type !== 'image') {
    throw new Error('Selected avatar is not an image.');
  }
  if (!asset.uri?.trim()) {
    throw new Error('Selected avatar has no local URI.');
  }

  const source = new File(asset.uri);
  const size = asset.fileSize ?? source.size;
  if (!Number.isFinite(size) || size <= 0 || size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('Selected avatar is larger than 5 MB or unavailable.');
  }
  const mimeType = normalizeMimeType(asset.mimeType) ?? normalizeMimeType(source.type);
  if (!mimeType) {
    throw new Error('Unsupported avatar image format.');
  }

  assertPathPart(userId);
  const version = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const directory = localAvatarDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = localAvatarFile(userId, version, mimeType);
  await source.copy(destination, { overwrite: true });
  return { uri: destination.uri, mimeType };
};

export const removeLocalProfileAvatar = (userId: string, uri: string) => {
  const directoryUri = localAvatarDirectory(userId).uri;
  if (uri.startsWith(`${directoryUri}/`)) {
    try {
      new File(uri).delete();
    } catch {
      // The cache reference can be cleared even when local cleanup fails.
    }
  }
};

export const isProfileAvatarFileAvailable = (uri: string) => {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

export const uploadProfileAvatar = async (
  userId: string,
  uri: string,
  mimeType?: string,
): Promise<string> => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  const file = new File(uri);
  const size = file.size;
  if (!file.exists || !Number.isFinite(size) || size <= 0 || size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('Local avatar is unavailable or larger than 5 MB.');
  }
  const contentType = normalizeMimeType(mimeType) ?? normalizeMimeType(file.type);
  if (!contentType) {
    throw new Error('Unsupported avatar image format.');
  }
  const prefix = 'avatar-';
  const extension = `.${MIME_EXTENSIONS[contentType]}`;
  if (!file.name.startsWith(prefix) || !file.name.endsWith(extension)) {
    throw new Error('Local avatar version is invalid.');
  }
  const version = file.name.slice(prefix.length, -extension.length);
  const path = profileAvatarObjectPath(userId, version, contentType);
  const { error } = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(
    path,
    new Uint8Array(await file.arrayBuffer()),
    { contentType, upsert: true, cacheControl: '3600' },
  );
  if (error) {
    throw error;
  }
  return path;
};

export const downloadProfileAvatar = async (userId: string, path: string): Promise<string> => {
  const prefix = `${userId}/avatar/`;
  if (!path.startsWith(prefix)) {
    throw new Error('Avatar path does not match its owner.');
  }
  const filename = path.slice(prefix.length);
  const match = /^([a-zA-Z0-9_-]+)\.(png|jpg|webp|heic|heif)$/.exec(filename);
  if (!match) {
    throw new Error('Remote avatar path is invalid.');
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  const { data, error } = await client.storage.from(PROFILE_AVATAR_BUCKET).download(path);
  if (error || !data) {
    throw error ?? new Error('Avatar download returned no image.');
  }
  if (data.size <= 0 || data.size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('Remote avatar is larger than 5 MB or empty.');
  }
  const mimeType = normalizeMimeType(data.type) ?? normalizeMimeType(`image/${match[2] === 'jpg' ? 'jpeg' : match[2]}`);
  if (!mimeType) {
    throw new Error('Remote avatar format is unsupported.');
  }

  const directory = localAvatarDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = localAvatarFile(userId, match[1], mimeType);
  destination.write(new Uint8Array(await data.arrayBuffer()));
  return destination.uri;
};

export const deleteProfileAvatarFromCloud = async (userId: string, path: string) => {
  assertPathPart(userId);
  if (!path.startsWith(`${userId}/avatar/`) || !/^[A-Za-z0-9_-]+\.(png|jpg|webp|heic|heif)$/.test(path.slice(`${userId}/avatar/`.length))) {
    throw new Error('Avatar path does not match its owner.');
  }
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  const { error } = await client.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  if (error) {
    throw error;
  }
};
