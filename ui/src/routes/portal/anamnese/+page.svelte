<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { resolve } from '$app/paths';
  import { locale, t } from '$lib/i18n/i18nStore.svelte';
  import {
    translateDynamicLabelsWithRetry,
    translatorReadyTick,
  } from '$lib/i18n/browser-translator';
  import AnamnesePrivacyModal from '$lib/components/portal/AnamnesePrivacyModal.svelte';
  import { isAnamneseFieldVisible, orderFieldsBySections } from '$lib/portal/anamnese-form-sections';
  import { fetchPortalSessionMe } from '$lib/portal/session-api';
  import { anamneseInputType, anamneseNumberAttrs } from '$lib/portal/anamnese-field-control';
  import {
    DEFAULT_ANAMNESE_TEMPLATE_ID,
    fetchAnamnesePrivacyNotice,
    fetchFormTemplate,
    PRIVACY_CONSENT_TEMPLATE_ID,
    PRIVACY_CONSENT_TEMPLATE_VERSION,
    submitPatientFormDocuments,
    type FormPrivacyNotice,
    type FormTemplate,
    type FormTemplateField,
  } from '$lib/portal/anamnese-api';
  import { ensurePortalSession } from '$lib/portal/ensure-portal-session';
  import { clearPortalSession, type PortalSessionContext } from '$lib/portal/portal-session';
  import { toastStore } from '$lib/stores/toastStore';

  let bootstrapping = $state(true);
  let errorMessage = $state<string | null>(null);
  let session = $state<PortalSessionContext | null>(null);
  let template = $state<FormTemplate | null>(null);
  let answers = $state<Record<string, string | number | boolean>>({});
  let submitting = $state(false);
  let submitted = $state(false);
  let formError = $state<string | null>(null);
  let privacyNotice = $state<FormPrivacyNotice | null>(null);
  let privacyModalOpen = $state(false);
  let dynamicTranslations = $state<Map<string, string>>(new Map());

  const fieldById = $derived(new Map((template?.fields ?? []).map((field) => [field.id, field])));

  const portalSections = $derived(template?.sections ?? []);

  const groupedSections = $derived(
    template ? orderFieldsBySections(template.fields, portalSections) : [],
  );

  const hasConsentField = $derived(
    (template?.fields ?? []).some((field) => field.id === 'consentDataProcessing'),
  );

  function displayText(text: string): string {
    return dynamicTranslations.get(text) ?? text;
  }

  function collectDynamicTexts(activeTemplate: FormTemplate | null, notice: FormPrivacyNotice | null): string[] {
    const texts: string[] = [];
    if (activeTemplate?.name?.trim()) {
      texts.push(activeTemplate.name.trim());
    }
    for (const field of activeTemplate?.fields ?? []) {
      if (field.label?.trim()) {
        texts.push(field.label.trim());
      }
    }
    if (notice?.title?.trim()) {
      texts.push(notice.title.trim());
    }
    for (const paragraph of notice?.paragraphs ?? []) {
      if (paragraph.trim()) {
        texts.push(paragraph.trim());
      }
    }
    return texts;
  }

  function initAnswers(fields: FormTemplateField[]) {
    const next: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      if (field.type === 'boolean') {
        next[field.id] = false;
      } else if (field.type === 'number') {
        next[field.id] = '';
      } else {
        next[field.id] = '';
      }
    }
    answers = next;
  }

  function buildSubmitPayload(): Record<string, unknown> {
    if (!template) {
      return {};
    }
    const payload: Record<string, unknown> = {};
    for (const field of template.fields) {
      const raw = answers[field.id];
      if (field.type === 'boolean') {
        if (raw === true) {
          payload[field.id] = true;
        } else if (field.required) {
          payload[field.id] = false;
        }
        continue;
      }
      if (field.type === 'number') {
        if (raw === '' || raw == null) {
          continue;
        }
        const numeric = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
        if (Number.isFinite(numeric)) {
          payload[field.id] = numeric;
        }
        continue;
      }
      const text = String(raw ?? '').trim();
      if (text.length > 0) {
        payload[field.id] = text;
      }
    }
    return payload;
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    formError = null;
    const activeSession = session;
    const activeTemplate = template;
    if (!activeSession || !activeTemplate) {
      return;
    }

    if (hasConsentField && answers.consentDataProcessing !== true) {
      formError = t('portal.anamneseConsentRequired');
      toastStore.error(formError);
      return;
    }

    const items = [
      {
        templateId: activeTemplate.id,
        templateVersion: activeTemplate.version,
        answers: buildSubmitPayload(),
      },
    ];
    if (hasConsentField) {
      items.push({
        templateId: PRIVACY_CONSENT_TEMPLATE_ID,
        templateVersion: PRIVACY_CONSENT_TEMPLATE_VERSION,
        answers: { einwilligung: true },
      });
    }

    submitting = true;
    const result = await submitPatientFormDocuments(activeSession.sessionToken, items);
    submitting = false;

    if (!result.ok) {
      formError = result.error.message || t('portal.anamneseSubmitError');
      toastStore.error(formError);
      return;
    }

    const blocked = result.data.items.find((doc) => doc.status === 'blocked_malware');
    if (blocked) {
      formError = t('portal.anamneseBlocked');
      toastStore.error(formError);
      return;
    }

    const notClean = result.data.items.find((doc) => doc.status !== 'scan_clean');
    if (notClean) {
      formError = t('portal.anamneseScanError');
      toastStore.error(formError);
      return;
    }

    clearPortalSession();
    submitted = true;
    toastStore.success(t('portal.anamneseSubmitSuccess'));
  }

  $effect(() => {
    const currentLocale = $locale;
    const activeTemplate = template;
    const notice = privacyNotice;
    void $translatorReadyTick;
    const texts = collectDynamicTexts(activeTemplate, notice);

    if (texts.length === 0) {
      dynamicTranslations = new Map();
      return;
    }

    let cancelled = false;
    void translateDynamicLabelsWithRetry(texts, currentLocale, () => cancelled).then((map) => {
      if (!cancelled) {
        dynamicTranslations = map;
      }
    });

    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    const ticketFromUrl = new URL(window.location.href).searchParams.get('ticket');
    void (async () => {
      const bootstrap = await ensurePortalSession(ticketFromUrl, { replacePath: '/portal/anamnese' });
      if (!bootstrap.ok) {
        bootstrapping = false;
        errorMessage = bootstrap.errorMessage;
        return;
      }
      session = bootstrap.session;

      const [me, loaded, privacy] = await Promise.all([
        fetchPortalSessionMe(bootstrap.session.sessionToken),
        fetchFormTemplate(bootstrap.session.sessionToken, DEFAULT_ANAMNESE_TEMPLATE_ID),
        fetchAnamnesePrivacyNotice(bootstrap.session.sessionToken),
      ]);
      bootstrapping = false;
      if (!me.ok) {
        errorMessage = me.error.message || t('portal.sessionExpired');
        return;
      }
      if (!loaded.ok) {
        errorMessage = loaded.error.message || t('portal.anamneseLoadError');
        return;
      }
      template = loaded.data;
      if (privacy.ok) {
        privacyNotice = privacy.data;
      }
      initAnswers(loaded.data.fields);
    })();
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
    </section>
  {:else if submitted}
    <section class="card flex flex-col gap-2">
      <div class="portal-session-badge">
        <span class="portal-session-label">{t('portal.sessionLabel')}</span>
        <span class="portal-session-ticket">{session?.ticketCode}</span>
      </div>
      <h1 class="page-title">{t('portal.anamneseDoneTitle')}</h1>
      <p class="page-lead">{t('portal.anamneseDoneLead')}</p>
    </section>
  {:else if session && template}
    <section class="card flex flex-col gap-2">
      <div class="portal-session-badge">
        <span class="portal-session-label">{t('portal.sessionLabel')}</span>
        <span class="portal-session-ticket">{session.ticketCode}</span>
      </div>

      <div>
        <p class="portal-kicker">{t('portal.anamneseKicker')}</p>
        <h1 class="page-title">{displayText(template.name)}</h1>
        <p class="page-lead">{t('portal.anamneseLead')}</p>
      </div>

      <form class="modal-form" onsubmit={onSubmit}>
        {#each groupedSections as group (group.section.titleKey)}
          {@const sectionFields = group.fields.filter((field) => isAnamneseFieldVisible(field))}
          {#if sectionFields.length > 0}
            <section class="form-section">
              <h2 class="form-section__title">{t(group.section.titleKey)}</h2>

              {#each sectionFields as field (field.id)}
              {@const meta = fieldById.get(field.id)}
              {#if meta}
                {@const control = meta.portalControl}
                {#if control === 'checkbox'}
                  <label class="modal-form-check">
                    <input type="checkbox" bind:checked={answers[field.id] as boolean} />
                    <span>
                      {displayText(meta.label)}
                      {#if meta.required}<span class="text-required">*</span>{/if}
                    </span>
                  </label>
                {:else}
                  <label
                    class="modal-form-field"
                    class:modal-form-field--compact={control === 'compact'}
                    for={`anam-${field.id}`}
                  >
                    {displayText(meta.label)}
                    {#if meta.required}<span class="text-required">*</span>{/if}
                    {#if meta.type === 'date'}
                      <input
                        id={`anam-${field.id}`}
                        class="form-input"
                        type="date"
                        required={meta.required}
                        bind:value={answers[field.id] as string}
                      />
                    {:else if meta.type === 'number'}
                      {@const numberAttrs = anamneseNumberAttrs(meta)}
                      <input
                        id={`anam-${field.id}`}
                        class="form-input"
                        type="number"
                        inputmode="decimal"
                        required={meta.required}
                        min={numberAttrs.min}
                        max={numberAttrs.max}
                        step={numberAttrs.step}
                        bind:value={answers[field.id]}
                      />
                    {:else if control === 'textarea'}
                      <textarea
                        id={`anam-${field.id}`}
                        class="form-textarea"
                        rows="4"
                        maxlength={meta.maxLength}
                        required={meta.required}
                        bind:value={answers[field.id] as string}
                      ></textarea>
                    {:else if control === 'textarea-short'}
                      <textarea
                        id={`anam-${field.id}`}
                        class="form-textarea"
                        rows="2"
                        maxlength={meta.maxLength}
                        required={meta.required}
                        bind:value={answers[field.id] as string}
                      ></textarea>
                    {:else}
                      <input
                        id={`anam-${field.id}`}
                        class="form-input"
                        type={anamneseInputType(meta)}
                        maxlength={meta.maxLength}
                        required={meta.required}
                        autocomplete={meta.id === 'contactPhone' ? 'tel' : meta.id === 'contactEmail' ? 'email' : undefined}
                        bind:value={answers[field.id] as string}
                      />
                    {/if}
                  </label>
                {/if}
              {/if}
              {/each}
            </section>
          {/if}
        {/each}

        {#if hasConsentField}
          <section class="form-section">
            <h2 class="form-section__title">{t('portal.anamneseSectionConsent')}</h2>
            <label class="modal-form-check">
              <input type="checkbox" bind:checked={answers.consentDataProcessing as boolean} />
              <span>
                {t('portal.anamneseConsentCheckbox')}
                <span class="text-required">*</span>
              </span>
            </label>
            <p class="mt-2">
              <button type="button" class="portal-text-button" onclick={() => (privacyModalOpen = true)}>
                {t('portal.anamnesePrivacyOpen')}
              </button>
            </p>
          </section>
        {/if}

        {#if formError}
          <div class="alert alert--error">{formError}</div>
        {/if}

        <Button type="submit" variant="primary" fullWidth loading={submitting}>
          {submitting ? t('portal.anamneseSubmitting') : t('portal.anamneseSubmit')}
        </Button>
      </form>

      <p class="portal-back-link">
        <a href={resolve('/portal/menu')}>{t('portal.backToMenu')}</a>
      </p>

      <AnamnesePrivacyModal
        bind:open={privacyModalOpen}
        notice={privacyNotice}
        translatedTitle={privacyNotice?.title ? displayText(privacyNotice.title) : null}
        translatedParagraphs={(privacyNotice?.paragraphs ?? []).map((paragraph) => displayText(paragraph))}
      />
    </section>
  {/if}
</div>

