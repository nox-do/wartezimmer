export function formatTicketCode(laneCode: string, number: number): string {
  return `${laneCode.trim().toUpperCase()}-${String(number).padStart(3, '0')}`;
}
