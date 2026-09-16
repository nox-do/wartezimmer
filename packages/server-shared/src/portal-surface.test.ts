import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTAL_INTERNAL_ROUTES,
  PORTAL_STATIC_SURFACE_ROUTES,
  PORTAL_SURFACE_ROUTES,
  PORTAL_UI_SURFACE_ROUTES,
} from './portal-surface.js';

test('portal surface is explicit, unique and confined to the portal namespace', () => {
  const exposed = PORTAL_SURFACE_ROUTES.map((route) => `${route.method} ${route.path}`);
  assert.equal(new Set(exposed).size, exposed.length);
  assert.ok(PORTAL_SURFACE_ROUTES.every((route) => route.path.startsWith('/api/v1/portal/')));
  assert.ok(PORTAL_INTERNAL_ROUTES.every((route) => route.path.startsWith('/api/v1/portal/')));
  assert.ok(
    PORTAL_INTERNAL_ROUTES.every((route) => !exposed.includes(`${route.method} ${route.path}`)),
  );
});

test('portal UI surface has exact navigation entries and a bounded static namespace', () => {
  assert.deepEqual(
    PORTAL_UI_SURFACE_ROUTES.map((route) => route.path),
    ['/portal', '/portal/', '/portal/menu', '/portal/upload', '/portal/anamnese'],
  );
  assert.ok(PORTAL_UI_SURFACE_ROUTES.every((route) => route.methods.join(' ') === 'GET HEAD'));
  assert.deepEqual(
    PORTAL_STATIC_SURFACE_ROUTES.map((route) => route.path),
    ['/_app/immutable/*', '/_app/version.json', '/favicon.ico', '/favicon.svg'],
  );
  assert.ok(PORTAL_STATIC_SURFACE_ROUTES.every((route) => route.methods.join(' ') === 'GET HEAD'));
  assert.equal(
    [...PORTAL_UI_SURFACE_ROUTES, ...PORTAL_STATIC_SURFACE_ROUTES].some(
      (route) => route.path === '/*' || route.path === '/api/*',
    ),
    false,
  );
});
