import {
  isManagerError,
  ManagerApiError,
  type ManagerError,
  type RuntimeObservation,
} from '@wartezimmer/server-shared/setup-api';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';

export type { RuntimeObservation } from '@wartezimmer/server-shared/setup-api';

export function managerRefreshError(error: unknown): ManagerError {
  if (error instanceof ManagerApiError) return error.toJSON();
  if (isManagerError(error)) return { ...error };
  return {
    code: 'runtime_observation_unavailable',
    category: 'unavailable',
    retryable: true,
    message:
      'Laufzustand konnte nicht aktualisiert werden. Die angezeigten Betriebsdaten können veraltet sein.',
  };
}

export function runtimeSnapshot(observation: RuntimeObservation): HostRuntimeHealth | null {
  return 'snapshot' in observation ? observation.snapshot : null;
}

export function failedRuntimeObservation(
  previous: RuntimeObservation,
  error: ManagerError,
  failedAt = new Date().toISOString(),
): RuntimeObservation {
  const snapshot = runtimeSnapshot(previous);
  return snapshot
    ? { kind: 'stale', snapshot, error, failedAt }
    : { kind: 'unavailable', error, failedAt };
}

/** Also prevents consumers from treating an unobserved runtime as healthy. */
export function runtimeObservationNotice(observation: RuntimeObservation): string | null {
  switch (observation.kind) {
    case 'idle':
      return 'Laufzustand noch nicht geprüft.';
    case 'current':
      return null;
    case 'stale':
      return `Veraltet — letzter erfolgreicher Stand: ${observation.snapshot.checkedAt}. ${observation.error.message}`;
    case 'unavailable':
      return `Laufzustand nicht prüfbar. ${observation.error.message}`;
  }
}
