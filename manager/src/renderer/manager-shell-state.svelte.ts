import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { ManagerView } from './host-refresh-controller.js';
import type { WizardPresentation } from './manager-navigation.js';

export type ManagerShellState = {
  activeView: ManagerView;
  wizardPresentation: WizardPresentation;
  hostStatus: HostStatus | null;
  runtimeHealth: HostRuntimeHealth | null;
  runtimeError: string | null;
  statusError: string | null;
};

export const managerShell = $state<ManagerShellState>({
  activeView: 'status',
  wizardPresentation: 'embedded',
  hostStatus: null,
  runtimeHealth: null,
  runtimeError: null,
  statusError: null,
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
