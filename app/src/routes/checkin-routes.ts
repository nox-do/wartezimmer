import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isTerminalPatientLocale, type TerminalPatientLocale } from '@praxis-flow/domain';
import type { CoreDatabase } from '../shared/db/database.js';
import type { CreateCheckinBody } from '../api/checkin-openapi-types.js';
import { checkinSchemas } from '../api/generated/checkin.fastify-schemas.js';
import { commonSchemas } from '../api/generated/common.fastify-schemas.js';
import { publishTvQueueUpdate } from '../shared/queue/queue-stream-hub.js';
import { settingsFromOpsRow } from '../shared/contacts/contact-lookup-config.js';
import {
  lookupIdentityRefByNameDobFromContactLookup,
  lookupIdentityRefByPhoneFromContactLookup,
} from '../shared/contacts/contact-lookup-runtime.js';
import { sendResolvedDomainError } from '../http/domain-error-mapper.js';
import { domainError } from '../http/domain-error.js';
import { resolveCheckinPhoneForTicket } from '../shared/checkin/checkin-phone.js';
import {
  assertKnownCheckinAuthPath,
  assertTerminalAuthPathEnabled,
} from '../shared/checkin/terminal-auth-path.js';
import { toAssistPendingItem } from '../shared/checkin/terminal-assist-pending.js';
import { TERMINAL_DEVICE_ID } from '../shared/ops/device-ids.js';
import {
  resolveTicketLaneCodeFromSettings,
  terminalTopicsForUi,
} from '../shared/checkin-topic-settings.js';
import {
  assertValidTerminalBirthDate,
  assertValidTerminalLastName,
  assertValidTerminalPhoneNumber,
} from '../shared/terminal/terminal-input-validation.js';

const CHECKIN_ERROR_MESSAGES = {
  byDomainCode: {
    INVALID_ARGUMENT: 'Ungueltiger Check-in-Request.',
    CHECKIN_LOCKED: 'Check-in ist derzeit gesperrt.',
    CHECKIN_AUTH_PATH_DISABLED: 'Diese Anmeldung ist am Terminal deaktiviert.',
    TERMINAL_PHONE_INVALID: 'Ungueltige Mobilnummer.',
    TERMINAL_LAST_NAME_INVALID: 'Ungueltiger Nachname.',
    TERMINAL_BIRTH_DATE_INVALID: 'Ungueltiges Geburtsdatum.',
    CHECKIN_CLOSED: 'Check-in ist ausserhalb der Praxiszeiten nicht verfuegbar.',
    TOPIC_DISABLED: 'Thema ist derzeit deaktiviert.',
    TOPIC_CLOSED: 'Thema ist aktuell ausserhalb des konfigurierten Zeitfensters.',
    UNKNOWN_TOPIC: 'Unbekanntes Thema.',
    OPS_SETTINGS_INVALID: 'Praxiszeiten sind ungueltig konfiguriert.',
  },
} as const;

const checkinErrorResponse = commonSchemas.Error;

function notifyTvQueueChanged(db: CoreDatabase): void {
  publishTvQueueUpdate(db);
}

function resolveCheckinLocaleFromHeader(
  value: string | string[] | undefined,
): TerminalPatientLocale | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.trim() ?? '';
  return normalized && isTerminalPatientLocale(normalized) ? normalized : null;
}

function resolveTerminalDeviceId(request: FastifyRequest): string {
  if (request.authSession?.kind === 'device' && request.authSession.role === 'terminal') {
    return request.authSession.deviceId;
  }
  return TERMINAL_DEVICE_ID;
}

function runAssistPress(db: CoreDatabase, deviceId: string, legacyCutover: boolean) {
  const row = db.pressTerminalAssist(deviceId);
  notifyTvQueueChanged(db);
  return {
    pressedAt: row.pressedAt,
    expiresAt: row.expiresAt,
    legacyCutover,
  };
}

