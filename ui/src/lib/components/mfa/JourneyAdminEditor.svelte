<script lang="ts">
  import { Plus, Trash2 } from '@lucide/svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import SegmentedControl from '$lib/components/forms/SegmentedControl.svelte';
  import {
    buildJourneyPreview,
    createDefaultJourneyStep,
    JOURNEY_COMPLETED_WHEN,
    JOURNEY_DISPLAY_MODES,
    JOURNEY_MOVEMENT_MODES,
    journeyCompletedWhenHintKey,
    journeyCompletedWhenLabelKey,
    journeyDisplayHintKey,
    journeyDisplayLabelKey,
    journeyMovementHintKey,
    journeyMovementLabelKey,
    journeyStepRoomBadge,
  } from '$lib/mfa/journey-admin-helpers';
  import type { JourneySettings, JourneyTemplateSetting, PracticeRoom } from '$lib/ops/openapi-types';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { WAITING_ROOM_LABEL, WAITING_ROOM_LOCATION_ID } from '@praxis-flow/domain';

  interface Props {
    journeySettings: JourneySettings;
    selectedTemplateId?: string;
    enabledRooms: PracticeRoom[];
    busy?: boolean;
    onChange?: (settings: JourneySettings) => void;
    onSave?: (settings: JourneySettings) => void | Promise<void>;
  }

  let {
    journeySettings,
    selectedTemplateId = $bindable(''),
    enabledRooms,
    busy = false,
    onChange,
    onSave,
  }: Props = $props();

  const fallbackLocationId = $derived(enabledRooms[0]?.roomId ?? WAITING_ROOM_LOCATION_ID);
  const selectedTemplate = $derived(
    journeySettings.templates.find((template) => template.id === selectedTemplateId) ?? null,
  );
  const sortedSteps = $derived(
    selectedTemplate?.steps.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [],
  );
  const previewText = $derived(
    selectedTemplate
      ? buildJourneyPreview(selectedTemplate, enabledRooms, t('mfa.settings.journeyPreviewNoSteps'))
      : '',
  );
  const movementSegmentOptions = $derived(
    JOURNEY_MOVEMENT_MODES.map((mode) => ({
      value: mode,
      label: t(journeyMovementLabelKey(mode)),
    })),
  );
  const displaySegmentOptions = $derived(
    JOURNEY_DISPLAY_MODES.map((mode) => ({
      value: mode,
      label: t(journeyDisplayLabelKey(mode)),
    })),
  );

  $effect(() => {
    if (journeySettings.templates.length === 0) {
      selectedTemplateId = '';
      return;
    }
    if (!journeySettings.templates.some((template) => template.id === selectedTemplateId)) {
      selectedTemplateId = journeySettings.templates[0]?.id ?? '';
    }
  });

  function updateTemplates(nextTemplates: JourneyTemplateSetting[]) {
    onChange?.({ templates: nextTemplates });
  }

  function updateSelectedTemplate(patch: Partial<JourneyTemplateSetting>) {
    if (!selectedTemplate) return;
    updateTemplates(
      journeySettings.templates.map((template) =>
        template.id === selectedTemplate.id ? { ...template, ...patch } : template,
      ),
    );
  }

  function removeSelectedTemplate() {
    if (!selectedTemplate) return;
    updateTemplates(journeySettings.templates.filter((template) => template.id !== selectedTemplate.id));
  }

  function addStep() {
    if (!selectedTemplate) return;
    const steps = [...sortedSteps];
    const last = steps[steps.length - 1];
    steps.push(createDefaultJourneyStep(steps.length, fallbackLocationId, last));
    updateSelectedTemplate({ steps });
  }

  function removeStep(stepId: string) {
    if (!selectedTemplate || selectedTemplate.steps.length <= 1) return;
    updateSelectedTemplate({
      steps: selectedTemplate.steps.filter((step) => step.id !== stepId),
    });
  }

  function updateStep(stepId: string, patch: Partial<JourneyTemplateSetting['steps'][number]>) {
    if (!selectedTemplate) return;
    updateSelectedTemplate({
      steps: selectedTemplate.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    });
  }
</script>

