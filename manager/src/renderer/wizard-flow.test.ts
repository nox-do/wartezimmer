import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import {
  canLeaveWizardStep1,
  createWizardFlowState,
  planWizardAdvance,
  previousWizardStep,
  wizardCompletionLead,
  wizardProbeFailureHint,
} from './wizard-flow.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/praxis',
    mode: 'dev',
    composeProjectName: 'pf-praxis',
    projectRoot: '/tmp/praxis',
    envExists: false,
    envPath: '/tmp/praxis/.env',
    practiceDisplayName: null,
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://127.0.0.1:8080',
    network: {
      configuredLanIp: null,
      currentLanCandidates: [],
      lanIpStale: false,
    },
    gateway: null,
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

test('previousWizardStep walks back through wizard steps', () => {
  assert.equal(previousWizardStep(1), 1);
  assert.equal(previousWizardStep(3), 2);
  assert.equal(previousWizardStep(7), 6);
});

test('canLeaveWizardStep1 requires docker and delivery images when busy is false', () => {
  const status = minimalStatus();
  assert.equal(canLeaveWizardStep1(status, false), true);
  assert.equal(
    canLeaveWizardStep1(
      minimalStatus({
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

test('planWizardAdvance validates LAN IP on step 2', () => {
  const state = createWizardFlowState(minimalStatus(), 2);
  assert.equal(planWizardAdvance(2, state).type, 'validate-error');
});

test('planWizardAdvance loads plan when leaving step 5', () => {
  const state = createWizardFlowState(minimalStatus(), 5);
  state.lanAppIp = '192.168.1.10';
  state.practiceDisplayName = 'Praxis';
  state.importsHostPath = '/imports';
  state.exportsHostPath = '/exports';
  assert.deepEqual(planWizardAdvance(5, state), {
    type: 'goto',
    step: 6,
    patch: { plan: null },
    after: 'loadPlan',
  });
});

test('planWizardAdvance validates gateway bridge URL on step 4', () => {
  const state = createWizardFlowState(minimalStatus(), 4);
  state.gatewayEnabled = true;
  state.gatewayInterface = 'eth1';
  state.authBridgeUrl = '10.0.0.2:9100';
  const action = planWizardAdvance(4, state);
  assert.equal(action.type, 'validate-error');
  assert.match(action.type === 'validate-error' ? action.message : '', /Gateway-Bridge-URL/);
});

test('planWizardAdvance prefills gateway bridge URL when entering step 4', () => {
  const state = createWizardFlowState(minimalStatus(), 3);
  state.lanAppIp = '192.168.1.10';
  state.practiceDisplayName = 'Praxis';
  state.gatewayEnabled = true;
  state.network = {
    interfaces: [],
    lanCandidates: [],
    defaultGatewayBridgeUrl: 'http://host.docker.internal:9100',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(planWizardAdvance(3, state), {
    type: 'goto',
    step: 4,
    patch: {
      portalAppIp: '192.168.1.10',
      authBridgeUrl: 'http://host.docker.internal:9100',
    },
  });
});

test('planWizardAdvance keeps explicit gateway bridge URL when entering step 4', () => {
  const state = createWizardFlowState(minimalStatus(), 3);
  state.lanAppIp = '192.168.1.10';
  state.practiceDisplayName = 'Praxis';
  state.gatewayEnabled = true;
  state.authBridgeUrl = 'http://10.0.0.2:9100';
  state.network = {
    interfaces: [],
    lanCandidates: [],
    defaultGatewayBridgeUrl: 'http://host.docker.internal:9100',
    gatewayComposeSupported: false,
  };

  assert.deepEqual(planWizardAdvance(3, state), {
    type: 'goto',
    step: 4,
    patch: {
      portalAppIp: '192.168.1.10',
    },
  });
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
    /WLAN/,
  );
  assert.equal(
    wizardProbeFailureHint([
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ]),
    null,
  );
});
