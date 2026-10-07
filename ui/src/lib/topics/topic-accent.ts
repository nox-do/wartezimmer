export {
  DEFAULT_TOPIC_ACCENT,
  defaultAccentForLane,
  isValidTopicAccentColor,
  normalizeTopicAccentColor,
  textColorOnAccent,
  TOPIC_ACCENT_PRESETS,
} from '@wartezimmer/domain';
import { normalizeTopicAccentColor, textColorOnAccent } from '@wartezimmer/domain';

export function laneBadgeStyle(accentColor: string): string {
  const bg = normalizeTopicAccentColor(accentColor);
  const fg = textColorOnAccent(bg);
  return `background:${bg};color:${fg}`;
}