<section class="journey-admin">
  <section class="journey-admin__meta">
    <div class="journey-admin__meta-row">
      <label class="journey-admin__field journey-admin__field--template">
        <span class="journey-admin__field-label">{t('mfa.settings.journeySelectTemplate')}</span>
        <select
          class="form-input"
          value={selectedTemplateId}
          disabled={busy || journeySettings.templates.length === 0}
          onchange={(event) => {
            selectedTemplateId = (event.currentTarget as HTMLSelectElement).value;
          }}
        >
          {#if journeySettings.templates.length === 0}
            <option value="">{t('mfa.settings.journeyNoTemplates')}</option>
          {:else}
            {#each journeySettings.templates as template (template.id)}
              <option value={template.id}>{template.name}</option>
            {/each}
          {/if}
        </select>
      </label>

      {#if selectedTemplate}
        <label class="journey-admin__field journey-admin__field--name">
          <span class="journey-admin__field-label">{t('mfa.settings.journeyTemplateName')}</span>
          <input
            class="form-input"
            type="text"
            value={selectedTemplate.name}
            disabled={busy}
            oninput={(event) =>
              updateSelectedTemplate({ name: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>
      {/if}

      {#if selectedTemplate}
        <div class="journey-admin__meta-actions">
          <Button
            type="button"
            variant="outline"
            class="journey-admin__delete-btn"
            size="sm"
            disabled={busy}
            onclick={removeSelectedTemplate}
          >
            {t('mfa.settings.journeyRemoveTemplate')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onclick={() => onSave?.(journeySettings)}
          >
            {t('mfa.settings.journeySave')}
          </Button>
        </div>
      {/if}
    </div>

    {#if selectedTemplate}
      <p class="journey-admin__preview">{previewText}</p>
    {/if}
  </section>

  {#if selectedTemplate}
    <section class="journey-admin__steps">
      <header class="journey-admin__steps-header">
        <div class="journey-admin__steps-intro">
          <h3>{t('mfa.settings.journeyStepsTitle')}</h3>
          <p class="journey-admin__steps-lead">{t('mfa.settings.journeyStepsLead')}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onclick={addStep}>
          <Plus size={16} aria-hidden="true" />
          {t('mfa.settings.journeyAddStep')}
        </Button>
      </header>

      <ol class="journey-admin__step-list">
        {#each sortedSteps as step, index (step.id)}
          <li class="journey-admin__step-row">
            <div class="journey-admin__timeline" aria-hidden="true">
              <span class="journey-admin__timeline-num">{index + 1}</span>
            </div>

            <article class="journey-admin__step">
              <header class="journey-admin__step-header">
                <span class="pill pill--caps journey-admin__step-badge">
                  {journeyStepRoomBadge(step.targetLocationId, enabledRooms)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || selectedTemplate.steps.length <= 1}
                  ariaLabel={tf('mfa.settings.journeyRemoveStepAria', { index: index + 1 })}
                  onclick={() => removeStep(step.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t('mfa.settings.journeyRemoveStep')}
                </Button>
              </header>

              <div class="journey-admin__step-grid">
                <label class="journey-admin__field">
                  <span class="journey-admin__field-label">{t('mfa.settings.journeyStepTarget')}</span>
                  <select
                    class="form-input"
                    value={step.targetLocationId ?? ''}
                    disabled={busy}
                    onchange={(event) =>
                      updateStep(step.id, {
                        targetLocationId: (event.currentTarget as HTMLSelectElement).value || null,
                      })}
                  >
                    <option value={WAITING_ROOM_LOCATION_ID}>{WAITING_ROOM_LABEL}</option>
                    {#each enabledRooms as room (room.roomId)}
                      <option value={room.roomId}>{room.roomLabel}</option>
                    {/each}
                  </select>
                </label>

                <label class="journey-admin__field">
                  <span class="journey-admin__field-label">{t('mfa.settings.journeyStepCompletedWhen')}</span>
                  <select
                    class="form-input"
                    value={step.completedWhen}
                    disabled={busy}
                    onchange={(event) =>
                      updateStep(step.id, {
                        completedWhen: (event.currentTarget as HTMLSelectElement)
                          .value as JourneyTemplateSetting['steps'][number]['completedWhen'],
                      })}
                  >
                    {#each JOURNEY_COMPLETED_WHEN as mode (mode)}
                      <option value={mode}>{t(journeyCompletedWhenLabelKey(mode))}</option>
                    {/each}
                  </select>
                  <p class="journey-admin__field-hint">{t(journeyCompletedWhenHintKey(step.completedWhen))}</p>
                </label>

                <div class="journey-admin__segment-row">
                  <div class="journey-admin__field">
                    <span class="journey-admin__field-label">{t('mfa.settings.journeyStepMovement')}</span>
                    <div class="journey-admin__segment-wrap">
                      <SegmentedControl
                        class="segmented-control--journey"
                        options={movementSegmentOptions}
                        value={step.movementMode}
                        disabled={busy}
                        ariaLabel={t('mfa.settings.journeyStepMovement')}
                        onchange={(value) =>
                          updateStep(step.id, {
                            movementMode: value as JourneyTemplateSetting['steps'][number]['movementMode'],
                          })}
                      />
                    </div>
                    <p class="journey-admin__field-hint">{t(journeyMovementHintKey(step.movementMode))}</p>
                  </div>

                  <div class="journey-admin__field">
                    <span class="journey-admin__field-label">{t('mfa.settings.journeyStepDisplay')}</span>
                    <div class="journey-admin__segment-wrap">
                      <SegmentedControl
                        class="segmented-control--journey"
                        options={displaySegmentOptions}
                        value={step.publicDisplayMode}
                        disabled={busy}
                        ariaLabel={t('mfa.settings.journeyStepDisplay')}
                        onchange={(value) =>
                          updateStep(step.id, {
                            publicDisplayMode: value as JourneyTemplateSetting['steps'][number]['publicDisplayMode'],
                          })}
                      />
                    </div>
                    <p class="journey-admin__field-hint">{t(journeyDisplayHintKey(step.publicDisplayMode))}</p>
                  </div>
                </div>

                <!-- instructionText: bewusst ausgeblendet — Routing-Hinweis fürs Terminal, UI folgt später. -->
              </div>
            </article>
          </li>
        {/each}
      </ol>
    </section>
  {:else if journeySettings.templates.length === 0}
    <p class="text-muted">{t('mfa.settings.journeyEmptyState')}</p>
  {/if}
</section>
