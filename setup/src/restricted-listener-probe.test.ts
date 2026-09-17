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

test('listener audit accepts only the intended hostname on each address', async () => {
  const probe: RestrictedHttpsProbe = async (ip, hostname) => ({
    status:
      (ip === input.staffIp && hostname === input.staffHostname) ||
      (ip === input.restrictedIp && hostname === input.portalHostname)
        ? 200
        : 404,
    error: null,
  });
  assert.equal(await auditRestrictedListeners(input, probe), null);
});

test('listener audit rejects a cross-origin exposure', async () => {
  const probe: RestrictedHttpsProbe = async () => ({ status: 200, error: null });
  assert.match(
    (await auditRestrictedListeners(input, probe)) ?? '',
    /Staff-Hostname.*Restricted-IP/,
  );
});
