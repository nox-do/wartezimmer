import assert from 'node:assert/strict';
import test from 'node:test';
import type { TlsStatus } from '../shared/host-status.js';
import {
  TLS_CUTOVER_CONFIRM_MESSAGE,
  TLS_LEASE_STALE_LAN_COPY,
  tlsCanApply,
  tlsCanObtain,
  tlsCanRenew,
  tlsCanRepair,
  tlsCanVerifyDns,
  tlsDiagnoseItems,
  tlsErrorCopy,
  tlsExpiryKind,
  tlsIsApplyFail,
  tlsIsPersistedFailBeforeCutover,
  tlsNeedsNetworkResume,
  tlsNetworkShowsGenericErrorFooter,
  tlsNetworkSubtitle,
  tlsResumeCard,
  tlsShowsDnsWaitCopy,
  tlsOperatorRecordsAreTheTask,
  tlsShowsStructuredLastErrorNotice,
} from './tls-network-view-model.js';

function tls(overrides: Partial<TlsStatus>): TlsStatus {
  return {
    state: 'off',
    mode: null,
    hostname: null,
    installationId: null,
    tokenConsumed: false,
    applyReady: false,
    cutoverApplied: false,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
    ...overrides,
  };
}

test('tls gates follow status, not wizard drafts', () => {
  assert.equal(tlsCanVerifyDns(tls({ state: 'awaiting-operator-dns', mode: 'managed' })), true);
  assert.equal(
    tlsCanObtain(tls({ state: 'dns-verified', mode: 'managed', applyReady: false })),
    true,
  );
  assert.equal(
    tlsCanObtain(tls({ state: 'dns-verified', mode: 'managed', applyReady: true })),
    false,
  );
  assert.equal(
    tlsCanApply(tls({ state: 'dns-verified', mode: 'managed', applyReady: true })),
    true,
  );
});

test('tlsNeedsNetworkResume skips idle and healthy active certs', () => {
  assert.equal(tlsNeedsNetworkResume(undefined), false);
  assert.equal(tlsNeedsNetworkResume(tls({ state: 'off' })), false);
  assert.equal(tlsNeedsNetworkResume(tls({ state: 'awaiting-operator-dns' })), true);
  const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    tlsNeedsNetworkResume(
      tls({
        state: 'active',
        cutoverApplied: true,
        certificate: { issuer: 'Pebble', notBefore: future, notAfter: future, names: [] },
      }),
    ),
    false,
  );
});

test('tlsResumeCard wait extra is only on awaiting-operator-dns', () => {
  const waiting = tlsResumeCard(tls({ state: 'awaiting-operator-dns', mode: 'managed' }));
  assert.equal(waiting?.button, 'Fortsetzen');
  assert.equal(waiting?.title, tlsNetworkSubtitle(tls({ state: 'awaiting-operator-dns', mode: 'managed' })));
  assert.match(waiting?.copy ?? '', /48 Stunden/);
  assert.match(waiting?.copy ?? '', /Manager schließen/);
  assert.doesNotMatch(waiting?.copy ?? '', /unter Netzwerk/);

  const preparing = tlsResumeCard(tls({ state: 'preparing', mode: 'managed' }));
  assert.equal(preparing?.title, 'Vorbereitung');
  assert.doesNotMatch(preparing?.copy ?? '', /48 Stunden/);
  assert.doesNotMatch(preparing?.copy ?? '', /Manager schließen/);
  assert.doesNotMatch(preparing?.copy ?? '', /unter Netzwerk/);
  assert.equal(preparing?.button, 'Fortsetzen');

  const obtaining = tlsResumeCard(tls({ state: 'obtaining-certificate', mode: 'managed' }));
  assert.doesNotMatch(obtaining?.copy ?? '', /48 Stunden/);
  assert.doesNotMatch(obtaining?.copy ?? '', /Manager schließen/);
  assert.doesNotMatch(obtaining?.copy ?? '', /unter Netzwerk/);
});

