import { readFileSync } from 'node:fs';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
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

  const bundlePath = resolveOpenApiBundlePath();
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
