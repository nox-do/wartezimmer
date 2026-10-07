import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSandboxApp } from '../app.js';
import type { SandboxConfig } from '../sandbox-config.js';

function testConfig(intakeBasePath: string): SandboxConfig {
  return {
    docsBasePath: path.join(intakeBasePath, 'docs'),
    intakeBasePath,
    scannerDbPath: path.join(intakeBasePath, 'clamav'),
    scanEnabled: false,
    scanTimeoutMs: 1000,
    maxSignatureAgeHours: 24,
    sandboxAuthEnabled: false,
    sandboxInternalToken: '',
    host: '127.0.0.1',
    port: 0,
  };
}

test('image preview embed serves a fit-to-screen HTML viewer and raw image asset', async () => {
  const basePath = await mkdtemp(path.join(tmpdir(), 'wartezimmer-preview-'));
  const app = buildSandboxApp(testConfig(basePath));

  try {
    const imageBody = Buffer.from('not-a-real-png-but-streamable');
    const intake = await app.inject({
      method: 'PUT',
      url: '/internal/documents/doc-1/intake',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(imageBody.length),
        'x-file-name': 'scan.png',
        'x-mime-type': 'image/png',
      },
      payload: imageBody,
    });
    assert.equal(intake.statusCode, 200);

    const preview = await app.inject({
      method: 'PUT',
      url: '/internal/preview/sessions/session-1/document',
      payload: {
        documentRef: 'doc-1',
        mimeType: 'image/png',
      },
    });
    assert.equal(preview.statusCode, 200);

    const viewer = await app.inject({
      method: 'GET',
      url: '/internal/preview/embed/session-1',
    });
    assert.equal(viewer.statusCode, 200);
    assert.match(viewer.headers['content-type']?.toString() ?? '', /^text\/html\b/);
    assert.match(viewer.body, /const maxScale = 8;/);
    assert.match(viewer.body, /url\.searchParams\.set\('raw', '1'\)/);
    assert.match(viewer.body, /Math\.min\(1, available\.width \/ image\.naturalWidth/);

    const raw = await app.inject({
      method: 'GET',
      url: '/internal/preview/embed/session-1?raw=1',
    });
    assert.equal(raw.statusCode, 200);
    assert.match(raw.headers['content-type']?.toString() ?? '', /^image\/png\b/);
    assert.equal(raw.body, imageBody.toString());
  } finally {
    await app.close();
    await rm(basePath, { recursive: true, force: true });
  }
});

test('deleting a document releases its preview session and missing source has a distinct status', async () => {
  const basePath = await mkdtemp(path.join(tmpdir(), 'wartezimmer-preview-cleanup-'));
  const app = buildSandboxApp(testConfig(basePath));
  try {
    await app.inject({
      method: 'PUT',
      url: '/internal/documents/doc/intake',
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': 'doc.pdf',
        'x-mime-type': 'application/pdf',
      },
      payload: Buffer.from('pdf-content'),
    });
    await app.inject({
      method: 'PUT',
      url: '/internal/preview/sessions/session/document',
      payload: { documentRef: 'doc', mimeType: 'application/pdf' },
    });
    assert.equal(
      (await app.inject({ method: 'DELETE', url: '/internal/documents/doc' })).statusCode,
      204,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/internal/preview/sessions/session' })).statusCode,
      404,
    );
    const missing = await app.inject({
      method: 'PUT',
      url: '/internal/preview/sessions/session/document',
      payload: { documentRef: 'doc', mimeType: 'application/pdf' },
    });
    assert.equal(missing.json().status, 'source_unavailable');
  } finally {
    await app.close();
    await rm(basePath, { recursive: true, force: true });
  }
});
