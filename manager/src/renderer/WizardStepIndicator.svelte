<script lang="ts">
  import { WIZARD_STEP_LABELS, WIZARD_STEPS, type WizardStep } from './wizard-flow.js';

  let { current }: { current: WizardStep } = $props();
</script>

<ol id="wizard-steps" class="wizard-steps">
  {#each WIZARD_STEPS as stepNum, index (stepNum)}
    {#if index > 0}
      <li class="wizard-step-separator" aria-hidden="true">›</li>
    {/if}
    <li
      class="wizard-step-indicator"
      class:is-current={stepNum === current}
      class:is-done={stepNum < current}
      class:is-upcoming={stepNum > current}
      aria-current={stepNum === current ? 'step' : undefined}
      title={WIZARD_STEP_LABELS[index]}
    >
      <span class="wizard-step-badge">{stepNum}</span>
      {#if stepNum === current}
        <span class="wizard-step-label">{WIZARD_STEP_LABELS[index]}</span>
      {/if}
    </li>
  {/each}
</ol>
