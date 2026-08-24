<script lang="ts">
  import type { HostStatus, NetworkSnapshot } from '../shared/host-status.js';
  import type { LanIpFieldState } from './host-network-panels.js';
  import { shouldOfferManualLanIpEntry } from './host-network-panels.js';

  let {
    state,
    network,
    status,
    disabled = false,
    variant = 'maintenance',
    radioName = 'network-lan-ip',
    idPrefix = 'network',
    onChange,
  }: {
    state: LanIpFieldState;
    network: NetworkSnapshot | null;
    status: HostStatus | null;
    disabled?: boolean;
    variant?: 'wizard' | 'maintenance';
    radioName?: string;
    idPrefix?: string;
    onChange: (patch: Partial<LanIpFieldState>) => void;
  } = $props();

  const customLanIpId = $derived(`${idPrefix}-lan-ip-custom`);

  const configuredLanIp = $derived(status?.network.configuredLanIp?.trim());
  const stale = $derived(status?.network.lanIpStale ?? false);
  const candidates = $derived(network?.lanCandidates ?? []);
  const useCustom = $derived(state.lanAppIp === '__custom__');
  const offerManualEntry = $derived(
    variant === 'maintenance' || shouldOfferManualLanIpEntry(candidates.length, stale),
  );
  const hasEnv = $derived(Boolean(status?.envExists && configuredLanIp));
  const showStatusSummary = $derived(variant === 'maintenance' && (hasEnv || candidates.length > 0));
  const showWizardStaleHint = $derived(
    variant === 'wizard' && stale && configuredLanIp,
  );

  function candidateMatchesConfigured(): boolean {
    return Boolean(
      configuredLanIp && candidates.some((candidate) => candidate.address === configuredLanIp),
    );
  }
</script>

{#if showWizardStaleHint && configuredLanIp}
  <p class="hint">
    Die konfigurierte Adresse ({configuredLanIp}) passt nicht zu einer aktuellen Rechner-Adresse —
    bitte aktualisieren.
  </p>
{/if}

{#if showStatusSummary}
  <div class="lan-ip-status">
    {#if hasEnv && configuredLanIp}
      <div class="lan-ip-status-row">
        <span class="lan-ip-status-label">Gespeichert</span>
        <span class="lan-ip-status-value">{configuredLanIp}</span>
        {#if stale}
          <span class="lan-ip-status-badge lan-ip-status-badge-warn">abweichend</span>
        {/if}
      </div>
    {/if}
    {#if candidates.length > 0}
      <div class="lan-ip-status-row">
        <span class="lan-ip-status-label">Aktuell am Rechner</span>
        <span class="lan-ip-status-value">{candidates.map((c) => c.label).join(' · ')}</span>
        {#if stale}
          <span class="lan-ip-status-badge lan-ip-status-badge-warn">abweichend</span>
        {:else if candidateMatchesConfigured()}
          <span class="lan-ip-status-badge lan-ip-status-badge-ok">stimmt überein</span>
        {/if}
      </div>
    {:else if hasEnv}
      <div class="lan-ip-status-row">
        <span class="lan-ip-status-label">Aktuell am Rechner</span>
        <span class="lan-ip-status-value">keine LAN-Adresse erkannt</span>
        <span class="lan-ip-status-badge lan-ip-status-badge-warn">abweichend</span>
      </div>
    {/if}
    {#if stale && configuredLanIp}
      <p class="lan-ip-status-hint">
        Die gespeicherte Adresse passt zu keiner aktuellen Rechner-Adresse — in der Liste die
        richtige wählen und übernehmen.
      </p>
    {/if}
  </div>
{/if}

{#if !useCustom}
  {#if candidates.length > 0}
    <p class="lan-ip-prompt">
      {candidates.length === 1
        ? 'Eine Adresse gefunden — für Terminal, TV und MFA verwenden:'
        : 'Adresse wählen, unter der Terminal, TV und MFA Praxis Flow erreichen:'}
    </p>
    <fieldset class="wizard-fieldset">
      {#each candidates as candidate (candidate.address)}
        <label class="wizard-radio">
          <input
            type="radio"
            name={radioName}
            value={candidate.address}
            checked={state.lanAppIp === candidate.address}
            {disabled}
            onchange={() => onChange({ lanAppIp: candidate.address, customLanIp: '' })}
          />
          <span>{candidate.label}</span>
        </label>
      {/each}
    </fieldset>
  {:else}
    <p class="hint">Keine LAN-Adresse am Host erkannt — bitte IP manuell eingeben.</p>
  {/if}

  {#if offerManualEntry}
    <button
      type="button"
      class="btn-link lan-ip-custom-trigger"
      {disabled}
      onclick={() =>
        onChange({
          lanAppIp: '__custom__',
          customLanIp: state.customLanIp || configuredLanIp || '',
        })}
    >
      Andere IP eingeben …
    </button>
  {/if}
{:else}
  <label class="wizard-field-label" for={customLanIpId}>LAN-IP (manuell)</label>
  <input
    id={customLanIpId}
    type="text"
    class="wizard-input"
    placeholder="192.168.1.50"
    value={state.customLanIp}
    {disabled}
    oninput={(event) => onChange({ customLanIp: event.currentTarget.value })}
  />
  {#if candidates.length > 0}
    <button
      type="button"
      class="btn-link lan-ip-custom-trigger"
      {disabled}
      onclick={() => {
        const selected =
          candidates.find((c) => c.address === state.customLanIp.trim())?.address ??
          candidates.find((c) => c.address === configuredLanIp)?.address ??
          candidates[0]?.address;
        if (selected) {
          onChange({ lanAppIp: selected, customLanIp: '' });
        }
      }}
    >
      {candidates.length === 1 ? 'Gefundene Host-Adresse verwenden' : 'Aus Liste wählen'}
    </button>
  {/if}
{/if}
