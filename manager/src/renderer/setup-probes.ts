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
  status: Pick<HostStatus, 'network' | 'deviceUrls' | 'configuredCanonicalBaseUrl'> & {
    proxy?: HostStatus['proxy'] | null;
  },
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
  options?: {
    /** Additional completion checks, e.g. recovery core health and maintenance auth. */
    additionalReady?: () => Promise<boolean>;
    shouldContinue?: () => boolean;
    maxWaitMs?: number;
    intervalMs?: number;
    /**
     * When false, once local is ok wait briefly for LAN (grace), then return even if LAN is still red.
     * Default true waits for LAN too (wizard first boot).
     */
    requireLan?: boolean;
    /** Extra wait after first local-ok when requireLan is false (default 5s). */
    lanGraceMs?: number;
  },
): Promise<ProbeResult[]> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_PROBE_WAIT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  const requireLan = options?.requireLan !== false;
  const lanGraceMs = options?.lanGraceMs ?? 5_000;
  const deadline = Date.now() + maxWaitMs;
  let last: ProbeResult[] = [];
  let lanGraceDeadline: number | null = null;

  while (Date.now() <= deadline && (options?.shouldContinue?.() ?? true)) {
    const probeResult = await api.runSetupProbes(input);
    last = probeResult.probes;
    if (options?.shouldContinue?.() === false) return last;
    const additionalReady = (await options?.additionalReady?.()) ?? true;
    if (connectionProbesReady(last) && additionalReady) {
      return last;
    }
    if (!requireLan && additionalReady) {
      const local = last.find((probe) => probe.id === 'app.health.local');
      if (local?.ok) {
        if (lanGraceDeadline == null) {
          lanGraceDeadline = Date.now() + lanGraceMs;
        }
        if (Date.now() >= lanGraceDeadline) {
          return last;
        }
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    const graceRemaining =
      lanGraceDeadline == null ? remaining : Math.max(0, lanGraceDeadline - Date.now());
    const waitCap = requireLan || lanGraceDeadline == null ? remaining : graceRemaining;
    const sleepFor = Math.min(intervalMs, remaining, waitCap);
    if (sleepFor <= 0) {
      break;
    }
    await sleep(sleepFor);
  }

  return last;
}
