import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assertGeneratedFilesTracked, repoRootFromImportMeta } from './openapi-lib.mjs';
import { formatFileInPlace } from './prettier-write.mjs';

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

export async function generateOpenApiTypes({ group, label }) {
  const bin = path.join(root, 'ui/node_modules/.bin/openapi-typescript');
  if (!fs.existsSync(bin)) {
    console.error(`${label}: run npm install in ui workspace first (openapi-typescript).`);
    process.exit(1);
  }

  const jobs = jobsForGroup(group);
  for (const spec of jobs) {
    fs.mkdirSync(path.dirname(spec.output), { recursive: true });
    const result = spawnSync(bin, [spec.input, '-o', spec.output], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    await formatFileInPlace(spec.output);
  }

  if (group === 'app') {
    console.log(`${label}: wrote ${jobs.length} files under app/src/api/generated/`);
  }
}

export async function checkOpenApiTypesSync({ group, label, generateHint }) {
  const generatedFiles = listOpenApiTypeOutputs(group);
  const before = new Map(
    generatedFiles.map((file) => [
      file,
      fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : null,
    ]),
  );
  await generateOpenApiTypes({ group, label });
  let failed = false;
  for (const relativePath of generatedFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      console.error(`${label}: missing ${relativePath}`);
      failed = true;
      continue;
    }
    const previous = before.get(relativePath);
    if (!previous || !previous.equals(fs.readFileSync(path.join(root, relativePath)))) {
      failed = true;
      console.error(`${label}: ${relativePath} is out of date — run ${generateHint} and commit.`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  assertGeneratedFilesTracked(generatedFiles, label, root);
  console.log(`${label}: OK`);
}
