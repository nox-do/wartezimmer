<script lang="ts">
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    /** Nach Anmeldung: Hinweis mit Wartenummer fürs Portal. */
    ticketCode?: string;
  }

  let { ticketCode }: Props = $props();

  const withTicket = $derived(Boolean(ticketCode?.trim()));
</script>

<aside class="terminal-wlan-promo" role="note" aria-label={t('terminal.wlanPromoAria')}>
  <p class="terminal-wlan-promo-kicker">{t('terminal.wlanPromoKicker')}</p>
  {#if withTicket}
    <p class="terminal-wlan-promo-text">
      {tf('terminal.wlanPromoWithTicket', { ticketCode: ticketCode ?? '' })}
    </p>
  {:else}
    <p class="terminal-wlan-promo-text">{t('terminal.wlanPromoDefault')}</p>
  {/if}
</aside>
