import assert from 'node:assert/strict';
import test from 'node:test';
import type { InstallOperationSummary, InstallRecoveryPreview } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createWizardController } from './wizard-controller.js';
import { createWizardFlowState, planWizardAdvance, planWizardBack } from './wizard-flow.js';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const operation: InstallOperationSummary = {
  id: 'test-operation',
  mode: 'replace',
  phase: 'prepared',
  createdAt: '2026-09-21',
  releaseVersion: '2',
  backupContainsTls: true,
};
const preview = (baselineReady: boolean): InstallRecoveryPreview => ({
  operation: { ...operation, phase: 'installing' },
  baselineReady,
  baselineErrors: baselineReady ? [] : ['Sandbox startet noch.'],
  backup: null,
  restoreCompatible: baselineReady,
});

test('reinstall prepares without mutation and only commits after explicit confirmation', async () => {
  let commits = 0;
  let confirm: (() => void) | undefined;
  let status = minimalHostStatus({ installation: { kind: 'needs-reinstall', reasons: [] } });
  const api = {
    fetchSetupStatus: async () => status,
    discoverRecoveryBackups: async () => [
      { id: 'backup', createdAt: '2026-09-21', containsTls: true, archiveUsable: true },
    ],
    selectReleaseArchive: async () => ({ canceled: false, path: '/release.pfinstall' }),
    prepareInstall: async (input: { mode: string; backupCandidateId: string }) => {
      assert.equal(input.mode, 'replace');
      assert.equal(input.backupCandidateId, 'backup');
      return { operation, loadedImages: [] };
    },
    commitInstall: async (input: { replaceConfirmed: boolean }) => {
      assert.equal(input.replaceConfirmed, true);
      commits++;
      status = minimalHostStatus({
        installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
      });
    },
  } as unknown as PraxisManagerApi;
  const controller = createWizardController({
    api,
    onComplete() {},
    onCancel() {},
    requestConfirm: (_message, action) => {
      confirm = action;
    },
  });
  controller.show(status);
  await tick();
  controller.selectRecoveryBackup('backup');
  await controller.prepareRecovery();
  assert.equal(controller.getState().recoveryPhase, 'prepared');
  assert.equal(commits, 0);
  controller.commitRecovery();
  assert.equal(commits, 0);
  confirm!();
  await tick();
  assert.equal(commits, 1);
  assert.equal(controller.getState().recoveryPhase, 'setup');
});

for (const ready of [true, false])
  test(`reload uses backend operation and offers ${'finish'}`, async () => {
    const status = minimalHostStatus({
      installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
    });
    let reads = 0;
    const api = {
      fetchSetupStatus: async () => {
        reads++;
        return status;
      },
      previewInstallRecovery: async () => preview(ready),
    } as unknown as PraxisManagerApi;
    const controller = createWizardController({ api, onComplete() {}, onCancel() {} });
    controller.show(minimalHostStatus());
    await tick();
    assert.equal(reads, 1);
    assert.equal(controller.getState().recoveryPhase, 'finish');
  });

test('recovery setup moves directly between access and preview', () => {
  const status = minimalHostStatus({
    installation: {
      kind: 'installing',
      operation: { ...operation, phase: 'installing', backupContainsTls: false },
    },
  });
  const state = { ...createWizardFlowState(status), proxyEnabled: true };
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
  assert.deepEqual(planWizardBack({ ...state, step: 7 }), { type: 'goto', step: 5 });
});

test('failed recovery can retry or finish without backup without losing operation', async () => {
  const status = minimalHostStatus({
    installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
  });
  const actions: string[] = [];
  let completed = false;
  const api = {
    fetchSetupStatus: async () => status,
    previewInstallRecovery: async () => preview(true),
    finishInstallRecovery: async (input: { action: string }) => {
      actions.push(input.action);
      return input.action === 'restore'
        ? { ok: false, errors: ['Restore failed'] }
        : { ok: true, errors: [] };
    },
  } as unknown as PraxisManagerApi;
  const controller = createWizardController({
    api,
    onComplete() {
      completed = true;
    },
    onCancel() {},
  });
  controller.show(status);
  await tick();
  await controller.finishRecovery('restore');
  assert.equal(completed, false);
  assert.equal(controller.getState().operation?.id, operation.id);
  await controller.finishRecovery('restore');
  await controller.finishRecovery('without-backup');
  assert.deepEqual(actions, ['restore', 'restore', 'without-backup']);
  assert.equal(completed, true);
});

test('completion can recheck starting services without reinstalling', async () => {
  const status = minimalHostStatus({
    installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
  });
  let ready = false;
  let commits = 0;
  const api = {
    fetchSetupStatus: async () => status,
    previewInstallRecovery: async () => preview(ready),
    commitInstall: async () => {
      commits++;
    },
  } as unknown as PraxisManagerApi;
  const controller = createWizardController({ api, onComplete() {}, onCancel() {} });
  controller.show(status);
  await tick();
  assert.equal(controller.getState().recoveryPhase, 'finish');
  assert.equal(controller.getState().recoveryPreview?.baselineReady, false);
  assert.deepEqual(controller.getState().recoveryPreview?.baselineErrors, [
    'Sandbox startet noch.',
  ]);
  ready = true;
  await controller.refreshRecovery();
  assert.equal(controller.getState().recoveryPreview?.baselineReady, true);
  assert.deepEqual(controller.getState().recoveryPreview?.baselineErrors, []);
  assert.equal(commits, 0);
});

test('completion recheck does not overwrite a closed wizard session', async () => {
  const status = minimalHostStatus({
    installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
  });
  let resolve: ((value: InstallRecoveryPreview) => void) | undefined;
  let rechecking = false;
  const api = {
    fetchSetupStatus: async () => status,
    previewInstallRecovery: async () =>
      rechecking
        ? new Promise<InstallRecoveryPreview>((done) => {
            resolve = done;
          })
        : preview(false),
  } as unknown as PraxisManagerApi;
  const controller = createWizardController({ api, onComplete() {}, onCancel() {} });
  controller.show(status);
  await tick();
  rechecking = true;
  const pending = controller.refreshRecovery();
  controller.hide();
  const closed = controller.getState();
  resolve!(preview(true));
  await pending;
  assert.deepEqual(controller.getState(), closed);
});

test('finish publishes the new installation status before leaving the wizard', async () => {
  const status = minimalHostStatus({
    installation: { kind: 'installing', operation: { ...operation, phase: 'installing' } },
  });
  let publish: (() => void) | undefined;
  let completed = false;
  const controller = createWizardController({
    api: {
      fetchSetupStatus: async () => status,
      previewInstallRecovery: async () => preview(true),
      finishInstallRecovery: async () => ({ ok: true, errors: [] }),
    } as unknown as PraxisManagerApi,
    onHostMutated: () =>
      new Promise<void>((resolve) => {
        publish = resolve;
      }),
    onComplete: () => {
      completed = true;
    },
    onCancel() {},
  });
  controller.show(status);
  await tick();
  const pending = controller.finishRecovery('without-backup');
  await tick();
  assert.equal(completed, false);
  assert.equal(controller.getState().busy, true);
  assert.equal(controller.getState().recoveryPhase, 'finish');
  publish!();
  await pending;
  assert.equal(completed, true);
  assert.equal(controller.getState().operation, null);
});
