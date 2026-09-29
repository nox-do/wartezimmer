import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readEnvMap } from './env-file.js';
import {
  readComposeForHost,
  applySetupPlan,
  buildSetupPlan,
  commitPreparedInstallOperation,
  isLanIpStale,
  pickLanIpFromEnv,
  pickPracticeDisplayNameFromEnv,
  resolveComposeBuild,
  runComposeAction,
  saveHostNetwork as saveHostNetworkWithRuntime,
  type HostWriteRuntimeHooks,
} from './host-state.js';
import { writeManagerReleaseState } from './manager-state.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import {
  createPreparedInstallOperation,
  markInstallOperationInstalling,
} from './install-operation.js';

// Config-write tests explicitly observe a stopped stack unless they supply runtime hooks.
function saveHostNetwork(
  ...[context, input, hooks]: Parameters<typeof saveHostNetworkWithRuntime>
) {
  return saveHostNetworkWithRuntime(context, input, {
    composePs: async () => ({ running: false, services: [] }),
    ...hooks,
  });
}

const SECRET = 'existing-captive-key-32chars-long!!';

function ctx(home: string) {
  return { home, mode: 'install' as const, composeProjectName: 'pf-test', templateRoot: home };
}

function gwOff(lan: string) {
  return {
    enabled: false,
    gatewayInterface: 'eth1',
    gatewayIp: '192.168.88.1',
    portalAppIp: lan,
    authBridgeUrl: '',
  };
}

function writeEnv(root: string, entries: Record<string, string>) {
  const body = Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(path.join(root, '.env'), `${body}\n`);
}

function writeExample(root: string, extra = '') {
  fs.writeFileSync(
    path.join(root, '.env.example'),
    [
      'PRACTICE_DISPLAY_NAME=Praxis Flow',
      'AUTH_KEY_CAPTIVE=change-me',
      'SANDBOX_INTERNAL_TOKEN=change-me',
      'OPENNDS_FAS_KEY=change-me',
      'SETUP_LAN_APP_IP=127.0.0.1',
      extra,
      '',
    ].join('\n'),
  );
}

function env(root: string) {
  return readEnvMap(path.join(root, '.env'));
}

