import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PortCheckRow } from '@wartezimmer/server-shared/setup-api';
import { bindingsOverlap, probeFreeBindings } from './port-check.js';
import { classifyPortFailure, publishedPortFailure } from './port-check-diagnostics.js';
import {
  storePortFailure,
  unreadPortFailures,
  acknowledgePortFailures,
  trackPortRecovery,
} from './port-check-history.js';
import { candidatePortEnv, parsePortRequest } from './port-check-plan.js';
import { testSetupContext } from './test-helpers/test-setup-context.js';

const patient = { hostIp: '192.168.0.83', publishedPort: 443, targetPort: 444, protocol: 'tcp' };
const dockerError =
  "ports are not available: exposing port TCP 192.168.0.83:443 -> 127.0.0.1:0: Cannot bind privileged port 443 on 192.168.0.83. Enable 'Allow privileged port forwarding to external machines' in Docker Desktop under Settings > Advanced.";

test('the two HTTPS bindings can each pass alone and fail in the joint Docker probe', async () => {
  const staffRow: PortCheckRow = {
    ...patient,
    hostIp: '192.168.0.100',
    targetPort: 443,
    label: 'Praxiszugang über HTTPS',
    state: 'checking',
  };
  const patientRow: PortCheckRow = {
    ...patient,
    label: 'Separater Patientenzugang',
    state: 'checking',
  };
  const owned: PortCheckRow = {
    ...staffRow,
    label: 'Lokale Wartung',
    hostIp: '127.0.0.1',
    publishedPort: 8082,
    targetPort: 8082,
    state: 'owned',
  };
  const stderr =
    'exposing port TCP 192.168.0.83:443 -> 127.0.0.1:0: listen tcp4 0.0.0.0:443: bind: address already in use';
  const calls: string[][] = [];
  let publishes: string[] = [];
  const docker = async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'run') {
      publishes = args.flatMap((arg, i) => (arg === '-p' ? [args[i + 1]!] : []));
      if (publishes.length > 1) return { code: 1, stdout: '', stderr };
    }
    const row = publishes[0] === '192.168.0.100:443:443/tcp' ? staffRow : patientRow;
    const ports = { [row.targetPort + '/tcp']: [{ HostIp: row.hostIp, HostPort: '443' }] };
    return { code: 0, stdout: args[0] === 'inspect' ? JSON.stringify(ports) : '', stderr: '' };
  };
  for (const row of [staffRow, patientRow]) {
    const alone = { ...row };
    await probeFreeBindings([alone], 'local-image', true, 'pf-test', docker);
    assert.equal(alone.state, 'verified');
  }
  calls.length = 0;
  await assert.rejects(
    probeFreeBindings([owned, staffRow, patientRow], 'local-image', true, 'pf-test', docker),
    /nicht gleichzeitig.*Praxiszugang.*Separater Patientenzugang/,
  );
  assert.deepEqual(publishes, ['192.168.0.100:443:443/tcp', '192.168.0.83:443:444/tcp']);
  assert.deepEqual(
    calls.map(([command]) => command),
    ['run', 'rm'],
  );
  assert.equal(calls[1]?.at(-1), calls[0]?.[calls[0].indexOf('--name') + 1]);
  assert.ok(calls[0]?.includes('de.wartezimmer.portcheck.project=pf-test'));
  assert.equal(patientRow.state, 'failed');
  assert.notEqual(staffRow.state, 'verified');
  assert.equal(owned.state, 'owned');
});

test('a Windows host listener is reported on the patient address, including when practice HTTPS is already running', async () => {
  for (const state of ['checking', 'owned'] as const) {
    const rows: PortCheckRow[] = [
      { ...patient, hostIp: '192.168.0.100', targetPort: 443, label: 'Praxis', state },
      { ...patient, label: 'Patientenzugang', state: 'checking' },
    ];
    const docker = async (args: string[]) => ({
      code: args[0] === 'run' ? 1 : 0,
      stdout: '',
      stderr:
        'exposing port TCP 192.168.0.83:443: Only one usage of each socket address is normally permitted.',
    });
    await assert.rejects(probeFreeBindings(rows, 'image', false, 'pf-test', docker), {
      message: /^Patientenzugang · 192\.168\.0\.83:443 ist bereits belegt\./,
    });
    assert.equal(rows[1]?.state, 'failed');
  }
});