test('tlsResumeCard persisted fail uses the same words as the network notice', () => {
  const failed = tls({
    state: 'error',
    mode: 'managed',
    lastError: { class: 'acme', message: 'obtain failed' },
  });
  const card = tlsResumeCard(failed);
  const fail = tlsErrorCopy(failed.lastError?.class, failed.lastError?.message);
  assert.equal(card?.title, fail.title);
  assert.equal(card?.copy, fail.action);
  assert.equal(card?.button, 'Fortsetzen');
  assert.doesNotMatch(`${card?.title} ${card?.copy}`, /unter Netzwerk/);
});

test('tlsResumeCard apply-fail keeps cutover context instead of a failed install', () => {
  const applyFail = tls({
    state: 'dns-verified',
    mode: 'managed',
    applyReady: true,
    lastError: { class: 'firewall', message: 'apply rolled back' },
  });
  const card = tlsResumeCard(applyFail);
  const fail = tlsErrorCopy(applyFail.lastError?.class, applyFail.lastError?.message);
  assert.equal(card?.title, 'Zertifikat liegt vor');
  assert.equal(card?.copy, `${fail.title} ${fail.action}`);
  assert.equal(card?.button, 'Fortsetzen');
  assert.doesNotMatch(`${card?.title} ${card?.copy}`, /fehlgeschlagen/);
  assert.doesNotMatch(`${card?.title} ${card?.copy}`, /Installation/);
  assert.doesNotMatch(`${card?.title} ${card?.copy}`, /unter Netzwerk/);
});

test('tlsResumeCard post-cutover cards do not promise reachable HTTP', () => {
  const httpPromise = /HTTP läuft|HTTP bleibt erreichbar|HTTP bleibt/;
  const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const postError = tlsResumeCard(
    tls({
      state: 'error',
      cutoverApplied: true,
      mode: 'managed',
      lastError: { class: 'acme', message: 'renew failed' },
    }),
  );
  assert.equal(postError?.button, 'Fortsetzen');
  assert.equal(postError?.title, 'Fehler');
  assert.equal(postError?.copy, 'Geräte nutzen HTTPS.');
  assert.doesNotMatch(postError?.copy ?? '', httpPromise);

  const degraded = tlsResumeCard(tls({ state: 'degraded', cutoverApplied: true, mode: 'managed' }));
  assert.equal(degraded?.title, 'HTTPS braucht Aufmerksamkeit');
  assert.equal(degraded?.copy, 'Geräte nutzen HTTPS.');
  assert.doesNotMatch(degraded?.copy ?? '', httpPromise);

  const expiring = tlsResumeCard(
    tls({
      state: 'active',
      cutoverApplied: true,
      certificate: { issuer: 'Pebble', notBefore: soon, notAfter: soon, names: [] },
    }),
  );
  assert.equal(expiring?.title, 'HTTPS braucht Aufmerksamkeit');
  assert.equal(expiring?.copy, 'Geräte nutzen HTTPS.');
  assert.doesNotMatch(expiring?.copy ?? '', httpPromise);

  const expiredCard = tlsResumeCard(
    tls({
      state: 'active',
      cutoverApplied: true,
      certificate: { issuer: 'Pebble', notBefore: expired, notAfter: expired, names: [] },
    }),
  );
  assert.equal(expiredCard?.title, 'Zertifikat abgelaufen');
  assert.doesNotMatch(expiredCard?.copy ?? '', httpPromise);
});

test('tlsExpiryKind warns inside 21 days', () => {
  const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    tlsExpiryKind({ issuer: 'Pebble', notBefore: soon, notAfter: soon, names: [] }),
    'soon',
  );
});

test('tlsCanRenew stays off while a healthy certificate is active', () => {
  const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    tlsCanRenew(
      tls({
        state: 'active',
        cutoverApplied: true,
        certificate: { issuer: 'Pebble', notBefore: future, notAfter: future, names: [] },
      }),
    ),
    false,
  );
  assert.equal(tlsCanRenew(tls({ state: 'degraded', cutoverApplied: true })), true);
});

