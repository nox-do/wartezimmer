#!/usr/bin/env node

import path from 'node:path';
import {
  collectOpenApiRoutes,
  loadAndMergeOpenApi,
  OPENAPI_INTERNAL_ROUTES,
  repoRootFromImportMeta,
} from './openapi-lib.mjs';
import { collectRegisteredAppRoutes } from './fastify-route-scan.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const routesDir = path.join(root, 'app/src/routes');

function normalizePath(pathKey) {
  return pathKey.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const registered = collectRegisteredAppRoutes(routesDir);

const openApiDoc = await loadAndMergeOpenApi(root);
const documented = collectOpenApiRoutes(openApiDoc);

const registeredNormalized = new Map();
for (const route of registered.values()) {
  registeredNormalized.set(`${route.method} ${normalizePath(route.path)}`, route);
}

const missingInOpenApi = [...registeredNormalized.keys()].filter(
  (key) => !documented.has(key) && !OPENAPI_INTERNAL_ROUTES.has(key),
);
const missingInApp = [...documented.keys()].filter((key) => !registeredNormalized.has(key));

let failed = false;

if (missingInOpenApi.length > 0) {
  failed = true;
  console.error('check-openapi-route-sync: routes implemented but missing in OpenAPI:');
  for (const key of missingInOpenApi.sort()) {
    console.error(`  - ${key}`);
  }
}

if (missingInApp.length > 0) {
  failed = true;
  console.error('check-openapi-route-sync: paths documented in OpenAPI but not registered in app:');
  for (const key of missingInApp.sort()) {
    console.error(`  - ${key}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `check-openapi-route-sync: OK (${registeredNormalized.size} app routes, ${documented.size} openapi paths, ${OPENAPI_INTERNAL_ROUTES.size} internal exceptions)`,
);
