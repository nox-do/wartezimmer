import type { HostLifecycle } from '@praxis-flow/server-shared/setup-api';
import { readProxyConfig } from './proxy.js';

export type HostLifecycleFacts = {
  env: Map<string, string>;
  envExists: boolean;
  residues: 'none' | 'present' | 'unknown';
  operation: HostLifecycle['operation'];
  previousEnv?: Map<string, string>;
  recovered: boolean;
};

const tlsStates = new Set([
  'off',
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'active',
  'degraded',
  'error',
]);

/** No I/O, runtime health, DNS checks or mutations. Never repairs configuration. */
export function deriveHostLifecycle(facts: HostLifecycleFacts): HostLifecycle {
  const result: HostLifecycle = {
    assessment: 'known',
    mode: null,
    preparation: 'none',
    operation: facts.operation,
    issues: [],
    recovery: facts.recovered ? 'portal-disabled' : 'none',
  };
  const issue = (code: string, message: string) => {
    result.assessment = 'inconsistent';
    result.issues.push({ code, message });
  };
  if (facts.operation === 'unreadable') {
    return {
      ...result,
      assessment: 'unknown',
      issues: [
        {
          code: 'operation-unreadable',
          message: 'Eine unterbrochene Portaländerung kann nicht gelesen werden.',
        },
      ],
    };
  }
  // Even after .env has been written, an open journal can still roll back.
  const env = facts.previousEnv ?? facts.env;
  if (!facts.envExists && !facts.previousEnv) {
    if (facts.residues === 'present') {
      issue(
        'installation-remnants',
        'Keine Einrichtungskonfiguration vorhanden, aber Installationsreste gefunden.',
      );
    } else if (facts.residues === 'unknown') {
      result.assessment = 'unknown';
      result.issues.push({
        code: 'installation-unchecked',
        message:
          'Keine Einrichtungskonfiguration vorhanden. Vorhandene Installationsreste konnten nicht vollständig geprüft werden.',
      });
    } else {
      result.mode = 'uninstalled';
    }
    return result;
  }
  const value = (key: string) => env.get(key)?.trim() || '';
  const flag = (key: string) => {
    const raw = value(key).toLowerCase();
    if (raw && !['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(raw)) {
      issue('invalid-flag', `Die Einstellung ${key} ist ungültig.`);
    }
    return ['true', '1', 'yes', 'on'].includes(raw);
  };
  let proxy;
  try {
    proxy = readProxyConfig(env);
  } catch {
    issue('proxy-invalid', 'Die gespeicherten Proxy-Einstellungen sind widersprüchlich.');
    return result;
  }
  if (!value('SETUP_LAN_APP_IP') && !value('APP_PORTAL_URL')) {
    issue('address-missing', 'Die Praxisadresse fehlt in der Einrichtung.');
  }
  const state = value('TLS_STATE') || 'off';
  const cutover = flag('TLS_CUTOVER_APPLIED');
  // Restricted's persisted marker is deliberately strict, as in its writer/reader.
  const restrictedRaw = value('SETUP_RESTRICTED_ENABLED');
  if (restrictedRaw && !['true', 'false'].includes(restrictedRaw)) {
    issue('portal-flag-invalid', 'Die gespeicherte Portalaktivierung ist ungültig.');
  }
  const portal = restrictedRaw === 'true';
  const tlsMode = value('TLS_MODE');
  if (!tlsStates.has(state))
    issue('tls-state-invalid', 'Der gespeicherte HTTPS-Zustand ist unbekannt.');
  if (state !== 'off' && (!proxy.enabled || !['managed', 'custom'].includes(tlsMode))) {
    issue(
      'tls-preparation-invalid',
      'Die HTTPS-Einstellungen passen nicht zur Proxy-Konfiguration.',
    );
  }
  const tlsProxy = proxy.mode === 'tls-managed' || proxy.mode === 'tls-custom';
  if (cutover !== tlsProxy || (cutover && state === 'off')) {
    issue(
      'tls-cutover-invalid',
      'HTTPS-Umschaltung und Proxy-Konfiguration passen nicht zusammen.',
    );
  }
  if (state === 'active' && !cutover)
    issue('tls-active-without-cutover', 'HTTPS ist als aktiv markiert, aber nicht umgeschaltet.');
  if (
    cutover &&
    (proxy.mode !== `tls-${tlsMode}` || !(value('TLS_STAFF_HOSTNAME') || value('TLS_HOSTNAME')))
  ) {
    issue(
      'tls-identity-invalid',
      'Die bestätigte HTTPS-Identität ist unvollständig oder widersprüchlich.',
    );
  }
  if (
    portal &&
    (!cutover ||
      tlsMode !== 'managed' ||
      !value('TLS_PORTAL_HOSTNAME') ||
      !value('TLS_WILDCARD_CERTIFICATE_NAME') ||
      !value('SETUP_RESTRICTED_APP_IP'))
  ) {
    issue(
      'portal-invalid',
      'Der separate Portalzugang ist aktiviert, aber seine HTTPS- oder Adresseinstellungen fehlen.',
    );
  }
  if (result.assessment !== 'known') return result;
  result.mode = portal
    ? 'https-portal'
    : cutover
      ? 'https'
      : proxy.enabled
        ? 'proxy-http'
        : 'direct-http';
  result.preparation =
    !cutover && state !== 'off'
      ? 'https'
      : !portal && Boolean(value('SETUP_RESTRICTED_APP_IP'))
        ? 'portal'
        : 'none';
  return result;
}

/** Only public derived metadata; no env contents, credentials or journal backups. */
export function hostLifecycleKey(lifecycle: HostLifecycle): string {
  return JSON.stringify(lifecycle);
}