test('tlsErrorCopy does not claim a missing A-record is a taken name', () => {
  const missing = tlsErrorCopy('a-record', 'A-Record fehlt');
  assert.equal(missing.title, 'A-Record fehlt');
  assert.match(missing.action, /Warten/);
  const otherIp = tlsErrorCopy('collision', 'A-Record zeigt auf eine andere IP');
  assert.equal(otherIp.title, 'A-Record zeigt auf eine andere IP');
  assert.doesNotMatch(otherIp.title, /vergeben/);
  assert.match(otherIp.action, /andere Adresse/);
});

test('tlsDiagnoseItems does not mark DNS green after a pre-cutover error', () => {
  const items = tlsDiagnoseItems({
    tls: tls({
      state: 'error',
      mode: 'managed',
      lastError: { class: 'a-record', message: 'missing' },
    }),
    ipv4Reserved: true,
    checks: null,
  });
  const aRecord = items.find((item) => item.text.includes('A-Record'));
  assert.equal(aRecord?.status, 'is-open');
});

test('tlsDiagnoseItems does not repeat A-record addresses already in the message', () => {
  const items = tlsDiagnoseItems({
    tls: tls({ state: 'awaiting-operator-dns', mode: 'managed' }),
    ipv4Reserved: true,
    checks: [
      {
        id: 'a-record',
        ok: false,
        message: 'Kein eigener A-Record — Catch-all der Zone zeigt auf 213.23.215.150',
        detail: '213.23.215.150',
      },
    ],
  });
  const aRecord = items.find((item) => item.text.includes('Catch-all'));
  assert.equal(aRecord?.text, 'Kein eigener A-Record — Catch-all der Zone zeigt auf 213.23.215.150');
});

test('TLS_LEASE_STALE_LAN_COPY stays short', () => {
  assert.equal(
    TLS_LEASE_STALE_LAN_COPY,
    'Die gespeicherte IP-Adresse passt nicht zur aktuellen Adresse dieses Rechners. Bitte anpassen.',
  );
});

test('tlsShowsDnsWaitCopy is only true while awaiting operator DNS', () => {
  assert.equal(tlsShowsDnsWaitCopy(tls({ state: 'awaiting-operator-dns', mode: 'managed' })), true);
  assert.equal(
    tlsShowsDnsWaitCopy(
      tls({
        state: 'error',
        mode: 'managed',
        lastError: { class: 'acme', message: 'register failed' },
      }),
    ),
    false,
  );
  assert.equal(
    tlsShowsDnsWaitCopy(tls({ state: 'dns-verified', mode: 'managed', applyReady: true })),
    false,
  );
  assert.equal(
    tlsShowsDnsWaitCopy(
      tls({
        state: 'dns-verified',
        mode: 'managed',
        applyReady: true,
        lastError: { class: 'firewall', message: '443 closed' },
      }),
    ),
    false,
  );
  assert.equal(tlsShowsDnsWaitCopy(tls({ state: 'obtaining-certificate', mode: 'managed' })), false);
  assert.equal(tlsShowsDnsWaitCopy(tls({ state: 'active', cutoverApplied: true })), false);
  assert.equal(
    tlsOperatorRecordsAreTheTask(tls({ state: 'awaiting-operator-dns', mode: 'managed' })),
    true,
  );
});

test('persisted fail before cutover offers repair and hides wait copy', () => {
  const failed = tls({
    state: 'error',
    mode: 'managed',
    lastError: { class: 'acme', message: 'obtain failed' },
  });
  assert.equal(tlsIsPersistedFailBeforeCutover(failed), true);
  assert.equal(tlsShowsStructuredLastErrorNotice(failed), true);
  assert.equal(tlsCanRepair(failed), true);
  assert.equal(tlsCanApply(failed), false);
  assert.equal(tlsIsApplyFail(failed), false);
  assert.equal(tlsShowsDnsWaitCopy(failed), false);
  const copy = tlsErrorCopy(failed.lastError?.class, failed.lastError?.message);
  assert.equal(copy.title, 'Das Zertifikat konnte nicht ausgestellt werden.');
  assert.match(copy.action, /nicht neu anfordern/);
});

