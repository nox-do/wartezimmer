<script lang="ts">
  import {
    HTTPS_PHASES,
    WIZARD_STEP_LABELS,
    WIZARD_STEPS,
    httpsPhaseIndex,
    wizardHttpsEligible,
    type WizardHttpsPhase,
    type WizardStep,
  } from './wizard-flow.js';

  let {
    current,
    httpsPhase = 'offer',
    proxyEnabled = false,
  }: {
    current: WizardStep;
    httpsPhase?: WizardHttpsPhase;
    proxyEnabled?: boolean;
  } = $props();

  const skippedHttps = $derived(!wizardHttpsEligible(proxyEnabled) && current > 6);
  const httpsOpen = $derived(current === 6 && wizardHttpsEligible(proxyEnabled));
</script>

<ol id="wizard-steps" class="wizard-steps">
  {#each WIZARD_STEPS as stepNum, index (stepNum)}
    {#if index > 0}
      <li class="wizard-step-separator" aria-hidden="true">›</li>
    {/if}
    {@const skipped = stepNum === 6 && skippedHttps}
    {@const currentStep = !skipped && stepNum === current}
    {@const done = stepNum < current}
    <li
      class="wizard-step-indicator"
      class:is-current={currentStep}
      class:is-done={done}
      class:is-upcoming={stepNum > current}
      aria-current={currentStep ? 'step' : undefined}
      title={skipped ? `${WIZARD_STEP_LABELS[index]} (übersprungen — kein Proxy)` : WIZARD_STEP_LABELS[index]}
    >
      <span class="wizard-step-badge">{index + 1}</span>
      {#if currentStep}
        <span class="wizard-step-label">{WIZARD_STEP_LABELS[index]}</span>
        {#if httpsOpen}
          <span class="wizard-step-progress" aria-hidden="true">
            {#each HTTPS_PHASES as phase, phaseIndex (phase)}
              {@const here = httpsPhaseIndex(httpsPhase)}
              <span
                class="wizard-step-dot"
                class:is-done={phaseIndex < here}
                class:is-here={phaseIndex === here}
              ></span>
            {/each}
          </span>
        {/if}
      {/if}
    </li>
  {/each}
</ol>
