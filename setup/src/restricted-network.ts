import type {
  ComposeStatus,
  NetworkInterfaceInfo,
  RestrictedNetworkCandidate,
  RestrictedNetworkDnsObservation,
  RestrictedNetworkInspectResult,
  RestrictedNetworkStatus,
  TlsStatus,
} from '@praxis-flow/server-shared';
import { TLS_OPERATOR_ZONE_DEFAULT } from '@praxis-flow/server-shared';
import { auditStaffPublishedBindings } from './network-bindings.js';
import { networkInterfaceId } from './network.js';

export const RESTRICTED_NETWORK_IP_ENV = 'SETUP_RESTRICTED_APP_IP';
export const RESTRICTED_NETWORK_ENABLED_ENV = 'SETUP_RESTRICTED_ENABLED';
export const RESTRICTED_NETWORK_SAME_INTERFACE_CONFIRMED_ENV =
  'SETUP_RESTRICTED_SAME_INTERFACE_CONFIRMED';
export const RESTRICTED_NETWORK_INTERFACE_ID_ENV = 'SETUP_RESTRICTED_INTERFACE_ID';
export const RESTRICTED_NETWORK_WARNINGS_CONFIRMED_ENV = 'SETUP_RESTRICTED_WARNINGS_CONFIRMED';

export const RESTRICTED_NETWORK_PERSISTED_KEYS = [
  RESTRICTED_NETWORK_ENABLED_ENV,
  RESTRICTED_NETWORK_IP_ENV,
  RESTRICTED_NETWORK_INTERFACE_ID_ENV,
  RESTRICTED_NETWORK_WARNINGS_CONFIRMED_ENV,
  RESTRICTED_NETWORK_SAME_INTERFACE_CONFIRMED_ENV,
] as const;

function normalizedMac(mac: string | undefined): string | null {
  const value = mac?.trim().toLowerCase();
  return value && value !== '00:00:00:00:00:00' ? value : null;
}

function isVirtualInterface(name: string): boolean {
  return /^(bridge|br-|docker|veth|virbr|utun|tun|tap|wg|tailscale|zt|vbox|vmnet|hyper-v|vethernet)/i.test(
    name,
  );
}

function ipv4Number(address: string): number | null {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((value, part) => (value * 256 + part) >>> 0, 0);
}

function cidrNetwork(cidr: string | undefined): { network: number; prefix: number } | null {
  if (!cidr) return null;
  const [address, prefixRaw] = cidr.split('/');
  const prefix = Number(prefixRaw);
  const value = ipv4Number(address ?? '');
  if (value === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: value & mask, prefix };
}

function cidrsOverlap(left: string | undefined, right: string | undefined): boolean {
  const a = cidrNetwork(left);
  const b = cidrNetwork(right);
  if (!a || !b) return false;
  const prefix = Math.min(a.prefix, b.prefix);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (a.network & mask) === (b.network & mask);
}

function findAddresses(interfaces: NetworkInterfaceInfo[], address: string | null) {
  if (!address) return [];
  return interfaces.flatMap((iface) =>
    iface.addresses
      .filter((candidate) => candidate.address === address)
      .map((entry) => ({ iface, entry })),
  );
}

