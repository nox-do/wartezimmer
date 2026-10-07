import {
  tlsNetworkPendingObtain,
  tlsNetworkError,
  tlsNetworkLocksHost,
} from './tls-network-controller.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TlsPrepareInput, TlsStatus } from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import { createTlsNetworkController } from './tls-network-controller.js';
import { TLS_CUTOVER_CONFIRM_MESSAGE, TLS_LEASE_STALE_LAN_COPY } from './tls-network-view-model.js';
import { minimalHostStatus, knownLifecycle } from './test-fixtures/minimal-host-status.js';

function tls(overrides: Partial<TlsStatus>): TlsStatus {
  return {
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
    ...overrides,
  };
}

function createController(options: {
  api?: Partial<WartezimmerManagerApi>;
  status: TlsStatus;
  lanIp?: string;
  lanIpFn?: () => string | null;
  lanIpStale?: boolean;
  configuredLanIp?: string | null;
  requestConfirm?: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  onAfterMutation?: () => void | Promise<void>;
  isPeerMutating?: () => boolean;
}) {
  return createTlsNetworkController({
    api: options.api as WartezimmerManagerApi,
    getConfig: () =>
      minimalHostStatus({
        lifecycle: knownLifecycle(
          options.status.cutoverApplied ? 'https' : 'proxy-http',
          !options.status.cutoverApplied && options.status.state !== 'off' ? 'https' : 'none',
        ),
        tls: options.status,
        network: {
          configuredLanIp: options.configuredLanIp ?? '192.168.1.10',
          currentLanCandidates: [],
          lanIpStale: options.lanIpStale ?? false,
        },
        proxy: {
          enabled: true,
          mode: 'http',
          canonicalBaseUrl: 'http://192.168.1.10',
          httpPort: 80,
          appBindAddress: '127.0.0.1',
          container: null,
        },
      }),
    lanIp: options.lanIpFn ?? (() => options.lanIp ?? '192.168.1.10'),
    onAfterMutation: options.onAfterMutation ?? (async () => {}),
    onStateChange: () => {},
    requestConfirm: options.requestConfirm ?? ((_message, onConfirm) => onConfirm()),
    isPeerMutating: options.isPeerMutating,
  });
}

for (const prepareCase of [
  {
    name: 'generated operator name',
    draft: { nameMode: 'generated' as const },
    expected: { mode: 'managed', hostname: undefined, lanIp: '192.168.1.10' } as const,
  },
  {
    name: 'chosen operator-zone label',
    draft: { nameMode: 'label' as const, customLabel: 'Muster' },
    expected: {
      mode: 'managed',
      hostname: 'muster.lan.notaus.de',
      lanIp: '192.168.1.10',
    } as const,
  },
  {
    name: 'own domain with automatic ACME',
    draft: { nameMode: 'domain' as const, customDomain: 'Flow.Praxis-Meyer.de.' },
    expected: { mode: 'managed', hostname: 'flow.praxis-meyer.de', lanIp: '192.168.1.10' } as const,
  },
  {
    name: 'custom domain',
    draft: {
      nameMode: 'domain' as const,
      certificateMode: 'custom' as const,
      customDomain: 'Flow.Praxis-Meyer.de.',
    },
    expected: {
      mode: 'custom',
      hostname: 'flow.praxis-meyer.de',
      lanIp: '192.168.1.10',
    } as const,
  },
]) {
  test(`submitLease prepares TLS for ${prepareCase.name}`, async () => {
    let prepared: TlsPrepareInput | null = null;
    const controller = createController({
      status: tls({ state: 'off' }),
      api: {
        prepareHostTls: async (body: TlsPrepareInput) => {
          prepared = body;
          return {
            tls: tls({
              state: 'awaiting-operator-dns',
              mode: body.mode,
              hostname: body.hostname ?? 'staff.7fk3m2.lan.notaus.de',
              installationId: '7fk3m2q9',
              acmeCnameTarget: body.mode === 'managed' ? 'uuid.auth.acme-dns.io' : null,
            }),
            operatorRequest:
              body.mode === 'managed'
                ? {
                    installationId: '7fk3m2q9',
                    oneTimeToken: 'once',
                    aRecord: {
                      name: body.hostname ?? 'staff.7fk3m2.lan.notaus.de',
                      value: '192.168.1.10',
                    },
                    acmeCname: {
                      name: `_acme-challenge.${body.hostname ?? '7fk3m2.lan.notaus.de'}`,
                      value: 'uuid.auth.acme-dns.io',
                    },
                  }
                : null,
          };
        },
      },
    });

    controller.patchDraft({ ipv4Reserved: true, ...prepareCase.draft });
    await controller.submitLease();
    assert.deepEqual(prepared, prepareCase.expected);
    assert.equal(controller.getState().revealOperatorRecords, true);
    assert.equal(
      controller.getState().operatorRequest?.oneTimeToken ?? null,
      prepareCase.expected.mode === 'managed' ? 'once' : null,
    );
  });
}

