import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@wartezimmer/flow-core/server';

test('saveTopic: bei offenen Visits nicht speicherbar', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const topic = catalog.topics.find((item) => item.id === 'general');
  assert.ok(topic);

  runtime.checkIn({ topicId: 'general', displayName: 'Offen', surfaceId: 'terminal_1' });

  assert.throws(
    () =>
      runtime.saveTopic('general', {
        name: 'Neuer Name',
        category: topic.category,
        color: topic.color,
        defaultPriority: topic.defaultPriority,
        estimatedDurationMin: topic.estimatedDurationMin,
        active: topic.active,
        sortOrder: topic.sortOrder,
        laneCode: topic.laneCode,
      }),
    /TOPIC_LOCKED/,
  );
});

test('saveTopic: ohne offene Visits erlaubt', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const topic = catalog.topics.find((item) => item.id === 'blood');
  assert.ok(topic);

  const saved = runtime.saveTopic('blood', {
    name: 'Blut geändert',
    category: topic.category,
    color: topic.color,
    defaultPriority: topic.defaultPriority,
    estimatedDurationMin: topic.estimatedDurationMin,
    active: topic.active,
    sortOrder: topic.sortOrder,
    laneCode: topic.laneCode,
  });

  assert.equal(saved.name, 'Blut geändert');
});
