import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Hash each payload member, never the archive that will contain this manifest. */
export function writeInstallManifest(root, metadata) {
  const files = {};
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && name !== 'manifest.json') {
        const hash = createHash('sha256');
        const fd = fs.openSync(path.join(root, name), 'r');
        try {
          const buffer = Buffer.alloc(1024 * 1024);
          let count;
          while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, count));
          }
        } finally {
          fs.closeSync(fd);
        }
        files[name] = hash.digest('hex');
      } else throw new Error(`PFINSTALL_BUILD_ENTRY_UNSUPPORTED: ${name}`);
    }
  }
  visit('');
  const manifest = { ...metadata, installFormatVersion: 2, files };
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
