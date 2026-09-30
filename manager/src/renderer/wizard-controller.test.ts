import { wizardIsBusy, wizardError } from './wizard-controller.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApplySetupInput, HostStatus } from '../shared/host-status.js';
import { minimalHostStatus as baseHostStatus } from './test-fixtures/minimal-host-status.js';
import { createWizardController } from './wizard-controller.js';
import {
  wizardBackHidden,
  wizardIsCompleted,
  wizardNextButtonDisabled,
  wizardNextButtonLabel,
} from './wizard-view-model.js';

function minimalHostStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return baseHostStatus({ mode: 'repo', ...overrides });
}

test('createWizardController initializes on show', () => {
  const controller = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'fullscreen');
  const state = controller.getState();
  assert.equal(state.presentation, 'fullscreen');
  assert.equal(state.step, 1);
});

function minimalApplyResult(): import('../shared/host-status.js').ApplySetupResult {
  return {
    envPath: '/tmp/.env',
    backupPath: null,
    keysWritten: [],
    folders: { imports: '/imports', exports: '/exports' },
    secretsGenerated: [],
    secretsKept: [],
    compose: { ok: true, detail: '' },
    gatewayComposeSkipped: false,
    probes: [],
    deviceUrls: {
      appBaseUrl: '',
      terminal: '',
      mfa: '',
      tv: '',
      ops: '',
      opsSetup: '',
      portal: '',
    },
  };
}

function activeTlsStatus(): HostStatus {
  return minimalHostStatus({
    tls: {
      state: 'active',
      mode: 'managed',
      hostname: 'praxis.lan.notaus.de',
      installationId: 'installation-id',
      tokenConsumed: true,
      applyReady: true,
      cutoverApplied: true,
      certificate: null,
      lastError: null,
      acmeCnameTarget: null,
    },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('goBack does not leave completed wizard', () => {
  const controller = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 8,
    applyResult: minimalApplyResult(),
  });

  controller.goBack();
  assert.equal(controller.getState().step, 8);
});

test('wizardNextButtonLabel adapts to step', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(wizardNextButtonLabel({ ...base, step: 5, proxyEnabled: false }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 5, proxyEnabled: true }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 7 }), 'Anwenden');
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 8, applyResult: null, action: { kind: 'working' } }),
    'Bitte warten …',
  );
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 8, applyResult: null, action: { kind: 'idle' } }),
    'Anwenden',
  );
});

test('wizardBackHidden hides on step 1 and after completion', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(wizardBackHidden({ ...base, step: 1 }), true);
  assert.equal(
    wizardBackHidden({
      ...base,
      step: 8,
      applyResult: minimalApplyResult(),
    }),
    true,
  );
  assert.equal(
    wizardIsCompleted({
      ...base,
      step: 8,
      applyResult: minimalApplyResult(),
    }),
    true,
  );

  const activeTls = activeTlsStatus();
  assert.equal(wizardIsCompleted({ ...base, step: 8, status: activeTls, applyResult: null }), true);
  assert.equal(wizardNextButtonLabel({ ...base, step: 7, status: activeTls }), 'Abschließen');
});

test('wizardNextButtonDisabled blocks step 1 until prerequisites ready', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 1,
      status: minimalHostStatus({
        docker: {
          installed: false,
          daemonRunning: false,
          composeAvailable: false,
          detail: null,
        },
      }),
    }),
    true,
  );
});

test('wizardNextButtonDisabled allows apply retry after a failed apply', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 8,
      applyResult: null,
      action: { kind: 'working' },
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 8,
      applyResult: null,
      action: { kind: 'idle' },
    }),
    false,
  );
});

test('wizard patchFields notifies once', () => {
  let calls = 0;
  const controller = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
    onStateChange: () => {
      calls += 1;
    },
  });
  controller.show(minimalHostStatus(), 'embedded');
  calls = 0;
  controller.patchFields({ importsHostPath: '/praxis/imports' });
  assert.equal(calls, 1);
  assert.equal(controller.getState().importsHostPath, '/praxis/imports');
});

const emptyNetwork = {
  lanCandidates: [],
  interfaces: [],
  machineHostname: 'praxis-mac',
  gatewayComposeSupported: true,
};

