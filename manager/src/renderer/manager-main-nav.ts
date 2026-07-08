import type { ManagerView } from './host-refresh-controller.js';
import type { HostStatus } from '../shared/host-status.js';

export type MainNavTab = ManagerView;

export type MainNavTabState = {
  active: MainNavTab;
  status: HostStatus | null;
};

function canShowNetwork(status: HostStatus): boolean {
  return status.envExists && status.docker.installed && status.docker.daemonRunning;
}

function canShowMaintenance(status: HostStatus): boolean {
  return status.envExists && status.docker.installed && status.docker.daemonRunning;
}

const TAB_LABELS: Record<MainNavTab, string> = {
  status: 'Status',
  network: 'Netzwerk',
  maintenance: 'Wartung',
  wizard: 'Assistent',
};

const TAB_ORDER: MainNavTab[] = ['status', 'network', 'maintenance', 'wizard'];

function tabDisabled(tab: MainNavTab, status: HostStatus | null): string | null {
  if (!status) {
    return tab === 'status' || tab === 'wizard' ? null : 'Noch nicht verfügbar';
  }
  if (tab === 'network' && !canShowNetwork(status)) {
    return 'Nach der Einrichtung verfügbar';
  }
  if (tab === 'maintenance' && !canShowMaintenance(status)) {
    return 'Nach der Einrichtung verfügbar';
  }
  return null;
}

export function createManagerMainNav(
  root: HTMLElement,
  onNavigate: (tab: MainNavTab) => void,
): {
  render: (state: MainNavTabState) => void;
  show: () => void;
  hide: () => void;
} {
  const buttons = new Map<MainNavTab, HTMLButtonElement>();

  root.replaceChildren();
  root.className = 'main-nav';
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', 'Hauptnavigation');

  for (const tab of TAB_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'main-nav-tab';
    button.dataset.tab = tab;
    button.setAttribute('role', 'tab');
    button.textContent = TAB_LABELS[tab];
    button.addEventListener('click', () => {
      if (!button.disabled) {
        onNavigate(tab);
      }
    });
    buttons.set(tab, button);
    root.append(button);
  }

  function render(state: MainNavTabState): void {
    for (const tab of TAB_ORDER) {
      const button = buttons.get(tab);
      if (!button) {
        continue;
      }
      const disabledReason = tabDisabled(tab, state.status);
      button.disabled = disabledReason !== null;
      button.title = disabledReason ?? '';
      button.classList.toggle('is-active', state.active === tab);
      button.setAttribute('aria-selected', state.active === tab ? 'true' : 'false');
    }
  }

  return {
    render,
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
  };
}
