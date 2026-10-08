import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

import { getSupabaseClient } from '../lib/supabase';

export const WALLET_QR_BUCKET = 'wallet-payment-qrs';
export const WALLET_QR_MAX_BYTES = 12 * 1024 * 1024;

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

const assertPathSegment = (value: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('Invalid wallet QR owner path.');
  }
};

export const walletQrObjectPath = (userId: string, walletId: string, version: string) => {
  assertPathSegment(userId);
  assertPathSegment(walletId);
  assertPathSegment(version);
  return `${userId}/${walletId}/payment-qr-${version}`;
};

const localQrDirectory = (userId: string) =>
  new Directory(Paths.document, 'wallet-payment-qrs', userId);

const localQrFile = (userId: string, walletId: string, mimeType: string, version?: string) =>
  new File(
    localQrDirectory(userId),
    `wallet-${walletId}${version ? `-${version}` : ''}.${MIME_EXTENSIONS[mimeType]}`,
  );

export const saveWalletQrLocally = async (
  userId: string,
  walletId: string,
  asset: ImagePickerAsset,
): Promise<{ uri: string; mimeType: string }> => {
  if (asset.type && asset.type !== 'image') {
    throw new Error('Selected asset is not an image.');
  }
  if (!asset.uri?.trim()) {
    throw new Error('Selected image has no local URI.');
  }

  const source = new File(asset.uri);
  const size = asset.fileSize ?? source.size;
  if (!Number.isFinite(size) || size <= 0 || size > WALLET_QR_MAX_BYTES) {
    throw new Error('Selected image size is invalid.');
  }

  const mimeType = normalizeMimeType(asset.mimeType) ?? normalizeMimeType(source.type);
  if (!mimeType) {
    throw new Error('Selected image format is unsupported.');
  }

  assertPathSegment(userId);
  assertPathSegment(walletId);
  const directory = localQrDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const version = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const destination = localQrFile(userId, walletId, mimeType, version);
  await source.copy(destination, { overwrite: true });
  return { uri: destination.uri, mimeType };
};

export const removeLocalWalletQr = (userId: string, walletId: string, uri: string) => {
  const directoryUri = localQrDirectory(userId).uri;
  if (uri.startsWith(`${directoryUri}/`)) {
    try {
      new File(uri).delete();
    } catch {
      // Removing the persisted reference is sufficient if local cleanup fails.
    }
  }
  assertPathSegment(walletId);
};

export const isWalletQrFileAvailable = (uri: string) => {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

export const uploadWalletQr = async (
  userId: string,
  walletId: string,
  uri: string,
  mimeType?: string,
): Promise<string> => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }

  const file = new File(uri);
  const size = file.size;
  if (!file.exists || !Number.isFinite(size) || size <= 0 || size > WALLET_QR_MAX_BYTES) {
    throw new Error('Local wallet QR is unavailable or too large.');
  }
  const contentType = normalizeMimeType(mimeType) ?? normalizeMimeType(file.type);
  if (!contentType) {
    throw new Error('Local wallet QR format is unsupported.');
  }

  const prefix = `wallet-${walletId}-`;
  const extension = `.${MIME_EXTENSIONS[contentType]}`;
  if (!file.name.startsWith(prefix) || !file.name.endsWith(extension)) {
    throw new Error('Local wallet QR version is invalid.');
  }
  const version = file.name.slice(prefix.length, -extension.length);
  const path = walletQrObjectPath(userId, walletId, version);
  const { error } = await client.storage.from(WALLET_QR_BUCKET).upload(
    path,
    new Uint8Array(await file.arrayBuffer()),
    { contentType, upsert: true, cacheControl: '3600' },
  );
  if (error) {
    throw error;
  }
  return path;
};

export const downloadWalletQr = async (
  userId: string,
  walletId: string,
  path: string,
): Promise<string> => {
  const objectPrefix = `${userId}/${walletId}/payment-qr-`;
  if (!path.startsWith(objectPrefix)) {
    throw new Error('Wallet QR path does not match its owner.');
  }
  const version = path.slice(objectPrefix.length);
  assertPathSegment(version);
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  const { data, error } = await client.storage.from(WALLET_QR_BUCKET).download(path);
  if (error || !data) {
    throw error ?? new Error('Wallet QR download returned no image.');
  }

  const mimeType = normalizeMimeType(data.type);
  if (!mimeType || data.size > WALLET_QR_MAX_BYTES) {
    throw new Error('Downloaded wallet QR format or size is invalid.');
  }
  const directory = localQrDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = localQrFile(userId, walletId, mimeType, version);
  destination.write(new Uint8Array(await data.arrayBuffer()));
  return destination.uri;
};

export const deleteWalletQrFromCloud = async (userId: string, walletId: string) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  assertPathSegment(userId);
  assertPathSegment(walletId);
  const bucket = client.storage.from(WALLET_QR_BUCKET);
  const folder = `${userId}/${walletId}`;
  const { data, error: listError } = await bucket.list(folder, { limit: 100 });
  if (listError) {
    throw listError;
  }
  const paths = (data ?? [])
    .filter((item) => item.name.startsWith('payment-qr-'))
    .map((item) => `${folder}/${item.name}`);
  const { error } = paths.length ? await bucket.remove(paths) : { error: null };
  if (error) {
    throw error;
  }
};

export const pruneWalletQrVersions = async (
  userId: string,
  walletId: string,
  currentPath: string,
) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Cloud storage is not configured.');
  }
  if (!currentPath.startsWith(`${userId}/${walletId}/payment-qr-`)) {
    throw new Error('Wallet QR path does not match its owner.');
  }

  const bucket = client.storage.from(WALLET_QR_BUCKET);
  const folder = `${userId}/${walletId}`;
  const { data, error: listError } = await bucket.list(folder, { limit: 100 });
  if (listError) {
    throw listError;
  }
  const stalePaths = (data ?? [])
    .filter((item) => item.name.startsWith('payment-qr-'))
    .map((item) => `${folder}/${item.name}`)
    .filter((path) => path !== currentPath);
  if (stalePaths.length) {
    const { error } = await bucket.remove(stalePaths);
    if (error) {
      throw error;
    }
  }
};
