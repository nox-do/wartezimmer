import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyNeedsRestore } from './network-view-model.js';
import { networkAccessSummary } from './network-access-view-model.js';
import { minimalHostStatus, knownLifecycle } from './test-fixtures/minimal-host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';

const service = { name: 'app', service: 'app', state: 'running', health: 'healthy' };

test('initial HTTP use does not require HTTPS and keeps its open scope explicit', () => {
  const status = minimalHostStatus({
    lifecycle: knownLifecycle(),
    compose: { running: true, services: [service] },
  });
  const view = networkAccessSummary(status);
  assert.equal(view.operation, 'Dienste laufen');
  assert.equal(view.needsAttention, false);
  assert.match(view.access, /alle Netzwerkanschlüsse/);
  assert.match(view.connection, /HTTP · nicht verschlüsselt/);
});

test('selected Ethernet adapter is matched by address, not candidate order', () => {
  const status = minimalHostStatus({
    network: {
      configuredLanIp: '192.168.1.10',
      lanIpStale: false,
      currentLanCandidates: [
        { address: '192.168.1.20', interfaceName: 'en0' },
        { address: '192.168.1.10', interfaceName: 'en7' },
      ],
    },
  });
  assert.equal(networkAccessSummary(status).adapter, '192.168.1.10 (en7)');
});

test('runtime missing proxy overrides saved running TLS container', () => {
  const status = minimalHostStatus();
  status.lifecycle = knownLifecycle('https');
  status.proxy = { ...status.proxy, enabled: true, mode: 'tls-managed', container: service };
  status.tls = {
    state: 'active',
    mode: 'managed',
    hostname: 'staff.example.test',
    installationId: 'example',
    tokenConsumed: true,
    applyReady: false,
    cutoverApplied: true,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
  };
  const runtime: HostRuntimeHealth = {
    checkedAt: '',
    envExists: true,
    configuredLanIp: '192.168.1.10',
    appBaseUrl: null,
    docker: status.docker,
    compose: { running: false, services: [service] },
    probes: [],
    sandboxScanner: null,
    proxyServer: { enabled: true, container: null },
  };
  const view = networkAccessSummary(status, runtime);
  assert.equal(view.connection, 'HTTPS eingerichtet');
  assert.match(view.operation, /Proxy-Dienst läuft nicht/);
  assert.match(networkAccessSummary(status, runtime, 'offline').operation, /nicht aktualisiert/);
  assert.match(
    networkAccessSummary(status, { ...runtime, compose: null }).operation,
    /Laufzustand unbekannt/,
  );
  assert.equal(proxyNeedsRestore(status, { ...runtime, compose: null }), false);
});

for (const [state, health, expected] of [
  ['exited', '', 'gestoppt'],
  ['running', 'starting', 'starten'],
  ['running', 'unhealthy', 'Störung'],
]) {
  test(`runtime distinguishes ${state}/${health}`, () => {
    const status = minimalHostStatus({
      compose: { running: false, services: [{ ...service, state, health }] },
    });
    assert.match(networkAccessSummary(status).operation, new RegExp(expected));
  });
}

test('missing, non-local and failed binding checks remain visible', () => {
  const status = minimalHostStatus();
  status.network.configuredLanIp = null;
  assert.match(networkAccessSummary(status).diagnosis, /auswählen/);
  status.network.configuredLanIp = '192.168.1.10';
  status.network.lanIpStale = true;
  assert.match(networkAccessSummary(status).diagnosis, /nicht vorhanden/);
  status.network.lanIpStale = false;
  status.networkBindings = [{ id: 'staff.binding.app', ok: false, message: 'Bindung unbekannt' }];
  assert.equal(networkAccessSummary(status).diagnosis, 'Bindung unbekannt');
  assert.equal(networkAccessSummary(status).needsAttention, true);
});

test('network summary exposes DNS filter guidance and removes it after recovery', () => {
  const status = minimalHostStatus({
    appBaseUrl: 'https://staff.abc.lan.notaus.de',
    configuredCanonicalBaseUrl: 'https://staff.abc.lan.notaus.de',
    probes: [{ id: 'app.health.lan', ok: false, message: 'DNS', reason: 'dns-rebind' }],
  });
  assert.match(networkAccessSummary(status).dnsWarning!, /lan\.notaus\.de als Ausnahme/);
  assert.equal(networkAccessSummary(status, null, 'offline').dnsWarning, null);
  status.probes = [{ id: 'app.health.lan', ok: true, message: 'ok' }];
  assert.equal(networkAccessSummary(status).dnsWarning, null);
});

test('central mode takes precedence over tentative TLS/proxy flags', () => {
  const status = minimalHostStatus();
  status.lifecycle = {
    assessment: 'known',
    mode: 'https',
    preparation: 'none',
    operation: 'portal-apply',
    recovery: 'none',
    issues: [],
  };
  // Legacy flags intentionally disagree: UI must use the confirmed backend assessment.
  status.proxy.enabled = false;
  const summary = networkAccessSummary(status);
  assert.equal(summary.connection, 'HTTPS eingerichtet');
  assert.equal(summary.proxy, true);
  assert.equal(summary.operatingMode, 'HTTPS');
  assert.match(summary.portalState!, /noch nicht abgeschlossen/);
});

test('unknown configuration does not claim HTTP or open publication on all NICs', () => {
  const status = minimalHostStatus();
  status.lifecycle = {
    assessment: 'unknown',
    mode: null,
    preparation: 'none',
    operation: 'none',
    recovery: 'none',
    issues: [],
  };
  const summary = networkAccessSummary(status);
  assert.equal(summary.tls, null);
  assert.equal(summary.proxy, null);
  assert.equal(summary.connection, 'Nicht sicher bestimmbar');
  assert.equal(summary.needsAttention, true);
  assert.doesNotMatch(summary.access, /alle Netzwerkanschlüsse/);
});
