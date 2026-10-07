import { createModuleLogger } from '@wartezimmer/server-shared/logger';
import { domainError } from '../errors/domain-error.js';
import { resolveBusinessTimeZone } from '../practice-time-windows.js';
import type { DayClosePhase } from './db-types.js';

const log = createModuleLogger('db.time');

export function nowIso(): string {
  return new Date().toISOString();
}

export function getBusinessDay(): string {
  const timeZone = resolveBusinessTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    log.warn(
      {
        businessTz: timeZone,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      },
      'Invalid BUSINESS_TZ, falling back to UTC business day',
    );
  }
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDayClosePhase(raw: string | undefined): DayClosePhase {
  if (raw === 'open' || raw === 'started') {
    return raw;
  }

  throw domainError('INVALID_DAY_CLOSE_PHASE_VALUE');
}
