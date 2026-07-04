#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  collectOpenApiRoutes,
  loadAndMergeOpenApi,
  OPENAPI_INTERNAL_ROUTES,
  repoRootFromImportMeta,
} from './openapi-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const routesDir = path.join(root, 'app/src/routes');

function collectRouteFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseRegisteredRoutes(source) {
  const routes = new Map();
  const routeRe =
    /app\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"](\/api\/v1[^'"]+)['"]/gi;
  for (const match of source.matchAll(routeRe)) {
    const method = match[1].toUpperCase();
    routes.set(`${method} ${match[2]}`, { method, path: match[2] });
  }
  return routes;
}

function normalizePath(pathKey) {
  return pathKey.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const registered = new Map();
for (const file of collectRouteFiles(routesDir)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [key, route] of parseRegisteredRoutes(source)) {
    registered.set(key, route);
  }
}

const openApiDoc = await loadAndMergeOpenApi(root);
const documented = collectOpenApiRoutes(openApiDoc);

const registeredNormalized = new Map();
for (const [key, route] of registered) {
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
