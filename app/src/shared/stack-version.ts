/**
 * Stack release version baked into the app image at build time
 * (`WARTEZIMMER_STACK_VERSION` via Docker ARG). Empty in local/dev builds.
 */
export function resolveStackVersion(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.WARTEZIMMER_STACK_VERSION?.trim();
  return raw || null;
}
