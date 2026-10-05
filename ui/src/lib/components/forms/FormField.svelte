<script module lang="ts">
  export interface FormFieldControl {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    layout?: 'field' | 'row';
    id?: string;
    hint?: string;
    error?: string;
    class?: string;
    children: Snippet<[FormFieldControl]>;
  }

  let { label, layout = 'field', id, hint, error, class: className = '', children }: Props = $props();
  const instanceId = $props.id();
  const controlId = $derived(id ?? `${instanceId}-input`);
  const hintId = $derived(`${controlId}-hint`);
  const errorId = $derived(`${controlId}-error`);
  const describedBy = $derived(
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
  );
</script>

<!-- Keep native controls in the caller so bindings, validation and focus remain local. -->
{#snippet control()}
  {@render children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
  {#if hint}
    <span id={hintId} class="modal-form-hint">{hint}</span>
  {/if}
  {#if error}
    <span id={errorId} class="modal-form-error" role="alert">{error}</span>
  {/if}
{/snippet}

{#if layout === 'row'}
  <div class="staff-form-row {className}">
    <label for={controlId}>{label}</label>
    {@render control()}
  </div>
{:else}
  <label class="modal-form-field {className}" for={controlId}>
    <span>{label}</span>
    {@render control()}
  </label>
{/if}
