<script lang="ts">
  import '$lib/styles/mfa.css';
  import '$lib/styles/terminal.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import AuthGate from '$lib/components/auth/AuthGate.svelte';
  import DocumentPreviewOverlay from '$lib/components/mfa/DocumentPreviewOverlay.svelte';
  import MfaOpsStreamHost from '$lib/components/mfa/MfaOpsStreamHost.svelte';
  import TerminalReceiptPrintHost from '$lib/components/terminal/TerminalReceiptPrintHost.svelte';
  import {
    bootstrapMfaDocumentPreviewFromUrl,
    closeMfaDocumentPreview,
    mfaDocumentPreview,
  } from '$lib/mfa/mfa-document-preview.svelte';
  import { authSession } from '$lib/auth/session-state.svelte';

  let { children } = $props();

  const mfaAuthenticated = $derived(
    authSession.status === 'authenticated' && authSession.user?.roles.includes('mfa'),
  );

  $effect(() => {
    if ($page.url.pathname !== '/mfa' && mfaDocumentPreview.open) {
      closeMfaDocumentPreview();
    }
  });

  $effect(() => {
    if ($page.url.pathname !== '/mfa' || !mfaAuthenticated) {
      return;
    }
    const search = $page.url.search;
    void bootstrapMfaDocumentPreviewFromUrl($page.url.pathname, search, () => {
      if (window.location.pathname !== '/mfa') {
        return;
      }
      const next = new URL(window.location.href);
      next.searchParams.delete('visitId');
      next.searchParams.delete('documentId');
      const nextSearch = next.searchParams.toString();
      void goto(`${next.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replaceState: true });
    });
  });
</script>

<div class="mfa-page">
  {#if $page.url.pathname === '/mfa/login'}
    {@render children()}
  {:else}
    <AuthGate requiredRole="mfa">
      <MfaOpsStreamHost>
        {@render children()}
      </MfaOpsStreamHost>
      <TerminalReceiptPrintHost />
      {#if $page.url.pathname === '/mfa' && mfaDocumentPreview.open && mfaDocumentPreview.context}
        <DocumentPreviewOverlay
          bind:open={mfaDocumentPreview.open}
          context={mfaDocumentPreview.context}
          onClose={closeMfaDocumentPreview}
        />
      {/if}
    </AuthGate>
  {/if}
</div>