test('a successful container start must confirm every mapping, including its protocol', async () => {
  const rows: PortCheckRow[] = ['tcp', 'udp'].map((protocol) => ({
    label: 'DNS',
    hostIp: '127.0.0.1',
    publishedPort: 9053,
    targetPort: 53,
    protocol,
    state: 'checking',
  }));
  const binding = [{ HostIp: '127.0.0.1', HostPort: '9053' }];
  const ports: Record<string, typeof binding> = { '53/tcp': binding };
  const docker = async (args: string[]) => ({
    code: 0,
    stdout: args[0] === 'inspect' ? JSON.stringify(ports) : '',
    stderr: '',
  });
  await assert.rejects(
    probeFreeBindings(rows, 'local-image', false, 'pf-test', docker),
    /9053\/udp/,
  );
  assert.equal(rows[1]?.state, 'failed');
  ports['53/udp'] = binding;
  const retry: PortCheckRow[] = rows.map((row) => ({ ...row, state: 'checking' }));
  await probeFreeBindings(retry, 'local-image', false, 'pf-test', docker);
  assert.ok(retry.every((row) => row.state === 'verified'));
});

test('only the explicit Mac LAN-port diagnostic opens the illustrated walkthrough', () => {
  assert.equal(classifyPortFailure(dockerError, patient, true).kind, 'mac-permission');
  for (const [diagnostic, expected] of [
    ['listen tcp: bind: address already in use', 'occupied'],
    ['cannot assign requested address', 'address'],
    ['permission denied', 'permission'],
    ['ports are not available', 'technical'],
  ]) {
    assert.equal(classifyPortFailure(diagnostic!, patient, true).kind, expected);
  }
  for (const hostIp of ['127.0.0.1', '0.0.0.0', '::1']) {
    assert.equal(classifyPortFailure(dockerError, { ...patient, hostIp }, true).kind, 'permission');
  }
  assert.equal(classifyPortFailure(dockerError, patient, false, 'win32').kind, 'permission');
  assert.equal(
    classifyPortFailure(dockerError, { ...patient, publishedPort: 8443 }, true).kind,
    'permission',
  );
});
test('Windows bind diagnostics distinguish socket errors from the published port number', () => {
  const endpoint = 'listen tcp 192.168.0.83:10048: bind: ';
  for (const [reason, expected] of [
    ['WSAEACCES (10013)', 'permission'],
    ['WSAEADDRINUSE (10048)', 'occupied'],
    ['WSAEADDRNOTAVAIL (10049)', 'address'],
    ['Zugriff wegen der Zugriffsrechte des Sockets unzulässig.', 'permission'],
    ['Jede Socketadresse darf nur jeweils einmal verwendet werden.', 'occupied'],
    ['Die angeforderte Adresse ist in diesem Kontext ungültig.', 'address'],
    ['The requested address is not valid in its context.', 'address'],
    ['unknown Docker failure', 'technical'],
  ] as const) {
    const diagnostic = endpoint + reason;
    const report = publishedPortFailure(diagnostic, 'win32');
    assert.equal(report?.error?.kind, expected, reason);
    assert.equal(report.error.detail, diagnostic);
  }
});
test('Linux bind diagnostics name the requested port and give a rootless hint for low ports', () => {
  const report = publishedPortFailure(
    'failed to bind host port 192.168.0.83:443/udp: permission denied',
    'linux',
  );
  assert.equal(report?.error?.kind, 'permission');
  assert.match(report.error.message, /192\.168\.0\.83:443.*Rootless/);
});
test('classifies host ownership by address, host port and protocol', () => {
  assert.equal(
    bindingsOverlap(patient, { ...patient, hostIp: '192.168.0.100', targetPort: 443 }),
    false,
  );
  assert.equal(bindingsOverlap(patient, { ...patient, hostIp: '0.0.0.0' }), true);
  assert.equal(bindingsOverlap(patient, { ...patient, protocol: 'udp' }), false);
  assert.equal(bindingsOverlap(patient, { ...patient, publishedPort: 8443 }), false);
});
test('keeps the publish diagnostic and rollback result until that report is acknowledged', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-port-report-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const report = publishedPortFailure('irrelevant stdout\n' + dockerError, 'darwin')!;
  assert.equal(report.error?.kind, 'mac-permission');
  assert.equal(publishedPortFailure('cannot find compose image'), undefined);
  assert.ok(!JSON.stringify(report).includes('irrelevant stdout'));
  storePortFailure(home, report);
  const recordRecovery = trackPortRecovery(home, [dockerError]);
  const second = publishedPortFailure(dockerError, 'darwin')!;
  storePortFailure(home, second);
  recordRecovery(true);
  assert.equal(unreadPortFailures(home).find((r) => r.id === second.id)?.recovery, undefined);
  assert.equal(unreadPortFailures(home).find((r) => r.id === report.id)?.recovery, 'restored');
  acknowledgePortFailures(home, [second.id]);
  assert.deepEqual(
    unreadPortFailures(home).map((r) => r.id),
    [report.id],
  );
  assert.throws(() => acknowledgePortFailures(home, ['../other']));
});
test('target computation prepares the actual TLS port and keeps the patient IP separate', () => {
  const ctx = testSetupContext('/unused');
  const base = new Map(
    Object.entries({
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      TLS_STATE: 'off',
      PROXY_HTTPS_PORT: '9443',
      SETUP_LAN_APP_IP: '192.168.0.100',
      SETUP_RESTRICTED_APP_IP: patient.hostIp,
    }),
  );
  const tls = candidatePortEnv(ctx, { kind: 'tls-prepare' }, base);
  assert.equal(tls.get('PROXY_HTTPS_PORT'), '443');
  const restricted = candidatePortEnv(ctx, { kind: 'patient-enable' }, tls);
  assert.equal(restricted.get('SETUP_RESTRICTED_ENABLED'), 'true');
  assert.equal(restricted.get('SETUP_RESTRICTED_APP_IP'), patient.hostIp);
  assert.equal(base.get('PROXY_HTTPS_PORT'), '9443');
  assert.throws(() =>
    parsePortRequest({
      kind: 'network',
      network: { lanAppIp: '192.168.0.100', proxy: { enabled: true, httpPort: 70000 } },
    }),
  );
});

