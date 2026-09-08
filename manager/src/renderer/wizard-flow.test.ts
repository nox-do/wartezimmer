import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { TLS_LEASE_STALE_LAN_COPY } from './tls-network-view-model.js';
import {
  buildWizardPlanInput,
  canLeaveWizardStep1,
  createWizardFlowState,
  DISABLED_GATEWAY_PLAN,
  planWizardAdvance,
  planWizardBack,
  previousWizardStep,
  wizardCompletionLead,
  wizardHttpsPrepared,
  wizardUsesExistingTlsConfiguration,
  wizardProbeFailureHint,
} from './wizard-flow.js';

function activeTlsStatus() {
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

test('previousWizardStep walks back through wizard steps', () => {
  assert.equal(previousWizardStep(1), 1);
  assert.equal(previousWizardStep(3), 1);
  assert.equal(previousWizardStep(8), 7);
});

test('canLeaveWizardStep1 requires docker, network prerequisites and delivery images', () => {
  const status = minimalHostStatus();
  assert.equal(canLeaveWizardStep1(status, false), true);
  assert.equal(
    canLeaveWizardStep1(
      minimalHostStatus({
        deliveryImages: {
          required: true,
          configured: false,
          appImage: null,
          sandboxImage: null,
          releaseVersion: null,
          archiveSha256: null,
          appPresent: false,
          sandboxPresent: false,
          ready: false,
        },
      }),
      false,
    ),
    false,
  );
});

test('canLeaveWizardStep1 blocks when network prerequisites fail', () => {
  assert.equal(
    canLeaveWizardStep1(
      minimalHostStatus({
        networkPrerequisites: [
          {
            id: 'preflight.app-port',
            ok: false,
            message: 'Port 8080 ist bereits belegt. Praxis Flow kann die App so nicht starten.',
            detail: 'Belegt durch: Docker-Container other-app',
          },
        ],
      }),
      false,
    ),
    false,
  );
  assert.equal(
    canLeaveWizardStep1(
      minimalHostStatus({
        networkPrerequisites: [],
      }),
      false,
    ),
    false,
  );
});

test('planWizardAdvance leaves prerequisites for folders', () => {
  const state = createWizardFlowState(freshInstallHostStatus(), 1);
  assert.deepEqual(planWizardAdvance(1, state), { type: 'goto', step: 3 });
});

test('planWizardAdvance validates folders on step 3', () => {
  const state = createWizardFlowState(minimalHostStatus(), 3);
  state.importsHostPath = '';
  state.exportsHostPath = '';
  assert.equal(planWizardAdvance(3, state).type, 'validate-error');
});

test('planWizardAdvance loads network when leaving folders', () => {
  const state = createWizardFlowState(minimalHostStatus(), 3);
  state.importsHostPath = '/imports';
  state.exportsHostPath = '/exports';
  assert.deepEqual(planWizardAdvance(3, state), {
    type: 'goto',
    step: 4,
    after: 'loadNetwork',
  });
});

test('planWizardAdvance validates LAN IP on network step 4', () => {
  const state = createWizardFlowState(freshInstallHostStatus(), 4);
  assert.equal(planWizardAdvance(4, state).type, 'validate-error');
});

test('planWizardAdvance advances from network to access when LAN and reachability are set', () => {
  const state = createWizardFlowState(minimalHostStatus(), 4);
  state.lanAppIp = '192.168.1.10';
  state.reachabilityMode = 'lan-ip';
  assert.deepEqual(planWizardAdvance(4, state), { type: 'goto', step: 5 });
});

test('planWizardAdvance rejects hostname reachability without network snapshot', () => {
  const state = createWizardFlowState(minimalHostStatus(), 4);
  state.lanAppIp = '192.168.1.10';
  state.reachabilityMode = 'hostname';
  assert.equal(planWizardAdvance(4, state).type, 'validate-error');
});

test('planWizardAdvance skips HTTPS without proxy and loads the plan', () => {
  const state = createWizardFlowState(minimalHostStatus(), 5);
  assert.equal(state.proxyEnabled, false);
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance enters HTTPS when proxy is on', () => {
  const state = createWizardFlowState(minimalHostStatus(), 5);
  state.proxyEnabled = true;
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 6,
    patch: { httpsPhase: 'offer' },
  });
});

