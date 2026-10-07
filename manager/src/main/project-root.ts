import fs from 'node:fs';
import path from 'node:path';

function packageNameFromJson(raw: string): string | null {
  const pkg: unknown = JSON.parse(raw);
  if (pkg === null || typeof pkg !== 'object' || !('name' in pkg)) {
    return null;
  }
  return typeof pkg.name === 'string' ? pkg.name : null;
}

function walkProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 12; depth += 1) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      try {
        if (packageNameFromJson(raw) === 'wartezimmer') {
          return current;
        }
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export function findProjectRoot(startDir: string): string {
  const root = walkProjectRoot(startDir);
  if (!root) {
    throw new Error('Monorepo-Root nicht gefunden (package.json)');
  }
  return root;
}
