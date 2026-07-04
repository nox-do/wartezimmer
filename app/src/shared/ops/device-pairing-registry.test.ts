import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { resetOpsEventHubForTests, subscribeOpsStream } from './ops-event-hub.js';
import { resetDevicePresenceForTests } from './device-presence-registry.js';

const savedPairingTtl = process.env.DEVICE_PAIRING_TTL_MS;

afterEach(() => {
  mock.timers.reset();
  if (savedPairingTtl === undefined) {
    delete process.env.DEVICE_PAIRING_TTL_MS;
  } else {
    process.env.DEVICE_PAIRING_TTL_MS = savedPairingTtl;
  }
  resetDevicePresenceForTests();
  resetOpsEventHubForTests();
});

test('scheduled pairing expiry publishes device.pairing none at TTL', async () => {
  process.env.DEVICE_PAIRING_TTL_MS = '1000';
  const pairingRegistry = await import(`./device-pairing-registry.js?ttl=1000-${Date.now()}`);

  const events: Array<{ kind: string; phase: string }> = [];
  subscribeOpsStream((event) => {
    if (event.type === 'device.pairing') {
      events.push({ kind: event.payload.kind, phase: event.payload.phase });
    }
  });

  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  const started = pairingRegistry.startDevicePairing({
    role: 'terminal',
    displayId: 'checkin-terminal',
  });
  assert.ok(started);
  assert.equal(events.at(-1)?.phase, 'pending');

  mock.timers.tick(1_000);
  assert.equal(events.at(-1)?.phase, 'none');

  pairingRegistry.resetDevicePairingForTests();
});

test('startDevicePairing replaces existing pending pairing for role', async () => {
  const pairingRegistry = await import(`./device-pairing-registry.js?single-pending-${Date.now()}`);

  const first = pairingRegistry.startDevicePairing({
    role: 'terminal',
    displayId: 'checkin-terminal',
  });
  const second = pairingRegistry.startDevicePairing({
    role: 'terminal',
    displayId: 'checkin-terminal',
  });
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.code, second.code);
  assert.equal(pairingRegistry.confirmDevicePairing('terminal', first.code), null);
  assert.ok(pairingRegistry.confirmDevicePairing('terminal', second.code));

  pairingRegistry.resetDevicePairingForTests();
});

test('confirmed pairing without device poll is cleaned up', async () => {
  process.env.DEVICE_PAIRING_CONFIRMED_POLL_TTL_MS = '1000';
  const pairingRegistry = await import(`./device-pairing-registry.js?confirmed-ttl-${Date.now()}`);

  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  const started = pairingRegistry.startDevicePairing({
    role: 'terminal',
    displayId: 'checkin-terminal',
  });
  assert.ok(started);
  const pairing = pairingRegistry.getDevicePairingById(started.pairingId);
  assert.ok(pairing);
  pairingRegistry.attachDeviceSessionToPairing('terminal', pairing, 'device-token', 'session-1');

  assert.ok(pairingRegistry.getDevicePairingById(started.pairingId));
  mock.timers.tick(1_000);
  assert.equal(pairingRegistry.getDevicePairingById(started.pairingId), undefined);

  pairingRegistry.resetDevicePairingForTests();
});
