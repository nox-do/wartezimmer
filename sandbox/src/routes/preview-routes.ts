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

function imagePreviewHtml(mimeType: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bildvorschau</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111827; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { display: flex; flex-direction: column; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 6px 10px; background: rgba(17, 24, 39, 0.96); border-bottom: 1px solid rgba(148, 163, 184, 0.22); }
      button { width: 32px; height: 32px; border: 1px solid rgba(148, 163, 184, 0.32); border-radius: 999px; background: rgba(31, 41, 55, 0.92); color: #f9fafb; font: 700 18px/1 system-ui, sans-serif; cursor: pointer; }
      button:hover:not(:disabled), button:focus-visible { background: rgba(55, 65, 81, 0.98); outline: none; border-color: rgba(209, 213, 219, 0.55); }
      button:disabled { opacity: 0.45; cursor: default; }
      .fit { width: auto; min-width: 56px; padding-inline: 12px; font-size: 12px; font-weight: 700; letter-spacing: 0; }
      .zoom { min-width: 52px; text-align: center; font-size: 12px; font-weight: 700; color: #cbd5e1; }
      .stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 24px; background: #111827; }
      .stage.is-overflowing { place-items: start center; }
      img { display: block; max-width: none; max-height: none; width: auto; height: auto; user-select: none; -webkit-user-drag: none; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42); background: #fff; }
      .state { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #cbd5e1; font-size: 14px; }
      .state[hidden] { display: none; }
    </style>
  </head>
  <body>
    <div class="toolbar" aria-label="Bild-Zoom">
      <button type="button" id="zoomOut" aria-label="Verkleinern">-</button>
      <span class="zoom" id="zoomLabel">100%</span>
      <button type="button" id="zoomIn" aria-label="Vergroessern">+</button>
      <button type="button" class="fit" id="fit" aria-label="An Bildschirm anpassen">Fit</button>
    </div>
    <div class="stage" id="stage">
      <p class="state" id="state">Bild wird geladen...</p>
      <img id="image" alt="Dokumentvorschau" decoding="async" />
    </div>
    <script>
      const stage = document.getElementById('stage');
      const image = document.getElementById('image');
      const state = document.getElementById('state');
      const zoomLabel = document.getElementById('zoomLabel');
      const zoomIn = document.getElementById('zoomIn');
      const zoomOut = document.getElementById('zoomOut');
      const fit = document.getElementById('fit');
      const minScale = 0.1;
      const maxScale = 8;
      const zoomStep = 1.2;
      let scale = 1;
      let fitScale = 1;
      let fitMode = true;

      function clamp(value) {
        return Math.min(maxScale, Math.max(minScale, value));
      }

      function availableSize() {
        const styles = window.getComputedStyle(stage);
        const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        return {
          width: Math.max(1, stage.clientWidth - horizontalPadding),
          height: Math.max(1, stage.clientHeight - verticalPadding),
        };
      }

      function computeFitScale() {
        if (!image.naturalWidth || !image.naturalHeight) {
          return 1;
        }
        const available = availableSize();
        return Math.min(1, available.width / image.naturalWidth, available.height / image.naturalHeight);
      }

      function render() {
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        image.style.width = width + 'px';
        image.style.height = height + 'px';
        zoomLabel.textContent = Math.round(scale * 100) + '%';
        stage.classList.toggle('is-overflowing', width > stage.clientWidth || height > stage.clientHeight);
        zoomOut.disabled = scale <= minScale + 0.001;
        zoomIn.disabled = scale >= maxScale - 0.001;
      }

      function applyFit() {
        fitMode = true;
        fitScale = computeFitScale();
        scale = fitScale;
        render();
      }

      function applyZoom(nextScale) {
        fitMode = false;
        scale = clamp(nextScale);
        render();
      }

      function rawImageUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set('raw', '1');
        return url.toString();
      }

      image.addEventListener('load', () => {
        state.hidden = true;
        applyFit();
      });
      image.addEventListener('error', () => {
        state.textContent = 'Bild konnte nicht geladen werden.';
        state.hidden = false;
      });
      zoomOut.addEventListener('click', () => applyZoom(scale / zoomStep));
      zoomIn.addEventListener('click', () => applyZoom(scale * zoomStep));
      fit.addEventListener('click', applyFit);
      window.addEventListener('resize', () => {
        fitScale = computeFitScale();
        if (fitMode) {
          scale = fitScale;
        } else {
          scale = clamp(scale);
        }
        render();
      });
      window.addEventListener('keydown', (event) => {
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          applyZoom(scale * zoomStep);
        } else if (event.key === '-') {
          event.preventDefault();
          applyZoom(scale / zoomStep);
        } else if (event.key === '0') {
          event.preventDefault();
          applyZoom(1);
        } else if (event.key.toLowerCase() === 'f') {
          event.preventDefault();
          applyFit();
        }
      });
      stage.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        applyZoom(scale * (event.deltaY < 0 ? zoomStep : 1 / zoomStep));
      }, { passive: false });
      image.src = rawImageUrl();
      image.dataset.mimeType = ${JSON.stringify(mimeType)};
    </script>
  </body>
</html>`;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
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

  app.get<{ Params: { previewSessionId: string }; Querystring: { raw?: string } }>(
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

      const rawRequested = request.query.raw === '1';
      if (isImageMimeType(session.mimeType) && !rawRequested) {
        return reply.type('text/html; charset=utf-8').send(imagePreviewHtml(session.mimeType));
      }

      return reply
        .header('Content-Disposition', 'inline')
        .type(session.mimeType)
        .send(createReadStream(validatedSourcePath));
    },
  );
}
