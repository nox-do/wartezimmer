import assert from 'node:assert/strict';
import test from 'node:test';
import { PRAXIS_FLOW_PROXY_IMAGE_COMPOSE_DEFAULT_REF } from '@praxis-flow/server-shared';
import {
  assertComposeRemoveSucceeded,
  buildProxyEnvUpdates,
  buildProxyHttpCanonicalBaseUrl,
  buildProxyStatus,
  ensureProxyImageAvailable,
  planProxyComposeActions,
  ProxyConfigError,
  readProxyConfig,
  resolveCanonicalBaseUrlForProxyPlan,
  resolveProxyConfigForWrite,
  resolveProxyImageRef,
} from './proxy.js';

test('readProxyConfig defaults to off with public app bind', () => {
  assert.deepEqual(readProxyConfig(new Map()), {
    enabled: false,
    mode: 'off',
    httpPort: 80,
    appBindAddress: '0.0.0.0',
  });
});

test('readProxyConfig activates http mode with loopback bind', () => {
  const env = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['PROXY_HTTP_PORT', '8088'],
  ]);
  assert.deepEqual(readProxyConfig(env), {
    enabled: true,
    mode: 'http',
    httpPort: 8088,
    appBindAddress: '127.0.0.1',
  });
});

test('readProxyConfig accepts TLS modes and rejects unknown PROXY_MODE', () => {
  assert.deepEqual(
    readProxyConfig(
      new Map([
        ['PROXY_ENABLED', 'true'],
        ['PROXY_MODE', 'tls-custom'],
      ]),
    ),
    {
      enabled: true,
      mode: 'tls-custom',
      httpPort: 80,
      appBindAddress: '127.0.0.1',
    },
  );
  assert.throws(
    () =>
      readProxyConfig(
        new Map([
          ['PROXY_ENABLED', 'false'],
          ['PROXY_MODE', 'weird'],
        ]),
      ),
    ProxyConfigError,
  );
});

test('readProxyConfig rejects invalid PROXY_ENABLED tokens', () => {
  assert.throws(
    () => readProxyConfig(new Map([['PROXY_ENABLED', 'treu']])),
    (error: unknown) =>
      error instanceof ProxyConfigError && /PROXY_ENABLED=treu/.test(error.message),
  );
});

test('readProxyConfig rejects PROXY_ENABLED=false with PROXY_MODE=http', () => {
  assert.throws(
    () =>
      readProxyConfig(
        new Map([
          ['PROXY_ENABLED', 'false'],
          ['PROXY_MODE', 'http'],
        ]),
      ),
    (error: unknown) =>
      error instanceof ProxyConfigError &&
      /PROXY_MODE=http erfordert PROXY_ENABLED=true/.test(error.message),
  );
});

test('readProxyConfig rejects PROXY_ENABLED=true with PROXY_MODE=off', () => {
  assert.throws(
    () =>
      readProxyConfig(
        new Map([
          ['PROXY_ENABLED', 'true'],
          ['PROXY_MODE', 'off'],
        ]),
      ),
    (error: unknown) =>
      error instanceof ProxyConfigError && /aktiven PROXY_MODE/.test(error.message),
  );
});

test('resolveProxyConfigForWrite blocks network payloads after TLS cutover', () => {
  const activeTls = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'tls-managed'],
  ]);
  assert.throws(
    () => resolveProxyConfigForWrite(activeTls, { enabled: true, httpPort: 80 }),
    /darf einen aktiven TLS-Proxy weder ändern noch auf HTTP zurücksetzen/,
  );
});

test('resolveProxyConfigForWrite blocks proxy disable during TLS preparation', () => {
  const preparing = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['TLS_STATE', 'awaiting-operator-dns'],
    ['TLS_CUTOVER_APPLIED', 'false'],
  ]);
  assert.throws(
    () => resolveProxyConfigForWrite(preparing, { enabled: false, httpPort: 80 }),
    /HTTPS-Vorbereitung/,
  );
});

test('resolveProxyConfigForWrite allows httpPort tweak while TLS preparation is active', () => {
  const preparing = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['TLS_STATE', 'dns-verified'],
    ['TLS_CUTOVER_APPLIED', 'false'],
  ]);
  const result = resolveProxyConfigForWrite(preparing, { enabled: true, httpPort: 8088 });
  assert.equal(result.writeEnv, true);
  assert.equal(result.proxy.httpPort, 8088);
});

