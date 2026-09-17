import {
  PORTAL_ENTRY_REDIRECT,
  PORTAL_INTERNAL_ROUTES,
  PORTAL_STATIC_SURFACE_ROUTES,
  PORTAL_SURFACE_ROUTES,
  PORTAL_UI_SURFACE_ROUTES,
  type PortalSurfaceRoute,
  type PortalUiSurfaceRoute,
} from './portal-surface.js';

export const PORTAL_PROXY_CONTRACT_FILE = 'templates/proxy/portal-contract.json';
export type PortalProxyContract = {
  formatVersion: 1;
  rendererVersion: 6;
  api: readonly PortalSurfaceRoute[];
  internal: readonly PortalSurfaceRoute[];
  ui: readonly PortalUiSurfaceRoute[];
  assets: readonly PortalUiSurfaceRoute[];
};
export const DEFAULT_PORTAL_PROXY_CONTRACT: PortalProxyContract = {
  formatVersion: 1,
  rendererVersion: 6,
  api: PORTAL_SURFACE_ROUTES,
  internal: PORTAL_INTERNAL_ROUTES,
  ui: PORTAL_UI_SURFACE_ROUTES,
  assets: PORTAL_STATIC_SURFACE_ROUTES,
};

/** Data only: never load executable code or raw Caddy directives from an update. */
export function parsePortalProxyContract(value: unknown): PortalProxyContract {
  const fail = (): never => {
    throw new Error('Portalvertrag ungültig oder inkompatibel; Manager aktualisieren.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>;
  if (
    record.formatVersion !== 1 ||
    record.rendererVersion !== 6 ||
    Object.keys(record).some(
      (key) =>
        !['formatVersion', 'rendererVersion', 'api', 'internal', 'ui', 'assets'].includes(key),
    )
  )
    return fail();
  for (const category of ['api', 'internal', 'ui', 'assets'] as const) {
    const routes = record[category];
    if (!Array.isArray(routes) || !routes.length || routes.length > 1000) return fail();
    for (const route of routes) {
      if (
        !route ||
        typeof route !== 'object' ||
        typeof route.path !== 'string' ||
        !/^\/[a-zA-Z0-9_/:.*-]+$/.test(route.path) ||
        route.path.includes('..')
      )
        return fail();
      if (category === 'api' || category === 'internal') {
        if (
          !['GET', 'POST'].includes(route.method) ||
          !route.path.startsWith('/api/v1/portal/') ||
          route.path.includes('*') ||
          Object.keys(route).some((key) => !['method', 'path'].includes(key))
        )
          return fail();
      } else {
        if (
          JSON.stringify(route.methods) !== '["GET","HEAD"]' ||
          Object.keys(route).some((key) => !['methods', 'path'].includes(key))
        )
          return fail();
        if (
          category === 'ui' &&
          (!(route.path === '/portal' || route.path.startsWith('/portal/')) ||
            /[*:]/.test(route.path))
        )
          return fail();
        if (
          category === 'assets' &&
          !/^\/(?:_app\/|portal-assets\/|favicon\.(?:ico|svg)$)/.test(route.path)
        )
          return fail();
      }
    }
  }
  const contract = value as PortalProxyContract;
  const publicKeys = new Set(contract.api.map((route) => `${route.method} ${route.path}`));
  if (contract.internal.some((route) => publicKeys.has(`${route.method} ${route.path}`)))
    return fail();
  if (!contract.ui.some((route) => route.path === PORTAL_ENTRY_REDIRECT.location)) return fail();
  return contract;
}