test('stale goNext after hide and show does not change the new run', async () => {
  const network = deferred<typeof emptyNetwork>();
  const controller = createWizardController({
    api: {
      fetchSetupNetwork: () => network.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({ step: 3 });
  const pending = controller.goNext();
  await Promise.resolve();
  assert.equal(wizardIsBusy(controller.getState()), true);
  assert.equal(controller.getState().step, 5);

  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  network.resolve({ ...emptyNetwork, machineHostname: 'stale-host' });
  await pending;

  assert.equal(controller.getState().step, 1);
  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().network, null);
});

test('stale goNext finally does not clear busy on a new run', async () => {
  const first = deferred<typeof emptyNetwork>();
  const second = deferred<typeof emptyNetwork>();
  let calls = 0;
  const controller = createWizardController({
    api: {
      fetchSetupNetwork: () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({ step: 3 });
  const stale = controller.goNext();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({ step: 3 });
  const fresh = controller.goNext();
  await Promise.resolve();
  assert.equal(wizardIsBusy(controller.getState()), true);

  first.resolve({ ...emptyNetwork, machineHostname: 'stale-host' });
  await stale;
  assert.equal(wizardIsBusy(controller.getState()), true);
  assert.notEqual(controller.getState().network?.machineHostname, 'stale-host');

  second.resolve({ ...emptyNetwork, machineHostname: 'fresh-host' });
  await fresh;
  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().network?.machineHostname, 'fresh-host');
});

test('stale prerequisite refresh after hide and show does not change the new run', async () => {
  const status = deferred<ReturnType<typeof minimalHostStatus>>();
  const controller = createWizardController({
    api: {
      fetchSetupStatus: () => status.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  const pending = controller.refreshPrerequisites();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  status.resolve(minimalHostStatus({ practiceDisplayName: 'stale-refresh' }));
  await pending;

  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().status?.practiceDisplayName, 'Test');
});

test('stale release import after hide and show does not change the new run', async () => {
  const loaded = deferred<{ ok: true }>();
  const controller = createWizardController({
    api: {
      selectReleaseArchive: async () => ({ canceled: false, path: '/tmp/release.tgz' }),
      loadDeliveryImages: () => loaded.promise,
      fetchSetupStatus: async () => minimalHostStatus({ practiceDisplayName: 'stale-import' }),
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  const pending = controller.loadReleaseArchive();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  loaded.resolve({ ok: true });
  await pending;

  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().releaseImportStatus, null);
  assert.equal(controller.getState().status?.practiceDisplayName, 'Test');
});

test('stale folder browse after hide and show does not change the new run', async () => {
  const picked = deferred<{ canceled: false; path: string }>();
  const controller = createWizardController({
    api: {
      selectFolder: () => picked.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  const pending = controller.browseImportsFolder();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  picked.resolve({ canceled: false, path: '/tmp/stale-imports' });
  const path = await pending;

  assert.equal(path, null);
  assert.equal(controller.getState().importsHostPath, '/tmp/imports');
});

test('failed apply on step 8 can be retried without leaving the step', async () => {
  let applies = 0;
  const controller = createWizardController({
    api: {
      applySetupPlan: async () => {
        applies += 1;
        if (applies === 1) {
          throw new Error('Compose konnte nicht gestartet werden.');
        }
        return minimalApplyResult();
      },
      fetchSetupStatus: async () => minimalHostStatus(),
      runSetupProbes: async () => ({
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: true, message: 'ok' },
        ],
      }),
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 7,
    lanAppIp: '192.168.1.10',
  });
  await controller.goNext();

  assert.equal(controller.getState().step, 8);
  assert.equal(controller.getState().applyResult, null);
  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(wizardError(controller.getState()), 'Compose konnte nicht gestartet werden.');
  assert.equal(wizardNextButtonDisabled(controller.getState()), false);
  assert.equal(wizardNextButtonLabel(controller.getState()), 'Anwenden');

  await controller.goNext();
  assert.equal(applies, 2);
  assert.equal(controller.getState().step, 8);
  assert.equal(controller.getState().applyResult?.compose?.ok, true);
  assert.equal(wizardError(controller.getState()), null);
});

test('active TLS configuration completes without calling setup plan or apply', async () => {
  let setupCalls = 0;
  const controller = createWizardController({
    api: {
      fetchSetupPlan: async () => {
        setupCalls += 1;
        throw new Error('must not be called');
      },
      applySetupPlan: async () => {
        setupCalls += 1;
        throw new Error('must not be called');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(activeTlsStatus(), 'embedded');
  controller.patchFields({ step: 5 });
  await controller.goNext();

  assert.equal(controller.getState().step, 7);
  assert.equal(wizardError(controller.getState()), null);
  assert.equal(setupCalls, 0);

  await controller.goNext();
  assert.equal(controller.getState().step, 8);
  assert.equal(wizardError(controller.getState()), null);
  assert.equal(wizardIsCompleted(controller.getState()), true);
  assert.equal(setupCalls, 0);
});

test('release import still reports a status refresh failure', async () => {
  const controller = createWizardController({
    api: {
      selectReleaseArchive: async () => ({ canceled: false, path: '/tmp/release.tgz' }),
      loadDeliveryImages: async () => ({ ok: true }),
      fetchSetupStatus: async () => {
        throw new Error('Status nach dem Import nicht lesbar.');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  await controller.loadReleaseArchive();

  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().releaseImportStatus, null);
  assert.equal(wizardError(controller.getState()), 'Status nach dem Import nicht lesbar.');
});

test('apply after hide still reports the host mutation once', async () => {
  const applied = deferred<ReturnType<typeof minimalApplyResult>>();
  let mutateCount = 0;
  const controller = createWizardController({
    api: {
      applySetupPlan: () => applied.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
    onHostMutated: () => {
      mutateCount += 1;
    },
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 7,
    lanAppIp: '192.168.1.10',
  });
  const pending = controller.goNext();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  applied.resolve(minimalApplyResult());
  await pending;

  assert.equal(mutateCount, 1);
  assert.equal(controller.getState().applyResult, null);
  assert.equal(wizardIsBusy(controller.getState()), false);
  assert.equal(controller.getState().step, 1);
});

test('recovery completion waits automatically for core health after successful HTTP probes', async () => {
  const operation = {
    id: 'recovery-test',
    mode: 'fresh' as const,
    phase: 'installing' as const,
    createdAt: '2026-09-21',
    releaseVersion: '0.6.0',
    backupContainsTls: null,
  };
  const status = minimalHostStatus({
    mode: 'install',
    installation: { kind: 'installing', operation },
    network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
  });
  let applied = false;
  let preserveEnv: boolean | undefined;
  let completionChecks = 0;
  const controller: ReturnType<typeof createWizardController> = createWizardController({
    api: {
      fetchSetupStatus: async () => status,
      applySetupPlan: async (input: ApplySetupInput) => {
        applied = true;
        preserveEnv = input.preserveEnv;
        return minimalApplyResult();
      },
      runSetupProbes: async () => ({
        probes: [{ id: 'app.health.local', ok: true, message: 'ok' }],
      }),
      previewInstallRecovery: async () => {
        if (applied) {
          completionChecks++;
          assert.equal(wizardIsBusy(controller.getState()), true);
          assert.equal(controller.getState().recoveryPhase, 'setup');
        }
        const ready = completionChecks >= 2;
        return {
          operation,
          baselineReady: ready,
          baselineErrors: ready ? [] : ['Sandbox startet'],
          backup: null,
          restoreCompatible: false,
        };
      },
    } as never,
    onComplete() {},
    onCancel() {},
  });
  controller.show(status);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().recoveryPhase, 'setup');
  controller.patchFields({ step: 7, lanAppIp: '192.168.1.10' });
  await controller.goNext();
  assert.equal(preserveEnv, false);
  assert.equal(completionChecks, 2);
  assert.equal(controller.getState().recoveryPhase, 'finish');
  assert.equal(controller.getState().recoveryPreview?.baselineReady, true);
  assert.equal(wizardIsBusy(controller.getState()), false);
});

test('combined access step suggests a discovered address without requiring proxy', async () => {
  const controller = createWizardController({
    api: {
      fetchSetupNetwork: async () => ({
        ...emptyNetwork,
        lanCandidates: [
          { address: '192.168.0.93', interfaceName: 'en0', label: '192.168.0.93 · WLAN' },
        ],
      }),
    } as never,
    onComplete() {},
    onCancel() {},
  });
  controller.show(
    minimalHostStatus({
      network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
    }),
  );
  controller.patchFields({ step: 3 });
  await controller.goNext();
  assert.equal(controller.getState().step, 5);
  assert.equal(controller.getState().lanAppIp, '192.168.0.93');
  assert.equal(controller.getState().proxyEnabled, false);
  controller.goBack();
  assert.equal(controller.getState().step, 3);
});

test('packaged first launch waits for Docker then discovers installation choices', async () => {
  let status = minimalHostStatus({
    mode: 'install',
    envExists: false,
    installation: { kind: 'docker-unavailable', reason: 'offline' },
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: 'not ready' },
  });
  let discoveries = 0;
  const controller = createWizardController({
    api: {
      fetchSetupStatus: async () => status,
      discoverRecoveryBackups: async () => {
        discoveries++;
        return [];
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });
  controller.show(status, 'fullscreen');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().recoveryPhase, 'prerequisites');
  assert.equal(wizardError(controller.getState()), null);
  assert.equal(discoveries, 0);
  status = {
    ...status,
    installation: { kind: 'fresh' },
    docker: { ...status.docker, daemonRunning: true },
  };
  await controller.refreshRecovery();
  assert.equal(controller.getState().recoveryPhase, 'choose');
  assert.equal(discoveries, 1);
});
