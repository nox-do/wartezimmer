export const DEFAULT_GATEWAY_BRIDGE_PORT = 9100;

export type GatewayBridgeInterfaceAddress = {
  address: string;
};

export type GatewayBridgeInterface = {
  name: string;
  addresses: GatewayBridgeInterfaceAddress[];
};

export type GatewayBridgeValidationContext = {
  gatewayInterface: string;
  gatewayIp: string;
  interfaces?: GatewayBridgeInterface[];
};

export type GatewayBridgeBindAssessment = {
  level: 'ok' | 'warn' | 'block';
  message: string;
  detail?: string;
};

const IPV4_LIKE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isIpv4Like(value: string): boolean {
  const trimmed = value.trim();
  if (!IPV4_LIKE.test(trimmed)) {
    return false;
  }
  return trimmed.split('.').every((octet) => {
    const parsed = Number.parseInt(octet, 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 255;
  });
}

export function buildGatewayBridgeUrl(
  managementIp: string,
  port = DEFAULT_GATEWAY_BRIDGE_PORT,
): string {
  const host = managementIp.trim();
  if (!host) {
    return '';
  }
  return `http://${host}:${port}`;
}

export function parseGatewayManagementIpFromBridgeUrl(
  bridgeUrl: string | null | undefined,
): string | null {
  const trimmed = bridgeUrl?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const hostname = parsed.hostname.trim();
    return hostname || null;
  } catch {
    return null;
  }
}

/** Bind address for auth-bridge.py — hostname from bridge URL (e.g. Praxis-LAN-IP of gateway PC). */
export function deriveGatewayBridgeBindFromUrl(bridgeUrl: string): string {
  const hostname = parseGatewayManagementIpFromBridgeUrl(bridgeUrl);
  if (!hostname) {
    throw new Error('invalid gateway bridge URL');
  }
  return hostname;
}

export function validateGatewayManagementIp(
  managementIp: string,
  context: GatewayBridgeValidationContext,
): string | null {
  const ip = managementIp.trim();
  if (!ip) {
    return 'Bitte die Praxis-/Management-IP des Gateway-PCs eingeben.';
  }

  if (ip === '0.0.0.0') {
    return null;
  }

  if (!isIpv4Like(ip)) {
    return 'Bitte eine gültige IPv4-Adresse eingeben (z. B. 192.168.10.25).';
  }

  const guestIp = context.gatewayIp.trim();
  if (guestIp && ip === guestIp) {
    return 'Die Management-IP darf nicht die Gast-Netz-IP des Gateways sein.';
  }

  const ifaceName = context.gatewayInterface.trim();
  const interfaces = context.interfaces ?? [];
  if (ifaceName && interfaces.length > 0) {
    const guestIface = interfaces.find((iface) => iface.name === ifaceName);
    if (guestIface?.addresses.some((entry) => entry.address === ip)) {
      return 'Die Management-IP darf nicht auf der Gast-Netzwerkkarte des Gateways liegen.';
    }
  }

  return null;
}

export function assessGatewayBridgeBind(
  bind: string,
  context: GatewayBridgeValidationContext,
): GatewayBridgeBindAssessment {
  const trimmed = bind.trim();
  if (!trimmed) {
    return {
      level: 'block',
      message: 'Internetfreigabe: Bind-Adresse fehlt',
      detail: 'GATEWAY_AUTH_BRIDGE_BIND bzw. Management-IP des Gateway-PCs setzen.',
    };
  }

  if (trimmed === '0.0.0.0' || trimmed === '::') {
    return {
      level: 'warn',
      message: 'Internetfreigabe lauscht auf allen Schnittstellen (0.0.0.0)',
      detail:
        'Empfohlen: Praxis-/Management-IP des Gateway-PCs — nicht die Gast-Netzwerkkarte.',
    };
  }

  const guestIp = context.gatewayIp.trim();
  if (guestIp && trimmed === guestIp) {
    return {
      level: 'block',
      message: 'Internetfreigabe ist an die Gast-Netz-IP gebunden',
      detail: 'Bind-Adresse muss die Praxis-/Management-IP des Gateway-PCs sein.',
    };
  }

  const ifaceName = context.gatewayInterface.trim();
  const interfaces = context.interfaces ?? [];
  if (ifaceName && interfaces.length > 0) {
    const onGuestNic = interfaceHasIpv4(interfaces, ifaceName, trimmed);
    if (onGuestNic) {
      return {
        level: 'block',
        message: 'Internetfreigabe liegt auf der Gast-Netzwerkkarte',
        detail: `Adresse ${trimmed} gehört zu ${ifaceName} — Praxis-/Management-IP wählen.`,
      };
    }
  }

  return {
    level: 'ok',
    message: `Internetfreigabe gebunden an ${trimmed}`,
  };
}

function interfaceHasIpv4(
  interfaces: GatewayBridgeInterface[],
  ifaceName: string,
  address: string,
): boolean {
  const iface = interfaces.find((item) => item.name === ifaceName);
  if (!iface) {
    return false;
  }
  return iface.addresses.some((entry) => entry.address === address);
}
