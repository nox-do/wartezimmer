import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus, RoutingModeCapabilities } from '../shared/host-status.js';
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

  controller.show(minimalStatus(), 'embedded');
  controller.patchFields({
    step: 7,
    applyResult: minimalApplyResult(),
  });

  controller.goBack();
  assert.equal(controller.getState().step, 7);
});

test('network load fills gateway portal IP from selected LAN IP', async () => {
  const controller = createWizardController({
    api: {
      fetchSetupNetwork: async () => ({
        lanCandidates: [],
        interfaces: [],
        gatewayComposeSupported: true,
        defaultGatewayBridgeUrl: 'http://172.17.0.1:9100',
      }),
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalStatus(), 'embedded');
  controller.patchFields({
    gatewayEnabled: true,
    lanAppIp: '192.168.1.10',
    portalAppIp: '',
    authBridgeUrl: '',
  });

  await controller.goNext();

  assert.equal(controller.getState().step, 2);
  assert.equal(controller.getState().portalAppIp, '192.168.1.10');
  assert.equal(controller.getState().authBridgeUrl, 'http://172.17.0.1:9100');
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

  controller.show(minimalStatus(), 'embedded');
  controller.patchFields({ step: 2, lanAppIp: '10.0.0.2' });

  const advance = controller.goNext();
  await Promise.resolve();

  assert.equal(controller.getState().step, 3);
  assert.equal(controller.getState().busy, true);
  assert.equal(controller.getState().routingCapabilitiesStatus, 'loading');
  assert.equal(controller.getState().routingMode, null);

  routingMode.resolve({
    routingMode: 'complex',
    features: {
      complexRouting: true,
      journeyDesigner: true,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
  await advance;

  assert.equal(controller.getState().step, 3);
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

test('wizardNextButtonDisabled blocks routing step until mode is hydrated', () => {
  const base = createWizardController({
    api: {} as never,
    onComplete: () => {},
    onCancel: () => {},
  }).getState();

  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 3,
      routingCapabilitiesStatus: 'loading',
      routingMode: null,
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 3,
      routingCapabilitiesStatus: 'ready',
      routingMode: null,
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 3,
      routingCapabilitiesStatus: 'ready',
      routingMode: 'simple',
    }),
    false,
  );
});
