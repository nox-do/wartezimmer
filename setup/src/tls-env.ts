type EnvLike = Map<string, string> | Record<string, string | undefined> | null | undefined;

function readEnvValue(env: EnvLike, key: string): string | undefined {
  if (!env) {
    return undefined;
  }
  if (env instanceof Map) {
    return env.get(key);
  }
  return env[key];
}

/** TLS journey started but cutover not applied yet — network must not undo proxy/identity. */
export function isTlsPreparationInProgressEnv(env: EnvLike): boolean {
  const state = readEnvValue(env, 'TLS_STATE')?.trim() || 'off';
  if (state === 'off') {
    return false;
  }
  const cutover = readEnvValue(env, 'TLS_CUTOVER_APPLIED')?.trim().toLowerCase() || '';
  return !['1', 'true', 'yes', 'on'].includes(cutover);
}

export function tlsPreparationLanIpSyncUpdates(
  env: Map<string, string>,
  nextLanIp: string,
): Record<string, string> {
  if (!isTlsPreparationInProgressEnv(env)) {
    return {};
  }
  const trimmed = nextLanIp.trim();
  const current = env.get('TLS_LAN_IP')?.trim();
  if (!current || current === trimmed) {
    return {};
  }
  return { TLS_LAN_IP: trimmed };
}
