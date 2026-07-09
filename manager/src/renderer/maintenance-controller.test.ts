import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createMaintenanceController } from './maintenance-controller.js';
import {
  SOFTWARE_UPDATE_CONFIRM_MESSAGE,
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
} from './maintenance-view-model.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: true,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/data/imports', exports: '/data/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: { running: true, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [{ id: 'preflight.app-port', ok: true, message: 'Port 8080 ist frei' }],
    deliveryImages: {
      required: false,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
    ...overrides,
  };
}

function createMockApi(overrides: Partial<PraxisManagerApi> = {}): PraxisManagerApi {
  return {
    hostPlatform: 'linux',
    fetchSetupStatus: async () => minimalStatus(),
    getComposeLogs: async () => ({ log: 'ok' }),
    runComposeAction: async () => ({
      ok: true,
      log: '',
      compose: { running: true, services: [] },
    }),
    backupEnv: async () => ({ backupPath: '/tmp/.env.backup-1' }),
    saveEnvBackup: async () => ({ saved: true, canceled: false, filePath: '/tmp/out' }),
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
    getEnvBackupInfo: async () => ({ envPath: '/tmp/pf/.env', latestBackupPath: null }),
    getRoutingMode: async () => ({
      routingMode: 'simple',
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
    ...overrides,
  } as PraxisManagerApi;
}

test('createMaintenanceController sets busy during show bootstrap', async () => {
  let resolveBackup!: () => void;
  const backupGate = new Promise<void>((resolve) => {
    resolveBackup = resolve;
  });

  const controller = createMaintenanceController({
    api: createMockApi({
      getEnvBackupInfo: async () => {
        await backupGate;
        return { envPath: '/tmp/pf/.env', latestBackupPath: null };
      },
    }),
    requestConfirm: () => {},
  });

  controller.show(minimalStatus());
  assert.equal(controller.getState().busy, true);

  resolveBackup();
  await backupGate;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().busy, false);
});

test('applyStorage validates missing folder paths', () => {
  const confirms: string[] = [];
  const controller = createMaintenanceController({
    api: createMockApi(),
    requestConfirm: (message) => confirms.push(message),
  });

  controller.show(minimalStatus());
  controller.setImportsPath('');
  controller.applyStorage();

  assert.equal(controller.getState().error, STORAGE_PATHS_VALIDATION_ERROR);
  assert.equal(confirms.length, 0);
});

test('applyStorage requests restart confirm when stack runs and paths changed', () => {
  const confirms: Array<{ message: string; run: boolean }> = [];
  const controller = createMaintenanceController({
    api: createMockApi(),
    requestConfirm: (message, onConfirm) => {
      confirms.push({ message, run: false });
      onConfirm();
    },
  });

  controller.show(minimalStatus({ compose: { running: true, services: [] } }));
  controller.setImportsPath('/other/imports');
  controller.applyStorage();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0]?.message, STORAGE_PATHS_RESTART_CONFIRM_MESSAGE);
});

test('restart and stack stop request offline confirm', () => {
  const messages: string[] = [];
  const controller = createMaintenanceController({
    api: createMockApi(),
    requestConfirm: (message) => messages.push(message),
  });

  controller.show(minimalStatus());
  controller.restart();
  controller.handleStackToggle(false);

  assert.deepEqual(messages, [STACK_OFFLINE_CONFIRM_MESSAGE, STACK_OFFLINE_CONFIRM_MESSAGE]);
});

test('importSoftware requests confirm when stack is running', () => {
  const messages: string[] = [];
  const controller = createMaintenanceController({
    api: createMockApi(),
    requestConfirm: (message) => messages.push(message),
  });

  controller.show(minimalStatus({ compose: { running: true, services: [] } }));
  controller.importSoftware();

  assert.deepEqual(messages, [SOFTWARE_UPDATE_CONFIRM_MESSAGE]);
});

test('requestLogsRefresh sets error when log fetch fails', async () => {
  const controller = createMaintenanceController({
    api: createMockApi({
      getComposeLogs: async () => {
        throw new Error('compose down');
      },
    }),
    requestConfirm: () => {},
  });

  controller.show(minimalStatus());
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

  const controller = createMaintenanceController({
    api: createMockApi({
      getEnvBackupInfo: async () => {
        await backupGate;
        return { envPath: '/tmp/pf/.env', latestBackupPath: null };
      },
    }),
    requestConfirm: () => {},
  });

  controller.show(
    minimalStatus({
      folders: { imports: '/data/imports', exports: '/data/exports' },
    }),
  );
  controller.setImportsPath('/draft/imports');

  controller.applyConfigSnapshot(
    minimalStatus({
      folders: { imports: '/server/imports', exports: '/server/exports' },
    }),
  );
  assert.equal(controller.getState().importsHostPath, '/draft/imports');

  resolveBackup();
  await backupGate;
  await new Promise((resolve) => setTimeout(resolve, 0));

  controller.applyConfigSnapshot(
    minimalStatus({
      folders: { imports: '/server/imports', exports: '/server/exports' },
    }),
  );
  assert.equal(controller.getState().importsHostPath, '/server/imports');
});