for (const retestFails of [true, false]) {
  test(
    'replacement checks a formerly occupied binding before reset, retest failure=' + retestFails,
    async (t) => {
      const { checkBeforeInstallReset } = await import('./install-port-cutover.js');
      const { createPreparedInstallOperation } = await import('./install-operation.js');
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-port-cutover-'));
      t.after(() => fs.rmSync(home, { recursive: true, force: true }));
      const op = createPreparedInstallOperation({
        home,
        mode: 'replace',
        sha256: 'f'.repeat(64),
        releaseVersion: 'test',
      });
      const id = 'a'.repeat(64);
      const calls: string[] = [];
      let running = true;
      let orphanedProbe = retestFails;
      const ctx = {
        ...testSetupContext(home),
        checkPorts: async () => {
          calls.push('check');
          const failure = !running && retestFails;
          return {
            id: '00000000-1111-4111-8111-111111111111',
            at: new Date().toISOString(),
            rows: [
              {
                ...patient,
                label: 'Patienten',
                state: running
                  ? ('owned' as const)
                  : failure
                    ? ('failed' as const)
                    : ('verified' as const),
              },
            ],
            ...(failure
              ? { error: { kind: 'mac-permission' as const, message: 'Port gesperrt' } }
              : {}),
          };
        },
      };
      const run = () =>
        checkBeforeInstallReset(
          ctx,
          op.id,
          [{ env: new Map() }],
          true,
          () => {
            calls.push('confirmed');
          },
          async (args) => {
            calls.push(args[0]!);
            if (args[0] === 'ps' && args.includes('-aq')) {
              assert.ok(args.includes('label=de.wartezimmer.portcheck.project=pf-test'));
              const stdout = orphanedProbe ? 'previous-probe' : '';
              orphanedProbe = false;
              return { code: 0, stdout, stderr: '' };
            }
            if (args[0] === 'stop') running = false;
            if (args[0] === 'start') running = true;
            const stdout =
              args[0] === 'ps' && args.includes('--no-trunc')
                ? id
                : args[0] === 'inspect'
                  ? args[2]?.includes('compose.project')
                    ? 'pf-test ' + running
                    : 'true healthy'
                  : '';
            return { code: 0, stdout, stderr: '' };
          },
        );
      if (retestFails) {
        await assert.rejects(run(), /Port gesperrt/);
        assert.deepEqual(calls, [
          'check',
          'ps',
          'stop',
          'check',
          'ps',
          'ps',
          'inspect',
          'start',
          'inspect',
        ]);
        assert.equal(unreadPortFailures(home)[0]?.recovery, 'restored');
      } else {
        await run();
        assert.deepEqual(calls, ['check', 'ps', 'stop', 'check', 'confirmed']);
      }
    },
  );
}
