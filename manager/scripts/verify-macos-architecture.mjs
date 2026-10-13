import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractAll } from '@electron/asar';

const machOMagic = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
]);

function verifyBinary(file, expectedArchitecture) {
  const architectures = execFileSync('/usr/bin/lipo', ['-archs', file], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/);
  if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
    throw new Error(`Expected ${expectedArchitecture}, got ${architectures.join(', ')}: ${file}`);
  }
  console.log(`Architecture OK: ${file} (${architectures.join(', ')})`);
}

function scan(directory, expectedArchitecture) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) count += scan(file, expectedArchitecture);
    else if (entry.isFile()) {
      const fd = fs.openSync(file, 'r');
      const magic = Buffer.alloc(4);
      try {
        fs.readSync(fd, magic, 0, 4, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (machOMagic.has(magic.toString('hex')) || entry.name.endsWith('.node')) {
        verifyBinary(file, expectedArchitecture);
        count++;
      }
    }
  }
  return count;
}

export function verifyMacApp(app, arch) {
  const expectedArchitecture = { arm64: 'arm64', x64: 'x86_64' }[arch];
  if (!expectedArchitecture) throw new Error(`Unsupported macOS architecture: ${arch}`);
  const contents = path.join(app, 'Contents');
  const executable = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleExecutable', path.join(contents, 'Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  // Require the key executables even if a malformed bundle would evade the scan.
  const required = [
    path.join(contents, 'MacOS', executable),
    path.join(contents, 'Frameworks/Electron Framework.framework/Electron Framework'),
    ...['', ' (GPU)', ' (Plugin)', ' (Renderer)'].map((suffix) =>
      path.join(
        contents,
        'Frameworks',
        `${executable} Helper${suffix}.app`,
        'Contents/MacOS',
        `${executable} Helper${suffix}`,
      ),
    ),
  ];
  for (const file of required) verifyBinary(file, expectedArchitecture);
  let count = scan(contents, expectedArchitecture);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-architecture-check-'));
  try {
    extractAll(path.join(contents, 'Resources/app.asar'), temporary);
    count += scan(temporary, expectedArchitecture);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    `${arch} verification passed: ${count} Mach-O/native files, including ASAR and resources.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error('Usage: node verify-macos-architecture.mjs <app> <arm64|x64>');
  }
  verifyMacApp(path.resolve(process.argv[2]), process.argv[3]);
}
