import { draftCanonicalBaseUrl } from './reachability.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  buildWizardApplyInput,
  buildWizardPlanInput,
  canLeaveWizardStep1,
  createWizardFlowState,
  DISABLED_GATEWAY_PLAN,
  planWizardAdvance,
  planWizardBack,
  previousWizardStep,
  wizardCompletionLead,
  wizardPreservesExistingEnvironment,
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
  assert.equal(previousWizardStep(5), 3);
});

test('canLeaveWizardStep1 requires docker and delivery images', () => {
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

test('canLeaveWizardStep1 allows installation without a separate port preflight', () => {
  assert.equal(canLeaveWizardStep1(minimalHostStatus({ networkPrerequisites: [] }), false), true);
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
    step: 5,
    after: 'loadNetwork',
  });
});

test('planWizardAdvance validates LAN IP on combined access step', () => {
  const state = createWizardFlowState(freshInstallHostStatus(), 5);
  assert.equal(planWizardAdvance(5, state).type, 'validate-error');
});

test('combined access step proceeds directly to preview without proxy', () => {
  const state = createWizardFlowState(minimalHostStatus(), 5);
  state.lanAppIp = '192.168.1.10';
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance proceeds directly to preview with proxy on', () => {
  const state = createWizardFlowState(minimalHostStatus(), 5);
  state.proxyEnabled = true;
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 7,
    patch: { plan: null },
    after: 'loadPlan',
  });
});
test('planWizardBack returns from preview to access', () => {
  const state = createWizardFlowState(minimalHostStatus(), 7);
  assert.deepEqual(planWizardBack(state), { type: 'goto', step: 5 });
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

test('fresh and replace operations do not preserve the staged template environment', () => {
  const status = minimalHostStatus({ envExists: true });
  const fresh = {
    ...createWizardFlowState(status, 7),
    operation: { mode: 'fresh' },
  };
  const replace = {
    ...createWizardFlowState(status, 7),
    operation: { mode: 'replace' },
  };
  assert.equal(wizardPreservesExistingEnvironment(fresh), false);
  assert.equal(wizardPreservesExistingEnvironment(replace), false);
  assert.equal(buildWizardApplyInput(fresh).preserveEnv, false);
  assert.equal(buildWizardApplyInput(replace).preserveEnv, false);
});

test('ordinary setup preserves a real existing environment', () => {
  const state = createWizardFlowState(minimalHostStatus({ envExists: true }), 7);
  assert.equal(wizardPreservesExistingEnvironment(state), true);
  assert.equal(buildWizardApplyInput(state).preserveEnv, true);
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

for (const proxyEnabled of [false, true]) {
  test(`new setup derives device address from IP with proxy ${proxyEnabled}`, () => {
    const state = createWizardFlowState(freshInstallHostStatus(), 5);
    state.lanAppIp = '192.168.1.25';
    state.proxyEnabled = proxyEnabled;
    state.network = {
      interfaces: [],
      lanCandidates: [],
      machineHostname: 'some-computer',
      gatewayComposeSupported: false,
    };
    assert.equal(
      draftCanonicalBaseUrl(state, state.status),
      proxyEnabled ? 'http://192.168.1.25' : 'http://192.168.1.25:8080',
    );
  });
}

test('network discovery preserves an existing HTTP name when the computer name changes', () => {
  const state = createWizardFlowState(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://practice-server:8080',
    }),
    5,
  );
  state.lanAppIp = '192.168.1.25';
  for (const machineHostname of ['practice-server', 'renamed-server']) {
    state.network = {
      interfaces: [],
      lanCandidates: [],
      machineHostname,
      gatewayComposeSupported: false,
    };
    assert.equal(draftCanonicalBaseUrl(state, state.status), 'http://practice-server:8080');
  }
});
