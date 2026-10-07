import type { DatabaseSync } from 'node:sqlite';
import { TERMINAL_VISIT_STATUSES } from '@wartezimmer/flow-core';
import type { TopicSetting } from '../checkin-topic-settings.js';
import { formatTicketCode } from '../queue/ticket-code.js';

export const TOPIC_LOCKED = 'TOPIC_LOCKED';

function changedExistingTopicIds(
  currentTopics: readonly TopicSetting[],
  nextTopics: readonly TopicSetting[],
): string[] {
  const nextById = new Map(nextTopics.map((topic) => [topic.topicId, topic]));
  return currentTopics
    .filter((topic) => {
      const next = nextById.get(topic.topicId);
      return !next || JSON.stringify(next) !== JSON.stringify(topic);
    })
    .map((topic) => topic.topicId);
}

export function validateTopicSettingsChange(input: {
  db: DatabaseSync;
  currentTopics: readonly TopicSetting[];
  nextTopics: readonly TopicSetting[];
}):
  | { ok: true }
  | {
      ok: false;
      code: typeof TOPIC_LOCKED;
      message: string;
      details: { tickets: string };
    } {
  const changedTopicIds = changedExistingTopicIds(input.currentTopics, input.nextTopics);
  if (changedTopicIds.length === 0) {
    return { ok: true };
  }

  const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
  const rows = input.db
    .prepare(
      `SELECT queue_lane_code AS laneCode, queue_sequence AS number
       FROM visits
       WHERE primary_topic_id IN (${changedTopicIds.map(() => '?').join(', ')})
       AND status NOT IN (${terminalStatuses.map(() => '?').join(', ')})
       ORDER BY created_at`,
    )
    .all(...changedTopicIds, ...terminalStatuses) as Array<{ laneCode: string; number: number }>;
  if (rows.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    code: TOPIC_LOCKED,
    message: 'Topic cannot be changed while matching visits are still open.',
    details: { tickets: rows.map((row) => formatTicketCode(row.laneCode, row.number)).join(', ') },
  };
}
