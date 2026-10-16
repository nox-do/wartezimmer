<script lang="ts">
  import { onMount } from 'svelte';
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import { resolve } from '$app/paths';
  import Button from '$lib/components/forms/Button.svelte';
  import PrivacyNoticeModal from '$lib/components/shared/PrivacyNoticeModal.svelte';
  import { formatFileSize } from '$lib/documents/format-file-size';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { getUploadPrivacyNotice } from '$lib/privacy/upload-notice';
  import { getPracticeProfileFallback, subscribePracticeProfile } from '$lib/practice/practice-profile-client';
  import { ensurePortalSession } from '$lib/portal/ensure-portal-session';
  import { formatRelativeTime } from '$lib/portal/format-relative-time';
  import {
    deletePatientDocument,
    fetchPatientDocuments,
    intakePatientDocument,
    isPatientUploadTypeAllowed,
    MAX_FILE_BYTES,
  } from '$lib/portal/patient-document-api';
  import {
    clearPortalSession,
    readPortalSession,
    type PortalSessionContext,
  } from '$lib/portal/portal-session';
  import type { PatientDocument } from '$lib/portal/types';
  import { toastStore } from '$lib/stores/toastStore';

  let bootstrapping = $state(true);
  let errorMessage = $state<string | null>(null);
  let session = $state<PortalSessionContext | null>(null);
  let items = $state<PatientDocument[]>([]);
  let uploadMaxBytes = $state(MAX_FILE_BYTES);
  let uploading = $state(false);
  let busyDocumentId = $state<string | null>(null);
  let uploadFeedback = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let privacyModalOpen = $state(false);
  let practiceProfile = $state(getPracticeProfileFallback());

  const privacyNotice = $derived(getUploadPrivacyNotice(practiceProfile));

  function backToPortal() {
    void gotoResolved('/portal');
  }

  async function loadDocuments(activeSession: PortalSessionContext) {
    const result = await fetchPatientDocuments(activeSession.sessionToken);
    if (!result.ok) {
      if (result.error.code === 'SESSION_UNAUTHORIZED') {
        clearPortalSession();
        session = null;
        errorMessage = t('portal.sessionExpired');
        return;
      }
      toastStore.error(result.error.message || t('portal.documentsLoadError'));
      return;
    }

    items = result.data.items ?? [];
    uploadMaxBytes = result.data.uploadMaxBytes ?? MAX_FILE_BYTES;
  }

  async function bootstrap(ticketFromUrl: string | null) {
    bootstrapping = true;
    errorMessage = null;
    uploadFeedback = null;

    const result = await ensurePortalSession(ticketFromUrl, { replacePath: '/portal/upload' });
    bootstrapping = false;
    if (!result.ok) {
      errorMessage = result.errorMessage;
      return;
    }
    session = result.session;
    await loadDocuments(result.session);
  }

  async function onFilesSelected(event: Event) {
    uploadFeedback = null;
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? [...input.files] : [];
    input.value = '';

    const activeSession = session ?? readPortalSession();
    if (!activeSession) {
      uploadFeedback = t('portal.sessionMissing');
      toastStore.error(t('portal.sessionMissing'));
      return;
    }

    if (files.length === 0) {
      return;
    }

    uploading = true;
    let uploadedCount = 0;

    for (const file of files) {
      if (!isPatientUploadTypeAllowed(file)) {
        uploadFeedback = t('portal.unsupportedFileType');
        toastStore.error(uploadFeedback);
        continue;
      }
      const sizeBytes = Math.max(1, Math.floor(file.size));
      if (sizeBytes > uploadMaxBytes) {
        uploadFeedback = t('portal.fileTooLarge');
        toastStore.error(t('portal.fileTooLarge'));
        continue;
      }

      const result = await intakePatientDocument(activeSession.sessionToken, file);

      if (!result.ok) {
        const details = result.error.details;
        uploadFeedback =
          details != null &&
          typeof details === 'object' &&
          'reason' in details &&
          details.reason === 'UNSUPPORTED_FILE_TYPE'
            ? t('portal.unsupportedFileType')
            : result.error.message || t('portal.uploadError');
        toastStore.error(uploadFeedback);
        continue;
      }

      uploadedCount += 1;
    }

    uploading = false;

    if (uploadedCount > 0) {
      if (uploadedCount === files.length) {
        uploadFeedback = t('portal.uploadSuccess');
        toastStore.success(uploadFeedback);
      } else {
        uploadFeedback = t('portal.uploadPartial');
      }
      session = activeSession;
      await loadDocuments(activeSession);
    }
  }

  async function onDelete(documentId: string) {
    const activeSession = session ?? readPortalSession();
    if (!activeSession) {
      return;
    }

    busyDocumentId = documentId;
    const result = await deletePatientDocument(activeSession.sessionToken, documentId);
    busyDocumentId = null;

    if (!result.ok) {
      toastStore.error(result.error.message || t('portal.deleteError'));
      return;
    }

    toastStore.success(t('portal.deleteSuccess'));
    await loadDocuments(activeSession);
  }

  onMount(() => {
    const stopProfile = subscribePracticeProfile((profile) => {
      practiceProfile = profile;
    });

    const ticketFromUrl = new URL(window.location.href).searchParams.get('ticket');
    void bootstrap(ticketFromUrl);

    return stopProfile;
  });
