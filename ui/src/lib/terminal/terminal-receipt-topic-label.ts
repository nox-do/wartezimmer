import type { TerminalCheckinResult } from './terminal-session';

/** Bon text for MFA-assist check-ins — patient-facing, not internal topic id. */
export function resolveReceiptTopicLabel(
  checkin: Pick<TerminalCheckinResult, 'authPath' | 'topicLabel' | 'topicId'>,
  empfangLabel: string,
): string {
  if (checkin.authPath === 'mfa_assist') {
    return empfangLabel;
  }
  const fromCheckin = checkin.topicLabel?.trim();
  return fromCheckin || checkin.topicId;
}
