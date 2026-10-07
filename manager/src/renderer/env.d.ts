/// <reference types="vite/client" />

import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    wartezimmerManager: WartezimmerManagerApi;
    wartezimmerManagerBridge: WartezimmerManagerApi;
  }
}

export {};