test('apply-fail keeps apply retry and does not offer repair', () => {
  const applyFail = tls({
    state: 'dns-verified',
    mode: 'managed',
    applyReady: true,
    lastError: { class: 'firewall', message: 'apply rolled back' },
  });
  assert.equal(tlsIsApplyFail(applyFail), true);
  assert.equal(tlsShowsStructuredLastErrorNotice(applyFail), true);
  assert.equal(tlsCanApply(applyFail), true);
  assert.equal(tlsCanRepair(applyFail), false);
  assert.equal(tlsIsPersistedFailBeforeCutover(applyFail), false);
  assert.equal(tlsShowsDnsWaitCopy(applyFail), false);
  const copy = tlsErrorCopy(applyFail.lastError?.class, applyFail.lastError?.message);
  assert.equal(copy.title, 'Port 443 auf diesem Rechner ist nicht erreichbar.');
  assert.match(copy.action, /HTTP bleibt/);
});

test('generic footer stays hidden when a structured lastError is on a pre-cutover gate', () => {
  const persisted = tls({
    state: 'error',
    mode: 'managed',
    lastError: { class: 'acme', message: 'obtain failed' },
  });
  assert.equal(tlsNetworkShowsGenericErrorFooter(persisted, 'obtain failed'), false);
  const applyFail = tls({
    state: 'dns-verified',
    mode: 'managed',
    applyReady: true,
    lastError: { class: 'firewall', message: 'apply rolled back' },
  });
  assert.equal(tlsNetworkShowsGenericErrorFooter(applyFail, 'apply rolled back'), false);
});

test('generic footer remains the fallback without a persisted lastError', () => {
  const pemCheck = tls({ state: 'dns-verified', mode: 'custom', applyReady: false });
  assert.equal(
    tlsNetworkShowsGenericErrorFooter(pemCheck, 'Die Uhrzeit dieses Rechners wird abgelehnt.'),
    true,
  );
  const errorWithoutClass = tls({ state: 'error', mode: 'managed', lastError: null });
  assert.equal(tlsIsPersistedFailBeforeCutover(errorWithoutClass), true);
  assert.equal(tlsShowsStructuredLastErrorNotice(errorWithoutClass), false);
  assert.equal(tlsCanRepair(errorWithoutClass), true);
  assert.equal(tlsNetworkShowsGenericErrorFooter(errorWithoutClass, 'clock skew'), true);
  assert.equal(tlsNetworkShowsGenericErrorFooter(pemCheck, null), false);
  const clockFallback = tlsErrorCopy('clock');
  assert.match(clockFallback.title, /Uhrzeit/);
  const certNameFallback = tlsErrorCopy('cert-name');
  assert.match(certNameFallback.title, /Hostnamen/);
});

test('pre-cutover gates leave post-cutover renew and wait copy unchanged', () => {
  const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
  const healthy = tls({
    state: 'active',
    cutoverApplied: true,
    certificate: { issuer: 'Pebble', notBefore: future, notAfter: future, names: [] },
  });
  assert.equal(tlsShowsDnsWaitCopy(healthy), false);
  assert.equal(tlsIsPersistedFailBeforeCutover(healthy), false);
  assert.equal(tlsIsApplyFail(healthy), false);
  assert.equal(tlsCanRenew(healthy), false);

  const degraded = tls({ state: 'degraded', cutoverApplied: true, mode: 'managed' });
  assert.equal(tlsCanRenew(degraded), true);
  assert.equal(tlsCanRepair(degraded), true);
  assert.equal(tlsIsPersistedFailBeforeCutover(degraded), false);

  const postCutoverError = tls({
    state: 'error',
    cutoverApplied: true,
    lastError: { class: 'acme', message: 'renew failed' },
  });
  assert.equal(tlsIsPersistedFailBeforeCutover(postCutoverError), false);
  assert.equal(tlsNetworkShowsGenericErrorFooter(postCutoverError, 'renew failed'), true);
  assert.equal(tlsCanRenew(postCutoverError), true);
  assert.match(TLS_CUTOVER_CONFIRM_MESSAGE, /unwiderruflich/);
});
