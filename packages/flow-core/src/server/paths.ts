import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Project root — works from `src/server/` and compiled `dist/server/`. */
export function projectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../..');
}
