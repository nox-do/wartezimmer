import net from 'node:net';
import type { ComposeStatus, NetworkBindingCheck } from '@praxis-flow/server-shared';
import { assessGatewayBridgeBind } from '@praxis-flow/server-shared';
import { runProcessCommand } from './command-runner.js';
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

/** True only when a running compose service actually publishes this host port. */
export function composeServicePublishesHostPort(
  compose: ComposeStatus | null,
  serviceName: string,
  port: number,
): boolean {
  return (
    compose?.services.some((service) => {
      const name = service.service || service.name;
      if (name !== serviceName || !service.state.toLowerCase().includes('running')) {
        return false;
      }
      return (service.publishedPorts ?? []).includes(port);
    }) ?? false
  );
}

/** Best-effort host process hint via lsof (often generic under Docker Desktop). */
async function portOwnerHint(port: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return null;
  }
  const result = await runProcessCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
  const line = result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('COMMAND'));
  if (!line) {
    return null;
  }
  const [command, pid] = line.split(/\s+/);
  return command && pid ? `${command} (PID ${pid})` : null;
}

async function checkHostPortFree(input: {
  id: string;
  port: number;
  ourPublish: boolean;
}): Promise<NetworkBindingCheck> {
  const inUse = await probeTcpPort('127.0.0.1', input.port);
  if (!inUse) {
    return { id: input.id, ok: true, message: `Port ${input.port} ist frei` };
  }
  if (input.ourPublish) {
    return {
      id: input.id,
      ok: true,
      message: `Port ${input.port} wird von Praxis Flow genutzt`,
    };
  }
  const owner = await portOwnerHint(input.port);
  return {
    id: input.id,
    ok: false,
    message: `Port ${input.port} ist bereits belegt. Praxis Flow kann die App so nicht starten.`,
    detail: owner
      ? `Prozesshinweis: ${owner}. Bitte den anderen Dienst beenden und erneut prüfen.`
      : 'Bitte den anderen Dienst auf diesem Port beenden und erneut prüfen.',
  };
}

type RequiredHostPort = {
  id: string;
  port: number;
  serviceName: string;
  enabled: boolean;
};

/** Preflight: required host ports free, or published by our running compose service. */
export async function auditNetworkPrerequisites(input: {
  compose: ComposeStatus | null;
  gatewayEnabled?: boolean;
  gatewayBridgePort?: number;
  appPort?: number;
  appPublishEnabled?: boolean;
  proxyEnabled?: boolean;
  proxyHttpPort?: number;
  proxyHttpsPort?: number;
  proxyHttpsEnabled?: boolean;
}): Promise<NetworkBindingCheck[]> {
  const appPort = input.appPort ?? DEFAULT_APP_PORT;
  const gatewayBridgePort = input.gatewayBridgePort ?? DEFAULT_GATEWAY_BRIDGE_PORT;
  const proxyHttpPort = input.proxyHttpPort ?? DEFAULT_PROXY_HTTP_PORT;
  const proxyHttpsPort = input.proxyHttpsPort ?? DEFAULT_PROXY_HTTPS_PORT;
  const requiredPorts: RequiredHostPort[] = [
    {
      id: 'preflight.app-port',
      port: appPort,
      serviceName: 'app',
      enabled: input.appPublishEnabled ?? true,
    },
    {
      id: 'preflight.proxy-http-port',
      port: proxyHttpPort,
      serviceName: 'proxy',
      enabled: Boolean(input.proxyEnabled),
    },
    {
      id: 'preflight.proxy-https-port',
      port: proxyHttpsPort,
      serviceName: 'proxy',
      enabled: Boolean(input.proxyEnabled && input.proxyHttpsEnabled),
    },
    {
      id: 'preflight.gateway-bridge-port',
      port: gatewayBridgePort,
      serviceName: 'gateway',
      enabled: Boolean(input.gatewayEnabled),
    },
  ];

  const checks: NetworkBindingCheck[] = [];
  for (const requiredPort of requiredPorts) {
    if (!requiredPort.enabled) {
      continue;
    }
    checks.push(
      await checkHostPortFree({
        id: requiredPort.id,
        port: requiredPort.port,
        ourPublish: composeServicePublishesHostPort(
          input.compose,
          requiredPort.serviceName,
          requiredPort.port,
        ),
      }),
    );
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
        ? 'Praxis Flow erreichbar auf Port 8080'
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
        : 'IP hat sich geändert oder ist falsch — unten anpassen und übernehmen.',
    });
  }

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
        ? 'Praxis Flow kann nach gültiger Wartenummer die Freigabe auslösen.'
        : 'Gateway läuft, aber der Freigabe-Port ist nicht offen.',
    });
  } else if (gateway.enabled) {
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
