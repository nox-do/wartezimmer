import type { HostStatus, ProbeResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { lanProbeBaseUrl } from './reachability.js';

export const DEFAULT_PROBE_WAIT_MS = 45_000;
export const DEFAULT_PROBE_INTERVAL_MS = 2_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function connectionProbesReady(probes: ProbeResult[]): boolean {
  const local = probes.find((probe) => probe.id === 'app.health.local');
  if (!local?.ok) {
    return false;
  }
  const lan = probes.find((probe) => probe.id === 'app.health.lan');
  if (lan && !lan.ok) {
    return false;
  }
  return true;
}

export function buildSetupProbeInput(
  status: Pick<HostStatus, 'network' | 'deviceUrls' | 'configuredCanonicalBaseUrl'>,
): {
  localAppBaseUrl: string;
  lanAppBaseUrl: string | undefined;
} {
  return {
    localAppBaseUrl: 'http://127.0.0.1:8080',
    lanAppBaseUrl: lanProbeBaseUrl(status),
  };
}

export async function pollSetupProbes(
  api: Pick<PraxisManagerApi, 'runSetupProbes'>,
  input: {
    localAppBaseUrl?: string;
    lanAppBaseUrl?: string;
  },
  options?: { maxWaitMs?: number; intervalMs?: number },
): Promise<ProbeResult[]> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_PROBE_WAIT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  const deadline = Date.now() + maxWaitMs;
  let last: ProbeResult[] = [];

  while (Date.now() <= deadline) {
    const probeResult = await api.runSetupProbes(input);
    last = probeResult.probes;
    if (connectionProbesReady(last)) {
      return last;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(intervalMs, remaining));
  }

  return last;
}
