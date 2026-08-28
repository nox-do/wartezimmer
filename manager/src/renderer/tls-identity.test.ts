import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operatorZoneMailBody,
  tlsNameValid,
  tlsPrepareHostname,
} from './tls-identity.js';

test('tlsNameValid accepts generated and rejects reserved labels', () => {
  assert.equal(tlsNameValid({ nameMode: 'generated', customLabel: '', customDomain: '' }), true);
  assert.equal(tlsNameValid({ nameMode: 'label', customLabel: 'seidel', customDomain: '' }), true);
  assert.equal(tlsNameValid({ nameMode: 'label', customLabel: 'portal', customDomain: '' }), false);
  assert.equal(
    tlsNameValid({ nameMode: 'domain', customLabel: '', customDomain: 'flow.praxis-meyer.de' }),
    true,
  );
  assert.equal(
    tlsNameValid({ nameMode: 'domain', customLabel: '', customDomain: 'seidel.lan.notaus.de' }),
    false,
  );
});

test('tlsPrepareHostname omits generated names so Setup mints the label', () => {
  assert.equal(
    tlsPrepareHostname({ nameMode: 'generated', customLabel: '', customDomain: '' }),
    undefined,
  );
  assert.equal(
    tlsPrepareHostname({ nameMode: 'label', customLabel: 'Seidel', customDomain: '' }),
    'seidel.lan.notaus.de',
  );
});

test('operatorZoneMailBody redacts the token after consumption', () => {
  const consumed = operatorZoneMailBody({
    hostname: '7fk3m2.lan.notaus.de',
    lanIp: '192.168.178.112',
    installationId: '7fk3m2q9',
    token: 'secret-token',
    tokenConsumed: true,
    acmeCnameTarget: 'uuid.auth.acme-dns.io',
  });
  assert.equal(consumed.includes('secret-token'), false);
  assert.match(consumed, /bereits verwendet/);
  assert.match(consumed, /CNAME  uuid\.auth\.acme-dns\.io\./);
});
