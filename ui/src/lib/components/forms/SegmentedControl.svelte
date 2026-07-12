<script lang="ts">
  export type SegmentedControlOption = {
    value: string;
    label: string;
  };

  interface Props {
    options: SegmentedControlOption[];
    value: string;
    disabled?: boolean;
    ariaLabel: string;
    class?: string;
    onchange?: (value: string) => void;
  }

  let {
    options,
    value,
    disabled = false,
    ariaLabel,
    class: className = '',
    onchange,
  }: Props = $props();
</script>

<div
  class={['segmented-control', className].filter(Boolean).join(' ')}
  role="radiogroup"
  aria-label={ariaLabel}
>
  {#each options as option (option.value)}
    <button
      type="button"
      class="segmented-control__option"
      role="radio"
      aria-checked={value === option.value}
      disabled={disabled}
      onclick={() => {
        if (disabled || value === option.value) return;
        onchange?.(option.value);
      }}
    >
      {option.label}
    </button>
  {/each}
</div>
