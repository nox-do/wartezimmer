import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { ManagerView } from './host-refresh-controller.js';
import type { WizardPresentation } from './manager-navigation.js';

export type MaintenanceSession = {
  generation: number;
  status: HostStatus;
};

export type NetworkSession = {
  generation: number;
  status: HostStatus;
};

export type WizardSession = {
  generation: number;
  status: HostStatus | null;
  presentation: WizardPresentation;
};

export type ManagerShellState = {
  activeView: ManagerView;
  wizardPresentation: WizardPresentation;
  hostStatus: HostStatus | null;
  runtimeHealth: HostRuntimeHealth | null;
  runtimeError: string | null;
  statusError: string | null;
  viewLoading: {
    maintenance: boolean;
    network: boolean;
  };
  maintenanceSession: MaintenanceSession | null;
  networkSession: NetworkSession | null;
  wizardSession: WizardSession | null;
};

let nextSessionGeneration = 0;

function nextGeneration(): number {
  nextSessionGeneration += 1;
  return nextSessionGeneration;
}

export const managerShell = $state<ManagerShellState>({
  activeView: 'status',
  wizardPresentation: 'embedded',
  hostStatus: null,
  runtimeHealth: null,
  runtimeError: null,
  statusError: null,
  viewLoading: {
    maintenance: false,
    network: false,
  },
  maintenanceSession: null,
  networkSession: null,
  wizardSession: null,
});

export function wizardFullscreen(shell: ManagerShellState = managerShell): boolean {
  return shell.activeView === 'wizard' && shell.wizardPresentation === 'fullscreen';
}

export function showChrome(shell: ManagerShellState = managerShell): boolean {
  return !wizardFullscreen(shell);
}

export function applyShellNavigation(
  view: ManagerView,
  options: { wizardPresentation?: WizardPresentation } = {},
): void {
  managerShell.activeView = view;
  if (options.wizardPresentation) {
    managerShell.wizardPresentation = options.wizardPresentation;
  }
}

export function applyRuntimeHealth(runtime: HostRuntimeHealth): void {
  managerShell.runtimeHealth = runtime;
  managerShell.runtimeError = null;

  // Keep Status/Maintenance/Network config snapshots aligned with the 12s runtime poll
  // for overlapping live fields (compose, probes, docker, …).
  const status = managerShell.hostStatus;
  if (status) {
    managerShell.hostStatus = {
      ...status,
      envExists: runtime.envExists,
      docker: runtime.docker,
      compose: runtime.compose,
      probes: runtime.probes,
      sandboxScanner: runtime.sandboxScanner,
      network: {
        ...status.network,
        configuredLanIp: runtime.configuredLanIp,
      },
    };
  }
}

export function applyHostStatus(status: HostStatus): void {
  managerShell.hostStatus = status;
  clearStatusError();
}

export function applyRuntimeError(message: string): void {
  managerShell.runtimeError = message;
}

export function applyStatusError(message: string): void {
  managerShell.statusError = message;
}

export function clearStatusError(): void {
  managerShell.statusError = null;
}

export function setDeferredViewLoading(
  view: 'maintenance' | 'network',
  loading: boolean,
): void {
  managerShell.viewLoading[view] = loading;
}

export function clearMaintenanceSession(): void {
  managerShell.maintenanceSession = null;
}

export function clearNetworkSession(): void {
  managerShell.networkSession = null;
}

export function clearWizardSession(): void {
  managerShell.wizardSession = null;
}

export function beginMaintenanceSession(status: HostStatus): void {
  managerShell.maintenanceSession = {
    generation: nextGeneration(),
    status,
  };
}

export function beginNetworkSession(status: HostStatus): void {
  managerShell.networkSession = {
    generation: nextGeneration(),
    status,
  };
}

export function beginWizardSession(
  status: HostStatus | null,
  presentation: WizardPresentation,
): void {
  managerShell.wizardSession = {
    generation: nextGeneration(),
    status,
    presentation,
  };
}

export function clearInactiveViewSessions(active: ManagerView): void {
  if (active !== 'maintenance') {
    clearMaintenanceSession();
    setDeferredViewLoading('maintenance', false);
  }
  if (active !== 'network') {
    clearNetworkSession();
    setDeferredViewLoading('network', false);
  }
  if (active !== 'wizard') {
    clearWizardSession();
  }
}
