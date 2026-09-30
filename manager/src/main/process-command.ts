import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Direct Electron Node-mode child: no npm shim, shell, or intermediate process. */
export function devSetupArguments(repoRoot: string): string[] {
  return [
    '--import',
    pathToFileURL(path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs')).href,
    path.join(repoRoot, 'setup/src/server.ts'),
  ];
}
