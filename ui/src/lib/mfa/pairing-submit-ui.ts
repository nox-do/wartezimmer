import { tick } from 'svelte';

export const PAIRING_SPINNER_MIN_MS = 400;

export async function beginPairingSubmit(): Promise<number> {
  await tick();
  return Date.now();
}

export async function finishPairingSubmit(startedAt: number): Promise<void> {
  const remaining = PAIRING_SPINNER_MIN_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