test('submitLease refuses prepare while LAN IP is stale', async () => {
  let prepared = false;
  const controller = createController({
    status: tls({ state: 'off' }),
    lanIp: '192.168.1.40',
    lanIpStale: true,
    configuredLanIp: '192.168.1.10',
    api: {
      prepareHostTls: async () => {
        prepared = true;
        throw new Error('must not prepare');
      },
    },
  });
  controller.patchDraft({ ipv4Reserved: true, nameMode: 'generated' });
  await controller.submitLease();
  assert.equal(prepared, false);
  assert.equal(tlsNetworkError(controller.getState()), TLS_LEASE_STALE_LAN_COPY);
});

test('hydrateOperatorRequest replays prepare to recover the unused token', async () => {
  const controller = createController({
    status: tls({
      state: 'awaiting-operator-dns',
      mode: 'managed',
      hostname: 'staff.7fk3m2.lan.notaus.de',
      installationDomain: '7fk3m2.lan.notaus.de',
      staffHostname: 'staff.7fk3m2.lan.notaus.de',
      portalHostname: 'portal.7fk3m2.lan.notaus.de',
      wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
      installationId: '7fk3m2q9',
      tokenConsumed: false,
    }),
    api: {
      prepareHostTls: async (body: TlsPrepareInput) => {
        assert.equal(body.hostname, '7fk3m2.lan.notaus.de');
        return {
          tls: tls({
            state: 'awaiting-operator-dns',
            mode: 'managed',
            hostname: 'staff.7fk3m2.lan.notaus.de',
            installationDomain: '7fk3m2.lan.notaus.de',
          }),
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
    },
  });

  await controller.hydrateOperatorRequest();
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'replayed');
  assert.equal(controller.getState().revealOperatorRecords, true);
});

test('verifyDns keeps TLS lastError off the footer error slot', async () => {
  const controller = createController({
    status: tls({ state: 'awaiting-operator-dns', mode: 'managed' }),
    api: {
      verifyHostTlsDns: async () => ({
        tls: tls({
          state: 'error',
          mode: 'managed',
          lastError: {
            class: 'a-record',
            message: 'Kein eigener A-Record — Catch-all der Zone zeigt auf 213.23.215.150',
          },
        }),
        checks: [
          {
            id: 'a-record' as const,
            ok: false,
            message: 'Kein eigener A-Record — Catch-all der Zone zeigt auf 213.23.215.150',
          },
        ],
      }),
    },
  });
  await controller.verifyDns();
  assert.equal(tlsNetworkError(controller.getState()), null);
  assert.equal(controller.getState().dnsChecks?.[0]?.ok, false);
});

test('apply asks for confirmation before cutover', async () => {
  const confirms: string[] = [];
  let applied = false;
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: true }),
    requestConfirm: (message, onConfirm) => {
      confirms.push(message);
      onConfirm();
    },
    api: {
      applyHostTls: async () => {
        applied = true;
        return { tls: tls({ state: 'active', cutoverApplied: true, applyReady: true }) };
      },
    },
  });

  await controller.apply();
  assert.deepEqual(confirms, [TLS_CUTOVER_CONFIRM_MESSAGE]);
  assert.equal(applied, true);
});

