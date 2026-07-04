import assert from 'node:assert/strict';
import test from 'node:test';
import { readLogLevelFromEnv } from './fastify-logger-options.js';

test('readLogLevelFromEnv defaults to warn in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLogLevel = process.env.LOG_LEVEL;
  process.env.NODE_ENV = 'production';
  delete process.env.LOG_LEVEL;
  assert.equal(readLogLevelFromEnv(), 'warn');
  process.env.LOG_LEVEL = 'debug';
  assert.equal(readLogLevelFromEnv(), 'debug');
  process.env.NODE_ENV = previousNodeEnv;
  if (previousLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = previousLogLevel;
  }
});

test('readLogLevelFromEnv defaults to info outside production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLogLevel = process.env.LOG_LEVEL;
  process.env.NODE_ENV = 'development';
  delete process.env.LOG_LEVEL;
  assert.equal(readLogLevelFromEnv(), 'info');
  process.env.NODE_ENV = previousNodeEnv;
  if (previousLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = previousLogLevel;
  }
});
