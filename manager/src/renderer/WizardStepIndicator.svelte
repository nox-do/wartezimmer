<script lang="ts">
  import { WIZARD_STEP_LABELS, WIZARD_STEPS, type WizardStep } from './wizard-flow.js';

  let { current }: { current: WizardStep } = $props();
</script>

<ol id="wizard-steps" class="wizard-steps">
  {#each WIZARD_STEPS as stepNum, index (stepNum)}
    {#if index > 0}
      <li class="wizard-step-separator" aria-hidden="true">›</li>
    {/if}
    {@const currentStep = stepNum === current}
    {@const done = stepNum < current}
    <li
      class="wizard-step-indicator"
      class:is-current={currentStep}
      class:is-done={done}
      class:is-upcoming={stepNum > current}
      aria-current={currentStep ? 'step' : undefined}
      title={WIZARD_STEP_LABELS[index]}
    >
      <span class="wizard-step-badge">{index + 1}</span>
      {#if currentStep}
        <span class="wizard-step-label">{WIZARD_STEP_LABELS[index]}</span>
      {/if}
    </li>
  {/each}
</ol>