test('failed apply refreshes host status and keeps the API error if refresh throws', async () => {
  let afterMutationCalls = 0;
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: true }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
      if (afterMutationCalls === 1) {
        throw new Error('status refresh failed');
      }
    },
    api: {
      applyHostTls: async () => {
        throw new Error('apply rolled back');
      },
    },
  });
  await controller.apply();
  assert.equal(afterMutationCalls, 1);
  assert.equal(tlsNetworkError(controller.getState()), 'apply rolled back');
});

test('failed active TLS mutations refresh durable operation status', async () => {
  for (const action of ['repair', 'reset', 'renew'] as const) {
    let afterMutationCalls = 0;
    const failure = `${action} recovery failed`;
    const status = tls({
      state: action === 'repair' ? 'degraded' : 'active',
      mode: 'managed',
      cutoverApplied: true,
      applyReady: true,
    });
    const controller = createController({
      status,
      onAfterMutation: async () => {
        afterMutationCalls += 1;
      },
      api: {
        repairHostTls: async () => {
          throw new Error(failure);
        },
        resetHostTls: async () => {
          throw new Error(failure);
        },
        renewHostTls: async () => {
          throw new Error(failure);
        },
      },
    });
    await controller[action]();
    assert.equal(afterMutationCalls, 1, action);
    assert.equal(tlsNetworkError(controller.getState()), failure, action);
  }
});

test('obtainOrCheck sets pendingObtain until the request settles', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: false }),
    api: {
      obtainHostTlsCertificate: async () => {
        await gate;
        return {
          tls: tls({ state: 'dns-verified', mode: 'managed', applyReady: true }),
          checks: [],
        };
      },
    },
  });
  const running = controller.obtainOrCheck();
  assert.equal(tlsNetworkPendingObtain(controller.getState()), true);
  release();
  await running;
  assert.equal(tlsNetworkPendingObtain(controller.getState()), false);
});

test('failed obtain refreshes host status', async () => {
  let afterMutationCalls = 0;
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: false }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
    api: {
      obtainHostTlsCertificate: async () => {
        throw new Error('acme obtain failed');
      },
    },
  });
  await controller.obtainOrCheck();
  assert.equal(afterMutationCalls, 1);
  assert.equal(tlsNetworkError(controller.getState()), 'acme obtain failed');
  assert.equal(tlsNetworkPendingObtain(controller.getState()), false);
});

test('failed custom certificate check refreshes host status', async () => {
  let afterMutationCalls = 0;
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'custom', applyReady: false }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
    api: {
      checkHostTlsCertificate: async () => {
        throw new Error('PEM clock rejected');
      },
    },
  });
  await controller.obtainOrCheck();
  assert.equal(afterMutationCalls, 1);
  assert.equal(tlsNetworkError(controller.getState()), 'PEM clock rejected');
});

