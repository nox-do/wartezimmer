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
  test(`reload uses backend operation and offers ${ready ? 'finish' : 'restart'}`, async () => {
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
    assert.equal(controller.getState().recoveryPhase, ready ? 'finish' : 'restart');
  });

test('recovery backup bypasses initial HTTPS offer in both directions', () => {
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
