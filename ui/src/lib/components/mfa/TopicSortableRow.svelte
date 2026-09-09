<script lang="ts">
  import { createDraggable, createDroppable } from '@dnd-kit/svelte';
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
  class="mfa-editor-list-item"
  class:mfa-editor-list-item--inactive={!topic.enabled}
  class:mfa-editor-list-item--dragging={showDragging}
  class:mfa-editor-list-item--sortable={canDrag}
  data-topic-sort-index={index}
  role="listitem"
  {@attach attachDropTarget}
>
  <div
    class="mfa-editor-list-item__main"
    class:mfa-editor-list-item__main--sortable={canDrag}
    title={canDrag ? t('mfa.settings.topicDragHandleAria') : undefined}
    {@attach attachDragSurface}
  >
    {#if canDrag}
      <span class="queue-drag-grip mfa-editor-sort-grip" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </span>
    {:else if persistent}
      <span
        class="queue-drag-grip queue-drag-grip--spacer mfa-editor-sort-grip"
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
    <div class="mfa-editor-list-item__text">
      <span class="mfa-editor-list-item__label">{topic.label.trim() || t('mfa.settings.topicDefaultLabel')}</span>
      <span class="mfa-editor-list-item__meta">{topicMeta}</span>
    </div>
  </div>
  <div class="mfa-editor-list-item__actions">
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
  </div>
</li>
