import { PassThrough, Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { getSandboxClient } from '../shared/sandbox/sandbox-client.js';
import { validatePreviewEmbedAccessToken } from '../shared/documents/preview-embed-access.js';

function streamWebBody(body: ReadableStream<Uint8Array>): Readable {
  const out = new PassThrough();
  const reader = body.getReader();

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        out.push(Buffer.from(value));
      }
      out.push(null);
    } catch (error) {
      out.destroy(error instanceof Error ? error : new Error('Preview stream failed'));
    }
  })();

  return out;
}

export function registerSandboxEmbedProxyRoutes(app: FastifyInstance): void {
  app.get<{
    Params: { previewSessionId: string };
    Querystring: { access?: string; documentId?: string; raw?: string };
  }>('/internal/preview/embed/:previewSessionId', async (request, reply) => {
    const previewSessionId = request.params.previewSessionId.trim();
    if (!previewSessionId) {
      return reply
        .code(400)
        .type('text/plain; charset=utf-8')
        .send('previewSessionId is required.');
    }

    const accessToken = request.query.access?.trim() ?? '';
    const documentId = request.query.documentId?.trim() ?? '';
    if (
      !accessToken ||
      !documentId ||
      !validatePreviewEmbedAccessToken(previewSessionId, documentId, accessToken)
    ) {
      return reply.code(401).type('text/plain; charset=utf-8').send('Unauthorized.');
    }

    try {
      const sandbox = getSandboxClient();
      const response = await sandbox.fetchPreviewEmbed(previewSessionId, {
        raw: request.query.raw === '1',
      });
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return reply
          .code(response.status)
          .type(contentType)
          .send(errorText || 'Preview is not available.');
      }

      const headers: Record<string, string> = {};
      const contentLength = response.headers.get('content-length');
      const contentDisposition = response.headers.get('content-disposition');
      if (contentLength) {
        headers['content-length'] = contentLength;
      }
      if (contentDisposition) {
        headers['content-disposition'] = contentDisposition;
      }

      if (!response.body) {
        return reply.code(response.status).headers(headers).type(contentType).send();
      }

      return reply
        .code(response.status)
        .headers(headers)
        .type(contentType)
        .send(streamWebBody(response.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (
        message === 'SANDBOX_PREVIEW_UNREACHABLE' ||
        message === 'SANDBOX_INTERNAL_TOKEN is required'
      ) {
        return reply
          .code(502)
          .type('text/plain; charset=utf-8')
          .send('Preview service is currently unavailable.');
      }
      throw error;
    }
  });
}
