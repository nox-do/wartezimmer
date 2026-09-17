import assert from 'node:assert/strict';
import test from 'node:test';
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
      new Error(
        "Error invoking remote method 'praxis:setup-api-call': Error: Setup-API /api/setup/host/restricted-network/prepare: Die gewählte Restricted-IP ist nicht mehr lokal verfügbar oder nicht eindeutig zugeordnet.",
      ),
    ),
    'Die gewählte Netzwerkadresse ist derzeit nicht am Computer verfügbar. Prüfen Sie die Netzwerkverbindung und wählen Sie die Adresse nach der Wiederherstellung erneut aus.',
  );
});

test('unexpected preparation failures do not expose IPC details', () => {
  assert.equal(
    restrictedPrepareErrorText(new Error("Error invoking remote method 'praxis:setup-api-call'")),
    'Die Netzwerkadresse konnte nicht vorbereitet werden. Bitte prüfen Sie die Voraussetzungen erneut.',
  );
});

test('restricted actions retain the setup diagnosis without the IPC wrapper', () => {
  assert.equal(
    restrictedActionErrorText(
      new Error(
        "Error invoking remote method 'praxis:setup-api-call': Error: Setup-API /api/setup/host/restricted-network/apply: Runtime-Bindung unsicher. Der vorherige Zustand wurde wiederhergestellt.",
      ),
      'aktiviert',
    ),
    'Runtime-Bindung unsicher. Der vorherige Zustand wurde wiederhergestellt.',
  );
});

test('restricted actions retain a message already sanitized at the IPC boundary', () => {
  assert.equal(
    restrictedActionErrorText(
      new Error('Die Aktivierung wurde zurückgenommen; der Staff-Zugang bleibt unverändert.'),
      'aktiviert',
    ),
    'Die Aktivierung wurde zurückgenommen; der Staff-Zugang bleibt unverändert.',
  );
});
