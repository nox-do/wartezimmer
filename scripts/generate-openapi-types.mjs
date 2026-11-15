#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { assertGeneratedFilesTracked, repoRootFromImportMeta } from './openapi-lib.mjs';
import { writePrettierFile } from './prettier-write.mjs';

const specs = [
  {
    spec: 'ops.yaml',
    ui: 'ui/src/lib/ops/generated/ops-openapi.d.ts',
    app: 'app/src/api/generated/ops-openapi.d.ts',
  },
  {
    spec: 'queue.yaml',
    ui: 'ui/src/lib/queue/generated/queue-openapi.d.ts',
    app: 'app/src/api/generated/queue-openapi.d.ts',
  },
  {
    spec: 'documents.yaml',
    ui: 'ui/src/lib/documents/generated/documents-openapi.d.ts',
    app: 'app/src/api/generated/documents-openapi.d.ts',
  },
  {
    spec: 'checkin.yaml',
    ui: 'ui/src/lib/terminal/generated/checkin-openapi.d.ts',
    app: 'app/src/api/generated/checkin-openapi.d.ts',
  },
  {
    spec: 'auth.yaml',
    ui: 'ui/src/lib/auth/generated/auth-openapi.d.ts',
    app: 'app/src/api/generated/auth-openapi.d.ts',
  },
  {
    spec: 'identity.yaml',
    app: 'app/src/api/generated/identity-openapi.d.ts',
  },
];

export function openApiTypeJobs(group) {
  if (!['ui', 'app', 'all'].includes(group))
    throw new Error(`Unknown OpenAPI type group: ${group}`);
  const targets = group === 'all' ? ['ui', 'app'] : [group];
  return specs
    .map((entry) => ({
      spec: entry.spec,
      outputs: targets.map((key) => entry[key]).filter(Boolean),
    }))
    .filter((job) => job.outputs.length > 0);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { group: { type: 'string', default: 'ui' }, check: { type: 'boolean' } },
  });
  const jobs = openApiTypeJobs(values.group);
  const root = repoRootFromImportMeta(import.meta.url);
  const require = createRequire(new URL('../ui/package.json', import.meta.url));
  const manifest = require.resolve('openapi-typescript/package.json');
  const cli = path.join(path.dirname(manifest), require(manifest).bin['openapi-typescript']);
  // The CLI suppresses schema warnings when it writes types to stdout.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wartezimmer-openapi-types-'));
  try {
    for (const { spec, outputs } of jobs) {
      const generated = path.join(temporary, path.basename(outputs[0]));
      execFileSync(process.execPath, [cli, `openapi/${spec}`, '-o', generated], {
        cwd: root,
        stdio: 'inherit',
      });
      const source = fs.readFileSync(generated, 'utf8');
      for (const output of outputs) {
        const file = path.join(root, output);
        if (!values.check) fs.mkdirSync(path.dirname(file), { recursive: true });
        await writePrettierFile(file, source, { check: values.check });
      }
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const files = jobs.flatMap((job) => job.outputs);
  if (values.check) assertGeneratedFilesTracked(files, 'generate-openapi-types', root);
  console.log(
    `generate-openapi-types: ${values.check ? 'checked' : 'wrote'} ${files.length} files.`,
  );
}
