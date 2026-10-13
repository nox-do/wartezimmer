import { Arch, build, Platform } from 'electron-builder';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishReleaseArtifacts } from '../../scripts/release-output.mjs';
import { verifyMacApp } from './verify-macos-architecture.mjs';
import { verifyPackagedFiles } from './check-packaged-files.mjs';

const artifacts = await build({
  projectDir: fileURLToPath(new URL('..', import.meta.url)),
  targets: Platform.MAC.createTarget('dmg', Arch.arm64, Arch.x64),
  publish: 'never',
  config: {
    ...(process.env.WARTEZIMMER_ELECTRON_DIST
      ? { electronDist: process.env.WARTEZIMMER_ELECTRON_DIST }
      : {}),
    afterPack: async ({ appOutDir, arch, packager }) => {
      verifyMacApp(path.join(appOutDir, `${packager.appInfo.productFilename}.app`), Arch[arch]);
      verifyPackagedFiles(
        path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents/Resources'),
      );
    },
  },
});
const installers = artifacts.filter((artifact) => artifact.endsWith('.dmg'));
if (
  installers.length !== 2 ||
  !['arm64', 'x64'].every((arch) => installers.some((file) => file.endsWith(`-${arch}.dmg`)))
) {
  throw new Error('Expected separate ARM64 and x64 DMG installers');
}
publishReleaseArtifacts(installers);
