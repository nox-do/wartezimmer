import { randomBytes } from 'node:crypto';
import { listEnabledRoomPanelPlacements, roomPanelConfigForPlacement } from '@praxis-flow/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  ChangePinBody,
  DevicePairingConfirmBody,
  DevicePairingParams,
  DevicePairingStartBody,
  AuthPinTarget,
  RoomPanelLoginBody,
  RoomPanelPlacement,
  StaffLoginBody,
} from '../api/auth-openapi-types.js';
import { authSchemas } from '../api/generated/auth.fastify-schemas.js';
import { createRateLimiter } from '../http/simple-rate-limit.js';
import {
  attachDeviceSessionToPairing,
  confirmDevicePairing,
  getDevicePairingById,
  isDevicePairingAlreadyConfirmed,
  removeDevicePairing,
  startDevicePairing,
} from '../shared/ops/device-pairing-registry.js';
import { recordDevicePresence } from '../shared/ops/device-presence-registry.js';
import {
  defaultDeviceIdForPairedRole,
  deviceKindForPairedRole,
} from '../shared/ops/device-role.js';
import {
  DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
  clearSessionCookieForSlot,
  type DeviceSessionRole,
  getRoomPanelSessionCookieName,
  getStaffSessionAuthConfig,
  readCookieValue,
  readRequestedCookieSlotRole,
  readSessionTokenForSlot,
  setDeviceSessionCookie,
  setRoomPanelSessionCookie,
  setStaffSessionCookie,
  hashStaffPinForConfig,
  type StaffRole,
  type StaffSessionManager,
  verifyStaffPin,
} from '../auth/staff-session-auth.js';
import type { OpsSettings } from '../shared/db/db-types.js';
import { toStaffPinHashConfig, type AuthSettings } from '../shared/db/database-auth-settings.js';

function isRoomPanelPlacement(value: string | undefined): value is RoomPanelPlacement {
  return value === 'outside' || value === 'inside';
}

type AuthRoutesDb = {
  getOpsSettings(): Pick<OpsSettings, 'rooms'>;
  getAuthSettings(): AuthSettings;
  updateAuthPinHash(target: AuthPinTarget, pinHash: string): AuthSettings;
  replaceSlotDeviceAuthorization(input: {
    role: DeviceSessionRole;
    deviceId: string;
    token: string;
  }): { authorizationId: string };
  enrollRoomPanelDeviceAuthorization(input: {
    roomId: string;
    placement: RoomPanelPlacement;
    token: string;
  }): { authorizationId: string };
  revokeDeviceAuthorizationByToken(token: string): boolean;
  revokeAllRoomPanelAuthorizations(): number;
};

const DEFAULT_TV_DISPLAY_ID = defaultDeviceIdForPairedRole('tv');
const DEFAULT_TERMINAL_DISPLAY_ID = defaultDeviceIdForPairedRole('terminal');

function isStaffRole(value: string | undefined): value is StaffRole {
  return value === 'mfa' || value === 'ops';
}

function recordPairingDevicePresence(role: DeviceSessionRole, displayId: string): void {
  recordDevicePresence({
    deviceId: displayId,
    kind: deviceKindForPairedRole(role),
  });
}

function listEnabledRoomPanelRooms(db: AuthRoutesDb) {
  return db
    .getOpsSettings()
    .rooms.filter((room) => room.enabled)
    .flatMap((room) =>
      listEnabledRoomPanelPlacements(room).map((placement) => {
        const config = roomPanelConfigForPlacement(room, placement);
        return {
          roomId: room.roomId,
          roomLabel: room.roomLabel,
          placement,
          mode: config.mode,
          requiresPin: true,
        };
      }),
    );
}

function getCurrentAuthConfig(db: AuthRoutesDb) {
  return getStaffSessionAuthConfig(toStaffPinHashConfig(db.getAuthSettings()));
}

function isPinTarget(value: string | undefined): value is AuthPinTarget {
  return value === 'mfa' || value === 'ops' || value === 'room-panel';
}

