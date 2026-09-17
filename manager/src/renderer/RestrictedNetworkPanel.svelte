<script lang="ts">
  import type { RestrictedNetworkInspectResult } from '../shared/host-status.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import {
    restrictedActionErrorText,
    restrictedCandidateWarningText,
    restrictedDnsStatusText,
    restrictedInspectHeadline,
    restrictedPrepareErrorText,
  } from './restricted-network-view-model.js';

  let {
    active,
    onAfterMutation,
    peerMutating = false,
    onMutatingChange,
  }: {
    active: boolean;
    onAfterMutation?: () => void | Promise<void>;
    peerMutating?: boolean;
    onMutatingChange?: (mutating: boolean) => void;
  } = $props();
  let inspect = $state<RestrictedNetworkInspectResult | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let loaded = $state(false);
  let selectedAddress = $state('');
  let warningsConfirmed = $state(false);
  let notice = $state<string | null>(null);
  let pendingAction = $state<'apply' | 'remove' | null>(null);
  let generation = 0;

  const selectedCandidate = $derived(
    inspect?.candidates.find((candidate) => candidate.address === selectedAddress) ?? null,
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
        inspect.status.binding.hostIp === selectedAddress &&
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
    inspect = result;
    const saved = result.status.binding?.hostIp;
    if (saved && result.candidates.some((candidate) => candidate.address === saved)) {
      selectedAddress = saved;
      warningsConfirmed = result.status.binding?.warningsConfirmed ?? false;
    } else if (!result.candidates.some((candidate) => candidate.address === selectedAddress)) {
      selectedAddress = '';
      warningsConfirmed = false;
    }
  }

  function notifyMutation(): void {
    if (onAfterMutation) void Promise.resolve(onAfterMutation()).catch(() => undefined);
  }

  async function refresh(): Promise<void> {
    const current = ++generation;
    loading = true;
    loadError = null;
    actionError = null;
    notice = null;
    try {
      const result = await window.praxisManager.inspectRestrictedNetwork();
      if (current === generation) {
        acceptInspect(result);
        loaded = true;
      }
    } catch (cause) {
      if (current === generation) {
        loadError = cause instanceof Error ? cause.message : String(cause);
      }
    } finally {
      if (current === generation) loading = false;
    }
  }


  async function prepare(): Promise<void> {
    if (!selectedCandidate) return;
    const current = ++generation;
    loading = true;
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
        loaded = true;
        notice = result.dns.state === 'match'
          ? 'Netzwerkadresse ist vorbereitet. Der Patientenzugang kann jetzt aktiviert werden.'
          : result.dns.state === 'local-unresolved'
            ? 'Netzwerkadresse ist vorbereitet. Der öffentliche A-Record stimmt, die lokale DNS-Auflösung muss noch freigegeben werden.'
            : 'Netzwerkadresse ist vorbereitet. Der Portal-A-Record muss noch geprüft oder korrigiert werden.';
        notifyMutation();
      }
    } catch (cause) {
      if (current === generation) {
        actionError = restrictedPrepareErrorText(cause);
      }
    } finally {
      onMutatingChange?.(false);
      if (current === generation) loading = false;
    }
  }

  async function runAction(action: 'apply' | 'remove'): Promise<void> {
    const current = ++generation;
    loading = true;
    onMutatingChange?.(true);
    actionError = null;
    notice = null;
    pendingAction = null;
    try {
      const result = action === 'apply'
        ? await window.praxisManager.applyRestrictedNetwork()
        : await window.praxisManager.removeRestrictedNetwork();
      if (current === generation) {
        acceptInspect(result);
        loaded = true;
        notice = action === 'apply'
          ? 'Patientenzugang ist auf der gewählten Netzwerkadresse aktiv.'
          : 'Patientenzugang und Restricted-Binding wurden entfernt.';
        notifyMutation();
      }
    } catch (cause) {
      if (current === generation) {
        actionError = restrictedActionErrorText(
          cause,
          action === 'apply' ? 'aktiviert' : 'entfernt',
        );
      }
    } finally {
      onMutatingChange?.(false);
      if (current === generation) loading = false;
    }
  }

  $effect(() => {
    if (active && !loaded && !loading) void refresh();
    if (!active) generation += 1;
  });
</script>

<p class="hint">
  Hier bereiten Sie eine zusätzliche Adresse vor, über die Geräte im Patientennetz ausschließlich
  das Patientenportal erreichen. Die tatsächliche Netztrennung richtet die Praxis-IT ein.
</p>

