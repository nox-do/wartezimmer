import assert from 'node:assert/strict';
import test from 'node:test';
import type { PfbackupInspectResult, PfbackupRestoreResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createRestoreWizardController } from './restore-wizard-controller.js';

function inspectOk(overrides: Partial<PfbackupInspectResult> = {}): PfbackupInspectResult {
  return {
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
    ...overrides,
  };
}

function createMockApi(overrides: Partial<PraxisManagerApi> = {}): PraxisManagerApi {
  return {
    hostPlatform: 'linux',
    fetchSetupStatus: async () => {
      throw new Error('not used');
    },
    getComposeLogs: async () => ({ log: '' }),
    runComposeAction: async () => ({
      ok: true,
      log: '',
      compose: { running: true, services: [] },
    }),
    createPfbackup: async () => ({ envPath: '/tmp/.env', backupPath: '/tmp/x.pfbackup' }),
    savePfbackup: async () => ({ saved: true, canceled: false, filePath: '/tmp/x.pfbackup' }),
    readPfbackupForValidate: async () => ({
      canceled: false,
      content: 'backup-content',
      filePath: '/tmp/sample.pfbackup',
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
    inspectPfbackup: async () => inspectOk(),
    restorePfbackup: async () =>
      ({
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
      }) satisfies PfbackupRestoreResult,
    saveStorageFolders: async () => {
      throw new Error('not used');
    },
    getPfbackupInfo: async () => ({ envPath: '/tmp/.env', latestBackupPath: null }),
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
    ...overrides,
  } as PraxisManagerApi;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('openPreUpdate starts on choose phase and skip continues update', async () => {
  let completed = false;
  const controller = createRestoreWizardController({
    api: createMockApi(),
  });

  controller.openPreUpdate(() => {
    completed = true;
  });
  assert.equal(controller.getState().phase, 'choose');
  assert.equal(controller.getState().mode, 'pre-update');

  controller.chooseRestore(false);
  assert.equal(controller.getState().phase, 'closed');
  assert.equal(completed, true);
});

test('pre-update restore success closes wizard and continues update', async () => {
  let completed = false;
  const controller = createRestoreWizardController({
    api: createMockApi(),
  });

  controller.openPreUpdate(() => {
    completed = true;
  });
  controller.chooseRestore(true);
  await flushMicrotasks();
  assert.equal(controller.getState().phase, 'preview');

  controller.confirmRestore();
  await flushMicrotasks();
  assert.equal(controller.getState().phase, 'success');

  controller.close();
  assert.equal(controller.getState().phase, 'closed');
  assert.equal(completed, true);
});

test('restore failure in pre-update can be skipped to continue update', async () => {
  let completed = false;
  const controller = createRestoreWizardController({
    api: createMockApi({
      restorePfbackup: async () => ({
        ok: false,
        restoreId: 'restore-1',
        failedPhase: 'import',
        rollbackAttempted: true,
        rollbackSucceeded: true,
        errors: ['Import fehlgeschlagen'],
      }),
    }),
  });

  controller.openPreUpdate(() => {
    completed = true;
  });
  controller.chooseRestore(true);
  await flushMicrotasks();
  controller.confirmRestore();
  await flushMicrotasks();

  assert.equal(controller.getState().phase, 'failed');
  controller.skipAfterFailure();
  assert.equal(controller.getState().phase, 'closed');
  assert.equal(completed, true);
});

test('failed rollback blocks skip and retry in pre-update', async () => {
  let completed = false;
  let restoreCalls = 0;
  const controller = createRestoreWizardController({
    api: createMockApi({
      restorePfbackup: async () => {
        restoreCalls += 1;
        return {
          ok: false,
          restoreId: 'restore-1',
          failedPhase: 'import',
          rollbackAttempted: true,
          rollbackSucceeded: false,
          errors: ['Import fehlgeschlagen'],
        };
      },
    }),
  });

  controller.openPreUpdate(() => {
    completed = true;
  });
  controller.chooseRestore(true);
  await flushMicrotasks();
  controller.confirmRestore();
  await flushMicrotasks();

  assert.equal(controller.getState().phase, 'failed');
  controller.skipAfterFailure();
  controller.retryRestore();
  await flushMicrotasks();
  assert.equal(completed, false);
  assert.equal(restoreCalls, 1);
  assert.equal(controller.getState().phase, 'failed');
});

test('pre-update file dialog cancel returns to choose without continuing update', async () => {
  let completed = false;
  const controller = createRestoreWizardController({
    api: createMockApi({
      readPfbackupForValidate: async () => ({ canceled: true }),
    }),
  });

  controller.openPreUpdate(() => {
    completed = true;
  });
  controller.chooseRestore(true);
  await flushMicrotasks();

  assert.equal(controller.getState().phase, 'choose');
  assert.equal(completed, false);
});

test('retry restore reuses backup content without file picker', async () => {
  let readCalls = 0;
  let restoreCalls = 0;
  const controller = createRestoreWizardController({
    api: createMockApi({
      readPfbackupForValidate: async () => {
        readCalls += 1;
        return {
          canceled: false,
          content: 'backup-content',
          filePath: '/tmp/sample.pfbackup',
        };
      },
      restorePfbackup: async () => {
        restoreCalls += 1;
        if (restoreCalls === 1) {
          return {
            ok: false,
            restoreId: 'restore-1',
            failedPhase: 'health',
            rollbackAttempted: false,
            rollbackSucceeded: false,
            errors: ['Health check failed'],
          };
        }
        return {
          ok: true,
          restoreId: 'restore-2',
          report: {
            restoreId: 'restore-2',
            routingMode: 'simple',
            portalEnabled: false,
            providerCredentialsSkipped: false,
            disabledProviderIds: [],
            compose: { running: true, services: [] },
          },
        };
      },
    }),
  });

  controller.openStandalone();
  await flushMicrotasks();
  assert.equal(readCalls, 1);

  controller.confirmRestore();
  await flushMicrotasks();
  assert.equal(controller.getState().phase, 'failed');

  controller.retryRestore();
  await flushMicrotasks();
  assert.equal(readCalls, 1);
  assert.equal(restoreCalls, 2);
  assert.equal(controller.getState().phase, 'success');
});

test('credential import failure preselects skip for retry', async () => {
  let restoreOptions: { skipProviderCredentials?: boolean } | undefined;
  const controller = createRestoreWizardController({
    api: createMockApi({
      inspectPfbackup: async () =>
        inspectOk({
          backup: {
            createdAt: '2026-07-12T12:00:00.000Z',
            settingsFormatVersion: 1,
            releaseVersion: null,
            routingMode: 'simple',
            portalEnabled: false,
            providerCredentialsIncluded: true,
          },
        }),
      restorePfbackup: async (_content, options) => {
        restoreOptions = options;
        return {
          ok: false,
          restoreId: 'restore-1',
          failedPhase: 'import_snapshot',
          rollbackAttempted: true,
          rollbackSucceeded: true,
          errors: ['Provider-Credentials konnten nicht entschlüsselt werden.'],
        };
      },
    }),
  });

  controller.openPreUpdate(() => {});
  controller.chooseRestore(true);
  await flushMicrotasks();
  controller.confirmRestore();
  await flushMicrotasks();

  assert.equal(controller.getState().phase, 'failed');
  assert.equal(controller.getState().skipProviderCredentials, true);
  assert.equal(restoreOptions?.skipProviderCredentials, false);

  controller.retryRestore();
  await flushMicrotasks();
  assert.equal(restoreOptions?.skipProviderCredentials, true);
});
