import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readEnvMap } from './env-file.js';
import {
  applySetupPlan,
  buildSetupPlan,
  isLanIpStale,
  pickLanIpFromEnv,
  pickPracticeDisplayNameFromEnv,
  resolveComposeBuild,
  saveHostNetwork,
} from './host-state.js';
import { writeManagerReleaseState } from './manager-state.js';

test('pickLanIpFromEnv prefers SETUP_LAN_APP_IP', () => {
  const env = new Map([
    ['SETUP_LAN_APP_IP', '192.168.1.10'],
    ['APP_PORTAL_URL', 'http://10.0.0.5:8080/portal'],
  ]);
  assert.equal(pickLanIpFromEnv(env), '192.168.1.10');
});

test('pickLanIpFromEnv falls back to APP_PORTAL_URL hostname', () => {
  const env = new Map([['APP_PORTAL_URL', 'http://192.168.1.20:8080/portal']]);
  assert.equal(pickLanIpFromEnv(env), '192.168.1.20');
});

test('isLanIpStale is false when configured IP matches a current candidate', () => {
  const candidates = [{ address: '192.168.1.13', interfaceName: 'en0' }];
  assert.equal(isLanIpStale('192.168.1.13', candidates), false);
});

test('isLanIpStale is true when configured IP is absent from current candidates', () => {
  const candidates = [{ address: '192.168.1.13', interfaceName: 'en0' }];
  assert.equal(isLanIpStale('192.168.1.23', candidates), true);
});

test('isLanIpStale is false for localhost or missing configuration', () => {
  const candidates = [{ address: '192.168.1.13', interfaceName: 'en0' }];
  assert.equal(isLanIpStale('127.0.0.1', candidates), false);
  assert.equal(isLanIpStale(null, candidates), false);
});

test('pickPracticeDisplayNameFromEnv reads PRACTICE_DISPLAY_NAME', () => {
  const env = new Map([['PRACTICE_DISPLAY_NAME', 'Praxis Nord']]);
  assert.equal(pickPracticeDisplayNameFromEnv(env), 'Praxis Nord');
});

test('pickPracticeDisplayNameFromEnv returns null when unset', () => {
  assert.equal(pickPracticeDisplayNameFromEnv(new Map()), null);
});

test('resolveComposeBuild skips build when re-applying existing env', () => {
  assert.equal(resolveComposeBuild({ preserveEnv: true, delivery: false }), false);
});

test('resolveComposeBuild builds on first dev install', () => {
  assert.equal(resolveComposeBuild({ preserveEnv: false, delivery: false }), true);
});

test('resolveComposeBuild skips build for delivery images', () => {
  assert.equal(resolveComposeBuild({ preserveEnv: false, delivery: true }), false);
});

test('buildSetupPlan rewrites IP-derived canonical preview when LAN IP changes', () => {
  const env = new Map([
    ['SETUP_LAN_APP_IP', '192.168.1.10'],
    ['CANONICAL_BASE_URL', 'http://192.168.1.10:8080'],
  ]);
  const plan = buildSetupPlan(
    {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Nord',
      gateway: {
        enabled: false,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.20',
        authBridgeUrl: '',
      },
    },
    env,
  );
  assert.equal(plan.deviceUrls.appBaseUrl, 'http://192.168.1.20:8080');
});