function healthyCompose(proxyEnabled = false) {
  return {
    running: true,
    services: [
      { name: 'app', service: 'app', state: 'running', health: 'healthy' },
      { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
      ...(proxyEnabled
        ? [{ name: 'proxy', service: 'proxy', state: 'running', health: 'healthy' }]
        : []),
    ],
  };
}

async function withRoot(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-state-'));
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('replace commit requires explicit confirmation before Docker or host mutation', async () => {
  await withRoot(async (root) => {
    const operation = createPreparedInstallOperation({
      home: root,
      mode: 'replace',
      sha256: 'a'.repeat(64),
      releaseVersion: '1.2.3',
    });
    await assert.rejects(
      commitPreparedInstallOperation(ctx(root), { operationId: operation.id }),
      /ausdrücklich bestätigt/,
    );
    assert.equal(fs.existsSync(path.join(root, 'operations/install/operation.json')), true);
  });
});

test('confirmed installing operation may complete the first setup env', async () => {
  await withRoot(async (root) => {
    writeExample(root);
    writeEnv(root, { PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:1.2.3' });
    const operation = createPreparedInstallOperation({
      home: root,
      mode: 'fresh',
      sha256: 'a'.repeat(64),
      releaseVersion: '1.2.3',
    });
    markInstallOperationInstalling(root, operation.id);
    await applySetupPlan(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        practiceDisplayName: 'Praxis',
        proxy: { enabled: false },
        gateway: gwOff('192.168.1.10'),
        preserveEnv: true,
        runCompose: false,
        runProbes: false,
      },
      { inspectLifecycleResidues: async () => 'present' },
    );
    assert.equal(env(root).get('SETUP_LAN_APP_IP'), '192.168.1.10');
  });
});

test('runComposeAction stops a proxy stack when the post-start binding audit fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '127.0.0.1',
    });
    const running = {
      running: true,
      services: [
        { name: 'app', service: 'app', state: 'running', health: 'healthy' },
        { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
        { name: 'proxy', service: 'proxy', state: 'running', health: 'healthy' },
      ],
    };
    let stoppedServices: string[] = [];
    const result = await runComposeAction(ctx(root), 'restart', undefined, {
      composePs: async () => running,
      composeRestart: async () => ({ ok: true, log: 'recreated' }),
      composeStop: async (options) => {
        stoppedServices = options.services ?? [];
        return { ok: true, log: 'stopped' };
      },
      auditStaffBindings: () => [
        {
          id: 'staff.binding.proxy',
          ok: false,
          message: 'Proxy besitzt unerwartete Host-Bindings',
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.match(result.log, /Runtime-Bindung unsicher/);
    assert.match(result.log, /vorsorglich gestoppt/);
    assert.deepEqual(stoppedServices, ['app', 'sandbox', 'proxy']);
  });
});

const proxyOn = {
  PROXY_ENABLED: 'true',
  PROXY_MODE: 'http',
  PROXY_HTTP_PORT: '80',
  APP_BIND_ADDRESS: '127.0.0.1',
};

const allowProxyPort: HostWriteRuntimeHooks = {
  composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
  validateStaffIp: () => null,
  auditStaffBindings: (input) => [
    { id: 'staff.binding.app', ok: true, message: 'App korrekt' },
    { id: 'staff.binding.sandbox', ok: true, message: 'Sandbox korrekt' },
    ...(input.proxyEnabled
      ? [{ id: 'staff.binding.proxy', ok: true, message: 'Proxy korrekt' }]
      : []),
  ],
};

const removeFails: HostWriteRuntimeHooks = {
  validateStaffIp: () => null,
  composePs: async () => ({
    running: true,
    services: [
      {
        name: 'proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
        publishedPorts: [80],
      },
    ],
  }),
  composeRemoveServices: async () => ({ ok: false, log: 'compose rm failed' }),
  composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
  composeUp: async () => ({ ok: true, log: '', gatewaySkipped: false }),
};

test('pickLanIpFromEnv prefers SETUP_LAN_APP_IP', () => {
  const map = new Map([
    ['SETUP_LAN_APP_IP', '192.168.1.10'],
    ['APP_PORTAL_URL', 'http://10.0.0.5:8080/portal'],
  ]);
  assert.equal(pickLanIpFromEnv(map), '192.168.1.10');
});

test('pickLanIpFromEnv falls back to APP_PORTAL_URL hostname', () => {
  assert.equal(
    pickLanIpFromEnv(new Map([['APP_PORTAL_URL', 'http://192.168.1.20:8080/portal']])),
    '192.168.1.20',
  );
});

test('isLanIpStale is false when configured IP matches a current candidate', () => {
  assert.equal(
    isLanIpStale('192.168.1.13', [{ address: '192.168.1.13', interfaceName: 'en0' }]),
    false,
  );
});

test('isLanIpStale is true when configured IP is absent from current candidates', () => {
  assert.equal(
    isLanIpStale('192.168.1.23', [{ address: '192.168.1.13', interfaceName: 'en0' }]),
    true,
  );
});

test('isLanIpStale is false for localhost or missing configuration', () => {
  const candidates = [{ address: '192.168.1.13', interfaceName: 'en0' }];
  assert.equal(isLanIpStale('127.0.0.1', candidates), false);
  assert.equal(isLanIpStale(null, candidates), false);
});

test('pickPracticeDisplayNameFromEnv reads PRACTICE_DISPLAY_NAME', () => {
  assert.equal(
    pickPracticeDisplayNameFromEnv(new Map([['PRACTICE_DISPLAY_NAME', 'Praxis Nord']])),
    'Praxis Nord',
  );
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
  const plan = buildSetupPlan(
    {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Nord',
      gateway: gwOff('192.168.1.20'),
    },
    new Map([
      ['SETUP_LAN_APP_IP', '192.168.1.10'],
      ['CANONICAL_BASE_URL', 'http://192.168.1.10:8080'],
    ]),
  );
  assert.equal(plan.deviceUrls.appBaseUrl, 'http://192.168.1.20:8080');
});

test('buildSetupPlan keeps custom hostname in preview when LAN IP changes', () => {
  const plan = buildSetupPlan(
    {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Nord',
      gateway: gwOff('192.168.1.20'),
    },
    new Map([
      ['SETUP_LAN_APP_IP', '192.168.1.10'],
      ['CANONICAL_BASE_URL', 'http://praxis-flow.local:8080'],
    ]),
  );
  assert.equal(plan.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
});

test('applySetupPlan materializes imported release images from manager state into env', async () => {
  await withRoot(async (root) => {
    writeExample(
      root,
      '# PRAXIS_FLOW_APP_IMAGE=ghcr.io/example/app:v1\n# PRAXIS_FLOW_SANDBOX_IMAGE=ghcr.io/example/sandbox:v1',
    );
    writeManagerReleaseState(root, {
      releaseVersion: '1.4.2',
      appImage: 'praxis-flow/app:1.4.2',
      sandboxImage: 'praxis-flow/sandbox:1.4.2',
      archiveSha256: 'e'.repeat(64),
    });

    await applySetupPlan(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        practiceDisplayName: 'Praxis Nord',
        gateway: gwOff('192.168.1.10'),
        runCompose: false,
        runProbes: false,
      },
      { inspectLifecycleResidues: async () => 'none' },
    );

    const map = env(root);
    assert.equal(map.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:1.4.2');
    assert.equal(map.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:1.4.2');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.10:8080');
  });
});

test('applySetupPlan rejects an inconsistent lifecycle before its first write', async () => {
  await withRoot(async (root) => {
    writeExample(root);
    writeEnv(root, {
      SETUP_LAN_APP_IP: '192.168.1.10',
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      TLS_STATE: 'off',
      TLS_CUTOVER_APPLIED: 'true',
    });
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    await assert.rejects(
      () =>
        applySetupPlan(ctx(root), {
          lanAppIp: '192.168.1.20',
          practiceDisplayName: 'Praxis Nord',
          gateway: gwOff('192.168.1.20'),
          preserveEnv: true,
          runCompose: false,
          runProbes: false,
        }),
      /setup-apply.*gesperrt/,
    );
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

test('applySetupPlan restores an existing env and stack when Staff binding compose fails', async () => {
  await withRoot(async (root) => {
    writeExample(root);
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
    });
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const composeBindings: string[] = [];

    await assert.rejects(
      () =>
        applySetupPlan(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            practiceDisplayName: 'Praxis Nord',
            gateway: gwOff('192.168.1.20'),
            preserveEnv: true,
            runCompose: true,
            runProbes: false,
          },
          {
            inspectLifecycleResidues: async () => 'none',
            validateStaffIp: () => null,
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => ({ ok: true, log: 'cleaned' }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async (options) => {
              composeBindings.push(
                readEnvMap(path.join(options.projectRoot, '.env')).get('APP_BIND_ADDRESS') || '',
              );
              return composeBindings.length === 1
                ? { ok: false, log: 'apply failed', gatewaySkipped: false }
                : { ok: true, log: 'rollback ok', gatewaySkipped: false };
            },
          },
        ),
      /vorheriger Zustand wurde wiederhergestellt/,
    );

    assert.deepEqual(composeBindings, ['0.0.0.0', '0.0.0.0']);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

test('applySetupPlan does not claim success when the runtime rollback fails', async () => {
  await withRoot(async (root) => {
    writeExample(root);
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
    });
    let composeUpCalls = 0;

    await assert.rejects(
      () =>
        applySetupPlan(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            practiceDisplayName: 'Praxis Nord',
            gateway: gwOff('192.168.1.20'),
            preserveEnv: true,
            runCompose: true,
            runProbes: false,
          },
          {
            inspectLifecycleResidues: async () => 'none',
            validateStaffIp: () => null,
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => ({ ok: true, log: 'cleaned' }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => {
              composeUpCalls += 1;
              return {
                ok: false,
                log: composeUpCalls === 1 ? 'apply failed' : 'rollback failed',
                gatewaySkipped: false,
              };
            },
          },
        ),
      /vorheriger Zustand wurde nicht vollständig wiederhergestellt/,
    );
    assert.equal(composeUpCalls, 2);
  });
});

test('applySetupPlan removes partial services when a fresh compose apply fails', async () => {
  await withRoot(async (root) => {
    writeExample(root);
    let cleanupSawEnv = false;
    let removedServices: string[] = [];

    await assert.rejects(
      () =>
        applySetupPlan(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            practiceDisplayName: 'Praxis Nord',
            gateway: gwOff('192.168.1.20'),
            runCompose: true,
            runProbes: false,
          },
          {
            inspectLifecycleResidues: async () => 'none',
            validateStaffIp: () => null,
            composePs: async () => ({ running: false, services: [] }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => ({
              ok: false,
              log: 'partial apply failed',
              gatewaySkipped: false,
            }),
            composeRemoveServices: async (_options, services) => {
              cleanupSawEnv = fs.existsSync(path.join(root, '.env'));
              removedServices = services;
              return { ok: true, log: 'partial services removed' };
            },
          },
        ),
      /vorheriger Zustand wurde wiederhergestellt/,
    );

    assert.equal(cleanupSawEnv, true);
    assert.deepEqual(removedServices, ['app', 'sandbox']);
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
  });
});

test('saveHostNetwork updates LAN and gateway keys without touching practice name', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Süd',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      GATEWAY_INTERFACE: 'eth1',
      GATEWAY_IP: '192.168.88.1',
      GATEWAY_AUTH_BRIDGE_URL: 'http://172.17.0.1:9100',
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.20',
      gateway: {
        enabled: true,
        gatewayInterface: 'eth2',
        gatewayIp: '192.168.99.1',
        portalAppIp: '192.168.1.20',
        authBridgeUrl: 'http://10.0.0.2:9100',
      },
    });

    const map = env(root);
    assert.equal(map.get('PRACTICE_DISPLAY_NAME'), 'Praxis Süd');
    assert.equal(map.get('SETUP_LAN_APP_IP'), '192.168.1.20');
    assert.equal(map.get('GATEWAY_INTERFACE'), 'eth2');
    assert.equal(map.get('GATEWAY_AUTH_BRIDGE_URL'), 'http://10.0.0.2:9100');
    assert.equal(map.get('GATEWAY_AUTH_BRIDGE_BIND'), '10.0.0.2');
  });
});

test('saveHostNetwork removes gateway keys when gateway is disabled', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      GATEWAY_INTERFACE: 'eth1',
      GATEWAY_IP: '192.168.88.1',
      APP_PORTAL_URL: 'http://192.168.1.10:8080/portal',
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.13',
      gateway: gwOff('192.168.1.13'),
    });

    const map = env(root);
    assert.equal(map.get('SETUP_LAN_APP_IP'), '192.168.1.13');
    assert.equal(map.get('GATEWAY_INTERFACE'), undefined);
    assert.equal(map.get('APP_PORTAL_URL'), undefined);
  });
});

