import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Enumerate import files without glob parsing; follow symlinks but stop directory cycles. */
export async function scanImportDirectory(
  basePath: string,
): Promise<{ files: string[]; directories: string[] }> {
  const files: string[] = [];
  const directories: string[] = [];
  async function visit(folder: string, ancestors: Set<string>) {
    const real = await fs.realpath(folder);
    if (ancestors.has(real)) return;
    const nextAncestors = new Set(ancestors).add(real);
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      let kind: { isDirectory(): boolean; isFile(): boolean } = entry;
      if (entry.isSymbolicLink()) {
        try {
          kind = await fs.stat(full);
        } catch {
          continue;
        }
      }
      if (kind.isDirectory()) {
        if (nextAncestors.has(await fs.realpath(full))) continue;
        directories.push(full);
        await visit(full, nextAncestors);
      } else if (kind.isFile() && /\.csv$/i.test(entry.name)) files.push(full);
    }
  }
  await visit(path.resolve(basePath), new Set());
  return {
    files: files.sort((a, b) => a.localeCompare(b)),
    directories: directories.sort((a, b) => a.localeCompare(b)),
  };
}
