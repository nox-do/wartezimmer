import type {
  RestrictedNetworkCandidateWarning,
  RestrictedNetworkDnsObservation,
  RestrictedNetworkInspectResult,
  RestrictedNetworkStatus,
} from '../shared/host-status.js';

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
  const detail = error instanceof Error ? error.message : String(error);
  if (
    detail.includes(
      'Die gewählte Restricted-IP ist nicht mehr lokal verfügbar oder nicht eindeutig zugeordnet.',
    )
  ) {
    return 'Die gewählte Netzwerkadresse ist derzeit nicht am Computer verfügbar. Prüfen Sie die Netzwerkverbindung und wählen Sie die Adresse nach der Wiederherstellung erneut aus.';
  }
  return 'Die Netzwerkadresse konnte nicht vorbereitet werden. Bitte prüfen Sie die Voraussetzungen erneut.';
}

export function restrictedActionErrorText(
  error: unknown,
  action: 'aktiviert' | 'entfernt',
): string {
  const detail = error instanceof Error ? error.message : String(error);
  const apiMessage = /Setup-API\s+\/api\/setup\/host\/restricted-network\/[^:]+:\s*([\s\S]+)$/
    .exec(detail)?.[1]
    ?.trim();
  const directMessage = detail.includes('Error invoking remote method') ? null : detail.trim();
  return (
    apiMessage ||
    directMessage ||
    `Der Patientenzugang konnte nicht ${action} werden. Bitte erneut prüfen.`
  );
}
