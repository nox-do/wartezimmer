import type { HostStatus, NetworkSnapshot } from '../shared/host-status.js';
import { resolvedLanIp } from './wizard-state.js';

export type LanIpFieldState = {
  lanAppIp: string;
  customLanIp: string;
};

export type GatewayFieldState = {
  gatewayEnabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string;
  authBridgeUrl: string;
};

function appendHint(host: HTMLElement, text: string, className = 'wizard-hint'): void {
  const hint = document.createElement('p');
  hint.className = className;
  hint.textContent = text;
  host.append(hint);
}

function appendGatewayWizardIntro(host: HTMLElement): void {
  const block = document.createElement('div');
  block.className = 'wizard-gateway-intro';

  const heading = document.createElement('p');
  const headingStrong = document.createElement('strong');
  headingStrong.textContent = 'Wofür ist dieser Schritt?';
  heading.append(headingStrong);
  block.append(heading);

  const lead = document.createElement('p');
  lead.textContent =
    'Sie entscheiden, ob Praxis Flow Einstellungen für ein Gast-WLAN mit Captive Portal vorbereiten soll.';
  block.append(lead);

  const list = document.createElement('ul');
  list.className = 'wizard-gateway-intro-list';

  const offItem = document.createElement('li');
  const offStrong = document.createElement('strong');
  offStrong.textContent = 'Aus:';
  offItem.append(offStrong, document.createTextNode(' Kein Gast-WLAN — Normalfall für den Start.'));
  list.append(offItem);

  const onItem = document.createElement('li');
  const onStrong = document.createElement('strong');
  onStrong.textContent = 'An:';
  onItem.append(
    onStrong,
    document.createTextNode(
      ' Werte für Gateway und Portal-URL werden gespeichert; Router und ggf. Gateway-Hardware richtet die IT separat ein.',
    ),
  );
  list.append(onItem);

  block.append(list);

  const portalNote = document.createElement('p');
  portalNote.textContent =
    'Das Patientenportal selbst aktivieren Sie später in Praxis Flow (Betrieb).';
  block.append(portalNote);

  host.append(block);
}

function appendStatusRow(
  host: HTMLElement,
  label: string,
  value: string,
  tone: 'ok' | 'warn' | null,
): void {
  const row = document.createElement('div');
  row.className = 'lan-ip-status-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'lan-ip-status-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'lan-ip-status-value';
  valueEl.textContent = value;

  row.append(labelEl, valueEl);

  if (tone === 'ok') {
    const badge = document.createElement('span');
    badge.className = 'lan-ip-status-badge lan-ip-status-badge-ok';
    badge.textContent = 'stimmt überein';
    row.append(badge);
  } else if (tone === 'warn') {
    const badge = document.createElement('span');
    badge.className = 'lan-ip-status-badge lan-ip-status-badge-warn';
    badge.textContent = 'abweichend';
    row.append(badge);
  }

  host.append(row);
}

function renderLanIpStatusSummary(
  host: HTMLElement,
  status: HostStatus | null,
  candidates: NetworkSnapshot['lanCandidates'],
): void {
  const configured = status?.network.configuredLanIp?.trim();
  const stale = status?.network.lanIpStale ?? false;
  const hasEnv = Boolean(status?.envExists && configured);

  if (!hasEnv && candidates.length === 0) {
    return;
  }

  const block = document.createElement('div');
  block.className = 'lan-ip-status';

  if (hasEnv && configured) {
    appendStatusRow(block, 'In .env', configured, stale ? 'warn' : null);
  }

  if (candidates.length > 0) {
    const hostSummary = candidates.map((candidate) => candidate.label).join(' · ');
    const matches = Boolean(configured && candidates.some((c) => c.address === configured));
    appendStatusRow(block, 'Host jetzt', hostSummary, stale ? 'warn' : matches ? 'ok' : null);
  } else if (hasEnv) {
    appendStatusRow(block, 'Host jetzt', 'keine LAN-Adresse erkannt', 'warn');
  }

  if (stale && configured) {
    appendHint(
      block,
      'Die .env-IP passt zu keiner aktuellen Host-Adresse — unten die richtige IP wählen und übernehmen.',
      'lan-ip-status-hint',
    );
  }

  host.append(block);
}

