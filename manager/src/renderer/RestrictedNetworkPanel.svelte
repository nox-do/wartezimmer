<script lang="ts">
  import type { HostLifecycle } from '@praxis-flow/server-shared/setup-api';
  import { evaluateHostLifecycleAction } from '@praxis-flow/server-shared/host-lifecycle-policy';
  import type { HostStatus, RestrictedNetworkInspectResult } from '../shared/host-status.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import {
    restrictedActionErrorText,
    reconcileRestrictedDraft,
    restrictedCandidateWarningText,
    restrictedDnsStatusText,
    restrictedInspectHeadline,
    restrictedPrepareErrorText,
  } from './restricted-network-view-model.js';

  let {
    active,
    lifecycle,
    configSnapshot,
    onAfterMutation,
    peerMutating = false,
    onMutatingChange,
  }: {
    active: boolean;
    lifecycle?: HostLifecycle;
    configSnapshot?: HostStatus | null;
    onAfterMutation?: () => void | Promise<void>;
    peerMutating?: boolean;
    onMutatingChange?: (mutating: boolean) => void;
  } = $props();
  let inspect = $state<RestrictedNetworkInspectResult | null>(null);
  let action = $state<'idle' | 'refreshing' | 'mutating'>('idle');
  let loadError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let loadAttempted = $state(false);
  let inspectedConfig = $state.raw<HostStatus | null | undefined>(undefined);
  let selectedCandidateKey = $state('');
  let warningsConfirmed = $state(false);
  let notice = $state<string | null>(null);
  let pendingAction = $state<'apply' | 'remove' | null>(null);
  let generation = 0;
  const busy = $derived(action !== 'idle');

  function lifecycleAllows(action: 'network-binding' | 'restricted-apply' | 'restricted-remove') {
    if (!lifecycle) return true;
    const decision = evaluateHostLifecycleAction(lifecycle, action);
    if (decision.allowed) return true;
    actionError = decision.reason ?? 'Host-Aktion derzeit nicht erlaubt.';
    return false;
  }

  const candidateKey = (address: string, interfaceId: string): string => `${interfaceId}\u0000${address}`;
  const selectedCandidate = $derived(
    inspect?.candidates.find(
      (candidate) => candidateKey(candidate.address, candidate.interfaceId) === selectedCandidateKey,
    ) ?? null,
  );
  const selectedWarning = $derived(
    selectedCandidate ? restrictedCandidateWarningText(selectedCandidate.warnings) : null,
  );
  const prerequisitesReady = $derived(
    Boolean(
      inspect?.capabilities.supported &&
        inspect.checks.find((check) => check.id === 'restricted.tls')?.ok,
    ),
  );
  const selectedMatchesBinding = $derived(
    Boolean(
      inspect?.status.binding &&
        inspect.status.binding.hostIp === selectedCandidate?.address &&
        inspect.status.binding.interfaceId === selectedCandidate?.interfaceId,
    ),
  );
  const activationReady = $derived.by(() => {
    const snapshot = inspect;
    return Boolean(
      snapshot?.status.phase === 'prepared' &&
        selectedMatchesBinding &&
        [
          'restricted.platform',
          'restricted.tls',
          'restricted.portal-dns-public',
          'restricted.portal-dns-local',
          'restricted.local-ip',
        ].every((id) => snapshot.checks.find((check) => check.id === id)?.ok),
    );
  });

  function acceptInspect(result: RestrictedNetworkInspectResult): void {
    const draft = reconcileRestrictedDraft(inspect, result, selectedCandidateKey, warningsConfirmed);
    inspect = result;
    selectedCandidateKey = draft.selectedKey;
    warningsConfirmed = draft.confirmed;
  }

  async function notifyMutation(): Promise<void> {
    try { await onAfterMutation?.(); } catch { /* Keep the action error; shell owns refresh diagnostics. */ }
  }

  async function refresh(): Promise<void> {
    if (busy || peerMutating) return;
    const current = ++generation;
    action = 'refreshing';
    inspectedConfig = configSnapshot;
    loadError = null;
    actionError = null;
    notice = null;
    try {
      const result = await window.praxisManager.inspectRestrictedNetwork();
      if (current === generation) {
        acceptInspect(result);
        loadAttempted = true;
      }
    } catch (cause) {
      if (current === generation) {
        loadError = cause instanceof Error ? cause.message : String(cause);
        loadAttempted = true;
      }
    } finally {
      if (current === generation) action = 'idle';
    }
  }


  async function prepare(): Promise<void> {
    if (busy || peerMutating) return;
    if (!selectedCandidate) return;
    if (!lifecycleAllows('network-binding')) return;
    const current = ++generation;
    action = 'mutating';
    onMutatingChange?.(true);
    actionError = null;
    notice = null;
    try {
      const result = await window.praxisManager.prepareRestrictedNetwork({
        hostIp: selectedCandidate.address,
        interfaceId: selectedCandidate.interfaceId,
        warningsConfirmed,
      });
      if (current === generation) {
        acceptInspect(result);
        loadAttempted = true;
        notice = result.dns.state === 'match'
          ? 'Netzwerkadresse ist vorbereitet. Der Patientenzugang kann jetzt aktiviert werden.'
          : result.dns.state === 'local-unresolved'
            ? 'Netzwerkadresse ist vorbereitet. Der öffentliche A-Record stimmt, die lokale DNS-Auflösung muss noch freigegeben werden.'
            : 'Netzwerkadresse ist vorbereitet. Der Portal-A-Record muss noch geprüft oder korrigiert werden.';

      }
    } catch (cause) {
      if (current === generation) {
        actionError = restrictedPrepareErrorText(cause);
      }
    } finally {
      await notifyMutation();
      // The mutation owns its lock until completion, even after leaving the view.
      action = 'idle';
      onMutatingChange?.(false);
    }
  }

  async function runAction(request: 'apply' | 'remove'): Promise<void> {
    if (busy || peerMutating) return;
    if (!lifecycleAllows(request === 'apply' ? 'restricted-apply' : 'restricted-remove')) return;
    const current = ++generation;
    action = 'mutating';
    onMutatingChange?.(true);
    actionError = null;
    notice = null;
    pendingAction = null;
    try {
      const result = request === 'apply'
        ? await window.praxisManager.applyRestrictedNetwork()
        : await window.praxisManager.removeRestrictedNetwork();
      if (current === generation) {
        acceptInspect(result);
        loadAttempted = true;
        notice = request === 'apply'
          ? 'Patientenzugang ist auf der gewählten Netzwerkadresse aktiv.'
          : 'Patientenzugang und Restricted-Binding wurden entfernt.';

      }
    } catch (cause) {
      if (current === generation) {
        actionError = restrictedActionErrorText(
          cause,
          request === 'apply' ? 'aktiviert' : 'entfernt',
        );
      }
    } finally {
      await notifyMutation();
      // The mutation owns its lock until completion, even after leaving the view.
      action = 'idle';
      onMutatingChange?.(false);
    }
  }

  $effect(() => {
    // HTTPS and adapter edits update the shell configuration while this panel stays mounted.
    // Wait for host mutations to finish, then replace the cached prerequisite checks.
    if (active && !busy && !peerMutating && (!loadAttempted || inspectedConfig !== configSnapshot)) void refresh();
    if (!active) {
      generation += 1;
      if (action !== 'mutating') action = 'idle';
      loadAttempted = false;
    }
  });