test('saveHostNetwork keeps custom CANONICAL_BASE_URL hostname when LAN IP changes', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://praxis-flow.local:8080',
    });

    const result = await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.20',
      gateway: gwOff('192.168.1.20'),
    });

    assert.equal(env(root).get('CANONICAL_BASE_URL'), 'http://praxis-flow.local:8080');
    assert.equal(result.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
  });
});

test('saveHostNetwork preserves a persisted HTTP hostname without an override', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://praxis-flow.local:8080',
    });

    const result = await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.10',
      gateway: gwOff('192.168.1.10'),
    });

    assert.equal(env(root).get('CANONICAL_BASE_URL'), 'http://praxis-flow.local:8080');
    assert.equal(result.deviceUrls.appBaseUrl, 'http://praxis-flow.local:8080');
  });
});

test('saveHostNetwork derives proxy canonical from env when wire omits proxy', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      ...proxyOn,
    });

    const result = await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.50',
      gateway: gwOff('192.168.1.50'),
    });

    const map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'true');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.50');
    assert.equal(result.deviceUrls.appBaseUrl, 'http://192.168.1.50');
  });
});

test('saveHostNetwork preserves active TLS mode and canonical URL', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'https://7fk3m2.lan.notaus.de',
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '127.0.0.1',
      TLS_STATE: 'active',
      TLS_MODE: 'managed',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      TLS_CUTOVER_APPLIED: 'true',
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.20',
      gateway: gwOff('192.168.1.20'),
    });
    assert.equal(env(root).get('PROXY_MODE'), 'tls-managed');
    assert.equal(env(root).get('CANONICAL_BASE_URL'), 'https://7fk3m2.lan.notaus.de');
  });
});

test('saveHostNetwork syncs TLS_LAN_IP during TLS preparation', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.178.112',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      ...proxyOn,
      TLS_STATE: 'awaiting-operator-dns',
      TLS_MODE: 'managed',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      TLS_LAN_IP: '192.168.178.112',
      TLS_CUTOVER_APPLIED: 'false',
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.178.120',
      gateway: gwOff('192.168.178.120'),
    });

    const map = env(root);
    assert.equal(map.get('SETUP_LAN_APP_IP'), '192.168.178.120');
    assert.equal(map.get('TLS_LAN_IP'), '192.168.178.120');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.178.120');
    assert.equal(map.get('TLS_STATE'), 'awaiting-operator-dns');
  });
});

test('saveHostNetwork rejects proxy disable during TLS preparation', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.178.112',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      ...proxyOn,
      TLS_STATE: 'awaiting-operator-dns',
      TLS_MODE: 'managed',
      TLS_LAN_IP: '192.168.178.112',
      TLS_CUTOVER_APPLIED: 'false',
    });

    await assert.rejects(
      () =>
        saveHostNetwork(ctx(root), {
          lanAppIp: '192.168.178.112',
          gateway: gwOff('192.168.178.112'),
          proxy: { enabled: false, httpPort: 80 },
        }),
      /HTTPS-Vorbereitung/,
    );
  });
});

test('saveHostNetwork without proxy wire derives the open demo APP_BIND', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.50',
      CANONICAL_BASE_URL: 'http://192.168.1.50',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '127.0.0.1',
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.50',
      gateway: gwOff('192.168.1.50'),
    });

    const map = env(root);
    assert.equal(map.get('APP_BIND_ADDRESS'), '0.0.0.0');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.50:8080');
  });
});

test('saveHostNetwork enables and disables proxy from wire', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
    });

    await saveHostNetwork(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        proxy: { enabled: true, httpPort: 80 },
        gateway: gwOff('192.168.1.10'),
      },
      allowProxyPort,
    );
    let map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'true');
    assert.equal(map.get('APP_BIND_ADDRESS'), '127.0.0.1');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.10');

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.50',
      proxy: { enabled: false },
      gateway: gwOff('192.168.1.50'),
    });
    map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'false');
    assert.equal(map.get('APP_BIND_ADDRESS'), '0.0.0.0');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.50:8080');
  });
});

test('saveHostNetwork leaves PROXY_* untouched when proxy wire is absent', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.20',
      gateway: gwOff('192.168.1.20'),
    });

    const map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'true');
    assert.equal(map.get('APP_BIND_ADDRESS'), '127.0.0.1');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.20');
  });
});

