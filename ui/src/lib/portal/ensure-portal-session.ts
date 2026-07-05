import { replaceState } from '$app/navigation';
import { t } from '$lib/i18n/i18nStore.svelte';
import { normalizeTicketCode } from '$lib/portal/normalize-ticket-code';
import {
  activatePortalSession,
  clearPortalSession,
  readPortalSession,
  type PortalSessionContext,
} from '$lib/portal/portal-session';
import { fetchPortalSessionMe, resolvePortalSession } from '$lib/portal/session-api';

export type PortalSessionBootstrapResult =
  | { ok: true; session: PortalSessionContext }
  | { ok: false; errorMessage: string };

export async function ensurePortalSession(
  ticketFromUrl: string | null,
  options: { replacePath?: string } = {},
): Promise<PortalSessionBootstrapResult> {
  if (ticketFromUrl) {
    const normalized = normalizeTicketCode(ticketFromUrl);
    if (!normalized) {
      return { ok: false, errorMessage: t('portal.invalidTicket') };
    }

    const resolved = await resolvePortalSession(normalized);
    if (!resolved.ok) {
      return {
        ok: false,
        errorMessage: resolved.error.message || t('portal.sessionResolveError'),
      };
    }

    const session = await activatePortalSession({
      sessionToken: resolved.data.sessionToken,
      ticketCode: normalized,
      visitId: resolved.data.visitId,
    });
    if (options.replacePath) {
      replaceState(options.replacePath, {});
    }
    return { ok: true, session };
  }

  const stored = readPortalSession();
  if (!stored) {
    return { ok: false, errorMessage: t('portal.sessionMissing') };
  }

  const me = await fetchPortalSessionMe(stored.sessionToken);
  if (!me.ok) {
    clearPortalSession();
    return { ok: false, errorMessage: t('portal.sessionExpired') };
  }

  if (me.data.status !== 'active') {
    clearPortalSession();
    return { ok: false, errorMessage: t('portal.sessionExpired') };
  }

  return { ok: true, session: stored };
}
