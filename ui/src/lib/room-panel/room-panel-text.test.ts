import { describe, expect, it } from 'vitest';
import { formatRoomPanelDisplayText, roomPanelPresetOptionLabel } from './room-panel-text';

const t = (key: string) => key;

describe('formatRoomPanelDisplayText', () => {
  it('maps presets to roomPanel i18n keys', () => {
    expect(formatRoomPanelDisplayText('please_enter', null, 'please_wait_here', t)).toBe(
      'roomPanel.text_please_enter',
    );
  });

  it('returns trimmed custom text when preset is custom', () => {
    expect(formatRoomPanelDisplayText('custom', '  Hallo  ', 'please_enter', t)).toBe('Hallo');
  });
});

describe('roomPanelPresetOptionLabel', () => {
  it('uses settings label for custom preset option', () => {
    expect(roomPanelPresetOptionLabel('custom', t)).toBe('mfa.settings.roomPanelPreset_custom');
  });
});