test('saveHostNetwork restores :8080 on custom hostname when disabling proxy', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.50',
      CANONICAL_BASE_URL: 'http://praxis-flow.local',
      ...proxyOn,
    });

    await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.50',
      proxy: { enabled: false },
      gateway: gwOff('192.168.1.50'),
    });

    assert.equal(env(root).get('CANONICAL_BASE_URL'), 'http://praxis-flow.local:8080');
  });
});

test('applySetupPlan without proxy wire preserves PROXY companion keys', async () => {
  await withRoot(async (root) => {
    writeExample(root, 'PROXY_ENABLED=false\nAPP_BIND_ADDRESS=0.0.0.0');
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      OPENNDS_FAS_KEY: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
      PRAXIS_FLOW_PROXY_IMAGE: 'caddy:2.11.4',
    });

    await applySetupPlan(ctx(root), {
      lanAppIp: '192.168.1.20',
      practiceDisplayName: 'Praxis Nord',
      gateway: gwOff('192.168.1.20'),
      preserveEnv: true,
      runCompose: false,
      runProbes: false,
    });

    const map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'true');
    assert.equal(map.get('APP_BIND_ADDRESS'), '127.0.0.1');
    assert.equal(map.get('PRAXIS_FLOW_PROXY_IMAGE'), 'caddy:2.11.4');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.20');
  });
});

test('applySetupPlan preserves prepared and active restricted state', async () => {
  await withRoot(async (root) => {
    writeExample(root, 'PROXY_ENABLED=true\nPROXY_MODE=tls-managed\nAPP_BIND_ADDRESS=127.0.0.1');
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      OPENNDS_FAS_KEY: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'https://staff.installation.example',
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
      APP_BIND_ADDRESS: '127.0.0.1',
      TLS_STATE: 'active',
      TLS_MODE: 'managed',
      TLS_CUTOVER_APPLIED: 'true',
      TLS_INSTALLATION_ID: 'installation',
      TLS_HOSTNAME: 'staff.installation.example',
      TLS_STAFF_HOSTNAME: 'staff.installation.example',
      TLS_PORTAL_HOSTNAME: 'portal.installation.example',
      TLS_WILDCARD_CERTIFICATE_NAME: '*.installation.example',
      SETUP_RESTRICTED_ENABLED: 'true',
      SETUP_RESTRICTED_APP_IP: '10.20.0.2',
      SETUP_RESTRICTED_INTERFACE_ID: 'mac:aa:00:00:00:00:07',
      SETUP_RESTRICTED_WARNINGS_CONFIRMED: 'true',
      SETUP_RESTRICTED_SAME_INTERFACE_CONFIRMED: 'false',
    });

    await applySetupPlan(ctx(root), {
      lanAppIp: '192.168.1.10',
      practiceDisplayName: 'Praxis Nord',
      gateway: gwOff('192.168.1.10'),
      preserveEnv: true,
      runCompose: false,
      runProbes: false,
    });

    const map = env(root);
    assert.equal(map.get('SETUP_RESTRICTED_ENABLED'), 'true');
    assert.equal(map.get('SETUP_RESTRICTED_APP_IP'), '10.20.0.2');
    assert.equal(map.get('SETUP_RESTRICTED_INTERFACE_ID'), 'mac:aa:00:00:00:00:07');
    assert.equal(map.get('SETUP_RESTRICTED_WARNINGS_CONFIRMED'), 'true');
    assert.equal(map.get('SETUP_RESTRICTED_SAME_INTERFACE_CONFIRMED'), 'false');
  });
});

test('HTTP host apply preserves an in-progress TLS preparation', async () => {
  await withRoot(async (root) => {
    writeExample(root, 'PROXY_ENABLED=false\nPROXY_MODE=off\nAPP_BIND_ADDRESS=0.0.0.0');
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      OPENNDS_FAS_KEY: SECRET,
      SETUP_LAN_APP_IP: '192.168.178.112',
      CANONICAL_BASE_URL: 'http://192.168.178.112',
      ...proxyOn,
      TLS_STATE: 'awaiting-operator-dns',
      TLS_MODE: 'managed',
      TLS_INSTALLATION_ID: '7fk3m2q9',
      TLS_HOSTNAME: '7fk3m2.lan.notaus.de',
      TLS_LAN_IP: '192.168.178.112',
      TLS_CUTOVER_APPLIED: 'false',
      TLS_APPLY_READY: 'false',
      PROXY_CADDYFILE_HOST_PATH: '/install/state/tls/Caddyfile',
    });

    await applySetupPlan(ctx(root), {
      lanAppIp: '192.168.178.112',
      practiceDisplayName: 'Praxis Nord',
      proxy: { enabled: true, httpPort: 80 },
      gateway: gwOff('192.168.178.112'),
      preserveEnv: true,
      runCompose: false,
      runProbes: false,
    });

    const map = env(root);
    assert.equal(map.get('PROXY_MODE'), 'http');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.178.112');
    assert.equal(map.get('TLS_STATE'), 'awaiting-operator-dns');
    assert.equal(map.get('TLS_INSTALLATION_ID'), '7fk3m2q9');
    assert.equal(map.get('PROXY_CADDYFILE_HOST_PATH'), '/install/state/tls/Caddyfile');
  });
});

test('applySetupPlan with proxy wire can flip PROXY_ENABLED despite template preserve keys', async () => {
  await withRoot(async (root) => {
    // Active template keys: preserveExistingKeys would otherwise win over overrides.
    writeExample(root, 'PROXY_ENABLED=false\nPROXY_MODE=off\nAPP_BIND_ADDRESS=0.0.0.0');
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      AUTH_KEY_CAPTIVE: SECRET,
      SANDBOX_INTERNAL_TOKEN: SECRET,
      OPENNDS_FAS_KEY: SECRET,
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
      APP_BIND_ADDRESS: '0.0.0.0',
      PRAXIS_FLOW_PROXY_IMAGE: 'caddy:2.11.4',
    });

    await applySetupPlan(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        practiceDisplayName: 'Praxis Nord',
        proxy: { enabled: true, httpPort: 80 },
        gateway: gwOff('192.168.1.10'),
        preserveEnv: true,
        runCompose: false,
        runProbes: false,
      },
      allowProxyPort,
    );

    const map = env(root);
    assert.equal(map.get('PROXY_ENABLED'), 'true');
    assert.equal(map.get('PROXY_MODE'), 'http');
    assert.equal(map.get('APP_BIND_ADDRESS'), '127.0.0.1');
    assert.equal(map.get('PRAXIS_FLOW_PROXY_IMAGE'), 'caddy:2.11.4');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.10');
  });
});

