#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  extractOperationSchemas,
  loadDomainSpec,
  OPENAPI_COMMON_SPEC,
  repoRootFromImportMeta,
  resolveSchemaRefs,
  serializeSchemaAsTs,
  toFastifyJsonSchema,
  writeGeneratedTsHeader,
} from './openapi-lib.mjs';
import { writePrettierFile } from './prettier-write.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const check = process.argv.includes('--check');
const outDir = path.join(root, 'app/src/api/generated');

const DOMAIN_FILES = [
  { spec: OPENAPI_COMMON_SPEC, exportName: 'commonSchemas', componentsOnly: true },
  { spec: 'auth.yaml', exportName: 'authSchemas', componentsOnly: false },
  { spec: 'checkin.yaml', exportName: 'checkinSchemas', componentsOnly: false },
  { spec: 'queue.yaml', exportName: 'queueSchemas', componentsOnly: false },
  { spec: 'identity.yaml', exportName: 'identitySchemas', componentsOnly: false },
  {
    spec: 'documents.yaml',
    outSpec: 'sessions',
    exportName: 'sessionsSchemas',
    componentsOnly: false,
    pathPrefix: '/api/v1/portal/sessions',
    includeComponents: false,
  },
  { spec: 'ops.yaml', exportName: 'opsSchemas', componentsOnly: false },
];

if (!check) fs.mkdirSync(outDir, { recursive: true });

for (const entry of DOMAIN_FILES) {
  const {
    spec,
    exportName,
    componentsOnly,
    pathPrefix,
    includeComponents = true,
    outSpec = spec.replace('.yaml', ''),
  } = entry;
  const doc = await loadDomainSpec(root, spec);
  const headerLabel = pathPrefix ? `${spec} (${pathPrefix})` : spec;
  const parts = [writeGeneratedTsHeader(headerLabel)];

  const components = doc.components?.schemas ?? {};
  if (includeComponents) {
    for (const [name, schema] of Object.entries(components)) {
      parts.push(
        serializeSchemaAsTs(name, toFastifyJsonSchema(resolveSchemaRefs(schema, components))),
      );
    }
  }

  if (!componentsOnly) {
    for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
      if (pathPrefix && !pathKey.startsWith(pathPrefix)) {
        continue;
      }
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem?.[method];
        if (!operation) {
          continue;
        }
        const operationSchemas = extractOperationSchemas(pathKey, method, operation, pathItem);
        for (const [name, schema] of Object.entries(operationSchemas)) {
          parts.push(serializeSchemaAsTs(name, schema));
        }
      }
    }
  }

  const schemaNames = parts
    .slice(1)
    .map((chunk) => chunk.match(/^export const (\w+)/)?.[1])
    .filter(Boolean);

  parts.push(
    `export const ${exportName} = {\n${schemaNames.map((name) => `  ${name},`).join('\n')}\n} as const;\n`,
  );

  const outFile = path.join(outDir, `${outSpec}.fastify-schemas.ts`);
  await writePrettierFile(outFile, parts.join('\n'), { check });
  console.log(
    `generate-fastify-schemas: ${check ? 'checked' : 'wrote'} ${path.relative(root, outFile)} (${schemaNames.length} schemas)`,
  );
}
