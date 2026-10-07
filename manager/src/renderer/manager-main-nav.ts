import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
import type { ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { effectiveDocker } from './host-snapshot-selectors.js';

export type MainNavTab = ManagerView;

export const TAB_LABELS: Record<MainNavTab, string> = {
  status: 'Status',
  network: 'Netzwerk',
  maintenance: 'Wartung',
  wizard: 'Assistent',
};

export const TAB_ORDER: MainNavTab[] = ['status', 'network', 'maintenance', 'wizard'];

/** Tools tabs need a config snapshot; runtime alone must not unlock them. */
export function setupReadyForTools(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null = null,
): boolean {
  if (!config || hasBlockingMaintenanceOperation(config)) {
    return false;
  }
  const docker = effectiveDocker(config, runtime);
  return (
    config.installation?.kind === 'healthy' && Boolean(docker?.installed && docker?.daemonRunning)
  );
}

export function tabDisabled(
  tab: MainNavTab,
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null = null,
): string | null {
  if (!config) {
    return tab === 'status' || tab === 'wizard' ? null : 'Noch nicht verfügbar';
  }
  if (tab !== 'status' && hasBlockingMaintenanceOperation(config))
    return 'Offenen Wartungsvorgang zuerst klären; siehe Status und Diagnose';
  if (tab === 'wizard' && !config.installation) {
    return 'Laufzustand nicht prüfbar – bitte den Status erneut prüfen';
  }
  if (
    tab === 'wizard' &&
    (config.installation?.kind === 'needs-repair' || config.installation?.kind === 'inconsistent')
  ) {
    return 'Zuerst die Installation prüfen und die angezeigten Ursachen beheben';
  }
  if ((tab === 'network' || tab === 'maintenance') && !setupReadyForTools(config, runtime)) {
    return 'Nach der Einrichtung verfügbar';
  }
  return null;
}