test('saveHostNetwork repairProxy ensures image and compose-up even when stack was stopped', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
    });

    let ensureCalled = false;
    let composeUpCalled = false;
    const result = await saveHostNetwork(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        proxy: { enabled: true, httpPort: 80 },
        gateway: gwOff('192.168.1.10'),
        repairProxy: true,
      },
      {
        ...allowProxyPort,
        composePs: async () => ({ running: false, services: [] }),
        ensureProxyImageAvailable: async () => {
          ensureCalled = true;
          return { imageRef: 'caddy:2.11.4' };
        },
        composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
        composeUp: async () => {
          composeUpCalled = true;
          return { ok: true, log: 'up', gatewaySkipped: false };
        },
      },
    );

    assert.equal(ensureCalled, true);
    assert.equal(composeUpCalled, true);
    assert.equal(result.composeRestarted, true);
    assert.equal(result.stackWasRunning, false);
  });
});

test('saveHostNetwork removes partial services when repair of a stopped stack fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
    });
    const removed: string[][] = [];
    let psCalls = 0;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.10',
            proxy: { enabled: true, httpPort: 80 },
            gateway: gwOff('192.168.1.10'),
            repairProxy: true,
          },
          {
            ...allowProxyPort,
            composePs: async () => {
              psCalls += 1;
              return { running: false, services: [] };
            },
            composeRemoveServices: async (_options, services) => {
              removed.push(services);
              return { ok: true, log: 'partial services removed' };
            },
            composeStop: async () => ({ ok: true, log: 'stopped' }),
            ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => ({ ok: false, log: 'proxy failed', gatewaySkipped: false }),
          },
        ),
      /vorheriger Zustand wurde wiederhergestellt/,
    );

    assert.ok(psCalls >= 2);
    assert.deepEqual(removed, [['app', 'sandbox', 'proxy']]);
  });
});

test('saveHostNetwork repairProxy rejects when proxy is disabled', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
    });

    await assert.rejects(
      () =>
        saveHostNetwork(ctx(root), {
          lanAppIp: '192.168.1.10',
          proxy: { enabled: false, httpPort: 80 },
          gateway: gwOff('192.168.1.10'),
          repairProxy: true,
        }),
      (error: unknown) =>
        error instanceof SetupApiValidationError &&
        /Wiederherstellung nur möglich/.test(error.message),
    );
  });
});

test('saveHostNetwork blocks a restart before writes when Staff-IP is not local', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
    });
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    let removeCalled = false;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.99',
            gateway: gwOff('192.168.1.99'),
            restartCompose: true,
          },
          {
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => {
              removeCalled = true;
              return { ok: true, log: '' };
            },
            validateStaffIp: () =>
              'Staff-Bindung gesperrt: 192.168.1.99 ist an diesem Rechner nicht vorhanden.',
          },
        ),
      /nicht vorhanden/,
    );

    assert.equal(removeCalled, false);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

test('saveHostNetwork restores env and previous stack when compose apply fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
    });
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const composeBindings: string[] = [];

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            gateway: gwOff('192.168.1.20'),
            restartCompose: true,
          },
          {
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => ({ ok: true, log: '' }),
            validateStaffIp: () => null,
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async (options) => {
              composeBindings.push(
                readEnvMap(path.join(options.projectRoot, '.env')).get('APP_BIND_ADDRESS') || '',
              );
              return composeBindings.length === 1
                ? { ok: false, log: 'apply failed', gatewaySkipped: false }
                : { ok: true, log: 'rollback ok', gatewaySkipped: false };
            },
          },
        ),
      /vorheriger Zustand wurde wiederhergestellt/,
    );

    assert.deepEqual(composeBindings, ['0.0.0.0', '0.0.0.0']);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

test('saveHostNetwork reports an incomplete runtime rollback truthfully', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
    });
    let composeUpCalls = 0;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            gateway: gwOff('192.168.1.20'),
            restartCompose: true,
          },
          {
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => ({ ok: true, log: 'cleaned' }),
            validateStaffIp: () => null,
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => {
              composeUpCalls += 1;
              return {
                ok: false,
                log: composeUpCalls === 1 ? 'apply failed' : 'rollback failed',
                gatewaySkipped: false,
              };
            },
          },
        ),
      /vorheriger Zustand wurde nicht vollständig wiederhergestellt/,
    );
    assert.equal(composeUpCalls, 2);
  });
});

test('saveHostNetwork removes a newly enabled proxy before rolling back a failed apply', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
    });
    const removed: string[][] = [];
    let composeUpCalls = 0;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.10',
            proxy: { enabled: true, httpPort: 80 },
            gateway: gwOff('192.168.1.10'),
            restartCompose: true,
          },
          {
            ...allowProxyPort,
            composePs: async () => healthyCompose(),
            composeRemoveServices: async (_options, services) => {
              removed.push(services);
              return { ok: true, log: 'proxy removed' };
            },
            ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => {
              composeUpCalls += 1;
              return composeUpCalls === 1
                ? { ok: false, log: 'apply failed', gatewaySkipped: false }
                : { ok: true, log: 'rollback ok', gatewaySkipped: false };
            },
          },
        ),
      /vorheriger Zustand wurde wiederhergestellt/,
    );

    assert.deepEqual(removed, [['app', 'sandbox', 'proxy']]);
    assert.equal(env(root).get('PROXY_ENABLED'), 'false');
    assert.equal(env(root).get('APP_BIND_ADDRESS'), '0.0.0.0');
  });
});

test('saveHostNetwork restores the open mode when proxy image preflight fails', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      SETUP_LAN_APP_IP: '192.168.1.10',
      APP_BIND_ADDRESS: '0.0.0.0',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
    });
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8');
    let composeUpCalls = 0;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.10',
            proxy: { enabled: true, httpPort: 80 },
            gateway: gwOff('192.168.1.10'),
            restartCompose: true,
          },
          {
            ...allowProxyPort,
            composePs: async () => healthyCompose(),
            composeRemoveServices: async () => {
              assert.fail('Image preflight must not remove existing services');
            },
            ensureProxyImageAvailable: async () => {
              throw new Error('proxy image preflight failed');
            },
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => {
              composeUpCalls += 1;
              return { ok: true, log: '', gatewaySkipped: false };
            },
          },
        ),
      /Laufzeit blieb unverändert/,
    );

    assert.equal(composeUpCalls, 0);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
  });
});

