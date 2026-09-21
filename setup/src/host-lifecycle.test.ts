import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deriveHostLifecycle, type HostLifecycleFacts } from './host-lifecycle.js';
import { readHostLifecycle } from './host-lifecycle-facts.js';
import { beginRestrictedOperation, finishRestrictedOperation } from './restricted-operation.js';

function env(extra: Record<string, string> = {}) {
  return new Map(Object.entries({ SETUP_LAN_APP_IP: '192.168.1.10', ...extra }));
}
const https = {
  PROXY_ENABLED: 'true',
  PROXY_MODE: 'tls-managed',
  TLS_MODE: 'managed',
  TLS_STATE: 'active',
  TLS_CUTOVER_APPLIED: 'true',
  TLS_STAFF_HOSTNAME: 'staff.example.test',
};
const portal = {
  ...https,
  SETUP_RESTRICTED_ENABLED: 'true',
  SETUP_RESTRICTED_APP_IP: '192.168.2.10',
  TLS_PORTAL_HOSTNAME: 'portal.example.test',
  TLS_WILDCARD_CERTIFICATE_NAME: '*.example.test',
};
function derive(extra: Record<string, string> = {}, facts: Partial<HostLifecycleFacts> = {}) {
  return deriveHostLifecycle({
    env: env(extra),
    envExists: true,
    residues: 'none',
    operation: 'none',
    recovered: false,
    ...facts,
  });
}

test('five configured modes; TLS preparation and errors do not replace the committed mode', () => {
  assert.equal(derive({}, { envExists: false }).mode, 'uninstalled');
  assert.equal(derive().mode, 'direct-http');
  assert.equal(derive({ PROXY_ENABLED: 'true' }).mode, 'proxy-http');
  assert.equal(derive(https).mode, 'https');
  assert.equal(derive(portal).mode, 'https-portal');
  const preparing = derive({
    PROXY_ENABLED: 'true',
    TLS_MODE: 'managed',
    TLS_STATE: 'awaiting-operator-dns',
  });
  assert.equal(preparing.mode, 'proxy-http');
  assert.equal(preparing.preparation, 'https');
  assert.equal(derive({ ...https, TLS_STATE: 'degraded' }).mode, 'https');
  assert.equal(derive({ ...https, TLS_STATE: 'error' }).mode, 'https');
  assert.equal(derive({ ...https, SETUP_RESTRICTED_APP_IP: '192.168.2.10' }).preparation, 'portal');
});

test('missing env with remnants or unavailable inspection is never classified as fresh', () => {
  assert.equal(derive({}, { envExists: false, residues: 'present' }).assessment, 'inconsistent');
  assert.equal(derive({}, { envExists: false, residues: 'unknown' }).assessment, 'unknown');
});

test('empty or comment-only env is not a known direct-http installation', () => {
  for (const contents of ['', '# only a comment\n']) {
    const result = deriveHostLifecycle({
      env: new Map(),
      envExists: true,
      residues: 'present',
      operation: 'none',
      recovered: false,
    });
    assert.equal(result.assessment, 'inconsistent', contents);
    assert.equal(result.mode, null, contents);
    assert.ok(
      result.issues.some((entry) => entry.code === 'address-missing'),
      contents,
    );
  }
});

test('contradictory config never falls back to a healthy lower mode', () => {
  const configurations: Record<string, string>[] = [
    { PROXY_ENABLED: 'true', PROXY_MODE: 'off' },
    { PROXY_MODE: 'tls-managed', TLS_MODE: 'managed', TLS_STATE: 'active' },
    { TLS_STATE: 'invalid' },
    { TLS_CUTOVER_APPLIED: 'perhaps' },
    { SETUP_RESTRICTED_ENABLED: 'true' },
    { ...https, TLS_CUTOVER_APPLIED: 'false' },
    { ...portal, TLS_MODE: 'custom', PROXY_MODE: 'tls-custom' },
  ];
  for (const config of configurations) {
    const result = derive(config);
    assert.equal(result.assessment, 'inconsistent');
    assert.equal(result.mode, null);
  }
});

test('open apply/remove journal keeps previous mode until journal completion', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-lifecycle-'));
  try {
    for (const enable of [true, false]) {
      const before = enable ? https : portal;
      const after = enable ? portal : https;
      fs.writeFileSync(
        path.join(home, '.env'),
        [...env(before)].map(([k, v]) => `${k}=${v}`).join('\n'),
      );
      const operation = beginRestrictedOperation(home, enable);
      const pending = readHostLifecycle(home, env(after), true);
      assert.equal(pending.mode, enable ? 'https' : 'https-portal');
      assert.equal(pending.operation, enable ? 'portal-apply' : 'portal-remove');
      assert.equal(JSON.stringify(pending).includes('previousEnv'), false);
      finishRestrictedOperation(home, operation.id);
      assert.equal(
        readHostLifecycle(home, env(after), true).mode,
        enable ? 'https-portal' : 'https',
      );
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('TLS material without env is preserved and classified as remnants; corrupt journal stays unknown', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-lifecycle-'));
  try {
    fs.mkdirSync(path.join(home, 'state/tls'), { recursive: true });
    const certificate = path.join(home, 'state/tls/certificate.pem');
    fs.writeFileSync(certificate, 'preserve-me');
    assert.equal(readHostLifecycle(home, new Map(), false, 'none').assessment, 'inconsistent');
    assert.equal(fs.readFileSync(certificate, 'utf8'), 'preserve-me');
    fs.mkdirSync(path.join(home, 'state/restricted-operation'));
    fs.writeFileSync(path.join(home, 'state/restricted-operation/journal.json'), '{');
    assert.equal(readHostLifecycle(home, env(https), true).assessment, 'unknown');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('recovery notification is independent of the configured HTTPS mode', () => {
  const result = derive(https, { recovered: true });
  assert.equal(result.mode, 'https');
  assert.equal(result.recovery, 'portal-disabled');
});
