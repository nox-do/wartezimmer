import { build, Platform } from 'electron-builder';
import { fileURLToPath } from 'node:url';
import { publishReleaseArtifacts } from '../../scripts/release-output.mjs';

const artifacts = await build({
  projectDir: fileURLToPath(new URL('..', import.meta.url)),
  targets: Platform.MAC.createTarget('dmg'),
  publish: 'never',
  ...(process.env.WARTEZIMMER_ELECTRON_DIST
    ? { config: { electronDist: process.env.WARTEZIMMER_ELECTRON_DIST } }
    : {}),
});
const installers = artifacts.filter((artifact) => artifact.endsWith('.dmg'));
if (!installers.length) throw new Error('Expected a macOS DMG installer');
publishReleaseArtifacts(installers);
