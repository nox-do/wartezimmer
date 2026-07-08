import type { HostStatus } from '../shared/host-status.js';
import type { WizardPresentation } from './manager-navigation.js';
import type { WizardCallbacks } from './wizard-controller.js';

export type WizardViewAdapter = {
  show: (status: HostStatus | null, presentation: WizardPresentation) => void;
  hide: () => void;
};

let adapter: WizardViewAdapter | null = null;
let callbacks: Partial<WizardCallbacks> = {};

export function registerWizardViewAdapter(next: WizardViewAdapter): () => void {
  adapter = next;
  return () => {
    if (adapter === next) {
      adapter = null;
    }
  };
}

export function tryGetWizardViewAdapter(): WizardViewAdapter | null {
  return adapter;
}

export function getWizardViewAdapter(): WizardViewAdapter {
  if (!adapter) {
    throw new Error('WizardView noch nicht gemountet.');
  }
  return adapter;
}

export function setWizardCallbacks(next: Partial<WizardCallbacks>): void {
  callbacks = next;
}

export function getWizardCallbacks(): Partial<WizardCallbacks> {
  return callbacks;
}
