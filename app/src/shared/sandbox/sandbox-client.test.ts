import assert from 'node:assert/strict';
import test from 'node:test';
import { SandboxClient } from './sandbox-client.js';

for (const [status, body, expected] of [
  [400, { code: 'SANDBOX_INTAKE_MIME_NOT_ALLOWED' }, 'SANDBOX_INTAKE_MIME_NOT_ALLOWED'],
  [400, { code: 'SANDBOX_INVALID_ARGUMENT' }, 'SANDBOX_INTAKE_FAILED:400'],
  [503, { code: 'SANDBOX_INTAKE_MIME_NOT_ALLOWED' }, 'SANDBOX_INTAKE_FAILED:503'],
] as const) {
  test(`intake preserves only the specific sandbox MIME rejection (${status}, ${body.code})`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }));
    const client = new SandboxClient('http://sandbox', 'token', {
      requestTimeoutMs: 1000,
      previewPutTimeoutMs: 1000,
      intakePutTimeoutMs: 1000,
      embedTimeoutMs: 1000,
    });
    await assert.rejects(
      client.putDocumentIntake('doc', Buffer.from('content'), {
        fileName: 'x.png',
        mimeType: 'image/png',
      }),
      (error: unknown) => error instanceof Error && error.message === expected,
    );
  });
}