function findAddress(interfaces: NetworkInterfaceInfo[], address: string | null) {
  const matches = findAddresses(interfaces, address);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Keep discovery deliberately broad. Only loopback/link-local and the Staff IP
 * are excluded. Topology guesses are warnings, never hidden policy.
 */
export function buildRestrictedNetworkCandidates(
  interfaces: NetworkInterfaceInfo[],
  staffIp: string | null,
): RestrictedNetworkCandidate[] {
  const staff = findAddress(interfaces, staffIp);
  const candidates: RestrictedNetworkCandidate[] = [];

  for (const iface of interfaces) {
    for (const address of iface.addresses) {
      if (
        address.internal ||
        address.address.startsWith('127.') ||
        address.address.startsWith('169.254.') ||
        address.address === staffIp
      ) {
        continue;
      }
      const sameInterface = Boolean(staff && staff.iface.name === iface.name);
      const warnings: RestrictedNetworkCandidate['warnings'] = [];
      if (sameInterface) warnings.push('same-interface');
      if (!sameInterface && staff && cidrsOverlap(staff.entry.cidr, address.cidr)) {
        warnings.push('overlapping-staff-subnet');
      }
      if (isVirtualInterface(iface.name)) warnings.push('virtual-interface');
      if (findAddresses(interfaces, address.address).length > 1) warnings.push('ambiguous-address');
      candidates.push({
        address: address.address,
        cidr: address.cidr,
        interfaceId: networkInterfaceId(iface),
        interfaceName: iface.name,
        mac: normalizedMac(address.mac) ?? undefined,
        relationToStaff: staff
          ? sameInterface
            ? 'same-interface'
            : 'different-interface'
          : 'unknown',
        warnings,
      });
    }
  }
  return candidates.sort(
    (a, b) => a.interfaceName.localeCompare(b.interfaceName) || a.address.localeCompare(b.address),
  );
}

function proxyService(compose: ComposeStatus | null) {
  return compose?.services.find((service) => (service.service || service.name) === 'proxy') ?? null;
}

function isWildcardHostIp(hostIp: string): boolean {
  return hostIp === '0.0.0.0' || hostIp === '::' || hostIp === '[::]' || hostIp === '';
}

function hasRestrictedPublish(compose: ComposeStatus | null, hostIp: string): boolean {
  return Boolean(
    proxyService(compose)?.publishedBindings?.some(
      (binding) =>
        binding.hostIp === hostIp &&
        binding.publishedPort === 443 &&
        binding.targetPort === 444 &&
        binding.protocol.toLowerCase() === 'tcp',
    ),
  );
}

export function buildRestrictedNetworkStatus(input: {
  env: Map<string, string>;
  interfaces: NetworkInterfaceInfo[];
  staffIp: string | null;
  tls: TlsStatus;
  compose: ComposeStatus | null;
  platform?: string;
}): RestrictedNetworkStatus {
  const hostIp = input.env.get(RESTRICTED_NETWORK_IP_ENV)?.trim() || null;
  const location = findAddress(input.interfaces, hostIp);
  const staff = findAddress(input.interfaces, input.staffIp);
  const portalHostname = input.tls.portalHostname?.trim() || null;
  if (!hostIp) {
    return {
      phase: 'unconfigured',
      health: 'not-configured',
      binding: null,
      exposedSurfaces: ['patient-portal'],
      portalHostname,
      lastError: null,
    };
  }

  const sameInterface = Boolean(location && staff && location.iface.name === staff.iface.name);
  const persistedInterfaceId = input.env.get(RESTRICTED_NETWORK_INTERFACE_ID_ENV)?.trim() || null;
  const currentInterfaceId = location ? networkInterfaceId(location.iface) : null;
  const interfaceMatches = !persistedInterfaceId || persistedInterfaceId === currentInterfaceId;
  const binding = {
    hostIp,
    interfaceId: persistedInterfaceId || currentInterfaceId || 'unresolved',
    interfaceName: location?.iface.name ?? 'nicht zugeordnet',
    sameInterfaceConfirmed:
      input.env.get(RESTRICTED_NETWORK_SAME_INTERFACE_CONFIRMED_ENV) === 'true',
    warningsConfirmed: input.env.get(RESTRICTED_NETWORK_WARNINGS_CONFIRMED_ENV) === 'true',
  };
  const applied = input.env.get(RESTRICTED_NETWORK_ENABLED_ENV) === 'true';
  const published = hasRestrictedPublish(input.compose, hostIp);
  const platformSupported = (input.platform ?? process.platform) === 'darwin';
  const certificateReady = Boolean(
    portalHostname &&
    input.tls.certificate &&
    restrictedCertificateCoversHostname(portalHostname, input.tls.certificate.names),
  );
  const blocked =
    !platformSupported ||
    !location ||
    !interfaceMatches ||
    !portalHostname ||
    !input.tls.cutoverApplied ||
    !certificateReady;
  return {
    phase: applied ? 'applied' : 'prepared',
    health: blocked
      ? 'blocked'
      : applied
        ? !input.compose
          ? null
          : !published
            ? 'degraded'
            : sameInterface
              ? 'warning-shared-interface'
              : 'healthy'
        : 'prepared',
    binding,
    exposedSurfaces: ['patient-portal'],
    portalHostname,
    lastError: null,
  };
}

export function restrictedCertificateCoversHostname(hostname: string, names: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return names.some((raw) => {
    const name = raw.trim().toLowerCase();
    if (name === normalized) return true;
    if (!name.startsWith('*.')) return false;
    const suffix = name.slice(1);
    return normalized.endsWith(suffix) && normalized.split('.').length === name.split('.').length;
  });
}

export async function buildRestrictedNetworkInspect(input: {
  env: Map<string, string>;
  interfaces: NetworkInterfaceInfo[];
  staffIp: string | null;
  tls: TlsStatus;
  compose: ComposeStatus | null;
  platform?: string;
  resolve4?: (hostname: string) => Promise<string[]>;
  resolvePublic4?: (hostname: string) => Promise<string[]>;
}): Promise<RestrictedNetworkInspectResult> {
  const platform = input.platform ?? process.platform;
  const status = buildRestrictedNetworkStatus({ ...input, platform });
  const staff = findAddress(input.interfaces, input.staffIp);
  const candidates = buildRestrictedNetworkCandidates(input.interfaces, input.staffIp);
  const checks: RestrictedNetworkInspectResult['checks'] = [];
  const supported = platform === 'darwin';
  checks.push({
    id: 'restricted.platform',
    ok: supported,
    message: supported
      ? 'Der separate Patientenzugang wird unter macOS unterstützt.'
      : 'Der separate Patientenzugang wird derzeit nur unter macOS unterstützt.',
  });
  const certificateReady = Boolean(
    input.tls.mode === 'managed' &&
    input.tls.wildcardCertificateName &&
    status.portalHostname &&
    input.tls.certificate &&
    restrictedCertificateCoversHostname(status.portalHostname, input.tls.certificate.names),
  );
  checks.push({
    id: 'restricted.tls',
    ok: Boolean(input.tls.cutoverApplied && status.portalHostname && certificateReady),
    message:
      input.tls.cutoverApplied && status.portalHostname && certificateReady
        ? 'HTTPS ist für den Portal-Hostnamen vorbereitet'
        : input.tls.mode !== 'managed'
          ? 'Richten Sie zuerst unter „HTTPS“ ein automatisch verwaltetes Zertifikat ein. Dieses wird auch für den Patientenzugang benötigt.'
          : 'Das eingerichtete HTTPS-Zertifikat deckt den Portal-Hostnamen nicht ab',
  });

  let dns: RestrictedNetworkDnsObservation = {
    state: 'not-applicable',
    hostname: status.portalHostname,
    expectedIp: status.binding?.hostIp ?? null,
    addresses: [],
    publicAddresses: [],
  };
  if (status.binding && status.portalHostname && input.resolve4 && input.resolvePublic4) {
    const [addresses, publicAddresses] = await Promise.all([
      input.resolve4(status.portalHostname).catch((): string[] => []),
      input.resolvePublic4(status.portalHostname).catch((): string[] => []),
    ]);
    const exactMatch = (resolved: string[]) =>
      resolved.length > 0 && resolved.every((address) => address === status.binding!.hostIp);
    const localMatches = exactMatch(addresses);
    const publicMatches = exactMatch(publicAddresses);
    const localUnresolved = publicMatches && addresses.length === 0;
    dns = {
      state:
        publicMatches && localMatches
          ? 'match'
          : localUnresolved
            ? 'local-unresolved'
            : publicAddresses.length > 0 || addresses.length > 0
              ? 'mismatch'
              : 'missing',
      hostname: status.portalHostname,
      expectedIp: status.binding.hostIp,
      addresses,
      publicAddresses,
      reason: localUnresolved ? 'dns-rebind' : undefined,
    };
    checks.push({
      id: 'restricted.portal-dns-public',
      ok: publicMatches,
      message: publicMatches
        ? 'Portal-A-Record ist öffentlich vorhanden'
        : publicAddresses.length > 0
          ? 'Portal-A-Record zeigt öffentlich nicht auf die Restricted-IP'
          : 'Portal-A-Record konnte öffentlich nicht bestätigt werden',
      detail: publicMatches
        ? `${status.portalHostname} → ${status.binding.hostIp}`
        : status.portalHostname.endsWith(`.${TLS_OPERATOR_ZONE_DEFAULT}`)
          ? `Der Betreiber muss ${status.portalHostname} als A-Record auf ${status.binding.hostIp} setzen.`
          : `In der eigenen DNS-Zone ${status.portalHostname} als A-Record auf ${status.binding.hostIp} setzen.`,
    });
    checks.push({
      id: 'restricted.portal-dns-local',
      ok: localMatches,
      message: localMatches
        ? 'Portal-Adresse ist im lokalen Netz auflösbar'
        : localUnresolved
          ? 'DNS-Rebind-Schutz, lokaler DNS-Filter oder DNS-Cache möglich'
          : addresses.length > 0
            ? 'Portal-Adresse zeigt im lokalen Netz nicht auf die Restricted-IP'
            : 'Portal-Adresse ist im lokalen Netz nicht auflösbar',
      detail: localUnresolved
        ? `Der öffentliche A-Record stimmt. Praxis-IT: DNS-Rebind-Ausnahme für ${status.portalHostname.endsWith(`.${TLS_OPERATOR_ZONE_DEFAULT}`) ? TLS_OPERATOR_ZONE_DEFAULT : status.portalHostname} prüfen und die lokale DNS-Auflösung anschließend erneut testen.`
        : localMatches
          ? `${status.portalHostname} → ${status.binding.hostIp}`
          : undefined,
    });
  }

  if (status.binding) {
    const local = findAddress(input.interfaces, status.binding.hostIp);
    const currentInterfaceId = local ? networkInterfaceId(local.iface) : null;
    const bindingMatches = Boolean(local && currentInterfaceId === status.binding.interfaceId);
    checks.push({
      id: 'restricted.local-ip',
      ok: bindingMatches,
      message: !local
        ? 'Gespeicherte Restricted-IP ist am Rechner nicht vorhanden'
        : bindingMatches
          ? 'Restricted-IP ist dem gespeicherten Interface zugeordnet'
          : 'Restricted-IP liegt nicht mehr auf dem gespeicherten Interface',
    });
    if (status.phase === 'applied') {
      const bindings = proxyService(input.compose)?.publishedBindings;
      const noGlobalPublishes = Boolean(
        bindings && bindings.every((binding) => !isWildcardHostIp(binding.hostIp)),
      );
      checks.push({
        id: 'restricted.binding.no-global-publish',
        ok: noGlobalPublishes,
        message: noGlobalPublishes
          ? 'Proxy besitzt keine globalen IPv4-/IPv6-Publishes'
          : 'Proxy-Bindings sind unbekannt oder enthalten einen globalen Publish',
      });
      checks.push({
        id: 'restricted.binding.proxy',
        ok: hasRestrictedPublish(input.compose, status.binding.hostIp),
        message: hasRestrictedPublish(input.compose, status.binding.hostIp)
          ? 'Proxy veröffentlicht 443 der Restricted-IP ausschließlich auf Listener 444'
          : 'Restricted-Publish weicht vom vorgesehenen Binding ab',
      });
      const runtimeChecks = auditStaffPublishedBindings({
        compose: input.compose,
        staffIp: input.staffIp,
        proxyEnabled: true,
        proxyHttpPort: Number(input.env.get('PROXY_HTTP_PORT') || 80),
        proxyHttpsEnabled: true,
        proxyHttpsPort: Number(input.env.get('PROXY_HTTPS_PORT') || 443),
        restrictedIp: status.binding.hostIp,
      });
      const requiredRuntimeChecks = new Set([
        'staff.binding.app',
        'staff.binding.sandbox',
        'staff.binding.proxy',
      ]);
      const runtimeFailure = runtimeChecks.find(
        (check) => requiredRuntimeChecks.has(check.id) && !check.ok,
      );
      const observedRuntimeChecks = new Set(runtimeChecks.map((check) => check.id));
      const missingRuntimeCheck = [...requiredRuntimeChecks].find(
        (id) => !observedRuntimeChecks.has(id),
      );
      checks.push({
        id: 'restricted.binding.runtime-contract',
        ok: !runtimeFailure && !missingRuntimeCheck,
        message:
          runtimeFailure || missingRuntimeCheck
            ? 'Runtime-Publishes weichen vom vollständigen Binding-Vertrag ab'
            : 'App, Sandbox und Proxy besitzen exakt die vorgesehenen Publishes',
        detail:
          runtimeFailure?.detail ??
          (missingRuntimeCheck
            ? `Runtime-Audit unvollständig: ${missingRuntimeCheck} fehlt.`
            : undefined),
      });
    }
  }

  if (status.phase === 'applied') {
    const failedRuntimeCheck = checks.some(
      (check) =>
        !check.ok &&
        (check.id.startsWith('restricted.portal-dns-') ||
          check.id.startsWith('restricted.binding.')),
    );
    if (failedRuntimeCheck) status.health = 'degraded';
  } else if (dns.state !== 'not-applicable' && dns.state !== 'match') {
    status.health = 'blocked';
  }

  return {
    inspectedAt: new Date().toISOString(),
    status,
    capabilities: {
      platform,
      supported,
      message: supported
        ? 'macOS-Pfad verfügbar; reale Zwei-NIC-Abnahme bleibt erforderlich.'
        : 'Windows und weitere Hostplattformen sind noch nicht freigegeben.',
    },
    staff: { hostIp: input.staffIp, interfaceName: staff?.iface.name ?? null },
    candidates,
    dns,
    checks,
    externalResponsibilities: [
      'Host-Firewall und Routing durch die Praxis-IT',
      'Physische oder logische Netztrennung durch die Praxis-IT',
      'Abnahme aus dem realen Patientennetz',
    ],
  };
}
