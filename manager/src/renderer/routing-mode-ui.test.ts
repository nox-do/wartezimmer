import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutingModeOptions, formatRoutingModeError } from './routing-mode-ui.js';

test('formatRoutingModeError maps active journey blockade', () => {
  assert.equal(
    formatRoutingModeError({
      code: 'ROUTING_MODE_CHANGE_BLOCKED',
      error: 'blocked',
      details: { activeJourneyVisitCount: 2 },
    }),
    'Wechsel nicht möglich: 2 Besuche mit aktiver Journey.',
  );
});

test('formatRoutingModeError maps license error', () => {
  assert.equal(
    formatRoutingModeError({
      code: 'COMPLEX_ROUTING_NOT_LICENSED',
      error: 'Complex routing is not included in your license.',
    }),
    'Complex Routing ist in Ihrer Lizenz nicht enthalten.',
  );
});

test('formatRoutingModeError maps unreachable app', () => {
  assert.equal(
    formatRoutingModeError({
      error: 'Praxis Flow App ist nicht erreichbar (Port 8080).',
    }),
    'Praxis Flow läuft nicht — Stack starten oder später erneut versuchen.',
  );
});

test('buildRoutingModeOptions marks complex as disabled without license in wizard', () => {
  const options = buildRoutingModeOptions('wizard', false);
  const complex = options.find((option) => option.value === 'complex');
  assert.equal(complex?.disabled, true);
  assert.equal(complex?.pro, true);
  assert.equal(options.find((option) => option.value === 'simple')?.recommended, true);
});
