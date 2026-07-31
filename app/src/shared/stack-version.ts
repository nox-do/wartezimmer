/**
 * Stack release version baked into the app image at build time
 * (`PRAXIS_FLOW_STACK_VERSION` via Docker ARG). Empty in local/dev builds.
 */
export function resolveStackVersion(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.PRAXIS_FLOW_STACK_VERSION?.trim();
  return raw || null;
}