for (const operation of ['network', 'setup'] as const) {
  for (const initialState of ['partial', 'stopped', 'fresh'] as const) {
    if (operation === 'network' && initialState === 'fresh') continue;
    test(`${operation} image preflight failure preserves ${initialState} runtime and env`, async () => {
      await withRoot(async (root) => {
        writeExample(root);
        if (initialState !== 'fresh') {
          writeEnv(root, {
            SETUP_LAN_APP_IP: '192.168.1.10',
            CANONICAL_BASE_URL: 'http://192.168.1.10',
            ...proxyOn,
          });
        }
        const envPath = path.join(root, '.env');
        const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
        const initialCompose =
          initialState === 'partial' ? healthyCompose(false) : { running: false, services: [] };
        const hooks: HostWriteRuntimeHooks = {
          inspectLifecycleResidues: async () => 'none',
          ...allowProxyPort,
          composePs: async () => initialCompose,
          ensureProxyImageAvailable: async () => {
            throw new Error('proxy image missing');
          },
          composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
          composeUp: async () => {
            assert.fail('No up before image preflight passes');
          },
          composeStop: async () => {
            assert.fail('No stop before image preflight passes');
          },
          composeRemoveServices: async () => {
            assert.fail('No cleanup before image preflight passes');
          },
        };
        await assert.rejects(
          () =>
            operation === 'network'
              ? saveHostNetwork(
                  ctx(root),
                  {
                    lanAppIp: '192.168.1.20',
                    gateway: gwOff('192.168.1.20'),
                    repairProxy: true,
                  },
                  hooks,
                )
              : applySetupPlan(
                  ctx(root),
                  {
                    lanAppIp: '192.168.1.20',
                    practiceDisplayName: 'Praxis Nord',
                    gateway: gwOff('192.168.1.20'),
                    proxy: { enabled: true, httpPort: 80 },
                    preserveEnv: true,
                    runCompose: true,
                    runProbes: false,
                  },
                  hooks,
                ),
          (error: unknown) => {
            assert.ok(error instanceof ManagerApiError);
            assert.match(error.message, /Laufzeit blieb unverändert/);
            assert.doesNotMatch(error.message, /proxy image missing/);
            assert.match(
              error.cause instanceof Error ? error.cause.message : '',
              /proxy image missing/,
            );
            return true;
          },
        );
        assert.equal(fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null, before);
      });
    });
  }

  for (const outcome of ['healthy', 'timeout', 'bad-bindings'] as const) {
    test(`${operation} rollback waits for health and checks bindings (${outcome})`, async () => {
      await withRoot(async (root) => {
        writeExample(root);
        writeEnv(root, {
          SETUP_LAN_APP_IP: '192.168.1.10',
          CANONICAL_BASE_URL: 'http://192.168.1.10',
          ...proxyOn,
        });
        let upCalls = 0;
        let sleeps = 0;
        let audits = 0;
        let now = 0;
        const hooks: HostWriteRuntimeHooks = {
          ...allowProxyPort,
          ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
          composeRemoveServices: async () => ({ ok: true, log: 'cleaned' }),
          composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
          composeUp: async () => {
            upCalls += 1;
            return {
              ok: upCalls > 1,
              log: upCalls === 1 ? 'apply failed' : 'started',
              gatewaySkipped: false,
            };
          },
          composePs: async () => {
            const compose = healthyCompose(true);
            if (upCalls >= 2 && (sleeps === 0 || outcome === 'timeout')) {
              compose.services[2]!.health = 'starting';
            }
            return compose;
          },
          stackHealthWaitOptions: {
            timeoutMs: 20,
            intervalMs: 10,
            now: () => now,
            sleep: async (ms) => {
              sleeps += 1;
              now += ms;
            },
          },
          auditStaffBindings: (input) => {
            audits += 1;
            assert.ok(sleeps > 0, 'Audit follows health readiness');
            return outcome === 'bad-bindings'
              ? [{ id: 'staff.binding.proxy', ok: false, message: 'unexpected publisher' }]
              : allowProxyPort.auditStaffBindings!(input);
          },
        };
        await assert.rejects(
          () =>
            operation === 'network'
              ? saveHostNetwork(
                  ctx(root),
                  {
                    lanAppIp: '192.168.1.20',
                    gateway: gwOff('192.168.1.20'),
                    repairProxy: true,
                  },
                  hooks,
                )
              : applySetupPlan(
                  ctx(root),
                  {
                    lanAppIp: '192.168.1.20',
                    practiceDisplayName: 'Praxis Nord',
                    gateway: gwOff('192.168.1.20'),
                    preserveEnv: true,
                    runCompose: true,
                    runProbes: false,
                  },
                  hooks,
                ),
          outcome === 'healthy'
            ? /wurde[n]? wiederhergestellt/
            : outcome === 'timeout'
              ? /nicht vollständig wiederhergestellt/
              : /nicht vollständig wiederhergestellt/,
        );
        assert.equal(upCalls, 2);
        assert.equal(sleeps, outcome === 'timeout' ? 2 : 1);
        assert.equal(audits, outcome === 'timeout' ? 0 : 1);
      });
    });
  }
}

test('saveHostNetwork rolls back when runtime binding audit rejects compose result', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10',
      ...proxyOn,
    });
    let composeUpCalls = 0;

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.20',
            gateway: gwOff('192.168.1.20'),
            restartCompose: true,
          },
          {
            composePs: async () => healthyCompose(true),
            composeRemoveServices: async () => ({ ok: true, log: '' }),
            composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
            composeUp: async () => {
              composeUpCalls += 1;
              return { ok: true, log: '', gatewaySkipped: false };
            },
            ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
            validateStaffIp: () => null,
            auditStaffBindings: () => [
              {
                id: 'staff.binding.app',
                ok: false,
                message: 'App besitzt unerwartete Host-Bindings',
              },
              { id: 'staff.binding.sandbox', ok: true, message: 'Sandbox korrekt' },
            ],
          },
        ),
      /nicht vollständig wiederhergestellt/,
    );

    assert.equal(composeUpCalls, 2);
    assert.equal(env(root).get('SETUP_LAN_APP_IP'), '192.168.1.10');
    assert.equal(env(root).get('APP_BIND_ADDRESS'), '127.0.0.1');
  });
});

