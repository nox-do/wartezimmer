import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { tabDisabled } from './manager-main-nav.js';

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
