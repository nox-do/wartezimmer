import type { TerminalAuthPath } from './terminal-api';

export type TerminalSession = {
  authPath: TerminalAuthPath;
  assistMode?: boolean;
  phoneNumber?: string;
  lastName?: string;
  dobDisplay?: string;
};

export type TerminalCheckinResult = {
  ticketId: string;
  laneCode: string;
  number: number;
  topicId: string;
  topicLabel?: string;
  destinationRoomLabel?: string | null;
  authPath: TerminalAuthPath;
  createdAt: string;
};

const SESSION_KEY = 'terminal:session';
const RESULT_KEY = 'terminal:checkin-result';
const ASSIST_EXPIRES_KEY = 'terminal:assist-expires-at';

export function writeAssistMode(expiresAt: string): void {
  sessionStorage.setItem(ASSIST_EXPIRES_KEY, expiresAt);
}

export function readAssistMode(): boolean {
  const expiresAt = sessionStorage.getItem(ASSIST_EXPIRES_KEY);
  if (!expiresAt) {
    return false;
  }
  if (Date.parse(expiresAt) <= Date.now()) {
    clearAssistMode();
    return false;
  }
  return true;
}

export function readAssistExpiresAt(): string | null {
  return sessionStorage.getItem(ASSIST_EXPIRES_KEY);
}

export function clearAssistMode(): void {
  sessionStorage.removeItem(ASSIST_EXPIRES_KEY);
}

export function terminalAuthEntryPath(authPath: TerminalAuthPath): string {
  if (authPath === 'egk') {
    return '/terminal/egk';
  }
  if (authPath === 'name_dob') {
    return '/terminal/name';
  }
  return '/terminal/phone';
}

export function readTerminalSession(): TerminalSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as TerminalSession;
  } catch {
    return null;
  }
}

export function writeTerminalSession(session: TerminalSession): void {
  const payload: TerminalSession = readAssistMode() ? { ...session, assistMode: true } : session;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function clearTerminalSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function writeCheckinResult(result: TerminalCheckinResult): void {
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
}

export function readCheckinResult(): TerminalCheckinResult | null {
  const raw = sessionStorage.getItem(RESULT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as TerminalCheckinResult;
  } catch {
    return null;
  }
}

export function clearCheckinResult(): void {
  sessionStorage.removeItem(RESULT_KEY);
}

export function resetTerminalFlow(): void {
  clearTerminalSession();
  clearCheckinResult();
  clearAssistMode();
}
