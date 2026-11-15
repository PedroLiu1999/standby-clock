import type { PetStats } from '../pet/types.ts';

export interface PersistedState {
  use24Hour: boolean;
  showSeconds: boolean;
  nightMode: boolean;
  petEnabled: boolean;
  petStats: PetStats;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'standby-clock-state-v1';

export const DEFAULT_PET_STATS: PetStats = {
  energy: 85,
  happiness: 80,
  fullness: 75,
};

export const DEFAULT_PERSISTED_STATE: PersistedState = {
  use24Hour: false,
  showSeconds: true,
  nightMode: false,
  petEnabled: true,
  petStats: { ...DEFAULT_PET_STATS },
};

function clampStat(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, value));
}

export function sanitizePetStats(raw: unknown): PetStats {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PET_STATS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    energy: clampStat(obj.energy, DEFAULT_PET_STATS.energy),
    happiness: clampStat(obj.happiness, DEFAULT_PET_STATS.happiness),
    fullness: clampStat(obj.fullness, DEFAULT_PET_STATS.fullness),
  };
}

export function sanitizePersistedState(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_PERSISTED_STATE,
      petStats: { ...DEFAULT_PET_STATS },
    };
  }
  const obj = raw as Record<string, unknown>;
  return {
    use24Hour:
      typeof obj.use24Hour === 'boolean'
        ? obj.use24Hour
        : DEFAULT_PERSISTED_STATE.use24Hour,
    showSeconds:
      typeof obj.showSeconds === 'boolean'
        ? obj.showSeconds
        : DEFAULT_PERSISTED_STATE.showSeconds,
    nightMode:
      typeof obj.nightMode === 'boolean'
        ? obj.nightMode
        : DEFAULT_PERSISTED_STATE.nightMode,
    petEnabled:
      typeof obj.petEnabled === 'boolean'
        ? obj.petEnabled
        : DEFAULT_PERSISTED_STATE.petEnabled,
    petStats: sanitizePetStats(obj.petStats),
  };
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadPersistedState(
  storage: StorageLike | null = getDefaultStorage(),
): PersistedState {
  if (!storage) {
    return {
      ...DEFAULT_PERSISTED_STATE,
      petStats: { ...DEFAULT_PET_STATS },
    };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PERSISTED_STATE,
        petStats: { ...DEFAULT_PET_STATS },
      };
    }
    const parsed: unknown = JSON.parse(raw);
    return sanitizePersistedState(parsed);
  } catch {
    return {
      ...DEFAULT_PERSISTED_STATE,
      petStats: { ...DEFAULT_PET_STATS },
    };
  }
}

export function savePersistedState(
  state: PersistedState,
  storage: StorageLike | null = getDefaultStorage(),
): boolean {
  if (!storage) {
    return false;
  }
  try {
    const sanitized = sanitizePersistedState(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}
