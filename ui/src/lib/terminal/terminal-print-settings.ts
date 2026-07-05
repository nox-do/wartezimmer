export const TERMINAL_PRINT_WIDTH_OPTIONS = [58, 80] as const;
export type TerminalPrintWidthMm = (typeof TERMINAL_PRINT_WIDTH_OPTIONS)[number];

export const DEFAULT_TERMINAL_PRINT_WIDTH_MM: TerminalPrintWidthMm = 80;

const PRINT_WIDTH_STORAGE_KEY = 'terminal:print-width-mm';
const PRINTED_TICKET_SESSION_KEY = 'terminal:printed-ticket-id';

export function isTerminalPrintWidthMm(value: number): value is TerminalPrintWidthMm {
  return (TERMINAL_PRINT_WIDTH_OPTIONS as readonly number[]).includes(value);
}

export function readTerminalPrintWidthMm(): TerminalPrintWidthMm {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_TERMINAL_PRINT_WIDTH_MM;
  }

  const raw = localStorage.getItem(PRINT_WIDTH_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_TERMINAL_PRINT_WIDTH_MM;
  }

  const parsed = Number.parseInt(raw, 10);
  return isTerminalPrintWidthMm(parsed) ? parsed : DEFAULT_TERMINAL_PRINT_WIDTH_MM;
}

/** Device-local kiosk preference — survives browser restarts on the terminal PC. */
export function writeTerminalPrintWidthMm(widthMm: TerminalPrintWidthMm): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(PRINT_WIDTH_STORAGE_KEY, String(widthMm));
}

export function shouldAutoPrintTicket(visitId: string): boolean {
  if (typeof sessionStorage === 'undefined') {
    return true;
  }
  return sessionStorage.getItem(PRINTED_TICKET_SESSION_KEY) !== visitId;
}

export function markTicketPrinted(visitId: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(PRINTED_TICKET_SESSION_KEY, visitId);
}
