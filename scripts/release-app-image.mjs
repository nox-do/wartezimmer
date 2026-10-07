/**
 * Canonical `docker build` argv for the app delivery image.
 * Stack-release `--version` is both the image tag and WARTEZIMMER_STACK_VERSION
 * (display copy in /ops/health). Both release scripts must use this helper.
 */

export const APP_IMAGE_REPOSITORY = 'wartezimmer/app';
export const STACK_VERSION_BUILD_ARG = 'WARTEZIMMER_STACK_VERSION';

export function appImageRef(version) {
  const tag = String(version ?? '').trim();
  if (!tag) {
    throw new Error('appImageRef: version is required');
  }
  return `${APP_IMAGE_REPOSITORY}:${tag}`;
}

export function appDockerBuildArgs(version, platform) {
  const tag = String(version ?? '').trim();
  if (!tag) {
    throw new Error('appDockerBuildArgs: version is required');
  }

  return [
    ...(platform ? ['buildx', 'build', '--load', '--platform', platform] : ['build']),
    '-f',
    'app/Dockerfile',
    '-t',
    appImageRef(tag),
    '--build-arg',
    'VITE_API_BASE=',
    '--build-arg',
    `${STACK_VERSION_BUILD_ARG}=${tag}`,
    '--sbom=true',
    '--provenance=mode=max',
    '.',
  ];
}
