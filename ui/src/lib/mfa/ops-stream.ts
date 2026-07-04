import { buildApiStreamUrl } from '$lib/api/build-api-url';
import { SSE_CLIENT_ERROR, connectMultiEventSseStream } from '$lib/api/sse-client';
import { markAuthUnauthorized } from '$lib/auth/session-state.svelte';
import { t } from '$lib/i18n/i18nStore.svelte';
import {
  applyDevicePairingOpsSnapshot,
  applyDevicePresenceOpsSnapshot,
  applyEmergencyOpsSnapshot,
  resetOpsStreamStore,
} from './ops-stream-store.svelte';
import {
  parseDevicePairingOpsSnapshot,
  parseDevicePresenceOpsSnapshot,
  parseEmergencyOpsSnapshot,
} from './ops-stream-parse';

export type OpsStreamHandlers = {
  onError?: (message: string) => void;
};

export function connectOpsStream(handlers: OpsStreamHandlers = {}): () => void {
  const disconnect = connectMultiEventSseStream({
    url: buildApiStreamUrl('/api/v1/ops/stream'),
    credentials: 'include',
    handlers: {
      emergency: (data) => {
        const snapshot = parseEmergencyOpsSnapshot(data);
        if (snapshot) {
          applyEmergencyOpsSnapshot(snapshot);
        }
      },
      'device.presence': (data) => {
        const snapshot = parseDevicePresenceOpsSnapshot(data);
        if (snapshot) {
          applyDevicePresenceOpsSnapshot(snapshot);
        }
      },
      'device.pairing': (data) => {
        const snapshot = parseDevicePairingOpsSnapshot(data);
        if (snapshot) {
          applyDevicePairingOpsSnapshot(snapshot);
        }
      },
    },
    onError: (message) => {
      if (message === SSE_CLIENT_ERROR.unauthorized || message === SSE_CLIENT_ERROR.forbidden) {
        markAuthUnauthorized();
        handlers.onError?.(t('auth.loginRequiredTitle'));
        return;
      }

      handlers.onError?.(message);
    },
  });

  return () => {
    disconnect();
    resetOpsStreamStore();
  };
}
