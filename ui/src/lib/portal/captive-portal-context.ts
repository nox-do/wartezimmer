const STORAGE_KEY = 'portal:captive-context';

export type CaptivePortalContext = {
  clientIp?: string;
  clientMac?: string;
  gatewayToken?: string;
  gatewayAddress?: string;
  authDir?: string;
  originUrl?: string;
};

function readParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function normalizeClientMac(raw: string): string {
  const cleaned = raw.trim().replace(/-/g, ':').toUpperCase();
  if (/^[0-9A-F]{12}$/.test(cleaned.replace(/:/g, ''))) {
    const hex = cleaned.replace(/:/g, '');
    return hex.match(/.{1,2}/g)?.join(':') ?? cleaned;
  }
  return cleaned;
}

export function readCaptivePortalContextFromUrl(url: URL): CaptivePortalContext | null {
  const clientIp = readParam(url.searchParams, 'clientip', 'clientIp');
  const clientMacRaw = readParam(url.searchParams, 'clientmac', 'clientMac');
  const gatewayToken = readParam(url.searchParams, 'tok', 'token');
  const gatewayAddress = readParam(url.searchParams, 'gatewayaddress', 'gatewayAddress');
  const authDir = readParam(url.searchParams, 'authdir', 'authDir');
  const originUrl = readParam(url.searchParams, 'originurl', 'originUrl', 'redir');

  if (!clientIp && !clientMacRaw) {
    return null;
  }

  return {
    clientIp: clientIp ?? undefined,
    clientMac: clientMacRaw ? normalizeClientMac(clientMacRaw) : undefined,
    gatewayToken: gatewayToken ?? undefined,
    gatewayAddress: gatewayAddress ?? undefined,
    authDir: authDir ?? undefined,
    originUrl: originUrl ?? undefined,
  };
}

export function storeCaptivePortalContext(context: CaptivePortalContext): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function readCaptivePortalContext(): CaptivePortalContext | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CaptivePortalContext;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearCaptivePortalContext(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function stripCaptivePortalQuery(url: URL): URL {
  const next = new URL(url.href);
  for (const key of [
    'clientip',
    'clientIp',
    'clientmac',
    'clientMac',
    'tok',
    'token',
    'gatewayaddress',
    'gatewayAddress',
    'authdir',
    'authDir',
    'originurl',
    'originUrl',
    'redir',
    'gatewayname',
    'gatewaymac',
    'clientif',
  ]) {
    next.searchParams.delete(key);
  }
  return next;
}
