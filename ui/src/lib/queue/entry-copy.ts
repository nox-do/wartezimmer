import { t, tf } from '$lib/i18n/i18nStore.svelte';
import { formatClockTime } from './format-time';
import { getTopicLabel } from './practice-catalog';
import type { QueueItem } from './types';

export type QueueEntryZone = 'active' | 'away' | 'waiting';

function patientLabel(item: QueueItem): string | null {
  const name = item.identityRef?.trim();
  return name ? name : null;
}

function topicLabel(item: QueueItem): string {
  return getTopicLabel(item.topicId, item.topicLabel);
}

function identityLine(item: QueueItem): string {
  const name = patientLabel(item);
  const topic = topicLabel(item);

  if (name && topic) {
    return `${name} · ${topic}`;
  }
  if (name) {
    return name;
  }
  return topic;
}

export function queueEntryPrimary(item: QueueItem): string {
  switch (item.status) {
    case 'absent_return_later':
      return tf('mfa.entryRecallActive', { topic: topicLabel(item) });
    default:
      return identityLine(item);
  }
}

export function queueEntrySecondary(item: QueueItem, zone: QueueEntryZone): string {
  const arrived = formatClockTime(item.arrivedAt);
  const destination = item.destinationRoomLabel?.trim() || item.roomLabel?.trim() || '';

  switch (item.status) {
    case 'called':
      return t('mfa.entryCalled');
    case 'in_room':
      if (item.escortTransferPending) {
        return destination ? tf('mfa.entryPickupTo', { room: destination }) : t('mfa.entryPickup');
      }
      return t('mfa.entryArrived');
    case 'directed':
      return destination
        ? tf('mfa.entryDirectedTo', { room: destination })
        : t('mfa.entryDirected');
    case 'absent_return_later':
      if (item.recallNotifyErrorCode) {
        return tf('mfa.entryAbsentRecallSmsFailed', { time: arrived });
      }
      if (item.recallNotifySent) {
        return tf('mfa.entryAbsentRecallSent', { time: arrived });
      }
      return tf('mfa.entryAbsentRecallWindow', { time: arrived });
    case 'absent_wait_here':
      return tf('mfa.entryAbsentOutSince', { time: arrived });
    default:
      if (zone === 'active') {
        return t('mfa.entryArrived');
      }
      if (zone === 'waiting' && item.movementMode === 'pickup') {
        return destination ? tf('mfa.entryPickupTo', { room: destination }) : t('mfa.entryPickup');
      }
      return tf('mfa.entryCheckedInAt', { time: arrived });
  }
}
