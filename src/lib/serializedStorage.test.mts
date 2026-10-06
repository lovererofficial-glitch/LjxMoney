import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import { createSerializedStorage } from './serializedStorage.ts';

const envelope = (language: string) => JSON.stringify({ state: { language }, version: 1 });

test('serializes persistence writes and continues after a failed native write', async () => {
  let activeWrites = 0;
  let maxActiveWrites = 0;
  const persisted = new Map<string, string>();
  const errors: unknown[] = [];
  const storage: StateStorage = {
    getItem: (key) => persisted.get(key) ?? null,
    setItem: async (key, value) => {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeWrites -= 1;
      if (value === 'fail') {
        throw new Error('native write failed');
      }
      persisted.set(key, value);
    },
    removeItem: async (key) => {
      persisted.delete(key);
    },
  };
  const safeStorage = createSerializedStorage(storage, (_operation, _key, error) => {
    errors.push(error);
  });

  await Promise.all([
    safeStorage.setItem('finance', 'first'),
    safeStorage.setItem('language', 'fail'),
    safeStorage.setItem('finance', 'last'),
  ]);

  assert.equal(maxActiveWrites, 1);
  assert.equal(persisted.get('finance'), 'last');
  assert.equal(persisted.has('language'), false);
  assert.equal(errors.length, 1);
});

test('skips the hydration echo and unchanged snapshots', async () => {
  let writeCount = 0;
  const storedValue = envelope('vi');
  const storage: StateStorage = {
    getItem: () => storedValue,
    setItem: async () => {
      writeCount += 1;
    },
    removeItem: () => undefined,
  };
  const safeStorage = createSerializedStorage(storage, () => undefined);

  assert.equal(await safeStorage.getItem('language'), storedValue);
  await safeStorage.setItem('language', storedValue);
  await safeStorage.setItem('language', storedValue);
  assert.equal(writeCount, 0);

  await safeStorage.setItem('language', envelope('en'));
  assert.equal(writeCount, 1);
});

test('preserves unreadable persisted data and retries writes after a successful read', async () => {
  let storedValue = 'not-json';
  let writeCount = 0;
  const errors: unknown[] = [];
  const storage: StateStorage = {
    getItem: () => storedValue,
    setItem: async (_key, value) => {
      writeCount += 1;
      storedValue = value;
    },
    removeItem: () => undefined,
  };
  const safeStorage = createSerializedStorage(storage, (_operation, _key, error) => {
    errors.push(error);
  });

  await assert.rejects(Promise.resolve(safeStorage.getItem('finance')));
  await safeStorage.setItem('finance', envelope('vi'));
  assert.equal(storedValue, 'not-json');
  assert.equal(writeCount, 0);

  storedValue = envelope('vi');
  await safeStorage.getItem('finance');
  await safeStorage.setItem('finance', envelope('vi'));
  await safeStorage.setItem('finance', envelope('en'));
  assert.equal(JSON.parse(storedValue).state.language, 'en');
  assert.equal(writeCount, 1);
  assert.equal(errors.length, 2);
});