</script>

<div class="staff-page staff-page--narrow">
  {#if bootstrapping}
    <section class="card">
      <p class="text-muted">{t('ui.loading')}</p>
    </section>
  {:else if errorMessage}
    <section class="card flex flex-col gap-2">
      <div class="alert alert--error">{errorMessage}</div>
      <p class="text-muted">{t('portal.sessionMissingHint')}</p>
      {#if errorMessage === t('portal.sessionExpired')}
        <p class="text-muted">{t('portal.sessionExpiredHint')}</p>
        <Button variant="primary" onclick={backToPortal}>{t('portal.backToPortal')}</Button>
      {/if}
    </section>
  {:else if session}
    <section class="card flex flex-col gap-2">
      <div class="portal-session-badge">
        <span class="portal-session-label">{t('portal.sessionLabel')}</span>
        <span class="portal-session-ticket">{session.ticketCode}</span>
      </div>

      <div>
        <p class="portal-kicker">{t('portal.uploadKicker')}</p>
        <h1 class="page-title" style="margin-bottom: 0.5rem;">{t('portal.uploadTitle')}</h1>
        <p class="page-lead" style="margin-bottom: 0;">{t('portal.uploadLead')}</p>
        <p class="portal-privacy-note">
          {t('portal.uploadPrivacyNote')}
          <button type="button" class="portal-inline-link" onclick={() => (privacyModalOpen = true)}>
            {t('portal.indexPrivacyOpen')}
          </button>
        </p>
      </div>

      <input
        bind:this={fileInput}
        class="sr-only"
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        disabled={uploading || busyDocumentId != null}
        onchange={onFilesSelected}
      />
      <Button
        variant="primary"
        fullWidth
        loading={uploading}
        disabled={busyDocumentId != null}
        onclick={() => fileInput?.click()}
      >
        {uploading ? t('portal.uploading') : t('portal.uploadAdd')}
      </Button>

      {#if uploadFeedback}
        <div class="alert alert--info">{uploadFeedback}</div>
      {/if}

      <div>
        <p class="text-muted" style="margin: 0 0 0.5rem; font-size: 0.85rem; font-weight: 600;">
          {t('portal.fileListLabel')}
        </p>
        <ul class="portal-file-list">
          {#if items.length === 0}
            <li class="portal-file-empty">{t('portal.fileListEmpty')}</li>
          {:else}
            {#each items as doc (doc.id)}
              <li class="portal-file-item">
                <span>
                  <span class="portal-file-name">{doc.fileName}</span>
                  <span class="portal-file-meta">
                    {formatFileSize(doc.sizeBytes)} · {formatRelativeTime(doc.createdAt)}
                  </span>
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyDocumentId === doc.id}
                  disabled={uploading || (busyDocumentId != null && busyDocumentId !== doc.id)}
                  onclick={() => onDelete(doc.id)}
                >
                  {t('portal.deleteFile')}
                </Button>
              </li>
            {/each}
          {/if}
        </ul>
      </div>

      <p class="portal-back-link">
        <a href={resolve('/portal/menu')}>{t('portal.backToMenu')}</a>
      </p>
    </section>
  {/if}
</div>

<PrivacyNoticeModal bind:open={privacyModalOpen} notice={privacyNotice} />
