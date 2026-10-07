import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import { createMaintenanceController } from './maintenance-controller.js';
import {
  STACK_OFFLINE_CONFIRM_MESSAGE,
  STORAGE_PATHS_RESTART_CONFIRM_MESSAGE,
  STORAGE_PATHS_VALIDATION_ERROR,
} from './maintenance-view-model.js';

function createMockApi(overrides: Partial<WartezimmerManagerApi> = {}): WartezimmerManagerApi {
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
    selectPfbackupForRestore: async () => ({
      canceled: false,
      content: '{}',
      filePath: '/tmp/sample.pfbackup',
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
  } as WartezimmerManagerApi;
}

function createControllerDeps(
  api: WartezimmerManagerApi,
  overrides: {
    requestConfirm?: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
    onAfterMutation?: () => void;
  } = {},
) {
  return {
    api,
    requestConfirm: overrides.requestConfirm ?? (() => {}),
    onAfterMutation: overrides.onAfterMutation,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  assert.equal(controller.getState().activeOperation, 'bootstrap');

  resolveBackup();
  await backupGate;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().activeOperation, null);
});

test('applyStorage validates missing folder paths', async () => {
  const confirms: string[] = [];
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (message) => confirms.push(message),
    }),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.setImportsPath('');
  controller.applyStorage();

  assert.equal(controller.getState().errors.storage, STORAGE_PATHS_VALIDATION_ERROR);
  assert.equal(confirms.length, 0);
});

test('applyStorage requests restart confirm when stack runs and paths changed', async () => {
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
  await flush();
  controller.setImportsPath('/other/imports');
  controller.applyStorage();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0]?.message, STORAGE_PATHS_RESTART_CONFIRM_MESSAGE);
});

test('restart and stack stop request offline confirm', async () => {
  const messages: string[] = [];
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (message) => messages.push(message),
    }),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.restart();
  controller.handleStackToggle(false);

  assert.equal(messages.length, 1);
  assert.equal(messages[0], STACK_OFFLINE_CONFIRM_MESSAGE);
  assert.equal(controller.getState().activeOperation, 'stack');
});

test('pending stack confirm blocks other maintenance actions', async () => {
  const controller = createMaintenanceController(createControllerDeps(createMockApi()));
  controller.show(minimalHostStatus());
  await flush();
  controller.restart();
  assert.equal(controller.getState().activeOperation, 'stack');

  controller.requestLogsRefresh('sandbox');
  await flush();
  assert.equal(controller.getState().logsService, 'app');
  assert.equal(controller.getState().errors.logs, null);
  assert.equal(controller.getState().activeOperation, 'stack');
});

test('cancelling stack confirm unlocks the tab', async () => {
  let onCancel: (() => void) | undefined;
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      requestConfirm: (_message, _onConfirm, cancel) => {
        onCancel = cancel;
      },
    }),
  );
  controller.show(minimalHostStatus());
  await flush();
  controller.restart();
  assert.equal(controller.getState().activeOperation, 'stack');
  onCancel?.();
  assert.equal(controller.getState().activeOperation, null);

  controller.handleStackToggle(false);
  assert.equal(controller.getState().activeOperation, 'stack');
});

test('policy rejection after stack confirmation unlocks the tab', async () => {
  let confirm: (() => void) | undefined;
  let composeCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        runComposeAction: async () => {
          composeCalls += 1;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
      }),
      {
        requestConfirm: (_message, onConfirm) => {
          confirm = onConfirm;
        },
      },
    ),
  );
  controller.show(
    minimalHostStatus({
      lifecycle: {
        assessment: 'inconsistent',
        mode: null,
        preparation: 'none',
        operation: 'none',
        issues: [{ code: 'test', message: 'widersprüchlich' }],
        recovery: 'none',
      },
    }),
  );
  await flush();
  controller.restart();
  assert.equal(controller.getState().activeOperation, 'stack');
  confirm?.();
  await flush();
  assert.equal(composeCalls, 0);
  assert.equal(controller.getState().activeOperation, null);
  assert.match(controller.getState().errors.stack ?? '', /widersprüchliche Konfiguration/);
});