test('failed prepare refreshes host status', async () => {
  let afterMutationCalls = 0;
  const controller = createController({
    status: tls({ state: 'off' }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
    api: {
      prepareHostTls: async () => {
        throw new Error('acme register failed');
      },
    },
  });
  controller.patchDraft({ ipv4Reserved: true, nameMode: 'generated' });
  await controller.submitLease();
  assert.equal(afterMutationCalls, 1);
  assert.equal(tlsNetworkError(controller.getState()), 'acme register failed');
});

test('client validation does not refresh host status', async () => {
  let afterMutationCalls = 0;
  const stale = createController({
    status: tls({ state: 'off' }),
    lanIpStale: true,
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
    api: {
      prepareHostTls: async () => {
        throw new Error('must not prepare');
      },
    },
  });
  stale.patchDraft({ ipv4Reserved: true, nameMode: 'generated' });
  await stale.submitLease();
  assert.equal(tlsNetworkError(stale.getState()), TLS_LEASE_STALE_LAN_COPY);

  const unnamed = createController({
    status: tls({ state: 'off' }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
  });
  unnamed.patchDraft({ ipv4Reserved: true, nameMode: 'label', customLabel: '' });
  await unnamed.submitLease();
  assert.equal(tlsNetworkError(unnamed.getState()), 'Bitte einen gültigen Namen wählen.');

  const noLan = createController({
    status: tls({ state: 'off' }),
    lanIp: '',
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
  });
  noLan.patchDraft({ ipv4Reserved: true, nameMode: 'generated' });
  await noLan.submitLease();
  assert.equal(
    tlsNetworkError(noLan.getState()),
    'Bitte zuerst die Adresse dieses Rechners speichern.',
  );

  const noLease = createController({
    status: tls({ state: 'off' }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
  });
  noLease.patchDraft({ ipv4Reserved: false, nameMode: 'generated' });
  await noLease.submitLease();
  assert.equal(
    tlsNetworkError(noLease.getState()),
    'Bitte die feste IP oder DHCP-Reservierung bestätigen.',
  );

  assert.equal(afterMutationCalls, 0);
});
test('failed verify-dns refreshes host status', async () => {
  let afterMutationCalls = 0;
  const controller = createController({
    status: tls({ state: 'awaiting-operator-dns', mode: 'managed' }),
    onAfterMutation: async () => {
      afterMutationCalls += 1;
    },
    api: {
      verifyHostTlsDns: async () => {
        throw new Error('resolver down');
      },
    },
  });
  await controller.verifyDns();
  assert.equal(afterMutationCalls, 1);
  assert.equal(tlsNetworkError(controller.getState()), 'resolver down');
});

function awaitingManagedReplay() {
  return tls({
    state: 'awaiting-operator-dns',
    mode: 'managed',
    hostname: '7fk3m2.lan.notaus.de',
    installationId: '7fk3m2q9',
    tokenConsumed: false,
  });
}

function operatorRequest(token: string, lanIp = '192.168.1.10') {
  return {
    installationId: '7fk3m2q9',
    oneTimeToken: token,
    aRecord: { name: '7fk3m2.lan.notaus.de', value: lanIp },
    acmeCname: {
      name: '_acme-challenge.7fk3m2.lan.notaus.de',
      value: 'uuid.auth.acme-dns.io',
    },
  };
}

test('hydrateOperatorRequest replays once per hostname and LAN IP', async () => {
  let prepares = 0;
  const controller = createController({
    status: awaitingManagedReplay(),
    api: {
      prepareHostTls: async () => {
        prepares += 1;
        return {
          tls: awaitingManagedReplay(),
          operatorRequest: operatorRequest('replayed'),
        };
      },
    },
  });
  await controller.hydrateOperatorRequest();
  await controller.hydrateOperatorRequest();
  assert.equal(prepares, 1);
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'replayed');
});

test('hydrateOperatorRequest does not retry a completed null replay for the same identity', async () => {
  let prepares = 0;
  const controller = createController({
    status: awaitingManagedReplay(),
    api: {
      prepareHostTls: async () => {
        prepares += 1;
        return { tls: awaitingManagedReplay(), operatorRequest: null };
      },
    },
  });
  await controller.hydrateOperatorRequest();
  await controller.hydrateOperatorRequest();
  assert.equal(prepares, 1);
  assert.equal(controller.getState().operatorRequest, null);
});

test('hydrateOperatorRequest ignores a stale result after identity change', async () => {
  let lanIp = '192.168.1.10';
  const firstGate = { resolve() {} };
  const firstHeld = new Promise<void>((resolve) => {
    firstGate.resolve = resolve;
  });
  let firstStarted = false;
  const controller = createController({
    status: awaitingManagedReplay(),
    lanIpFn: () => lanIp,
    api: {
      prepareHostTls: async (body) => {
        if (!firstStarted) {
          firstStarted = true;
          await firstHeld;
          return {
            tls: awaitingManagedReplay(),
            operatorRequest: operatorRequest('stale', body.lanIp),
          };
        }
        return {
          tls: awaitingManagedReplay(),
          operatorRequest: operatorRequest('fresh', body.lanIp),
        };
      },
    },
  });
  const first = controller.hydrateOperatorRequest();
  lanIp = '192.168.1.40';
  await controller.hydrateOperatorRequest();
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'fresh');
  firstGate.resolve();
  await first;
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'fresh');
});

