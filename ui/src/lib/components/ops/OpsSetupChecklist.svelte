<script lang="ts">
  import type { SetupCheck } from '$lib/ops/ops-system-api';
  import { isSetupCheckPending } from '$lib/ops/setup-check-hints';

  let {
    checks,
    checkLabel,
    checkHintText,
  }: {
    checks: SetupCheck[];
    checkLabel: (id: string) => string;
    checkHintText: (check: SetupCheck) => string | null;
  } = $props();
</script>

<ul class="ops-setup-checklist">
  {#each checks.filter((check) => check.required) as check (check.id)}
    {@const pending = !check.ok && isSetupCheckPending(check.hint)}
    <li
      class:ops-setup-checklist--bad={!check.ok && !pending}
      class:ops-setup-checklist--pending={pending}
    >
      <span
        class="pill"
        class:pill--ok={check.ok}
        class:pill--bad={!check.ok && !pending}
        class:pill--pending={pending}
      >
        {check.ok ? '✓' : pending ? '…' : '·'}
      </span>
      <span class="ops-setup-checklist__body">
        <span>{checkLabel(check.id)}</span>
        {#if checkHintText(check)}
          <span class="ops-setup-checklist__hint">{checkHintText(check)}</span>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .ops-setup-checklist {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ops-setup-checklist li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.9rem;
  }

  .ops-setup-checklist__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .ops-setup-checklist__hint {
    font-size: 0.85rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }

  .ops-setup-checklist--bad {
    color: var(--muted-foreground);
  }

  .ops-setup-checklist--pending {
    opacity: 0.95;
  }
</style>
