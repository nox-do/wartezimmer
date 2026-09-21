import type { HostLifecycle, HostOperatingMode } from './setup-api.js';

/** Host mutations which must agree on the same configured lifecycle matrix. */
export type HostLifecycleAction =
  | 'setup-apply'
  | 'stack-start'
  | 'stack-stop'
  | 'stack-restart'
  | 'network-binding'
  | 'tls-prepare'
  | 'tls-verify'
  | 'tls-obtain'
  | 'tls-custom-certificate'
  | 'tls-check-certificate'
  | 'tls-apply'
  | 'tls-repair'
  | 'tls-reset'
  | 'tls-renew'
  | 'restricted-prepare'
  | 'restricted-apply'
  | 'restricted-remove'
  | 'rebuild'
  | 'restore'
  | 'update';

export type HostLifecycleGuard = {
  allowed: boolean;
  preserveTlsIdentity: boolean;
  reason: string | null;
};

const installedModes = new Set<HostOperatingMode>([
  'direct-http',
  'proxy-http',
  'https',
  'https-portal',
]);

const tlsPreparationModes = new Set<HostOperatingMode>(['proxy-http']);
const tlsActiveModes = new Set<HostOperatingMode>(['https', 'https-portal']);

function reject(reason: string): HostLifecycleGuard {
  return { allowed: false, preserveTlsIdentity: false, reason };
}

function allow(preserveTlsIdentity: boolean): HostLifecycleGuard {
  return { allowed: true, preserveTlsIdentity, reason: null };
}

function isTlsIdentityInUse(lifecycle: HostLifecycle): boolean {
  return (
    lifecycle.preparation === 'https' ||
    lifecycle.preparation === 'portal' ||
    lifecycle.mode === 'https' ||
    lifecycle.mode === 'https-portal'
  );
}

/**
 * Pure action matrix shared by Setup and Manager. It only evaluates the
 * committed/public lifecycle projection; Docker, DNS, certificates, volumes,
 * bindings and runtime listeners remain separate safety gates.
 */
export function evaluateHostLifecycleAction(
  lifecycle: HostLifecycle,
  action: HostLifecycleAction,
): HostLifecycleGuard {
  if (lifecycle.assessment !== 'known' || !lifecycle.mode) {
    return reject(
      lifecycle.assessment === 'inconsistent'
        ? 'Die Installation ist nicht ausreichend gültig; widersprüchliche Konfiguration zuerst prüfen.'
        : 'Die Installation ist nicht sicher bekannt. Zuerst den Host-Zustand prüfen.',
    );
  }
  if (lifecycle.operation !== 'none') {
    return reject(
      lifecycle.operation === 'unreadable'
        ? 'Eine offene Hoständerung ist unlesbar und muss zuerst geprüft werden.'
        : 'Eine Portaländerung ist noch offen und muss zuerst abgeschlossen werden.',
    );
  }

  const mode = lifecycle.mode;
  const preserveTlsIdentity = isTlsIdentityInUse(lifecycle);

  if (mode === 'uninstalled') {
    return action === 'setup-apply'
      ? allow(false)
      : reject('Die Installation ist noch nicht eingerichtet.');
  }
  if (!installedModes.has(mode)) {
    return reject('Der Betriebsmodus ist nicht zulässig.');
  }

  switch (action) {
    case 'setup-apply':
    case 'stack-start':
    case 'stack-stop':
    case 'stack-restart':
    case 'network-binding':
    case 'rebuild':
    case 'restore':
    case 'update':
      return allow(preserveTlsIdentity);

    case 'tls-prepare':
      return tlsPreparationModes.has(mode)
        ? allow(false)
        : reject('HTTPS-Vorbereitung benötigt einen HTTP-Betrieb mit Proxy.');

    case 'tls-verify':
    case 'tls-obtain':
    case 'tls-custom-certificate':
    case 'tls-check-certificate':
    case 'tls-apply':
      return tlsPreparationModes.has(mode) && lifecycle.preparation === 'https'
        ? allow(false)
        : reject('Diese HTTPS-Aktion ist nur während der HTTPS-Vorbereitung erlaubt.');

    case 'tls-repair':
      return (tlsPreparationModes.has(mode) && lifecycle.preparation === 'https') ||
        tlsActiveModes.has(mode)
        ? allow(preserveTlsIdentity)
        : reject('HTTPS-Reparatur ist in diesem Betriebsmodus nicht erlaubt.');

    case 'tls-reset':
      return (tlsPreparationModes.has(mode) && lifecycle.preparation === 'https') ||
        tlsActiveModes.has(mode)
        ? allow(preserveTlsIdentity)
        : reject('Diese TLS-Rücknahme ist in diesem Betriebsmodus nicht erlaubt.');

    case 'tls-renew':
      return tlsActiveModes.has(mode)
        ? allow(true)
        : reject('Zertifikatserneuerung ist erst nach dem HTTPS-Cutover erlaubt.');

    case 'restricted-prepare':
      return mode === 'https'
        ? allow(true)
        : reject('Restricted-Binding benötigt einen bestätigten HTTPS-Betrieb.');

    case 'restricted-apply':
      return mode === 'https' && lifecycle.preparation === 'portal'
        ? allow(true)
        : reject('Restricted-Binding muss aus der Portalvorbereitung angewendet werden.');

    case 'restricted-remove':
      return mode === 'https-portal'
        ? allow(true)
        : reject('Ein Restricted-Binding kann nur aus dem Portalbetrieb entfernt werden.');
  }
}
