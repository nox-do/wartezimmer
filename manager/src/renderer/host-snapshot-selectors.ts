import type {
  ComposeServiceStatus,
  ComposeStatus,
  DockerStatus,
  HostStatus,
  ProbeResult,
  SandboxScannerStatus,
} from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';

/**
 * Pure readers over config + runtime. Prefer runtime when present; never write back.
 * Overlapping fields must not be merged into configSnapshot.
 */

export function effectiveCompose(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): ComposeStatus | null {
  return runtime?.compose ?? config?.compose ?? null;
}

export function effectiveDocker(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): DockerStatus | null {
  return runtime?.docker ?? config?.docker ?? null;
}

export function effectiveProbes(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): ProbeResult[] {
  return runtime?.probes ?? config?.probes ?? [];
}

export function effectiveSandboxScanner(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): SandboxScannerStatus | null {
  return runtime?.sandboxScanner ?? config?.sandboxScanner ?? null;
}

export function effectiveEnvExists(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): boolean {
  return runtime?.envExists ?? config?.envExists ?? false;
}

/** Configured LAN IP: runtime poll mirrors .env; prefer runtime when available. */
export function effectiveConfiguredLanIp(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): string | null {
  if (runtime) {
    return runtime.configuredLanIp;
  }
  return config?.network.configuredLanIp ?? null;
}

export function effectiveAppBaseUrl(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): string | null {
  return runtime?.appBaseUrl ?? config?.appBaseUrl ?? null;
}

/**
 * Proxy container is runtime; HostStatus.proxy.container is legacy until Etappe 4.
 * Once a runtime snapshot exists, its proxyServer (including null) is authoritative —
 * do not revive a stale config.proxy.container.
 */
export function effectiveProxyContainer(
  config: HostStatus | null,
  runtime: HostRuntimeHealth | null,
): ComposeServiceStatus | null {
  if (runtime) {
    return runtime.proxyServer?.container ?? null;
  }
  return config?.proxy.container ?? null;
}
