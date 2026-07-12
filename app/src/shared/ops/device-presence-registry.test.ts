import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { resetOpsEventHubForTests, subscribeOpsStream } from './ops-event-hub.js';
import {
  resetDevicePairingForTests,
  startDevicePairing,
  hasPendingPairingForRole,
} from './device-pairing-registry.js';
import {
  listDevicePresence,
  markDeviceStreamConnected,
  markDeviceStreamDisconnected,
  recordDevicePresence,
  refreshKnownDevicePresence,
  resetDevicePresenceForTests,
  TERMINAL_DEVICE_ID,
  WAITING_ROOM_DEVICE_ID,
} from './device-presence-registry.js';

afterEach(() => {
  resetDevicePresenceForTests();
  resetDevicePairingForTests();
  resetOpsEventHubForTests();
  mock.timers.reset();
});

test('paired TV without SSE stream is online while heartbeat is fresh', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  recordDevicePresence({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });

  const waitingRoom = listDevicePresence().find(
    (entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID,
  );

  assert.equal(waitingRoom?.status, 'online');
  assert.equal(waitingRoom?.streamConnected, false);
});

test('paired terminal without SSE stream ages from heartbeat to offline', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  recordDevicePresence({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });

  let terminal = listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID);

  assert.equal(terminal?.status, 'online');
  assert.equal(terminal?.streamConnected, false);

  mock.timers.tick(10_000);
  terminal = listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID);
  assert.equal(terminal?.status, 'offline');
  assert.equal(terminal?.streamConnected, false);
});

test('TV in pairing mode stays online from heartbeat without SSE', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  startDevicePairing({ role: 'tv', displayId: WAITING_ROOM_DEVICE_ID });
  recordDevicePresence({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });

  const waitingRoom = listDevicePresence().find(
    (entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID,
  );

  assert.equal(waitingRoom?.status, 'online');
  assert.equal(waitingRoom?.streamConnected, false);
});

test('streamConnected tracks active SSE connections directly', () => {
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });

  let waitingRoom = listDevicePresence().find((entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID);
  assert.equal(waitingRoom?.streamConnected, true);
  assert.equal(waitingRoom?.status, 'online');

  markDeviceStreamDisconnected(WAITING_ROOM_DEVICE_ID);
  waitingRoom = listDevicePresence().find((entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID);
  assert.equal(waitingRoom?.streamConnected, true);

  markDeviceStreamDisconnected(WAITING_ROOM_DEVICE_ID);
  waitingRoom = listDevicePresence().find((entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID);
  assert.equal(waitingRoom?.streamConnected, false);
  assert.equal(waitingRoom?.status, 'online');
});

test('room panel stream presence uses room-panel kind without pairing semantics', () => {
  const deviceId = 'room-panel:labor:inside';

  markDeviceStreamConnected({ deviceId, kind: 'room-panel' });
  let roomPanel = listDevicePresence().find((entry) => entry.deviceId === deviceId);
  assert.equal(roomPanel?.kind, 'room-panel');
  assert.equal(roomPanel?.streamConnected, true);
  assert.equal(roomPanel?.status, 'online');

  markDeviceStreamDisconnected(deviceId);
  roomPanel = listDevicePresence().find((entry) => entry.deviceId === deviceId);
  assert.equal(roomPanel?.streamConnected, false);
  assert.equal(roomPanel?.status, 'offline');
});

test('device stream disconnect clears pending pairing and publishes none', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  const pairingEvents: Array<{ phase: string }> = [];
  subscribeOpsStream((event) => {
    if (event.type === 'device.pairing') {
      pairingEvents.push({ phase: event.payload.phase });
    }
  });

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  markDeviceStreamConnected({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
  markDeviceStreamDisconnected(TERMINAL_DEVICE_ID);

  assert.equal(pairingEvents.at(-1)?.phase, 'none');
});

test('stale stream disconnect does not clear a newer pending pairing', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  markDeviceStreamConnected({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  markDeviceStreamDisconnected(TERMINAL_DEVICE_ID);

  assert.equal(hasPendingPairingForRole('terminal'), true);
});

test('scheduled presence transition republishes when status ages to stale', () => {
  const events: Array<{ deviceId: string; status: string }> = [];
  subscribeOpsStream((event) => {
    if (event.type === 'device.presence') {
      events.push({ deviceId: event.payload.deviceId, status: event.payload.status });
    }
  });

  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  recordDevicePresence({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
  assert.equal(events.at(-1)?.status, 'online');

  mock.timers.tick(5_000);
  assert.equal(
    listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID)?.status,
    'stale',
  );
  assert.equal(events.at(-1)?.status, 'stale');
});

test('paired device with open stream stays online without heartbeat refresh', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  markDeviceStreamConnected({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
  mock.timers.tick(30_000);

  const terminal = listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID);
  assert.equal(terminal?.streamConnected, true);
  assert.equal(terminal?.status, 'online');
});

test('offline transition clears pending terminal pairing', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  const pairingEvents: Array<{ phase: string }> = [];
  subscribeOpsStream((event) => {
    if (event.type === 'device.pairing') {
      pairingEvents.push({ phase: event.payload.phase });
    }
  });

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  recordDevicePresence({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });

  mock.timers.tick(10_000);

  assert.equal(
    listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID)?.status,
    'offline',
  );
  assert.equal(pairingEvents.at(-1)?.phase, 'none');
});

test('refreshKnownDevicePresence remains a safety net', () => {
  mock.timers.enable({ apis: ['Date'] });
  mock.timers.setTime(Date.parse('2026-06-09T12:00:00.000Z'));

  startDevicePairing({ role: 'terminal', displayId: TERMINAL_DEVICE_ID });
  recordDevicePresence({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
  mock.timers.tick(6_000);
  refreshKnownDevicePresence();

  assert.equal(
    listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID)?.status,
    'stale',
  );
});
