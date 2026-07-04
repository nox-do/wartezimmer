export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS?.trim() === 'true';
}