test('hide clears a pending confirm lock', async () => {
  const controller = createMaintenanceController(createControllerDeps(createMockApi()));
  controller.show(minimalHostStatus());
  await flush();
  controller.restart();
  assert.equal(controller.getState().activeOperation, 'stack');
  controller.hide();
  assert.equal(controller.getState().activeOperation, null);
});

test('a pending confirm cannot start its action after hide', async () => {
  let onConfirm: (() => void) | undefined;
  let composeCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        runComposeAction: async () => {
          composeCalls += 1;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
      }),
      {
        requestConfirm: (_message, confirm) => {
          onConfirm = confirm;
        },
      },
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.restart();
  controller.hide();
  onConfirm?.();
  await flush();

  assert.equal(composeCalls, 0);
  assert.equal(controller.getState().activeOperation, null);
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
  await flush();
  controller.requestLogsRefresh('app');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().errors.logs, 'compose down');
  assert.equal(controller.getState().activeOperation, null);
});

test('applyConfigSnapshot preserves a dirty storage draft across config refreshes', async () => {
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
  assert.equal(controller.getState().importsHostPath, '/draft/imports');
});

test('applyConfigSnapshot hydrates storage paths while the draft is clean', async () => {
  const controller = createMaintenanceController(createControllerDeps(createMockApi()));
  controller.show(
    minimalHostStatus({
      folders: { imports: '/data/imports', exports: '/data/exports' },
    }),
  );
  await flush();

  controller.applyConfigSnapshot(
    minimalHostStatus({
      folders: { imports: '/server/imports', exports: '/server/exports' },
    }),
  );

  assert.equal(controller.getState().importsHostPath, '/server/imports');
  assert.equal(controller.getState().exportsHostPath, '/server/exports');
});

test('second show discards first bootstrap including logs', async () => {
  const firstLogs = deferred<void>();
  const secondLogs = deferred<void>();
  let logCalls = 0;

  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          logCalls += 1;
          if (logCalls === 1) {
            await firstLogs.promise;
            return { ok: true, log: 'stale-logs' };
          }
          await secondLogs.promise;
          return { ok: true, log: 'fresh-logs' };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  controller.show(minimalHostStatus());
  firstLogs.resolve();
  await flush();
  assert.notEqual(controller.getState().logsText, 'stale-logs');

  secondLogs.resolve();
  await flush();
  assert.equal(controller.getState().logsText, 'fresh-logs');
});

test('bootstrap applies other results when one request fails', async () => {
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          throw new Error('logs down');
        },
        getPfbackupInfo: async () => ({
          envPath: '/tmp/pf/.env',
          latestBackupPath: '/tmp/latest.pfbackup',
        }),
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();

  assert.equal(controller.getState().errors.logs, 'logs down');
  assert.equal(controller.getState().latestBackupPath, '/tmp/latest.pfbackup');
  assert.equal(controller.getState().activeOperation, null);
});

test('bootstrap busy stays true until both requests settle', async () => {
  const backupGate = deferred<void>();
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getPfbackupInfo: async () => {
          await backupGate.promise;
          return { envPath: '/tmp/pf/.env', latestBackupPath: '/tmp/latest.pfbackup' };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  assert.equal(controller.getState().activeOperation, 'bootstrap');
  assert.equal(controller.getState().latestBackupPath, null);

  backupGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, null);
  assert.equal(controller.getState().latestBackupPath, '/tmp/latest.pfbackup');
});

test('hide during bootstrap drops late results', async () => {
  const backupGate = deferred<void>();
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getPfbackupInfo: async () => {
          await backupGate.promise;
          return { envPath: '/tmp/pf/.env', latestBackupPath: '/tmp/stale.pfbackup' };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  controller.hide();
  backupGate.resolve();
  await flush();

  assert.equal(controller.getState().latestBackupPath, null);
});

test('stale action finally does not clear busy after a new show', async () => {
  const actionGate = deferred<void>();
  const backupGate = deferred<void>();
  let composeCalls = 0;
  let backupCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        runComposeAction: async () => {
          composeCalls += 1;
          await actionGate.promise;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
        getPfbackupInfo: async () => {
          backupCalls += 1;
          if (backupCalls > 1) {
            await backupGate.promise;
          }
          return { envPath: '/tmp/pf/.env', latestBackupPath: null };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.handleStackToggle(true);
  controller.show(minimalHostStatus());
  actionGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, 'bootstrap');
  assert.equal(composeCalls, 1);

  backupGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, null);
});

test('successful mutation still refreshes host after hide', async () => {
  const actionGate = deferred<void>();
  let refreshCount = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        runComposeAction: async () => {
          await actionGate.promise;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
      }),
      {
        onAfterMutation: () => {
          refreshCount += 1;
        },
      },
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.handleStackToggle(true);
  controller.hide();
  actionGate.resolve();
  await flush();

  assert.equal(refreshCount, 1);
});

