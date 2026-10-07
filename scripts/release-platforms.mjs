export const RELEASE_PLATFORMS = ['linux/amd64', 'linux/arm64'];

export function releasePlatforms(value) {
  if (value === undefined || value === 'all') return [...RELEASE_PLATFORMS];
  const platform = value.includes('/') ? value : `linux/${value}`;
  if (!RELEASE_PLATFORMS.includes(platform)) {
    throw new Error('Ungültige Plattform. Bitte --platform amd64, arm64 oder all verwenden.');
  }
  return [platform];
}

export function architectureTag(ref, platform) {
  return `${ref}-${platform.split('/')[1]}`;
}

export function releaseArchiveName(version, platform) {
  return `wartezimmer-${version}-${platform.replace('/', '-')}.pfinstall`;
}

export function assertReleasePlatform(actual, expected, ref) {
  if (actual !== expected) {
    throw new Error(
      `Falsche Architektur: ${ref} ist ${actual}, benötigt wird ${expected}. Images für die gewählte Plattform neu bauen (ohne --no-build).`,
    );
  }
}
