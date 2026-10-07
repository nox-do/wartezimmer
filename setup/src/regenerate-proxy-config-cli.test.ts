import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { regenerateProxyConfig } from './regenerate-proxy-config-cli.js';

function fixture(): { home: string; caddyfilePath: string; envPath: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-regenerate-proxy-'));
  const tlsRoot = path.join(home, 'state', 'tls');
  fs.mkdirSync(tlsRoot, { recursive: true });
  const envPath = path.join(home, '.env');
  fs.writeFileSync(
    envPath,
    [
      'TLS_STATE=active',
      'TLS_MODE=managed',
      'TLS_CUTOVER_APPLIED=true',
      'TLS_STAFF_HOSTNAME=staff.installation.example',
      'TLS_PORTAL_HOSTNAME=portal.installation.example',
      'TLS_WILDCARD_CERTIFICATE_NAME=*.installation.example',
      'TLS_CERT_ISSUER=Test CA',
      'TLS_CERT_NOT_BEFORE=2026-01-01T00:00:00Z',
      'TLS_CERT_NOT_AFTER=2027-01-01T00:00:00Z',
      'TLS_CERT_NAMES=["*.installation.example"]',
      '',
    ].join('\n'),
  );
  const caddyfilePath = path.join(tlsRoot, 'Caddyfile');
  fs.writeFileSync(caddyfilePath, '# PRAXIS-FLOW-GENERATED LAN-TLS v2\n\n# staff only\n');
  return { home, caddyfilePath, envPath };
}

test('regenerates only the generated Caddyfile and keeps a backup', () => {
  const current = fixture();
  const envBefore = fs.readFileSync(current.envPath);
  try {
    const result = regenerateProxyConfig(current.home, new Date('2026-09-17T12:00:00.000Z'));
    assert.doesNotMatch(fs.readFileSync(current.caddyfilePath, 'utf8'), /:444 \{/);
    assert.equal(
      fs.readFileSync(result.backupPath!, 'utf8'),
      '# PRAXIS-FLOW-GENERATED LAN-TLS v2\n\n# staff only\n',
    );
    assert.deepEqual(fs.readFileSync(current.envPath), envBefore);
  } finally {
    fs.rmSync(current.home, { recursive: true, force: true });
  }
});

test('refuses to overwrite an operator-owned Caddyfile', () => {
  const current = fixture();
  try {
    fs.writeFileSync(current.caddyfilePath, ':443 { respond "custom" }\n');
    assert.throws(() => regenerateProxyConfig(current.home), /nicht als Wartezimmer-generiert/);
    assert.equal(fs.readFileSync(current.caddyfilePath, 'utf8'), ':443 { respond "custom" }\n');
  } finally {
    fs.rmSync(current.home, { recursive: true, force: true });
  }
});

test('regeneration retains an explicitly enabled restricted listener', () => {
  const current = fixture();
  try {
    fs.appendFileSync(current.envPath, 'SETUP_RESTRICTED_ENABLED=true\n');
    regenerateProxyConfig(current.home);
    assert.match(fs.readFileSync(current.caddyfilePath, 'utf8'), /:444 \{/);
  } finally {
    fs.rmSync(current.home, { recursive: true, force: true });
  }
});
