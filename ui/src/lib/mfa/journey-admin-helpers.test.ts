import { describe, expect, it } from 'vitest';
import {
  buildJourneyPreview,
  createJourneyTemplate,
  normalizeJourneySettingsForSave,
  validateJourneySettingsForSave,
  journeyStepRoomBadge,
} from './journey-admin-helpers';

describe('journey-admin-helpers', () => {
  const rooms = [
    { roomId: 'room_a', roomLabel: 'Raum A', enabled: true },
    { roomId: 'room_b', roomLabel: 'Raum B', enabled: true },
  ];
  const enabledRoomIds = new Set(rooms.map((room) => room.roomId));

  it('buildJourneyPreview uses the no-steps label when a template has no hops', () => {
    const template = createJourneyTemplate('Labor', new Set(), 'room_a');
    template.steps = [];

    expect(buildJourneyPreview(template, rooms, 'Keine Schritte')).toBe('Labor · Keine Schritte');
  });

  it('buildJourneyPreview lists hop targets in sort order', () => {
    const template = createJourneyTemplate('Labor', new Set(), 'room_a');
    template.steps = [
      {
        id: 'step_1',
        sortOrder: 1,
        targetLocationId: 'room_b',
        queueId: 'pf_general_queue',
        movementMode: 'call',
        publicDisplayMode: 'visible',
        completedWhen: 'arrive',
        instructionText: null,
      },
      {
        id: 'step_0',
        sortOrder: 0,
        targetLocationId: 'room_a',
        queueId: 'pf_general_queue',
        movementMode: 'self_go',
        publicDisplayMode: 'hidden',
        completedWhen: 'done',
        instructionText: null,
      },
    ];

    expect(buildJourneyPreview(template, rooms, 'Keine Schritte')).toBe(
      'Labor · 1: Raum A → 2: Raum B',
    );
  });

  it('validateJourneySettingsForSave rejects empty template names', () => {
    const template = createJourneyTemplate('Labor', new Set(), 'room_a');
    template.name = '   ';

    expect(validateJourneySettingsForSave({ templates: [template] }, enabledRoomIds)).toEqual({
      ok: false,
      messageKey: 'mfa.settings.journeyTemplateNameRequired',
    });
  });

  it('validateJourneySettingsForSave rejects steps without an enabled target room', () => {
    const template = createJourneyTemplate('Labor', new Set(), 'room_a');
    template.steps[0] = { ...template.steps[0], targetLocationId: 'missing_room' };

    expect(validateJourneySettingsForSave({ templates: [template] }, enabledRoomIds)).toEqual({
      ok: false,
      messageKey: 'mfa.settings.journeyStepTargetInvalid',
    });
  });

  it('normalizeJourneySettingsForSave reindexes sortOrder and trims fields', () => {
    const template = createJourneyTemplate('  Labor  ', new Set(), 'room_a');
    template.steps[0] = {
      ...template.steps[0],
      sortOrder: 9,
      instructionText: '  Hinweis  ',
      queueId: null,
    };

    const normalized = normalizeJourneySettingsForSave({ templates: [template] });
    expect(normalized.templates[0]?.name).toBe('Labor');
    expect(normalized.templates[0]?.steps[0]?.sortOrder).toBe(0);
    expect(normalized.templates[0]?.steps[0]?.instructionText).toBe('Hinweis');
    expect(normalized.templates[0]?.steps[0]?.queueId).toBe('pf_general_queue');
  });

  it('journeyStepRoomBadge uppercases the room label', () => {
    expect(journeyStepRoomBadge('room_a', rooms)).toBe('RAUM A');
  });
});