function renderLanIpCandidateRadios(
  host: HTMLElement,
  options: {
    state: LanIpFieldState;
    candidates: NetworkSnapshot['lanCandidates'];
    disabled: boolean;
    radioName: string;
    onChange: (patch: Partial<LanIpFieldState>) => void;
    onRerender?: () => void;
  },
): void {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'wizard-fieldset';

  for (const candidate of options.candidates) {
    const label = document.createElement('label');
    label.className = 'wizard-radio';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = options.radioName;
    input.value = candidate.address;
    input.checked = options.state.lanAppIp === candidate.address;
    input.disabled = options.disabled;
    input.addEventListener('change', () => {
      options.onChange({ lanAppIp: candidate.address, customLanIp: '' });
      options.onRerender?.();
    });

    const text = document.createElement('span');
    text.textContent = candidate.label;

    label.append(input, text);
    fieldset.append(label);
  }

  host.append(fieldset);
}

/** Manual LAN IP is only needed when auto-detection is ambiguous or insufficient. */
export function shouldOfferManualLanIpEntry(
  candidateCount: number,
  lanIpStale: boolean,
): boolean {
  if (candidateCount === 0) {
    return true;
  }
  if (candidateCount > 1) {
    return true;
  }
  return lanIpStale;
}

export function renderLanIpPanel(
  host: HTMLElement,
  options: {
    state: LanIpFieldState;
    network: NetworkSnapshot | null;
    status: HostStatus | null;
    disabled: boolean;
    variant?: 'wizard' | 'maintenance';
    radioName?: string;
    onChange: (patch: Partial<LanIpFieldState>) => void;
    onRerender?: () => void;
  },
): void {
  host.replaceChildren();

  const variant = options.variant ?? 'wizard';
  const radioName = options.radioName ?? 'lan-ip-choice';
  const configuredLanIp = options.status?.network.configuredLanIp?.trim();
  const stale = options.status?.network.lanIpStale ?? false;
  const candidates = options.network?.lanCandidates ?? [];
  const useCustom = options.state.lanAppIp === '__custom__';
  const offerManualEntry = shouldOfferManualLanIpEntry(candidates.length, stale);

  if (variant === 'maintenance') {
    renderLanIpStatusSummary(host, options.status, candidates);
  } else if (stale && configuredLanIp) {
    appendHint(
      host,
      `Die konfigurierte IP (${configuredLanIp}) passt nicht zu einer aktuellen Host-Adresse — bitte aktualisieren.`,
    );
  }

  if (!useCustom) {
    if (candidates.length > 0) {
      const prompt = document.createElement('p');
      prompt.className = 'lan-ip-prompt';
      prompt.textContent =
        candidates.length === 1
          ? 'Eine Host-Adresse gefunden — für Geräte-URLs verwenden:'
          : 'Host-Adresse wählen, unter der Terminal, TV und MFA die app erreichen:';
      host.append(prompt);

      renderLanIpCandidateRadios(host, {
        state: options.state,
        candidates,
        disabled: options.disabled,
        radioName,
        onChange: options.onChange,
        onRerender: options.onRerender,
      });
    } else {
      appendHint(host, 'Keine LAN-Adresse am Host erkannt — bitte IP manuell eingeben.');
    }

    if (offerManualEntry) {
      const customBtn = document.createElement('button');
      customBtn.type = 'button';
      customBtn.className = 'btn-link lan-ip-custom-trigger';
      customBtn.textContent = 'Andere IP eingeben …';
      customBtn.disabled = options.disabled;
      customBtn.addEventListener('click', () => {
        options.onChange({
          lanAppIp: '__custom__',
          customLanIp: options.state.customLanIp || configuredLanIp || '',
        });
        options.onRerender?.();
      });
      host.append(customBtn);
    }
  } else {
    const customLabel = document.createElement('label');
    customLabel.className = 'wizard-field-label';
    customLabel.textContent = 'LAN-IP (manuell)';
    host.append(customLabel);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'wizard-input';
    customInput.placeholder = '192.168.1.50';
    customInput.value = options.state.customLanIp;
    customInput.disabled = options.disabled;
    customInput.addEventListener('input', () => {
      options.onChange({ customLanIp: customInput.value });
    });
    host.append(customInput);

    if (candidates.length > 0) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'btn-link lan-ip-custom-trigger';
      backBtn.textContent =
        candidates.length === 1 ? 'Gefundene Host-Adresse verwenden' : 'Aus Liste wählen';
      backBtn.disabled = options.disabled;
      backBtn.addEventListener('click', () => {
        const selected =
          candidates.find((c) => c.address === options.state.customLanIp.trim())?.address ??
          candidates.find((c) => c.address === configuredLanIp)?.address ??
          candidates[0]?.address;
        if (selected) {
          options.onChange({ lanAppIp: selected, customLanIp: '' });
        }
        options.onRerender?.();
      });
      host.append(backBtn);
    }
  }
}

