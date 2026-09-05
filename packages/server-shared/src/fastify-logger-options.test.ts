import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {
  buildFastifyLoggerOptions,
  createModuleLogger,
  getRootLogger,
  readLogLevelFromEnv,
  resetRootLoggerForTests,
} from './fastify-logger-options.js';

test('readLogLevelFromEnv defaults to warn in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLogLevel = process.env.LOG_LEVEL;
  resetRootLoggerForTests();
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
  resetRootLoggerForTests();
});

test('readLogLevelFromEnv defaults to info outside production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLogLevel = process.env.LOG_LEVEL;
  resetRootLoggerForTests();
  process.env.NODE_ENV = 'development';
  delete process.env.LOG_LEVEL;
  assert.equal(readLogLevelFromEnv(), 'info');
  process.env.NODE_ENV = previousNodeEnv;
  if (previousLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = previousLogLevel;
  }
  resetRootLoggerForTests();
});

test('createModuleLogger shares the process root logger', () => {
  resetRootLoggerForTests();
  const previousLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'silent';
  resetRootLoggerForTests();
  const root = getRootLogger();
  const child = createModuleLogger('test.module');
  assert.equal(child.bindings().module, 'test.module');
  assert.equal(root.level, 'silent');
  if (previousLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = previousLogLevel;
  }
  resetRootLoggerForTests();
});

test('buildFastifyLoggerOptions attaches root loggerInstance to Fastify', () => {
  resetRootLoggerForTests();
  const root = getRootLogger();
  const options = buildFastifyLoggerOptions();
  assert.equal(options.loggerInstance, root);
  const app = Fastify({ ...options });
  assert.equal(typeof app.log.info, 'function');
});
