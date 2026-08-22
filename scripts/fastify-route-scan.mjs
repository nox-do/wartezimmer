import fs from 'node:fs';
import path from 'node:path';

const ROUTE_RE =
  /app\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"](\/api\/v1[^'"]+)['"]/gi;

function isTestOrSpecFile(fileName) {
  return fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts');
}

function collectRouteFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !isTestOrSpecFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function parseRegisteredRoutes(source) {
  const routes = new Map();
  for (const match of source.matchAll(ROUTE_RE)) {
    const method = match[1].toUpperCase();
    routes.set(`${method} ${match[2]}`, { method, path: match[2] });
  }
  return routes;
}

export function collectRegisteredAppRoutes(routesDir) {
  const registered = new Map();
  for (const file of collectRouteFiles(routesDir)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [key, route] of parseRegisteredRoutes(source)) {
      registered.set(key, route);
    }
  }
  return registered;
}
