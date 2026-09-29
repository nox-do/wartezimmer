import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMaintenanceApiInfo } from './maintenance-api.js';

test('parseMaintenanceApiInfo accepts a structurally valid handshake', () => {
  assert.deepEqual(
    parseMaintenanceApiInfo({
      protocolVersion: 2,
      stackVersion: null,
      snapshotExportFormatVersion: 1,
      snapshotImportFormatVersions: [1, 2],
    }),
    {
      protocolVersion: 2,
      stackVersion: null,
      snapshotExportFormatVersion: 1,
      snapshotImportFormatVersions: [1, 2],
    },
  );
});

test('parseMaintenanceApiInfo rejects malformed version fields', () => {
  assert.equal(
    parseMaintenanceApiInfo({
      protocolVersion: 1,
      stackVersion: null,
      snapshotExportFormatVersion: 1,
      snapshotImportFormatVersions: ['1'],
    }),
    null,
  );
});
