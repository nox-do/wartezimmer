import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Call only under the updater's single-flight lock, before starting freshclam. */
export async function cleanSignatureUpdateResidue(
  directory: string,
  now = Date.now(),
): Promise<number> {
  await fs.mkdir(directory, { recursive: true });
  let removed = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    // Freshclam temporary work directories; never delete databases based on their age.
    if (!entry.isDirectory() || !/^clamav-[a-f0-9]+(?:\.tmp)?$/i.test(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (now - (await fs.lstat(target)).mtimeMs < 24 * 3_600_000) continue;
    await fs.rm(target, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
