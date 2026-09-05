import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createPfupdateWizardController } from './pfupdate-wizard-controller.js';
import { pfupdateInspectSummaryLines } from './pfupdate-wizard-flow.js';

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
    getHostStatus: () => ({ settingsFormatVersion: 1 }) as HostStatus,
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
});

test('pfupdate summary labels stay technical and local builds are not mistaken for real releases', () => {
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
    'Target release: 2026.08.0',
    'Current: local build',
    'Minimum manager: 0.2.0',
    'Settings formats: 1',
    'DB schema after update: 1',
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
  assert.match(controller.getState().error ?? '', /Checksumme fehlgeschlagen/);
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
    getHostStatus: () => ({ settingsFormatVersion: 1 }) as HostStatus,
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
