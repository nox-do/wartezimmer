import { assertReleasePlatform } from './release-platforms.mjs';
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const PROXY_DOCKERFILE = 'proxy/Dockerfile';
export const PROXY_ACMEDNS_MODULE = 'dns.providers.acmedns';

function parseImageInspection(raw, imageRef) {
  let inspection;
  try {
    const parsed = JSON.parse(raw);
    inspection = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    throw new Error(`Docker-Inspektion für ${imageRef} ist kein gültiges JSON.`);
  }

  const imageId = String(inspection?.Id ?? '')
    .trim()
    .toLowerCase();
  const os = String(inspection?.Os ?? '')
    .trim()
    .toLowerCase();
  const architecture = String(inspection?.Architecture ?? '')
    .trim()
    .toLowerCase();
  if (!SHA256_PATTERN.test(imageId)) {
    throw new Error(`Docker-Image-ID für ${imageRef} ist ungültig: ${imageId || '<leer>'}`);
  }
  if (!os || !architecture) {
    throw new Error(`Docker-Plattform für ${imageRef} fehlt.`);
  }

  return { imageId, platform: `${os}/${architecture}` };
}

export function pinnedImageRef(imageRef, registryDigest) {
  const normalizedRef = String(imageRef ?? '').trim();
  const normalizedDigest = String(registryDigest ?? '')
    .trim()
    .toLowerCase();
  if (!normalizedRef || normalizedRef.includes('@')) {
    throw new Error('Proxy imageRef muss ein Tag ohne Digest sein.');
  }
  if (!SHA256_PATTERN.test(normalizedDigest)) {
    throw new Error('Proxy registryDigest muss ein SHA-256-Digest sein.');
  }
  return `${normalizedRef}@${normalizedDigest}`;
}

function inspectImage(runCapture, imageRef, platform) {
  return parseImageInspection(
    runCapture('docker', [
      'image',
      'inspect',
      ...(platform ? ['--platform', platform] : []),
      imageRef,
    ]),
    imageRef,
  );
}

/**
 * For a build, pulls the approved stock Caddy digest, tags the Compose base name,
 * then builds the delivery proxy (`wartezimmer-proxy:…-acmedns`) from `proxy/Dockerfile`.
 * Pack-only mode verifies the existing local custom image without contacting the registry.
 * Compose HTTP-only defaults stay on stock Caddy; only release packs ship the custom tag.
 */
export function prepareDeliveryProxyImage({
  imageRef,
  baseImageRef,
  registryDigest,
  dockerfile = PROXY_DOCKERFILE,
  context = '.',
  skipBuild = false,
  platform,
  run,
  runCapture,
}) {
  const sourceRef = pinnedImageRef(baseImageRef, registryDigest);

  if (skipBuild) {
    console.log(`Skipping proxy rebuild (--no-build); using local ${imageRef}.`);
    const custom = inspectImage(runCapture, imageRef, platform);
    if (platform) assertReleasePlatform(custom.platform, platform, imageRef);
    const modules = runCapture('docker', [
      'run',
      '--rm',
      ...(platform ? ['--platform', platform] : []),
      imageRef,
      'caddy',
      'list-modules',
    ]);
    if (!String(modules).includes(PROXY_ACMEDNS_MODULE)) {
      throw new Error(`${imageRef} fehlt Modul ${PROXY_ACMEDNS_MODULE}.`);
    }

    console.log(
      `Verified local ${imageRef}: ${custom.imageId} (${custom.platform}), base registry ${registryDigest}`,
    );
    return {
      registryDigest: String(registryDigest).toLowerCase(),
      archiveImageId: custom.imageId,
      platform: custom.platform,
    };
  }

  console.log(`Pulling approved Caddy base ${sourceRef} …`);
  run('docker', ['pull', ...(platform ? ['--platform', platform] : []), sourceRef]);

  const source = inspectImage(runCapture, sourceRef, platform);
  run('docker', ['image', 'tag', sourceRef, baseImageRef]);
  const tagged = inspectImage(runCapture, baseImageRef, platform);

  if (source.imageId !== tagged.imageId || source.platform !== tagged.platform) {
    throw new Error(
      `Proxy-Image-Prüfung fehlgeschlagen: ${baseImageRef} entspricht nicht ${sourceRef}.`,
    );
  }

  if (!skipBuild) {
    console.log(`Building delivery proxy ${imageRef} from ${dockerfile} …`);
    run('docker', [
      ...(platform ? ['buildx', 'build', '--load', '--platform', platform] : ['build']),
      '-f',
      dockerfile,
      '-t',
      imageRef,
      context,
    ]);
  }

  const custom = inspectImage(runCapture, imageRef, platform);
  if (platform) assertReleasePlatform(custom.platform, platform, imageRef);
  const modules = runCapture('docker', [
    'run',
    '--rm',
    ...(platform ? ['--platform', platform] : []),
    imageRef,
    'caddy',
    'list-modules',
  ]);
  if (!String(modules).includes(PROXY_ACMEDNS_MODULE)) {
    throw new Error(`${imageRef} fehlt Modul ${PROXY_ACMEDNS_MODULE}.`);
  }

  console.log(
    `Verified ${imageRef}: ${custom.imageId} (${custom.platform}), base registry ${registryDigest}`,
  );
  return {
    registryDigest: String(registryDigest).toLowerCase(),
    archiveImageId: custom.imageId,
    platform: custom.platform,
  };
}
