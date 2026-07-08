import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { MaintenanceCallbacks } from './maintenance-controller.js';

export type MaintenanceViewAdapter = {
  show: (status: HostStatus) => void;
  hide: () => void;
  setLoading: (loading: boolean) => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
};

let adapter: MaintenanceViewAdapter | null = null;
let callbacks: MaintenanceCallbacks = {};

export function registerMaintenanceViewAdapter(next: MaintenanceViewAdapter): () => void {
  adapter = next;
  return () => {
    if (adapter === next) {
      adapter = null;
    }
  };
}

export function tryGetMaintenanceViewAdapter(): MaintenanceViewAdapter | null {
  return adapter;
}

export function getMaintenanceViewAdapter(): MaintenanceViewAdapter {
  if (!adapter) {
    throw new Error('MaintenanceView noch nicht gemountet.');
  }
  return adapter;
}

export function setMaintenanceCallbacks(next: MaintenanceCallbacks): void {
  callbacks = next;
}

export function getMaintenanceCallbacks(): MaintenanceCallbacks {
  return callbacks;
}
