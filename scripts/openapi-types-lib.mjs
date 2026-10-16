import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGeneratedFilesTracked, repoRootFromImportMeta } from './openapi-lib.mjs';
import { writePrettierFile } from './prettier-write.mjs';

const root = repoRootFromImportMeta(import.meta.url);

export const OPENAPI_TYPE_SPECS = [
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

export function listOpenApiTypeOutputs(group) {
  if (group !== 'ui' && group !== 'app' && group !== 'all') {
    throw new Error(`unknown openapi type group: ${group}`);
  }

  const outputs = [];
  for (const entry of OPENAPI_TYPE_SPECS) {
    if ((group === 'ui' || group === 'all') && entry.ui) {
      outputs.push(entry.ui);
    }
    if ((group === 'app' || group === 'all') && entry.app) {
      outputs.push(entry.app);
    }
  }
  return outputs;
}

function jobsForGroup(group) {
  const jobs = [];
  for (const entry of OPENAPI_TYPE_SPECS) {
    const relativeOutput = entry[group];
    if (!relativeOutput) {
      continue;
    }
    jobs.push({
      input: path.join(root, 'openapi', entry.spec),
      output: path.join(root, relativeOutput),
    });
  }
  return jobs;
}

export async function generateOpenApiTypes({ group, label, check = false }) {
  const bin = path.join(root, 'ui/node_modules/.bin/openapi-typescript');
  if (!fs.existsSync(bin)) {
    console.error(`${label}: run npm install in ui workspace first (openapi-typescript).`);
    process.exit(1);
  }

  const jobs = jobsForGroup(group);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-openapi-types-'));
  try {
    for (const spec of jobs) {
      const output = path.join(temporary, path.basename(spec.output));
      const result = spawnSync(bin, [spec.input, '-o', output], { cwd: root, stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${label}: generator failed (${result.status}).`);
      if (!check) fs.mkdirSync(path.dirname(spec.output), { recursive: true });
      await writePrettierFile(spec.output, fs.readFileSync(output, 'utf8'), { check });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log(`${label}: ${check ? 'checked' : 'wrote'} ${jobs.length} files.`);
}

export async function checkOpenApiTypesSync({ group, label }) {
  await generateOpenApiTypes({ group, label, check: true });
  assertGeneratedFilesTracked(listOpenApiTypeOutputs(group), label, root);
  console.log(`${label}: OK`);
}
