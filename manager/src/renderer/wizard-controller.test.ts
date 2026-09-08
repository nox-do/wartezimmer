import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus, TlsPrepareInput } from '../shared/host-status.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createWizardController, wizardManagedPrepareErrorFooter } from './wizard-controller.js';
import { TLS_LEASE_STALE_LAN_COPY, TLS_RESET_CONFIRM_MESSAGE } from './tls-network-view-model.js';
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
  assert.equal(wizardNextButtonLabel({ ...base, step: 5, proxyEnabled: true }), 'Weiter zu HTTPS');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6, httpsPhase: 'offer' }), 'Weiter');
  assert.equal(wizardNextButtonLabel({ ...base, step: 6, httpsPhase: 'mail' }), 'Vorschau laden');
  assert.equal(wizardNextButtonLabel({ ...base, step: 7 }), 'Anwenden');
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 8, applyResult: null, busy: true }),
    'Bitte warten …',
  );
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 8, applyResult: null, busy: false }),
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
  assert.equal(
    wizardIsCompleted({ ...base, step: 8, status: activeTls, applyResult: null }),
    true,
  );
  assert.equal(
    wizardNextButtonLabel({ ...base, step: 7, status: activeTls }),
    'Abschließen',
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
      busy: true,
    }),
    true,
  );
  assert.equal(
    wizardNextButtonDisabled({
      ...base,
      step: 8,
      applyResult: null,
      busy: false,
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

test('wizardManagedPrepareErrorFooter uses the ACME title with a wizard-only hint', () => {
  assert.equal(
    wizardManagedPrepareErrorFooter(),
    'Das Zertifikat konnte nicht ausgestellt werden. Zurück und HTTPS später unter Netzwerk fortsetzen.',
  );
  assert.doesNotMatch(wizardManagedPrepareErrorFooter(), /Erneut versuchen/);
});

test('managed prepare failure uses the shared ACME footer copy', async () => {
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        throw new Error('register timed out at acme-dns');
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

  assert.equal(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.equal(controller.getState().httpsPhase, 'lease');
  assert.doesNotMatch(controller.getState().error ?? '', /register timed out/);
  assert.doesNotMatch(controller.getState().error ?? '', /Erneut versuchen/);
});

test('managed prepare that returns persisted error stays off the mail phase', async () => {
  let prepareCount = 0;
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        prepareCount += 1;
        return {
          tls: {
            state: 'error',
            mode: 'managed',
            hostname: '7fk3m2.lan.notaus.de',
            installationId: '7fk3m2q9',
            tokenConsumed: false,
            applyReady: false,
            cutoverApplied: false,
            certificate: null,
            lastError: { class: 'acme', message: 'register failed' },
            acmeCnameTarget: null,
          },
          operatorRequest: null,
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

  assert.equal(prepareCount, 1);
  assert.equal(controller.getState().httpsPhase, 'lease');
  assert.equal(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.equal(controller.getState().operatorRequest, null);
  assert.equal(controller.getState().status?.tls?.state, 'error');

  await controller.goNext();
  assert.equal(prepareCount, 1);
  assert.equal(controller.getState().httpsPhase, 'lease');
  assert.equal(controller.getState().error, wizardManagedPrepareErrorFooter());
});

test('existing custom error is not rewritten as ACME', async () => {
  let prepareCount = 0;
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        prepareCount += 1;
        throw new Error('must not prepare');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(
    minimalHostStatus({
      tls: {
        state: 'error',
        mode: 'custom',
        hostname: 'flow.praxis-meyer.de',
        installationId: '7fk3m2q9',
        tokenConsumed: false,
        applyReady: false,
        cutoverApplied: false,
        certificate: null,
        lastError: {
          class: 'firewall',
          message: 'Port 443 auf diesem Rechner ist nicht erreichbar.',
        },
        acmeCnameTarget: null,
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
    httpsPreparedNameMode: 'domain',
  });
  await controller.goNext();

  assert.equal(prepareCount, 0);
  assert.notEqual(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.doesNotMatch(controller.getState().error ?? '', /Zertifikat konnte nicht ausgestellt/);
  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.equal(controller.getState().error, null);
});

test('custom prepare failure keeps the API exception message', async () => {
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        throw new Error('Custom TLS_LAN_IP konnte nicht geschrieben werden.');
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
    nameMode: 'domain',
    customDomain: 'flow.praxis-meyer.de',
  });
  await controller.goNext();

  assert.equal(controller.getState().error, 'Custom TLS_LAN_IP konnte nicht geschrieben werden.');
  assert.notEqual(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.equal(controller.getState().httpsPhase, 'lease');
});

test('PEM staging failure keeps the API exception message', async () => {
  const controller = createWizardController({
    api: {
      stageHostTlsCertificate: async () => {
        throw new Error(
          'Die Uhrzeit dieses Rechners wird von der Zertifizierungsstelle abgelehnt.',
        );
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  await controller.stageWizardTlsCertificate();

  assert.equal(
    controller.getState().error,
    'Die Uhrzeit dieses Rechners wird von der Zertifizierungsstelle abgelehnt.',
  );
  assert.notEqual(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.equal(controller.getState().customPemStaged, false);
});

test('reset failure while changing identity is not rewritten as ACME', async () => {
  const controller = createWizardController({
    api: {
      resetHostTls: async () => {
        throw new Error('HTTPS-Vorbereitung konnte nicht verworfen werden.');
      },
      prepareHostTls: async () => {
        throw new Error('prepare must not run after reset failure');
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
  });
  await controller.goNext();

  assert.equal(controller.getState().error, 'HTTPS-Vorbereitung konnte nicht verworfen werden.');
  assert.notEqual(controller.getState().error, wizardManagedPrepareErrorFooter());
  assert.equal(controller.getState().httpsPhase, 'lease');
});

test('local HTTPS validation errors stay on the existing footer copy', async () => {
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        throw new Error('must not prepare');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'hostname',
    nameMode: 'label',
    customLabel: '',
  });
  await controller.goNext();
  assert.equal(controller.getState().error, 'Bitte einen gültigen Namen wählen.');
  assert.equal(controller.getState().httpsPhase, 'hostname');

  controller.patchFields({
    httpsPhase: 'lease',
    ipv4Reserved: false,
    lanAppIp: '192.168.1.10',
    nameMode: 'generated',
  });
  await controller.goNext();
  assert.equal(
    controller.getState().error,
    'Bitte die feste IP oder DHCP-Reservierung bestätigen.',
  );

  controller.show(
    minimalHostStatus({
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [],
        lanIpStale: true,
      },
    }),
    'embedded',
  );
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.40',
    nameMode: 'generated',
  });
  await controller.goNext();
  assert.equal(controller.getState().error, TLS_LEASE_STALE_LAN_COPY);

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '',
    nameMode: 'generated',
  });
  await controller.goNext();
  assert.equal(controller.getState().error, 'Bitte zuerst eine LAN-IP wählen.');
  assert.notEqual(controller.getState().error, wizardManagedPrepareErrorFooter());
});

test('goNext prepares custom TLS after a confirmed lease', async () => {
  let prepared: TlsPrepareInput | null = null;
  const controller = createWizardController({
    api: {
      prepareHostTls: async (body: TlsPrepareInput) => {
        prepared = body;
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

  controller.show(minimalHostStatus(), 'embedded');
  controller.patchFields({
    step: 6,
    proxyEnabled: true,
    httpsPhase: 'lease',
    ipv4Reserved: true,
    lanAppIp: '192.168.1.10',
    nameMode: 'domain',
    customDomain: 'flow.praxis-meyer.de',
  });
  await controller.goNext();

  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.equal(controller.getState().error, null);
  assert.deepEqual(prepared, {
    mode: 'custom',
    hostname: 'flow.praxis-meyer.de',
    lanIp: '192.168.1.10',
  });
  assert.equal(controller.getState().httpsPreparedNameMode, 'domain');
});

test('failed mail replay does not surface an ACME footer', async () => {
  const controller = createWizardController({
    api: {
      prepareHostTls: async () => {
        throw new Error('identity replay refused');
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

  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().httpsPhase, 'mail');
  assert.equal(controller.getState().operatorRequest, null);
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
  controller.patchFields({ customLabel: 'praxis' });
  assert.equal(calls, 1);
  assert.equal(controller.getState().customLabel, 'praxis');
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
  assert.equal(controller.getState().busy, true);
  assert.equal(controller.getState().step, 4);

  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  network.resolve({ ...emptyNetwork, machineHostname: 'stale-host' });
  await pending;

  assert.equal(controller.getState().step, 1);
  assert.equal(controller.getState().busy, false);
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
  assert.equal(controller.getState().busy, true);

  first.resolve({ ...emptyNetwork, machineHostname: 'stale-host' });
  await stale;
  assert.equal(controller.getState().busy, true);
  assert.notEqual(controller.getState().network?.machineHostname, 'stale-host');

  second.resolve({ ...emptyNetwork, machineHostname: 'fresh-host' });
  await fresh;
  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().network?.machineHostname, 'fresh-host');
});

test('stale PEM staging after hide and show does not change the new run', async () => {
  const staged = deferred<{
    canceled: false;
    tls: NonNullable<ReturnType<typeof minimalHostStatus>['tls']>;
  }>();
  const controller = createWizardController({
    api: {
      stageHostTlsCertificate: () => staged.promise,
    } as never,
    onComplete: () => {},
    onCancel: () => {},
  });

  controller.show(minimalHostStatus(), 'embedded');
  const pending = controller.stageWizardTlsCertificate();
  await Promise.resolve();
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  staged.resolve({
    canceled: false,
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
  });
  await pending;

  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().customPemStaged, false);
  assert.equal(controller.getState().status?.tls, undefined);
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

  assert.equal(controller.getState().busy, false);
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

  assert.equal(controller.getState().busy, false);
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

test('identity-reset confirm is ignored after hide', async () => {
  let resetCount = 0;
  let onConfirm: (() => void) | undefined;
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
        throw new Error('prepare must not run after discarded confirm');
      },
    } as never,
    onComplete: () => {},
    onCancel: () => {},
    requestConfirm: (_message, confirm) => {
      onConfirm = confirm;
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
  controller.hide();
  controller.show(minimalHostStatus(), 'embedded');
  onConfirm?.();
  await Promise.resolve();

  assert.equal(resetCount, 0);
  assert.equal(controller.getState().step, 1);
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
  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().error, 'Compose konnte nicht gestartet werden.');
  assert.equal(wizardNextButtonDisabled(controller.getState()), false);
  assert.equal(wizardNextButtonLabel(controller.getState()), 'Anwenden');

  await controller.goNext();
  assert.equal(applies, 2);
  assert.equal(controller.getState().step, 8);
  assert.equal(controller.getState().applyResult?.compose?.ok, true);
  assert.equal(controller.getState().error, null);
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
  assert.equal(controller.getState().error, null);
  assert.equal(setupCalls, 0);

  await controller.goNext();
  assert.equal(controller.getState().step, 8);
  assert.equal(controller.getState().error, null);
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

  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().releaseImportStatus, null);
  assert.equal(controller.getState().error, 'Status nach dem Import nicht lesbar.');
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
  assert.equal(controller.getState().busy, false);
  assert.equal(controller.getState().step, 1);
});
