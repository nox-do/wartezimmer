<script lang="ts">
  import type { NetworkSnapshot } from '../shared/host-status.js';
  import type { GatewayFieldState } from './host-network-panels.js';
  import { gatewayEnabledPatch } from './wizard-state.js';

  let {
    state,
    network,
    lanIpFallback,
    disabled = false,
    showIntro = false,
    radioName = 'network-gateway-interface',
    idPrefix = 'network',
    onChange,
  }: {
    state: GatewayFieldState;
    network: NetworkSnapshot | null;
    lanIpFallback: string;
    disabled?: boolean;
    showIntro?: boolean;
    radioName?: string;
    idPrefix?: string;
    onChange: (patch: Partial<GatewayFieldState>) => void;
  } = $props();

  const gatewayIpId = $derived(`${idPrefix}-gateway-ip`);
  const portalIpId = $derived(`${idPrefix}-portal-ip`);
  const authBridgeUrlId = $derived(`${idPrefix}-auth-bridge-url`);

  const composeSupported = $derived(network?.gatewayComposeSupported ?? true);
  const interfaceNames = $derived(new Set((network?.interfaces ?? []).map((iface) => iface.name)));
  const showCustomInterface = $derived(
    Boolean(
      state.gatewayInterface &&
        !interfaceNames.has(state.gatewayInterface) &&
        state.gatewayInterface !== 'eth1',
    ),
  );
</script>

{#if showIntro}
  <div class="wizard-gateway-intro">
    <p><strong>Wofür ist dieser Schritt?</strong></p>
    <p>
      Sie entscheiden, ob Praxis Flow Einstellungen für ein Gast-WLAN mit Captive Portal vorbereiten
      soll.
    </p>
    <ul class="wizard-gateway-intro-list">
      <li><strong>Aus:</strong> Kein Gast-WLAN — Normalfall für den Start.</li>
      <li>
        <strong>An:</strong> Werte für Gateway und Portal-URL werden gespeichert; Router und ggf.
        Gateway-Hardware richtet die IT separat ein.
      </li>
    </ul>
    <p>Das Patientenportal selbst aktivieren Sie später in Praxis Flow (Betrieb).</p>
  </div>
{/if}

<label class="wizard-radio">
  <input
    type="checkbox"
    checked={state.gatewayEnabled}
    {disabled}
    onchange={(event) => {
      const enabled = event.currentTarget.checked;
      onChange(gatewayEnabledPatch(state, enabled, network, lanIpFallback));
    }}
  />
  <span>Gast-WLAN vorbereiten (Captive-Portal-Einstellungen in der Host-Konfiguration speichern)</span>
</label>

{#if state.gatewayEnabled && !composeSupported}
  <p class="hint">
    Hinweis: Auf diesem Rechner (macOS/Windows) startet kein Gateway-Dienst. Die Werte werden nur in
    die Konfiguration geschrieben — für ein separates Linux-Gateway oder den späteren Feldtest.
  </p>
{/if}

{#if state.gatewayEnabled}
  <p class="hint">
    Netzwerk-Schnittstelle am Gateway-Rechner für das Gast-Netz (z. B. eth1). Darüber laufen DHCP und
    Captive Portal. Ihre IT leitet den Gast-WLAN-Traffic dorthin.
  </p>

  <fieldset class="wizard-fieldset">
    {#each network?.interfaces ?? [] as iface (iface.name)}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value={iface.name}
          checked={state.gatewayInterface === iface.name}
          {disabled}
          onchange={() => onChange({ gatewayInterface: iface.name })}
        />
        <span>
          {iface.name} — {iface.addresses.map((a) => a.address).join(', ') || 'keine IPv4'}
        </span>
      </label>
    {/each}

    {#if !interfaceNames.has('eth1')}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value="eth1"
          checked={state.gatewayInterface === 'eth1'}
          {disabled}
          onchange={() => onChange({ gatewayInterface: 'eth1' })}
        />
        <span>eth1 (Standard, manuell)</span>
      </label>
    {/if}

    {#if showCustomInterface}
      <label class="wizard-radio">
        <input
          type="radio"
          name={radioName}
          value={state.gatewayInterface}
          checked
          {disabled}
          onchange={() => onChange({ gatewayInterface: state.gatewayInterface })}
        />
        <span>{state.gatewayInterface} (aus .env)</span>
      </label>
    {/if}
  </fieldset>

  <label class="wizard-field-label" for={gatewayIpId}>IP des Gateways im Gast-Netz</label>
  <input
    id={gatewayIpId}
    type="text"
    class="wizard-input"
    placeholder="192.168.88.1"
    value={state.gatewayIp}
    {disabled}
    oninput={(event) => onChange({ gatewayIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for={portalIpId}>IP der Praxis-App für Patienten im Gast-WLAN</label>
  <input
    id={portalIpId}
    type="text"
    class="wizard-input"
    placeholder={lanIpFallback || '192.168.1.50'}
    value={state.portalAppIp}
    {disabled}
    oninput={(event) => onChange({ portalAppIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for={authBridgeUrlId}>Adresse der Gateway-Bridge für die app</label>
  <input
    id={authBridgeUrlId}
    type="text"
    class="wizard-input"
    placeholder={network?.defaultGatewayBridgeUrl ?? 'http://<gateway-host>:9100'}
    value={state.authBridgeUrl}
    {disabled}
    oninput={(event) => onChange({ authBridgeUrl: event.currentTarget.value })}
  />

  <p class="hint">
    Die app ruft diese Adresse auf, um nach gültiger Wartenummer die Internetfreigabe am Gateway
    auszulösen. Bei separatem Linux-Gateway muss hier dessen aus der app erreichbare Bridge-Adresse
    stehen.
  </p>

  <p class="hint">
    Was der Wizard hier macht: Er trägt die technischen Werte in die Host-Konfiguration ein. Was
    noch fehlt: Access Point / Gast-WLAN in der Praxis, Routing zum Gateway und — falls nötig — das
    Linux-Gateway-Gerät. Details: Dokumentation „Guest-WLAN & Captive Portal“.
  </p>
{/if}
