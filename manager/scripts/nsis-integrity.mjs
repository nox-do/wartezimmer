import { crc32, inflateRawSync } from 'node:zlib';

const signature = Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex');

/** NSIS 3 firstheader and CRC boundary; Authenticode data may follow the CRC. */
export function inspectNsis(buffer) {
  if (buffer.toString('ascii', 0, 2) !== 'MZ') throw new Error('NSIS: missing PE header');
  let offset = 512;
  for (; offset + 28 <= buffer.length; offset += 512) {
    if (buffer.subarray(offset + 4, offset + 20).equals(signature)) break;
  }
  if (offset + 28 > buffer.length) throw new Error('NSIS: header not found');
  const flags = buffer.readUInt32LE(offset);
  if (flags & ~15 || flags & 4) throw new Error('NSIS: unsupported flags or disabled CRC');
  const end = offset + buffer.readUInt32LE(offset + 24);
  if (end < offset + 32 || end > buffer.length) throw new Error('NSIS: truncated payload');
  const expected = buffer.readUInt32LE(end - 4);
  const actual = crc32(buffer.subarray(512, end - 4));
  if (actual !== expected) {
    throw new Error(
      `NSIS CRC mismatch: expected ${expected.toString(16)}, got ${actual.toString(16)}`,
    );
  }
  return { offset, end, flags };
}

/**
 * electron-builder 26.15.3's macOS UninstallerReader copies the installer stub
 * but omits NSIS's uninstall-icon patches. Reproduce EW_WRITEUNINSTALLER from
 * NSIS 3.0.4 exec.c: patch the stub, then append the compiled uninstall payload.
 * Never rewrite a checksum to make corrupt bytes pass.
 */
export function reconstructUninstaller(buffer) {
  const { offset, end } = inspectNsis(buffer);
  let previous = null;
  let result = null;
  for (let position = offset + 28; position < end - 4; ) {
    if (position + 4 > end - 4) throw new Error('NSIS: truncated block');
    const encodedSize = buffer.readUInt32LE(position);
    position += 4;
    const size = encodedSize & 0x7fffffff;
    if (!size || position + size > end - 4) throw new Error('NSIS: invalid block size');
    const bytes = buffer.subarray(position, position + size);
    const block =
      encodedSize & 0x80000000
        ? inflateRawSync(bytes, { maxOutputLength: 32 * 1024 * 1024 })
        : bytes;
    position += size;
    if (block.subarray(4, 20).equals(signature)) {
      if (result || !previous) throw new Error('NSIS: ambiguous uninstall payload');
      const stub = Buffer.from(buffer.subarray(0, offset));
      let cursor = 0;
      for (;;) {
        if (cursor + 4 > previous.length) throw new Error('NSIS: truncated icon patches');
        const length = previous.readUInt32LE(cursor);
        cursor += 4;
        if (!length) break;
        if (cursor + 4 > previous.length) throw new Error('NSIS: missing icon offset');
        const target = previous.readUInt32LE(cursor);
        cursor += 4;
        if (target < 512 || target + length > stub.length || cursor + length > previous.length) {
          throw new Error('NSIS: icon patch outside executable stub');
        }
        previous.copy(stub, target, cursor, cursor + length);
        cursor += length;
      }
      if (cursor !== previous.length) throw new Error('NSIS: trailing icon patch data');
      result = Buffer.concat([stub, block]);
      if (!(inspectNsis(result).flags & 1)) throw new Error('NSIS: not an uninstaller');
    }
    previous = block;
  }
  if (!result) throw new Error('NSIS: uninstall payload not found');
  return result;
}
