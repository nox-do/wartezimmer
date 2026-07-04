import {
  isEmergencyBellLoopActive,
  startEmergencyBellLoop,
  stopEmergencyBellLoop,
  unlockEmergencyBellAudio,
} from '$lib/mfa/emergency-bell';
import { opsStream } from '$lib/mfa/ops-stream-store.svelte';
import type { EmergencyOpsSnapshot } from '$lib/mfa/ops-stream-types';

export type MfaActiveEmergency = {
  emergencyId: string;
  raisedAt: string;
};

export const mfaEmergency = $state({
  active: null as MfaActiveEmergency | null,
});

let lastAlertedEmergencyId = $state<string | null>(null);

function applyEmergencySnapshot(snapshot: EmergencyOpsSnapshot) {
  if (snapshot.active && snapshot.emergencyId && snapshot.raisedAt) {
    mfaEmergency.active = {
      emergencyId: snapshot.emergencyId,
      raisedAt: snapshot.raisedAt,
    };

    if (!isEmergencyBellLoopActive() || lastAlertedEmergencyId !== snapshot.emergencyId) {
      lastAlertedEmergencyId = snapshot.emergencyId;
      void unlockEmergencyBellAudio();
      startEmergencyBellLoop(snapshot.emergencyId);
    }
    return;
  }

  stopEmergencyBellLoop();
  mfaEmergency.active = null;
  lastAlertedEmergencyId = null;
}

export function clearMfaEmergency() {
  stopEmergencyBellLoop();
  mfaEmergency.active = null;
  lastAlertedEmergencyId = null;
}

export function mountMfaEmergency(): () => void {
  const stopEmergencyEffect = $effect.root(() => {
    $effect(() => {
      const snapshot = opsStream.emergency;
      if (!snapshot) {
        stopEmergencyBellLoop();
        mfaEmergency.active = null;
        lastAlertedEmergencyId = null;
        return;
      }

      applyEmergencySnapshot(snapshot);
    });
  });

  const unlockOnInteraction = () => {
    void unlockEmergencyBellAudio();
  };
  document.addEventListener('pointerdown', unlockOnInteraction, { passive: true });

  return () => {
    stopEmergencyEffect();
    stopEmergencyBellLoop();
    mfaEmergency.active = null;
    lastAlertedEmergencyId = null;
    document.removeEventListener('pointerdown', unlockOnInteraction);
  };
}
