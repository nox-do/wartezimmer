import { MFA_ASSIST_LANE_CODE, MFA_ASSIST_TOPIC_ID } from '@wartezimmer/domain';
import { t } from '$lib/i18n/i18nStore.svelte';
import { defaultAccentForLane, normalizeTopicAccentColor } from '$lib/topics/topic-accent';
import type { PracticeTopicSetting } from './ops-settings-api';

/**
 * Module cache synced from MFA Practice-Context / Settings (`applyMfaPracticeTopics`).
 * For reactive UI, also read `mfaPracticeContext.practiceTopics` in `$derived`.
 */
let topics: PracticeTopicSetting[] = [];

export function setPracticeTopicCatalog(nextTopics: PracticeTopicSetting[]): void {
  topics = [...nextTopics];
}

export function getPracticeTopicCatalog(): PracticeTopicSetting[] {
  return topics;
}

export function getTopicLabel(topicId: string, snapshotLabel?: string): string {
  if (snapshotLabel?.trim()) {
    return snapshotLabel.trim();
  }

  const fromCatalog = topics.find((topic) => topic.topicId === topicId)?.label;
  if (fromCatalog) {
    return fromCatalog;
  }

  if (topicId === MFA_ASSIST_TOPIC_ID) {
    return t('mfa.topics.mfa');
  }

  return topicId;
}

export function getTopicAccentColor(topicId: string, laneCode?: string): string {
  const topic = topics.find((entry) => entry.topicId === topicId);
  if (topic?.accentColor) {
    return normalizeTopicAccentColor(topic.accentColor);
  }
  if (topicId === MFA_ASSIST_TOPIC_ID) {
    return defaultAccentForLane(MFA_ASSIST_LANE_CODE);
  }
  if (laneCode) {
    return defaultAccentForLane(laneCode);
  }
  return normalizeTopicAccentColor(undefined);
}
