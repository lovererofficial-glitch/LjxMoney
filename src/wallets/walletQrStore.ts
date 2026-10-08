import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

export const walletQrKeyForUserWallet = (userId: string, walletId: string) =>
  `ljxmoney.wallet.paymentQr.${userId}.${walletId}`;
const walletQrDeleteKeyForUserWallet = (userId: string, walletId: string) =>
  `${walletQrKeyForUserWallet(userId, walletId)}.pending-delete`;
const walletQrUploadKeyForUserWallet = (userId: string, walletId: string) =>
  `${walletQrKeyForUserWallet(userId, walletId)}.pending-upload`;
const walletQrCloudPathKeyForUserWallet = (userId: string, walletId: string) =>
  `${walletQrKeyForUserWallet(userId, walletId)}.cloud-path`;

export type WalletQrMap = Record<string, Record<string, string | null>>;

interface WalletQrState {
  walletQrs: WalletQrMap;
  pendingDeletes: Record<string, Record<string, boolean>>;
  pendingUploads: Record<string, Record<string, boolean>>;
  cloudPaths: Record<string, Record<string, string | null>>;
  hydrateWalletQr: (userId: string, walletId: string) => Promise<string | null>;
  setQrForWallet: (userId: string, walletId: string, uri: string | null) => Promise<void>;
  clearQrForWallet: (userId: string, walletId: string) => Promise<void>;
  queueQrDeletion: (userId: string, walletId: string) => Promise<void>;
  hasPendingQrDeletion: (userId: string, walletId: string) => Promise<boolean>;
  clearPendingQrDeletion: (userId: string, walletId: string) => Promise<void>;
  queueQrUpload: (userId: string, walletId: string) => Promise<void>;
  hasPendingQrUpload: (userId: string, walletId: string) => Promise<boolean>;
  clearPendingQrUpload: (userId: string, walletId: string) => Promise<void>;
  getQrCloudPath: (userId: string, walletId: string) => Promise<string | null>;
  setQrCloudPath: (userId: string, walletId: string, path: string | null) => Promise<void>;
  clearAll: () => void;
}

