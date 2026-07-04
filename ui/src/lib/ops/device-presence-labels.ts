import { t } from '$lib/i18n/i18nStore.svelte';
import type { DevicePresenceStatus } from '$lib/ops/device-presence-api';

export function deviceStatusLabel(status: DevicePresenceStatus): string {
  switch (status) {
    case 'online':
      return t('mfa.displayOnline');
    case 'stale':
      return t('mfa.displayStale');
    default:
      return t('mfa.displayOffline');
  }
}
