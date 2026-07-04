export const NETWORK_UNREACHABLE_SIGNAL = 'SSE_NETWORK_UNREACHABLE';

const NETWORK_UNREACHABLE_MESSAGES = new Set([
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'Load failed',
  'Network request failed',
]);

export function isBackendUnreachable(message: string, code?: string): boolean {
  return (
    message === NETWORK_UNREACHABLE_SIGNAL ||
    code === 'NETWORK_ERROR' ||
    NETWORK_UNREACHABLE_MESSAGES.has(message)
  );
}

export function toNetworkUnreachableSignal(error: unknown): string | null {
  if (error instanceof TypeError) {
    return NETWORK_UNREACHABLE_SIGNAL;
  }
  if (error instanceof Error && NETWORK_UNREACHABLE_MESSAGES.has(error.message)) {
    return NETWORK_UNREACHABLE_SIGNAL;
  }
  return null;
}
