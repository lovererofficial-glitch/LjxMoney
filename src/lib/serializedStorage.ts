import type { StateStorage } from 'zustand/middleware';

type StorageOperation = 'read' | 'write' | 'remove';
type StorageErrorHandler = (operation: StorageOperation, key: string, error: unknown) => void;

export const createSerializedStorage = (
  storage: StateStorage,
  onError: StorageErrorHandler = (operation, key, error) => {
    console.error(`Local storage ${operation} failed for "${key}".`, error);
  },
): StateStorage => {
  const lastValues = new Map<string, string | null>();
  const skipInitialWrite = new Set<string>();
  const blockedKeys = new Set<string>();
  let writeQueue = Promise.resolve();

  const reportError = (operation: StorageOperation, key: string, error: unknown) => {
    try {
      onError(operation, key, error);
    } catch (reportError) {
      console.error('Local storage error reporting failed.', reportError);
    }
  };

  const enqueueWrite = (operation: () => Promise<void>) => {
    const result = writeQueue.then(operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    getItem: async (key) => {
      skipInitialWrite.add(key);
      try {
        const value = await storage.getItem(key);
        if (value !== null) {
          const persisted = JSON.parse(value) as unknown;
          if (
            typeof persisted !== 'object' ||
            persisted === null ||
            !('state' in persisted) ||
            !('version' in persisted) ||
            typeof persisted.version !== 'number'
          ) {
            throw new Error('Persisted value is not a Zustand state envelope.');
          }
        }
        blockedKeys.delete(key);
        lastValues.set(key, value);
        return value;
      } catch (error) {
        blockedKeys.add(key);
        reportError('read', key, error);
        throw error;
      }
    },
    setItem: (key, value) => {
      if (blockedKeys.has(key)) {
        reportError(
          'write',
          key,
          new Error('Write skipped because persisted data could not be read safely.'),
        );
        return Promise.resolve();
      }
      if (skipInitialWrite.delete(key)) {
        return Promise.resolve();
      }

      return enqueueWrite(async () => {
        if (lastValues.has(key) && lastValues.get(key) === value) {
          return;
        }
        try {
          await storage.setItem(key, value);
          lastValues.set(key, value);
        } catch (error) {
          reportError('write', key, error);
        }
      });
    },
    removeItem: (key) =>
      enqueueWrite(async () => {
        try {
          await storage.removeItem(key);
          blockedKeys.delete(key);
          lastValues.set(key, null);
          skipInitialWrite.delete(key);
        } catch (error) {
          reportError('remove', key, error);
        }
      }),
  };
};
