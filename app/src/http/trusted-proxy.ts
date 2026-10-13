import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS?.trim() === 'true';
}

// The Docker proxy service can start after the app and change address on recreation.
// Resolve it on requests, cache briefly, and fail closed if resolution fails.
export const trustedProxyAddresses = new Set<string>();
let refreshedAt = 0;
let resolving: Promise<void> | undefined;
let resolvedHost = '';

export async function refreshTrustedProxyAddresses(): Promise<void> {
  if (!trustProxyHeaders()) return;
  const host = process.env.TRUST_PROXY_HOST?.trim() || 'proxy';
  if (host === resolvedHost && Date.now() - refreshedAt < 1000) return;
  if (resolving) return resolving;
  resolving = (async () => {
    const addresses = new Set<string>();
    try {
      const peers = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      for (const peer of peers) {
        addresses.add(peer.address.toLowerCase());
        if (isIP(peer.address) === 4) addresses.add(`::ffff:${peer.address}`);
      }
    } catch {
      // No known proxy: forwarded values must remain untrusted.
    }
    trustedProxyAddresses.clear();
    for (const address of addresses) trustedProxyAddresses.add(address);
    resolvedHost = host;
    refreshedAt = Date.now();
  })();
  try {
    await resolving;
  } finally {
    resolving = undefined;
  }
}

export function isTrustedProxyPeer(address: string | undefined): boolean {
  return trustProxyHeaders() && !!address && trustedProxyAddresses.has(address.toLowerCase());
}
