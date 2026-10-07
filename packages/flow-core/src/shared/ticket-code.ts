import { formatTicketCode, parseTicketCode } from '@wartezimmer/domain';

export { formatTicketCode, parseTicketCode };

export function compactBusinessDay(businessDay: string): string {
  return businessDay.replaceAll('-', '');
}

/** Oeffentliche Visit-ID wie Wartezimmer: `20260602-A-017`. */
export function formatVisitId(businessDay: string, laneCode: string, sequence: number): string {
  return `${compactBusinessDay(businessDay)}-${formatTicketCode(laneCode, sequence)}`;
}

export function parseVisitId(
  visitId: string,
): { businessDay: string; laneCode: string; number: number } | null {
  const normalized = visitId.trim();
  const match = normalized.match(/^([0-9]{8})-([A-Z])-([0-9]{1,4})$/);
  if (!match) return null;

  const number = Number.parseInt(match[3], 10);
  if (!Number.isInteger(number) || number < 1) return null;

  const compact = match[1];
  return {
    businessDay: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`,
    laneCode: match[2],
    number,
  };
}
