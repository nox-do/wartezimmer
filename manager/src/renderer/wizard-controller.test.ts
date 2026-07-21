import assert from 'node:assert/strict';
import test from 'node:test';
import type { RoutingModeCapabilities } from '../shared/host-status.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createWizardController } from './wizard-controller.js';
import {
  wizardBackHidden,
  wizardIsCompleted,
  wizardNextButtonDisabled,
  wizardNextButtonLabel,
} from './wizard-view-model.js';

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
    step: 7,
    applyResult: minimalApplyResult(),
  });

  controller.goBack();
  assert.equal(controller.getState().step, 7);
});

test('entering routing step waits for server routing mode', async () => {
  const routingMode = deferred<RoutingModeCapabilities>();
  const controller = createWizardController({
    api: {
      getRoutingMode: () => routingMode.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');

  const advance = controller.goNext();
  await Promise.resolve();

  assert.equal(controller.getState().step, 2);
  assert.equal(controller.getState().busy, true);
  assert.equal(controller.getState().routingCapabilitiesStatus, 'loading');
  assert.equal(controller.getState().routingMode, null);

  routingMode.resolve({
    routingMode: 'complex',
    openVisitCount: 0,
    features: {
      complexRouting: true,
      journeyDesigner: true,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
  await advance;

  assert.equal(controller.getState().step, 2);
  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().routingCapabilitiesStatus, 'ready');
  assert.equal(controller.getState().routingMode, 'complex');
});

test('wizardNextButtonLabel adapts to step', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(wizardNextButtonLabel({ ...base, step: 5 }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6 }), 'Anwenden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 7, applyResult: null }), 'Bitte warten …');
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
      step: 7,
      applyResult: minimalApplyResult(),
    }),
    true,
  );
  assert.equal(
    wizardIsCompleted({
      ...base,
      step: 7,
      applyResult: minimalApplyResult(),
    }),
    true,
  );
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

test('wizardNextButtonDisabled blocks routing step until mode is hydrated', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 2,
      routingCapabilitiesStatus: 'loading',
      routingMode: null,
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 2,
      routingCapabilitiesStatus: 'ready',
      routingMode: null,
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 2,
      routingCapabilitiesStatus: 'ready',
      routingMode: 'simple',
    }),
    false,
  );
});
