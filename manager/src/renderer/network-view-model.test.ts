import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkResult } from '../shared/host-status.js';
import {
  formatActiveReachabilityResult,
  networkDraftCommitPlacement,
  networkExpanderDefaults,
  networkHostChecksForDisplay,
  networkIsBusy,
  networkProxySubtitle,
  networkProxyMissingAfterRestart,
  networkRestartFailureMessage,
  networkSavedWhileStoppedMessage,
  proxyNeedsRestore,
  savedDeviceBaseUrl,
} from './network-view-model.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';

test('networkIsBusy covers in-flight phases only', () => {
  assert.equal(networkIsBusy('idle'), false);
  assert.equal(networkIsBusy('checking'), true);
  assert.equal(networkIsBusy('saving'), true);
  assert.equal(networkIsBusy('restarting'), true);
  assert.equal(networkIsBusy('loading'), true);
});

test('networkProxySubtitle labels the initial internal HTTP mode', () => {
  assert.equal(networkProxySubtitle(minimalHostStatus(), false), 'Proxy aus · HTTP mit :8080');
});

test('formatActiveReachabilityResult prefers actionable messages', () => {
  assert.match(
    formatActiveReachabilityResult(
      [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: true, message: 'ok' },
      ],
      'http://192.168.1.50',
    ).message,
    /erreichbar: http:\/\/192\.168\.1\.50/,
  );
  assert.match(
    formatActiveReachabilityResult(
      [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
      'http://192.168.1.50',
    ).message,
    /nicht über das Praxisnetz/,
  );
});

test('networkRestartFailureMessage hides raw compose noise when empty', () => {
  const result = {
    composeRestarted: false,
    stackWasRunning: true,
    restartLog: null,
  } as HostNetworkResult;
  assert.match(networkRestartFailureMessage(result), /nicht neu gestartet/);
  assert.match(networkSavedWhileStoppedMessage(), /sobald Praxis Flow gestartet/);
});

test('networkProxyMissingAfterRestart detects enabled-but-missing container', () => {
  assert.equal(
    networkProxyMissingAfterRestart(
      {
        composeRestarted: true,
        compose: { running: true, services: [] },
      } as unknown as HostNetworkResult,
      true,
    ),
    true,
  );
});

test('proxyNeedsRestore uses runtime container when runtime snapshot exists', () => {
  const config = minimalHostStatus({
    proxy: {
      enabled: true,
      mode: 'http',
      canonicalBaseUrl: 'http://192.168.1.10',
      httpPort: 80,
      appBindAddress: '127.0.0.1',
      container: {
        name: 'stale',
        service: 'proxy',
        state: 'exited',
        health: null,
      },
    },
  });
  assert.equal(proxyNeedsRestore(config, null), true);
  assert.equal(
    proxyNeedsRestore(config, {
      checkedAt: 't',
      envExists: true,
      configuredLanIp: '192.168.1.10',
      appBaseUrl: null,
      docker: config.docker,
      compose: { running: false, services: [] },
      probes: [],
      sandboxScanner: null,
      proxyServer: null,
    }),
    true,
  );
  assert.equal(
    proxyNeedsRestore(config, {
      checkedAt: 't',
      envExists: true,
      configuredLanIp: '192.168.1.10',
      appBaseUrl: null,
      docker: config.docker,
      compose: { running: false, services: [] },
      probes: [],
      sandboxScanner: null,
      proxyServer: {
        enabled: true,
        container: {
          name: 'up',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
        },
      },
    }),
    false,
  );
  assert.equal(
    savedDeviceBaseUrl(minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10' })),
    'http://192.168.1.10',
  );
});

test('networkHostChecksForDisplay drops gateway leftover checks', () => {
  assert.deepEqual(
    networkHostChecksForDisplay([
      { id: 'lan.ip-on-host', ok: true, message: 'LAN ok' },
      { id: 'gateway.interface', ok: false, message: 'NIC fehlt' },
    ]).map((check) => check.id),
    ['lan.ip-on-host'],
  );
});

test('networkHostChecksForDisplay keeps Staff runtime binding failures', () => {
  assert.deepEqual(
    networkHostChecksForDisplay([
      { id: 'staff.binding.app', ok: false, message: 'Globale App-Bindung' },
      { id: 'staff.binding.proxy', ok: true, message: 'Proxy-Bindung korrekt' },
    ]).map((check) => check.id),
    ['staff.binding.app', 'staff.binding.proxy'],
  );
});

test('networkExpanderDefaults opens LAN and proxy when host checks are degraded', () => {
  const defaults = networkExpanderDefaults({
    status: minimalHostStatus({
      networkBindings: [{ id: 'app.port', ok: false, message: 'down' }],
      proxy: {
        enabled: true,
        mode: 'http',
        canonicalBaseUrl: 'http://192.168.1.10',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
        container: null,
      },
    }),
    proxyEnabled: true,
  });
  assert.equal(defaults.lanOpen, true);
  assert.equal(defaults.proxyOpen, true);
  assert.equal(defaults.topologyOpen, false);
});

test('networkExpanderDefaults: TLS off opens proxy and closes device address', () => {
  const defaults = networkExpanderDefaults({
    status: minimalHostStatus(),
    proxyEnabled: false,
  });
  assert.equal(defaults.tlsOpen, false);
  assert.equal(defaults.proxyOpen, true);
  assert.equal(defaults.lanOpen, false);
});

test('networkExpanderDefaults: TLS active does not force-open proxy', () => {
  const defaults = networkExpanderDefaults({
    status: minimalHostStatus({
      tls: {
        state: 'awaiting-operator-dns',
        mode: 'managed',
        hostname: 'demo.lan.notaus.de',
        installationId: 'id',
        tokenConsumed: false,
        applyReady: false,
        cutoverApplied: false,
        certificate: null,
        lastError: null,
        acmeCnameTarget: null,
      },
      proxy: {
        enabled: true,
        mode: 'http',
        canonicalBaseUrl: 'http://192.168.1.10',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
        container: {
          name: 'up',
          service: 'proxy',
          state: 'running',
          health: 'healthy',
        },
      },
    }),
    proxyEnabled: true,
  });
  assert.equal(defaults.proxyOpen, false);
});

test('networkDraftCommitPlacement follows open, rendered draft expanders', () => {
  assert.deepEqual(
    networkDraftCommitPlacement({
      dirty: true,
      lanOpen: false,
      proxyOpen: true,
      httpDraftExpandersRendered: false,
    }),
    { lan: false, proxy: false },
  );
  assert.deepEqual(
    networkDraftCommitPlacement({
      dirty: true,
      lanOpen: false,
      proxyOpen: true,
      httpDraftExpandersRendered: true,
    }),
    { lan: false, proxy: true },
  );
  assert.deepEqual(
    networkDraftCommitPlacement({
      dirty: false,
      lanOpen: true,
      proxyOpen: true,
      httpDraftExpandersRendered: true,
    }),
    { lan: false, proxy: false },
  );
});

test('DNS filter help selects the correct exception without treating the suspicion as proof', () => {
  for (const [host, exception] of [
    ['staff.abc.lan.notaus.de', 'lan.notaus.de'],
    ['staff.praxis.example', 'staff.praxis.example'],
    ['staff.lan.notaus.de.other.example', 'staff.lan.notaus.de.other.example'],
  ]) {
    const result = formatActiveReachabilityResult(
      [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'DNS', reason: 'dns-rebind' },
      ],
      `https://${host}`,
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /DNS-Rebind-Schutz.*möglich/);
    assert.ok(result.message.includes(`dort ${exception} als Ausnahme`));
  }
});