test('failed disable cleanup retains its journal and blocks further changes (network + apply)', async () => {
  const { readBindingOperation } = await import('./binding-operation.js');
  const { readConfirmedHostConfig } = await import('./confirmed-host-config.js');
  for (const operation of ['network', 'setup']) {
    await withRoot(async (root) => {
      writeExample(root);
      writeEnv(root, {
        PRACTICE_DISPLAY_NAME: 'Praxis Nord',
        AUTH_KEY_CAPTIVE: SECRET,
        SANDBOX_INTERNAL_TOKEN: SECRET,
        OPENNDS_FAS_KEY: SECRET,
        SETUP_LAN_APP_IP: '192.168.1.50',
        CANONICAL_BASE_URL: 'http://192.168.1.50',
        ...proxyOn,
      });
      const change = () =>
        operation === 'network'
          ? saveHostNetwork(
              ctx(root),
              {
                lanAppIp: '192.168.1.50',
                proxy: { enabled: false },
                restartCompose: true,
                gateway: gwOff('192.168.1.50'),
              },
              removeFails,
            )
          : applySetupPlan(
              ctx(root),
              {
                lanAppIp: '192.168.1.50',
                practiceDisplayName: 'Praxis Nord',
                proxy: { enabled: false },
                gateway: gwOff('192.168.1.50'),
                preserveEnv: true,
                runCompose: true,
                runProbes: false,
              },
              removeFails,
            );
      await assert.rejects(
        change,
        (error: unknown) =>
          error instanceof ManagerApiError && error.code === 'staff_binding_rollback_incomplete',
      );
      assert.equal(readBindingOperation(root)?.phase, 'recovery-failed');
      assert.equal(readConfirmedHostConfig(root).env.get('PROXY_ENABLED'), 'true');
      await assert.rejects(
        change,
        (error: unknown) =>
          error instanceof ManagerApiError && error.code === 'binding_operation_inconsistent',
      );
    });
  }
});

for (const mode of ['managed', 'custom', 'legacy'] as const) {
  test(`repairProxy preserves active ${mode} TLS identity when proxy was stopped`, async () => {
    await withRoot(async (root) => {
      const tlsMode = mode === 'legacy' ? 'managed' : mode;
      const identity: Record<string, string> = {
        TLS_STATE: 'active',
        TLS_MODE: tlsMode,
        TLS_HOSTNAME: 'staff.example.test',
        TLS_CUTOVER_APPLIED: 'true',
        ...(mode === 'managed'
          ? {
              TLS_INSTALLATION_ID: 'example',
              TLS_INSTALLATION_DOMAIN: 'example.test',
              TLS_STAFF_HOSTNAME: 'staff.example.test',
              TLS_PORTAL_HOSTNAME: 'portal.example.test',
            }
          : {}),
        TLS_LAN_IP: '192.168.1.10',
      };
      writeEnv(root, {
        ...proxyOn,
        ...identity,
        PROXY_MODE: `tls-${tlsMode}`,
        SETUP_LAN_APP_IP: '192.168.1.10',
        CANONICAL_BASE_URL: 'https://staff.example.test',
      });
      let upCalls = 0;
      const result = await saveHostNetwork(
        ctx(root),
        { lanAppIp: '192.168.1.10', gateway: gwOff('192.168.1.10'), repairProxy: true },
        {
          ...allowProxyPort,
          composePs: async () => ({ running: false, services: [] }),
          ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
          composeValidateConfig: async () => ({ ok: true, log: 'valid' }),
          composeUp: async () => {
            upCalls++;
            return { ok: true, log: 'up', gatewaySkipped: false };
          },
        },
      );
      assert.equal(upCalls, 1);
      assert.equal(result.composeRestarted, true);
      const after = env(root);
      for (const [key, value] of Object.entries(identity)) assert.equal(after.get(key), value, key);
      assert.equal(after.get('CANONICAL_BASE_URL'), 'https://staff.example.test');
      assert.equal(after.get('APP_BIND_ADDRESS'), '127.0.0.1');
      if (mode !== 'managed') assert.equal(after.has('TLS_INSTALLATION_DOMAIN'), false);
    });
  });
}

for (const delivery of [false, true]) {
  test(`repair selects ${delivery ? 'delivery' : 'dev'} compose independently of persisted release images`, async () => {
    await withRoot(async (root) => {
      fs.writeFileSync(
        path.join(root, delivery ? 'docker-compose.delivery.yml' : 'docker-compose.yml'),
        'services: {}\n',
      );
      writeEnv(root, {
        ...proxyOn,
        SETUP_LAN_APP_IP: '192.168.1.10',
        PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:0.4.0',
        PRAXIS_FLOW_SANDBOX_IMAGE: 'praxis-flow/sandbox:0.4.0',
      });
      const profiles: (boolean | undefined)[] = [];
      await saveHostNetwork(
        ctx(root),
        {
          lanAppIp: '192.168.1.10',
          gateway: gwOff('192.168.1.10'),
          repairProxy: true,
        },
        {
          ...allowProxyPort,
          composePs: async (options) => {
            profiles.push(options.delivery);
            return { running: false, services: [] };
          },
          composeValidateConfig: async (options) => {
            profiles.push(options.delivery);
            return { ok: true, log: '' };
          },
          ensureProxyImageAvailable: async () => ({ imageRef: 'caddy:2.11.4' }),
          composeUp: async (options) => {
            profiles.push(options.delivery);
            return { ok: true, log: '', gatewaySkipped: false };
          },
        },
      );
      assert.ok(profiles.length >= 3);
      assert.ok(profiles.every((profile) => profile === delivery));
    });
  });
}

for (const action of ['repair', 'disable', 'setup', 'fresh-setup', 'throw'] as const) {
  test(`Compose preflight failure during ${action} restores env without touching containers or images`, async () => {
    await withRoot(async (root) => {
      writeExample(root);
      if (action !== 'fresh-setup')
        writeEnv(root, {
          ...proxyOn,
          SETUP_LAN_APP_IP: '192.168.1.10',
          CANONICAL_BASE_URL: 'http://192.168.1.10',
          AUTH_KEY_CAPTIVE: SECRET,
        });
      const before =
        action === 'fresh-setup' ? null : fs.readFileSync(path.join(root, '.env'), 'utf8');
      const mutations: string[] = [];
      const hooks: HostWriteRuntimeHooks = {
        inspectLifecycleResidues: async () => 'none',
        ...allowProxyPort,
        composePs: async () => healthyCompose(true),
        composeValidateConfig: async () => {
          if (action === 'throw') throw new Error('validation process failed');
          return { ok: false, log: 'MAINTENANCE_TOKEN is required' };
        },
        composeUp: async () => {
          mutations.push('up');
          return { ok: true, log: '', gatewaySkipped: false };
        },
        composeRemoveServices: async () => {
          mutations.push('remove');
          return { ok: true, log: '' };
        },
        composeStop: async () => {
          mutations.push('stop');
          return { ok: true, log: '' };
        },
        ensureProxyImageAvailable: async () => {
          mutations.push('image');
          return { imageRef: 'caddy:2.11.4' };
        },
      };
      await assert.rejects(
        () =>
          action.includes('setup')
            ? applySetupPlan(
                ctx(root),
                {
                  lanAppIp: '192.168.1.10',
                  practiceDisplayName: 'Praxis',
                  proxy: { enabled: true, httpPort: 80 },
                  gateway: gwOff('192.168.1.10'),
                  preserveEnv: true,
                  runCompose: true,
                  runProbes: false,
                },
                hooks,
              )
            : saveHostNetwork(
                ctx(root),
                {
                  lanAppIp: '192.168.1.10',
                  gateway: gwOff('192.168.1.10'),
                  ...(action === 'disable'
                    ? { proxy: { enabled: false }, restartCompose: true }
                    : { repairProxy: true }),
                },
                hooks,
              ),
        /Compose-Konfigurationsprüfung fehlgeschlagen.*Laufzeit blieb unverändert/,
      );
      assert.deepEqual(mutations, []);
      if (before === null) assert.equal(fs.existsSync(path.join(root, '.env')), false);
      else assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), before);
    });
  });
}

