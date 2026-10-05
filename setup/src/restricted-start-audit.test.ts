import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runComposeAction } from './host-state.js';
import { startExistingInstallation } from './installation-start.js';
import type { ComposeStatus } from '@praxis-flow/server-shared';

for (const entry of ['start', 'restart', 'existing'] as const) {
  for (const outcome of [
    'valid',
    'unsafe-listener',
    'probe-throws',
    'unhealthy',
    'remove-fails',
    'closure-throws',
  ] as const) {
    test(`${entry}: ${outcome} audits the active patient listener and closes failures`, async (t) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-start-audit-'));
      t.after(() => fs.rmSync(home, { recursive: true, force: true }));
      fs.writeFileSync(
        path.join(home, '.env'),
        [
          'PROXY_ENABLED=true',
          'PROXY_MODE=tls-managed',
          'TLS_MODE=managed',
          'TLS_STATE=active',
          'TLS_CUTOVER_APPLIED=true',
          'TLS_WILDCARD_CERTIFICATE_NAME=*.example.test',
          'TLS_STAFF_HOSTNAME=staff.example.test',
          'TLS_PORTAL_HOSTNAME=portal.example.test',
          'SETUP_LAN_APP_IP=192.0.2.1',
          'APP_BIND_ADDRESS=127.0.0.1',
          'SETUP_RESTRICTED_ENABLED=true',
          'SETUP_RESTRICTED_APP_IP=192.0.2.2',
          'PRAXIS_FLOW_APP_IMAGE=app:test',
        ].join('\n'),
      );
      const running: ComposeStatus = {
        running: true,
        services: ['app', 'sandbox', 'proxy'].map((service) => ({
          name: service,
          service,
          state: 'running',
          health: outcome === 'unhealthy' && service === 'proxy' ? 'unhealthy' : 'healthy',
        })),
      };
      let probes = 0;
      let removed = 0;
      let stopped = 0;
      const hooks = {
        composePs: async () => running,
        composeUp: async () => ({ ok: true, log: '', gatewaySkipped: false }),
        composeRestart: async () => ({ ok: true, log: '' }),
        composeRemoveServices: async (_options: unknown, services: string[]) => {
          assert.deepEqual(services, ['proxy']);
          removed++;
          if (outcome === 'closure-throws') throw new Error('remove unavailable');
          return { ok: outcome !== 'remove-fails', log: '' };
        },
        composeStop: async () => {
          stopped++;
          if (outcome === 'closure-throws') throw new Error('stop unavailable');
          return { ok: true, log: '' };
        },
        auditStaffBindings: () =>
          ['app', 'sandbox', 'proxy'].map((service) => ({
            id: `staff.binding.${service}`,
            ok: true,
            message: 'correct publishes',
          })),
        auditListeners: async () => {
          probes++;
          if (outcome === 'probe-throws') throw new Error('TLS probe failed');
          return outcome === 'valid' ? null : 'Staff route reachable on patient listener';
        },
        stackHealthWaitOptions: { timeoutMs: 0 },
        inspectExistingAppDatabase: async () => ({ ok: true as const }),
      };
      const run = () =>
        entry === 'existing'
          ? startExistingInstallation(
              { projectRoot: home, composeProjectName: 'pf-test' },
              'app:test',
              {
                ...hooks,
                runDocker: async (args) => ({
                  code: 0,
                  stdout:
                    args[0] === 'image' ? 'image' : args[0] === 'volume' ? 'pf-test_app_data' : '',
                  stderr: '',
                }),
                inspectMaintenance: async () => ({
                  status: 'compatible',
                  authenticated: true,
                  compatible: true,
                  settingsFormatVersion: 1,
                  stackVersion: '1',
                }),
              },
            )
          : runComposeAction(
              { home, templateRoot: home, composeProjectName: 'pf-test', mode: 'install' },
              entry,
              undefined,
              hooks,
            );
      if (outcome === 'valid') {
        assert.equal((await run()).ok, true);
        assert.equal(removed, 0);
      } else {
        await assert.rejects(run, (error: unknown) => {
          assert.equal(
            (error as { code: string }).code,
            outcome === 'remove-fails' || outcome === 'closure-throws'
              ? 'restricted_start_closure_incomplete'
              : 'restricted_start_audit_failed',
          );
          return true;
        });
        assert.equal(removed, 1);
        assert.equal(stopped, outcome === 'remove-fails' || outcome === 'closure-throws' ? 1 : 0);
      }
      assert.equal(probes, outcome === 'unhealthy' ? 0 : 1);
    });
  }
}
