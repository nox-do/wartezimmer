import assert from 'node:assert/strict';
import test from 'node:test';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  buildWizardPlanInput,
  canLeaveWizardStep1,
  createWizardFlowState,
  DISABLED_GATEWAY_PLAN,
  planWizardAdvance,
  previousWizardStep,
  wizardCompletionLead,
  wizardProbeFailureHint,
} from './wizard-flow.js';

test('previousWizardStep walks back through wizard steps', () => {
  assert.equal(previousWizardStep(1), 1);
  assert.equal(previousWizardStep(3), 2);
  assert.equal(previousWizardStep(7), 6);
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

test('planWizardAdvance leaves prerequisites for routing', () => {
  const state = createWizardFlowState(freshInstallHostStatus(), 1);
  assert.deepEqual(planWizardAdvance(1, state), { type: 'goto', step: 2 });
});

test('planWizardAdvance advances from routing to folders', () => {
  const state = createWizardFlowState(minimalHostStatus(), 2);
  assert.deepEqual(planWizardAdvance(2, state), { type: 'goto', step: 3 });
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

test('planWizardAdvance loads plan when leaving access step 5', () => {
  const state = createWizardFlowState(minimalHostStatus(), 5);
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 6,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance applies when leaving preview step 6', () => {
  const state = createWizardFlowState(minimalHostStatus(), 6);
  assert.deepEqual(planWizardAdvance(6, state), {
    type: 'goto',
    step: 7,
    patch: { applyResult: null },
    after: 'apply-and-refresh',
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
