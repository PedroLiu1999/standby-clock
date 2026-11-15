import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSISTED_STATE,
  loadPersistedState,
  savePersistedState,
  type StorageLike,
} from '../../src/ui/persistence.ts';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('persistence', () => {
  it('returns defaults when storage is null or empty', () => {
    expect(loadPersistedState(null)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(loadPersistedState(createMemoryStorage())).toEqual(DEFAULT_PERSISTED_STATE);
  });

  it('saves and loads valid state round-trip', () => {
    const storage = createMemoryStorage();
    const state = {
      use24Hour: true,
      showSeconds: false,
      nightMode: true,
      petEnabled: false,
      petStats: { energy: 42, happiness: 99, fullness: 15 },
    };

    expect(savePersistedState(state, storage)).toBe(true);
    expect(loadPersistedState(storage)).toEqual(state);
  });

  it('clamps out-of-range stats and falls back on non-finite/invalid fields', () => {
    const storage = createMemoryStorage({
      'standby-clock-state-v1': JSON.stringify({
        use24Hour: 'yes',
        showSeconds: false,
        nightMode: 1,
        petEnabled: true,
        petStats: {
          energy: 150,
          happiness: -20,
          fullness: null,
        },
      }),
    });

    const loaded = loadPersistedState(storage);
    expect(loaded).toEqual({
      use24Hour: false,
      showSeconds: false,
      nightMode: false,
      petEnabled: true,
      petStats: {
        energy: 100,
        happiness: 0,
        fullness: DEFAULT_PERSISTED_STATE.petStats.fullness,
      },
    });
  });

  it('handles corrupted JSON and throwing storage gracefully', () => {
    const badJsonStorage = createMemoryStorage({
      'standby-clock-state-v1': '{not valid json',
    });
    expect(loadPersistedState(badJsonStorage)).toEqual(DEFAULT_PERSISTED_STATE);

    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadPersistedState(throwingStorage)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(savePersistedState(DEFAULT_PERSISTED_STATE, throwingStorage)).toBe(false);
  });
});