{#if loading && !inspect}
  <p role="status">Restricted-Network-Status wird geprüft …</p>
{:else if loadError && !inspect}
  <p class="error" role="alert">Restricted-Network-Status konnte nicht geladen werden: {loadError}</p>
{:else if inspect}
  {#if loadError}
    <p class="notice is-warn" role="alert">
      Der aktuelle Status konnte nicht erneut geprüft werden. Die angezeigten Angaben können
      veraltet sein. Stellen Sie die Netzwerkverbindung wieder her und prüfen Sie erneut.
    </p>
  {/if}

  <dl class="status-grid wizard-summary-grid">
    <dt>Status</dt><dd>{restrictedInspectHeadline(inspect)}</dd>
    <dt>Staff-Adresse</dt><dd>{inspect.staff.hostIp ?? 'Nicht gewählt'}{inspect.staff.interfaceName ? ` (${inspect.staff.interfaceName})` : ''}</dd>
    <dt>Restricted-Adresse</dt><dd>{inspect.status.binding ? `${inspect.status.binding.hostIp} (${inspect.status.binding.interfaceName})` : 'Noch nicht gewählt'}</dd>
    <dt>Portal-Adresse</dt><dd>{inspect.status.portalHostname ? `https://${inspect.status.portalHostname}` : 'HTTPS-Identität fehlt'}</dd>
    <dt>Portal-DNS</dt><dd>{restrictedDnsStatusText(inspect.dns)}</dd>
    <dt>Freigabe</dt><dd>Patientenportal</dd>
  </dl>

  {#if !inspect.capabilities.supported}
    <p class="notice is-warn">{inspect.capabilities.message}</p>
  {/if}

  <h3 class="wizard-subheading">Netzwerkadresse auswählen</h3>
  <p class="hint">
    Die Liste bleibt bewusst breit. Hinweise markieren mögliche Risiken, sperren eine Adresse
    aber nicht automatisch. Loopback, Link-Local und die Staff-IP werden nicht angeboten.
  </p>
  {#if inspect.candidates.length}
    <div class="restricted-candidate-list" role="radiogroup" aria-label="Netzwerkadresse für Patientenportal">
      {#each inspect.candidates as candidate (candidate.address)}
        {@const warning = restrictedCandidateWarningText(candidate.warnings)}
        <label class="restricted-candidate-option" class:is-warn={Boolean(warning)}>
          <input
            type="radio"
            name="restricted-network-candidate"
            value={candidate.address}
            checked={selectedAddress === candidate.address}
            disabled={loading || peerMutating || !inspect.capabilities.supported || inspect.status.phase === 'applied'}
            onchange={() => {
              selectedAddress = candidate.address;
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
    <p class="notice is-warn">Keine zusätzliche lokale IPv4-Adresse gefunden.</p>
  {/if}

  {#if selectedWarning}
    <label class="restricted-warning-confirmation">
      <input type="checkbox" bind:checked={warningsConfirmed} disabled={loading || peerMutating} />
      <span>Die Hinweise zu dieser Adresse wurden mit der Praxis-IT geprüft und die Verwendung wurde bestätigt.</span>
    </label>
  {/if}

  <h3 class="wizard-subheading">Voraussetzungen prüfen</h3>
  <ul class="checklist">
    {#each inspect.checks as check (check.id)}
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
    Nicht durch Praxis Flow geprüft oder verwaltet: {inspect.externalResponsibilities.join('; ')}.
    Ein IP-Binding allein ist keine Zusage zur Netztrennung.
  </p>
  <div class="actions-row">
    {#if inspect.status.phase === 'applied'}
      <button
        type="button"
        class="btn-secondary"
        disabled={loading || peerMutating}
        onclick={() => { pendingAction = 'remove'; }}
      >
        {loading ? 'Wird entfernt …' : 'Patientenzugang entfernen'}
      </button>
    {:else if activationReady}
      <button
        type="button"
        disabled={loading || peerMutating}
        onclick={() => { pendingAction = 'apply'; }}
      >
        {loading ? 'Wird aktiviert …' : 'Patientenzugang aktivieren'}
      </button>
    {:else}
      <button
        type="button"
        class="btn-secondary"
        disabled={loading || peerMutating || !selectedCandidate || !prerequisitesReady || Boolean(selectedWarning && !warningsConfirmed)}
        onclick={() => void prepare()}
      >
        {loading ? 'Bereitet vor …' : selectedMatchesBinding ? 'Netzwerkadresse erneut vorbereiten' : 'Netzwerkadresse vorbereiten'}
      </button>
    {/if}
    <button type="button" class="btn-secondary" disabled={loading || peerMutating} onclick={() => void refresh()}>
      {loading ? 'Prüft …' : 'Erneut prüfen'}
    </button>
  </div>
{/if}

<ConfirmDialog
  open={pendingAction !== null}
  confirmLabel={pendingAction === 'remove' ? 'Entfernen' : 'Aktivieren'}
  onConfirm={() => {
    const action = pendingAction;
    if (action) void runAction(action);
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
