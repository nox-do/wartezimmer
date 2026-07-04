import net from 'node:net';
import type { ComposeStatus, NetworkBindingCheck } from '@praxis-flow/server-shared';
import { canRunGatewayCompose } from './docker.js';
import {
  listNetworkInterfaces,
  type NetworkInterfaceInfo,
} from './network.js';


export type { NetworkBindingCheck } from '@praxis-flow/server-shared';

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

export function probeTcpPort(
  host: string,
  port: number,
  timeoutMs = 2_000,
): Promise<boolean> {
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

function gatewayServiceRunning(compose: ComposeStatus | null): boolean {
  return (
    compose?.services.some((service) => {
      const name = service.service || service.name;
      return name === 'gateway' && service.state.toLowerCase().includes('running');
    }) ?? false
  );
}

function appServiceRunning(compose: ComposeStatus | null): boolean {
  return (
    compose?.services.some((service) => {
      const name = service.service || service.name;
      return name === 'app' && service.state.toLowerCase().includes('running');
    }) ?? false
  );
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
    input.env.get('GATEWAY_AUTH_BRIDGE_PORT')?.trim() || '9100',
    10,
  );
  const bridgeBind = input.env.get('GATEWAY_AUTH_BRIDGE_BIND')?.trim() || '0.0.0.0';
  const appRunning = appServiceRunning(input.compose);
  const gatewayRunning = gatewayServiceRunning(input.compose);

  if (appRunning) {
    const appListenOk = await probeTcpPort('127.0.0.1', 8080);
    checks.push({
      id: 'app.port',
      ok: appListenOk,
      message: appListenOk
        ? 'app lauscht auf Host-Port 8080'
        : 'Host-Port 8080 nicht erreichbar',
      detail: 'Docker veröffentlicht 0.0.0.0:8080 — Terminal/TV/MFA nutzen die LAN-IP.',
    });
  }

  if (input.configuredLanIp) {
    const lanOnHost = hostHasLanIp(interfaces, input.configuredLanIp);
    checks.push({
      id: 'lan.ip-on-host',
      ok: lanOnHost,
      message: lanOnHost
        ? `LAN-IP ${input.configuredLanIp} ist am Host vergeben`
        : `LAN-IP ${input.configuredLanIp} ist am Host nicht vergeben`,
      detail: lanOnHost
        ? undefined
        : 'DHCP-Wechsel oder falsche IP in .env — unten anpassen.',
    });
  }

  if (!gateway.enabled) {
    return checks;
  }

  const ifaceName = gateway.gatewayInterface.trim();
  const gatewayIp = gateway.gatewayIp.trim();

  if (!gatewaySupported) {
    checks.push({
      id: 'gateway.platform',
      ok: true,
      message: 'Gateway-Container nur auf Linux — keine Gast-NIC-Prüfung auf macOS/Windows',
      detail: `.env vorbereitet (${ifaceName}, ${gatewayIp}). Am Produktions-PC mit zweiter Netzwerkkarte konfigurieren — nicht die WLAN-IP dieses Rechners.`,
    });
    return checks;
  }

  const ifaceOk = interfaceExists(interfaces, ifaceName);
  checks.push({
    id: 'gateway.interface',
    ok: ifaceOk,
    message: ifaceOk
      ? `Interface ${ifaceName} am Host vorhanden`
      : `Interface ${ifaceName} am Host nicht gefunden`,
    detail: ifaceOk
      ? 'openNDS und dnsmasq binden an GATEWAY_INTERFACE.'
      : 'GATEWAY_INTERFACE in .env prüfen — Container startet sonst nicht.',
  });

  if (ifaceOk && gatewayIp) {
    const ipOk = interfaceHasIpv4(interfaces, ifaceName, gatewayIp);
    checks.push({
      id: 'gateway.ip-on-interface',
      ok: ipOk,
      message: ipOk
        ? `${gatewayIp} liegt auf ${ifaceName}`
        : `${gatewayIp} fehlt auf ${ifaceName}`,
      detail: ipOk
        ? undefined
        : 'Gateway-IP muss auf der Gast-NIC konfiguriert sein (Praxis-IT oder Host).',
    });
  }

  if (gatewayRunning && Number.isFinite(bridgePort)) {
    const probeHost =
      bridgeBind === '0.0.0.0' || bridgeBind === '::' ? '127.0.0.1' : bridgeBind;
    const bridgeOk = await probeTcpPort(probeHost, bridgePort);
    checks.push({
      id: 'gateway.bridge-port',
      ok: bridgeOk,
      message: bridgeOk
        ? `Auth-Bridge lauscht auf ${bridgeBind}:${bridgePort}`
        : `Auth-Bridge (${bridgeBind}:${bridgePort}) nicht erreichbar`,
      detail: bridgeOk
        ? 'Lauscht auf allen Interfaces (0.0.0.0) — app erreicht sie über Docker-Host-IP.'
        : 'gateway-Container läuft, aber Port nicht offen.',
    });
  } else if (gateway.enabled) {
    checks.push({
      id: 'gateway.compose',
      ok: false,
      message: 'gateway-Container läuft nicht',
      detail: 'Stack mit Gateway-Profil starten (Linux-Host mit zweiter NIC).',
    });
  }

  return checks;
}
