import { createModuleLogger } from '@praxis-flow/server-shared';
import type { OpsSettings } from './db/db-types.js';
import { domainError } from './errors/domain-error.js';

const log = createModuleLogger('practice-time-windows');
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function resolveBusinessTimeZone(): string {
  return process.env.BUSINESS_TZ?.trim() || 'Europe/Berlin';
}

export function parseTimeOfDayToMinutes(value: string): number {
  const match = TIME_OF_DAY_PATTERN.exec(value.trim());
  if (!match) {
    throw domainError('OPS_SETTINGS_INVALID');
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return hours * 60 + minutes;
}

export function getBusinessMinutesOfDay(timeZone: string = resolveBusinessTimeZone()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const hourPart = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minutePart = parts.find((part) => part.type === 'minute')?.value ?? '00';
    return Number.parseInt(hourPart, 10) * 60 + Number.parseInt(minutePart, 10);
  } catch (error) {
    log.warn(
      {
        businessTz: timeZone,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      },
      'Invalid BUSINESS_TZ, falling back to UTC clock for time window checks',
    );
    const utcNow = new Date();
    return utcNow.getUTCHours() * 60 + utcNow.getUTCMinutes();
  }
}

export function isInsideDailyWindow(nowMinutes: number, from: string, to: string): boolean {
  const fromMinutes = parseTimeOfDayToMinutes(from);
  const toMinutes = parseTimeOfDayToMinutes(to);

  if (fromMinutes <= toMinutes) {
    return nowMinutes >= fromMinutes && nowMinutes <= toMinutes;
  }
  return nowMinutes >= fromMinutes || nowMinutes <= toMinutes;
}

export function isPracticeOpenAt(
  settings: Pick<OpsSettings, 'practiceOpenFrom' | 'practiceOpenTo'>,
  nowMinutes: number,
): boolean {
  return isInsideDailyWindow(nowMinutes, settings.practiceOpenFrom, settings.practiceOpenTo);
}

export type TopicTimeWindowFields = {
  enabled: boolean;
  availableFrom: string | null;
  availableTo: string | null;
};

export function isTopicWindowConfigured(
  topic: Pick<TopicTimeWindowFields, 'availableFrom' | 'availableTo'>,
): boolean {
  return topic.availableFrom != null && topic.availableTo != null;
}

export function isTopicAvailableAt(topic: TopicTimeWindowFields, nowMinutes: number): boolean {
  if (!topic.enabled) {
    return false;
  }
  if ((topic.availableFrom == null) !== (topic.availableTo == null)) {
    throw domainError('OPS_SETTINGS_INVALID');
  }
  if (!isTopicWindowConfigured(topic)) {
    return true;
  }
  return isInsideDailyWindow(nowMinutes, topic.availableFrom!, topic.availableTo!);
}