test('buildSetupPlan keeps custom hostname in preview when LAN IP changes', () => {
  const env = new Map([
    ['SETUP_LAN_APP_IP', '192.168.1.10'],
    ['CANONICAL_BASE_URL', 'http://praxis-flow.local:8080'],
  ]);
  const plan = buildSetupPlan(
    {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Nord',
      gateway: {
        enabled: false,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.20',
        authBridgeUrl: '',
      },
    },
    env,
  );
  assert.equal(plan.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
});

test('applySetupPlan materializes imported release images from manager state into env', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-apply-release-state-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env.example'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Flow',
        'AUTH_KEY_CAPTIVE=change-me',
        'SANDBOX_INTERNAL_TOKEN=change-me',
        'OPENNDS_FAS_KEY=change-me',
        'SETUP_LAN_APP_IP=127.0.0.1',
        '# PRAXIS_FLOW_APP_IMAGE=ghcr.io/example/app:v1',
        '# PRAXIS_FLOW_SANDBOX_IMAGE=ghcr.io/example/sandbox:v1',
        '',
      ].join('\n'),
    );
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'praxis-flow/app:1.4.2',
      sandboxImage: 'praxis-flow/sandbox:1.4.2',
      archiveSha256: 'e'.repeat(64),
    });

    await applySetupPlan(
      {
        home: root,
        mode: 'install',
        composeProjectName: 'pf-test',
        templateRoot: root,
      },
      {
        lanAppIp: '192.168.1.10',
        practiceDisplayName: 'Praxis Nord',
        gateway: {
          enabled: false,
          gatewayInterface: 'eth1',
          gatewayIp: '192.168.88.1',
          portalAppIp: '192.168.1.10',
          authBridgeUrl: '',
        },
        runCompose: false,
        runProbes: false,
      },
    );

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PRACTICE_DISPLAY_NAME'), 'Praxis Nord');
    assert.equal(env.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:1.4.2');
    assert.equal(env.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:1.4.2');
    assert.equal(env.get('SETUP_LAN_APP_IP'), '192.168.1.10');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.1.10:8080');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('saveHostNetwork updates LAN and gateway keys without touching practice name', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-network-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Süd',
        'AUTH_KEY_CAPTIVE=existing-captive-key-32chars-long!!',
        'SANDBOX_INTERNAL_TOKEN=existing-sandbox-token-32chars!!',
        'SETUP_LAN_APP_IP=192.168.1.10',
        'GATEWAY_INTERFACE=eth1',
        'GATEWAY_IP=192.168.88.1',
        'GATEWAY_AUTH_BRIDGE_URL=http://172.17.0.1:9100',
        '',
      ].join('\n'),
    );

    await saveHostNetwork(
      {
        home: root,
        mode: 'install',
        composeProjectName: 'pf-test',
        templateRoot: root,
      },
      {
        lanAppIp: '192.168.1.20',
        gateway: {
          enabled: true,
          gatewayInterface: 'eth2',
          gatewayIp: '192.168.99.1',
          portalAppIp: '192.168.1.20',
          authBridgeUrl: 'http://10.0.0.2:9100',
        },
      },
    );

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('PRACTICE_DISPLAY_NAME'), 'Praxis Süd');
    assert.equal(env.get('SETUP_LAN_APP_IP'), '192.168.1.20');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.1.20:8080');
    assert.equal(env.get('GATEWAY_INTERFACE'), 'eth2');
    assert.equal(env.get('GATEWAY_IP'), '192.168.99.1');
    assert.equal(env.get('APP_PORTAL_URL'), 'http://192.168.1.20:8080/portal');
    assert.equal(env.get('GATEWAY_AUTH_BRIDGE_URL'), 'http://10.0.0.2:9100');
    assert.equal(env.get('GATEWAY_AUTH_BRIDGE_BIND'), '10.0.0.2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('saveHostNetwork removes gateway keys when gateway is disabled', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-network-off-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Nord',
        'SETUP_LAN_APP_IP=192.168.1.10',
        'GATEWAY_INTERFACE=eth1',
        'GATEWAY_IP=192.168.88.1',
        'APP_PORTAL_URL=http://192.168.1.10:8080/portal',
        '',
      ].join('\n'),
    );

    await saveHostNetwork(
      {
        home: root,
        mode: 'install',
        composeProjectName: 'pf-test',
        templateRoot: root,
      },
      {
        lanAppIp: '192.168.1.13',
        gateway: {
          enabled: false,
          gatewayInterface: 'eth1',
          gatewayIp: '192.168.88.1',
          portalAppIp: '192.168.1.13',
          authBridgeUrl: '',
        },
      },
    );

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('SETUP_LAN_APP_IP'), '192.168.1.13');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://192.168.1.13:8080');
    assert.equal(env.get('GATEWAY_INTERFACE'), undefined);
    assert.equal(env.get('APP_PORTAL_URL'), undefined);
    assert.equal(env.get('PRACTICE_DISPLAY_NAME'), 'Praxis Nord');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('saveHostNetwork keeps custom CANONICAL_BASE_URL hostname when LAN IP changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-network-canonical-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Nord',
        'SETUP_LAN_APP_IP=192.168.1.10',
        'CANONICAL_BASE_URL=http://praxis-flow.local:8080',
        '',
      ].join('\n'),
    );

    const result = await saveHostNetwork(
      {
        home: root,
        mode: 'install',
        composeProjectName: 'pf-test',
        templateRoot: root,
      },
      {
        lanAppIp: '192.168.1.20',
        gateway: {
          enabled: false,
          gatewayInterface: 'eth1',
          gatewayIp: '192.168.88.1',
          portalAppIp: '192.168.1.20',
          authBridgeUrl: '',
        },
      },
    );

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('SETUP_LAN_APP_IP'), '192.168.1.20');
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://praxis-flow.local:8080');
    assert.equal(result.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('saveHostNetwork writes explicit canonicalBaseUrl override', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-save-network-override-'));
  try {
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis Nord',
        'SETUP_LAN_APP_IP=192.168.1.10',
        'CANONICAL_BASE_URL=http://192.168.1.10:8080',
        '',
      ].join('\n'),
    );

    const result = await saveHostNetwork(
      {
        home: root,
        mode: 'install',
        composeProjectName: 'pf-test',
        templateRoot: root,
      },
      {
        lanAppIp: '192.168.1.10',
        canonicalBaseUrl: 'http://praxis-flow.local:8080',
        gateway: {
          enabled: false,
          gatewayInterface: 'eth1',
          gatewayIp: '192.168.88.1',
          portalAppIp: '192.168.1.10',
          authBridgeUrl: '',
        },
      },
    );

    const env = readEnvMap(path.join(root, '.env'));
    assert.equal(env.get('CANONICAL_BASE_URL'), 'http://praxis-flow.local:8080');
    assert.equal(result.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
