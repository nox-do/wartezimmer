import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { IntakeStore } from './intake-store.js';
import Fastify from 'fastify';
import { registerIntakeRoutes } from './routes/intake-routes.js';
import type { ScannerService } from './scanner-service.js';

for (const mode of ['buffer', 'stream'] as const) {
  test(`intake ${mode} rejects unsupported MIME types and derives extensions from allowed types`, async (t) => {
    const basePath = await mkdtemp(path.join(tmpdir(), 'intake-types-'));
    t.after(() => rm(basePath, { recursive: true, force: true }));
    const store = new IntakeStore(basePath);
    const content = Buffer.from('unchanged content');
    const write = (id: string, name: string, mime: string) =>
      mode === 'buffer'
        ? store.writeFromBuffer(id, name, mime, content)
        : store.writeFromStream(id, name, mime, Readable.from(content), content.length);
    for (const mime of ['text/html', 'image/svg+xml', 'image/gif', 'image/webp', 'image/heic']) {
      await assert.rejects(write('rejected', 'x.pdf', mime), /SANDBOX_INTAKE_MIME_NOT_ALLOWED/);
    }
    for (const [mime, extension] of [
      ['application/pdf', '.pdf'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
    ]) {
      for (const name of ['befund.html', 'x.pdf.html', 'scan', 'original.jpeg']) {
        const result = await write(`doc-${mime.replace('/', '-')}-${name}`, name, mime);
        assert.equal(path.basename(result.sourcePath), `source${extension}`);
        assert.deepEqual(await readFile(result.sourcePath), content);
      }
    }
  });
}

test('sandbox intake returns a specific 400 code for unsupported MIME types', async (t) => {
  const basePath = await mkdtemp(path.join(tmpdir(), 'intake-rejected-'));
  t.after(() => rm(basePath, { recursive: true, force: true }));
  const app = Fastify();
  t.after(() => app.close());
  registerIntakeRoutes(app, { intakeBasePath: basePath }, {
    scanDocumentAtPath() {
      throw new Error('unsupported types must not reach the scanner');
    },
  } as unknown as ScannerService);
  for (const mime of ['text/html', 'image/svg+xml', 'image/gif', 'image/webp']) {
    const response = await app.inject({
      method: 'PUT',
      url: '/internal/documents/rejected/intake',
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': 'x.pdf.html',
        'x-mime-type': mime,
      },
      payload: Buffer.from('content'),
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'SANDBOX_INTAKE_MIME_NOT_ALLOWED');
  }
});
