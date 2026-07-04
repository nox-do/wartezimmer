import { createLogger } from '../logging/logger.js';
import { domainError } from '../errors/domain-error.js';
import { getSandboxClient } from '../sandbox/sandbox-client.js';

const log = createLogger('documents.sandbox-cleanup');

function readCleanupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'UNKNOWN_ERROR';
}

/** Best-effort rollback during intake/render error paths — failures are logged only. */
export async function purgeSandboxDocumentBestEffort(documentId: string): Promise<void> {
  const normalizedId = documentId.trim();
  if (!normalizedId) {
    return;
  }

  try {
    await getSandboxClient().deleteDocument(normalizedId);
  } catch (error) {
    log.warn('Sandbox document purge failed (best effort).', {
      documentId: normalizedId,
      error: readCleanupError(error),
    });
  }
}

/** Required before DB discard/export completion — propagates sandbox errors to the caller. */
export async function purgeSandboxDocument(documentId: string): Promise<void> {
  const normalizedId = documentId.trim();
  if (!normalizedId) {
    throw domainError('INVALID_ARGUMENT');
  }

  try {
    await getSandboxClient().deleteDocument(normalizedId);
  } catch (error) {
    log.warn('Sandbox document purge failed.', {
      documentId: normalizedId,
      error: readCleanupError(error),
    });
    throw error;
  }
}

export async function purgeSandboxPreviewSessionBestEffort(
  previewSessionId: string,
): Promise<void> {
  const normalizedId = previewSessionId.trim();
  if (!normalizedId) {
    return;
  }

  try {
    await getSandboxClient().clearPreviewSessionDocument(normalizedId);
  } catch (error) {
    log.warn('Sandbox preview session purge failed (best effort).', {
      previewSessionId: normalizedId,
      error: readCleanupError(error),
    });
  }
}

/** Purge sandbox intake artifacts before DB marks discard/export complete. */
export async function purgeDocumentArtifacts(documentId: string): Promise<void> {
  await purgeSandboxDocument(documentId);
}
