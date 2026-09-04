import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenApiDocsEnabled } from './register-openapi-docs.js';

const ENV_KEYS = ['NODE_ENV', 'OPENAPI_DOCS_ENABLED'] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    const next = values[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('isOpenApiDocsEnabled defaults off in production', () => {
  withEnv({ NODE_ENV: 'production', OPENAPI_DOCS_ENABLED: undefined }, () => {
    assert.equal(isOpenApiDocsEnabled(), false);
  });
});

test('isOpenApiDocsEnabled defaults on outside production', () => {
  withEnv({ NODE_ENV: 'development', OPENAPI_DOCS_ENABLED: undefined }, () => {
    assert.equal(isOpenApiDocsEnabled(), true);
  });
});

test('isOpenApiDocsEnabled respects explicit override', () => {
  withEnv({ NODE_ENV: 'production', OPENAPI_DOCS_ENABLED: 'true' }, () => {
    assert.equal(isOpenApiDocsEnabled(), true);
  });
  withEnv({ NODE_ENV: 'development', OPENAPI_DOCS_ENABLED: 'false' }, () => {
    assert.equal(isOpenApiDocsEnabled(), false);
  });
});
