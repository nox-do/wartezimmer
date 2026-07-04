export {
  DEFAULT_TOPIC_ACCENT,
  defaultAccentForLane,
  isValidTopicAccentColor,
  normalizeTopicAccentColor,
  textColorOnAccent,
  TOPIC_ACCENT_PRESETS,
} from '@praxis-flow/domain';
import { normalizeTopicAccentColor, textColorOnAccent } from '@praxis-flow/domain';

export function laneBadgeStyle(accentColor: string): string {
  const bg = normalizeTopicAccentColor(accentColor);
  const fg = textColorOnAccent(bg);
  return `background:${bg};color:${fg}`;
}
