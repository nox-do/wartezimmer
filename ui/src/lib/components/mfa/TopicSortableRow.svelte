<script lang="ts">
  import { createDraggable, createDroppable } from '@dnd-kit/svelte';
  import SettingsRow from '$lib/components/shared/SettingsRow.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import TopicIconDisplay from '$lib/components/topics/TopicIconDisplay.svelte';
  import TopicLaneBadge from '$lib/components/topics/TopicLaneBadge.svelte';
  import type { PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import { topicSortDragId, topicSortTargetId } from '$lib/queue/topic-sort-drop';
  import { t } from '$lib/i18n/i18nStore.svelte';

  type TopicRow = Pick<
    PracticeTopicSetting,
    'topicId' | 'label' | 'laneCode' | 'iconId' | 'accentColor' | 'enabled'
  >;

  interface Props {
    topic: TopicRow;
    index: number;
    topicMeta: string;
    busy?: boolean;
    dragEnabled?: boolean;
    sortDragging?: boolean;
    persistent?: boolean;
    iconFallbackLabel?: string;
    onEdit?: () => void;
  }

  let {
    topic,
    index,
    topicMeta,
    busy = false,
    dragEnabled = false,
    sortDragging = false,
    persistent = false,
    iconFallbackLabel,
    onEdit,
  }: Props = $props();

  const canDrag = $derived(dragEnabled && !busy);

  const { attach, attachHandle, isDragging } = createDraggable({
    get id() {
      return topicSortDragId(topic.topicId);
    },
    get data() {
      return { kind: 'topic-sort', topicId: topic.topicId, index };
    },
    get disabled() {
      return !canDrag;
    },
  });

  function attachDragSurface(node: HTMLElement) {
    const cleanupElement = attach(node);
    const cleanupHandle = attachHandle(node);
    return () => {
      cleanupElement();
      cleanupHandle();
    };
  }

  const { attach: attachDropTarget } = createDroppable({
    get id() {
      return topicSortTargetId(topic.topicId);
    },
    get data() {
      return canDrag ? { kind: 'topic-sort', topicId: topic.topicId, index } : undefined;
    },
    get disabled() {
      return !canDrag;
    },
    collisionPriority: 50,
  });

  const showDragging = $derived(isDragging && sortDragging);
</script>

<li
  class="settings-item settings-item--row topic-sort-row"
  class:settings-item--inactive={!topic.enabled}
  class:topic-sort-row--dragging={showDragging}
  class:topic-sort-row--sortable={canDrag}
  data-topic-sort-index={index}
  role="listitem"
  {@attach attachDropTarget}
>
  <SettingsRow
    title={topic.label.trim() || t('mfa.settings.topicDefaultLabel')}
    description={topicMeta}
    mainClass={canDrag ? 'topic-sort-surface topic-sort-surface--sortable' : 'topic-sort-surface'}
    mainTitle={canDrag ? t('mfa.settings.topicDragHandleAria') : undefined}
    mainAttachment={attachDragSurface}
  >
    {#snippet leading()}
      {#if canDrag}
        <span class="queue-drag-grip topic-sort-grip" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </span>
      {:else if persistent}
        <span
          class="queue-drag-grip queue-drag-grip--spacer topic-sort-grip"
          aria-hidden="true"
        >
          <span></span><span></span><span></span><span></span>
        </span>
      {/if}
      <TopicLaneBadge laneCode={topic.laneCode} accentColor={topic.accentColor} />
      <TopicIconDisplay
        iconId={topic.iconId}
        label={iconFallbackLabel ?? topic.label}
        size={22}
        accentColor={topic.accentColor}
      />
    {/snippet}
    {#snippet trailing()}
      {#if persistent}
        <span class="pill pill--caps pill--ok">{t('mfa.settings.topicPersistent')}</span>
      {/if}
      {#if !topic.enabled}
        <span class="pill pill--caps">{t('mfa.settings.topicInactive')}</span>
      {/if}
      {#if onEdit}
        <Button variant="outline" size="sm" disabled={busy} onclick={onEdit}>
          {t('mfa.settings.topicEdit')}
        </Button>
      {/if}
    {/snippet}
  </SettingsRow>
</li>
