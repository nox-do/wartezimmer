export type PortalSessionContext = {
  sessionToken: string;
  ticketCode: string;
  ticketId: string;
};

const TOKEN_KEY = 'portal:session-token';
const TICKET_CODE_KEY = 'portal:ticket-code';
const TICKET_ID_KEY = 'portal:ticket-id';

export function storePortalSession(context: PortalSessionContext): void {
  sessionStorage.setItem(TOKEN_KEY, context.sessionToken);
  sessionStorage.setItem(TICKET_CODE_KEY, context.ticketCode);
  sessionStorage.setItem(TICKET_ID_KEY, context.ticketId);
}

export function readPortalSession(): PortalSessionContext | null {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  const ticketCode = sessionStorage.getItem(TICKET_CODE_KEY);
  const ticketId = sessionStorage.getItem(TICKET_ID_KEY);
  if (!sessionToken || !ticketCode || !ticketId) {
    return null;
  }
  return { sessionToken, ticketCode, ticketId };
}

export function clearPortalSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TICKET_CODE_KEY);
  sessionStorage.removeItem(TICKET_ID_KEY);
}

export async function activatePortalSession(
  context: PortalSessionContext,
): Promise<PortalSessionContext> {
  storePortalSession(context);
  return context;
}