test('resolveCanonicalBaseUrlForProxyPlan blocks reachability override during TLS preparation', () => {
  assert.throws(
    () =>
      resolveCanonicalBaseUrlForProxyPlan({
        proxy: {
          enabled: true,
          mode: 'http',
          httpPort: 80,
          appBindAddress: '127.0.0.1',
        },
        existingCanonical: 'http://192.168.1.10',
        previousLanIp: '192.168.1.10',
        nextLanIp: '192.168.1.10',
        overrideCanonical: 'http://praxis-flow.local',
        tlsPreparationActive: true,
      }),
    /Erreichbarkeit nicht ändern/,
  );
});

test('buildProxyHttpCanonicalBaseUrl omits standard port 80', () => {
  assert.equal(buildProxyHttpCanonicalBaseUrl('192.168.1.50', 80), 'http://192.168.1.50');
  assert.equal(buildProxyHttpCanonicalBaseUrl('192.168.1.50', 8088), 'http://192.168.1.50:8088');
});

test('resolveCanonicalBaseUrlForProxyPlan derives http URL from LAN host when proxy on', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: true,
        mode: 'http',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
      },
      existingCanonical: 'http://192.168.1.10:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.50',
    }),
    'http://192.168.1.50',
  );
});

test('resolveCanonicalBaseUrlForProxyPlan keeps custom hostname host with proxy port', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: true,
        mode: 'http',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
      },
      existingCanonical: 'http://praxis-flow.local:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.50',
    }),
    'http://praxis-flow.local',
  );
});

test('resolveCanonicalBaseUrlForProxyPlan rewrites proxy-derived IP on LAN change', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: true,
        mode: 'http',
        httpPort: 8088,
        appBindAddress: '127.0.0.1',
      },
      existingCanonical: 'http://192.168.1.10:8088',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    'http://192.168.1.20:8088',
  );
});

test('resolveCanonicalBaseUrlForProxyPlan keeps P0 :8080 when proxy off', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: false,
        mode: 'off',
        httpPort: 80,
        appBindAddress: '0.0.0.0',
      },
      existingCanonical: 'http://192.168.1.10:8080',
      previousLanIp: '192.168.1.10',
      nextLanIp: '192.168.1.20',
    }),
    'http://192.168.1.20:8080',
  );
});

test('buildProxyEnvUpdates writes companion keys only when proxy is active or already configured', () => {
  assert.deepEqual(
    buildProxyEnvUpdates({
      enabled: true,
      mode: 'http',
      httpPort: 80,
      appBindAddress: '127.0.0.1',
    }),
    {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '127.0.0.1',
    },
  );

  assert.deepEqual(
    buildProxyEnvUpdates({
      enabled: false,
      mode: 'off',
      httpPort: 80,
      appBindAddress: '0.0.0.0',
    }),
    {},
  );

  assert.deepEqual(
    buildProxyEnvUpdates(
      {
        enabled: false,
        mode: 'off',
        httpPort: 80,
        appBindAddress: '0.0.0.0',
      },
      new Map([['PROXY_ENABLED', 'true']]),
    ),
    {
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '0.0.0.0',
    },
  );
});

test('buildProxyEnvUpdates covers enabled → disabled companion keys', () => {
  const enabledEnv = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['PROXY_HTTP_PORT', '80'],
    ['APP_BIND_ADDRESS', '127.0.0.1'],
    ['CANONICAL_BASE_URL', 'http://192.168.1.50'],
  ]);
  assert.deepEqual(
    buildProxyEnvUpdates(
      {
        enabled: false,
        mode: 'off',
        httpPort: 80,
        appBindAddress: '0.0.0.0',
      },
      enabledEnv,
    ),
    {
      PROXY_ENABLED: 'false',
      PROXY_MODE: 'off',
      PROXY_HTTP_PORT: '80',
      APP_BIND_ADDRESS: '0.0.0.0',
    },
  );
});

test('resolveCanonicalBaseUrlForProxyPlan restores :8080 when leaving proxy', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: false,
        mode: 'off',
        httpPort: 80,
        appBindAddress: '0.0.0.0',
      },
      existingCanonical: 'http://192.168.1.50',
      previousLanIp: '192.168.1.50',
      nextLanIp: '192.168.1.50',
    }),
    'http://192.168.1.50:8080',
  );
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: false,
        mode: 'off',
        httpPort: 8088,
        appBindAddress: '0.0.0.0',
      },
      existingCanonical: 'http://192.168.1.50:8088',
      previousLanIp: '192.168.1.50',
      nextLanIp: '192.168.1.50',
    }),
    'http://192.168.1.50:8080',
  );
});

