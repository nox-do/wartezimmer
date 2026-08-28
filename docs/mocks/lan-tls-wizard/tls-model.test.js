const assert = require('node:assert/strict');
const test = require('node:test');

require('./tls-model.js');

const model = globalThis.LanTlsModel;

test('name mode is the certificate fork', () => {
  assert.equal(model.certSourceOf(model.NAME_MODE.generated), model.CERT_SOURCE.managed);
  assert.equal(model.certSourceOf(model.NAME_MODE.label), model.CERT_SOURCE.managed);
  assert.equal(model.certSourceOf(model.NAME_MODE.domain), model.CERT_SOURCE.custom);
});

test('sidecar match requires non-empty installation id and hostname on both sides', () => {
  assert.equal(
    model.tlsSidecarMatches({
      backupInstallId: 'id-1',
      backupHostname: undefined,
      sidecarInstallId: 'id-1',
      sidecarHostname: undefined,
    }),
    false,
  );
  assert.equal(
    model.tlsSidecarMatches({
      backupInstallId: 'id-1',
      backupHostname: 'Flow.Example.',
      sidecarInstallId: 'id-1',
      sidecarHostname: 'flow.example',
    }),
    true,
  );
});

test('backup metadata rejects active TLS without HTTPS markers', () => {
  assert.equal(
    model.tlsBackupMetadataConsistent({ tlsState: 'active', tlsClaimsHttps: false }),
    false,
  );
  assert.equal(
    model.tlsBackupMetadataConsistent({ tlsState: 'active', tlsClaimsHttps: true }),
    true,
  );
  assert.equal(model.tlsPreparedInBackup({ tlsState: 'active', tlsClaimsHttps: false }), false);
});

test('restore keeps current gates and adds TLS metadata and sidecar gates', () => {
  const base = {
    archiveValid: true,
    settingsValid: true,
    targetAppReachable: true,
    tlsMetadataConsistent: true,
    tlsClaimsHttps: true,
    sidecarPresent: true,
    sidecarMatches: true,
  };
  assert.equal(model.tlsRestoreSupported(base), true);
  assert.equal(model.tlsRestoreSupported({ ...base, settingsValid: false }), false);
  assert.equal(model.tlsRestoreSupported({ ...base, tlsMetadataConsistent: false }), false);
  assert.equal(model.tlsRestoreSupported({ ...base, sidecarMatches: false }), false);
});

test('own-domain rebind fallback stays exact without a Public-Suffix-aware apex', () => {
  assert.equal(
    model.rebindFallback(model.NAME_MODE.domain, 'flow.praxis.co.uk'),
    'flow.praxis.co.uk',
  );
  assert.equal(
    model.rebindFallback(model.NAME_MODE.domain, 'flow.praxis.co.uk', 'praxis.co.uk'),
    'praxis.co.uk',
  );
});
