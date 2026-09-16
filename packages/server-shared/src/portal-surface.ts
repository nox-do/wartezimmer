export type PortalSurfaceRoute = {
  method: 'GET' | 'POST';
  path: string;
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
