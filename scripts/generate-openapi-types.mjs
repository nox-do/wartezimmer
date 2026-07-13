#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatFileInPlace } from './prettier-write.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'ui/node_modules/.bin/openapi-typescript');

const specs = [
  {
    input: path.join(root, 'openapi/ops.yaml'),
    output: path.join(root, 'ui/src/lib/ops/generated/ops-openapi.d.ts'),
  },
  {
    input: path.join(root, 'openapi/queue.yaml'),
    output: path.join(root, 'ui/src/lib/queue/generated/queue-openapi.d.ts'),
  },
  {
    input: path.join(root, 'openapi/documents.yaml'),
    output: path.join(root, 'ui/src/lib/documents/generated/documents-openapi.d.ts'),
  },
  {
    input: path.join(root, 'openapi/checkin.yaml'),
    output: path.join(root, 'ui/src/lib/terminal/generated/checkin-openapi.d.ts'),
  },
  {
    input: path.join(root, 'openapi/auth.yaml'),
    output: path.join(root, 'ui/src/lib/auth/generated/auth-openapi.d.ts'),
  },
];

if (!fs.existsSync(bin)) {
  console.error(
    'generate-openapi-types: run npm install in ui workspace first (openapi-typescript).',
  );
  process.exit(1);
}

for (const spec of specs) {
  fs.mkdirSync(path.dirname(spec.output), { recursive: true });
  const result = spawnSync(bin, [spec.input, '-o', spec.output], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  await formatFileInPlace(spec.output);
}
