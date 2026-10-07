import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RELEASE_OUTPUT_ROOT = path.join(root, 'dist', 'releases');

export function defaultReleaseVersion() {
  return (
    process.env.WARTEZIMMER_RELEASE_VERSION?.trim() ||
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  );
}

export function releaseDirectory(version, outputRoot = RELEASE_OUTPUT_ROOT) {
  if (typeof version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) {
    throw new Error('Ungültige Release-Version.');
  }
  return path.join(outputRoot, version);
}

export function publishReleaseArtifacts(
  artifacts,
  version = defaultReleaseVersion(),
  outputRoot = RELEASE_OUTPUT_ROOT,
) {
  const destination = releaseDirectory(version, outputRoot);
  fs.mkdirSync(destination, { recursive: true });
  for (const artifact of artifacts) {
    const target = path.join(destination, path.basename(artifact));
    fs.copyFileSync(artifact, target);
    console.log(`Release artifact: ${target}`);
  }
  return destination;
}