for (const action of ['start', 'restart'] as const) {
  for (const missing of ['volume', 'database'] as const) {
    test(`${action} refuses a missing ${missing} before compose up`, async () => {
      await withRoot(async (root) => {
        writeEnv(root, {
          SETUP_LAN_APP_IP: '192.168.1.10',
          PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:1.2.3',
        });
        let checked = false;
        const result = await runComposeAction(ctx(root), action, undefined, {
          composePs: async () => ({ running: false, services: [] }),
          inspectExistingAppDatabase: async (project, image) => {
            assert.equal(project, 'pf-test');
            assert.equal(image, 'praxis-flow/app:1.2.3');
            checked = true;
            return {
              ok: false,
              code: missing === 'volume' ? 'data-volume-missing' : 'database-missing',
            };
          },
          composeUp: async () => assert.fail('must not recreate an empty database'),
        });
        assert.equal(checked, true);
        assert.equal(result.ok, false);
        assert.match(result.log, /fehlt/);
      });
    });
  }
  test(`${action} checks the existing database before compose up`, async () => {
    await withRoot(async (root) => {
      writeEnv(root, {
        SETUP_LAN_APP_IP: '192.168.1.10',
        PRAXIS_FLOW_APP_IMAGE: 'praxis-flow/app:1.2.3',
      });
      const calls: string[] = [];
      const result = await runComposeAction(ctx(root), action, undefined, {
        composePs: async () => ({ running: false, services: [] }),
        inspectExistingAppDatabase: async () => {
          calls.push('database');
          return { ok: true };
        },
        composeUp: async () => {
          calls.push('up');
          return { ok: true, log: '', gatewaySkipped: false };
        },
        auditStaffBindings: () => [],
      });
      assert.equal(result.ok, true);
      assert.deepEqual(calls, ['database', 'up']);
    });
  });
}

test('readComposeForHost preserves a safe structured Compose error', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-observation-'));
  const cli = path.join(home, 'docker');
  const previous = process.env.PRAXIS_FLOW_DOCKER_CLI;
  t.after(() => {
    if (previous === undefined) delete process.env.PRAXIS_FLOW_DOCKER_CLI;
    else process.env.PRAXIS_FLOW_DOCKER_CLI = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  process.env.PRAXIS_FLOW_DOCKER_CLI = cli;
  fs.writeFileSync(path.join(home, '.env'), 'SETUP_LAN_APP_IP=192.168.1.10\n');
  fs.writeFileSync(
    cli,
    '#!/bin/sh\ncase "$*" in *"ps --all"*) echo private-docker-detail >&2; exit 1;; *) echo ok;; esac\n',
    { mode: 0o755 },
  );
  const docker = { installed: true, daemonRunning: true, composeAvailable: true, detail: null };
  await assert.rejects(
    () => readComposeForHost(ctx(home), true, docker, new Map()),
    (error) => {
      assert.ok(error instanceof ManagerApiError);
      assert.equal(error.code, 'compose_status_unavailable');
      assert.equal(error.category, 'unavailable');
      assert.equal(error.retryable, true);
      assert.ok(error.cause instanceof Error);
      assert.doesNotMatch(JSON.stringify(error.toJSON()), /private-docker-detail/);
      return true;
    },
  );
});

test('interrupted binding change restores confirmed env and only touches runtime after cutover', async () => {
  const { beginBindingOperation, writeBindingOperation, readBindingOperation } =
    await import('./binding-operation.js');
  const { recoverBindingOperation } = await import('./host-state.js');
  const { readConfirmedHostConfig } = await import('./confirmed-host-config.js');
  for (const phase of ['prepared', 'cutover', 'committed'] as const) {
    await withRoot(async (root) => {
      writeEnv(root, { SETUP_LAN_APP_IP: '192.168.1.10', PROXY_ENABLED: 'false' });
      const op = beginBindingOperation(root, true, false);
      writeBindingOperation(root, { ...op, phase, runtimeChanged: phase !== 'prepared' });
      writeEnv(root, { SETUP_LAN_APP_IP: '192.168.1.20', PROXY_ENABLED: 'false' });
      assert.equal(
        readConfirmedHostConfig(root).env.get('SETUP_LAN_APP_IP'),
        phase === 'committed' ? '192.168.1.20' : '192.168.1.10',
      );
      await assert.rejects(
        () =>
          saveHostNetwork(ctx(root), { lanAppIp: '192.168.1.30', gateway: gwOff('192.168.1.30') }),
        (error: unknown) =>
          error instanceof ManagerApiError && error.code === 'binding_operation_pending',
      );
      const calls: string[] = [];
      const result = await recoverBindingOperation(ctx(root), {
        composeRemoveServices: async () => {
          calls.push('remove');
          return { ok: true, log: '' };
        },
        composeUp: async () => {
          calls.push('up');
          return { ok: true, log: '', gatewaySkipped: false };
        },
        composePs: async () => healthyCompose(false),
      });
      assert.equal(result.ok, true, result.errors.join('\n'));
      assert.deepEqual(calls, phase === 'cutover' ? ['remove', 'up'] : []);
      assert.equal(
        readEnvMap(path.join(root, '.env')).get('SETUP_LAN_APP_IP'),
        phase === 'committed' ? '192.168.1.20' : '192.168.1.10',
      );
      assert.equal(readBindingOperation(root), null);
    });
  }
});
