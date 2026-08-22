#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRegisteredAppRoutes } from './fastify-route-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = path.join(root, 'app/src/auth/route-access-rules.ts');
const routesDir = path.join(root, 'app/src/routes');

function parseAuthRules(source) {
  const rules = new Map();
  const ruleRe = /\{\s*method:\s*['"](\w+)['"],\s*path:\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(ruleRe)) {
    rules.set(`${match[1]} ${match[2]}`, { method: match[1], path: match[2] });
  }
  return rules;
}

const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const rules = parseAuthRules(rulesSource);
const registered = collectRegisteredAppRoutes(routesDir);

const missingRules = [...registered.values()].filter(
  (route) => !rules.has(`${route.method} ${route.path}`),
);
const orphanRules = [...rules.values()].filter(
  (rule) => !registered.has(`${rule.method} ${rule.path}`),
);

let failed = false;

if (missingRules.length > 0) {
  failed = true;
  console.error(
    'check-auth-route-rules: registered /api/v1 routes without ROUTE_ACCESS_RULES entry:',
  );
  for (const route of missingRules.sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
  )) {
    console.error(`  ${route.method} ${route.path}`);
  }
}

if (orphanRules.length > 0) {
  failed = true;
  console.error('check-auth-route-rules: ROUTE_ACCESS_RULES entries without registered route:');
  for (const rule of orphanRules.sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
  )) {
    console.error(`  ${rule.method} ${rule.path}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`check-auth-route-rules: OK (${registered.size} routes)`);
