import type { HostStatus, LoadDeliveryImagesResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export const WIZARD_RELEASE_IMPORT_LOADING_MESSAGE =
  'Release-Paket wird geprüft und geladen. Das kann auf langsameren Rechnern einige Minuten dauern.';

export type ReleaseImportProgress = {
  phase: 'loading';
  statusText: string;
};

export type PickAndLoadReleaseArchiveResult = {
  ok: boolean;
  canceled: boolean;
  error?: string;
  result?: LoadDeliveryImagesResult;
};

export function deliveryImagesReady(status: HostStatus | null): boolean {
  if (!status?.deliveryImages.required) {
    return true;
  }
  return status.deliveryImages.ready;
}

export function needsDeliveryImages(status: HostStatus | null): boolean {
  return Boolean(status?.deliveryImages.required && !status.deliveryImages.ready);
}

export function deliveryImagesSummary(status: HostStatus): string {
  const images = status.deliveryImages;
  if (!images.required) {
    return 'nicht erforderlich (Dev-Build)';
  }
  if (images.ready) {
    return `✓ ${images.appImage}, ${images.sandboxImage}`;
  }
  if (images.configured && (!images.appPresent || !images.sandboxPresent)) {
    return '✗ konfiguriert, lokal nicht geladen';
  }
  return '✗ Release-Paket fehlt';
}

export async function pickAndLoadReleaseArchive(
  api: PraxisManagerApi,
  options?: {
    restartCompose?: boolean;
    loadingMessage?: string;
    onProgress?: (progress: ReleaseImportProgress) => void;
  },
): Promise<PickAndLoadReleaseArchiveResult> {
  const picked = await api.selectReleaseArchive();
  if (picked.canceled || !picked.path) {
    return { ok: false, canceled: true };
  }

  const loadingMessage =
    options?.loadingMessage ??
    'Release-Paket wird geprüft und geladen. Das kann einige Minuten dauern.';
  options?.onProgress?.({ phase: 'loading', statusText: loadingMessage });

  try {
    const result = await api.loadDeliveryImages({
      archivePath: picked.path,
      restartCompose: Boolean(options?.restartCompose),
    });
    return { ok: true, canceled: false, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, canceled: false, error: message };
  }
}
