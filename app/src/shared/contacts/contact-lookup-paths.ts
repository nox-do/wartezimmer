import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_CONTACT_LOOKUP_BASE_PATH = '/imports';

export function resolveContactLookupBasePath(): string {
  return path.resolve(
    process.env.CONTACT_LOOKUP_BASE_PATH?.trim() || DEFAULT_CONTACT_LOOKUP_BASE_PATH,
  );
}

export async function normalizeContactLookupFolderPath(rawPath: string): Promise<string> {
  const candidate = rawPath.trim();
  if (!candidate || !path.isAbsolute(candidate)) {
    throw new Error('CONTACT_LOOKUP_INVALID_PATH');
  }
  const configuredBase = path.resolve(resolveContactLookupBasePath());
  let resolvedBase: string;
  let resolvedFolder: string;
  try {
    [resolvedBase, resolvedFolder] = await Promise.all([
      fs.realpath(configuredBase),
      fs.realpath(candidate),
    ]);
  } catch {
    throw new Error('CONTACT_LOOKUP_INVALID_PATH');
  }
  const relative = path.relative(resolvedBase, resolvedFolder);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('CONTACT_LOOKUP_INVALID_PATH');
  }
  const stat = await fs.stat(resolvedFolder);
  if (!stat.isDirectory()) {
    throw new Error('CONTACT_LOOKUP_INVALID_PATH');
  }
  return resolvedFolder;
}
