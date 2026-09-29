import assert from 'node:assert/strict';
import test from 'node:test';
import { MaintenanceClientError } from './maintenance-client.js';
import {
  inspectMaintenanceCompatibility,
  waitForCompatibleMaintenanceApp,
} from './settings-format-version.js';

test('maintenance handshake accepts the current protocol and settings format', async () => {
  const result = await inspectMaintenanceCompatibility('http://unused', async () => ({
    protocolVersion: 1,
    stackVersion: '2.1.0',
    snapshotExportFormatVersion: 1,
    snapshotImportFormatVersions: [1],
  }));

  assert.deepEqual(result, {
    authenticated: true,
    compatible: true,
    status: 'compatible',
    settingsFormatVersion: 1,
    stackVersion: '2.1.0',
  });
});

test('maintenance handshake rejects unknown settings formats without calling them auth failures', async () => {
  const result = await inspectMaintenanceCompatibility('http://unused', async () => ({
    protocolVersion: 1,
    stackVersion: '999.0.0',
    snapshotExportFormatVersion: 999,
    snapshotImportFormatVersions: [999],
  }));

  assert.equal(result.authenticated, true);
  assert.equal(result.compatible, false);
  assert.equal(result.status, 'incompatible');
  assert.equal(result.settingsFormatVersion, 999);
});

test('maintenance handshake preserves authentication and transport failure categories', async () => {
  const unauthorized = await inspectMaintenanceCompatibility('http://unused', async () => {
    throw new MaintenanceClientError('unauthorized', 'no', 401);
  });
  const unreachable = await inspectMaintenanceCompatibility('http://unused', async () => {
    throw new MaintenanceClientError('unreachable', 'offline');
  });

  assert.deepEqual(
    { status: unauthorized.status, version: unauthorized.settingsFormatVersion },
    { status: 'unauthorized', version: null },
  );
  assert.deepEqual(
    { status: unreachable.status, version: unreachable.settingsFormatVersion },
    { status: 'unreachable', version: null },
  );
});

test('an authenticated app without the handshake is reported as incompatible', async () => {
  const result = await inspectMaintenanceCompatibility('http://unused', async () => {
    throw new MaintenanceClientError('http-error', 'missing', 404);
  });

  assert.equal(result.authenticated, true);
  assert.equal(result.compatible, false);
  assert.equal(result.status, 'incompatible');
  assert.equal(result.settingsFormatVersion, null);
});

test('cutover waits for startup but rejects unsupported protocols and formats before import', async () => {
  const current = {
    protocolVersion: 1,
    stackVersion: null,
    snapshotExportFormatVersion: 1,
    snapshotImportFormatVersions: [1],
  };
  for (const info of [
    { ...current, protocolVersion: 999 },
    { ...current, snapshotExportFormatVersion: 999 },
    { ...current, snapshotImportFormatVersions: [999] },
  ]) {
    let calls = 0;
    await assert.rejects(
      waitForCompatibleMaintenanceApp('http://unused', 1000, 0, async (url) => {
        calls++;
        return inspectMaintenanceCompatibility(url, async () => info);
      }),
      /App-Version passt nicht/,
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  assert.equal(
    await waitForCompatibleMaintenanceApp('http://unused', 1000, 0, async (url) => {
      calls++;
      return inspectMaintenanceCompatibility(url, async () => {
        if (calls === 1) throw new MaintenanceClientError('unreachable', 'starting');
        return current;
      });
    }),
    true,
  );
  assert.equal(calls, 2);
});
