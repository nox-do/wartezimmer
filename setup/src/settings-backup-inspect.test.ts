import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPfbackupArchive, serializePfbackupArchive } from '@praxis-flow/server-shared';
import {
  buildPfbackupInspectBackupSummary,
  buildPfbackupInspectWarnings,
  extractPfbackupInspectEnvironment,
  inspectPfbackup,
  providerCredentialsIncludedInSnapshot,
} from './settings-backup-inspect.js';
import { testSetupContext } from './test-setup-context.js';

const sampleSettings = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: {
    routingMode: 'simple',
    returnWindowMinutes: 15,
    practiceOpenFrom: '08:00',
    practiceOpenTo: '17:00',
    practiceProfileJson: '{}',
    topics: [{ topicId: 'blut', label: 'Blut', enabled: true, sortOrder: 1 }],
    journeySettings: { templates: [], assignments: [] },
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
      },
    ],
    contactLookupFolderPath: '/tmp/contact-lookup',
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{}',
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [],
    smsProvider: 'mock',
    exportBasePath: '/tmp/exports',
    portalEnabled: true,
    setupCompletedAt: null,
    setupContactMode: 'unset',
  },
  authSettings: {
    staffPinHashMfa: 'a',
    staffPinHashOps: 'b',
    roomPanelPinHash: 'c',
  },
  messagingProviderConfigs: [
    {
      providerId: 'seven',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{"apiKey":"secret"}',
    },
    {
      providerId: 'mock',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{}',
    },
  ],
  env: {
    BUSINESS_TZ: 'Europe/Berlin',
    SETUP_LAN_APP_IP: '192.168.1.50',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
    IMPORTS_HOST_PATH: '/data/imports',
    EXPORTS_HOST_PATH: '/data/exports',
    PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:2026.07.1',
    PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:2026.07.1',
    PRAXIS_FLOW_GATEWAY_IMAGE: 'praxis-flow/gateway:2026.07.1',
  },
};

const sampleManagerState = {
  release: {
    releaseVersion: '2026.07.1',
    appImage: 'praxis-flow/app:2026.07.1',
    sandboxImage: 'praxis-flow/sandbox:2026.07.1',
    gatewayImage: 'praxis-flow/gateway:2026.07.1',
    archiveSha256: null,
  },
};

function buildSampleArchive() {
  return buildPfbackupArchive({
    settings: sampleSettings,
    managerState: sampleManagerState,
    createdAt: '2026-07-12T10:00:00.000Z',
  });
}

test('providerCredentialsIncludedInSnapshot ignores mock and empty credentials', () => {
  assert.equal(
    providerCredentialsIncludedInSnapshot([
      { providerId: 'mock', credentialsJson: '{}' },
      { providerId: 'seven', credentialsJson: '{}' },
    ]),
    false,
  );
  assert.equal(
    providerCredentialsIncludedInSnapshot([
      { providerId: 'seven', credentialsJson: '{"apiKey":"x"}' },
    ]),
    true,
  );
});

test('extractPfbackupInspectEnvironment collects paths network and images', () => {
  const environment = extractPfbackupInspectEnvironment(sampleSettings, sampleManagerState);
  assert.equal(environment.hostPaths.IMPORTS_HOST_PATH, '/data/imports');
  assert.equal(environment.hostPaths.exportBasePath, '/tmp/exports');
  assert.equal(environment.network.SETUP_LAN_APP_IP, '192.168.1.50');
  assert.equal(environment.imageReferences.appImage, 'praxis-flow/app:2026.07.1');
  assert.equal(environment.imageReferences.gatewayImage, 'praxis-flow/gateway:2026.07.1');
});

test('buildPfbackupInspectBackupSummary exposes restore preview fields', () => {
  const backup = buildPfbackupInspectBackupSummary(
    sampleSettings,
    '2026-07-12T10:00:00.000Z',
    1,
    sampleManagerState,
  );
  assert.equal(backup.routingMode, 'simple');
  assert.equal(backup.portalEnabled, true);
  assert.equal(backup.providerCredentialsIncluded, true);
  assert.equal(backup.releaseVersion, '2026.07.1');
});

