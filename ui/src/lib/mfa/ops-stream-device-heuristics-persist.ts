export type PersistedDeviceHeuristics = {
  wasOnline: Record<string, boolean>;
  wasPaired: Record<string, boolean>;
};

const STORAGE_KEY = 'pf-mfa-device-heuristics';

export function loadPersistedDeviceHeuristics(): PersistedDeviceHeuristics {
  if (typeof sessionStorage === 'undefined') {
    return { wasOnline: {}, wasPaired: {} };
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { wasOnline: {}, wasPaired: {} };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDeviceHeuristics>;
    return {
      wasOnline: parsed.wasOnline ?? {},
      wasPaired: parsed.wasPaired ?? {},
    };
  } catch {
    return { wasOnline: {}, wasPaired: {} };
  }
}

export function savePersistedDeviceHeuristics(heuristics: PersistedDeviceHeuristics): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(heuristics));
  } catch {
    // ignore quota / private mode
  }
}
