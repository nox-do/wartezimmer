import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';

export const PORTAL_DISABLED_RESPONSE = {
  code: 'PORTAL_DISABLED',
  message: 'Das Patientenportal ist in dieser Praxis derzeit nicht aktiv.',
} as const;

export function createRequirePortalEnabledPreHandler(db: Pick<CoreDatabase, 'isPortalEnabled'>) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!db.isPortalEnabled()) {
      return reply.code(403).send(PORTAL_DISABLED_RESPONSE);
    }
  };
}
