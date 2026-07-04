import { formatTicketCode } from '@praxis-flow/domain';

export { formatTicketCode };

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