test('hydrateOperatorRequest clears stale operator data when identity changes', async () => {
  let lanIp = '192.168.1.10';
  const controller = createController({
    status: awaitingManagedReplay(),
    lanIpFn: () => lanIp,
    api: {
      prepareHostTls: async (body) => {
        if (body.lanIp === '192.168.1.40') {
          return { tls: awaitingManagedReplay(), operatorRequest: null };
        }
        return {
          tls: awaitingManagedReplay(),
          operatorRequest: operatorRequest('old', body.lanIp),
        };
      },
    },
  });
  await controller.hydrateOperatorRequest();
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'old');
  lanIp = '192.168.1.40';
  await controller.hydrateOperatorRequest();
  assert.equal(controller.getState().operatorRequest, null);
});

test('hydrateOperatorRequest clears leftover dnsChecks when identity changes after a null replay', async () => {
  let lanIp = '192.168.1.10';
  let prepares = 0;
  const controller = createController({
    status: awaitingManagedReplay(),
    lanIpFn: () => lanIp,
    api: {
      prepareHostTls: async () => {
        prepares += 1;
        return { tls: awaitingManagedReplay(), operatorRequest: null };
      },
      verifyHostTlsDns: async () => ({
        tls: awaitingManagedReplay(),
        checks: [{ id: 'a-record' as const, ok: true, message: 'ok' }],
      }),
    },
  });
  await controller.hydrateOperatorRequest();
  await controller.verifyDns();
  assert.equal(controller.getState().dnsChecks?.length, 1);
  lanIp = '192.168.1.40';
  await controller.hydrateOperatorRequest();
  assert.equal(prepares, 2);
  assert.equal(controller.getState().dnsChecks, null);
  assert.equal(controller.getState().operatorRequest, null);
});

test('abandonSession discards an open TLS confirm callback', async () => {
  let applied = false;
  const pending = { confirm: null as (() => void) | null };
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: true }),
    requestConfirm: (_message, onConfirm) => {
      pending.confirm = onConfirm;
    },
    api: {
      applyHostTls: async () => {
        applied = true;
        return { tls: tls({ state: 'active', cutoverApplied: true, applyReady: true }) };
      },
    },
  });
  const applying = controller.apply();
  controller.abandonSession();
  pending.confirm?.();
  await applying;
  assert.equal(applied, false);
});

test('TLS host mutations do not start while LAN is mutating', async () => {
  let obtained = false;
  const controller = createController({
    status: tls({ state: 'dns-verified', mode: 'managed', applyReady: false }),
    isPeerMutating: () => true,
    api: {
      obtainHostTlsCertificate: async () => {
        obtained = true;
        return {
          tls: tls({ state: 'dns-verified', mode: 'managed', applyReady: true }),
          checks: [],
        };
      },
    },
  });
  await controller.obtainOrCheck();
  assert.equal(obtained, false);
  assert.equal(tlsNetworkLocksHost(controller.getState()), false);
});

for (const fails of [false, true]) {
  test(`departed TLS mutation stays locked through host refresh (${fails})`, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshing!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      refreshing = resolve;
    });
    let repairs = 0;
    let refreshed = 0;
    const controller = createController({
      status: tls({
        state: 'degraded',
        mode: 'managed',
        cutoverApplied: true,
        hostname: 'staff.example.test',
      }),
      api: {
        repairHostTls: async () => {
          repairs++;
          await gate;
          if (fails) throw new Error('old failure');
          return { tls: tls({ state: 'active' }), checks: [] };
        },
      },
      onAfterMutation: async () => {
        refreshed++;
        refreshing();
        await refreshGate;
        // Refresh failures must not strand the lock either.
        if (fails) throw new Error('refresh unavailable');
      },
    });
    const pending = controller.repair();
    controller.abandonSession();
    const departed = controller.getState();
    assert.equal(tlsNetworkLocksHost(departed), true);
    await controller.repair();
    assert.equal(repairs, 1);
    release();
    await refreshStarted;
    assert.equal(tlsNetworkLocksHost(controller.getState()), true);
    controller.abandonSession();
    await controller.repair();
    assert.equal(repairs, 1);
    releaseRefresh();
    await pending;
    assert.deepEqual(controller.getState(), { ...departed, action: { kind: 'idle' } });
    assert.equal(refreshed, 1);
    controller.patchDraft({ customDomain: 'new.example.test' });
    assert.equal(controller.getState().customDomain, 'new.example.test');
    await controller.repair();
    assert.equal(repairs, 2);
  });
}
