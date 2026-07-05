export type PortalSessionContext = {
  sessionToken: string;
  ticketCode: string;
  visitId: string;
};

const TOKEN_KEY = 'portal:session-token';
const TICKET_CODE_KEY = 'portal:ticket-code';
const VISIT_ID_KEY = 'portal:ticket-id';

export function storePortalSession(context: PortalSessionContext): void {
  sessionStorage.setItem(TOKEN_KEY, context.sessionToken);
  sessionStorage.setItem(TICKET_CODE_KEY, context.ticketCode);
  sessionStorage.setItem(VISIT_ID_KEY, context.visitId);
}

export function readPortalSession(): PortalSessionContext | null {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  const ticketCode = sessionStorage.getItem(TICKET_CODE_KEY);
  const visitId = sessionStorage.getItem(VISIT_ID_KEY);
  if (!sessionToken || !ticketCode || !visitId) {
    return null;
  }
  return { sessionToken, ticketCode, visitId };
}

export function clearPortalSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TICKET_CODE_KEY);
  sessionStorage.removeItem(VISIT_ID_KEY);
}

export async function activatePortalSession(
  context: PortalSessionContext,
): Promise<PortalSessionContext> {
  storePortalSession(context);
  return context;
}
