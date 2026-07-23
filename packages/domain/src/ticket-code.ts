export function formatTicketCode(laneCode: string, number: number): string {
  return `${laneCode.trim().toUpperCase()}-${String(number).padStart(3, '0')}`;
}

/** Lane + 1–4 digits; optional hyphen (A-001 or A001). */
export function parseTicketCode(ticketCode: string): { laneCode: string; number: number } | null {
  const normalized = ticketCode.trim().toUpperCase();
  const match = normalized.match(/^([A-Z])-?([0-9]{1,4})$/);
  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[2], 10);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return { laneCode: match[1], number };
}
