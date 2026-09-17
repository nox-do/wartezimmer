import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditRestrictedListeners,
  type RestrictedHttpsProbe,
} from './restricted-listener-probe.js';

const input = {
  staffIp: '192.168.10.10',
  restrictedIp: '10.20.0.2',
  staffHostname: 'staff.installation.example',
  portalHostname: 'portal.installation.example',
};
const correct: RestrictedHttpsProbe = async (_ip, _sni, path, options) => {
  if (options?.negative) return { status: null, error: 'reset', transport: 'rejected' };
  if (path === '/' || path === '/portal' || path.startsWith('/portal/'))
    return { status: 200, error: null };
  return { status: 404, error: null, rejection: 'portal-policy' };
};
test('audit checks independent Host/SNI, no SNI and forbidden path/method classes', async () => {
  const calls: Parameters<RestrictedHttpsProbe>[] = [];
  assert.equal(
    await auditRestrictedListeners(input, async (...args) => {
      calls.push(args);
      return correct(...args);
    }),
    null,
  );
  assert.ok(calls.some((c) => c[1] === '' && c[3]?.host === input.portalHostname));
  assert.ok(calls.some((c) => c[1] === input.portalHostname && c[3]?.host !== c[1]));
  assert.ok(calls.some((c) => c[2].endsWith('/verify-ticket-code') && c[3]?.method === 'POST'));
  assert.ok(calls.some((c) => c[2] === '/api/not-allowed'));
  assert.ok(calls.some((c) => c[3]?.method === 'DELETE'));
});
test('arbitrary HTTP errors never prove rejection', async () => {
  for (const status of [401, 404, 421, 500]) {
    let count = 0;
    assert.notEqual(
      await auditRestrictedListeners(input, async () => ({
        status: ++count <= 2 ? 200 : status,
        error: null,
      })),
      null,
    );
  }
});
test('timeouts and certificate failures do not prove server rejection', async () => {
  assert.notEqual(
    await auditRestrictedListeners(input, async (...args) =>
      args[3]?.negative
        ? { status: null, error: 'timeout', transport: 'failed' }
        : correct(...args),
    ),
    null,
  );
});
test('an application 404 without the proxy marker fails the path audit', async () => {
  assert.notEqual(
    await auditRestrictedListeners(input, async (...args) => {
      const result = await correct(...args);
      return { ...result, rejection: undefined };
    }),
    null,
  );
});

test('all Staff probes use the configured HTTPS port while Restricted stays on 443', async () => {
  const calls: Parameters<RestrictedHttpsProbe>[] = [];
  assert.equal(
    await auditRestrictedListeners({ ...input, staffHttpsPort: 8443 }, async (...args) => {
      calls.push(args);
      return correct(...args);
    }),
    null,
  );
  for (const call of calls) assert.equal(call[3]?.port, call[0] === input.staffIp ? 8443 : 443);
});
