import { pfupdateWizardIsBusy, pfupdateWizardProgress } from './pfupdate-wizard-flow.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createPfupdateWizardController } from './pfupdate-wizard-controller.js';
import { pfupdateInspectSummaryLines } from './pfupdate-wizard-flow.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';

function createMockApi(overrides: Partial<PraxisManagerApi> = {}): PraxisManagerApi {
  return {
    hostPlatform: 'linux',
    fetchSetupStatus: async () =>
      ({
        settingsFormatVersion: 1,
      }) as HostStatus,
    selectPfupdateArchive: async () => ({
      canceled: false,
      path: '/tmp/update.pfupdate',
    }),
    inspectPfupdate: async () => ({
      ok: true,
      currentReleaseVersion: '2026.07.1',
      package: {
        releaseVersion: '2026.08.0',
        minimumManagerVersion: '0.2.0',
        supportedSettingsFormatVersions: [1],
        targetSchemaVersion: 1,
        images: {
          app: 'praxis-flow/app:2026.08.0',
          sandbox: 'praxis-flow/sandbox:2026.08.0',
          gateway: 'praxis-flow/gateway:2026.08.0',
        },
      },
      compatibility: {
        packageValid: true,
        managerCompatible: true,
        settingsCompatible: true,
        updateSupported: true,
        warnings: [],
      },
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

test('pfupdate wizard inspects package before apply', async () => {
  let inspectCalled = false;
  let applyCalled = false;
  let successCalled = false;

  const controller = createPfupdateWizardController({
    api: createMockApi({
      inspectPfupdate: async (body) => {
        inspectCalled = true;
        assert.equal(body.settingsFormatVersion, 1);
        return (await createMockApi().inspectPfupdate!(body)) as Awaited<
          ReturnType<PraxisManagerApi['inspectPfupdate']>
        >;
      },
      applyPfupdate: async () => {
        applyCalled = true;
        return {
          ok: true as const,
          updateId: 'update-1',
          report: {
            previousVersion: '2026.07.1',
            targetVersion: '2026.08.0',
            backupPath: '/tmp/backups/pre.pfbackup',
            compose: { running: true, services: [] },
          },
        };
      },
    }),
    getHostStatus: () => minimalHostStatus({ settingsFormatVersion: 1 }),
    onApplySuccess: () => {
      successCalled = true;
    },
  });

  controller.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(inspectCalled, true);
  assert.equal(controller.getState().phase, 'preview');

  controller.confirmApply();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(applyCalled, true);
  assert.equal(successCalled, true);
  assert.equal(controller.getState().phase, 'success');
  {
    const completed = controller.getState();
    if (completed.phase === 'success') assert.equal(completed.applyResult.ok, true);
  }
});

test('pfupdate summary shows versions and identifies local builds', () => {
  const lines = pfupdateInspectSummaryLines({
    ok: true,
    currentReleaseVersion: 'local',
    package: {
      releaseVersion: '2026.08.0',
      minimumManagerVersion: '0.2.0',
      supportedSettingsFormatVersions: [1],
      targetSchemaVersion: 1,
      images: {
        app: 'praxis-flow/app:2026.08.0',
        sandbox: 'praxis-flow/sandbox:2026.08.0',
        gateway: 'praxis-flow/gateway:2026.08.0',
      },
    },
    compatibility: {
      packageValid: true,
      managerCompatible: true,
      settingsCompatible: true,
      updateSupported: true,
      warnings: [],
    },
  });

  assert.deepEqual(lines, [
    'Neue Version: 2026.08.0',
    'Installierte Version: Lokale Version',
    'Benötigte Manager-Version: 0.2.0',
  ]);
});

test('pfupdate wizard stops on inspect failure', async () => {
  const controller = createPfupdateWizardController({
    api: createMockApi({
      inspectPfupdate: async () => ({
        ok: false,
        currentReleaseVersion: '2026.07.1',
        compatibility: {
          packageValid: false,
          managerCompatible: false,
          settingsCompatible: false,
          updateSupported: false,
          warnings: ['Paket ungültig'],
        },
        errors: ['Checksumme fehlgeschlagen'],
      }),
    }),
  });

  controller.open();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().phase, 'failed');
  assert.match(
    (controller.getState() as Extract<ReturnType<typeof controller.getState>, { phase: 'failed' }>)
      .error,
    /Checksumme fehlgeschlagen/,
  );
});

test('pfupdate wizard turns a rejected file picker into a visible failure', async () => {
  const controller = createPfupdateWizardController({
    api: createMockApi({
      selectPfupdateArchive: async () => {
        throw new Error('Dateidialog fehlgeschlagen');
      },
    }),
  });

  controller.open();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().phase, 'failed');
  assert.equal(pfupdateWizardIsBusy(controller.getState()), false);
  assert.match(
    (controller.getState() as Extract<ReturnType<typeof controller.getState>, { phase: 'failed' }>)
      .error,
    /Dateidialog fehlgeschlagen/,
  );
});

test('confirmApply ignores duplicate calls while busy or outside preview', async () => {
  let applyCalls = 0;
  let resolveApply!: () => void;
  const applyGate = new Promise<void>((resolve) => {
    resolveApply = resolve;
  });

  const controller = createPfupdateWizardController({
    api: createMockApi({
      inspectPfupdate: async () => ({
        ok: true,
        currentReleaseVersion: '2026.07.1',
        package: {
          releaseVersion: '2026.08.0',
          minimumManagerVersion: '0.2.0',
          supportedSettingsFormatVersions: [1],
          targetSchemaVersion: 1,
          images: {
            app: 'praxis-flow/app:2026.08.0',
            sandbox: 'praxis-flow/sandbox:2026.08.0',
            gateway: 'praxis-flow/gateway:2026.08.0',
          },
        },
        compatibility: {
          packageValid: true,
          managerCompatible: true,
          settingsCompatible: true,
          updateSupported: true,
          warnings: [],
        },
      }),
      applyPfupdate: async () => {
        applyCalls += 1;
        await applyGate;
        return {
          ok: true as const,
          updateId: 'update-1',
          report: {
            previousVersion: '2026.07.1',
            targetVersion: '2026.08.0',
            backupPath: '/tmp/backups/pre.pfbackup',
            compose: { running: true, services: [] },
          },
        };
      },
    }),
    getHostStatus: () => minimalHostStatus({ settingsFormatVersion: 1 }),
  });

  controller.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.confirmApply();
  controller.confirmApply();
  assert.equal(applyCalls, 1);
  resolveApply();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.confirmApply();
  assert.equal(applyCalls, 1);
});

for (const stage of ['select', 'inspect', 'apply'] as const) {
  for (const reopen of [false, true]) {
    test(`update ignores late ${stage} after ${reopen ? 'reopening' : 'closing'}`, async () => {
      const base = createMockApi();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      let refreshes = 0;
      let successes = 0;
      async function waitOnce() {
        if (first) {
          first = false;
          await gate;
        }
      }
      const controller = createPfupdateWizardController({
        refreshHost: async () => {
          refreshes++;
        },
        onApplySuccess: () => {
          successes++;
        },
        api: createMockApi({
          selectPfupdateArchive: async () => {
            if (stage === 'select') await waitOnce();
            return base.selectPfupdateArchive();
          },
          inspectPfupdate: async (input) => {
            if (stage === 'inspect') await waitOnce();
            return base.inspectPfupdate(input);
          },
          applyPfupdate: async (input) => {
            if (stage === 'apply') await waitOnce();
            return base.applyPfupdate(input);
          },
        }),
      });
      controller.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (stage === 'apply') controller.confirmApply();
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.close();
      if (reopen) {
        controller.open();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const before = controller.getState();
      const refreshesBefore = refreshes;
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(controller.getState(), before);
      assert.equal(successes, 0);
      assert.equal(refreshes - refreshesBefore, stage === 'apply' ? 1 : 0);
    });
  }
}

for (const throws of [false, true]) {
  test(`failed update reconciles host status (exception=${throws})`, async () => {
    let refreshes = 0;
    const controller = createPfupdateWizardController({
      refreshHost: async () => {
        refreshes++;
      },
      api: createMockApi({
        applyPfupdate: async () => {
          if (throws) throw new Error('transport failed');
          return {
            ok: false,
            updateId: 'u',
            failedPhase: 'health',
            errors: ['health failed'],
            rollbackAttempted: true,
            rollbackSucceeded: false,
          };
        },
      }),
    });
    controller.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.confirmApply();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const state = controller.getState();
    assert.equal(state.phase, 'failed');
    assert.equal(pfupdateWizardIsBusy(state), false);
    if (state.phase === 'failed') assert.equal(state.applyResult?.ok, throws ? undefined : false);
    assert.equal(refreshes, 2);
  });
}

test('local progress and locks follow the active variants', async () => {
  const controller = createPfupdateWizardController({ api: createMockApi() });
  const states = [controller.getState()];
  controller.open();
  states.push(controller.getState());
  await new Promise((resolve) => setTimeout(resolve, 0));
  states.push(controller.getState());
  controller.confirmApply();
  states.push(controller.getState());
  await new Promise((resolve) => setTimeout(resolve, 0));
  states.push(controller.getState());
  for (const state of states) {
    assert.equal(pfupdateWizardIsBusy(state), pfupdateWizardProgress(state) !== '');
  }
  assert.deepEqual(
    states.map((state) => state.phase),
    ['closed', 'select', 'preview', 'applying', 'success'],
  );
});
