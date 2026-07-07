import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_JOURNEY_SETTINGS,
  normalizeJourneySettings,
  validateTopicJourneyAssignments,
} from './journey-settings.js';

test('normalizeJourneySettings defaults to empty templates', () => {
  assert.deepEqual(normalizeJourneySettings(null), EMPTY_JOURNEY_SETTINGS);
});

test('validateTopicJourneyAssignments rejects unknown template', () => {
  const result = validateTopicJourneyAssignments(
    [{ topicId: 'blut', journeyTemplateId: 'missing' }],
    EMPTY_JOURNEY_SETTINGS,
  );
  assert.equal(result.ok, false);
});

test('validateTopicJourneyAssignments accepts active template assignment', () => {
  const result = validateTopicJourneyAssignments(
    [{ topicId: 'blut', journeyTemplateId: 'journey_blut' }],
    {
      templates: [
        {
          id: 'journey_blut',
          name: 'Blut',
          topicId: 'blut',
          active: true,
          steps: [
            {
              id: 's0',
              sortOrder: 0,
              targetLocationId: 'labor',
              queueId: 'q1',
              movementMode: 'call',
              publicDisplayMode: 'visible',
              advanceOn: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  );
  assert.equal(result.ok, true);
});
