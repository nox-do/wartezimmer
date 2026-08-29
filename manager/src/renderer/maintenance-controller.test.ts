import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createMaintenanceController } from './maintenance-controller.js';
import {
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
} from './maintenance-view-model.js';

function createMockApi(overrides: Partial<PraxisManagerApi> = {}): PraxisManagerApi {
  return {
    hostPlatform: 'linux',
    fetchSetupStatus: async () => minimalHostStatus(),
    getComposeLogs: async () => ({ ok: true, log: 'ok' }),
    runComposeAction: async () => ({
      ok: true,
      log: '',
      compose: { running: true, services: [] },
    }),
    createPfbackup: async () => ({
      envPath: '/tmp/pf/.env',
      backupPath: '/tmp/backups/praxis-flow-backup-2026-06-25T10-00-00-000Z.pfbackup',
    }),
    savePfbackup: async () => ({ saved: true, canceled: false, filePath: '/tmp/out.pfbackup' }),
    saveTlsSidecar: async () => ({ saved: true, canceled: false, filePath: '/tmp/out.tgz' }),
    readPfbackupForValidate: async () => ({
      canceled: false,
      content: '{}',
      filePath: '/tmp/sample.pfbackup',
      tlsSidecarBase64: null,
    }),
    readTlsSidecar: async () => ({ canceled: true as const }),
    inspectPfbackupFile: async () => ({
      ok: true,
      backup: {
        createdAt: '2026-07-12T12:00:00.000Z',
        settingsFormatVersion: 1,
        releaseVersion: null,
        routingMode: 'simple',
        portalEnabled: false,
        providerCredentialsIncluded: false,
      },
      compatibility: {
        archiveValid: true,
        settingsValid: true,
        targetAppReachable: true,
        restoreSupported: true,
        warnings: [],
      },
    }),
    validatePfbackup: async () => ({
      archiveValid: true,
      restoreValid: true,
      archiveErrors: [],
      restoreErrors: [],
      summary: {
        createdAt: '2026-07-12T12:00:00.000Z',
        settingsFormatVersion: 1,
        exportedAt: '2026-07-12T12:00:00.000Z',
        releaseVersion: null,
        routingMode: 'simple',
      },
    }),
    inspectPfbackup: async () => ({
      ok: true,
      backup: {
        createdAt: '2026-07-12T12:00:00.000Z',
        settingsFormatVersion: 1,
        releaseVersion: null,
        routingMode: 'simple',
        portalEnabled: false,
        providerCredentialsIncluded: false,
      },
      compatibility: {
        archiveValid: true,
        settingsValid: true,
        targetAppReachable: true,
        restoreSupported: true,
        warnings: [],
      },
    }),
    restorePfbackup: async () => ({
      ok: true,
      restoreId: 'restore-1',
      report: {
        restoreId: 'restore-1',
        routingMode: 'simple',
        portalEnabled: false,
        providerCredentialsSkipped: false,
        disabledProviderIds: [],
        compose: { running: true, services: [] },
      },
    }),
    saveStorageFolders: async () => ({
      envPath: '/tmp/pf/.env',
      backupPath: null,
      folders: { imports: '/data/imports', exports: '/data/exports' },
      created: [],
      composeRestarted: false,
      stackWasRunning: false,
      compose: { running: true, services: [] },
      restartLog: null,
    }),
    getPfbackupInfo: async () => ({ envPath: '/tmp/pf/.env', latestBackupPath: null }),
    getRoutingMode: async () => ({
      routingMode: 'simple',
      openVisitCount: 0,
      features: {
        complexRouting: false,
        journeyDesigner: false,
        routingSimulator: false,
        complexRoutingLicensed: true,
      },
    }),
    setRoutingMode: async () => ({
      ok: true as const,
      routingMode: 'simple' as const,
      features: {
        complexRouting: false,
        journeyDesigner: false,
        routingSimulator: false,
        complexRoutingLicensed: true,
      },
    }),
    resetStaffPins: async () => ({
      ok: true,
      log: '',
      defaultPin: '0000',
      databaseUpdated: true,
      compose: { running: true, services: [] },
    }),
    selectFolder: async () => ({ canceled: true, path: null }),
    selectPfupdateArchive: async () => ({
      canceled: false,
      path: '/tmp/update.pfupdate',
    }),
    applyPfupdate: async () => ({
      ok: true as const,
      updateId: 'update-1',
      report: {
        previousVersion: '2026.07.1',
        targetVersion: '2026.08.0',
        backupPath: '/tmp/backups/pre.pfbackup',
        compose: { running: true, services: [] },
      },
    }),
    ...overrides,
  } as PraxisManagerApi;
}

