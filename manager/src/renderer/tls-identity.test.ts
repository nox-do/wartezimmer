import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operatorZoneMailBody,
  tlsDraftHostname,
  tlsDraftMatchesPrepared,
  tlsNameValid,
  tlsPrepareHostname,
  tlsWizardDisplayHostname,
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
});

test('tlsDraftHostname keeps generated names anonymous until prepare', () => {
  assert.equal(
    tlsDraftHostname({ nameMode: 'generated', customLabel: '', customDomain: '' }),
    'staff.….lan.notaus.de',
  );
  assert.equal(
    tlsDraftHostname({ nameMode: 'label', customLabel: 'Muster', customDomain: '' }),
    'staff.muster.lan.notaus.de',
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

test('tlsDraftMatchesPrepared keeps generated identity and rejects a fork change', () => {
  const prepared = {
    state: 'awaiting-operator-dns',
    mode: 'managed' as const,
    hostname: 'staff.7fk3m2.lan.notaus.de',
    installationDomain: '7fk3m2.lan.notaus.de',
  };
  assert.equal(
    tlsDraftMatchesPrepared(
      { nameMode: 'generated', customLabel: '', customDomain: '', preparedNameMode: null },
      prepared,
    ),
    true,
  );
  assert.equal(
    tlsDraftMatchesPrepared(
      {
        nameMode: 'generated',
        customLabel: '',
        customDomain: '',
        preparedNameMode: 'generated',
      },
      prepared,
    ),
    true,
  );
  assert.equal(
    tlsDraftMatchesPrepared(
      {
        nameMode: 'domain',
        customLabel: '',
        customDomain: 'flow.praxis-meyer.de',
        preparedNameMode: 'generated',
      },
      prepared,
    ),
    false,
  );
  assert.equal(
    tlsDraftMatchesPrepared(
      {
        nameMode: 'generated',
        customLabel: '',
        customDomain: '',
        preparedNameMode: 'label',
      },
      prepared,
    ),
    false,
  );
  assert.equal(
    tlsDraftMatchesPrepared(
      {
        nameMode: 'label',
        customLabel: 'muster',
        customDomain: '',
        preparedNameMode: 'label',
      },
      {
        state: 'awaiting-operator-dns',
        mode: 'managed',
        hostname: 'staff.muster.lan.notaus.de',
        installationDomain: 'muster.lan.notaus.de',
      },
    ),
    true,
  );
});

test('tlsWizardDisplayHostname follows the draft after a fork change', () => {
  const prepared = {
    state: 'awaiting-operator-dns',
    mode: 'managed' as const,
    hostname: 'staff.7fk3m2.lan.notaus.de',
    staffHostname: 'staff.7fk3m2.lan.notaus.de',
    installationDomain: '7fk3m2.lan.notaus.de',
  };
  assert.equal(
    tlsWizardDisplayHostname(
      {
        nameMode: 'generated',
        customLabel: '',
        customDomain: '',
        preparedNameMode: 'generated',
      },
      prepared,
    ),
    'staff.7fk3m2.lan.notaus.de',
  );
  assert.equal(
    tlsWizardDisplayHostname(
      {
        nameMode: 'domain',
        customLabel: '',
        customDomain: 'flow.praxis-meyer.de',
        preparedNameMode: 'generated',
      },
      prepared,
    ),
    'flow.praxis-meyer.de',
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
  assert.match(consumed, /Portal reserviert: portal\.7fk3m2\.lan\.notaus\.de/);
  assert.match(consumed, /Zertifikatsname: +\*\.7fk3m2\.lan\.notaus\.de/);
  assert.match(consumed, /_acme-challenge\.7fk3m2\.lan\.notaus\.de\./);
  assert.match(consumed, /CNAME {2}uuid\.auth\.acme-dns\.io\./);
});
