import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { CoreDatabase } from '../shared/db/database.js';
import { getSandboxClient } from '../shared/sandbox/sandbox-client.js';
import { registerPatientDocumentRoutes } from './patient-documents-routes.js';

const typeMessage =
  'Dieses Dateiformat wird nicht unterstützt. Bitte laden Sie eine PDF-Datei oder ein Bild als JPG oder PNG hoch.';

for (const mime of ['text/html', 'image/svg+xml', 'image/gif', 'image/webp', 'image/heic']) {
  test(`portal rejects ${mime} before reading the file buffer`, async (t) => {
    const app = Fastify();
    t.after(() => app.close());
    app.addContentTypeParser('multipart/form-data', (_request, _payload, done) =>
      done(null, undefined),
    );
    let buffered = false;
    app.decorateRequest('file', async () => ({
      mimetype: mime,
      file: { resume() {} },
      toBuffer() {
        buffered = true;
        throw new Error('must not read');
      },
    }));
    registerPatientDocumentRoutes(app, {
      isPortalEnabled: () => true,
      getPatientSession: () => ({ visitId: 'visit-1' }),
      isSandboxResetPending: () => false,
    } as unknown as CoreDatabase);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/portal/documents/intake',
      headers: { authorization: 'Bearer token', 'content-type': 'multipart/form-data' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().message, typeMessage);
    assert.equal(response.json().details.reason, 'UNSUPPORTED_FILE_TYPE');
    assert.equal(buffered, false);
  });
}

for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
  test(`portal passes ${mime} unchanged and translates sandbox type rejection`, async (t) => {
    const app = Fastify();
    t.after(() => app.close());
    await app.register(multipart);
    const document = {
      id: 'doc-1',
      visitId: 'visit-1',
      fileName: 'x.pdf.html',
      mimeType: mime,
      sizeBytes: 7,
      status: 'scan_clean' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const contacts = mkdtempSync(path.join(tmpdir(), 'portal-upload-'));
    const previousContacts = process.env.CONTACT_LOOKUP_BASE_PATH;
    process.env.CONTACT_LOOKUP_BASE_PATH = contacts;
    t.after(() => {
      if (previousContacts === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = previousContacts;
      rmSync(contacts, { recursive: true, force: true });
    });
    const db = new CoreDatabase(':memory:');
    t.mock.method(db, 'isPortalEnabled', () => true);
    t.mock.method(db, 'getPatientSession', () => ({
      sessionId: 'session-1',
      visitId: 'visit-1',
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    t.mock.method(db, 'intakePatientDocument', () => document);
    registerPatientDocumentRoutes(app, db);
    const sandbox = getSandboxClient();
    const intake = t.mock.method(sandbox, 'putDocumentIntake', async (_id, buffer, meta) => {
      assert.equal(buffer.toString(), 'content');
      assert.deepEqual(meta, { fileName: 'x.pdf.html', mimeType: mime });
      return {
        documentId: 'doc-1',
        scanStatus: 'clean' as const,
        sizeBytes: 7,
        sha256: 'a'.repeat(64),
        scannedAt: new Date().toISOString(),
      };
    });
    const request = {
      method: 'POST' as const,
      url: '/api/v1/portal/documents/intake',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'multipart/form-data; boundary=test',
      },
      payload: `--test\r\nContent-Disposition: form-data; name="file"; filename="x.pdf.html"\r\nContent-Type: ${mime}\r\n\r\ncontent\r\n--test--\r\n`,
    };
    const response = await app.inject(request);
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().mimeType, mime);
    intake.mock.mockImplementation(async () => {
      throw new Error('SANDBOX_INTAKE_MIME_NOT_ALLOWED');
    });
    const rejected = await app.inject(request);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.json().message, typeMessage);
    assert.equal(rejected.json().details.reason, 'UNSUPPORTED_FILE_TYPE');
    intake.mock.mockImplementation(async () => {
      throw new Error('SANDBOX_INTAKE_UNREACHABLE');
    });
    assert.equal((await app.inject(request)).statusCode, 502);
  });
}
