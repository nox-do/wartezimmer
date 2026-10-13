import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertProductionTree } from '../../scripts/production-artifacts.mjs';

const require = createRequire(import.meta.url);
// Use the ASAR implementation shipped with our pinned electron-builder toolchain.
export const asar = createRequire(require.resolve('app-builder-lib/package.json'))(
  '@electron/asar',
);

export function verifyPackagedFiles(resources) {
  const files = asar.listPackage(path.join(resources, 'app.asar'));
  const unwanted = files.filter(
    (file) =>
      /\.(?:map|ts|tsx|mts|cts|tsbuildinfo)$/i.test(file) ||
      /\/(?:test|tests|__tests__|benchmark|benchmarks)\//.test(file),
  );
  if (unwanted.length) throw new Error(`Unwanted Manager ASAR entries:\n${unwanted.join('\n')}`);
  assertProductionTree(path.join(resources, 'setup'));
  assertProductionTree(path.join(resources, 'templates'));
  if (!fs.existsSync(path.join(resources, 'LICENSE')))
    throw new Error('Packaged project license missing');
  if (
    !fs
      .readFileSync(path.join(resources, 'LICENSE'))
      .equals(fs.readFileSync(new URL('../../LICENSE', import.meta.url)))
  )
    throw new Error('Packaged project license differs from the canonical LICENSE');
  console.log(`Manager package files OK (${files.length} ASAR entries, no sources/maps/tests).`);
}
