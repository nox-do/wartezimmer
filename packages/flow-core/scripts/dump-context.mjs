import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = join(rootDir, 'dump.txt');

/**
 * Gezielter Review-Dump: nur Dateien aus dem Runtime-Refactoring (2026-07-04).
 * Keine Tests, kein UI.
 */
const DUMP_FILES = [
  'src/server/open-db.ts',
  'src/server/seed.ts',
  'src/server/catalog-repository.ts',
  'src/server/visit-repository.ts',
  'src/server/visit-service.ts',
  'src/server/admin-service.ts',
  'src/server/runtime.ts',
  'src/server/reset-db.ts',
  'src/shared/journey.ts',
  'src/shared/visit-context.ts',
  'todo.md',
];

const missing = DUMP_FILES.filter((relativePath) => !existsSync(join(rootDir, relativePath)));
if (missing.length > 0) {
  console.error('Missing dump files:');
  for (const file of missing) console.error(`  - ${file}`);
  process.exit(1);
}

const sections = DUMP_FILES.map((relativePath) => {
  const content = readFileSync(join(rootDir, relativePath), 'utf8');
  return `# ${relativePath}\n${content.trimEnd()}`;
});

const header = [
  '# Flow Core — Runtime Refactoring Dump',
  `# Generated: ${new Date().toISOString()}`,
  `# Files: ${DUMP_FILES.length}`,
  '',
].join('\n');

writeFileSync(outputFile, `${header}\n${sections.join('\n\n')}\n`, 'utf8');
console.log(`Wrote ${outputFile} (${DUMP_FILES.length} files)`);
for (const file of DUMP_FILES) console.log(`  - ${file}`);
