import type { TerminalCheckinResult } from './terminal-session';

/** Bon text for direct reception check-ins without prior identification. */
export function resolveReceiptTopicLabel(
  checkin: Pick<TerminalCheckinResult, 'authPath' | 'topicLabel' | 'topicId'>,
  empfangLabel: string,
): string {
  if (checkin.authPath === 'none') {
    return empfangLabel;
  }
  const fromCheckin = checkin.topicLabel?.trim();
  return fromCheckin || checkin.topicId;
}
