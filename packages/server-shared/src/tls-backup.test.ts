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

test('sidecar match validates the complete managed wildcard identity when present', () => {
  const identity = {
    backupInstallId: 'id-1',
    backupHostname: 'staff.room.example',
    backupInstallationDomain: 'room.example',
    backupStaffHostname: 'staff.room.example',
    backupPortalHostname: 'portal.room.example',
    backupWildcardCertificateName: '*.room.example',
    sidecarInstallId: 'id-1',
    sidecarHostname: 'staff.room.example',
    sidecarInstallationDomain: 'room.example',
    sidecarStaffHostname: 'staff.room.example',
    sidecarPortalHostname: 'portal.room.example',
    sidecarWildcardCertificateName: '*.room.example',
  };
  assert.equal(tlsSidecarMatches(identity), true);
  assert.equal(
    tlsSidecarMatches({ ...identity, sidecarPortalHostname: 'portal.other.example' }),
    false,
  );
  assert.equal(
    tlsSidecarMatches({ ...identity, sidecarWildcardCertificateName: undefined }),
    false,
  );
});

test('sidecar match accepts a matching custom v2 staff alias without managed fields', () => {
  assert.equal(
    tlsSidecarMatches({
      backupInstallId: 'id-1',
      backupHostname: 'flow.practice.example',
      backupStaffHostname: 'flow.practice.example',
      sidecarInstallId: 'id-1',
      sidecarHostname: 'flow.practice.example',
      sidecarStaffHostname: 'flow.practice.example',
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
