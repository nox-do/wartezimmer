import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import { createWizardController } from './wizard-controller.js';
import {
  wizardBackHidden,
  wizardIsCompleted,
  wizardNextButtonDisabled,
  wizardNextButtonLabel,
} from './wizard-view-model.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/praxis',
    mode: 'dev',
    composeProjectName: 'pf-praxis',
    projectRoot: '/tmp/praxis',
    envExists: false,
    envPath: '/tmp/praxis/.env',
    practiceDisplayName: 'Praxis',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/imports', exports: '/exports' },
    appBaseUrl: 'http://127.0.0.1:8080',
    network: {
      configuredLanIp: null,
      currentLanCandidates: [],
      lanIpStale: false,
    },
    gateway: {
      enabled: false,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '',
      authBridgeUrl: '',
    },
    deviceUrls: null,
    probes: [],
    compose: null,
    sandboxScanner: null,
    networkBindings: [],
    deliveryImages: {
      required: false,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: true,
    },
    ...overrides,
  };
}

test('createWizardController initializes on show', () => {
  const controller = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalStatus(), 'fullscreen');
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

test('goBack does not leave completed wizard', () => {
  const controller = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalStatus(), 'embedded');
  controller.patchFields({
    step: 7,
    applyResult: minimalApplyResult(),
  });

  controller.goBack();
  assert.equal(controller.getState().step, 7);
});

test('wizardNextButtonLabel adapts to step', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(wizardNextButtonLabel({ ...base, step: 5 }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6 }), 'Anwenden');
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 7, applyResult: null }),
    'Bitte warten …',
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
      status: minimalStatus({
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
