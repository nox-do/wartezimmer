import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const APP_SRC_ROOT = join(fileURLToPath(import.meta.url), '../../..');

/** Sole production module allowed to mutate flow-core catalog tables. */
const ALLOWED_CATALOG_WRITER = 'shared/flow-core/sync-catalog-from-ops-settings.ts';

const CATALOG_TABLES = [
  'topics',
  'locations',
  'queues',
  'surfaces',
  'surface_display_rules',
  'routing_rules',
  'journey_templates',
  'journey_steps',
] as const;

const CATALOG_DML_PATTERN = new RegExp(
  `\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(${CATALOG_TABLES.join('|')})\\b`,
  'i',
);

function collectTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...collectTypeScriptFiles(absolutePath));
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }
  return files;
}

test('app/src has no catalog DML outside sync-catalog-from-ops-settings', () => {
  const violations: string[] = [];

  for (const absolutePath of collectTypeScriptFiles(APP_SRC_ROOT)) {
    const relativePath = relative(APP_SRC_ROOT, absolutePath).replaceAll('\\', '/');
    if (relativePath.endsWith('.test.ts')) {
      continue;
    }
    if (relativePath === ALLOWED_CATALOG_WRITER) {
      continue;
    }

    const source = readFileSync(absolutePath, 'utf8');
    CATALOG_DML_PATTERN.lastIndex = 0;
    if (CATALOG_DML_PATTERN.test(source)) {
      violations.push(relativePath);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Catalog tables must only be mutated via ${ALLOWED_CATALOG_WRITER}. Violations: ${violations.join(', ')}`,
  );
});
