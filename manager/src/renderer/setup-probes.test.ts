import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProbeResult } from '../shared/host-status.js';
import { buildSetupProbeInput, connectionProbesReady, pollSetupProbes } from './setup-probes.js';

test('connectionProbesReady requires local probe and optional lan probe', () => {
  const okLocal: ProbeResult[] = [
    { id: 'app.health.local', ok: true, message: 'ok' },
    { id: 'app.health.lan', ok: true, message: 'ok' },
  ];
  assert.equal(connectionProbesReady(okLocal), true);

  const localOnly: ProbeResult[] = [{ id: 'app.health.local', ok: true, message: 'ok' }];
  assert.equal(connectionProbesReady(localOnly), true);

  const localFail: ProbeResult[] = [
    { id: 'app.health.local', ok: false, message: 'down' },
    { id: 'app.health.lan', ok: true, message: 'ok' },
  ];
  assert.equal(connectionProbesReady(localFail), false);

  const lanFail: ProbeResult[] = [
    { id: 'app.health.local', ok: true, message: 'ok' },
    { id: 'app.health.lan', ok: false, message: 'down' },
  ];
  assert.equal(connectionProbesReady(lanFail), false);
});

test('buildSetupProbeInput prefers canonical / deviceUrls over raw LAN IP', () => {
  assert.deepEqual(
    buildSetupProbeInput({
      network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: 'http://praxis-flow.local:8080',
      deviceUrls: {
        appBaseUrl: 'http://praxis-flow.local:8080',
        terminal: '',
        mfa: '',
        tv: '',
        ops: '',
        opsSetup: '',
        portal: '',
      },
    }),
    {
      localAppBaseUrl: 'http://127.0.0.1:8080',
      lanAppBaseUrl: 'http://praxis-flow.local:8080',
    },
  );
  assert.deepEqual(
    buildSetupProbeInput({
      network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
    }),
    {
      localAppBaseUrl: 'http://127.0.0.1:8080',
      lanAppBaseUrl: 'http://192.168.1.10:8080',
    },
  );
});

test('buildSetupProbeInput omits LAN probe when only local appBaseUrl fallback would apply', () => {
  assert.deepEqual(
    buildSetupProbeInput({
      network: { configuredLanIp: null, currentLanCandidates: [], lanIpStale: false },
      configuredCanonicalBaseUrl: null,
      deviceUrls: null,
    }),
    {
      localAppBaseUrl: 'http://127.0.0.1:8080',
      lanAppBaseUrl: undefined,
    },
  );
});

test('pollSetupProbes retries until probes are ready', async () => {
  let calls = 0;
  const api = {
    runSetupProbes: async () => {
      calls += 1;
      if (calls < 3) {
        return { probes: [{ id: 'app.health.local', ok: false, message: 'down' }] };
      }
      return { probes: [{ id: 'app.health.local', ok: true, message: 'ok' }] };
    },
  };

  const probes = await pollSetupProbes(
    api,
    { localAppBaseUrl: 'http://127.0.0.1:8080' },
    {
      intervalMs: 5,
      maxWaitMs: 100,
    },
  );

  assert.equal(calls, 3);
  assert.equal(connectionProbesReady(probes), true);
});

test('pollSetupProbes returns last snapshot when deadline passes', async () => {
  const api = {
    runSetupProbes: async () => ({
      probes: [{ id: 'app.health.local', ok: false, message: 'still down' }],
    }),
  };

  const probes = await pollSetupProbes(
    api,
    { localAppBaseUrl: 'http://127.0.0.1:8080' },
    {
      intervalMs: 5,
      maxWaitMs: 12,
    },
  );

  assert.equal(probes[0]?.ok, false);
});

test('pollSetupProbes with requireLan false waits briefly for LAN after local ok', async () => {
  let calls = 0;
  const api = {
    runSetupProbes: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          probes: [
            { id: 'app.health.local', ok: false, message: 'down' },
            { id: 'app.health.lan', ok: false, message: 'down' },
          ],
        };
      }
      if (calls < 4) {
        return {
          probes: [
            { id: 'app.health.local', ok: true, message: 'ok' },
            { id: 'app.health.lan', ok: false, message: 'down' },
          ],
        };
      }
      return {
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: true, message: 'ok' },
        ],
      };
    },
  };

  const probes = await pollSetupProbes(
    api,
    { localAppBaseUrl: 'http://127.0.0.1:8080', lanAppBaseUrl: 'http://192.168.1.10' },
    {
      requireLan: false,
      lanGraceMs: 40,
      intervalMs: 5,
      maxWaitMs: 200,
    },
  );

  assert.ok(calls >= 3);
  assert.equal(connectionProbesReady(probes), true);
});

test('pollSetupProbes with requireLan false returns LAN red after grace', async () => {
  let calls = 0;
  const api = {
    runSetupProbes: async () => {
      calls += 1;
      return {
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: false, message: 'down' },
        ],
      };
    },
  };

  const started = Date.now();
  const probes = await pollSetupProbes(
    api,
    { localAppBaseUrl: 'http://127.0.0.1:8080', lanAppBaseUrl: 'http://192.168.1.10' },
    {
      requireLan: false,
      lanGraceMs: 25,
      intervalMs: 5,
      maxWaitMs: 200,
    },
  );
  const elapsed = Date.now() - started;

  assert.ok(calls >= 2);
  assert.ok(elapsed >= 20);
  assert.equal(probes.find((probe) => probe.id === 'app.health.lan')?.ok, false);
});