export function registerCheckinRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/checkins/topics',
    {
      schema: {
        response: {
          200: checkinSchemas.GET_api_v1_checkins_topicsResponse200,
        },
      },
    },
    async () => {
      const settings = db.getOpsSettings();
      return {
        topics: terminalTopicsForUi(settings).map(
          ({ topicId, label, sortOrder, iconId, accentColor, availableFrom, availableTo }) => ({
            topicId,
            label,
            sortOrder,
            iconId,
            accentColor,
            availableFrom,
            availableTo,
          }),
        ),
      };
    },
  );

  app.post(
    '/api/v1/checkins/assist/press',
    {
      schema: {
        response: {
          201: checkinSchemas.POST_api_v1_checkins_assist_pressResponse201,
          400: checkinErrorResponse,
          409: checkinErrorResponse,
          500: checkinErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = runAssistPress(db, resolveTerminalDeviceId(request), false);
        return reply.code(201).send(payload);
      } catch (error) {
        if (sendResolvedDomainError(reply, error, CHECKIN_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/checkins/assist/release',
    {
      schema: {
        response: {
          204: { type: 'null' },
          400: checkinErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const released = db.releaseTerminalAssist(resolveTerminalDeviceId(request));
      if (released) {
        notifyTvQueueChanged(db);
      }
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/checkins/assist/pending',
    {
      schema: {
        response: {
          200: checkinSchemas.GET_api_v1_checkins_assist_pendingResponse200,
        },
      },
    },
    async () => {
      const nowMs = Date.now();
      return {
        items: db
          .listActiveTerminalAssistPending(nowMs)
          .map((row) => toAssistPendingItem(row, nowMs)),
        serverTime: new Date(nowMs).toISOString(),
      };
    },
  );

  app.post<{ Body: CreateCheckinBody }>(
    '/api/v1/checkins',
    {
      schema: {
        body: checkinSchemas.POST_api_v1_checkinsRequestBody,
        response: {
          201: checkinSchemas.POST_api_v1_checkinsResponse201,
          400: checkinErrorResponse,
          409: checkinErrorResponse,
          500: checkinErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const topicId = request.body.topicId?.trim() ?? '';
      const authPath = request.body.authPath?.trim() ?? '';
      const checkinLocale = resolveCheckinLocaleFromHeader(request.headers['x-patient-locale']);
      const explicitIdentityRef = request.body.identityRef?.trim();
      const phoneNumber = request.body.phoneNumber?.trim() ?? '';
      const lastName = request.body.lastName?.trim() ?? '';
      const birthDate = request.body.birthDate?.trim() ?? '';
      const deviceId = resolveTerminalDeviceId(request);
      const assistActive = db.isTerminalAssistPendingActive(deviceId);

      try {
        assertKnownCheckinAuthPath(authPath);
        assertTerminalAuthPathEnabled(db.getOpsSettings(), authPath);

        if (authPath === 'phone_dob') {
          if (phoneNumber.length === 0) {
            throw domainError('TERMINAL_PHONE_INVALID');
          }
          assertValidTerminalPhoneNumber(phoneNumber);
          if (birthDate.length > 0) {
            assertValidTerminalBirthDate(birthDate);
          }
        } else if (authPath === 'name_dob') {
          assertValidTerminalLastName(lastName);
          assertValidTerminalBirthDate(birthDate);
        } else if (phoneNumber.length > 0) {
          assertValidTerminalPhoneNumber(phoneNumber);
        }
      } catch (error) {
        if (sendResolvedDomainError(reply, error, CHECKIN_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }

      let identityRef = explicitIdentityRef;
      if (!identityRef && phoneNumber) {
        try {
          const settings = db.getOpsSettings();
          const lookupSettings = settingsFromOpsRow(settings);
          if (lookupSettings) {
            identityRef =
              (await lookupIdentityRefByPhoneFromContactLookup(
                lookupSettings,
                phoneNumber,
                authPath === 'phone_dob' && birthDate.length > 0 ? birthDate : undefined,
              )) ?? undefined;
          }
        } catch (error) {
          app.log.warn(
            {
              error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
            },
            'CSV contact lookup failed; continuing without identityRef',
          );
        }
      }
      if (!identityRef && authPath === 'name_dob') {
        try {
          const settings = db.getOpsSettings();
          const lookupSettings = settingsFromOpsRow(settings);
          if (lookupSettings) {
            identityRef =
              (await lookupIdentityRefByNameDobFromContactLookup(
                lookupSettings,
                lastName,
                birthDate,
              )) ?? undefined;
          }
        } catch (error) {
          app.log.warn(
            {
              error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
            },
            'CSV contact lookup failed; continuing without identityRef',
          );
        }
        if (!identityRef) {
          identityRef = lastName;
        }
      }

      try {
        const created = db.createTicket({
          topicId,
          authPath,
          identityRef,
          checkinPhone: resolveCheckinPhoneForTicket(authPath, phoneNumber),
          checkinLocale,
          needsAssistance: assistActive,
        });
        if (assistActive) {
          db.releaseTerminalAssist(deviceId);
        }
        const laneCode = resolveTicketLaneCodeFromSettings(db.getOpsSettings(), topicId);
        const destinationRoomLabel = created.destinationRoomLabel;

        notifyTvQueueChanged(db);
        return reply.code(201).send({
          visitId: created.visitId,
          laneCode,
          number: created.number,
          queueStatus: 'waiting',
          createdAt: created.createdAt,
          destinationRoomLabel,
        });
      } catch (error) {
        if (sendResolvedDomainError(reply, error, CHECKIN_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/checkins/mfa-assist',
    {
      schema: {
        response: {
          201: checkinSchemas.POST_api_v1_checkins_assist_pressResponse201,
          400: checkinErrorResponse,
          409: checkinErrorResponse,
          500: checkinErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = runAssistPress(db, resolveTerminalDeviceId(request), true);
        return reply.code(201).send(payload);
      } catch (error) {
        if (sendResolvedDomainError(reply, error, CHECKIN_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );
}