test('resolveCanonicalBaseUrlForProxyPlan restores :8080 for custom hostname when leaving proxy', () => {
  assert.equal(
    resolveCanonicalBaseUrlForProxyPlan({
      proxy: {
        enabled: false,
        mode: 'off',
        httpPort: 80,
        appBindAddress: '0.0.0.0',
      },
      existingCanonical: 'http://praxis-flow.local',
      previousLanIp: '192.168.1.50',
      nextLanIp: '192.168.1.50',
    }),
    'http://praxis-flow.local:8080',
  );
});

test('resolveProxyConfigForWrite leaves env when override absent', () => {
  const env = new Map([
    ['PROXY_ENABLED', 'true'],
    ['PROXY_MODE', 'http'],
    ['PROXY_HTTP_PORT', '80'],
  ]);
  const resolved = resolveProxyConfigForWrite(env);
  assert.equal(resolved.writeEnv, false);
  assert.equal(resolved.proxy.enabled, true);
});

test('resolveProxyConfigForWrite applies enable override', () => {
  const resolved = resolveProxyConfigForWrite(new Map(), { enabled: true });
  assert.equal(resolved.writeEnv, true);
  assert.deepEqual(resolved.proxy, {
    enabled: true,
    mode: 'http',
    httpPort: 80,
    appBindAddress: '127.0.0.1',
  });
});

test('planProxyComposeActions removes proxy before up when disabling on a running stack', () => {
  assert.deepEqual(
    planProxyComposeActions({
      proxyEnabled: false,
      restartCompose: true,
      stackWasRunning: true,
    }),
    { removeProxyFirst: true, composeUp: true },
  );
  assert.deepEqual(
    planProxyComposeActions({
      proxyEnabled: true,
      restartCompose: true,
      stackWasRunning: true,
    }),
    { removeProxyFirst: false, composeUp: true },
  );
  assert.deepEqual(
    planProxyComposeActions({
      proxyEnabled: false,
      restartCompose: false,
      stackWasRunning: true,
    }),
    { removeProxyFirst: false, composeUp: false },
  );
});

test('assertComposeRemoveSucceeded throws when compose rm failed', () => {
  assert.doesNotThrow(() => assertComposeRemoveSucceeded({ ok: true, log: '' }));
  assert.throws(
    () => assertComposeRemoveSucceeded({ ok: false, log: 'permission denied' }),
    (error: unknown) =>
      error instanceof ProxyConfigError &&
      /Proxy-Container konnte nicht entfernt werden/.test(error.message) &&
      /permission denied/.test(error.message),
  );
});

test('buildProxyStatus distinguishes missing container from stopped service', () => {
  const proxy = {
    enabled: true,
    mode: 'http' as const,
    httpPort: 80,
    appBindAddress: '127.0.0.1',
  };
  assert.equal(
    buildProxyStatus({
      proxy,
      canonicalBaseUrl: 'http://192.168.1.50',
      compose: { running: true, services: [] },
    }).container,
    null,
  );

  const stopped = buildProxyStatus({
    proxy,
    canonicalBaseUrl: 'http://192.168.1.50',
    compose: {
      running: false,
      services: [
        {
          name: 'praxis-flow-proxy',
          service: 'proxy',
          state: 'exited',
          health: null,
          publishedPorts: [80],
        },
      ],
    },
  });
  assert.equal(stopped.enabled, true);
  assert.equal(stopped.container?.service, 'proxy');
  assert.equal(stopped.container?.state, 'exited');
});

test('resolveProxyImageRef falls back to the Compose stock default', () => {
  assert.equal(resolveProxyImageRef(undefined), PRAXIS_FLOW_PROXY_IMAGE_COMPOSE_DEFAULT_REF);
  assert.equal(resolveProxyImageRef(new Map()), PRAXIS_FLOW_PROXY_IMAGE_COMPOSE_DEFAULT_REF);
  assert.equal(
    resolveProxyImageRef(
      new Map([['PRAXIS_FLOW_PROXY_IMAGE', 'praxis-flow-proxy:2.11.4-acmedns']]),
    ),
    'praxis-flow-proxy:2.11.4-acmedns',
  );
});

test('ensureProxyImageAvailable accepts the release-supplied local image', async () => {
  const result = await ensureProxyImageAvailable(
    new Map([['PRAXIS_FLOW_PROXY_IMAGE', 'caddy:test']]),
    {
      imageExists: async () => true,
    },
  );
  assert.equal(result.imageRef, 'caddy:test');
});

test('ensureProxyImageAvailable requires a verified release package when missing', async () => {
  await assert.rejects(
    () =>
      ensureProxyImageAvailable(undefined, {
        imageExists: async () => false,
      }),
    /automatische Registry-Downloads sind deaktiviert/,
  );
});