</script>

<p class="hint">
  Hier bereiten Sie eine zusätzliche IP-Adresse vor, über die ausschließlich das Patientenportal
  erreichbar ist. Die tatsächliche Netztrennung richtet die Praxis-IT ein.
</p>

{#if action === 'refreshing' && !inspect}
  <p role="status">Restricted-Network-Status wird geprüft …</p>
{:else if loadError && !inspect}
  <p class="error" role="alert">Restricted-Network-Status konnte nicht geladen werden: {loadError}</p>
  <button type="button" class="btn-secondary" disabled={busy || peerMutating} onclick={() => void refresh()}>
    Erneut prüfen
  </button>
{:else if inspect}
  {#if loadError}
    <p class="notice is-warn" role="alert">
      Der aktuelle Status konnte nicht erneut geprüft werden. Die angezeigten Angaben können
      veraltet sein. Stellen Sie die Netzwerkverbindung wieder her und prüfen Sie erneut.
    </p>
  {/if}

  <div class="network-columns">
  <div class="network-column">
  <h3 class="network-heading">Adresse und Freigabe</h3>
  <dl class="status-grid wizard-summary-grid">
    <dt>Status</dt><dd>{restrictedInspectHeadline(inspect)}</dd>
    <dt>Staff-Adresse</dt><dd>{inspect.staff.hostIp ?? 'Nicht gewählt'}{inspect.staff.interfaceName ? ` (${inspect.staff.interfaceName})` : ''}</dd>
    <dt>Restricted-Adresse</dt><dd>{inspect.status.binding ? `${inspect.status.binding.hostIp} (${inspect.status.binding.interfaceName})` : 'Noch nicht gewählt'}</dd>
    <dt>Portal-Adresse</dt><dd>{inspect.status.portalHostname ? `https://${inspect.status.portalHostname}` : 'HTTPS-Identität fehlt'}</dd>
    <dt>Portal-DNS</dt><dd>{restrictedDnsStatusText(inspect.dns)}</dd>
    <dt>Freigabe</dt><dd>Patientenportal</dd>
  </dl>

  {#if !inspect.capabilities.supported || inspect.capabilities.platform === 'win32'}
    <p class="notice is-warn">{inspect.capabilities.message}</p>
  {/if}

  <h3 class="wizard-subheading">Netzwerkadresse auswählen</h3>
  {#if inspect.candidates.length}
    <div class="restricted-candidate-list" role="radiogroup" aria-label="Netzwerkadresse für Patientenportal">
      {#each inspect.candidates as candidate (candidateKey(candidate.address, candidate.interfaceId))}
        {@const warning = restrictedCandidateWarningText(candidate.warnings)}
        <label class="restricted-candidate-option" class:is-warn={Boolean(warning)}>
          <input
            type="radio"
            name="restricted-network-candidate"
            value={candidateKey(candidate.address, candidate.interfaceId)}
            checked={selectedCandidateKey === candidateKey(candidate.address, candidate.interfaceId)}
            disabled={busy || peerMutating || !inspect.capabilities.supported || inspect.status.phase === 'applied'}
            onchange={() => {
              selectedCandidateKey = candidateKey(candidate.address, candidate.interfaceId);
              warningsConfirmed = false;
              notice = null;
            }}
          />
          <span>
            <strong>{candidate.address}{candidate.cidr ? `/${candidate.cidr.split('/')[1]}` : ''}</strong>
            · {candidate.interfaceName}
            {#if warning}<br /><span class="hint">Hinweis: {warning}</span>{/if}
          </span>
        </label>
      {/each}
    </div>
  {:else}
    <p class="notice is-warn">Keine zusätzliche lokale IPv4-Adresse gefunden. Lassen Sie Ihre Praxis-IT eine zusätzliche IP-Adresse am Rechner einrichten und wählen Sie anschließend „Erneut prüfen“.</p>
  {/if}

  {#if selectedWarning}
    <label class="restricted-warning-confirmation">
      <input type="checkbox" bind:checked={warningsConfirmed} disabled={busy || peerMutating} />
      <span>Die Hinweise zu dieser Adresse wurden mit der Praxis-IT geprüft und die Verwendung wurde bestätigt.</span>
    </label>
  {/if}

  </div>
  <div class="network-column">
  <h3 class="network-heading">Voraussetzungen und Aktionen</h3>
  <ul class="checklist">
    {#each inspect.checks.filter((check) => check.id !== 'restricted.platform' || !check.ok) as check (check.id)}
      <li class:is-bad={!check.ok} class:is-done={check.ok}>
        <span class="checklist-mark" aria-hidden="true">{check.ok ? '✓' : '!'}</span>
        <span>{check.message}{check.detail ? ` – ${check.detail}` : ''}</span>
      </li>
    {/each}
  </ul>

  {#if notice}
    <p class="maintenance-backup-status" role="status">{notice}</p>
  {/if}
  {#if actionError}
    <p class="notice is-warn" role="alert">{actionError}</p>
  {/if}

  <p class="hint">
    Das Patientennetz sollte vom Praxisnetz getrennt eingerichtet werden. Praxis Flow übernimmt diese Netztrennung nicht. Lassen Sie Ihre IT-Betreuung die Einrichtung und den Zugriff aus dem Patientennetz prüfen.
  </p>
  <div class="actions-row">
    {#if inspect.status.phase === 'applied'}
      <button
        type="button"
        class="btn-secondary"
        disabled={busy || peerMutating}
        onclick={() => { pendingAction = 'remove'; }}
      >
        {busy ? 'Wird entfernt …' : 'Patientenzugang entfernen'}
      </button>
    {:else if activationReady}
      <button
        type="button"
        disabled={busy || peerMutating}
        onclick={() => { pendingAction = 'apply'; }}
      >
        {busy ? 'Wird aktiviert …' : 'Patientenzugang aktivieren'}
      </button>
    {:else}
      <button
        type="button"
        class="btn-secondary"
        disabled={busy || peerMutating || !selectedCandidate || !prerequisitesReady || Boolean(selectedWarning && !warningsConfirmed)}
        onclick={() => void prepare()}
      >
        {busy ? 'Bereitet vor …' : selectedMatchesBinding ? 'Netzwerkadresse erneut vorbereiten' : 'Netzwerkadresse vorbereiten'}
      </button>
    {/if}
    <button type="button" class="btn-secondary" disabled={busy || peerMutating} onclick={() => void refresh()}>
      {busy ? 'Prüft …' : 'Erneut prüfen'}
    </button>
  </div>
  </div>
  </div>
{/if}

<ConfirmDialog
  open={pendingAction !== null && !peerMutating}
  confirmLabel={pendingAction === 'remove' ? 'Entfernen' : 'Aktivieren'}
  onConfirm={() => {
    const action = pendingAction;
    if (action && !peerMutating) void runAction(action);
  }}
  onCancel={() => { pendingAction = null; }}
>
  {#if pendingAction === 'apply'}
    <h3>Patientenzugang aktivieren?</h3>
    <p>
      Der Proxy wird kurz neu gestartet und anschließend auf Staff- und Restricted-Bindings
      geprüft. Routing und Netztrennung bleiben Aufgabe der Praxis-IT.
    </p>
  {:else}
    <h3>Patientenzugang entfernen?</h3>
    <p>Der Restricted-Listener wird entfernt. Die interne Portalnutzung über Staff bleibt erhalten.</p>
  {/if}
</ConfirmDialog>