function createControllerDeps(
  api: PraxisManagerApi,
  overrides: {
    requestConfirm?: (message: string, onConfirm: () => void) => void;
  } = {},
) {
  return {
    api,
    requestConfirm: overrides.requestConfirm ?? (() => {}),
  };
}

test('createMaintenanceController sets busy during show bootstrap', async () => {
  let resolveBackup!: () => void;
  const backupGate = new Promise<void>((resolve) => {
    resolveBackup = resolve;
  });

  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getPfbackupInfo: async () => {
          await backupGate;
          return { envPath: '/tmp/pf/.env', latestBackupPath: null };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  assert.equal(controller.getState().busy, true);

  resolveBackup();
  await backupGate;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().busy, false);
});

test('applyStorage validates missing folder paths', () => {
  const confirms: string[] = [];
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (message) => confirms.push(message),
    }),
  );

  controller.show(minimalHostStatus());
  controller.setImportsPath('');
  controller.applyStorage();

  assert.equal(controller.getState().error, STORAGE_PATHS_VALIDATION_ERROR);
  assert.equal(confirms.length, 0);
});

test('applyStorage requests restart confirm when stack runs and paths changed', () => {
  const confirms: Array<{ message: string; run: boolean }> = [];
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (message, onConfirm) => {
        confirms.push({ message, run: false });
        onConfirm();
      },
    }),
  );

  controller.show(minimalHostStatus({ compose: { running: true, services: [] } }));
  controller.setImportsPath('/other/imports');
  controller.applyStorage();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0]?.message, STORAGE_PATHS_RESTART_CONFIRM_MESSAGE);
});

test('restart and stack stop request offline confirm', () => {
  const messages: string[] = [];
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (message) => messages.push(message),
    }),
  );

  controller.show(minimalHostStatus());
  controller.restart();
  controller.handleStackToggle(false);

  assert.deepEqual(messages, [STACK_OFFLINE_CONFIRM_MESSAGE, STACK_OFFLINE_CONFIRM_MESSAGE]);
});

test('recordPfupdateSuccess updates software update status text', async () => {
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => ({ ok: true, log: 'updated' }),
      }),
    ),
  );

  controller.show(minimalHostStatus({ compose: { running: true, services: [] } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.recordPfupdateSuccess({
    ok: true,
    updateId: 'update-1',
    report: {
      previousVersion: '2026.07.1',
      targetVersion: '2026.08.0',
      backupPath: '/tmp/backups/pre.pfbackup',
      compose: { running: true, services: [] },
    },
  });

  assert.match(controller.getState().softwareUpdateStatusText ?? '', /2026\.08\.0/);
  assert.equal(controller.getState().latestBackupPath, '/tmp/backups/pre.pfbackup');
});

test('requestLogsRefresh sets error when log fetch fails', async () => {
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          throw new Error('compose down');
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  controller.requestLogsRefresh('app');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().error, 'compose down');
  assert.equal(controller.getState().busy, false);
});

test('applyConfigSnapshot updates draft paths only when not busy', async () => {
  let resolveBackup!: () => void;
  const backupGate = new Promise<void>((resolve) => {
    resolveBackup = resolve;
  });

  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getPfbackupInfo: async () => {
          await backupGate;
          return { envPath: '/tmp/pf/.env', latestBackupPath: null };
        },
      }),
    ),
  );

  controller.show(
    minimalHostStatus({
      folders: { imports: '/data/imports', exports: '/data/exports' },
    }),
  );
  controller.setImportsPath('/draft/imports');

  controller.applyConfigSnapshot(
    minimalHostStatus({
      folders: { imports: '/server/imports', exports: '/server/exports' },
    }),
  );
  assert.equal(controller.getState().importsHostPath, '/draft/imports');

  resolveBackup();
  await backupGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  controller.applyConfigSnapshot(
    minimalHostStatus({
      folders: { imports: '/server/imports', exports: '/server/exports' },
    }),
  );
  assert.equal(controller.getState().importsHostPath, '/server/imports');
});
