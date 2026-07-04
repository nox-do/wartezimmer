<script lang="ts">
  import { formatTicketCode } from '@praxis-flow/domain';
  import { locale, t, tf } from '$lib/i18n/i18nStore.svelte';
  import { dayStartGreeting, formatBusinessDayLong } from '$lib/i18n/format-business-day';
  import type { BusinessDayTicketStats } from '$lib/mfa/practice-ops-api';
  import { formatWaitDuration } from '$lib/queue/format-wait-duration';

  interface Props {
    lastResetBusinessDay: string;
    lastDayStats?: BusinessDayTicketStats | null;
    busy?: boolean;
    onStartDay?: () => void;
  }

  let { lastResetBusinessDay, lastDayStats = null, busy = false, onStartDay }: Props = $props();

  const greeting = $derived(dayStartGreeting());
  const lastResetFormatted = $derived(formatBusinessDayLong(lastResetBusinessDay, $locale));
  const maxWaitLabel = $derived(
    lastDayStats && lastDayStats.maxWaitMs > 0
      ? formatWaitDuration(lastDayStats.maxWaitMs)
      : t('mfa.settings.dayHintStatNoCalls'),
  );
  const openTickets = $derived(lastDayStats?.openTickets ?? []);
  const visibleOpenTickets = $derived(openTickets.slice(0, 8));
  const hiddenOpenTicketCount = $derived(Math.max(0, openTickets.length - visibleOpenTickets.length));
</script>

<div class="alert alert--warning alert--split alert--banner" role="status">
  <div class="alert__body">
    <p class="alert__lead">{tf('mfa.settings.dayHintLead', { greeting })}</p>
    {#if lastDayStats}
      <div
        class="alert__stats"
        aria-label={tf('mfa.settings.dayHintStatsAria', { lastReset: lastResetFormatted })}
      >
        <p class="alert__stats-lead">
          {tf('mfa.settings.dayHintStatsLead', { lastReset: lastResetFormatted })}
        </p>
        <p class="alert__stats-summary">
          {tf('mfa.settings.dayHintStatTotal', { count: String(lastDayStats.totalTickets) })}
          ·
          {tf('mfa.settings.dayHintStatMaxWait', { duration: maxWaitLabel })}
        </p>
        {#if lastDayStats.byTopic.length > 0}
          <ul class="alert__topics">
            {#each lastDayStats.byTopic as topic (topic.topicId)}
              <li>
                {tf('mfa.settings.dayHintStatTopic', {
                  label: topic.topicLabel,
                  count: String(topic.count),
                })}
              </li>
            {/each}
          </ul>
        {/if}
        {#if visibleOpenTickets.length > 0}
          <p class="alert__stats-lead">
            {tf('mfa.settings.dayHintOpenTicketsLead', { lastReset: lastResetFormatted })}
          </p>
          <ul class="alert__topics alert__topics--open-tickets">
            {#each visibleOpenTickets as ticket (ticket.ticketId)}
              <li>
                {tf('mfa.settings.dayHintOpenTicketItem', {
                  ticket: formatTicketCode(ticket.laneCode, ticket.number),
                  name: ticket.identityRef?.trim() || t('mfa.settings.dayHintOpenTicketNoName'),
                })}
              </li>
            {/each}
            {#if hiddenOpenTicketCount > 0}
              <li class="text-muted">
                {tf('mfa.settings.dayHintOpenTicketsMore', { count: String(hiddenOpenTicketCount) })}
              </li>
            {/if}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
  <button
    type="button"
    class="alert__action alert__action--emphasis"
    disabled={busy}
    onclick={() => onStartDay?.()}
  >
    {busy ? t('ui.loading') : t('mfa.settings.dayStartBannerAction')}
  </button>
</div>
