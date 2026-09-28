import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operatorZoneMailBody,
  tlsNameValid,
  tlsPrepareHostname,
  practiceDnsBody,
  tlsModeForNameMode,
  tlsUsesOperatorDns,
} from './tls-identity.js';

test('tlsNameValid accepts generated and rejects reserved labels', () => {
  assert.equal(tlsNameValid({ nameMode: 'generated', customLabel: '', customDomain: '' }), true);
  assert.equal(tlsNameValid({ nameMode: 'label', customLabel: 'muster', customDomain: '' }), true);
  assert.equal(tlsNameValid({ nameMode: 'label', customLabel: 'portal', customDomain: '' }), false);
  assert.equal(tlsNameValid({ nameMode: 'label', customLabel: 'staff', customDomain: '' }), false);
  assert.equal(
    tlsNameValid({ nameMode: 'domain', customLabel: '', customDomain: 'flow.praxis-meyer.de' }),
    true,
  );
  assert.equal(
    tlsNameValid({ nameMode: 'domain', customLabel: '', customDomain: 'muster.lan.notaus.de' }),
    false,
  );
  assert.equal(
    tlsNameValid({ nameMode: 'domain', customLabel: '', customDomain: 'lan.notaus.de' }),
    false,
  );
});

test('tlsPrepareHostname omits generated names so Setup mints the label', () => {
  assert.equal(
    tlsPrepareHostname({ nameMode: 'generated', customLabel: '', customDomain: '' }),
    undefined,
  );
  assert.equal(
    tlsPrepareHostname({ nameMode: 'label', customLabel: 'Muster', customDomain: '' }),
    'muster.lan.notaus.de',
  );
});

test('operatorZoneMailBody redacts the token after consumption', () => {
  const consumed = operatorZoneMailBody({
    hostname: 'staff.7fk3m2.lan.notaus.de',
    installationDomain: '7fk3m2.lan.notaus.de',
    staffHostname: 'staff.7fk3m2.lan.notaus.de',
    portalHostname: 'portal.7fk3m2.lan.notaus.de',
    wildcardCertificateName: '*.7fk3m2.lan.notaus.de',
    lanIp: '192.168.178.112',
    installationId: '7fk3m2q9',
    token: 'secret-token',
    tokenConsumed: true,
    acmeCnameTarget: 'uuid.auth.acme-dns.io',
  });
  assert.equal(consumed.includes('secret-token'), false);
  assert.match(consumed, /bereits verwendet/);
  assert.match(consumed, /staff\.7fk3m2\.lan\.notaus\.de\. +A +192\.168\.178\.112/);
  assert.match(consumed, /portal\.7fk3m2\.lan\.notaus\.de\. +A +<PORTAL-ZIEL-IP>/);
  assert.match(consumed, /Vor dem Versand: <PORTAL-ZIEL-IP>/);
  assert.match(consumed, /Bitte den Portal-A-Record bereits jetzt anlegen/);
  assert.equal(consumed.includes('noch kein A-Record'), false);
  assert.match(consumed, /Zertifikatsname: +\*\.7fk3m2\.lan\.notaus\.de/);
  assert.match(consumed, /_acme-challenge\.7fk3m2\.lan\.notaus\.de\./);
  assert.match(consumed, /CNAME {2}uuid\.auth\.acme-dns\.io\./);
});

test('own-domain ACME DNS instructions include staff, portal and the base-domain challenge', () => {
  const body = practiceDnsBody({
    hostname: 'staff.flow.example.org',
    installationDomain: 'flow.example.org',
    portalHostname: 'portal.flow.example.org',
    lanIp: '192.168.1.10',
    acmeCnameTarget: 'id.auth.acme-dns.io.',
  });
  assert.match(body, /staff\.flow\.example\.org\. +A +192\.168\.1\.10/);
  assert.match(body, /portal\.flow\.example\.org\. +A +<PORTAL-ZIEL-IP>/);
  assert.match(body, /_acme-challenge\.flow\.example\.org\. +CNAME +id\.auth\.acme-dns\.io\./);
  assert.doesNotMatch(body, /_acme-challenge\.staff/);
  assert.equal(tlsUsesOperatorDns('staff.flow.example.org'), false);
  assert.equal(tlsUsesOperatorDns('staff.example.lan.notaus.de'), true);
  assert.equal(tlsModeForNameMode('domain'), 'managed');
  assert.equal(tlsModeForNameMode('domain', 'custom'), 'custom');
  assert.equal(tlsModeForNameMode('generated', 'custom'), 'managed');
  assert.equal(
    practiceDnsBody({ hostname: 'flow.example.org', lanIp: '192.168.1.10' }),
    'flow.example.org.                   A      192.168.1.10',
  );
});
