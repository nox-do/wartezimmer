import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ruleForTopicAtSurface,
  terminalsForTopic,
  topicsForTerminal
} from '@praxis-flow/flow-core';
import { openDb } from '@praxis-flow/flow-core/server';

test('ruleForTopicAtSurface: disjunkte Terminal-Scopes waehlen passende Rule', () => {
  const db = openDb({ reset: true, path: ':memory:' });
  const catalog = {
    topics: [{ id: 'blood', name: 'Blut', active: true }],
    surfaces: [
      { id: 'terminal_1', type: 'terminal', enabled: true },
      { id: 'terminal_2', type: 'terminal', enabled: true }
    ],
    routingRules: [
      { id: 'rule_a', topicId: 'blood', active: true, allowedSurfaceIds: ['terminal_1'] },
      { id: 'rule_b', topicId: 'blood', active: true, allowedSurfaceIds: ['terminal_2'] }
    ]
  };

  assert.equal(ruleForTopicAtSurface(catalog, 'blood', 'terminal_1')?.id, 'rule_a');
  assert.equal(ruleForTopicAtSurface(catalog, 'blood', 'terminal_2')?.id, 'rule_b');
  assert.equal(ruleForTopicAtSurface(catalog, 'blood', 'terminal_3'), undefined);

  db.close();
});

test('topicsForTerminal und terminalsForTopic beruecksichtigen alle passenden Rules', () => {
  const catalog = {
    topics: [
      { id: 'blood', name: 'Blut', active: true },
      { id: 'general', name: 'Allgemein', active: true }
    ],
    surfaces: [
      { id: 'terminal_1', type: 'terminal', enabled: true, name: 'T1' },
      { id: 'terminal_2', type: 'terminal', enabled: true, name: 'T2' }
    ],
    routingRules: [
      { id: 'rule_a', topicId: 'blood', active: true, allowedSurfaceIds: ['terminal_1'] },
      { id: 'rule_b', topicId: 'blood', active: true, allowedSurfaceIds: ['terminal_2'] },
      { id: 'rule_general', topicId: 'general', active: true, allowedSurfaceIds: ['terminal_1'] }
    ]
  };

  assert.deepEqual(topicsForTerminal(catalog, 'terminal_2').map((topic) => topic.id), ['blood']);
  assert.deepEqual(terminalsForTopic(catalog, 'blood').map((terminal) => terminal.id), ['terminal_1', 'terminal_2']);
});
