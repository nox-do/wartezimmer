import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build, Platform, Arch } from 'electron-builder';
import { inspectNsis, reconstructUninstaller } from './nsis-integrity.mjs';
import { verifyPackagedFiles } from './check-packaged-files.mjs';
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
  config: {
    ...(process.env.WARTEZIMMER_ELECTRON_DIST
      ? { electronDist: process.env.WARTEZIMMER_ELECTRON_DIST }
      : {}),
    afterPack: ({ appOutDir }) => verifyPackagedFiles(path.join(appOutDir, 'resources')),
  },
});
const installers = artifacts.filter((file) => file.endsWith('-setup.exe'));
if (installers.length !== 1) throw new Error('Expected exactly one Windows installer');
const installer = installers[0];
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-nsis-check-'));
try {
  inspectNsis(await fs.readFile(installer));
  // The builder's standalone Windows 7za can list the PE container without
  // exposing its NSIS members. Full 7-Zip includes the required NSIS handler.
  const sevenZip =
    process.platform === 'win32'
      ? path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe')
      : await getPath7za();
  await fs.access(sevenZip);
  const listing = execFileSync(sevenZip, ['l', '-slt', installer], { encoding: 'utf8' });
  // 7-Zip reports native Windows separators on Windows and POSIX separators on
  // macOS. Match the actual member instead of assuming a platform-specific path.
  const uninstallers = listing
    .split(/\r?\n/)
    .filter((line) => line.startsWith('Path = '))
    .map((line) => line.slice('Path = '.length))
    .filter((entry) => /^Uninstall.*\.exe$/i.test(path.win32.basename(entry)));
  if (uninstallers.length !== 1) {
    throw new Error(
      `Expected one embedded NSIS uninstaller, found ${uninstallers.length}. Archive listing:\n${listing}`,
    );
  }
  const uninstallerEntry = uninstallers[0];
  execFileSync(sevenZip, ['e', installer, uninstallerEntry, `-o${temporary}`, '-y'], {
    stdio: 'pipe',
  });
  const uninstaller = await fs.readFile(
    path.join(temporary, path.win32.basename(uninstallerEntry)),
  );
  if (!(inspectNsis(uninstaller).flags & 1)) throw new Error('Expected NSIS uninstaller');
  console.log(`Verified installer AND embedded uninstaller CRC: ${installer}`);
  publishReleaseArtifacts([installer]);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
