import type { ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';

export type MainNavTab = ManagerView;

export const TAB_LABELS: Record<MainNavTab, string> = {
  status: 'Status',
  network: 'Netzwerk',
  maintenance: 'Wartung',
  wizard: 'Assistent',
};

export const TAB_ORDER: MainNavTab[] = ['status', 'network', 'maintenance', 'wizard'];

export function setupReadyForTools(status: HostStatus): boolean {
  return status.envExists && status.docker.installed && status.docker.daemonRunning;
}

export function tabDisabled(tab: MainNavTab, status: HostStatus | null): string | null {
  if (!status) {
    return tab === 'status' || tab === 'wizard' ? null : 'Noch nicht verfügbar';
  }
  if ((tab === 'network' || tab === 'maintenance') && !setupReadyForTools(status)) {
    return 'Nach der Einrichtung verfügbar';
  }
  return null;
}
