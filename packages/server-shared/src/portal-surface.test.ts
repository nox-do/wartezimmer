import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTAL_INTERNAL_ROUTES, PORTAL_SURFACE_ROUTES } from './portal-surface.js';

test('portal surface is explicit, unique and confined to the portal namespace', () => {
  const exposed = PORTAL_SURFACE_ROUTES.map((route) => `${route.method} ${route.path}`);
  assert.equal(new Set(exposed).size, exposed.length);
  assert.ok(PORTAL_SURFACE_ROUTES.every((route) => route.path.startsWith('/api/v1/portal/')));
  assert.ok(PORTAL_INTERNAL_ROUTES.every((route) => route.path.startsWith('/api/v1/portal/')));
  assert.ok(
    PORTAL_INTERNAL_ROUTES.every((route) => !exposed.includes(`${route.method} ${route.path}`)),
  );
});
