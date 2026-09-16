import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTAL_INTERNAL_ROUTES, PORTAL_SURFACE_ROUTES } from '@praxis-flow/server-shared';
import { ROUTE_ACCESS_RULES } from './route-access-rules.js';

const routeKey = (route: { method: string; path: string }) => `${route.method} ${route.path}`;

test('every portal namespace access rule is classified as exposed or internal', () => {
  const classified = new Set([...PORTAL_SURFACE_ROUTES, ...PORTAL_INTERNAL_ROUTES].map(routeKey));
  const portalRules = ROUTE_ACCESS_RULES.filter((rule) => rule.path.startsWith('/api/v1/portal/'));

  assert.deepEqual(new Set(portalRules.map(routeKey)), classified);
  for (const route of PORTAL_SURFACE_ROUTES) {
    const rule = portalRules.find((candidate) => routeKey(candidate) === routeKey(route));
    assert.equal(rule?.public, true);
  }
  for (const route of PORTAL_INTERNAL_ROUTES) {
    const rule = portalRules.find((candidate) => routeKey(candidate) === routeKey(route));
    assert.deepEqual(rule?.roles, ['captive']);
    assert.notEqual(rule?.public, true);
  }
});
