import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { TopicSetting } from '../checkin-topic-settings.js';
import { TOPIC_LOCKED, validateTopicSettingsChange } from './topic-settings-guard.js';

const topic: TopicSetting = {
  topicId: 'labor',
  label: 'Labor',
  laneCode: 'L',
  defaultRoomId: 'labor',
  iconId: null,
  accentColor: '#000000',
  enabled: true,
  availableFrom: null,
  availableTo: null,
  sortOrder: 1,
};

function testDb(status: string): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE visits (
    primary_topic_id TEXT,
    status TEXT,
    queue_lane_code TEXT,
    queue_sequence INTEGER,
    created_at TEXT
  )`);
  db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?, ?)').run(
    topic.topicId,
    status,
    topic.laneCode,
    7,
    '2026-09-22T12:00:00.000Z',
  );
  return db;
}

test('validateTopicSettingsChange blocks edits with an open matching visit', () => {
  const result = validateTopicSettingsChange({
    db: testDb('waiting'),
    currentTopics: [topic],
    nextTopics: [{ ...topic, label: 'Labor neu' }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, TOPIC_LOCKED);
    assert.equal(result.details.tickets, 'L-007');
  }
});

test('validateTopicSettingsChange allows edits after the matching visit is terminal', () => {
  assert.deepEqual(
    validateTopicSettingsChange({
      db: testDb('cancelled'),
      currentTopics: [topic],
      nextTopics: [{ ...topic, label: 'Labor neu' }],
    }),
    { ok: true },
  );
});

test('validateTopicSettingsChange allows adding an unrelated topic', () => {
  assert.deepEqual(
    validateTopicSettingsChange({
      db: testDb('waiting'),
      currentTopics: [topic],
      nextTopics: [topic, { ...topic, topicId: 'neu', label: 'Neu', laneCode: 'N', sortOrder: 2 }],
    }),
    { ok: true },
  );
});
