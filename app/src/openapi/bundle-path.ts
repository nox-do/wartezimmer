import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveOpenApiBundlePath(): string {
  const configured = process.env.OPENAPI_BUNDLE_PATH?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, '../../../openapi/bundle.json'),
    path.resolve(moduleDir, '../../openapi/bundle.json'),
    path.resolve(process.cwd(), 'openapi/bundle.json'),
    path.resolve(process.cwd(), '../openapi/bundle.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('OpenAPI bundle not found. Run npm run bundle:openapi from the repo root.');
}
