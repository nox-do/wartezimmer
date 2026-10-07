import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PFBACKUP_FORMAT_VERSION,
  buildPfbackupArchive,
  buildPfbackupFilename,
  envRecordForSettingsExport,
  formatPfbackupLabel,
  parsePfbackupTimestampFromPath,
  serializePfbackupArchive,
  validateManagerStateForBackup,
  validatePfbackupArchive,
} from './pfbackup.js';

const sampleSettings = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: { routingMode: 'simple' },
  authSettings: {
    staffPinHashMfa: 'a',
    staffPinHashOps: 'b',
    roomPanelPinHash: 'c',
  },
  messagingProviderConfigs: [],
  env: { BUSINESS_TZ: 'Europe/Berlin' },
};

test('buildPfbackupArchive roundtrip validates successfully', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: {
      release: {
        releaseVersion: '0.2.0',
        appImage: 'wartezimmer/app:0.2.0',
        sandboxImage: 'wartezimmer/sandbox:0.2.0',
        archiveSha256: null,
      },
    },
    createdAt: '2026-07-12T12:00:00.000Z',
  });

  const parsed = JSON.parse(serializePfbackupArchive(archive));
  const result = validatePfbackupArchive(parsed);
  assert.equal(result.archiveValid, true);
  assert.equal(result.summary?.routingMode, 'simple');
  assert.equal(result.summary?.releaseVersion, '0.2.0');
});

test('validatePfbackupArchive accepts explicit release null', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
  });
  const parsed = JSON.parse(serializePfbackupArchive(archive));
  const result = validatePfbackupArchive(parsed);
  assert.equal(result.archiveValid, true);
});

test('validateManagerStateForBackup rejects incomplete image references', () => {
  const result = validateManagerStateForBackup({
    release: { releaseVersion: '0.2.0', appImage: 'wartezimmer/app:0.2.0' },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /sandboxImage/);
});

test('validatePfbackupArchive rejects tampered checksum', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
  });
  const parsed = JSON.parse(serializePfbackupArchive(archive)) as {
    settingsJson: string;
    manifest: { entries: Array<{ name: string; sha256: string }> };
  };
  parsed.settingsJson = parsed.settingsJson.replace('simple', 'complex');
  const result = validatePfbackupArchive(parsed);
  assert.equal(result.archiveValid, false);
  assert.match(result.errors.join(' '), /settings\.json/);
});

test('envRecordForSettingsExport includes full stack env including image tags', () => {
  const env = envRecordForSettingsExport({
    BUSINESS_TZ: 'Europe/Berlin',
    WARTEZIMMER_APP_IMAGE: 'app:1',
    WARTEZIMMER_SANDBOX_IMAGE: 'sandbox:1',
    WARTEZIMMER_GATEWAY_IMAGE: 'gateway:1',
    EMPTY: '',
  });
  assert.deepEqual(env, {
    BUSINESS_TZ: 'Europe/Berlin',
    WARTEZIMMER_APP_IMAGE: 'app:1',
    WARTEZIMMER_SANDBOX_IMAGE: 'sandbox:1',
    WARTEZIMMER_GATEWAY_IMAGE: 'gateway:1',
  });
});

test('pfbackup filename helpers parse timestamps', () => {
  const name = buildPfbackupFilename(new Date('2026-07-12T10:15:30.123Z'));
  assert.match(name, /^wartezimmer-backup-/);
  assert.ok(name.endsWith('.pfbackup'));
  const parsed = parsePfbackupTimestampFromPath(`/tmp/backups/${name}`);
  assert.ok(parsed);
  assert.equal(parsed?.toISOString(), '2026-07-12T10:15:30.123Z');
  assert.match(formatPfbackupLabel(`/tmp/${name}`), /2026/);
});

test('validateManagerStateForBackup rejects missing release field', () => {
  const result = validateManagerStateForBackup({});
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /release fehlt/);
});

test('validateManagerStateForBackup rejects invalid archiveSha256', () => {
  const result = validateManagerStateForBackup({
    release: {
      appImage: 'wartezimmer/app:1',
      sandboxImage: 'wartezimmer/sandbox:1',
      archiveSha256: 'not-a-hash',
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /SHA-256/);
});

test('validatePfbackupArchive rejects unknown pfbackup version', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
  });
  const parsed = JSON.parse(serializePfbackupArchive(archive)) as {
    manifest: { pfbackupFormatVersion: number };
  };
  parsed.manifest.pfbackupFormatVersion = 99 as typeof PFBACKUP_FORMAT_VERSION;
  const result = validatePfbackupArchive(parsed);
  assert.equal(result.archiveValid, false);
  assert.match(result.errors.join(' '), /Backup-Version/);
});

test('v2 embeds TLS bytes and validates raw-byte hashes, pairing and strict base64', () => {
  const bytes = Buffer.from('TLS archive bytes');
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
    tlsArchiveBase64: bytes.toString('base64'),
  });
  assert.equal(archive.manifest.pfbackupFormatVersion, 2);
  assert.equal(validatePfbackupArchive(archive).archiveValid, true);
  const entry = archive.manifest.entries.find((item) => item.name === 'tls.tgz')!;
  assert.equal(entry.byteLength, bytes.length);
  const badHash = structuredClone(archive);
  badHash.manifest.entries.find((item) => item.name === 'tls.tgz')!.sha256 = '0'.repeat(64);
  assert.equal(validatePfbackupArchive(badHash).archiveValid, false);
  assert.equal(
    validatePfbackupArchive({ ...archive, tlsArchiveBase64: undefined }).archiveValid,
    false,
  );
  assert.equal(
    validatePfbackupArchive({
      ...archive,
      manifest: {
        ...archive.manifest,
        entries: archive.manifest.entries.filter((item) => item.name !== 'tls.tgz'),
      },
    }).archiveValid,
    false,
  );
  assert.equal(
    validatePfbackupArchive({ ...archive, tlsArchiveBase64: '%%%=' }).archiveValid,
    false,
  );
  assert.equal(validatePfbackupArchive({ ...archive, tlsArchiveBase64: '' }).archiveValid, false);
  assert.equal(
    validatePfbackupArchive({
      ...archive,
      manifest: { ...archive.manifest, entries: [...archive.manifest.entries, entry] },
    }).archiveValid,
    false,
  );
});

test('v2 HTTP backup has no TLS field and version 1 is rejected', () => {
  const archive = buildPfbackupArchive({
    settings: sampleSettings,
    managerState: { release: null },
  });
  assert.equal('tlsArchiveBase64' in archive, false);
  assert.deepEqual(
    archive.manifest.entries.map((entry) => entry.name),
    ['settings.json', 'manager-state.json'],
  );
  const old = { ...archive, manifest: { ...archive.manifest, pfbackupFormatVersion: 1 } };
  assert.equal(validatePfbackupArchive(old).archiveValid, false);
  assert.match(
    validatePfbackupArchive(old).errors.join(' '),
    /Nicht unterstützte Backup-Version 1/,
  );
});
