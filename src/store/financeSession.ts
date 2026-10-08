import type { AuthState } from '../auth/authTypes.ts';
import { financeKeyForOwner, type FinanceOwnerId } from './financeOwnerStorage.ts';
import { pruneEmptyLegacyWalletSeeds } from './financeMigration.ts';

type FinanceStoreApi = {
  getState: () => {
    hasHydrated: boolean;
    resetForOwnerSwitch: () => void;
    setHydrationResult: (error: unknown) => void;
  };
  persist: {
    clearStorage: () => Promise<void> | void;
    rehydrate: () => Promise<void> | void;
    setOptions: (options: { name?: string }) => void;
  };
};

type AuthStoreApi = {
  getState: () => Pick<AuthState, 'status' | 'user'>;
  subscribe: (listener: (state: Pick<AuthState, 'status' | 'user'>, previous: Pick<AuthState, 'status' | 'user'>) => void) => () => void;
};

type MaybePromise<T> = T | Promise<T>;

interface SessionControllerDeps {
  financeStore: FinanceStoreApi;
  authStore: AuthStoreApi;
  getFinanceOwner: () => FinanceOwnerId | null;
  setFinanceOwner: (ownerId: FinanceOwnerId | null) => void;
  readLegacy: () => MaybePromise<string | null>;
  readGuest: () => MaybePromise<string | null>;
  readOwner: (ownerId: FinanceOwnerId) => MaybePromise<string | null>;
  writeOwner: (ownerId: FinanceOwnerId, raw: string) => MaybePromise<unknown>;
  removeLegacy: () => MaybePromise<unknown>;
  removeGuest: () => MaybePromise<unknown>;
  suspendFinanceWrites: (suspended: boolean) => void;
}

const ownerOf = (auth: Pick<AuthState, 'status' | 'user'>): FinanceOwnerId | null =>
  auth.status === 'authenticated' ? (auth.user?.id ?? null) : null;

/**
 * Single place that keeps the in-memory finance dataset bound to the active
 * account. Every auth transition (guest <-> A <-> B) resets memory, migrates
 * legacy guest data once, loads the new owner's persisted snapshot, and
 * re-binds persistence — without ever touching other app keys.
 */
export const createFinanceSessionController = (deps: SessionControllerDeps) => {
  let started = false;
  let activeOwner: FinanceOwnerId | null | undefined;
  let inFlight = Promise.resolve();

  const switchTo = async (ownerId: FinanceOwnerId | null): Promise<void> => {
    const finance = deps.financeStore.getState();
    // Bind routing FIRST so any persist write during the switch lands on the
    // new owner's key; suspend writes so the reset itself never persists.
    deps.setFinanceOwner(ownerId);
    deps.suspendFinanceWrites(true);
    finance.resetForOwnerSwitch();
    try {
      if (ownerId) {
        // Migrate the pre-login guest dataset once, and only when the new
        // owner has no dataset yet: guest rows become the first account's
        // local base instead of being lost or leaked to a second account.
        // Both the pre-isolation shared key and the scoped guest key are
        // sources: devices may carry either depending on app version.
        const [ownerRaw, legacyRaw, guestRaw] = await Promise.all([
          Promise.resolve(deps.readOwner(ownerId)).catch(() => null),
          Promise.resolve(deps.readLegacy()).catch(() => null),
          Promise.resolve(deps.readGuest()).catch(() => null),
        ]);
        const guestBase = legacyRaw ?? guestRaw;
        if (!ownerRaw && guestBase) {
          await deps.writeOwner(ownerId, pruneEmptyLegacyWalletSeeds(guestBase));
          await deps.removeLegacy();
          await deps.removeGuest();
        } else if (guestBase) {
          // Owner already has data: never overwrite it, just drop the stale
          // guest copy so it cannot leak into a later account.
          await deps.removeLegacy();
          await deps.removeGuest();
        }
      }
      deps.financeStore.persist.setOptions({ name: financeKeyForOwner(ownerId) });
      await deps.financeStore.persist.rehydrate();
      // Rehydrate merges persisted rows OVER the reset memory state; when the
      // new owner has no persisted rows the merge is a no-op and memory stays
      // at the blank defaults from resetForOwnerSwitch.
      finance.setHydrationResult(null);
    } catch (error) {
      finance.setHydrationResult(error);
    } finally {
      deps.suspendFinanceWrites(false);
    }
    activeOwner = ownerId;
  };

  const handleAuthChange = (
    state: Pick<AuthState, 'status' | 'user'>,
    previous: Pick<AuthState, 'status' | 'user'>,
  ): void => {
    const nextOwner = ownerOf(state);
    const previousOwner = ownerOf(previous);
    if (nextOwner === previousOwner && activeOwner !== undefined) {
      return;
    }
    // Serialize rapid A -> B switches; the last login always wins.
    inFlight = inFlight.then(() => switchTo(nextOwner)).catch((error) => {
      console.error('Finance session switch failed.', error);
    });
  };

  return {
    start: () => {
      if (started) {
        return () => undefined;
      }
      started = true;
      const auth = deps.authStore.getState();
      activeOwner = ownerOf(auth);
      deps.setFinanceOwner(activeOwner);
      deps.financeStore.persist.setOptions({ name: financeKeyForOwner(activeOwner) });
      return deps.authStore.subscribe(handleAuthChange);
    },
  };
};
