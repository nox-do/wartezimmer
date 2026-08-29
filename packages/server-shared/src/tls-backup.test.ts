import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePfbackupTimestampTokenFromPath } from './backup-path-labels.js';
import {
  siblingTlsSidecarBasename,
  tlsBackupMetadataConsistent,
  tlsInBackup,
  tlsPreparedInBackup,
  tlsRestoreSupported,
  tlsSidecarFileName,
  tlsSidecarMatches,
} from './tls-backup.js';

test('tlsSidecarFileName uses the same timestamp token as .pfbackup', () => {
  const backupPath = '/tmp/backups/praxis-flow-backup-2026-07-12T10-15-30-123Z.pfbackup';
  const token = parsePfbackupTimestampTokenFromPath(backupPath);
  assert.equal(token, '2026-07-12T10-15-30-123Z');
  assert.equal(tlsSidecarFileName(token!), 'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz');
  assert.equal(
    siblingTlsSidecarBasename(backupPath),
    'praxis-flow-tls-2026-07-12T10-15-30-123Z.tgz',
  );
});

test('sidecar match requires non-empty installation id and hostname on both sides', () => {
  assert.equal(
    tlsSidecarMatches({
      backupInstallId: 'id-1',
      backupHostname: undefined,
      sidecarInstallId: 'id-1',
      sidecarHostname: undefined,
    }),
    false,
  );
  assert.equal(
    tlsSidecarMatches({
      backupInstallId: '',
      backupHostname: 'flow.example',
      sidecarInstallId: '',
      sidecarHostname: 'flow.example',
    }),
    false,
  );
  assert.equal(
    tlsSidecarMatches({
      backupInstallId: 'id-1',
      backupHostname: 'Flow.Example.',
      sidecarInstallId: 'id-1',
      sidecarHostname: 'flow.example',
    }),
    true,
  );
});

test('backup metadata rejects active TLS without HTTPS markers', () => {
  assert.equal(tlsBackupMetadataConsistent({ tlsState: 'active', tlsClaimsHttps: false }), false);
  assert.equal(tlsBackupMetadataConsistent({ tlsState: 'degraded', tlsClaimsHttps: false }), false);
  assert.equal(tlsBackupMetadataConsistent({ tlsState: 'active', tlsClaimsHttps: true }), true);
  assert.equal(tlsPreparedInBackup({ tlsState: 'active', tlsClaimsHttps: false }), false);
  assert.equal(tlsInBackup({ canonicalBaseUrl: 'http://192.168.1.10', proxyMode: 'http' }), false);
  assert.equal(tlsInBackup({ canonicalBaseUrl: 'https://flow.example', proxyMode: 'http' }), true);
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
  assert.equal(tlsRestoreSupported(base), true);
  assert.equal(tlsRestoreSupported({ ...base, settingsValid: false }), false);
  assert.equal(tlsRestoreSupported({ ...base, tlsMetadataConsistent: false }), false);
  assert.equal(tlsRestoreSupported({ ...base, sidecarMatches: false }), false);
  assert.equal(
    tlsRestoreSupported({
      ...base,
      tlsClaimsHttps: false,
      sidecarPresent: false,
      sidecarMatches: false,
    }),
    true,
  );
});
