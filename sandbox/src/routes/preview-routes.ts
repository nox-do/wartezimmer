import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { IntakeStore, resolveAllowedIntakePath } from '../intake-store.js';
import type { PreviewMode, PreviewSession, PreviewStatus, PreviewStore } from '../preview-store.js';
import type { SandboxConfig } from '../sandbox-config.js';
import type { ScanResult, ScannerService } from '../scanner-service.js';

function previewUnavailableHtml(message: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vorschau nicht verfügbar</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
      .card { border: 1px solid #334155; border-radius: 8px; padding: 16px; background: #111827; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 style="margin-top:0;">Vorschau nicht verfügbar</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}

async function resolveSessionSourcePath(
  sourcePath: string,
  intakeBasePath: string,
): Promise<string | null> {
  return resolveAllowedIntakePath(sourcePath, intakeBasePath);
}

export function registerPreviewRoutes(
  app: FastifyInstance,
  config: Pick<SandboxConfig, 'intakeBasePath'>,
  _scanner: ScannerService,
  previewStore: PreviewStore,
): void {
  const intakeStore = new IntakeStore(config.intakeBasePath);

  app.put<{
    Params: { previewSessionId: string };
    Body: { documentRef?: string; mimeType?: string };
  }>('/internal/preview/sessions/:previewSessionId/document', async (request, reply) => {
    const previewSessionId = request.params.previewSessionId.trim();
    const documentId = request.body.documentRef?.trim() ?? '';
    const mimeType = request.body.mimeType?.trim() ?? '';

    if (!previewSessionId || !documentId || !mimeType) {
      return reply.code(400).send({
        code: 'SANDBOX_INVALID_ARGUMENT',
        message: 'previewSessionId, documentRef and mimeType are required.',
      });
    }

    let scanStatus: ScanResult['status'] = 'source_unavailable';
    let scannedAt = new Date().toISOString();
    let resolvedSourcePath: string | null = null;

    const intake = await intakeStore.readRecord(documentId);
    if (!intake) {
      scanStatus = 'source_unavailable';
    } else if (intake.scanStatus === 'blocked_malware') {
      scanStatus = 'blocked_malware';
      scannedAt = intake.scannedAt;
    } else if (intake.scanStatus !== 'clean') {
      scanStatus = 'scan_error';
      scannedAt = intake.scannedAt;
    } else {
      resolvedSourcePath = await resolveAllowedIntakePath(intake.sourcePath, config.intakeBasePath);
      if (resolvedSourcePath) {
        scanStatus = 'clean';
        scannedAt = intake.scannedAt;
      }
    }

    const isPdf = mimeType === 'application/pdf';
    const previewMode: PreviewMode = isPdf ? 'interactive_pdf' : 'raster_fallback';
    const status: PreviewStatus =
      scanStatus === 'clean'
        ? 'ready'
        : scanStatus === 'blocked_malware'
          ? 'blocked_malware'
          : 'render_error';
    const updatedAt = new Date().toISOString();
    const session: PreviewSession = {
      previewSessionId,
      documentId,
      status,
      previewMode,
      embedUrl: `/internal/preview/embed/${encodeURIComponent(previewSessionId)}`,
      sourcePath: status === 'ready' ? (resolvedSourcePath ?? undefined) : undefined,
      mimeType: status === 'ready' ? mimeType : undefined,
      updatedAt,
    };
    previewStore.set(previewSessionId, session);

    return {
      previewSessionId,
      documentId,
      status: session.status,
      previewMode: session.previewMode,
      embedUrl: session.embedUrl,
      scannedAt,
      updatedAt,
    };
  });

  app.get<{ Params: { previewSessionId: string } }>(
    '/internal/preview/sessions/:previewSessionId',
    async (request, reply) => {
      const previewSessionId = request.params.previewSessionId.trim();
      const session = previewStore.get(previewSessionId);
      if (!session) {
        return reply.code(404).send({
          code: 'SANDBOX_SESSION_NOT_FOUND',
          message: 'Preview session not found.',
        });
      }

      return {
        previewSessionId: session.previewSessionId,
        documentId: session.documentId,
        status: session.status,
        previewMode: session.previewMode,
        embedUrl: session.embedUrl,
        updatedAt: session.updatedAt,
      };
    },
  );

  app.delete<{ Params: { previewSessionId: string } }>(
    '/internal/preview/sessions/:previewSessionId/document',
    async (request, reply) => {
      const previewSessionId = request.params.previewSessionId.trim();
      previewStore.delete(previewSessionId);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { previewSessionId: string } }>(
    '/internal/preview/embed/:previewSessionId',
    async (request, reply) => {
      const previewSessionId = request.params.previewSessionId.trim();
      const session = previewStore.get(previewSessionId);
      if (!session) {
        return reply.code(404).type('text/plain; charset=utf-8').send('Preview session not found');
      }

      if (session.status !== 'ready' || !session.sourcePath || !session.mimeType) {
        return reply
          .code(409)
          .type('text/html; charset=utf-8')
          .send(previewUnavailableHtml('Das Dokument ist für die Vorschau nicht bereit.'));
      }

      const validatedSourcePath = await resolveSessionSourcePath(
        session.sourcePath,
        config.intakeBasePath,
      );
      if (!validatedSourcePath) {
        return reply
          .code(404)
          .type('text/html; charset=utf-8')
          .send(previewUnavailableHtml('Quelldatei wurde nicht gefunden.'));
      }

      return reply
        .header('Content-Disposition', 'inline')
        .type(session.mimeType)
        .send(createReadStream(validatedSourcePath));
    },
  );
}
