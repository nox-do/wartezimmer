import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProxyEnvUpdates,
  buildProxyHttpCanonicalBaseUrl,
  buildProxyStatus,
  planProxyComposeActions,
  ProxyConfigError,
  readProxyConfig,
  resolveCanonicalBaseUrlForProxyPlan,
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

test('readProxyConfig rejects unknown PROXY_MODE', () => {
  assert.throws(
    () =>
      readProxyConfig(
        new Map([
          ['PROXY_ENABLED', 'true'],
          ['PROXY_MODE', 'tls-custom'],
        ]),
      ),
    (error: unknown) =>
      error instanceof ProxyConfigError && /PROXY_MODE=tls-custom/.test(error.message),
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
      error instanceof ProxyConfigError && /PROXY_MODE=http/.test(error.message),
  );
});

test('buildProxyHttpCanonicalBaseUrl omits standard port 80', () => {
  assert.equal(buildProxyHttpCanonicalBaseUrl('192.168.1.50', 80), 'http://192.168.1.50');
  assert.equal(
    buildProxyHttpCanonicalBaseUrl('192.168.1.50', 8088),
    'http://192.168.1.50:8088',
  );
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
