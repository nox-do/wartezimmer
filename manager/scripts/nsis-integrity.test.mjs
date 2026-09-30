import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { inspectNsis, reconstructUninstaller } from './nsis-integrity.mjs';

const signature = Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex');
function header(size, flags = 0) {
  const result = Buffer.alloc(28);
  result.writeUInt32LE(flags);
  signature.copy(result, 4);
  result.writeUInt32LE(size, 24);
  return result;
}
function appendCrc(bytes) {
  const result = Buffer.concat([bytes, Buffer.alloc(4)]);
  result.writeUInt32LE(crc32(result.subarray(512, -4)), result.length - 4);
  return result;
}
function block(bytes) {
  const compressed = deflateRawSync(bytes);
  const size = Buffer.alloc(4);
  size.writeUInt32LE((compressed.length | 0x80000000) >>> 0);
  return Buffer.concat([size, compressed]);
}
function fixture(target = 600) {
  const stub = Buffer.alloc(1024);
  stub.write('MZ');
  const patched = Buffer.from(stub);
  patched.write('icon', 600);
  const payload = header(36, 1);
  const expected = appendCrc(Buffer.concat([patched, payload, Buffer.alloc(4)]));
  const patches = Buffer.alloc(16);
  patches.writeUInt32LE(4);
  patches.writeUInt32LE(target, 4);
  patches.write('icon', 8);
  const blocks = Buffer.concat([block(patches), block(expected.subarray(1024))]);
  const installer = appendCrc(Buffer.concat([stub, header(28 + blocks.length + 4), blocks]));
  return { installer, expected, stub };
}

test('reconstructs NSIS icon patches without changing the embedded checksum', () => {
  const { installer, expected, stub } = fixture();
  assert.throws(() => inspectNsis(Buffer.concat([stub, expected.subarray(1024)])), /CRC mismatch/);
  assert.deepEqual(reconstructUninstaller(installer), expected);
  assert.equal(inspectNsis(expected).flags, 1);
});

test('rejects corrupt outer bytes, truncation and out-of-bounds icon patches', () => {
  const { installer } = fixture();
  const corrupt = Buffer.from(installer);
  corrupt[700] ^= 1;
  assert.throws(() => reconstructUninstaller(corrupt), /CRC mismatch/);
  assert.throws(() => inspectNsis(installer.subarray(0, -1)), /truncated/);
  assert.throws(() => reconstructUninstaller(fixture(1023).installer), /outside executable stub/);
});

test('does not cover up incorrect patch contents by recalculating CRC', () => {
  assert.throws(() => reconstructUninstaller(fixture(601).installer), /CRC mismatch/);
});

test('checks the declared CRC boundary even with trailing signature data', () => {
  const { installer } = fixture();
  assert.equal(
    inspectNsis(Buffer.concat([installer, Buffer.from('signature')])).end,
    installer.length,
  );
  const bad = Buffer.from(installer);
  bad.writeUInt32LE(4, 1024);
  assert.throws(() => inspectNsis(bad), /disabled CRC/);
});
