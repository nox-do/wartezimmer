#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep runtime JS/data and licenses. Do not follow workspace or .bin symlinks.
export function stripDependencyArtifacts(directory) {
  const stats = { files: 0, directories: 0 };
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (
          [
            'test',
            'tests',
            '__tests__',
            'spec',
            'specs',
            'benchmark',
            'benchmarks',
            'example',
            'examples',
            '.github',
          ].includes(entry.name)
        ) {
          fs.rmSync(full, { recursive: true, force: true });
          stats.directories++;
        } else visit(full);
      } else if (
        /\.(?:map|ts|tsx|mts|cts|tsbuildinfo)$/i.test(entry.name) ||
        entry.name === '.DS_Store' ||
        entry.name.startsWith('._')
      ) {
        fs.unlinkSync(full);
        stats.files++;
      }
    }
  }
  visit(directory);
  return stats;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = path.resolve(process.argv[2] ?? 'node_modules');
  if (path.basename(directory) !== 'node_modules')
    throw new Error('Expected a node_modules directory');
  console.log('Dependency artifacts removed:', stripDependencyArtifacts(directory));
}
