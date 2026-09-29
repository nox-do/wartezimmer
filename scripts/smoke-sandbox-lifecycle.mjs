/** Isolated Docker check: never attaches to the installed application or its volumes. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = `pf-sandbox-check-${randomUUID().slice(0, 8)}`;
const volume = `${name}-signatures`;
const image = process.env.SANDBOX_TEST_IMAGE || 'praxis-flow/sandbox:6.1.0';
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 45_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const inside = (code) => docker('exec', name, 'node', '--input-type=module', '-e', code);
const waitReady = async (previous) => {
  for (let n = 0; n < 80; n++) {
    try {
      const id = JSON.parse(
        inside(
          "console.log(JSON.stringify(await (await fetch('http://127.0.0.1:8081/internal/health/live')).json()))",
        ),
      ).instanceId;
      if (id && id !== previous) return id;
    } catch {
      /* Restart temporarily makes exec unavailable. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Sandbox did not start/restart');
};
try {
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--pull',
    'never',
    '--network',
    'none',
    '--restart',
    'unless-stopped',
    '--read-only',
    '--security-opt',
    'no-new-privileges:true',
    '--log-driver',
    'json-file',
    '--log-opt',
    'max-size=1m',
    '--log-opt',
    'max-file=2',
    '--tmpfs',
    '/var/lib/praxis-flow/sandbox-intake:size=256m,mode=0700',
    '--tmpfs',
    '/tmp:size=64m,mode=1777',
    '--tmpfs',
    '/var/log/clamav:size=8m,mode=1777',
    '-v',
    `${volume}:/var/lib/clamav`,
    '-v',
    `${root}/sandbox/dist:/app/sandbox/dist:ro`,
    '-v',
    `${root}/packages/server-shared/dist:/app/packages/server-shared/dist:ro`,
    '-e',
    'SANDBOX_SCAN_ENABLED=false',
    '-e',
    'SANDBOX_AUTH_ENABLED=true',
    '-e',
    'SANDBOX_INTERNAL_TOKEN=isolated-test-token',
    image,
  );
  const previous = await waitReady();
  assert.equal(
    inside(
      "import fs from 'node:fs'; try { fs.writeFileSync('/app/unexpected-write', 'x'); process.exit(1); } catch(e) { if(e.code !== 'EROFS') throw e; console.log('readonly'); }",
    ),
    'readonly',
  );
  inside(
    "import fs from 'node:fs'; fs.writeFileSync('/var/lib/clamav/preserved-test-marker', 'cache'); fs.writeFileSync('/tmp/temporary-test-marker', 'temporary');",
  );
  const call = (route, method = 'GET', body) =>
    inside(
      `const r = await fetch('http://127.0.0.1:8081${route}', {method:${JSON.stringify(method)},headers:{'x-internal-service-token':'isolated-test-token','content-type':'application/json'},${body ? `body:JSON.stringify(${JSON.stringify(body)}),` : ''}}); console.log(JSON.stringify({status:r.status, body:await r.text()}));`,
    );
  const intake = JSON.parse(
    inside(
      "const r = await fetch('http://127.0.0.1:8081/internal/documents/test-document/intake', {method:'PUT',headers:{'x-internal-service-token':'isolated-test-token','content-type':'application/octet-stream','x-file-name':'test.pdf','x-mime-type':'application/pdf'},body:'test-content'});console.log(JSON.stringify({status:r.status}));",
    ),
  );
  assert.equal(intake.status, 200);
  assert.equal(
    JSON.parse(
      call('/internal/preview/sessions/session/document', 'PUT', {
        documentRef: 'test-document',
        mimeType: 'application/pdf',
      }),
    ).status,
    200,
  );
  // Restart must reset both the in-memory preview and tmpfs, retaining only the signature cache.
  assert.equal(
    JSON.parse(call('/internal/runtime/restart', 'POST', { reason: 'isolated-test' })).status,
    200,
  );
  await waitReady(previous);
  assert.equal(JSON.parse(call('/internal/documents/test-document/content')).status, 404);
  const missing = JSON.parse(
    JSON.parse(
      call('/internal/preview/sessions/session/document', 'PUT', {
        documentRef: 'test-document',
        mimeType: 'application/pdf',
      }),
    ).body,
  );
  assert.equal(missing.status, 'source_unavailable');
  assert.equal(
    inside(
      "import fs from 'node:fs'; console.log(fs.existsSync('/tmp/temporary-test-marker') ? 'stale' : fs.readFileSync('/var/lib/clamav/preserved-test-marker', 'utf8'));",
    ),
    'cache',
  );
  // Run the real updater offline: it must reach the network attempt, not fail on read-only paths.
  inside(
    "import fs from 'node:fs'; fs.writeFileSync('/tmp/freshclam-test.conf', 'DatabaseDirectory /var/lib/clamav\\nDatabaseMirror 127.0.0.1\\nUpdateLogFile /var/log/clamav/test.log\\nConnectTimeout 1\\nReceiveTimeout 1\\nMaxAttempts 1\\n');",
  );
  const update = inside(
    "import {spawnSync} from 'node:child_process'; const r=spawnSync('freshclam',['--config-file=/tmp/freshclam-test.conf','--no-dns'],{encoding:'utf8',timeout:10000});console.log(JSON.stringify({status:r.status,output:r.stdout+r.stderr}));",
  );
  const result = JSON.parse(update);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /127\.0\.0\.1/);
  assert.doesNotMatch(
    result.output,
    /Permission denied|Read-only file system|Failed to change|Can't create|Can't open.*log/i,
  );
  console.log(
    'PASS: read-only root, temporary documents, lost-document response, restart, retained signature cache and updater write permissions',
  );
} finally {
  try {
    docker('rm', '-f', name);
  } catch {
    /* Nothing to remove if startup failed. */
  }
  try {
    docker('volume', 'rm', volume);
  } catch {
    /* Do not touch any other volume. */
  }
}
