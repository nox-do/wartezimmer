import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const SPA_EXCLUDED_PREFIXES = ['/api/', '/internal/', '/_app/'];
const SPA_EXCLUDED_PATHS = new Set(['/_app', '/favicon.ico', '/favicon.svg']);

function shouldServeSpa(urlPath: string): boolean {
  // Static misses must never become a successful HTML bootstrap response,
  // including URL-encoded asset paths forwarded by the restricted listener.
  try {
    const decodedPath = decodeURIComponent(urlPath);
    return (
      !SPA_EXCLUDED_PATHS.has(decodedPath) &&
      !SPA_EXCLUDED_PREFIXES.some((prefix) => decodedPath.startsWith(prefix))
    );
  } catch {
    return false;
  }
}

export function resolveUiStaticRoot(): string | null {
  const configured = process.env.UI_STATIC_ROOT?.trim();
  if (configured) {
    const resolved = path.resolve(configured);
    return existsSync(path.join(resolved, 'index.html')) ? resolved : null;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, '../ui-static'),
    path.resolve(moduleDir, '../../ui/build'),
    path.resolve(process.cwd(), 'ui/build'),
    path.resolve(process.cwd(), '../ui/build'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

export async function registerUiStaticRoutes(app: FastifyInstance): Promise<void> {
  const root = resolveUiStaticRoot();
  if (!root) {
    app.log.warn(
      'UI static assets not found (run ui build or set UI_STATIC_ROOT); UI routes disabled',
    );
    return;
  }

  app.log.info({ root }, 'Serving UI static assets');

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    wildcard: true,
    decorateReply: true,
    index: false,
  });

  app.get('/', async (_request, reply) => reply.sendFile('index.html'));

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.code(404).send({
        code: 'NOT_FOUND',
        message: 'Not found.',
      });
    }

    const urlPath = request.url.split('?')[0] ?? '/';
    if (!shouldServeSpa(urlPath)) {
      return reply.code(404).send({
        code: 'NOT_FOUND',
        message: 'Not found.',
      });
    }

    return reply.sendFile('index.html');
  });
}