test('planWizardAdvance skips prepare when HTTPS is deferred', () => {
  const state = createWizardFlowState(minimalHostStatus(), 6);
  state.proxyEnabled = true;
  state.httpsOfferChoice = 'later';
  assert.deepEqual(planWizardAdvance(6, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance walks HTTPS phases and prepares after the lease', () => {
  const state = createWizardFlowState(minimalHostStatus(), 6);
  state.proxyEnabled = true;
  assert.deepEqual(planWizardAdvance(6, state), { type: 'https-phase', phase: 'hostname' });

  state.httpsPhase = 'hostname';
  state.nameMode = 'label';
  state.customLabel = 'portal';
  assert.equal(planWizardAdvance(6, state).type, 'validate-error');

  state.customLabel = 'muster';
  assert.deepEqual(planWizardAdvance(6, state), { type: 'https-phase', phase: 'lease' });

  state.httpsPhase = 'lease';
  assert.equal(planWizardAdvance(6, state).type, 'validate-error');

  state.ipv4Reserved = true;
  assert.deepEqual(planWizardAdvance(6, state), {
    type: 'https-phase',
    phase: 'mail',
    after: 'prepareTls',
  });

  state.httpsPhase = 'mail';
  assert.equal(planWizardAdvance(6, state).type, 'validate-error');

  state.mailAck = true;
  assert.deepEqual(planWizardAdvance(6, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance blocks HTTPS lease while LAN IP is stale', () => {
  const state = createWizardFlowState(
    minimalHostStatus({
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.40', interfaceName: 'en0' }],
        lanIpStale: true,
      },
    }),
    6,
  );
  state.proxyEnabled = true;
  state.httpsPhase = 'lease';
  state.ipv4Reserved = true;
  const action = planWizardAdvance(6, state);
  assert.equal(action.type, 'validate-error');
  if (action.type === 'validate-error') {
    assert.equal(action.message, TLS_LEASE_STALE_LAN_COPY);
  }
});

test('planWizardBack returns to mail only after TLS is prepared', () => {
  const checkboxOnly = createWizardFlowState(minimalHostStatus(), 7);
  checkboxOnly.ipv4Reserved = true;
  checkboxOnly.proxyEnabled = true;
  assert.equal(wizardHttpsPrepared(checkboxOnly.status), false);
  assert.deepEqual(planWizardBack(checkboxOnly), { type: 'goto', step: 6 });

  const prepared = createWizardFlowState(
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
    7,
  );
  prepared.proxyEnabled = true;
  assert.deepEqual(planWizardBack(prepared), { type: 'https-phase', phase: 'mail' });
});

test('planWizardBack skips HTTPS without proxy', () => {
  const state = createWizardFlowState(minimalHostStatus(), 7);
  state.proxyEnabled = false;
  state.ipv4Reserved = true;
  assert.deepEqual(planWizardBack(state), { type: 'goto', step: 5 });
});

test('planWizardBack keeps mail after prepare even if the proxy draft is off', () => {
  const state = createWizardFlowState(
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
    7,
  );
  state.proxyEnabled = false;
  assert.deepEqual(planWizardBack(state), { type: 'https-phase', phase: 'mail' });
});

test('planWizardAdvance applies when leaving preview step 7', () => {
  const state = createWizardFlowState(minimalHostStatus(), 7);
  assert.deepEqual(planWizardAdvance(7, state), {
    type: 'goto',
    step: 8,
    patch: { applyResult: null },
    after: 'apply-and-refresh',
  });
});

test('active TLS configuration bypasses preview generation and setup apply', () => {
  const state = createWizardFlowState(activeTlsStatus(), 5);

  assert.equal(wizardUsesExistingTlsConfiguration(state.status), true);
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
  });

  state.step = 7;
  assert.deepEqual(planWizardAdvance(7, state), {
    type: 'goto',
    step: 8,
    patch: { applyResult: null },
  });
});

test('buildWizardPlanInput always disables gateway', () => {
  const state = createWizardFlowState(minimalHostStatus(), 3);
  state.lanAppIp = '192.168.1.10';
  const input = buildWizardPlanInput(state);
  assert.deepEqual(input.gateway, DISABLED_GATEWAY_PLAN);
  assert.equal(input.gateway.enabled, false);
  assert.equal('practiceDisplayName' in input, false);
});

test('wizardCompletionLead celebrates when probes are green', () => {
  assert.match(
    wizardCompletionLead([
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ]),
    /abgeschlossen/,
  );
});

test('wizardCompletionLead explains startup delay when local probe fails', () => {
  assert.match(
    wizardCompletionLead([{ id: 'app.health.local', ok: false, message: 'down' }]),
    /noch nicht/,
  );
});

test('wizardProbeFailureHint distinguishes local startup from LAN issues', () => {
  assert.match(
    wizardProbeFailureHint([{ id: 'app.health.local', ok: false, message: 'down' }]) ?? '',
    /30–60 Sekunden/,
  );
  assert.match(
    wizardProbeFailureHint([
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: false, message: 'down' },
    ]) ?? '',
    /Erreichbarkeit|Netzwerk/,
  );
  assert.equal(
    wizardProbeFailureHint([
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ]),
    null,
  );
});
