import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    praxisManager: PraxisManagerApi;
  }
}

export {};
