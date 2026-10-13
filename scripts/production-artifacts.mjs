import fs from 'node:fs';
import path from 'node:path';

export function isBuildArtifact(name) {
  return (
    /\.(?:map|ts|tsx|mts|cts|tsbuildinfo)$/i.test(name) ||
    /\.(?:test|spec)\.[cm]?js$/i.test(name) ||
    /(?:-test-fixtures|^test-setup-context|^test-runtime-mocks)\.[cm]?js$/i.test(name) ||
    name === '.DS_Store' ||
    name.startsWith('._')
  );
}
export function isTestDirectory(name) {
  return ['test', 'tests', '__tests__', 'test-helpers', 'fixtures', '__fixtures__'].includes(name);
}

/** Inspect our payloads only; third-party node_modules have their own runtime file contracts. */
export function assertProductionTree(directory) {
  const findings = [];
  function visit(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const full = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) findings.push(relative);
      else if (entry.isDirectory()) {
        if (
          isTestDirectory(entry.name) ||
          ['node_modules', '.git', 'src', 'backups', 'dumps'].includes(entry.name)
        )
          findings.push(relative + '/');
        else visit(full, relative + '/');
      } else if (
        isBuildArtifact(entry.name) ||
        /\.(?:mp4|mp3|mov|wav|pem|key|sqlite|db|bak)$/i.test(entry.name) ||
        (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example')
      )
        findings.push(relative);
    }
  }
  visit(directory);
  if (findings.length)
    throw new Error(`Unwanted production files in ${directory}:\n${findings.join('\n')}`);
}
