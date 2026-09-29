import type {
  RestrictedNetworkCandidateWarning,
  RestrictedNetworkDnsObservation,
  RestrictedNetworkInspectResult,
  RestrictedNetworkStatus,
} from '../shared/host-status.js';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';

export function restrictedDnsStatusText(dns: RestrictedNetworkDnsObservation): string {
  switch (dns.state) {
    case 'match':
      return 'A-Record stimmt';
    case 'missing':
      return 'A-Record fehlt';
    case 'mismatch':
      return 'A-Record zeigt auf eine andere Adresse';
    case 'local-unresolved':
      return 'A-Record stimmt, lokal nicht auflösbar';
    default:
      return 'Wird nach Auswahl der Restricted-IP geprüft';
  }
}

export function restrictedNetworkStatusSummary(status: RestrictedNetworkStatus) {
  const binding = status.binding;
  const state =
    status.phase === 'unconfigured'
      ? 'Noch nicht eingerichtet'
      : status.health === 'blocked'
        ? 'Gesperrt – Voraussetzung fehlt'
        : status.health === 'degraded'
          ? 'Degradiert – Prüfung erforderlich'
          : status.health === 'warning-shared-interface'
            ? 'Eingerichtet mit Warnung – gemeinsames Interface'
            : status.phase === 'applied'
              ? 'Eingerichtet – Detailprüfung im Netzwerkbereich'
              : 'Vorbereitet – noch nicht angewendet';
  return {
    state,
    portalAddress: status.portalHostname
      ? `https://${status.portalHostname}`
      : 'Nach HTTPS-Einrichtung verfügbar',
    binding: binding
      ? `${binding.hostIp} (${binding.interfaceName})`
      : 'Keine Restricted-IP gewählt',
    needsAttention: status.health === 'blocked' || status.health === 'degraded',
  };
}

const warningLabels: Record<RestrictedNetworkCandidateWarning, string> = {
  'same-interface': 'gleiches Interface wie Staff',
  'overlapping-staff-subnet': 'überlappendes Staff-Subnetz',
  'virtual-interface': 'virtuelles oder getunneltes Interface',
  'ambiguous-address': 'Adresse ist mehreren Interfaces zugeordnet',
};

export function restrictedCandidateWarningText(
  warnings: RestrictedNetworkCandidateWarning[],
): string | null {
  return warnings.length ? warnings.map((warning) => warningLabels[warning]).join(' · ') : null;
}

export function restrictedInspectHeadline(inspect: RestrictedNetworkInspectResult): string {
  if (!inspect.capabilities.supported) return 'Nicht unterstützt – Hostplattform';
  return restrictedNetworkStatusSummary(inspect.status).state;
}

export function restrictedPrepareErrorText(error: unknown): string {
  if (
    error instanceof ManagerApiError &&
    (error.code === 'restricted_address_unavailable' ||
      error.code === 'restricted_address_ambiguous')
  ) {
    return 'Die gewählte Netzwerkadresse ist derzeit nicht am Computer verfügbar. Prüfen Sie die Netzwerkverbindung und wählen Sie die Adresse nach der Wiederherstellung erneut aus.';
  }
  return 'Die Netzwerkadresse konnte nicht vorbereitet werden. Bitte prüfen Sie die Voraussetzungen erneut.';
}

export function restrictedActionErrorText(
  error: unknown,
  action: 'aktiviert' | 'entfernt',
): string {
  return error instanceof ManagerApiError
    ? error.message
    : `Der Patientenzugang konnte nicht ${action} werden. Bitte erneut prüfen.`;
}

export const restrictedCandidateKey = (address: string, interfaceId: string): string =>
  `${interfaceId}\u0000${address}`;

export function reconcileRestrictedDraft(
  previous: RestrictedNetworkInspectResult | null,
  next: RestrictedNetworkInspectResult,
  selectedKey: string,
  confirmed: boolean,
): { selectedKey: string; confirmed: boolean } {
  const key = (candidate: RestrictedNetworkInspectResult['candidates'][number]) =>
    restrictedCandidateKey(candidate.address, candidate.interfaceId);
  const candidate = next.candidates.find((item) => key(item) === selectedKey);
  if (previous && candidate) {
    const old = previous.candidates.find((item) => key(item) === selectedKey);
    const sameWarnings =
      old && [...old.warnings].sort().join('|') === [...candidate.warnings].sort().join('|');
    return { selectedKey, confirmed: Boolean(confirmed && sameWarnings) };
  }
  const saved = next.status.binding;
  const savedCandidate =
    saved &&
    next.candidates.find(
      (item) => item.address === saved.hostIp && item.interfaceId === saved.interfaceId,
    );
  return savedCandidate
    ? { selectedKey: key(savedCandidate), confirmed: saved?.warningsConfirmed ?? false }
    : { selectedKey: '', confirmed: false };
}
