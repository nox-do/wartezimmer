import assert from 'node:assert/strict';
import test from 'node:test';
import type { RoutingModeCapabilities, TlsPrepareInput } from '../shared/host-status.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createWizardController } from './wizard-controller.js';
import { TLS_RESET_CONFIRM_MESSAGE } from './tls-network-view-model.js';
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
    step: 8,
    applyResult: minimalApplyResult(),
  });

  controller.goBack();
  assert.equal(controller.getState().step, 8);
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

  assert.equal(wizardNextButtonLabel({ ...base, step: 5, proxyEnabled: false }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 5, proxyEnabled: true }), 'Weiter zu HTTPS');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6, httpsPhase: 'offer' }), 'Weiter');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6, httpsPhase: 'mail' }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 7 }), 'Anwenden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 8, applyResult: null }), 'Bitte warten …');
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

test('goNext prepares TLS after a confirmed lease and stays on step 6', async () => {
  let prepared: { mode: string; hostname?: string; lanIp: string } | null = null;
  const controller = createWizardController({
    api: {
      prepareHostTls: async (body: TlsPrepareInput) => {
        prepared = body;
        return {
          tls: {
            state: 'awaiting-operator-dns',
            mode: 'managed',
            hostname: '7fk3m2.lan.notaus.de',
            installationId: '7fk3m2q9',
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: null,
            acmeCnameTarget: 'uuid.auth.acme-dns.io',
          },
          operatorRequest: {
            installationId: '7fk3m2q9',
            oneTimeToken: 'once',
            aRecord: { name: '7fk3m2.lan.notaus.de', value: '192.168.1.10' },
            acmeCname: {
              name: '_acme-challenge.7fk3m2.lan.notaus.de',
              value: 'uuid.auth.acme-dns.io',
            },
          },
        };
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.10',
    nameMode: 'generated',
  });
  await controller.goNext();

  assert.equal(controller.getState().step, 6);
  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.deepEqual(prepared, { mode: 'managed', hostname: undefined, lanIp: '192.168.1.10' });
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'once');
});

test('goNext hydrates the operator token when TLS is already prepared', async () => {
  const calls: TlsPrepareInput[] = [];
  const controller = createWizardController({
    api: {
      prepareHostTls: async (body: TlsPrepareInput) => {
        calls.push(body);
        return {
          tls: {
            state: 'awaiting-operator-dns',
            mode: 'managed',
            hostname: '7fk3m2.lan.notaus.de',
            installationId: '7fk3m2q9',
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: null,
            acmeCnameTarget: 'uuid.auth.acme-dns.io',
          },
          operatorRequest: {
            installationId: '7fk3m2q9',
            oneTimeToken: 'replayed',
            aRecord: { name: '7fk3m2.lan.notaus.de', value: '192.168.1.10' },
            acmeCname: {
              name: '_acme-challenge.7fk3m2.lan.notaus.de',
              value: 'uuid.auth.acme-dns.io',
            },
          },
        };
      },
      resetHostTls: async () => {
        throw new Error('reset must not run when the draft matches');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(
    minimalHostStatus({
      tls: {
        state: 'awaiting-operator-dns',
        mode: 'managed',
        hostname: '7fk3m2.lan.notaus.de',
        installationId: '7fk3m2q9',
        tokenConsumed: false,
        applyReady: false,
        cutoverApplied: false,
        certificate: null,
        lastError: null,
        acmeCnameTarget: 'uuid.auth.acme-dns.io',
      },
    }),
    'embedded',
  );
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.10',
    nameMode: 'generated',
  });
  await controller.goNext();

  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    mode: 'managed',
    hostname: '7fk3m2.lan.notaus.de',
    lanIp: '192.168.1.10',
  });
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'replayed');
});

test('goNext resets TLS when the HTTPS fork changes after prepare', async () => {
  const prepares: TlsPrepareInput[] = [];
  let resetCount = 0;
  const controller = createWizardController({
    api: {
      resetHostTls: async () => {
        resetCount += 1;
        return {
          tls: {
            state: 'off',
            mode: null,
            hostname: null,
            installationId: null,
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: null,
            acmeCnameTarget: null,
          },
        };
      },
      prepareHostTls: async (body: TlsPrepareInput) => {
        prepares.push(body);
        return {
          tls: {
            state: 'awaiting-operator-dns',
            mode: 'custom',
            hostname: 'flow.praxis-meyer.de',
            installationId: '7fk3m2q9',
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: null,
            acmeCnameTarget: null,
          },
          operatorRequest: null,
        };
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(
    minimalHostStatus({
      tls: {
        state: 'awaiting-operator-dns',
        mode: 'managed',
        hostname: '7fk3m2.lan.notaus.de',
        installationId: '7fk3m2q9',
        tokenConsumed: false,
        applyReady: false,
        cutoverApplied: false,
        certificate: null,
        lastError: null,
        acmeCnameTarget: 'uuid.auth.acme-dns.io',
      },
    }),
    'embedded',
  );
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.10',
    nameMode: 'domain',
    customDomain: 'flow.praxis-meyer.de',
    httpsPreparedNameMode: 'generated',
    mailAck: true,
  });
  await controller.goNext();

  assert.equal(resetCount, 1);
  assert.equal(prepares.length, 1);
  assert.deepEqual(prepares[0], {
    mode: 'custom',
    hostname: 'flow.praxis-meyer.de',
    lanIp: '192.168.1.10',
  });
  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.equal(controller.getState().httpsPreparedNameMode, 'domain');
  assert.equal(controller.getState().mailAck, false);
  assert.equal(controller.getState().status?.tls?.hostname, 'flow.praxis-meyer.de');
  assert.equal(controller.getState().status?.tls?.mode, 'custom');
});

test('goNext asks before discarding a prepared identity', async () => {
  let resetCount = 0;
  const confirms: string[] = [];
  const controller = createWizardController({
    api: {
      resetHostTls: async () => {
        resetCount += 1;
        return {
          tls: {
            state: 'off',
            mode: null,
            hostname: null,
            installationId: null,
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: null,
            acmeCnameTarget: null,
          },
        };
      },
      prepareHostTls: async () => {
        throw new Error('prepare must wait for confirm');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
    requestConfirm: (message) => {
      confirms.push(message);
    },
  });

  controller.show(
    minimalHostStatus({
      tls: {
        state: 'awaiting-operator-dns',
        mode: 'managed',
        hostname: '7fk3m2.lan.notaus.de',
        installationId: '7fk3m2q9',
        tokenConsumed: false,
        applyReady: false,
        cutoverApplied: false,
        certificate: null,
        lastError: null,
        acmeCnameTarget: 'uuid.auth.acme-dns.io',
      },
    }),
    'embedded',
  );
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.10',
    nameMode: 'domain',
    customDomain: 'flow.praxis-meyer.de',
    httpsPreparedNameMode: 'generated',
  });
  await controller.goNext();

  assert.deepEqual(confirms, [TLS_RESET_CONFIRM_MESSAGE]);
  assert.equal(resetCount, 0);
  assert.equal(controller.getState().httpsPhase, 'lease');
  assert.equal(controller.getState().status?.tls?.hostname, '7fk3m2.lan.notaus.de');
});
