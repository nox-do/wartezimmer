<script lang="ts">
  import Button from '$lib/components/forms/Button.svelte';
  import {
    buildJourneyPreview,
    createDefaultJourneyStep,
    createJourneyTemplate,
    JOURNEY_COMPLETED_WHEN,
    JOURNEY_DISPLAY_MODES,
    JOURNEY_MOVEMENT_MODES,
    PF_GENERAL_QUEUE_ID,
  } from '$lib/mfa/journey-admin-helpers';
  import type {
    JourneySettings,
    JourneyTemplateSetting,
    PracticeRoom,
    PracticeTopicSetting,
  } from '$lib/ops/openapi-types';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    journeySettings: JourneySettings;
    topics: PracticeTopicSetting[];
    enabledRooms: PracticeRoom[];
    busy?: boolean;
    onChange?: (settings: JourneySettings) => void;
    onSave?: (settings: JourneySettings) => void | Promise<void>;
  }

  let {
    journeySettings,
    topics,
    enabledRooms,
    busy = false,
    onChange,
    onSave,
  }: Props = $props();

  let selectedTemplateId = $state('');

  const fallbackLocationId = $derived(enabledRooms[0]?.roomId ?? '');
  const selectedTemplate = $derived(
    journeySettings.templates.find((template) => template.id === selectedTemplateId) ?? null,
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

  function addTemplate() {
    const taken = new Set(journeySettings.templates.map((template) => template.id));
    const template = createJourneyTemplate(t('mfa.settings.journeyNewTemplateName'), taken, fallbackLocationId);
    updateTemplates([...journeySettings.templates, template]);
    selectedTemplateId = template.id;
  }

  function removeSelectedTemplate() {
    if (!selectedTemplate) return;
    updateTemplates(journeySettings.templates.filter((template) => template.id !== selectedTemplate.id));
  }

  function addStep() {
    if (!selectedTemplate) return;
    const steps = [...selectedTemplate.steps].sort((a, b) => a.sortOrder - b.sortOrder);
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
  <div class="journey-admin__toolbar">
    <label class="journey-admin__field">
      <span>{t('mfa.settings.journeySelectTemplate')}</span>
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
    <Button type="button" variant="outline" disabled={busy} onclick={addTemplate}>
      {t('mfa.settings.journeyAddTemplate')}
    </Button>
  </div>

  {#if selectedTemplate}
    <p class="journey-admin__preview">
      {buildJourneyPreview(selectedTemplate, topics, enabledRooms)}
    </p>

    <div class="journey-admin__grid">
      <label class="journey-admin__field">
        <span>{t('mfa.settings.journeyTemplateName')}</span>
        <input
          class="form-input"
          type="text"
          value={selectedTemplate.name}
          disabled={busy}
          oninput={(event) =>
            updateSelectedTemplate({ name: (event.currentTarget as HTMLInputElement).value })}
        />
      </label>

      <label class="journey-admin__field">
        <span>{t('mfa.settings.journeyTemplateTopic')}</span>
        <select
          class="form-input"
          value={selectedTemplate.topicId ?? ''}
          disabled={busy}
          onchange={(event) =>
            updateSelectedTemplate({
              topicId: (event.currentTarget as HTMLSelectElement).value || null,
            })}
        >
          <option value="">{t('mfa.settings.journeyTemplateTopicNone')}</option>
          {#each topics.filter((topic) => topic.enabled) as topic (topic.topicId)}
            <option value={topic.topicId}>{topic.label}</option>
          {/each}
        </select>
      </label>

      <label class="journey-admin__check">
        <input
          type="checkbox"
          checked={selectedTemplate.active}
          disabled={busy}
          onchange={(event) =>
            updateSelectedTemplate({ active: (event.currentTarget as HTMLInputElement).checked })}
        />
        <span>{t('mfa.settings.colEnabled')}</span>
      </label>
    </div>

    <section class="journey-admin__steps">
      <header class="journey-admin__steps-header">
        <h3>{t('mfa.settings.journeyStepsTitle')}</h3>
        <Button type="button" variant="outline" disabled={busy} onclick={addStep}>
          {t('mfa.settings.journeyAddStep')}
        </Button>
      </header>

      {#each selectedTemplate.steps.slice().sort((a, b) => a.sortOrder - b.sortOrder) as step, index (step.id)}
        <article class="journey-admin__step">
          <header class="journey-admin__step-header">
            <strong>{tf('mfa.settings.journeyStepLabel', { index: index + 1 })}</strong>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || selectedTemplate.steps.length <= 1}
              onclick={() => removeStep(step.id)}
            >
              {t('mfa.settings.journeyRemoveStep')}
            </Button>
          </header>

          <div class="journey-admin__grid">
            <label class="journey-admin__field">
              <span>{t('mfa.settings.journeyStepTarget')}</span>
              <select
                class="form-input"
                value={step.targetLocationId ?? ''}
                disabled={busy}
                onchange={(event) =>
                  updateStep(step.id, {
                    targetLocationId: (event.currentTarget as HTMLSelectElement).value || null,
                  })}
              >
                {#each enabledRooms as room (room.roomId)}
                  <option value={room.roomId}>{room.roomLabel}</option>
                {/each}
              </select>
            </label>

            <label class="journey-admin__field">
              <span>{t('mfa.settings.journeyStepQueue')}</span>
              <select
                class="form-input"
                value={step.queueId ?? ''}
                disabled={busy}
                onchange={(event) =>
                  updateStep(step.id, {
                    queueId: (event.currentTarget as HTMLSelectElement).value || null,
                  })}
              >
                <option value="">{t('mfa.settings.journeyStepQueueNone')}</option>
                <option value={PF_GENERAL_QUEUE_ID}>{t('mfa.settings.journeyGeneralQueue')}</option>
              </select>
            </label>

            <label class="journey-admin__field">
              <span>{t('mfa.settings.journeyStepMovement')}</span>
              <select
                class="form-input"
                value={step.movementMode}
                disabled={busy}
                onchange={(event) =>
                  updateStep(step.id, {
                    movementMode: (event.currentTarget as HTMLSelectElement)
                      .value as JourneyTemplateSetting['steps'][number]['movementMode'],
                  })}
              >
                {#each JOURNEY_MOVEMENT_MODES as mode (mode)}
                  <option value={mode}>{mode}</option>
                {/each}
              </select>
            </label>

            <label class="journey-admin__field">
              <span>{t('mfa.settings.journeyStepDisplay')}</span>
              <select
                class="form-input"
                value={step.publicDisplayMode}
                disabled={busy}
                onchange={(event) =>
                  updateStep(step.id, {
                    publicDisplayMode: (event.currentTarget as HTMLSelectElement)
                      .value as JourneyTemplateSetting['steps'][number]['publicDisplayMode'],
                  })}
              >
                {#each JOURNEY_DISPLAY_MODES as mode (mode)}
                  <option value={mode}>{mode}</option>
                {/each}
              </select>
            </label>

            <label class="journey-admin__field">
              <span>{t('mfa.settings.journeyStepCompletedWhen')}</span>
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
                  <option value={mode}>{mode}</option>
                {/each}
              </select>
            </label>

            <label class="journey-admin__field journey-admin__field--wide">
              <span>{t('mfa.settings.journeyStepInstruction')}</span>
              <input
                class="form-input"
                type="text"
                value={step.instructionText ?? ''}
                disabled={busy}
                placeholder={t('mfa.settings.journeyStepInstructionPlaceholder')}
                oninput={(event) =>
                  updateStep(step.id, {
                    instructionText: (event.currentTarget as HTMLInputElement).value || null,
                  })}
              />
            </label>
          </div>
        </article>
      {/each}
    </section>

    <div class="journey-admin__actions">
      <Button type="button" variant="ghost" disabled={busy} onclick={removeSelectedTemplate}>
        {t('mfa.settings.journeyRemoveTemplate')}
      </Button>
      <Button
        type="button"
        variant="primary"
        disabled={busy}
        onclick={() => onSave?.(journeySettings)}
      >
        {t('mfa.settings.journeySave')}
      </Button>
    </div>
  {:else}
    <p class="text-muted">{t('mfa.settings.journeyEmptyState')}</p>
  {/if}
</section>
