const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

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

/**
 * Pulls only the immutable, release-approved Caddy digest and then assigns the
 * runtime tag used by Compose. This function is called exclusively by explicit
 * release builders; normal Manager/Compose operation never pulls Caddy.
 */
export function preparePinnedProxyImage({ imageRef, registryDigest, run, runCapture }) {
  const sourceRef = pinnedImageRef(imageRef, registryDigest);

  console.log(`Pulling approved proxy image ${sourceRef} …`);
  run('docker', ['pull', sourceRef]);

  const source = parseImageInspection(
    runCapture('docker', ['image', 'inspect', sourceRef]),
    sourceRef,
  );

  run('docker', ['image', 'tag', sourceRef, imageRef]);
  const tagged = parseImageInspection(
    runCapture('docker', ['image', 'inspect', imageRef]),
    imageRef,
  );

  if (source.imageId !== tagged.imageId || source.platform !== tagged.platform) {
    throw new Error(
      `Proxy-Image-Prüfung fehlgeschlagen: ${imageRef} entspricht nicht ${sourceRef}.`,
    );
  }

  console.log(
    `Verified ${imageRef}: ${tagged.imageId} (${tagged.platform}), registry ${registryDigest}`,
  );
  return {
    registryDigest: registryDigest.toLowerCase(),
    archiveImageId: tagged.imageId,
    platform: tagged.platform,
  };
}
