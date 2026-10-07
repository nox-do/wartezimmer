import net from 'node:net';
import type {
  ComposePublishedBinding,
  ComposeServiceStatus,
  ComposeStatus,
  NetworkBindingCheck,
} from '@praxis-flow/server-shared';
import { assessGatewayBridgeBind } from '@praxis-flow/server-shared';
import { canRunGatewayCompose } from './docker.js';
import { listNetworkInterfaces, type NetworkInterfaceInfo } from './network.js';
import { DEFAULT_APP_PORT } from './urls.js';

export type { NetworkBindingCheck } from '@praxis-flow/server-shared';

export const DEFAULT_GATEWAY_BRIDGE_PORT = 9100;
export const DEFAULT_PROXY_HTTP_PORT = 80;
export const DEFAULT_PROXY_HTTPS_PORT = 443;

export function interfaceExists(interfaces: NetworkInterfaceInfo[], name: string): boolean {
  return interfaces.some((iface) => iface.name === name);
}

export function interfaceHasIpv4(
  interfaces: NetworkInterfaceInfo[],
  ifaceName: string,
  address: string,
): boolean {
  const iface = interfaces.find((item) => item.name === ifaceName);
  if (!iface) {
    return false;
  }
  return iface.addresses.some((entry) => entry.address === address);
}

export function hostHasLanIp(interfaces: NetworkInterfaceInfo[], lanIp: string): boolean {
  return interfaces.some((iface) =>
    iface.addresses.some((entry) => !entry.internal && entry.address === lanIp),
  );
}

export function probeTcpPort(host: string, port: number, timeoutMs = 2_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('timeout', () => finish(false));
  });
}

function composeServiceRunning(compose: ComposeStatus | null, serviceName: string): boolean {
  return (
    compose?.services.some((service) => {
      const name = service.service || service.name;
      return name === serviceName && service.state.toLowerCase().includes('running');
    }) ?? false
  );
}

function runningComposeService(
  compose: ComposeStatus | null,
  serviceName: string,
): ComposeServiceStatus | null {
  return (
    compose?.services.find((service) => {
      const name = service.service || service.name;
      return name === serviceName && service.state.toLowerCase().includes('running');
    }) ?? null
  );
}

function bindingKey(binding: ComposePublishedBinding): string {
  return [
    binding.hostIp,
    binding.publishedPort,
    binding.targetPort,
    binding.protocol.toLowerCase(),
  ].join('|');
}

function describeBindings(bindings: ComposePublishedBinding[]): string {
  if (bindings.length === 0) {
    return 'keine Host-Publishes';
  }
  return bindings
    .map(
      (binding) =>
        `${binding.hostIp}:${binding.publishedPort} -> ${binding.targetPort}/${binding.protocol}`,
    )
    .join(', ');
}

function checkServiceBindings(input: {
  service: ComposeServiceStatus | null;
  serviceLabel: string;
  checkId: string;
  expected: ComposePublishedBinding[];
  optional?: ComposePublishedBinding[];
}): NetworkBindingCheck[] {
  if (!input.service) {
    return [];
  }
  const actual = input.service.publishedBindings;
  if (actual === undefined) {
    return [
      {
        id: input.checkId,
        ok: false,
        message: `${input.serviceLabel}-Bindung konnte nicht vollständig ermittelt werden`,
        detail: 'Docker-Publisher und docker inspect lieferten keinen eindeutigen Host-IP-Vertrag.',
      },
    ];
  }
  const expectedKeys = new Set(input.expected.map(bindingKey));
  const allowedKeys = new Set([...input.expected, ...(input.optional ?? [])].map(bindingKey));
  const actualKeys = new Set(actual.map(bindingKey));
  const matches =
    [...expectedKeys].every((key) => actualKeys.has(key)) &&
    [...actualKeys].every((key) => allowedKeys.has(key));
  const optionalDetail = input.optional?.length
    ? ` Während der HTTPS-Inbetriebnahme zusätzlich zulässig: ${describeBindings(input.optional)}.`
    : '';
  return [
    {
      id: input.checkId,
      ok: matches,
      message: matches
        ? `${input.serviceLabel} ist nur an die vorgesehenen Host-Adressen gebunden`
        : `${input.serviceLabel} besitzt unerwartete Host-Bindings`,
      detail: `Ist: ${describeBindings(actual)}. Soll: ${describeBindings(input.expected)}.${optionalDetail}`,
    },
  ];
}

