import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:net';
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
  type HostWriteRuntimeHooks,
} from './host-state.js';
import { writeManagerReleaseState } from './manager-state.js';
import { SetupApiValidationError } from './setup-api-normalize.js';

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

async function withRoot(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-state-'));
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function listenEphemeral(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('ephemeral listen failed');
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const proxyOn = {
  PROXY_ENABLED: 'true',
  PROXY_MODE: 'http',
  PROXY_HTTP_PORT: '80',
  APP_BIND_ADDRESS: '127.0.0.1',
};

const allowProxyPort: HostWriteRuntimeHooks = {
  auditNetworkPrerequisites: async () => [
    { id: 'preflight.proxy-http-port', ok: true, message: 'Port frei' },
  ],
};

const removeFails: HostWriteRuntimeHooks = {
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

    await applySetupPlan(ctx(root), {
      lanAppIp: '192.168.1.10',
      practiceDisplayName: 'Praxis Nord',
      gateway: gwOff('192.168.1.10'),
      runCompose: false,
      runProbes: false,
    });

    const map = env(root);
    assert.equal(map.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:1.4.2');
    assert.equal(map.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:1.4.2');
    assert.equal(map.get('CANONICAL_BASE_URL'), 'http://192.168.1.10:8080');
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

test('saveHostNetwork writes explicit canonicalBaseUrl override', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
    });

    const result = await saveHostNetwork(ctx(root), {
      lanAppIp: '192.168.1.10',
      canonicalBaseUrl: 'http://praxis-flow.local:8080',
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

test('saveHostNetwork rejects unknown PROXY_MODE', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'tls-managed',
    });

    await assert.rejects(
      () =>
        saveHostNetwork(ctx(root), { lanAppIp: '192.168.1.10', gateway: gwOff('192.168.1.10') }),
      (error: unknown) => error instanceof Error && /PROXY_MODE=tls-managed/.test(error.message),
    );
  });
});

test('saveHostNetwork without proxy wire leaves disabled APP_BIND as stored', async () => {
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
    assert.equal(map.get('APP_BIND_ADDRESS'), '127.0.0.1');
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

test('proxy enable preflight calls composePs with withProxy true', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.10',
      CANONICAL_BASE_URL: 'http://192.168.1.10:8080',
    });

    const withProxyFlags: Array<boolean | undefined> = [];
    await saveHostNetwork(
      ctx(root),
      {
        lanAppIp: '192.168.1.10',
        proxy: { enabled: true, httpPort: 80 },
        gateway: gwOff('192.168.1.10'),
      },
      {
        ...allowProxyPort,
        composePs: async (options) => {
          withProxyFlags.push(options.withProxy);
          return { running: false, services: [] };
        },
      },
    );

    assert.ok(withProxyFlags.includes(true));
  });
});

test('saveHostNetwork blocks proxy enable when desired HTTP port is occupied', async () => {
  const listener = await listenEphemeral();
  try {
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
            proxy: { enabled: true, httpPort: listener.port },
            gateway: gwOff('192.168.1.10'),
          }),
        (error: unknown) =>
          error instanceof SetupApiValidationError &&
          new RegExp(`Port ${listener.port} ist bereits belegt`).test(error.message),
      );

      assert.equal(env(root).get('PROXY_ENABLED'), undefined);
      assert.equal(env(root).get('CANONICAL_BASE_URL'), 'http://192.168.1.10:8080');
    });
  } finally {
    await listener.close();
  }
});

test('disable cutover aborts when compose remove fails (network + apply)', async () => {
  await withRoot(async (root) => {
    writeEnv(root, {
      PRACTICE_DISPLAY_NAME: 'Praxis Nord',
      SETUP_LAN_APP_IP: '192.168.1.50',
      CANONICAL_BASE_URL: 'http://192.168.1.50',
      ...proxyOn,
    });

    await assert.rejects(
      () =>
        saveHostNetwork(
          ctx(root),
          {
            lanAppIp: '192.168.1.50',
            proxy: { enabled: false },
            restartCompose: true,
            gateway: gwOff('192.168.1.50'),
          },
          removeFails,
        ),
      (error: unknown) =>
        error instanceof SetupApiValidationError &&
        /Proxy-Container konnte nicht entfernt werden/.test(error.message),
    );
    assert.equal(env(root).get('PROXY_ENABLED'), 'true');

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

    await assert.rejects(
      () =>
        applySetupPlan(
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
        ),
      (error: unknown) =>
        error instanceof SetupApiValidationError &&
        /Proxy-Container konnte nicht entfernt werden/.test(error.message),
    );
    assert.equal(env(root).get('PROXY_ENABLED'), 'true');
  });
});
