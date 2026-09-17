export type PortalSurfaceRoute = {
  method: 'GET' | 'POST';
  path: string;
};

export type PortalUiSurfaceRoute = {
  methods: readonly ('GET' | 'HEAD')[];
  path: string;
};

export type PortalEntryRedirect = PortalUiSurfaceRoute & {
  location: string;
  statusCode: 308;
};

/**
 * Patient-facing API routes that may later be exposed on the restricted listener.
 * Sharing the namespace alone never exposes a new route; additions require an
 * explicit change to this reviewed contract.
 */
export const PORTAL_SURFACE_ROUTES = [
  { method: 'GET', path: '/api/v1/portal/config' },
  { method: 'POST', path: '/api/v1/portal/sessions/resolve-ticket' },
  { method: 'POST', path: '/api/v1/portal/sessions/captive-authorize' },
  { method: 'GET', path: '/api/v1/portal/sessions/me' },
  { method: 'POST', path: '/api/v1/portal/sessions/submit' },
  { method: 'GET', path: '/api/v1/portal/documents/form-templates' },
  { method: 'GET', path: '/api/v1/portal/documents/form-templates/:templateId' },
  { method: 'GET', path: '/api/v1/portal/documents/privacy-notice' },
  { method: 'POST', path: '/api/v1/portal/documents/forms' },
  { method: 'POST', path: '/api/v1/portal/documents/intake' },
  { method: 'GET', path: '/api/v1/portal/documents' },
  { method: 'POST', path: '/api/v1/portal/documents/:documentId/delete' },
] as const satisfies readonly PortalSurfaceRoute[];

/** Gateway-only helper: portal module, but intentionally not patient-facing. */
export const PORTAL_INTERNAL_ROUTES = [
  { method: 'POST', path: '/api/v1/portal/sessions/verify-ticket-code' },
] as const satisfies readonly PortalSurfaceRoute[];

/** Restricted-listener entry convenience; this does not expose another UI route. */
export const PORTAL_ENTRY_REDIRECT = {
  methods: ['GET', 'HEAD'],
  path: '/',
  location: '/portal',
  statusCode: 308,
} as const satisfies PortalEntryRedirect;

/**
 * Exact client-side navigation entries needed by the patient portal. The
 * restricted listener must not use the application's general SPA fallback.
 */
export const PORTAL_UI_SURFACE_ROUTES = [
  { methods: ['GET', 'HEAD'], path: '/portal' },
  { methods: ['GET', 'HEAD'], path: '/portal/' },
  { methods: ['GET', 'HEAD'], path: '/portal/menu' },
  { methods: ['GET', 'HEAD'], path: '/portal/upload' },
  { methods: ['GET', 'HEAD'], path: '/portal/anamnese' },
] as const satisfies readonly PortalUiSurfaceRoute[];

/**
 * Static paths emitted by the shared SvelteKit build and required to boot the
 * portal. These paths expose immutable client assets, not additional SPA
 * navigation fallbacks or API routes.
 */
export const PORTAL_STATIC_SURFACE_ROUTES = [
  { methods: ['GET', 'HEAD'], path: '/_app/immutable/*' },
  { methods: ['GET', 'HEAD'], path: '/_app/version.json' },
  { methods: ['GET', 'HEAD'], path: '/favicon.ico' },
  { methods: ['GET', 'HEAD'], path: '/favicon.svg' },
] as const satisfies readonly PortalUiSurfaceRoute[];