export function renderGatewayPanel(
  host: HTMLElement,
  options: {
    state: GatewayFieldState;
    network: NetworkSnapshot | null;
    status: HostStatus | null;
    lanIpFallback: string;
    disabled: boolean;
    radioName: string;
    showIntro?: boolean;
    onChange: (patch: Partial<GatewayFieldState>) => void;
    onRerender?: () => void;
  },
): void {
  host.replaceChildren();

  if (options.showIntro !== false) {
    appendGatewayWizardIntro(host);
  }

  const enableLabel = document.createElement('label');
  enableLabel.className = 'wizard-radio';
  const enableInput = document.createElement('input');
  enableInput.type = 'checkbox';
  enableInput.checked = options.state.gatewayEnabled;
  enableInput.disabled = options.disabled;
  enableInput.addEventListener('change', () => {
    const enabled = enableInput.checked;
    options.onChange({
      gatewayEnabled: enabled,
      portalAppIp:
        enabled && !options.state.portalAppIp.trim()
          ? options.lanIpFallback
          : options.state.portalAppIp,
      authBridgeUrl:
        enabled && !options.state.authBridgeUrl.trim()
          ? options.network?.defaultGatewayBridgeUrl ?? ''
          : options.state.authBridgeUrl,
    });
    options.onRerender?.();
  });
  const enableText = document.createElement('span');
  enableText.textContent =
    'Gast-WLAN vorbereiten (Captive-Portal-Einstellungen in der Host-Konfiguration speichern)';
  enableLabel.append(enableInput, enableText);
  host.append(enableLabel);

  const composeSupported = options.network?.gatewayComposeSupported ?? true;
  if (options.state.gatewayEnabled && !composeSupported) {
    appendHint(
      host,
      'Hinweis: Auf diesem Rechner (macOS/Windows) startet kein Gateway-Dienst. Die Werte werden nur in die Konfiguration geschrieben — für ein separates Linux-Gateway oder den späteren Feldtest.',
    );
  }

  if (options.state.gatewayEnabled) {
    const ifaceHint = document.createElement('p');
    ifaceHint.className = 'wizard-hint';
    ifaceHint.textContent =
      'Netzwerk-Schnittstelle am Gateway-Rechner für das Gast-Netz (z. B. eth1). Darüber laufen DHCP und Captive Portal. Ihre IT leitet den Gast-WLAN-Traffic dorthin.';
    host.append(ifaceHint);

    const ifaceFieldset = document.createElement('fieldset');
    ifaceFieldset.className = 'wizard-fieldset';

    const interfaceNames = new Set<string>();
    for (const iface of options.network?.interfaces ?? []) {
      interfaceNames.add(iface.name);
      const label = document.createElement('label');
      label.className = 'wizard-radio';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = options.radioName;
      input.value = iface.name;
      input.checked = options.state.gatewayInterface === iface.name;
      input.disabled = options.disabled;
      input.addEventListener('change', () => {
        options.onChange({ gatewayInterface: iface.name });
        options.onRerender?.();
      });
      const addrs = iface.addresses.map((a) => a.address).join(', ');
      const text = document.createElement('span');
      text.textContent = `${iface.name} — ${addrs || 'keine IPv4'}`;
      label.append(input, text);
      ifaceFieldset.append(label);
    }

    if (!interfaceNames.has('eth1')) {
      const eth1Label = document.createElement('label');
      eth1Label.className = 'wizard-radio';
      const eth1Input = document.createElement('input');
      eth1Input.type = 'radio';
      eth1Input.name = options.radioName;
      eth1Input.value = 'eth1';
      eth1Input.checked = options.state.gatewayInterface === 'eth1';
      eth1Input.disabled = options.disabled;
      eth1Input.addEventListener('change', () => {
        options.onChange({ gatewayInterface: 'eth1' });
        options.onRerender?.();
      });
      const eth1Text = document.createElement('span');
      eth1Text.textContent = 'eth1 (Standard, manuell)';
      eth1Label.append(eth1Input, eth1Text);
      ifaceFieldset.append(eth1Label);
    }

    if (
      options.state.gatewayInterface &&
      !interfaceNames.has(options.state.gatewayInterface) &&
      options.state.gatewayInterface !== 'eth1'
    ) {
      const customLabel = document.createElement('label');
      customLabel.className = 'wizard-radio';
      const customInput = document.createElement('input');
      customInput.type = 'radio';
      customInput.name = options.radioName;
      customInput.value = options.state.gatewayInterface;
      customInput.checked = true;
      customInput.disabled = options.disabled;
      customInput.addEventListener('change', () => {
        options.onChange({ gatewayInterface: options.state.gatewayInterface });
        options.onRerender?.();
      });
      const customText = document.createElement('span');
      customText.textContent = `${options.state.gatewayInterface} (aus .env)`;
      customLabel.append(customInput, customText);
      ifaceFieldset.append(customLabel);
    }

    host.append(ifaceFieldset);

    const gwIpLabel = document.createElement('label');
    gwIpLabel.className = 'wizard-field-label';
    gwIpLabel.textContent = 'IP des Gateways im Gast-Netz';
    host.append(gwIpLabel);

    const gwIpInput = document.createElement('input');
    gwIpInput.type = 'text';
    gwIpInput.className = 'wizard-input';
    gwIpInput.placeholder = '192.168.88.1';
    gwIpInput.value = options.state.gatewayIp;
    gwIpInput.disabled = options.disabled;
    gwIpInput.addEventListener('input', () => {
      options.onChange({ gatewayIp: gwIpInput.value });
    });
    host.append(gwIpInput);

    const portalIpLabel = document.createElement('label');
    portalIpLabel.className = 'wizard-field-label';
    portalIpLabel.textContent = 'IP der Praxis-App für Patienten im Gast-WLAN';
    host.append(portalIpLabel);

    const portalIpInput = document.createElement('input');
    portalIpInput.type = 'text';
    portalIpInput.className = 'wizard-input';
    portalIpInput.placeholder = options.lanIpFallback || '192.168.1.50';
    portalIpInput.value = options.state.portalAppIp;
    portalIpInput.disabled = options.disabled;
    portalIpInput.addEventListener('input', () => {
      options.onChange({ portalAppIp: portalIpInput.value });
    });
    host.append(portalIpInput);

    const bridgeUrlLabel = document.createElement('label');
    bridgeUrlLabel.className = 'wizard-field-label';
    bridgeUrlLabel.textContent = 'Adresse der Gateway-Bridge für die app';
    host.append(bridgeUrlLabel);

    const bridgeUrlInput = document.createElement('input');
    bridgeUrlInput.type = 'text';
    bridgeUrlInput.className = 'wizard-input';
    bridgeUrlInput.placeholder =
      options.network?.defaultGatewayBridgeUrl ?? 'http://<gateway-host>:9100';
    bridgeUrlInput.value = options.state.authBridgeUrl;
    bridgeUrlInput.disabled = options.disabled;
    bridgeUrlInput.addEventListener('input', () => {
      options.onChange({ authBridgeUrl: bridgeUrlInput.value });
    });
    host.append(bridgeUrlInput);

    appendHint(
      host,
      'Die app ruft diese Adresse auf, um nach gültiger Wartenummer die Internetfreigabe am Gateway auszulösen. Bei separatem Linux-Gateway muss hier dessen aus der app erreichbare Bridge-Adresse stehen.',
    );

    appendHint(
      host,
      'Was der Wizard hier macht: Er trägt die technischen Werte in die Host-Konfiguration ein. Was noch fehlt: Access Point / Gast-WLAN in der Praxis, Routing zum Gateway und — falls nötig — das Linux-Gateway-Gerät. Details: Dokumentation „Guest-WLAN & Captive Portal“.',
    );
  }
}

export function hostNetworkChanged(
  fields: LanIpFieldState & GatewayFieldState,
  status: HostStatus | null,
): boolean {
  if (!status) {
    return false;
  }
  const lanIp = resolvedLanIp(fields);
  const configuredLan = status.network.configuredLanIp?.trim() ?? '';
  if (lanIp && lanIp !== configuredLan) {
    return true;
  }

  const gateway = status.gateway;
  if (fields.gatewayEnabled !== (gateway?.enabled ?? false)) {
    return true;
  }
  if (!fields.gatewayEnabled) {
    return false;
  }
  if (fields.gatewayInterface.trim() !== (gateway?.gatewayInterface ?? 'eth1')) {
    return true;
  }
  if (fields.gatewayIp.trim() !== (gateway?.gatewayIp ?? '192.168.88.1')) {
    return true;
  }
  if (fields.authBridgeUrl.trim() !== (gateway?.authBridgeUrl ?? '').trim()) {
    return true;
  }
  const portalIp = fields.portalAppIp.trim() || lanIp;
  const configuredPortal = gateway?.portalAppIp?.trim() ?? configuredLan;
  return portalIp !== configuredPortal;
}
