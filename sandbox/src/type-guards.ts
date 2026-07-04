export function isExecFileFailure(
  error: unknown,
): error is { code?: number; stdout?: string; stderr?: string } {
  return typeof error === 'object' && error !== null;
}
