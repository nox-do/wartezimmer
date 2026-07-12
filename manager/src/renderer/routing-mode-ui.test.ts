import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRoutingModeOptions,
  formatRoutingModeError,
  formatRoutingModeMaintenanceFootnote,
} from './routing-mode-ui.js';

test('formatRoutingModeError maps open waiting-number blockade', () => {
  assert.equal(
    formatRoutingModeError({
      code: 'ROUTING_MODE_CHANGE_BLOCKED',
      error: 'blocked',
      details: { openVisitCount: 2 },
    }),
    'Wechsel nicht möglich: 2 Wartenummern noch aktiv.',
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

test('formatRoutingModeError maps unreachable maintenance API', () => {
  assert.equal(
    formatRoutingModeError({
      error: 'Praxis Flow Maintenance-API ist nicht erreichbar (Port 8082).',
    }),
    'Praxis Flow läuft nicht — Stack starten oder später erneut versuchen.',
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

test('formatRoutingModeMaintenanceFootnote uses rule when empty', () => {
  assert.equal(
    formatRoutingModeMaintenanceFootnote(0),
    'Modus gilt praxisweit. Wechsel nur möglich, wenn keine Wartenummern aktiv sind.',
  );
});

test('formatRoutingModeMaintenanceFootnote includes count when blocked', () => {
  assert.equal(
    formatRoutingModeMaintenanceFootnote(8),
    'Modus gilt praxisweit. Wechsel gesperrt: 8 Wartenummern noch aktiv.',
  );
  assert.equal(
    formatRoutingModeMaintenanceFootnote(1),
    'Modus gilt praxisweit. Wechsel gesperrt: 1 Wartenummer noch aktiv.',
  );
});

test('buildRoutingModeOptions marks complex as disabled without license in wizard', () => {
  const options = buildRoutingModeOptions('wizard', false);
  const complex = options.find((option) => option.value === 'complex');
  assert.equal(complex?.disabled, true);
  assert.equal(complex?.pro, true);
  assert.equal(options.find((option) => option.value === 'simple')?.recommended, true);
});

test('buildRoutingModeOptions disables only the other mode while waiting numbers are open', () => {
  const options = buildRoutingModeOptions('maintenance', true, 3, 'simple');
  assert.equal(options.find((option) => option.value === 'simple')?.disabled, false);
  assert.equal(options.find((option) => option.value === 'complex')?.disabled, true);
});
