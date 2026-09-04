import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import type {
  CaptiveAuthorizeBody,
  ResolveTicketBody,
  VerifyTicketBody,
} from '../api/sessions-openapi-types.js';
import { sessionsSchemas } from '../api/generated/sessions.fastify-schemas.js';
import { createRateLimiter } from '../http/simple-rate-limit.js';
import { domainError, resolveDomainError, sendDomainError } from '../http/domain-error-mapper.js';
import { createRequirePortalEnabledPreHandler } from './portal-access.js';
import {
  createRequirePatientSessionPreHandler,
  getPatientSessionToken,
  isSessionUnauthorizedError,
  sendSessionUnauthorized,
} from './session-auth.js';

const resolveTicketRateLimiter = createRateLimiter({
  maxRequests: Number.parseInt(process.env.SESSION_RESOLVE_RATE_LIMIT_MAX ?? '40', 10) || 40,
  windowMs:
    Number.parseInt(process.env.SESSION_RESOLVE_RATE_LIMIT_WINDOW_MS ?? '60000', 10) || 60_000,
});

const resolveTicketSessionMessages: Record<string, string> = {
  SESSION_INVALID_TICKET: 'Wartenummer konnte nicht aufgeloest werden.',
  SESSION_TICKET_NOT_ACTIVE: 'Wartenummer ist nicht mehr aktiv.',
  SESSION_ALREADY_ACTIVE: 'Fuer diese Wartenummer existiert bereits eine aktive Session.',
};

const verifyTicketCodeMessages: Record<string, string> = {
  SESSION_INVALID_TICKET: 'Wartenummer konnte nicht verifiziert werden.',
  SESSION_TICKET_NOT_ACTIVE: 'Wartenummer ist nicht mehr aktiv.',
};

export function registerSessionRoutes(app: FastifyInstance, db: CoreDatabase): void {
  const requirePatientSession = createRequirePatientSessionPreHandler(db);
  const requirePortalEnabled = createRequirePortalEnabledPreHandler(db);

  app.post<{ Body: ResolveTicketBody }>(
    '/api/v1/sessions/resolve-ticket',
    {
      preHandler: requirePortalEnabled,
      schema: {
        body: sessionsSchemas.POST_api_v1_sessions_resolve_ticketRequestBody,
        response: {
          201: sessionsSchemas.POST_api_v1_sessions_resolve_ticketResponse201,
          400: sessionsSchemas.POST_api_v1_sessions_resolve_ticketResponse400,
          404: sessionsSchemas.POST_api_v1_sessions_resolve_ticketResponse404,
          409: sessionsSchemas.POST_api_v1_sessions_resolve_ticketResponse409,
        },
      },
    },
    async (request, reply) => {
      const clientKey = request.ip?.trim() || 'unknown';
      if (!resolveTicketRateLimiter(clientKey)) {
        return sendDomainError(reply, domainError('RATE_LIMITED'), {
          message: 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
        });
      }

      try {
        const ticketCode = request.body.ticketCode?.trim() ?? '';
        const ttlMinutes = Number(process.env.SESSION_TTL_MINUTES ?? '30');
        const resolved = db.resolvePatientSession(
          ticketCode,
          Number.isInteger(ttlMinutes) ? ttlMinutes : 30,
        );
        return reply.code(201).send(resolved);
      } catch (error) {
        const resolved = error instanceof Error ? resolveDomainError(error) : null;
        const message = resolved ? resolveTicketSessionMessages[resolved.rawMessage] : undefined;
        if (sendDomainError(reply, error, message ? { message } : undefined)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Body: VerifyTicketBody }>(
    '/api/v1/sessions/verify-ticket-code',
    {
      preHandler: requirePortalEnabled,
      schema: {
        body: sessionsSchemas.POST_api_v1_sessions_verify_ticket_codeRequestBody,
        response: {
          200: sessionsSchemas.POST_api_v1_sessions_verify_ticket_codeResponse200,
          404: sessionsSchemas.POST_api_v1_sessions_verify_ticket_codeResponse404,
          409: sessionsSchemas.POST_api_v1_sessions_verify_ticket_codeResponse409,
        },
      },
    },
    async (request, reply) => {
      try {
        const ticketCode = request.body.ticketCode?.trim() ?? '';
        const verified = db.verifyTicketCode(ticketCode);
        return reply.send({ ok: true, visitId: verified.visitId });
      } catch (error) {
        const resolved = error instanceof Error ? resolveDomainError(error) : null;
        const message = resolved ? verifyTicketCodeMessages[resolved.rawMessage] : undefined;
        if (sendDomainError(reply, error, message ? { message } : undefined)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Body: CaptiveAuthorizeBody }>(
    '/api/v1/sessions/captive-authorize',
    {
      preHandler: [requirePortalEnabled, requirePatientSession],
      schema: {
        body: sessionsSchemas.POST_api_v1_sessions_captive_authorizeRequestBody,
        response: {
          200: sessionsSchemas.POST_api_v1_sessions_captive_authorizeResponse200,
          400: sessionsSchemas.POST_api_v1_sessions_captive_authorizeResponse400,
          401: sessionsSchemas.POST_api_v1_sessions_captive_authorizeResponse401,
          502: sessionsSchemas.POST_api_v1_sessions_captive_authorizeResponse502,
        },
      },
    },
    async (request, reply) => {
      const sessionToken = getPatientSessionToken(request);

      const clientIp = request.body.clientIp?.trim() ?? '';
      const clientMac = request.body.clientMac?.trim() ?? '';
      const redirectUrl = request.body.redirectUrl?.trim() ?? '';

      if (!clientIp && !clientMac) {
        return reply.code(400).send({
          code: 'CAPTIVE_CLIENT_MISSING',
          message: 'clientIp oder clientMac ist erforderlich.',
        });
      }

      try {
        // Validate session is still live. WLAN freischaltung is a future thin vendor
        // adapter; until then always report wlanAuthorized=false.
        db.getPatientSessionMe(sessionToken);
        return reply.send({
          ok: true,
          wlanAuthorized: false,
          redirectUrl: redirectUrl || `/portal/menu`,
        });
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        throw error;
      }
    },
  );

  app.get(
    '/api/v1/sessions/me',
    {
      preHandler: [requirePortalEnabled, requirePatientSession],
      schema: {
        response: {
          200: sessionsSchemas.GET_api_v1_sessions_meResponse200,
          401: sessionsSchemas.GET_api_v1_sessions_meResponse401,
        },
      },
    },
    async (request, reply) => {
      const token = getPatientSessionToken(request);
      try {
        return db.getPatientSessionMe(token);
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/sessions/submit',
    {
      preHandler: [requirePortalEnabled, requirePatientSession],
      schema: {
        response: {
          200: sessionsSchemas.POST_api_v1_sessions_submitResponse200,
          401: sessionsSchemas.POST_api_v1_sessions_submitResponse401,
        },
      },
    },
    async (request, reply) => {
      const token = getPatientSessionToken(request);

      try {
        return db.submitPatientSession(token);
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        throw error;
      }
    },
  );
}
