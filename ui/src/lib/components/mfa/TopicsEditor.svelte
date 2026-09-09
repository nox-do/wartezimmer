<script lang="ts">
  import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
  import { isInteractiveElement } from '@dnd-kit/dom/utilities';
  import Button from '$lib/components/forms/Button.svelte';
  import TopicEditorModal from '$lib/components/mfa/TopicEditorModal.svelte';
  import TopicSortableRow from '$lib/components/mfa/TopicSortableRow.svelte';
  import { DEFAULT_TOPIC_ACCENT } from '$lib/topics/topic-accent';
  import {
    MFA_ASSIST_LANE_CODE,
    MFA_ASSIST_TOPIC_ID,
    WAITING_ROOM_LABEL,
    WAITING_ROOM_LOCATION_ID,
  } from '@praxis-flow/domain';
  import type { JourneyTemplateSetting } from '$lib/ops/openapi-types';
  import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import type { PracticeRoom, PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import {
    arrayMoveToInsertBefore,
    isTopicSortNoOpMove,
    measureTopicSortLineOffsetPx,
    readTopicIdFromSortDragId,
    readTopicIdFromSortTargetId,
    topicSortInsertBeforeIndex,
  } from '$lib/queue/topic-sort-drop';
  import {
    resolveDefaultCallRoomId,
    topicTimeWindowLabel,
  } from '$lib/queue/ops-settings-api';
  import { roomLabelById } from '$lib/queue/topic-settings-form';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    topics: PracticeTopicSetting[];
    enabledRooms: PracticeRoom[];
    savedTopicIds: Set<string>;
    journeyTemplates?: JourneyTemplateSetting[];
    routingCapabilities?: RoutingCapabilities | null;
    busy?: boolean;
    onChange?: (topics: PracticeTopicSetting[]) => void;
    onPersist?: (options?: { silent?: boolean }) => void | Promise<boolean>;
  }

  let {
    topics,
    enabledRooms,
    savedTopicIds,
    journeyTemplates = [],
    routingCapabilities = null,
    busy = false,
    onChange,
    onPersist,
  }: Props = $props();

  let editorOpen = $state(false);
  let editorMode = $state<'add' | 'edit'>('add');
  let editorIndex = $state<number | null>(null);
  let draft = $state<PracticeTopicSetting>(emptyTopic());
  let editorTopicIdsTaken = $state<Set<string>>(new Set());
  let autoSyncTopicId = $state(true);
  let isSortDragging = $state(false);
  let sortInsertBeforeIndex = $state<number | null>(null);
  let activeSortTargetId = $state<string | null>(null);
  let dragPointerY = $state<number | null>(null);
  let sortListRef = $state<HTMLUListElement | null>(null);
  let removeSortPointerListener: (() => void) | null = null;

  const sortDragEnabled = $derived(topics.length > 1 && !busy);
  const complexRoutingVisible = $derived(
    routingCapabilities?.features.complexRouting === true && routingCapabilities?.routingMode === 'complex',
  );
  const systemTopicTargetId = $derived(
    resolveDefaultCallRoomId(enabledRooms) ?? WAITING_ROOM_LOCATION_ID,
  );
  const systemTopic = $derived({
    topicId: MFA_ASSIST_TOPIC_ID,
    label: t('terminal.authMfaTitle'),
    laneCode: MFA_ASSIST_LANE_CODE,
    iconId: null,
    accentColor: '#2563eb',
    enabled: true,
  });
  const systemTopicMeta = $derived.by(() => {
    const targetId = systemTopicTargetId;
    const targetLabel =
      targetId === WAITING_ROOM_LOCATION_ID
        ? WAITING_ROOM_LABEL
        : (enabledRooms.find((room) => room.roomId === targetId)?.roomLabel ?? targetId);
    return `${tf('mfa.settings.topicMetaLane', { lane: MFA_ASSIST_LANE_CODE })} · ${targetLabel} · ${t('mfa.settings.topicSystemHint')}`;
  });

  const sortLineOffsetPx = $derived.by(() => {
    const insertBefore = sortInsertBeforeIndex;
    if (insertBefore == null || !sortListRef || !isSortDragging) {
      return null;
    }
    return measureTopicSortLineOffsetPx(sortListRef, insertBefore, topics.length);
  });

  const sortDragSensors = [
    PointerSensor.configure({
      preventActivation: (event, source) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }
        if (target.closest('.mfa-editor-list-item__actions')) {
          return true;
        }
        if (target === source.element || target === source.handle) {
          return false;
        }
        if (source.handle?.contains(target)) {
          return false;
        }
        return isInteractiveElement(target);
      },
    }),
  ];

  function emptyTopic(): PracticeTopicSetting {
    return {
      topicId: '',
      label: '',
      laneCode: 'A',
      defaultRoomId: enabledRooms[0]?.roomId ?? '',
      iconId: null,
      accentColor: DEFAULT_TOPIC_ACCENT,
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: topics.length + 1,
    };
  }

  function openAdd() {
    editorMode = 'add';
    editorIndex = null;
    autoSyncTopicId = true;
    editorTopicIdsTaken = new Set(topics.map((topic) => topic.topicId));
    draft = {
      ...emptyTopic(),
      topicId: '',
      label: '',
    };
    editorOpen = true;
  }

  function openEdit(index: number) {
    const topic = topics[index];
    if (!topic) {
      return;
    }
    editorMode = 'edit';
    editorIndex = index;
    autoSyncTopicId = !savedTopicIds.has(topic.topicId);
    editorTopicIdsTaken = new Set(topics.map((t) => t.topicId).filter((id) => id !== topic.topicId));
    draft = { ...topic };
    editorOpen = true;
  }

  async function applyDraft(next: PracticeTopicSetting) {
    if (editorMode === 'add') {
      onChange?.([...topics, { ...next, sortOrder: topics.length + 1 }]);
    } else if (editorIndex != null) {
      onChange?.(topics.map((topic, i) => (i === editorIndex ? { ...next, sortOrder: topic.sortOrder } : topic)));
    }
    await onPersist?.();
  }

  async function deleteFromModal() {
    if (editorIndex == null || topics.length <= 1) {
      return;
    }
    onChange?.(topics.filter((_, i) => i !== editorIndex));
    editorOpen = false;
    editorIndex = null;
    await onPersist?.();
  }

  function topicMeta(topic: PracticeTopicSetting): string {
    const routeLabel =
      complexRoutingVisible && topic.journeyTemplateId
        ? tf('mfa.settings.topicMetaJourney', { journey: topic.journeyTemplateId })
        : roomLabelById(enabledRooms, topic.defaultRoomId);
    const parts = [
      tf('mfa.settings.topicMetaLane', { lane: topic.laneCode.trim().toUpperCase() }),
      routeLabel,
    ];
    const time = topicTimeWindowLabel(topic);
    if (time !== '—') {
      parts.push(time);
    }
    return parts.join(' · ');
  }

  function handleSortDragStart() {
    isSortDragging = true;
    sortInsertBeforeIndex = null;
    activeSortTargetId = null;

    const onPointerMove = (pointerEvent: PointerEvent) => {
      dragPointerY = pointerEvent.clientY;
      if (activeSortTargetId != null) {
        updateSortInsertIndicator(activeSortTargetId);
      }
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    removeSortPointerListener = () => window.removeEventListener('pointermove', onPointerMove);
  }

  function updateSortInsertIndicator(targetId: unknown) {
    if (!sortListRef || targetId == null) {
      sortInsertBeforeIndex = null;
      return;
    }

    const topicId = readTopicIdFromSortTargetId(String(targetId));
    if (!topicId) {
      sortInsertBeforeIndex = null;
      return;
    }

    const targetIndex = topics.findIndex((topic) => topic.topicId === topicId);
    if (targetIndex < 0) {
      sortInsertBeforeIndex = null;
      return;
    }

    const row = sortListRef.querySelector(`[data-topic-sort-index="${targetIndex}"]`);
    if (!(row instanceof HTMLElement)) {
      sortInsertBeforeIndex = null;
      return;
    }

    const rect = row.getBoundingClientRect();
    sortInsertBeforeIndex = topicSortInsertBeforeIndex(
      targetIndex,
      dragPointerY,
      rect.top,
      rect.height,
    );
  }

  function handleSortDragOver(event: {
    operation: {
      target: { id: unknown } | null;
    };
  }) {
    const targetId = event.operation.target?.id;
    activeSortTargetId = targetId != null ? String(targetId) : null;
    updateSortInsertIndicator(targetId);
  }

  async function handleSortDragEnd(event: {
    canceled: boolean;
    operation: {
      source: { id: unknown; data?: unknown } | null;
      target: { id: unknown; data?: unknown } | null;
    };
  }) {
    try {
      if (event.canceled) {
        return;
      }

      const sourceId = event.operation.source?.id;
      const sourceTopicId =
        typeof sourceId === 'string' ? readTopicIdFromSortDragId(sourceId) : null;
      if (!sourceTopicId || sortInsertBeforeIndex == null) {
        return;
      }

      const fromIndex = topics.findIndex((topic) => topic.topicId === sourceTopicId);
      if (fromIndex < 0 || isTopicSortNoOpMove(fromIndex, sortInsertBeforeIndex)) {
        return;
      }

      onChange?.(arrayMoveToInsertBefore(topics, fromIndex, sortInsertBeforeIndex));
      await onPersist?.({ silent: true });
    } finally {
      isSortDragging = false;
      sortInsertBeforeIndex = null;
      activeSortTargetId = null;
      dragPointerY = null;
      removeSortPointerListener?.();
      removeSortPointerListener = null;
    }
  }
</script>

<div class="panel topics-editor">
  <div class="mfa-editor-head">
    <div>
      <h2 class="panel__title">{t('mfa.settings.topicsPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.topicsPanelDesc')}</p>
    </div>
    <Button variant="outline" size="sm" disabled={busy || enabledRooms.length === 0} onclick={openAdd}>
      {t('mfa.settings.topicAdd')}
    </Button>
  </div>

  <DragDropProvider
    sensors={sortDragSensors}
    onDragStart={handleSortDragStart}
    onDragOver={handleSortDragOver}
    onDragEnd={(event) => void handleSortDragEnd(event)}
  >
    <ul
      bind:this={sortListRef}
      class="mfa-editor-list"
      class:mfa-editor-list--sorting={isSortDragging}
      role="list"
    >
      <TopicSortableRow
        topic={systemTopic}
        index={-1}
        topicMeta={systemTopicMeta}
        persistent
        iconFallbackLabel={MFA_ASSIST_LANE_CODE}
      />
      {#if sortLineOffsetPx != null}
        <li
          class="mfa-editor-sort-line"
          style:top="{sortLineOffsetPx}px"
          aria-hidden="true"
        ></li>
      {/if}
      {#each topics as topic, index (topic.topicId)}
        <TopicSortableRow
          {topic}
          {index}
          topicMeta={topicMeta(topic)}
          {busy}
          dragEnabled={sortDragEnabled}
          sortDragging={isSortDragging}
          onEdit={() => openEdit(index)}
        />
      {/each}
    </ul>
  </DragDropProvider>

  <p class="panel panel--sm panel--flat panel--muted">{t('mfa.settings.topicsReorderHint')}</p>
  <p class="panel panel--sm panel--flat panel--muted">{t('mfa.settings.topicsCounterHint')}</p>
</div>

<TopicEditorModal
  bind:open={editorOpen}
  mode={editorMode}
  bind:draft
  {enabledRooms}
  {journeyTemplates}
  {routingCapabilities}
  {autoSyncTopicId}
  topicIdsTaken={editorTopicIdsTaken}
  canDelete={editorMode === 'edit' && topics.length > 1}
  {busy}
  onApply={applyDraft}
  onDelete={deleteFromModal}
/>
