import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveComposeProjectName } from './install-home.js';

test('resolveComposeProjectName uses COMPOSE_PROJECT_NAME when set', () => {
  const previous = process.env.COMPOSE_PROJECT_NAME;
  process.env.COMPOSE_PROJECT_NAME = 'custom-project';
  try {
    assert.equal(resolveComposeProjectName('/tmp/ignored'), 'custom-project');
  } finally {
    if (previous === undefined) {
      delete process.env.COMPOSE_PROJECT_NAME;
    } else {
      process.env.COMPOSE_PROJECT_NAME = previous;
    }
  }
});

test('resolveComposeProjectName derives pf-* slug from install home basename', () => {
  const previous = process.env.COMPOSE_PROJECT_NAME;
  delete process.env.COMPOSE_PROJECT_NAME;
  try {
    assert.equal(resolveComposeProjectName('/tmp/pf-dev-001'), 'pf-pf-dev-001');
    assert.equal(resolveComposeProjectName('/var/lib/PraxisFlow'), 'praxis-flow');
  } finally {
    if (previous === undefined) {
      delete process.env.COMPOSE_PROJECT_NAME;
    } else {
      process.env.COMPOSE_PROJECT_NAME = previous;
    }
  }
});