export const createWalletQrStore = (storage: StateStorage) =>
  create<WalletQrState>()((set, get) => ({
    walletQrs: {},
    pendingDeletes: {},
    pendingUploads: {},
    cloudPaths: {},
    hydrateWalletQr: async (userId, walletId) => {
      const key = walletQrKeyForUserWallet(userId, walletId);
      try {
        const raw = await storage.getItem(key);
        const value = raw && raw.trim() ? raw : null;
        set((state) => ({
          walletQrs: {
            ...state.walletQrs,
            [userId]: {
              ...(state.walletQrs[userId] ?? {}),
              [walletId]: value,
            },
          },
        }));
        return value;
      } catch {
        set((state) => ({
          walletQrs: {
            ...state.walletQrs,
            [userId]: {
              ...(state.walletQrs[userId] ?? {}),
              [walletId]: null,
            },
          },
        }));
        return null;
      }
    },
    setQrForWallet: async (userId, walletId, uri) => {
      const next = uri && uri.trim() ? uri.trim() : null;
      set((state) => ({
        walletQrs: {
          ...state.walletQrs,
          [userId]: {
            ...(state.walletQrs[userId] ?? {}),
            [walletId]: next,
          },
        },
        cloudPaths: {
          ...state.cloudPaths,
          [userId]: { ...(state.cloudPaths[userId] ?? {}), [walletId]: null },
        },
      }));

      try {
        const key = walletQrKeyForUserWallet(userId, walletId);
        if (next) {
          await storage.setItem(key, next);
        } else {
          await storage.removeItem(key);
        }
      } catch {
        // Keep the in-memory state even if the native write fails.
      }
      try {
        await storage.removeItem(walletQrCloudPathKeyForUserWallet(userId, walletId));
      } catch {
        // The in-memory marker is cleared even if local storage fails.
      }
    },
    clearQrForWallet: async (userId, walletId) => {
      set((state) => ({
        walletQrs: {
          ...state.walletQrs,
          [userId]: {
            ...(state.walletQrs[userId] ?? {}),
            [walletId]: null,
          },
        },
        cloudPaths: {
          ...state.cloudPaths,
          [userId]: { ...(state.cloudPaths[userId] ?? {}), [walletId]: null },
        },
      }));

      try {
        await storage.removeItem(walletQrKeyForUserWallet(userId, walletId));
      } catch {
        // Fail-safe for local-only wallet QR state.
      }
      try {
        await storage.removeItem(walletQrCloudPathKeyForUserWallet(userId, walletId));
      } catch {
        // A stale version marker is harmless once the image is removed.
      }
    },
    queueQrDeletion: async (userId, walletId) => {
      set((state) => ({
        pendingDeletes: {
          ...state.pendingDeletes,
          [userId]: { ...(state.pendingDeletes[userId] ?? {}), [walletId]: true },
        },
      }));
      try {
        await storage.setItem(walletQrDeleteKeyForUserWallet(userId, walletId), '1');
      } catch {
        // Local removal still takes priority if writing the retry marker fails.
      }
    },
    hasPendingQrDeletion: async (userId, walletId) => {
      try {
        if ((await storage.getItem(walletQrDeleteKeyForUserWallet(userId, walletId))) === '1') {
          set((state) => ({
            pendingDeletes: {
              ...state.pendingDeletes,
              [userId]: { ...(state.pendingDeletes[userId] ?? {}), [walletId]: true },
            },
          }));
          return true;
        }
      } catch {
        return Boolean(get().pendingDeletes[userId]?.[walletId]);
      }
      return Boolean(get().pendingDeletes[userId]?.[walletId]);
    },
    clearPendingQrDeletion: async (userId, walletId) => {
      set((state) => ({
        pendingDeletes: {
          ...state.pendingDeletes,
          [userId]: { ...(state.pendingDeletes[userId] ?? {}), [walletId]: false },
        },
      }));
      try {
        await storage.removeItem(walletQrDeleteKeyForUserWallet(userId, walletId));
      } catch {
        // A repeated storage delete is idempotent and retried next sync.
      }
    },
    queueQrUpload: async (userId, walletId) => {
      set((state) => ({
        pendingUploads: {
          ...state.pendingUploads,
          [userId]: { ...(state.pendingUploads[userId] ?? {}), [walletId]: true },
        },
      }));
      try {
        await storage.setItem(walletQrUploadKeyForUserWallet(userId, walletId), '1');
      } catch {
        // Keep the in-memory retry marker if local storage is unavailable.
      }
    },
    hasPendingQrUpload: async (userId, walletId) => {
      try {
        if ((await storage.getItem(walletQrUploadKeyForUserWallet(userId, walletId))) === '1') {
          set((state) => ({
            pendingUploads: {
              ...state.pendingUploads,
              [userId]: { ...(state.pendingUploads[userId] ?? {}), [walletId]: true },
            },
          }));
          return true;
        }
      } catch {
        return Boolean(get().pendingUploads[userId]?.[walletId]);
      }
      return Boolean(get().pendingUploads[userId]?.[walletId]);
    },
    clearPendingQrUpload: async (userId, walletId) => {
      set((state) => ({
        pendingUploads: {
          ...state.pendingUploads,
          [userId]: { ...(state.pendingUploads[userId] ?? {}), [walletId]: false },
        },
      }));
      try {
        await storage.removeItem(walletQrUploadKeyForUserWallet(userId, walletId));
      } catch {
        // A repeated upload is idempotent and retried after the next sync.
      }
    },
    getQrCloudPath: async (userId, walletId) => {
      try {
        const path = await storage.getItem(walletQrCloudPathKeyForUserWallet(userId, walletId));
        const value = path?.trim() || null;
        set((state) => ({
          cloudPaths: {
            ...state.cloudPaths,
            [userId]: { ...(state.cloudPaths[userId] ?? {}), [walletId]: value },
          },
        }));
        return value;
      } catch {
        return get().cloudPaths[userId]?.[walletId] ?? null;
      }
    },
    setQrCloudPath: async (userId, walletId, path) => {
      const next = path?.trim() || null;
      set((state) => ({
        cloudPaths: {
          ...state.cloudPaths,
          [userId]: { ...(state.cloudPaths[userId] ?? {}), [walletId]: next },
        },
      }));
      try {
        const key = walletQrCloudPathKeyForUserWallet(userId, walletId);
        if (next) {
          await storage.setItem(key, next);
        } else {
          await storage.removeItem(key);
        }
      } catch {
        // The local file remains usable even if its cloud marker cannot persist.
      }
    },
    clearAll: () => set({ walletQrs: {}, pendingDeletes: {}, pendingUploads: {}, cloudPaths: {} }),
  }));

export const useWalletQrStore = createWalletQrStore(AsyncStorage);
