import assert from 'node:assert/strict';
import test from 'node:test';
import type { TlsStatus } from '../shared/host-status.js';
import {
  TLS_LEASE_STALE_LAN_COPY,
  tlsCanApply,
  tlsCanObtain,
  tlsCanRenew,
  tlsCanVerifyDns,
  tlsDiagnoseItems,
  tlsErrorCopy,
  tlsExpiryKind,
  tlsNeedsNetworkResume,
  tlsResumeCard,
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

test('tlsResumeCard stays on the network tab', () => {
  const card = tlsResumeCard(tls({ state: 'awaiting-operator-dns', mode: 'managed' }));
  assert.equal(card?.button, 'Fortsetzen');
  assert.match(card?.copy ?? '', /48 Stunden/);
  assert.doesNotMatch(card?.copy ?? '', /Fortsetzen unter Netzwerk/);
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
