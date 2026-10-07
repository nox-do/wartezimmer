import fs from 'node:fs';
import path from 'node:path';

function walkProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 12; depth += 1) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      try {
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'wartezimmer') {
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

export function findProjectRootOptional(startDir = process.cwd()): string | null {
  return walkProjectRoot(startDir);
}

export function findProjectRoot(startDir = process.cwd()): string {
  const root = walkProjectRoot(startDir);
  if (!root) {
    throw new Error('PROJECT_ROOT_NOT_FOUND: run from the wartezimmer repository');
  }
  return root;
}
