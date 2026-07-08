import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { HostStatus } from '../shared/host-status.js';
import type { NetworkCallbacks } from './network-controller.js';

export type NetworkViewAdapter = {
  show: (status: HostStatus) => void;
  hide: () => void;
  setLoading: (loading: boolean) => void;
  applyConfigSnapshot: (status: HostStatus) => void;
  applyRuntimeHealth: (health: HostRuntimeHealth) => void;
};

let adapter: NetworkViewAdapter | null = null;
let callbacks: NetworkCallbacks = {};

export function registerNetworkViewAdapter(next: NetworkViewAdapter): () => void {
  adapter = next;
  return () => {
    if (adapter === next) {
      adapter = null;
    }
  };
}

export function tryGetNetworkViewAdapter(): NetworkViewAdapter | null {
  return adapter;
}

export function getNetworkViewAdapter(): NetworkViewAdapter {
  if (!adapter) {
    throw new Error('NetworkView noch nicht gemountet.');
  }
  return adapter;
}

export function setNetworkCallbacks(next: NetworkCallbacks): void {
  callbacks = next;
}

export function getNetworkCallbacks(): NetworkCallbacks {
  return callbacks;
}
