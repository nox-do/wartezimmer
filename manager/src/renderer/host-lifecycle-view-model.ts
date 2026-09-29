import type { HostLifecycle, HostOperatingMode } from '@praxis-flow/server-shared/setup-api';

const labels: Record<HostOperatingMode, string> = {
  uninstalled: 'Nicht installiert',
  'direct-http': 'Direkter HTTP-Betrieb',
  'proxy-http': 'HTTP mit Proxy',
  https: 'HTTPS',
  'https-portal': 'HTTPS mit separatem Portalzugang',
};

export function hostLifecycleSummary(lifecycle: HostLifecycle) {
  return {
    title:
      lifecycle.assessment === 'inconsistent'
        ? 'Einrichtung unvollständig oder widersprüchlich'
        : lifecycle.assessment === 'unknown' || !lifecycle.mode
          ? 'Betriebsmodus nicht sicher bestimmbar'
          : labels[lifecycle.mode],
    operation:
      lifecycle.operation === 'portal-apply'
        ? 'Portalaktivierung noch nicht abgeschlossen.'
        : lifecycle.operation === 'portal-remove'
          ? 'Deaktivierung des Portalzugangs noch nicht abgeschlossen.'
          : lifecycle.operation === 'unreadable'
            ? 'Offene Änderung muss zuerst geprüft werden.'
            : null,
    preparation:
      lifecycle.preparation === 'https'
        ? 'HTTPS wird vorbereitet; der eingerichtete Betrieb bleibt HTTP.'
        : lifecycle.preparation === 'portal'
          ? 'Separater Portalzugang vorbereitet, noch nicht aktiviert.'
          : null,
    recovery:
      lifecycle.recovery === 'portal-disabled'
        ? 'Nach einer unterbrochenen Änderung wurde der Portalzugang deaktiviert. Bitte erneut prüfen und aktivieren.'
        : null,
    repair:
      lifecycle.assessment === 'inconsistent'
        ? 'Bitte prüfen Sie die Hinweise unter „Technische Installationsdetails“, bevor Sie die Einrichtung ändern.'
        : null,
  };
}
