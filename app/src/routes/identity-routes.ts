import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import type { MfaLookupBody, PhoneDobLookupBody } from '../api/identity-openapi-types.js';
import { identitySchemas } from '../api/generated/identity.fastify-schemas.js';
import { commonSchemas } from '../api/generated/common.fastify-schemas.js';
import { settingsFromOpsRow } from '../shared/contacts/contact-lookup-config.js';
import {
  lookupIdentityRefByPhoneFromContactLookup,
  searchContactLookupCandidates,
} from '../shared/contacts/contact-lookup-runtime.js';
import { sendResolvedDomainError } from '../http/domain-error-mapper.js';
import {
  assertValidTerminalPhoneNumber,
  assertValidTerminalBirthDate,
} from '../shared/terminal/terminal-input-validation.js';
import { createRateLimiter } from '../http/simple-rate-limit.js';

const identityErrorResponse = commonSchemas.Error;
const MFA_LOOKUP_NAME_MIN_LENGTH = Number.parseInt(
  process.env.MFA_LOOKUP_NAME_MIN_LENGTH ?? '3',
  10,
);
const MFA_LOOKUP_MAX_RESULTS = Number.parseInt(process.env.MFA_LOOKUP_MAX_RESULTS ?? '5', 10);
const mfaLookupRateLimiter = createRateLimiter({
  maxRequests: Number.parseInt(process.env.MFA_LOOKUP_RATE_LIMIT_MAX ?? '45', 10) || 45,
  windowMs: Number.parseInt(process.env.MFA_LOOKUP_RATE_LIMIT_WINDOW_MS ?? '60000', 10) || 60_000,
});

function maskPhoneNumberForUi(input: string | null): string | null {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length <= 4) {
    return `${hasPlus ? '+' : ''}${digits}`;
  }
  const visibleTail = digits.slice(-3);
  const hidden = '*'.repeat(Math.max(3, digits.length - 3));
  return `${hasPlus ? '+' : ''}${hidden}${visibleTail}`;
}

export function registerIdentityRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.post<{ Body: PhoneDobLookupBody }>(
    '/api/v1/identity/phone-dob-lookup',
    {
      schema: {
        body: identitySchemas.POST_api_v1_identity_phone_dob_lookupRequestBody,
        response: {
          200: identitySchemas.POST_api_v1_identity_phone_dob_lookupResponse200,
          400: identityErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const phoneNumber = request.body.phoneNumber?.trim() ?? '';
      const birthDate = request.body.birthDate?.trim() ?? '';

      try {
        assertValidTerminalPhoneNumber(phoneNumber);
        assertValidTerminalBirthDate(birthDate);
      } catch (error) {
        if (sendResolvedDomainError(reply, error)) {
          return;
        }
        throw error;
      }

      const settings = db.getOpsSettings();
      const lookupSettings = settingsFromOpsRow(settings);
      if (!lookupSettings) {
        return { found: false, identityRef: null };
      }

      try {
        const identityRef = await lookupIdentityRefByPhoneFromContactLookup(
          lookupSettings,
          phoneNumber,
          birthDate,
        );
        return {
          found: identityRef != null,
          identityRef: identityRef ?? null,
        };
      } catch {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'CSV contact lookup failed for the provided input.',
        });
      }
    },
  );

  app.post<{ Body: MfaLookupBody }>(
    '/api/v1/identity/mfa-lookup',
    {
      schema: {
        body: identitySchemas.POST_api_v1_identity_mfa_lookupRequestBody,
        response: {
          200: identitySchemas.POST_api_v1_identity_mfa_lookupResponse200,
          400: identityErrorResponse,
          429: identityErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const name = request.body.name?.trim() ?? '';
      const birthDate = request.body.birthDate?.trim() ?? '';
      const phoneNumber = request.body.phoneNumber?.trim() ?? '';
      const limitRaw = request.body.limit;
      const limit =
        typeof limitRaw === 'number' && Number.isFinite(limitRaw)
          ? Math.trunc(limitRaw)
          : MFA_LOOKUP_MAX_RESULTS;
      const mfaLookupLimiterKey = `${request.staffSession?.sessionId ?? 'anonymous'}:${request.ip?.trim() || 'unknown'}`;
      if (!mfaLookupRateLimiter(mfaLookupLimiterKey)) {
        return reply.code(429).send({
          code: 'RATE_LIMITED',
          message: 'Zu viele Suchanfragen. Bitte kurz warten.',
        });
      }

      if (!name && !phoneNumber) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Name oder Telefonnummer ist fuer den MFA-Lookup erforderlich.',
        });
      }
      if (name && !phoneNumber && name.length < MFA_LOOKUP_NAME_MIN_LENGTH) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: `Bitte mindestens ${MFA_LOOKUP_NAME_MIN_LENGTH} Zeichen fuer die Namenssuche eingeben.`,
        });
      }

      try {
        if (birthDate) {
          assertValidTerminalBirthDate(birthDate);
        }
        if (phoneNumber && /[A-Za-z]/.test(phoneNumber)) {
          return reply.code(400).send({
            code: 'INVALID_ARGUMENT',
            message: 'Ungueltige Telefonnummer fuer MFA-Lookup.',
          });
        }
        if (phoneNumber && phoneNumber.replace(/\D/g, '').length < 3) {
          return reply.code(400).send({
            code: 'INVALID_ARGUMENT',
            message: 'Bitte mindestens 3 Ziffern fuer die Telefonnummer eingeben.',
          });
        }
      } catch (error) {
        if (sendResolvedDomainError(reply, error)) {
          return;
        }
        throw error;
      }

      const settings = db.getOpsSettings();
      const lookupSettings = settingsFromOpsRow(settings);
      if (!lookupSettings) {
        return { candidates: [] };
      }

      try {
        const candidates = await searchContactLookupCandidates(
          lookupSettings,
          {
            name: name || undefined,
            birthDate: birthDate || undefined,
            phoneNumber: phoneNumber || undefined,
          },
          Math.min(limit, MFA_LOOKUP_MAX_RESULTS),
        );
        app.log.info(
          {
            route: 'identity.mfa_lookup',
            hasName: name.length > 0,
            hasBirthDate: birthDate.length > 0,
            hasPhoneNumber: phoneNumber.length > 0,
            resultCount: candidates.length,
            sessionId: request.staffSession?.sessionId ?? null,
          },
          'MFA lookup executed',
        );
        return {
          candidates: candidates.map((candidate) => ({
            identityRef: candidate.identityRef,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            birthDate: candidate.birthDate,
            phoneNumberMasked: maskPhoneNumberForUi(candidate.phoneNumber),
            phoneNumberExact: candidate.phoneNumber,
          })),
        };
      } catch {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'CSV contact lookup failed for the provided input.',
        });
      }
    },
  );

  app.get<{ Params: { visitId: string } }>(
    '/api/v1/identity/:visitId',
    {
      schema: {
        params: identitySchemas.GET_api_v1_identity_visitId_Params,
        response: {
          200: identitySchemas.GET_api_v1_identity_visitId_Response200,
          404: identityErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        return db.getTicketIdentityView(request.params.visitId);
      } catch (error) {
        if (sendResolvedDomainError(reply, error)) {
          return;
        }
        throw error;
      }
    },
  );
}
