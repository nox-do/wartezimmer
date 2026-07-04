import { t } from '$lib/i18n/i18nStore.svelte';
import { defaultAccentForLane, normalizeTopicAccentColor } from '$lib/topics/topic-accent';
import type { PracticeTopicSetting } from './ops-settings-api';

let topics: PracticeTopicSetting[] = [];

export function setPracticeTopicCatalog(nextTopics: PracticeTopicSetting[]): void {
  topics = [...nextTopics];
}

export function getTopicLabel(topicId: string, snapshotLabel?: string): string {
  if (snapshotLabel?.trim()) {
    return snapshotLabel.trim();
  }

  const fromCatalog = topics.find((topic) => topic.topicId === topicId)?.label;
  if (fromCatalog) {
    return fromCatalog;
  }

  if (topicId === 'mfa') {
    return t('mfa.topics.mfa');
  }

  return topicId;
}

export function getTopicAccentColor(topicId: string, laneCode?: string): string {
  const topic = topics.find((entry) => entry.topicId === topicId);
  if (topic?.accentColor) {
    return normalizeTopicAccentColor(topic.accentColor);
  }
  if (topicId === 'mfa') {
    return defaultAccentForLane('M');
  }
  if (laneCode) {
    return defaultAccentForLane(laneCode);
  }
  return normalizeTopicAccentColor(undefined);
}
