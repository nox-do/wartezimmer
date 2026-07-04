type GatewayAuthBridgeInput = {
  ticketCode: string;
  clientIp?: string;
  clientMac?: string;
  redirectUrl?: string;
};

type GatewayAuthBridgeSuccess = {
  ok: true;
  redirectUrl: string;
};

type GatewayAuthBridgeFailure = {
  ok: false;
  message: string;
  status?: number;
};

export type GatewayAuthBridgeResult = GatewayAuthBridgeSuccess | GatewayAuthBridgeFailure;

function readGatewayAuthBridgeUrl(): string | null {
  const raw = process.env.GATEWAY_AUTH_BRIDGE_URL?.trim() ?? '';
  return raw.length > 0 ? raw.replace(/\/+$/, '') : null;
}

function readGatewayAuthBridgeTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.GATEWAY_AUTH_BRIDGE_TIMEOUT_MS ?? '5000', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5000;
}

export function isGatewayAuthBridgeConfigured(): boolean {
  return readGatewayAuthBridgeUrl() !== null;
}

export async function pingGatewayAuthBridgeHealth(): Promise<boolean> {
  const baseUrl = readGatewayAuthBridgeUrl();
  if (!baseUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readGatewayAuthBridgeTimeoutMs());

  try {
    const response = await fetch(`${baseUrl}/internal/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function authorizePatientOnGateway(
  input: GatewayAuthBridgeInput,
): Promise<GatewayAuthBridgeResult> {
  const baseUrl = readGatewayAuthBridgeUrl();
  if (!baseUrl) {
    return {
      ok: false,
      message: 'GATEWAY_AUTH_BRIDGE_NOT_CONFIGURED',
    };
  }

  const authKey = process.env.AUTH_KEY_CAPTIVE?.trim() ?? '';
  if (!authKey) {
    return {
      ok: false,
      message: 'AUTH_KEY_CAPTIVE missing',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readGatewayAuthBridgeTimeoutMs());

  try {
    const response = await fetch(`${baseUrl}/internal/nds-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({
        ticketCode: input.ticketCode,
        clientIp: input.clientIp,
        clientMac: input.clientMac,
        redirectUrl: input.redirectUrl,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof (body as { message?: unknown }).message === 'string'
          ? (body as { message: string }).message
          : `Gateway auth bridge returned ${response.status}`;
      return { ok: false, message, status: response.status };
    }

    const redirectUrl =
      typeof body === 'object' &&
      body !== null &&
      'redirectUrl' in body &&
      typeof (body as { redirectUrl?: unknown }).redirectUrl === 'string'
        ? (body as { redirectUrl: string }).redirectUrl
        : (input.redirectUrl ?? '');

    return { ok: true, redirectUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gateway auth bridge request failed';
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }
}
