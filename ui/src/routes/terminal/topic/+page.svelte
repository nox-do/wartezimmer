<script lang="ts">
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';
  import TopicIconDisplay from '$lib/components/topics/TopicIconDisplay.svelte';
  import {
    translateDynamicLabelsWithRetry,
    translatorReadyTick,
  } from '$lib/i18n/browser-translator';
  import { locale, t } from '$lib/i18n/i18nStore.svelte';
  import {
    createCheckin,
    fetchTerminalTopics,
    mapCheckinErrorMessage,
    type TerminalTopicOption,
  } from '$lib/terminal/terminal-api';
  import { mountTerminalAuthRouteGuard } from '$lib/terminal/terminal-auth-route-guard.svelte';
  import { terminalOps } from '$lib/terminal/terminal-ops-runtime.svelte';
  import { readAssistMode, readTerminalSession, writeCheckinResult } from '$lib/terminal/terminal-session';
  import { toastStore } from '$lib/stores/toastStore';

  let session = $state(readTerminalSession());
  let topics = $state<TerminalTopicOption[]>([]);
  let loading = $state(true);
  let loadFailed = $state(false);
  let busyTopicId = $state<string | null>(null);
  let labelTranslations = $state<Map<string, string>>(new Map());

  mountTerminalAuthRouteGuard(() => terminalOps, () => session?.authPath ?? null);

  // STUB: Assist-Press-UX — siehe terminal-assist.stub.ts (readAssistMode nicht reaktiv).
  const showAssistHint = $derived(Boolean(session?.assistMode && readAssistMode()));

  function displayLabel(label: string): string {
    return labelTranslations.get(label) ?? label;
  }

  function timeWindowMeta(topic: TerminalTopicOption): string | undefined {
    if (topic.availableFrom && topic.availableTo) {
      return `${topic.availableFrom}–${topic.availableTo}`;
    }
    return undefined;
  }

  async function selectTopic(topic: TerminalTopicOption) {
    if (!session || busyTopicId) {
      return;
    }

    busyTopicId = topic.topicId;
    const result = await createCheckin({
      topicId: topic.topicId,
      authPath: session.authPath,
      phoneNumber: session.authPath === 'phone_dob' ? session.phoneNumber : undefined,
      lastName: session.authPath === 'name_dob' ? session.lastName : undefined,
      birthDate: session.dobDisplay,
      patientLocale: $locale,
    });
    if (!result.ok) {
      busyTopicId = null;
      toastStore.error(mapCheckinErrorMessage(result.error.code, result.error.message));
      return;
    }

    writeCheckinResult({
      visitId: result.data.visitId,
      laneCode: result.data.laneCode,
      number: result.data.number,
      topicId: topic.topicId,
      topicLabel: topic.label,
      destinationRoomLabel: result.data.destinationRoomLabel ?? null,
      authPath: session.authPath,
      createdAt: result.data.createdAt,
    });

    busyTopicId = null;
    void gotoResolved('/terminal/confirmed');
  }

  $effect(() => {
    const currentLocale = $locale;
    const labels = topics.map((topic) => topic.label);
    void $translatorReadyTick;

    if (labels.length === 0) {
      labelTranslations = new Map();
      return;
    }

    let cancelled = false;
    void translateDynamicLabelsWithRetry(labels, currentLocale, () => cancelled).then((map) => {
      if (!cancelled) {
        labelTranslations = map;
      }
    });

    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    session = readTerminalSession();
    if (!session) {
      void gotoResolved('/terminal');
      return;
    }

    void (async () => {
      const result = await fetchTerminalTopics();
      loading = false;
      if (!result.ok) {
        loadFailed = true;
        toastStore.error(result.error.message || t('terminal.topicLoadError'));
        return;
      }
      topics = result.data.topics;
    })();
  });
</script>

{#if session}
  <div class="terminal-body terminal-body--flow">
    {#if !loading && topics.length === 0 && !loadFailed}
      <h1>{t('terminal.topicEmptyReception')}</h1>
    {:else}
      <h1>{t('terminal.topicTitle')}</h1>
      {#if showAssistHint}
        <p class="terminal-lead terminal-lead--assist">{t('terminal.topicAssistHint')}</p>
      {:else}
        <p class="terminal-lead">{t('terminal.topicLead')}</p>
      {/if}
    {/if}

    {#if loading}
      <p class="text-muted">{t('terminal.topicLoading')}</p>
    {:else if loadFailed}
      <p class="text-muted">{t('terminal.topicLoadError')}</p>
    {:else if topics.length > 0}
      <div class="terminal-card-grid">
        {#each topics as topic (topic.topicId)}
          {@const meta = timeWindowMeta(topic)}
          <button
            type="button"
            class="terminal-card"
            class:terminal-card--busy={busyTopicId != null}
            disabled={busyTopicId != null}
            onclick={() => void selectTopic(topic)}
          >
            <span class="terminal-card__icon terminal-card__icon--topic" aria-hidden="true">
              <TopicIconDisplay
                iconId={topic.iconId}
                label={displayLabel(topic.label)}
                size={22}
                accentColor={topic.accentColor}
              />
            </span>
            <span class="terminal-card__text">
              <strong>{displayLabel(topic.label)}</strong>
              {#if meta}
                <span class="terminal-card__meta">{meta}</span>
              {/if}
            </span>
            <ChevronRight class="terminal-card__chevron" aria-hidden="true" />
          </button>
        {/each}
      </div>
    {/if}

    <nav class="terminal-nav">
      {#if showAssistHint}
        <a href={resolve('/terminal')}>{t('terminal.topicAssistBack')}</a>
      {:else if session.authPath === 'egk'}
        <a href={resolve('/terminal/egk')}>{t('terminal.topicBack')}</a>
      {:else if session.authPath === 'name_dob'}
        <a href={resolve('/terminal/name')}>{t('terminal.topicBack')}</a>
      {:else}
        <a href={resolve('/terminal/phone')}>{t('terminal.topicBack')}</a>
      {/if}
    </nav>
  </div>
{/if}
