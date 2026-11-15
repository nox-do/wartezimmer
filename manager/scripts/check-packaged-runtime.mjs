import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [executable, expectedNode] = process.argv.slice(2);
assert.ok(
  executable && expectedNode,
  'Usage: check-packaged-runtime.mjs <executable> <node-version>',
);
const expectedElectron = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).devDependencies.electron;
const result = spawnSync(
  executable,
  [
    '-e',
    `const assert = require('node:assert/strict');
     const zlib = require('node:zlib');
     const message = Buffer.from('Wartezimmer runtime smoke');
     assert.deepEqual(zlib.brotliDecompressSync(zlib.brotliCompressSync(message)), message);
     const db = new (require('node:sqlite').DatabaseSync)(':memory:');
     assert.equal(db.prepare('SELECT 42 AS value').get().value, 42);
     db.close();
     console.log(JSON.stringify(process.versions));`,
  ],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30_000 },
);
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const versions = JSON.parse(result.stdout.trim());
assert.equal(versions.electron, expectedElectron);
assert.equal(versions.node, expectedNode);
console.log(
  `Packaged runtime OK: Electron ${versions.electron}, Node ${versions.node}, SQLite/Brotli`,
);
