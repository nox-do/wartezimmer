import type { ComposeStatus } from '@praxis-flow/server-shared';
import { resolveProductComposeServices, type ComposeRunOptions } from './docker.js';

export type StackHealthResult = { ok: boolean; errors: string[] };

export type WaitForStackHealthOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type WaitForStackHealthResult = StackHealthResult & { compose: ComposeStatus };

export function evaluateExpectedStackHealth(
  compose: ComposeStatus,
  runOptions: ComposeRunOptions,
): StackHealthResult {
  const errors: string[] = [];
  for (const expected of resolveProductComposeServices(runOptions)) {
    const service = compose.services.find(
      (candidate) => (candidate.service || candidate.name) === expected,
    );
    if (!service) {
      errors.push(`Compose-Service ${expected} fehlt.`);
      continue;
    }
    if (!service.state.toLowerCase().includes('running')) {
      errors.push(
        `Compose-Service ${expected} läuft nicht (Status: ${service.state || 'unknown'}).`,
      );
    }
    if (service.health?.toLowerCase() !== 'healthy') {
      errors.push(
        `Compose-Service ${expected} ist nicht healthy (Status: ${service.health || 'unknown'}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

export function withExpectedStackRunning(
  compose: ComposeStatus,
  runOptions: ComposeRunOptions,
): ComposeStatus {
  return { ...compose, running: evaluateExpectedStackHealth(compose, runOptions).ok };
}

export async function waitForExpectedStackHealth(
  composeStatus: (runOptions: ComposeRunOptions) => Promise<ComposeStatus>,
  runOptions: ComposeRunOptions,
  options: WaitForStackHealthOptions = {},
): Promise<WaitForStackHealthResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;

  while (true) {
    const compose = await composeStatus(runOptions);
    const health = evaluateExpectedStackHealth(compose, runOptions);
    if (health.ok) return { ...health, compose };
    if (now() >= deadline) return { ...health, compose };
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}
