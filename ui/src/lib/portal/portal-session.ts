export type PortalSessionContext = {
  sessionToken: string;
  ticketCode: string;
  visitId: string;
};

const TOKEN_KEY = 'portal:session-token';
const TICKET_CODE_KEY = 'portal:ticket-code';
const VISIT_ID_KEY = 'portal:ticket-id';

export class PortalSessionStorageError extends Error {
  constructor() {
    super('Portal session storage is unavailable');
    this.name = 'PortalSessionStorageError';
  }
}

// Fail closed after a failed write/removal, even if stale keys remain readable.
// This flag contains no credentials and is reset only by a complete activation.
let invalidated = false;

export function storePortalSession(context: PortalSessionContext): void {
  if (!clearPortalSession()) throw new PortalSessionStorageError();
  try {
    sessionStorage.setItem(TICKET_CODE_KEY, context.ticketCode);
    sessionStorage.setItem(VISIT_ID_KEY, context.visitId);
    // Write the token last so partial writes cannot activate a new session.
    sessionStorage.setItem(TOKEN_KEY, context.sessionToken);
    invalidated = false;
  } catch {
    clearPortalSession();
    throw new PortalSessionStorageError();
  }
}

export function readPortalSession(): PortalSessionContext | null {
  if (invalidated) return null;
  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    const ticketCode = sessionStorage.getItem(TICKET_CODE_KEY);
    const visitId = sessionStorage.getItem(VISIT_ID_KEY);
    if (!sessionToken || !ticketCode || !visitId) return null;
    return { sessionToken, ticketCode, visitId };
  } catch {
    throw new PortalSessionStorageError();
  }
}

export function clearPortalSession(): boolean {
  invalidated = true;
  let cleared = true;
  for (const key of [TOKEN_KEY, TICKET_CODE_KEY, VISIT_ID_KEY]) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      cleared = false;
      // Continue clearing other keys. Server-side expiry remains authoritative.
    }
  }
  return cleared;
}

export async function activatePortalSession(
  context: PortalSessionContext,
): Promise<PortalSessionContext> {
  storePortalSession(context);
  return context;
}
