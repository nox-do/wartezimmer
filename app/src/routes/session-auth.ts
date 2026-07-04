import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import type { PatientSession } from '../shared/db/db-types.js';
import { domainError, readDomainCode } from '../http/domain-error-mapper.js';

declare module 'fastify' {
  interface FastifyRequest {
    patientSession?: PatientSession;
    patientSessionToken?: string;
  }
}

const SESSION_UNAUTHORIZED_RESPONSE = {
  code: 'SESSION_UNAUTHORIZED',
  message: 'Unauthorized.',
} as const;

function isSessionUnauthorizedCode(code: string | null): boolean {
  return code === 'SESSION_UNAUTHORIZED' || code === 'SESSION_EXPIRED';
}

export function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = authorizationHeader.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function sendSessionUnauthorized(reply: FastifyReply): void {
  void reply.code(401).send(SESSION_UNAUTHORIZED_RESPONSE);
}

export function isSessionUnauthorizedError(error: unknown): boolean {
  return isSessionUnauthorizedCode(readDomainCode(error));
}

export function requireActiveSession(
  db: Pick<CoreDatabase, 'getPatientSession'>,
  sessionToken: string,
): PatientSession {
  try {
    return db.getPatientSession(sessionToken);
  } catch (error) {
    if (isSessionUnauthorizedError(error)) {
      throw domainError('SESSION_UNAUTHORIZED', { cause: error });
    }
    throw error;
  }
}

export function createRequirePatientSessionPreHandler(db: Pick<CoreDatabase, 'getPatientSession'>) {
  return async function requirePatientSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      sendSessionUnauthorized(reply);
      return;
    }

    try {
      request.patientSessionToken = token;
      request.patientSession = requireActiveSession(db, token);
    } catch (error) {
      if (isSessionUnauthorizedError(error)) {
        sendSessionUnauthorized(reply);
        return;
      }
      throw error;
    }
  };
}

export function getPatientSessionToken(request: FastifyRequest): string {
  const token = request.patientSessionToken;
  if (!token) {
    throw new Error('Patient session preHandler did not run');
  }
  return token;
}