/** Pure runtime audit for the mode-dependent app/proxy publish policy. */
export function auditStaffPublishedBindings(input: {
  compose: ComposeStatus | null;
  staffIp: string | null;
  proxyEnabled: boolean;
  proxyHttpPort?: number;
  proxyHttpsEnabled?: boolean;
  /** During TLS commissioning, 443 may already be published but is not required yet. */
  proxyHttpsOptional?: boolean;
  proxyHttpsPort?: number;
  restrictedIp?: string | null;
}): NetworkBindingCheck[] {
  if (!input.compose?.services.some((service) => service.state.toLowerCase().includes('running'))) {
    return [];
  }
  const staffIp = input.staffIp?.trim() || null;
  const proxyHttpPort = input.proxyHttpPort ?? DEFAULT_PROXY_HTTP_PORT;
  const proxyHttpsPort = input.proxyHttpsPort ?? DEFAULT_PROXY_HTTPS_PORT;
  const proxyHttpsBinding: ComposePublishedBinding | null = staffIp
    ? {
        hostIp: staffIp,
        publishedPort: proxyHttpsPort,
        targetPort: 443,
        protocol: 'tcp',
      }
    : null;
  const appExpected: ComposePublishedBinding[] = [
    {
      hostIp: input.proxyEnabled ? '127.0.0.1' : '0.0.0.0',
      publishedPort: DEFAULT_APP_PORT,
      targetPort: DEFAULT_APP_PORT,
      protocol: 'tcp',
    },
    { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
  ];
  const proxyExpected: ComposePublishedBinding[] = staffIp
    ? [
        { hostIp: staffIp, publishedPort: proxyHttpPort, targetPort: 80, protocol: 'tcp' },
        ...(input.proxyHttpsEnabled && proxyHttpsBinding ? [proxyHttpsBinding] : []),
        ...(input.restrictedIp
          ? [
              {
                hostIp: input.restrictedIp,
                publishedPort: 443,
                targetPort: 444,
                protocol: 'tcp',
              },
            ]
          : []),
      ]
    : [];

  const checks = [
    ...checkServiceBindings({
      service: runningComposeService(input.compose, 'app'),
      serviceLabel: 'App',
      checkId: 'staff.binding.app',
      expected: appExpected,
    }),
    ...checkServiceBindings({
      service: runningComposeService(input.compose, 'sandbox'),
      serviceLabel: 'Sandbox',
      checkId: 'staff.binding.sandbox',
      expected: [],
    }),
  ];
  if (!input.proxyEnabled) {
    const appCheck = checks.find((check) => check.id === 'staff.binding.app');
    if (appCheck?.ok) {
      appCheck.message = 'App läuft im initialen Betriebsmodus';
      appCheck.detail =
        '0.0.0.0:8080 ist auf allen Host-Interfaces erreichbar. Für Staff-Isolation den Proxy aktivieren.';
    }
  }
  if (input.proxyEnabled) {
    if (!staffIp) {
      checks.push({
        id: 'staff.binding.proxy',
        ok: false,
        message: 'Proxy-Bindung gesperrt — Staff-IP fehlt',
        detail: 'Im Manager zuerst die Adresse dieses Rechners auswählen und bestätigen.',
      });
    } else {
      checks.push(
        ...checkServiceBindings({
          service: runningComposeService(input.compose, 'proxy'),
          serviceLabel: 'Proxy',
          checkId: 'staff.binding.proxy',
          expected: proxyExpected,
          optional:
            input.proxyHttpsOptional && !input.proxyHttpsEnabled && proxyHttpsBinding
              ? [proxyHttpsBinding]
              : undefined,
        }),
      );
    }
  }
  return checks;
}

function readGatewayFromEnv(env: Map<string, string>): {
  enabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
} {
  const gatewayInterface = env.get('GATEWAY_INTERFACE')?.trim();
  const bridgeUrl = env.get('GATEWAY_AUTH_BRIDGE_URL')?.trim();
  return {
    enabled: Boolean(gatewayInterface || bridgeUrl),
    gatewayInterface: gatewayInterface || 'eth1',
    gatewayIp: env.get('GATEWAY_IP')?.trim() || '192.168.88.1',
  };
}

function readEnvPort(env: Map<string, string>, key: string, fallback: number): number {
  const parsed = Number.parseInt(env.get(key)?.trim() || String(fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

export async function auditNetworkBindings(input: {
  env: Map<string, string>;
  compose: ComposeStatus | null;
  configuredLanIp: string | null;
  gatewayComposeSupported?: boolean;
  interfaces?: NetworkInterfaceInfo[];
}): Promise<NetworkBindingCheck[]> {
  const interfaces = input.interfaces ?? listNetworkInterfaces();
  const checks: NetworkBindingCheck[] = [];
  const gateway = readGatewayFromEnv(input.env);
  const gatewaySupported = input.gatewayComposeSupported ?? canRunGatewayCompose();
  const bridgePort = Number.parseInt(
    input.env.get('GATEWAY_AUTH_BRIDGE_PORT')?.trim() || String(DEFAULT_GATEWAY_BRIDGE_PORT),
    10,
  );
  const bridgeBind = input.env.get('GATEWAY_AUTH_BRIDGE_BIND')?.trim() || '0.0.0.0';
  const appRunning = composeServiceRunning(input.compose, 'app');
  const gatewayRunning = composeServiceRunning(input.compose, 'gateway');

  if (appRunning) {
    const appListenOk = await probeTcpPort('127.0.0.1', 8080);
    checks.push({
      id: 'app.port',
      ok: appListenOk,
      message: appListenOk
        ? 'Wartezimmer erreichbar auf Port 8080'
        : 'Port 8080 am Rechner nicht erreichbar',
      // CAUTION: with proxy enabled, product entry is :80 — this check is still the
      // local app publish / loopback path, not the Praxis-Gerät URL.
      detail: 'Terminal, TV und MFA nutzen die LAN-Adresse dieses Rechners.',
    });
  }

  if (input.configuredLanIp) {
    const lanOnHost = hostHasLanIp(interfaces, input.configuredLanIp);
    checks.push({
      id: 'lan.ip-on-host',
      ok: lanOnHost,
      message: lanOnHost
        ? `LAN-Adresse ${input.configuredLanIp} ist an diesem Rechner vergeben`
        : `LAN-Adresse ${input.configuredLanIp} ist an diesem Rechner nicht vergeben`,
      detail: lanOnHost
        ? undefined
        : 'IP hat sich geändert oder ist falsch — unter „Adresse dieses Rechners“ anpassen und übernehmen.',
    });
  }

  const proxyEnabled = ['1', 'true', 'yes', 'on'].includes(
    (input.env.get('PROXY_ENABLED')?.trim() || '').toLowerCase(),
  );
  const proxyMode = input.env.get('PROXY_MODE')?.trim().toLowerCase() || 'off';
  const tlsState = input.env.get('TLS_STATE')?.trim().toLowerCase() || 'off';
  const proxyHttpsEnabled = proxyMode === 'tls-managed' || proxyMode === 'tls-custom';
  const proxyHttpPort = readEnvPort(input.env, 'PROXY_HTTP_PORT', DEFAULT_PROXY_HTTP_PORT);
  const proxyHttpsPort = readEnvPort(input.env, 'PROXY_HTTPS_PORT', DEFAULT_PROXY_HTTPS_PORT);
  checks.push(
    ...auditStaffPublishedBindings({
      compose: input.compose,
      staffIp: input.configuredLanIp,
      proxyEnabled,
      proxyHttpPort,
      proxyHttpsEnabled,
      proxyHttpsOptional: !proxyHttpsEnabled && tlsState !== 'off',
      proxyHttpsPort,
      restrictedIp:
        input.env.get('SETUP_RESTRICTED_ENABLED')?.trim().toLowerCase() === 'true'
          ? input.env.get('SETUP_RESTRICTED_APP_IP')?.trim() || null
          : null,
    }),
  );

  if (!gateway.enabled) {
    return checks;
  }

  // TODO(wlan-boundary): gateway.* checks are filtered out in the Manager Network tab
  // (networkHostChecksForDisplay). Prefer clearing GATEWAY_* via network save; then
  // drop this entire branch and the openNDS-specific helpers below.
  const ifaceName = gateway.gatewayInterface.trim();
  const gatewayIp = gateway.gatewayIp.trim();

  if (!gatewaySupported) {
    checks.push({
      id: 'gateway.platform',
      ok: true,
      message: 'Gateway-Dienst startet nur auf Linux',
      detail: `Werte gespeichert (${ifaceName}, ${gatewayIp}). Am Linux-Gateway mit zweiter Netzwerkkarte einrichten — nicht die WLAN-Adresse dieses Rechners.`,
    });
    checks.push(
      ...buildGatewayBridgeConfigChecks({
        bridgeBind,
        bridgeUrl: input.env.get('GATEWAY_AUTH_BRIDGE_URL')?.trim() ?? '',
        gatewayInterface: ifaceName,
        gatewayIp,
        interfaces,
      }),
    );
    return checks;
  }

  const ifaceOk = interfaceExists(interfaces, ifaceName);
  checks.push({
    id: 'gateway.interface',
    ok: ifaceOk,
    message: ifaceOk
      ? `Netzwerkkarte ${ifaceName} am Gateway vorhanden`
      : `Netzwerkkarte ${ifaceName} am Gateway nicht gefunden`,
    detail: ifaceOk
      ? 'Darüber laufen DHCP und Captive Portal für das Gast-Netz.'
      : 'Netzwerkkarte in der Gateway-Konfiguration prüfen — sonst startet der Dienst nicht.',
  });

  if (ifaceOk && gatewayIp) {
    const ipOk = interfaceHasIpv4(interfaces, ifaceName, gatewayIp);
    checks.push({
      id: 'gateway.ip-on-interface',
      ok: ipOk,
      message: ipOk ? `${gatewayIp} liegt auf ${ifaceName}` : `${gatewayIp} fehlt auf ${ifaceName}`,
      detail: ipOk
        ? undefined
        : 'Gateway-IP muss auf der Gast-Netzwerkkarte gesetzt sein (Praxis-IT oder Host).',
    });
  }

  if (gatewayRunning && Number.isFinite(bridgePort)) {
    const probeHost = bridgeBind === '0.0.0.0' || bridgeBind === '::' ? '127.0.0.1' : bridgeBind;
    const bridgeOk = await probeTcpPort(probeHost, bridgePort);
    checks.push({
      id: 'gateway.bridge-port',
      ok: bridgeOk,
      message: bridgeOk
        ? `Internetfreigabe erreichbar auf Port ${bridgePort}`
        : `Internetfreigabe (Port ${bridgePort}) nicht erreichbar`,
      detail: bridgeOk
        ? 'Wartezimmer kann nach gültiger Wartenummer die Freigabe auslösen.'
        : 'Gateway läuft, aber der Freigabe-Port ist nicht offen.',
    });
  } else if (gateway.enabled && input.compose) {
    checks.push({
      id: 'gateway.compose',
      ok: false,
      message: 'Gateway-Dienst läuft nicht',
      detail: 'Auf dem Linux-Gateway mit zweiter Netzwerkkarte starten.',
    });
  }

  const bridgeUrl = input.env.get('GATEWAY_AUTH_BRIDGE_URL')?.trim() ?? '';
  checks.push(
    ...buildGatewayBridgeConfigChecks({
      bridgeBind,
      bridgeUrl,
      gatewayInterface: ifaceName,
      gatewayIp,
      interfaces,
    }),
  );

  return checks;
}

function buildGatewayBridgeConfigChecks(input: {
  bridgeBind: string;
  bridgeUrl: string;
  gatewayInterface: string;
  gatewayIp: string;
  interfaces: NetworkInterfaceInfo[];
}): NetworkBindingCheck[] {
  const checks: NetworkBindingCheck[] = [];
  if (!input.bridgeUrl) {
    return checks;
  }

  const bindAssessment = assessGatewayBridgeBind(input.bridgeBind, {
    gatewayInterface: input.gatewayInterface,
    gatewayIp: input.gatewayIp,
    interfaces: input.interfaces,
  });
  checks.push({
    id: 'gateway.bridge-bind',
    ok: bindAssessment.level !== 'block',
    message: bindAssessment.message,
    detail:
      bindAssessment.level === 'warn' || bindAssessment.level === 'block'
        ? bindAssessment.detail
        : undefined,
  });

  checks.push({
    id: 'gateway.bridge-reachability',
    ok: true,
    message: 'Erreichbarkeit des Gateway-PCs wird nicht geprüft',
    detail: 'Gateway kommt meist später — IP später unter Netzwerk anpassen.',
  });

  return checks;
}