test('host action stays locked across hide and show until its promise settles', async () => {
  const actionGate = deferred<void>();
  let composeCalls = 0;
  let backupCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        runComposeAction: async () => {
          composeCalls += 1;
          await actionGate.promise;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
        createPfbackup: async () => {
          backupCalls += 1;
          return {
            envPath: '/tmp/pf/.env',
            backupPath: '/tmp/backups/blocked.pfbackup',
          };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.handleStackToggle(true);
  controller.hide();
  controller.show(minimalHostStatus());
  await flush();

  assert.equal(controller.getState().activeOperation, 'stack');
  controller.backupPf();
  assert.equal(backupCalls, 0);
  assert.equal(composeCalls, 1);

  actionGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, null);
});

test('cancelPinReset does not unlock an executing pin reset', async () => {
  const actionGate = deferred<void>();
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        resetStaffPins: async () => {
          await actionGate.promise;
          return {
            ok: true,
            log: '',
            defaultPin: '0000',
            databaseUpdated: true,
            compose: { running: true, services: [] },
          };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  assert.equal(controller.beginPinReset(), true);
  controller.executePinReset();
  controller.cancelPinReset();
  assert.equal(controller.getState().activeOperation, 'pin');

  actionGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, null);
});

test('pin reset stays locked across hide and show until its promise settles', async () => {
  const actionGate = deferred<void>();
  let pinCalls = 0;
  let backupCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        resetStaffPins: async () => {
          pinCalls += 1;
          await actionGate.promise;
          return {
            ok: true,
            log: '',
            defaultPin: '0000',
            databaseUpdated: true,
            compose: { running: true, services: [] },
          };
        },
        createPfbackup: async () => {
          backupCalls += 1;
          return {
            envPath: '/tmp/pf/.env',
            backupPath: '/tmp/backups/blocked.pfbackup',
          };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  assert.equal(controller.beginPinReset(), true);
  controller.executePinReset();
  controller.hide();
  controller.show(minimalHostStatus());
  await flush();

  assert.equal(controller.getState().activeOperation, 'pin');
  controller.backupPf();
  assert.equal(backupCalls, 0);
  assert.equal(pinCalls, 1);

  actionGate.resolve();
  await flush();
  assert.equal(controller.getState().activeOperation, null);
});

test('recordPfupdateSuccess does not trigger host refresh', async () => {
  let refreshCount = 0;
  const controller = createMaintenanceController(
    createControllerDeps(createMockApi(), {
      onAfterMutation: () => {
        refreshCount += 1;
      },
    }),
  );

  controller.show(minimalHostStatus({ compose: { running: true, services: [] } }));
  await flush();
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
  await flush();

  assert.equal(refreshCount, 0);
});

test('stack success refreshes host even when logs fail', async () => {
  let refreshCount = 0;
  let composeCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          if (composeCalls > 0) {
            throw new Error('logs down');
          }
          return { ok: true, log: 'ok' };
        },
        runComposeAction: async () => {
          composeCalls += 1;
          return { ok: true, log: '', compose: { running: true, services: [] } };
        },
      }),
      {
        onAfterMutation: () => {
          refreshCount += 1;
        },
      },
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.handleStackToggle(true);
  await flush();

  assert.equal(refreshCount, 1);
  assert.equal(controller.getState().errors.stack, 'logs down');
});

