import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build, Platform, Arch } from 'electron-builder';
import { inspectNsis, reconstructUninstaller } from './nsis-integrity.mjs';
import { publishReleaseArtifacts } from '../../scripts/release-output.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderVersion = require('app-builder-lib/package.json').version;
// This workaround uses a private builder API. Re-evaluate rather than silently
// applying it to a different dependency version.
if (builderVersion !== '26.15.3')
  throw new Error(`Review NSIS workaround for electron-builder ${builderVersion}`);
const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil.js');
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip.js');
if (process.platform === 'darwin') {
  UninstallerReader.exec = async (installer, uninstaller) => {
    const reconstructed = reconstructUninstaller(await fs.readFile(installer));
    await fs.writeFile(uninstaller, reconstructed);
    console.log('NSIS uninstall stub patches applied; original CRC verified.');
  };
}
const artifacts = await build({
  projectDir: root,
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  publish: 'never',
  ...(process.env.WARTEZIMMER_ELECTRON_DIST
    ? { config: { electronDist: process.env.WARTEZIMMER_ELECTRON_DIST } }
    : {}),
});
const installers = artifacts.filter((file) => file.endsWith('-setup.exe'));
if (installers.length !== 1) throw new Error('Expected exactly one Windows installer');
const installer = installers[0];
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-nsis-check-'));
try {
  inspectNsis(await fs.readFile(installer));
  execFileSync(
    await getPath7za(),
    ['e', installer, '$R0/UninstallWartezimmerManager.exe', `-o${temporary}`, '-y'],
    { stdio: 'pipe' },
  );
  const uninstaller = await fs.readFile(path.join(temporary, 'UninstallWartezimmerManager.exe'));
  if (!(inspectNsis(uninstaller).flags & 1)) throw new Error('Expected NSIS uninstaller');
  console.log(`Verified installer AND embedded uninstaller CRC: ${installer}`);
  publishReleaseArtifacts([installer]);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
