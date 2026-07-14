import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { resolveSchemaRefs, toFastifyJsonSchema } from './openapi-lib.mjs';

export function loadOpenApiBundle(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'openapi/bundle.json'), 'utf8'));
}

export function getResponseSchema(bundle, method, pathKey, status) {
  const operation = bundle.paths?.[pathKey]?.[method.toLowerCase()];
  const schema = operation?.responses?.[String(status)]?.content?.['application/json']?.schema;
  if (!schema) {
    return null;
  }
  const components = bundle.components?.schemas ?? {};
  return toFastifyJsonSchema(resolveSchemaRefs(schema, components));
}

export function createResponseValidator(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function formatAjvErrors(validate) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`)
    .join('; ');
}

export async function requestJson(baseUrl, endpoint, authOrBearer, options = {}) {
  const method = options.method ?? 'GET';
  const headers = {};
  if (typeof authOrBearer === 'string' && authOrBearer.length > 0) {
    headers.authorization = `Bearer ${authOrBearer}`;
  } else if (authOrBearer?.bearerToken) {
    headers.authorization = `Bearer ${authOrBearer.bearerToken}`;
  }
  const cookieHeader = authOrBearer?.cookieJar?.header();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (authOrBearer?.origin) {
    headers.origin = authOrBearer.origin;
  }
  if (authOrBearer?.kind === 'session' || authOrBearer?.kind === 'device') {
    headers['x-client-role'] = authOrBearer.role;
  }
  if (options.jsonBody != null) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: options.jsonBody != null ? JSON.stringify(options.jsonBody) : undefined,
  });
  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    body = JSON.parse(text);
  }

  const expectedStatus = options.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${method} ${endpoint} expected ${expectedStatus}, got ${response.status}: ${text}`,
    );
  }
  return body;
}

export function assertResponseSchema(bundle, method, pathKey, status, body, label) {
  const schema = getResponseSchema(bundle, method, pathKey, status);
  if (!schema) {
    throw new Error(
      `${label}: no response schema for ${method} ${pathKey} ${status} in bundle.json`,
    );
  }
  const validate = createResponseValidator(schema);
  if (!validate(body)) {
    throw new Error(`${label}: schema mismatch: ${formatAjvErrors(validate)}`);
  }
}
