import assert from 'node:assert/strict';
import test from 'node:test';
import { ManagerApiError } from '@wartezimmer/server-shared/setup-api';
import {
  restrictedCandidateWarningText,
  restrictedDnsStatusText,
  restrictedNetworkStatusSummary,
  restrictedActionErrorText,
  restrictedPrepareErrorText,
} from './restricted-network-view-model.js';

test('unconfigured patient access does not imply isolation', () => {
  const view = restrictedNetworkStatusSummary({
    phase: 'unconfigured',
    health: 'not-configured',
    binding: null,
    exposedSurfaces: ['patient-portal'],
    portalHostname: 'portal.installation.example',
    lastError: null,
  });
  assert.equal(view.state, 'Noch nicht eingerichtet');
  assert.equal(view.portalAddress, 'https://portal.installation.example');
  assert.equal(view.binding, 'Keine Restricted-IP gewählt');
});

test('portal DNS state is expressed as an actionable status', () => {
  assert.equal(
    restrictedDnsStatusText({
      state: 'missing',
      hostname: 'portal.installation.example',
      expectedIp: '10.20.0.2',
      addresses: [],
      publicAddresses: [],
    }),
    'A-Record fehlt',
  );
});

test('public portal DNS with failed local resolution points to the local DNS path', () => {
  assert.equal(
    restrictedDnsStatusText({
      state: 'local-unresolved',
      hostname: 'portal.installation.example',
      expectedIp: '10.20.0.2',
      addresses: [],
      publicAddresses: ['10.20.0.2'],
      reason: 'dns-rebind',
    }),
    'A-Record stimmt, lokal nicht auflösbar',
  );
});

test('same-interface and virtual candidates remain visible as warnings', () => {
  assert.equal(
    restrictedCandidateWarningText(['same-interface', 'virtual-interface']),
    'gleiches Interface wie Staff · virtuelles oder getunneltes Interface',
  );
});

test('temporarily unavailable selected address gets an actionable preparation error', () => {
  assert.equal(
    restrictedPrepareErrorText(
      new ManagerApiError({
        code: 'restricted_address_unavailable',
        category: 'validation',
        message:
          'Die gewählte Restricted-IP ist nicht mehr lokal verfügbar oder nicht eindeutig zugeordnet.',
        retryable: false,
      }),
    ),
    'Die gewählte Netzwerkadresse ist derzeit nicht am Computer verfügbar. Prüfen Sie die Netzwerkverbindung und wählen Sie die Adresse nach der Wiederherstellung erneut aus.',
  );
});

test('unexpected preparation failures use generic guidance', () => {
  assert.equal(
    restrictedPrepareErrorText(new Error('private transport failure')),
    'Die Netzwerkadresse konnte nicht vorbereitet werden. Bitte prüfen Sie die Voraussetzungen erneut.',
  );
});

test('restricted actions use the structured public setup diagnosis', () => {
  assert.equal(
    restrictedActionErrorText(
      new ManagerApiError({
        code: 'restricted_apply_failed',
        category: 'operation-failed',
        message: 'Runtime-Bindung unsicher. Der vorherige Zustand wurde wiederhergestellt.',
        retryable: false,
      }),
      'aktiviert',
    ),
    'Runtime-Bindung unsicher. Der vorherige Zustand wurde wiederhergestellt.',
  );
});

test('unknown restricted action errors do not expose transport text', () => {
  assert.equal(
    restrictedActionErrorText(
      new Error('Die Aktivierung wurde zurückgenommen; der Staff-Zugang bleibt unverändert.'),
      'aktiviert',
    ),
    'Der Patientenzugang konnte nicht aktiviert werden. Bitte erneut prüfen.',
  );
});

test('refresh preserves a valid NIC draft and invalidates changed warning consent', async () => {
  const { reconcileRestrictedDraft, restrictedCandidateKey } =
    await import('./restricted-network-view-model.js');
  type Snapshot = Parameters<typeof reconcileRestrictedDraft>[1];
  const saved = { address: '10.20.0.2', interfaceId: 'nic-a', warnings: [] };
  const draft = { address: '10.30.0.2', interfaceId: 'nic-b', warnings: ['same-interface'] };
  const snapshot = {
    status: {
      binding: { hostIp: saved.address, interfaceId: saved.interfaceId, warningsConfirmed: false },
    },
    candidates: [saved, draft],
  } as unknown as Snapshot;
  const selected = restrictedCandidateKey(draft.address, draft.interfaceId);
  assert.deepEqual(reconcileRestrictedDraft(snapshot, structuredClone(snapshot), selected, true), {
    selectedKey: selected,
    confirmed: true,
  });
  const changed = structuredClone(snapshot);
  changed.candidates[1]!.warnings.push('virtual-interface');
  assert.deepEqual(reconcileRestrictedDraft(snapshot, changed, selected, true), {
    selectedKey: selected,
    confirmed: false,
  });
  changed.candidates.pop();
  assert.equal(
    reconcileRestrictedDraft(snapshot, changed, selected, true).selectedKey,
    restrictedCandidateKey(saved.address, saved.interfaceId),
  );
  assert.equal(
    reconcileRestrictedDraft(null, snapshot, '', false).selectedKey,
    restrictedCandidateKey(saved.address, saved.interfaceId),
  );
});

test('portal summary distinguishes missing checks and preserves actionable details', async () => {
  const { restrictedCheckSummary } = await import('./restricted-network-view-model.js');
  type Input = Parameters<typeof restrictedCheckSummary>[0];
  const snapshot = {
    status: { phase: 'prepared', binding: { hostIp: '10.20.0.2' } },
    checks: [
      { id: 'restricted.tls', ok: true, message: 'TLS ready' },
      { id: 'restricted.local-ip', ok: true, message: 'IP assigned' },
      { id: 'restricted.portal-dns-public', ok: true, message: 'Public DNS ready' },
      {
        id: 'restricted.portal-dns-local',
        ok: false,
        message: 'Local DNS mismatch',
        detail: 'Expected 10.20.0.2',
      },
      { id: 'restricted.recovered-operation', ok: true, message: 'Please reactivate' },
    ],
  } as unknown as Input;
  let summary = restrictedCheckSummary(snapshot);
  assert.deepEqual(
    summary.groups.map((group) => group.state),
    ['passed', 'failed', 'pending'],
  );
  assert.equal(summary.groups[1].failures[0].detail, 'Expected 10.20.0.2');
  assert.equal(summary.additional[0].message, 'Please reactivate');
  snapshot.checks.pop();
  snapshot.checks.pop();
  summary = restrictedCheckSummary(snapshot);
  assert.equal(summary.groups[1].state, 'pending');
  snapshot.status.phase = 'applied';
  assert.equal(restrictedCheckSummary(snapshot).groups[2].state, 'pending');
  for (const id of [
    'restricted.binding.no-global-publish',
    'restricted.binding.proxy',
    'restricted.binding.runtime-contract',
  ])
    snapshot.checks.push({ id, ok: true, message: 'OK' });
  assert.equal(restrictedCheckSummary(snapshot).groups[2].state, 'passed');
});