test('buildPfbackupInspectWarnings reports path release and stack image mismatches', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inspect-warn-'));
  const existingImports = path.join(dir, 'imports');
  fs.mkdirSync(existingImports, { recursive: true });
  try {
    const warnings = buildPfbackupInspectWarnings({
      backupEnv: {
        IMPORTS_HOST_PATH: '/missing/imports',
        EXPORTS_HOST_PATH: '/missing/exports',
        PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:backup',
        PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:2026.07.1',
      },
      currentEnv: {
        IMPORTS_HOST_PATH: existingImports,
        EXPORTS_HOST_PATH: '/current/exports',
        PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:current',
      },
      backupManagerState: {
        release: {
          ...sampleManagerState.release!,
          appImage: 'praxis-flow/app:manager',
        },
      },
      currentManagerState: {
        release: {
          ...sampleManagerState.release!,
          releaseVersion: '2026.06.1',
        },
      },
    });

    assert.match(warnings.join(' '), /IMPORTS_HOST_PATH/);
    assert.match(warnings.join(' '), /PRAXIS_FLOW_APP_IMAGE/);
    assert.match(warnings.join(' '), /manager-state\.release\.appImage/);
    assert.match(warnings.join(' '), /Release-Version/);
    assert.doesNotMatch(warnings.join(' '), /contactLookupFolderPath/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfbackup rejects invalid archive without side effects', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inspect-invalid-'));
  try {
    const result = await inspectPfbackup('{not-json', testSetupContext(dir));
    assert.equal(result.ok, false);
    assert.equal(result.compatibility.archiveValid, false);
    assert.equal(result.backup, undefined);
    assert.match(result.errors?.join(' ') ?? '', /JSON/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfbackup returns restore preview when archive and settings validate', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inspect-ok-'));
  const imports = path.join(dir, 'imports');
  fs.mkdirSync(imports, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(dir, '.env'),
      `IMPORTS_HOST_PATH=${imports}\nEXPORTS_HOST_PATH=${path.join(dir, 'exports')}\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'manager-state.json'),
      `${JSON.stringify(sampleManagerState, null, 2)}\n`,
    );

    const settings = structuredClone(sampleSettings);
    settings.opsSettings.contactLookupFolderPath = imports;
    settings.env.IMPORTS_HOST_PATH = imports;
    settings.env.EXPORTS_HOST_PATH = path.join(dir, 'exports');

    const content = serializePfbackupArchive(
      buildPfbackupArchive({
        settings,
        managerState: sampleManagerState,
        createdAt: '2026-07-12T10:00:00.000Z',
      }),
    );
    const result = await inspectPfbackup(content, testSetupContext(dir), {
      checkTargetAppReachable: async () => true,
      validateSettingsSnapshot: async () => ({ ok: true, errors: [] }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.backup?.routingMode, 'simple');
    assert.equal(result.compatibility.restoreSupported, true);
    assert.equal(result.compatibility.settingsValid, true);
    assert.equal(result.compatibility.targetAppReachable, true);
    assert.equal(result.environment?.network.SETUP_LAN_APP_IP, '192.168.1.50');
    assert.equal(result.backup?.providerCredentialsIncluded, true);
    assert.equal(result.backup?.tls, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectPfbackup marks restore unsupported when maintenance API is unreachable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inspect-unreachable-'));
  try {
    const content = serializePfbackupArchive(buildSampleArchive());
    const result = await inspectPfbackup(content, testSetupContext(dir), {
      checkTargetAppReachable: async () => false,
      validateSettingsSnapshot: async () => ({
        ok: false,
        errors: ['should not be called'],
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.compatibility.targetAppReachable, false);
    assert.equal(result.compatibility.settingsValid, false);
    assert.equal(result.compatibility.restoreSupported, false);
    assert.match(result.compatibility.warnings.join(' '), /8082/);
    assert.equal(result.backup?.routingMode, 'simple');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tlsSettings(overrides: Record<string, string>) {
  const settings = structuredClone(sampleSettings);
  settings.env = { ...settings.env, ...overrides };
  return settings;
}

function inspectContent(env: Record<string, string>) {
  return serializePfbackupArchive(
    buildPfbackupArchive({
      settings: tlsSettings(env),
      managerState: sampleManagerState,
      createdAt: '2026-07-12T10:00:00.000Z',
    }),
  );
}

function packSidecarBase64(installationId: string, hostname: string): string {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-inspect-sidecar-'));
  const archivePath = path.join(staging, 'sidecar.tgz');
  fs.writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify({ formatVersion: 1, installationId, hostname }, null, 2)}\n`,
  );
  const packed = spawnSync('tar', ['czf', archivePath, '-C', staging, 'manifest.json'], {
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr || 'tar pack failed');
  const bytes = fs.readFileSync(archivePath);
  fs.rmSync(staging, { recursive: true, force: true });
  return bytes.toString('base64');
}

async function inspectTls(env: Record<string, string>, tlsSidecarBase64?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-inspect-tls-'));
  try {
    return await inspectPfbackup(
      inspectContent(env),
      testSetupContext(dir),
      {
        checkTargetAppReachable: async () => true,
        validateSettingsSnapshot: async () => ({ ok: true, errors: [] }),
      },
      { tlsSidecarBase64 },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('inspectPfbackup blocks active HTTPS without sidecar', async () => {
  const result = await inspectTls({
    TLS_STATE: 'active',
    TLS_INSTALLATION_ID: '7fk3m2q9',
    TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
    PROXY_MODE: 'tls-managed',
    CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
  });
  assert.equal(result.ok, false);
  assert.equal(result.compatibility.restoreSupported, false);
  assert.equal(result.backup?.tls?.inBackup, true);
  assert.equal(result.backup?.tls?.sidecarPresent, false);
  assert.equal(result.backup?.tls?.metadataConsistent, true);
  assert.match(result.errors?.join(' ') ?? '', /Zertifikatsdatei fehlt/);
});

test('inspectPfbackup warns on prepare-only TLS without sidecar and still allows restore', async () => {
  const result = await inspectTls({
    TLS_STATE: 'awaiting-operator-dns',
    TLS_INSTALLATION_ID: '7fk3m2q9',
    TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
    PROXY_MODE: 'http',
    CANONICAL_BASE_URL: 'http://192.168.1.50',
  });
  assert.equal(result.ok, true);
  assert.equal(result.compatibility.restoreSupported, true);
  assert.equal(result.backup?.tls?.preparedInBackup, true);
  assert.equal(result.backup?.tls?.inBackup, false);
  assert.equal(result.backup?.tls?.sidecarPresent, false);
  assert.match(result.compatibility.warnings.join(' '), /Vorbereitung/);
});

test('inspectPfbackup sidecar match needs installation id and hostname on both sides', async () => {
  const sidecar = packSidecarBase64('7fk3m2q9', '7fk3m2.lan.notaus.de');
  const missingHost = await inspectTls(
    {
      TLS_STATE: 'active',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    },
    sidecar,
  );
  assert.equal(missingHost.backup?.tls?.sidecarPresent, true);
  assert.equal(missingHost.backup?.tls?.sidecarMatches, false);
  assert.equal(missingHost.compatibility.restoreSupported, false);

  const matched = await inspectTls(
    {
      TLS_STATE: 'active',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    },
    sidecar,
  );
  assert.equal(matched.backup?.tls?.sidecarMatches, true);
  assert.equal(matched.compatibility.restoreSupported, true);
});

test('inspectPfbackup treats unreadable sidecar bytes as missing', async () => {
  const result = await inspectTls(
    {
      TLS_STATE: 'active',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      PROXY_MODE: 'tls-managed',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
    },
    Buffer.from('not-a-tarball').toString('base64'),
  );
  assert.equal(result.backup?.tls?.sidecarPresent, false);
  assert.equal(result.compatibility.restoreSupported, false);
});

test('inspectPfbackup blocks contradictory active TLS with HTTP canonical', async () => {
  const result = await inspectTls({
    TLS_STATE: 'active',
    TLS_INSTALLATION_ID: '7fk3m2q9',
    TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
    PROXY_MODE: 'http',
    CANONICAL_BASE_URL: 'http://192.168.1.50',
  });
  assert.equal(result.compatibility.restoreSupported, false);
  assert.equal(result.backup?.tls?.metadataConsistent, false);
  assert.match(result.errors?.join(' ') ?? '', /passen nicht zusammen/);
});