test('requestLogsRefresh clears an existing error on retry start', async () => {
  let failLogs = true;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          if (failLogs) {
            throw new Error('compose down');
          }
          return { ok: true, log: 'recovered' };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  controller.requestLogsRefresh('app');
  await flush();
  assert.equal(controller.getState().errors.logs, 'compose down');

  failLogs = false;
  controller.requestLogsRefresh('app');
  assert.equal(controller.getState().errors.logs, null);
  await flush();
  assert.equal(controller.getState().errors.logs, null);
  assert.equal(controller.getState().logsText, 'recovered');
});

test('browse folder rejection is caught', async () => {
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        selectFolder: async () => {
          throw new Error('dialog down');
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  const path = await controller.browseImportsFolder();

  assert.equal(path, null);
  assert.equal(controller.getState().errors.storage, 'dialog down');
});

test('pin reset log failure does not reject', async () => {
  let pinDone = false;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          if (pinDone) {
            throw new Error('logs down');
          }
          return { ok: true, log: 'ok' };
        },
        resetStaffPins: async () => {
          pinDone = true;
          return {
            ok: true,
            log: '',
            defaultPin: '0000',
            databaseUpdated: true,
            compose: { running: true, services: [] },
          };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  await flush();
  assert.equal(controller.beginPinReset(), true);
  controller.executePinReset();
  await flush();

  assert.equal(controller.getState().errors.pin, 'logs down');
  assert.match(controller.getState().pinResetStatusText, /0000/);
});

test('logs refresh does not run during bootstrap', async () => {
  const backupGate = deferred<void>();
  let logCalls = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        getComposeLogs: async () => {
          logCalls += 1;
          return { ok: true, log: 'ok' };
        },
        getPfbackupInfo: async () => {
          await backupGate.promise;
          return { envPath: '/tmp/pf/.env', latestBackupPath: null };
        },
      }),
    ),
  );

  controller.show(minimalHostStatus());
  controller.requestLogsRefresh('sandbox');
  assert.equal(controller.getState().logsService, 'app');
  assert.equal(logCalls, 1);

  backupGate.resolve();
  await flush();
  controller.requestLogsRefresh('sandbox');
  await flush();
  assert.equal(controller.getState().logsService, 'sandbox');
  assert.equal(controller.getState().activeOperation, null);
});

test('path setter notifies once', () => {
  let calls = 0;
  const controller = createMaintenanceController({
    ...createControllerDeps(createMockApi()),
    onStateChange: () => {
      calls += 1;
    },
  });
  controller.setImportsPath('/draft');
  assert.equal(calls, 1);
  assert.equal(controller.getState().importsHostPath, '/draft');
});

test('rebuild is confirmed, serialized and displays the stopped-stack result', async () => {
  let confirm: (() => void) | undefined;
  let calls = 0;
  let refreshed = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        rebuildHost: async () => {
          calls += 1;
          return {
            ok: true,
            compose: { running: false, services: [] },
            log: 'Konfiguration wiederhergestellt; Laufzeit noch nicht geprüft.',
          };
        },
      }),
      {
        requestConfirm: (_message, callback) => {
          confirm = callback;
        },
        onAfterMutation: () => {
          refreshed += 1;
        },
      },
    ),
  );
  controller.rebuild();
  assert.equal(calls, 0);
  assert.ok(confirm);
  confirm();
  await flush();
  assert.equal(calls, 1);
  assert.equal(refreshed, 1);
  assert.match(controller.getState().rebuildStatusText, /Laufzeit noch nicht geprüft/);
  assert.equal(controller.getState().activeOperation, null);
});

test('rebuild errors remain visible and refresh the resulting stopped runtime', async () => {
  let refreshed = 0;
  const controller = createMaintenanceController(
    createControllerDeps(
      createMockApi({
        rebuildHost: async () => {
          throw new Error('Lokales Image fehlt');
        },
      }),
      {
        requestConfirm: (_message, confirm) => confirm(),
        onAfterMutation: () => {
          refreshed += 1;
        },
      },
    ),
  );
  controller.rebuild();
  await flush();
  assert.equal(refreshed, 1);
  assert.match(controller.getState().errors.stack!, /Lokales Image fehlt/);
  assert.equal(controller.getState().rebuildStatusText, '');
});
