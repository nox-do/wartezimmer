import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { tabDisabled, setupReadyForTools } from './manager-main-nav.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';

test('tabDisabled allows status and wizard without host status', () => {
  assert.equal(tabDisabled('status', null), null);
  assert.equal(tabDisabled('wizard', null), null);
  assert.equal(tabDisabled('network', null), 'Noch nicht verfügbar');
  assert.equal(tabDisabled('maintenance', null), 'Noch nicht verfügbar');
});

test('tabDisabled blocks network and maintenance until setup tools are ready', () => {
  const notReady = minimalHostStatus({
    envExists: false,
    docker: { installed: false, daemonRunning: false, composeAvailable: false, detail: null },
  });
  assert.equal(tabDisabled('network', notReady), 'Nach der Einrichtung verfügbar');
  assert.equal(tabDisabled('maintenance', notReady), 'Nach der Einrichtung verfügbar');
  assert.equal(tabDisabled('status', notReady), null);
});

test('tabDisabled enables network and maintenance when env and docker are ready', () => {
  const ready = minimalHostStatus();
  assert.equal(tabDisabled('network', ready), null);
  assert.equal(tabDisabled('maintenance', ready), null);
});

test('setupReadyForTools prefers runtime docker/env over stale config', () => {
  const config = minimalHostStatus({
    envExists: false,
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
  });
  const runtime: HostRuntimeHealth = {
    checkedAt: '2026-07-21T12:00:00.000Z',
    envExists: true,
    configuredLanIp: '192.168.1.10',
    appBaseUrl: 'http://192.168.1.10:8080',
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
    compose: null,
    probes: [],
    sandboxScanner: null,
    proxyServer: null,
  };
  assert.equal(setupReadyForTools(config, null), false);
  assert.equal(setupReadyForTools(config, runtime), true);
  assert.equal(tabDisabled('network', config, runtime), null);
});
