<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { buildMfaDocumentDeepLinkSearch } from '$lib/mfa/document-context';
  import { t } from '$lib/i18n/i18nStore.svelte';

  let errorMessage = $state<string | null>(null);

  onMount(() => {
    const search = buildMfaDocumentDeepLinkSearch(window.location.search);
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (!params.get('visitId')?.trim()) {
      errorMessage = t('mfa.documentsContextMissing');
      return;
    }
    void goto(`/mfa${search}`, { replaceState: true });
  });
</script>

{#if errorMessage}
  <div class="alert alert--info">{errorMessage}</div>
  <p>
    <a class="text-link" href="/mfa">← {t('mfa.backToQueue')}</a>
  </p>
{:else}
  <p class="text-muted">{t('ui.loading')}</p>
{/if}
