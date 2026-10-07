import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { parse as parseYaml } from 'yaml';

export const OPENAPI_COMMON_SPEC = 'common.yaml';

export const OPENAPI_DOMAIN_SPECS = [
  'auth.yaml',
  'checkin.yaml',
  'identity.yaml',
  'queue.yaml',
  'documents.yaml',
  'ops.yaml',
];

export const OPENAPI_INTERNAL_ROUTES = new Set([
  'GET /api/v1/queue/stream',
  'GET /api/v1/ops/stream',
  'GET /api/v1/ops/device/stream',
]);

export function repoRootFromImportMeta(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '..');
}

export function listUntrackedGeneratedFiles(relativePaths, root) {
  if (!root) {
    throw new Error('listUntrackedGeneratedFiles: root is required');
  }
  return relativePaths.filter((relativePath) => {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: root,
      stdio: 'ignore',
    });
    return tracked.status !== 0;
  });
}

export function assertGeneratedFilesTracked(relativePaths, label, root) {
  const untracked = listUntrackedGeneratedFiles(relativePaths, root);
  for (const relativePath of untracked) {
    console.error(
      `${label}: ${relativePath} is not tracked in git — git add and commit generated artifacts`,
    );
  }
  if (untracked.length > 0) {
    process.exit(1);
  }
}

export async function loadAndMergeOpenApi(root) {
  const openApiDir = path.join(root, 'openapi');
  const merged = {
    openapi: '3.1.0',
    info: {
      title: 'Wartezimmer API',
      version: '0.4.0',
      description: 'Single-praxis REST API. Source of truth for Fastify validation and UI types.',
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {},
    },
  };

  const commonPath = path.join(openApiDir, OPENAPI_COMMON_SPEC);
  const commonDoc = parseYaml(fs.readFileSync(commonPath, 'utf8'));
  Object.assign(merged.components.schemas, commonDoc.components?.schemas ?? {});

  for (const file of OPENAPI_DOMAIN_SPECS) {
    const filePath = path.join(openApiDir, file);
    const doc = await SwaggerParser.dereference(filePath);
    Object.assign(merged.paths, doc.paths ?? {});
    Object.assign(merged.components.schemas, doc.components?.schemas ?? {});
    Object.assign(merged.components.securitySchemes, doc.components?.securitySchemes ?? {});
  }

  return merged;
}

export function collectOpenApiRoutes(openApiDoc) {
  const routes = new Map();
  for (const [pathKey, pathItem] of Object.entries(openApiDoc.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (pathItem?.[method]) {
        routes.set(`${method.toUpperCase()} ${pathKey}`, {
          method: method.toUpperCase(),
          path: pathKey,
        });
      }
    }
  }
  return routes;
}

/** Inline `#/components/schemas/*` refs using the given components map. */
export function resolveSchemaRefs(schema, components, stack = []) {
  if (schema == null || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry) => resolveSchemaRefs(entry, components, stack));
  }

  if (typeof schema.$ref === 'string') {
    const match = schema.$ref.match(/^#\/components\/schemas\/([^/]+)$/);
    if (!match) {
      return schema;
    }
    const name = match[1];
    if (stack.includes(name)) {
      return { type: 'object' };
    }
    const target = components[name];
    if (!target) {
      return schema;
    }
    return resolveSchemaRefs(structuredClone(target), components, [...stack, name]);
  }

  const result = { ...schema };
  if (result.properties && typeof result.properties === 'object') {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, value]) => [
        key,
        resolveSchemaRefs(value, components, stack),
      ]),
    );
  }
  if (result.items) {
    result.items = resolveSchemaRefs(result.items, components, stack);
  }
  for (const combiner of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = result[combiner].map((entry) =>
        resolveSchemaRefs(entry, components, stack),
      );
    }
  }
  return result;
}

/** Convert OpenAPI 3.1 schema object to JSON Schema for Fastify/Ajv. */
export function toFastifyJsonSchema(schema) {
  if (schema == null || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry) => toFastifyJsonSchema(entry));
  }

  const result = { ...schema };
  delete result.example;
  delete result.examples;
  delete result.description;
  delete result.discriminator;
  delete result.xml;

  if (result.nullable === true) {
    if (typeof result.type === 'string') {
      result.type = [result.type, 'null'];
    } else if (Array.isArray(result.type) && !result.type.includes('null')) {
      result.type = [...result.type, 'null'];
    }
    if (Array.isArray(result.enum) && !result.enum.includes(null)) {
      result.enum = [...result.enum, null];
    }
    delete result.nullable;
  }

  if (result.properties && typeof result.properties === 'object') {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, value]) => [key, toFastifyJsonSchema(value)]),
    );
  }

  if (result.items) {
    result.items = toFastifyJsonSchema(result.items);
  }

  for (const combiner of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = result[combiner].map((entry) => toFastifyJsonSchema(entry));
    }
  }

  return result;
}

export function serializeSchemaAsTs(name, schema) {
  const json = JSON.stringify(schema, null, 2);
  return `export const ${name} = ${json} as const;\n`;
}

export function writeGeneratedTsHeader(specLabel) {
  return `/**
 * AUTO-GENERATED from openapi/${specLabel} — do not edit.
 * Run: npm run generate:api-schemas
 */
`;
}

function collectPathParamsSchema(pathKey, operation, pathItem = {}) {
  const pathParamNames = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (pathParamNames.length === 0) {
    return null;
  }

  const allParams = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const properties = {};
  const required = [];

  for (const name of pathParamNames) {
    const param = allParams.find((entry) => entry.in === 'path' && entry.name === name);
    properties[name] = toFastifyJsonSchema(param?.schema ?? { type: 'string', minLength: 1 });
    required.push(name);
  }

  return {
    type: 'object',
    required,
    additionalProperties: false,
    properties,
  };
}

export function extractOperationSchemas(pathKey, method, operation, pathItem = {}) {
  const schemas = {};
  const prefix = `${method.toUpperCase()}${pathKey.replace(/[^a-zA-Z0-9]+/g, '_')}`;

  const pathParams = collectPathParamsSchema(pathKey, operation, pathItem);
  if (pathParams) {
    schemas[`${prefix}Params`] = pathParams;
  }

  const requestBody = operation.requestBody?.content?.['application/json']?.schema;
  if (requestBody) {
    schemas[`${prefix}RequestBody`] = toFastifyJsonSchema(requestBody);
  }

  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    const statusCode = status.replace(/[^0-9]/g, '');
    if (!statusCode) {
      continue;
    }
    const schema = response?.content?.['application/json']?.schema;
    if (schema) {
      schemas[`${prefix}Response${statusCode}`] = toFastifyJsonSchema(schema);
    }
  }

  return schemas;
}

export async function loadDomainSpec(root, specFile) {
  const filePath = path.join(root, 'openapi', specFile);

  if (specFile === OPENAPI_COMMON_SPEC) {
    const common = parseYaml(fs.readFileSync(filePath, 'utf8'));
    return {
      openapi: '3.1.0',
      info: common.info ?? { title: 'Wartezimmer Common Schemas', version: '0.0.0' },
      paths: {},
      components: {
        schemas: common.components?.schemas ?? {},
        securitySchemes: {},
      },
    };
  }

  return SwaggerParser.dereference(filePath);
}
