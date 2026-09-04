import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { resolveOpenApiBundlePath } from './bundle-path.js';

export function isOpenApiDocsEnabled(): boolean {
  const configured = process.env.OPENAPI_DOCS_ENABLED?.trim().toLowerCase();
  if (configured === 'true' || configured === '1' || configured === 'yes') {
    return true;
  }
  if (configured === 'false' || configured === '0' || configured === 'no') {
    return false;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function registerOpenApiDocs(app: FastifyInstance): Promise<void> {
  if (!isOpenApiDocsEnabled()) {
    return;
  }

  let fastifySwagger: typeof import('@fastify/swagger').default;
  let fastifySwaggerUi: typeof import('@fastify/swagger-ui').default;
  try {
    [{ default: fastifySwagger }, { default: fastifySwaggerUi }] = await Promise.all([
      import('@fastify/swagger'),
      import('@fastify/swagger-ui'),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    app.log.warn(
      { err: detail },
      'OpenAPI docs enabled but @fastify/swagger / @fastify/swagger-ui are not installed; skipping docs',
    );
    return;
  }

  let bundlePath: string;
  try {
    bundlePath = resolveOpenApiBundlePath();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    app.log.warn({ err: detail }, 'OpenAPI docs enabled but bundle is missing; skipping docs');
    return;
  }

  const specification = JSON.parse(readFileSync(bundlePath, 'utf8')) as Record<string, unknown>;

  await app.register(fastifySwagger, {
    openapi: specification,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  app.log.info({ routePrefix: '/api/docs', bundlePath }, 'OpenAPI docs enabled');
}
