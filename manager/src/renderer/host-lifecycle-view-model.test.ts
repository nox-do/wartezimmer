import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostLifecycle } from '@praxis-flow/server-shared/setup-api';
import { hostLifecycleSummary } from './host-lifecycle-view-model.js';

const lifecycle: HostLifecycle = {
  assessment: 'known',
  mode: 'https',
  preparation: 'none',
  operation: 'none',
  issues: [],
  recovery: 'none',
};

test('pending activation labels the old mode and the pending operation separately', () => {
  const summary = hostLifecycleSummary({ ...lifecycle, operation: 'portal-apply' });
  assert.equal(summary.title, 'HTTPS');
  assert.match(summary.operation!, /noch nicht abgeschlossen/);
  assert.equal(
    hostLifecycleSummary({ ...lifecycle, mode: 'https-portal' }).title,
    'HTTPS mit separatem Portalzugang',
  );
});

test('unknown and inconsistent installations are never described as uninstalled', () => {
  assert.equal(
    hostLifecycleSummary({ ...lifecycle, assessment: 'unknown', mode: null }).title,
    'Betriebsmodus nicht sicher bestimmbar',
  );
  const broken = hostLifecycleSummary({ ...lifecycle, assessment: 'inconsistent', mode: null });
  assert.match(broken.title, /widersprüchlich/);
  assert.match(broken.repair!, /Technische Installationsdetails/);
});