export function registerAuthRoutes(
  app: FastifyInstance,
  sessions: StaffSessionManager,
  db: AuthRoutesDb,
): void {
  const loginRateLimiter = createRateLimiter({
    maxRequests: Number.parseInt(process.env.STAFF_LOGIN_RATE_LIMIT_MAX ?? '20', 10) || 20,
    windowMs:
      Number.parseInt(process.env.STAFF_LOGIN_RATE_LIMIT_WINDOW_MS ?? '60000', 10) || 60_000,
  });
  const roomPanelPinLoginRateLimiter = createRateLimiter({
    maxRequests: Number.parseInt(process.env.ROOM_PANEL_LOGIN_RATE_LIMIT_MAX ?? '30', 10) || 30,
    windowMs:
      Number.parseInt(process.env.ROOM_PANEL_LOGIN_RATE_LIMIT_WINDOW_MS ?? '60000', 10) || 60_000,
  });
  const pinChangeRateLimiter = createRateLimiter({
    maxRequests: Number.parseInt(process.env.PIN_CHANGE_RATE_LIMIT_MAX ?? '10', 10) || 10,
    windowMs:
      Number.parseInt(process.env.PIN_CHANGE_RATE_LIMIT_WINDOW_MS ?? '900000', 10) || 900_000,
  });
  const pairingStartRateLimiter = createRateLimiter({
    maxRequests: Number.parseInt(process.env.DEVICE_PAIRING_START_RATE_LIMIT_MAX ?? '30', 10) || 30,
    windowMs:
      Number.parseInt(process.env.DEVICE_PAIRING_START_RATE_LIMIT_WINDOW_MS ?? '60000', 10) ||
      60_000,
  });
  const pairingConfirmRateLimiter = createRateLimiter({
    maxRequests:
      Number.parseInt(process.env.DEVICE_PAIRING_CONFIRM_RATE_LIMIT_MAX ?? '20', 10) || 20,
    windowMs:
      Number.parseInt(process.env.DEVICE_PAIRING_CONFIRM_RATE_LIMIT_WINDOW_MS ?? '60000', 10) ||
      60_000,
  });
  const sessionConfig = getCurrentAuthConfig(db);

  function createStartDevicePairingHandler(role: DeviceSessionRole, defaultDisplayId: string) {
    return async (
      request: FastifyRequest<{ Body: DevicePairingStartBody }>,
      reply: FastifyReply,
    ) => {
      const clientKey = request.ip?.trim() || 'unknown';
      if (!pairingStartRateLimiter(clientKey)) {
        return reply
          .code(429)
          .send({ code: 'RATE_LIMITED', message: 'Too many pairing attempts.' });
      }

      const pairing = startDevicePairing({
        role,
        displayId: request.body?.displayId?.trim() || defaultDisplayId,
      });
      if (!pairing) {
        return reply
          .code(429)
          .send({ code: 'RATE_LIMITED', message: 'Too many pairing attempts.' });
      }
      recordPairingDevicePresence(role, request.body?.displayId?.trim() || defaultDisplayId);
      return pairing;
    };
  }

  function createConfirmDevicePairingHandler(role: DeviceSessionRole) {
    return async (
      request: FastifyRequest<{ Body: DevicePairingConfirmBody }>,
      reply: FastifyReply,
    ) => {
      const confirmKey = `${request.ip?.trim() || 'unknown'}:${request.staffSession?.sessionId ?? 'anonymous'}`;
      if (!pairingConfirmRateLimiter(confirmKey)) {
        return reply
          .code(429)
          .send({ code: 'RATE_LIMITED', message: 'Too many pairing confirmation attempts.' });
      }

      const code = request.body.code?.trim() ?? '';
      const pairing = confirmDevicePairing(role, code);
      if (!pairing) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Pairing code not found.' });
      }

      if (isDevicePairingAlreadyConfirmed(pairing)) {
        return {
          ok: true,
          pairingId: pairing.pairingId,
          status: 'already_paired',
        };
      }

      const token = randomBytes(32).toString('base64url');
      attachDeviceSessionToPairing(role, pairing, token, pairing.pairingId);

      return {
        ok: true,
        pairingId: pairing.pairingId,
        status: 'paired',
      };
    };
  }

  function createDevicePairingStatusHandler(role: DeviceSessionRole) {
    return async (
      request: FastifyRequest<{ Params: DevicePairingParams }>,
      reply: FastifyReply,
    ) => {
      const pairingId = request.params.pairingId.trim();
      const pairing = getDevicePairingById(pairingId);
      if (!pairing || pairing.role !== role) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Pairing request not found.' });
      }

      if (!pairing.deviceToken) {
        if (pairing.expiresAtMs <= Date.now()) {
          removeDevicePairing(pairingId);
          return {
            pairingId,
            status: 'expired',
            paired: false,
            expiresAt: new Date(pairing.expiresAtMs).toISOString(),
          };
        }
        recordPairingDevicePresence(role, pairing.displayId);
        return {
          pairingId,
          status: 'pending',
          paired: false,
          expiresAt: new Date(pairing.expiresAtMs).toISOString(),
        };
      }

      const row = db.replaceSlotDeviceAuthorization({
        role,
        deviceId: pairing.displayId,
        token: pairing.deviceToken,
      });
      setDeviceSessionCookie(reply, request, role, pairing.deviceToken);
      removeDevicePairing(pairingId);
      return {
        pairingId,
        status: 'paired',
        paired: true,
        sessionId: row.authorizationId,
      };
    };
  }

  app.post<{ Body: StaffLoginBody }>(
    '/api/v1/auth/login',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_loginRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_loginResponse200,
          401: authSchemas.POST_api_v1_auth_loginResponse401,
          429: authSchemas.POST_api_v1_auth_loginResponse429,
        },
      },
    },
    async (request, reply) => {
      const clientKey = request.ip?.trim() || 'unknown';
      if (!loginRateLimiter(clientKey)) {
        return reply.code(429).send({ code: 'RATE_LIMITED', message: 'Too many login attempts.' });
      }

      const pin = request.body.pin?.trim() ?? '';
      const role = request.body.role;
      if (!isStaffRole(role)) {
        return reply
          .code(400)
          .send({ code: 'INVALID_ARGUMENT', message: 'Staff role is required.' });
      }
      const config = getCurrentAuthConfig(db);
      if (!verifyStaffPin(pin, config.pinHashesByRole[role])) {
        return reply.code(401).send({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
      }

      const { token, session } = sessions.createStaffSession(role);
      setStaffSessionCookie(reply, request, role, token, sessionConfig.sessionTtlMs);
      return reply.send({
        ok: true,
        sessionId: session.sessionId,
        role: session.role,
        expiresAt: session.expiresAt,
      });
    },
  );

  app.get(
    '/api/v1/auth/room-panel/rooms',
    {
      schema: {
        response: {
          200: authSchemas.GET_api_v1_auth_room_panel_roomsResponse200,
        },
      },
    },
    async () => ({
      rooms: listEnabledRoomPanelRooms(db),
    }),
  );

  app.post<{ Body: RoomPanelLoginBody }>(
    '/api/v1/auth/room-panel/login',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_room_panel_loginRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_room_panel_loginResponse200,
          400: authSchemas.POST_api_v1_auth_room_panel_loginResponse400,
          401: authSchemas.POST_api_v1_auth_room_panel_loginResponse401,
          404: authSchemas.POST_api_v1_auth_room_panel_loginResponse404,
          429: authSchemas.POST_api_v1_auth_room_panel_loginResponse429,
        },
      },
    },
    async (request, reply) => {
      const clientKey = request.ip?.trim() || 'unknown';
      const roomId = request.body.roomId?.trim() ?? '';
      const placement = request.body.placement;
      const pin = request.body.pin?.trim() ?? '';

      if (!isRoomPanelPlacement(placement)) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Room panel placement must be outside or inside.',
        });
      }

      const room = listEnabledRoomPanelRooms(db).find(
        (entry) => entry.roomId === roomId && entry.placement === placement,
      );
      if (!room) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Room panel room not found.' });
      }

      if (!roomPanelPinLoginRateLimiter(clientKey)) {
        return reply
          .code(429)
          .send({ code: 'RATE_LIMITED', message: 'Too many room panel login attempts.' });
      }

      const config = getCurrentAuthConfig(db);
      if (!verifyStaffPin(pin, config.roomPanelPinHash)) {
        return reply.code(401).send({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
      }

      const previousToken = readCookieValue(request, getRoomPanelSessionCookieName());
      if (previousToken) {
        db.revokeDeviceAuthorizationByToken(previousToken);
      }

      const token = randomBytes(32).toString('base64url');
      const row = db.enrollRoomPanelDeviceAuthorization({
        roomId: room.roomId,
        placement: room.placement,
        token,
      });
      setRoomPanelSessionCookie(reply, request, token);
      return reply.send({
        ok: true,
        sessionId: row.authorizationId,
        role: 'room-panel' as const,
        roomId: room.roomId,
        placement: room.placement,
        expiresAt: new Date(Date.now() + DEVICE_AUTHORIZATION_COOKIE_TTL_MS).toISOString(),
      });
    },
  );

  app.post<{ Body: ChangePinBody }>(
    '/api/v1/auth/pin/change',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_pin_changeRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_pin_changeResponse200,
          400: authSchemas.POST_api_v1_auth_pin_changeResponse400,
          401: authSchemas.POST_api_v1_auth_pin_changeResponse401,
          403: authSchemas.POST_api_v1_auth_pin_changeResponse403,
          429: authSchemas.POST_api_v1_auth_pin_changeResponse429,
        },
      },
    },
    async (request, reply) => {
      const currentPin = request.body.currentPin?.trim() ?? '';
      const newPin = request.body.newPin?.trim() ?? '';
      const target = isPinTarget(request.body.target) ? request.body.target : null;
      if (!target || newPin.length < 4 || newPin.length > 32) {
        return reply
          .code(400)
          .send({ code: 'INVALID_ARGUMENT', message: 'Invalid PIN change request.' });
      }

      const sessionRole = request.staffSession?.role;
      if (target === 'ops') {
        if (sessionRole !== 'ops') {
          return reply.code(403).send({ code: 'AUTH_FORBIDDEN', message: 'Ops session required.' });
        }
      } else if (sessionRole !== 'mfa') {
        return reply.code(403).send({ code: 'AUTH_FORBIDDEN', message: 'MFA session required.' });
      }

      const staffSession = request.staffSession;
      if (!staffSession) {
        return reply.code(401).send({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
      }

      const clientKey = `${staffSession.sessionId}:${request.ip?.trim() || 'unknown'}`;
      if (!pinChangeRateLimiter(clientKey)) {
        return reply
          .code(429)
          .send({ code: 'RATE_LIMITED', message: 'Too many PIN change attempts.' });
      }

      const currentConfig = getCurrentAuthConfig(db);
      const currentPinHash =
        target === 'ops' ? currentConfig.pinHashesByRole.ops : currentConfig.pinHashesByRole.mfa;
      if (!verifyStaffPin(currentPin, currentPinHash)) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Current PIN is incorrect.',
        });
      }
      if (target === 'mfa' && verifyStaffPin(newPin, currentConfig.pinHashesByRole.ops)) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'MFA and Ops PINs must be different.',
        });
      }
      if (target === 'ops' && verifyStaffPin(newPin, currentConfig.pinHashesByRole.mfa)) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'MFA and Ops PINs must be different.',
        });
      }

      const updated = db.updateAuthPinHash(target, hashStaffPinForConfig(newPin));
      if (target === 'mfa') {
        sessions.revokeSessionsByRole('mfa', staffSession.sessionId);
      } else if (target === 'ops') {
        sessions.revokeSessionsByRole('ops');
      } else {
        db.revokeAllRoomPanelAuthorizations();
      }
      return reply.send({
        ok: true,
        target,
        updatedAt: updated.updatedAt,
      });
    },
  );

  app.get(
    '/api/v1/auth/me',
    {
      schema: {
        response: {
          200: authSchemas.GET_api_v1_auth_meResponse200,
          401: authSchemas.GET_api_v1_auth_meResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.staffSession) {
        return reply.code(401).send({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
      }

      return {
        ok: true,
        sessionId: request.staffSession.sessionId,
        role: request.staffSession.role,
        expiresAt: request.staffSession.expiresAt,
      };
    },
  );

  app.post(
    '/api/v1/auth/logout',
    {
      schema: {
        response: {
          200: authSchemas.POST_api_v1_auth_logoutResponse200,
          400: authSchemas.POST_api_v1_auth_logoutResponse400,
        },
      },
    },
    async (request, reply) => {
      const role = readRequestedCookieSlotRole(request);
      if (!role) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'X-Client-Role header is required.',
        });
      }

      const token = readSessionTokenForSlot(request, role);
      if (token) {
        if (role === 'tv' || role === 'terminal' || role === 'room-panel') {
          db.revokeDeviceAuthorizationByToken(token);
        } else {
          sessions.revokeSession(token);
        }
      }
      clearSessionCookieForSlot(reply, request, role);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Body: DevicePairingStartBody }>(
    '/api/v1/auth/tv/pairing/start',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_tv_pairing_startRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_tv_pairing_startResponse200,
          429: authSchemas.POST_api_v1_auth_tv_pairing_startResponse429,
        },
      },
    },
    createStartDevicePairingHandler('tv', DEFAULT_TV_DISPLAY_ID),
  );

  app.post<{ Body: DevicePairingConfirmBody }>(
    '/api/v1/auth/tv/pairing/confirm',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_tv_pairing_confirmRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_tv_pairing_confirmResponse200,
          404: authSchemas.POST_api_v1_auth_tv_pairing_confirmResponse404,
          429: authSchemas.POST_api_v1_auth_tv_pairing_confirmResponse429,
        },
      },
    },
    createConfirmDevicePairingHandler('tv'),
  );

  app.get<{ Params: DevicePairingParams }>(
    '/api/v1/auth/tv/pairing/:pairingId',
    {
      schema: {
        params: authSchemas.GET_api_v1_auth_tv_pairing_pairingId_Params,
        response: {
          200: authSchemas.GET_api_v1_auth_tv_pairing_pairingId_Response200,
          404: authSchemas.GET_api_v1_auth_tv_pairing_pairingId_Response404,
        },
      },
    },
    createDevicePairingStatusHandler('tv'),
  );

  app.post<{ Body: DevicePairingStartBody }>(
    '/api/v1/auth/terminal/pairing/start',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_terminal_pairing_startRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_terminal_pairing_startResponse200,
          429: authSchemas.POST_api_v1_auth_terminal_pairing_startResponse429,
        },
      },
    },
    createStartDevicePairingHandler('terminal', DEFAULT_TERMINAL_DISPLAY_ID),
  );

  app.post<{ Body: DevicePairingConfirmBody }>(
    '/api/v1/auth/terminal/pairing/confirm',
    {
      schema: {
        body: authSchemas.POST_api_v1_auth_terminal_pairing_confirmRequestBody,
        response: {
          200: authSchemas.POST_api_v1_auth_terminal_pairing_confirmResponse200,
          404: authSchemas.POST_api_v1_auth_terminal_pairing_confirmResponse404,
          429: authSchemas.POST_api_v1_auth_terminal_pairing_confirmResponse429,
        },
      },
    },
    createConfirmDevicePairingHandler('terminal'),
  );

  app.get<{ Params: DevicePairingParams }>(
    '/api/v1/auth/terminal/pairing/:pairingId',
    {
      schema: {
        params: authSchemas.GET_api_v1_auth_terminal_pairing_pairingId_Params,
        response: {
          200: authSchemas.GET_api_v1_auth_terminal_pairing_pairingId_Response200,
          404: authSchemas.GET_api_v1_auth_terminal_pairing_pairingId_Response404,
        },
      },
    },
    createDevicePairingStatusHandler('terminal'),
  );
}
