import assert from 'node:assert/strict';
import test from 'node:test';
import type { TlsPrepareInput, TlsStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { createTlsNetworkController } from './tls-network-controller.js';
import { TLS_CUTOVER_CONFIRM_MESSAGE } from './tls-network-view-model.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';

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
  api?: Partial<PraxisManagerApi>;
  status: TlsStatus;
  lanIp?: string;
  requestConfirm?: (message: string, onConfirm: () => void) => void;
}) {
  return createTlsNetworkController({
    api: options.api as PraxisManagerApi,
    getConfig: () =>
      minimalHostStatus({
        tls: options.status,
        proxy: {
          enabled: true,
          mode: 'http',
          canonicalBaseUrl: 'http://192.168.1.10',
          httpPort: 80,
          appBindAddress: '127.0.0.1',
          container: null,
        },
      }),
    lanIp: () => options.lanIp ?? '192.168.1.10',
    onAfterMutation: async () => {},
    onStateChange: () => {},
    requestConfirm: options.requestConfirm ?? ((_message, onConfirm) => onConfirm()),
  });
}

test('submitLease prepares managed TLS without a client-minted hostname', async () => {
  let prepared: TlsPrepareInput | null = null;
  const controller = createController({
    status: tls({ state: 'off' }),
    api: {
      prepareHostTls: async (body: TlsPrepareInput) => {
        prepared = body;
        return {
          tls: tls({
            state: 'awaiting-operator-dns',
            mode: 'managed',
            hostname: '7fk3m2.lan.notaus.de',
            installationId: '7fk3m2q9',
            acmeCnameTarget: 'uuid.auth.acme-dns.io',
          }),
          operatorRequest: {
            installationId: '7fk3m2q9',
            oneTimeToken: 'once',
            aRecord: { name: '7fk3m2.lan.notaus.de', value: '192.168.1.10' },
            acmeCname: { name: '_acme-challenge.7fk3m2.lan.notaus.de', value: 'uuid.auth.acme-dns.io' },
          },
        };
      },
    },
  });

  controller.patchDraft({ ipv4Reserved: true, nameMode: 'generated' });
  await controller.submitLease();
  assert.deepEqual(prepared, { mode: 'managed', hostname: undefined, lanIp: '192.168.1.10' });
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'once');
});

test('hydrateOperatorRequest replays prepare to recover the unused token', async () => {
  const controller = createController({
    status: tls({
      state: 'awaiting-operator-dns',
      mode: 'managed',
      hostname: '7fk3m2.lan.notaus.de',
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
            hostname: '7fk3m2.lan.notaus.de',
          }),
          operatorRequest: {
            installationId: '7fk3m2q9',
            oneTimeToken: 'replayed',
            aRecord: { name: '7fk3m2.lan.notaus.de', value: '192.168.1.10' },
            acmeCname: { name: '_acme-challenge.7fk3m2.lan.notaus.de', value: 'uuid.auth.acme-dns.io' },
          },
        };
      },
    },
  });

  await controller.hydrateOperatorRequest();
  assert.equal(controller.getState().operatorRequest?.oneTimeToken, 'replayed');
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
