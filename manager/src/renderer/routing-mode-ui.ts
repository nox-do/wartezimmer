import type { RoutingMode, RoutingModeCapabilities } from '../shared/host-status.js';

export type RoutingModeUiState = {
  routingMode: RoutingMode;
  complexRoutingLicensed: boolean;
  busy?: boolean;
};

export function formatRoutingModeError(
  input: { code?: string; error: string; details?: Record<string, unknown> },
): string {
  if (input.code === 'ROUTING_MODE_CHANGE_BLOCKED') {
    const count = Number(input.details?.activeJourneyVisitCount ?? 0);
    if (count > 0) {
      return `Wechsel nicht möglich: ${count} Besuch${count === 1 ? '' : 'e'} mit aktiver Journey.`;
    }
  }
  if (input.code === 'COMPLEX_ROUTING_NOT_LICENSED') {
    return 'Complex Routing ist in Ihrer Lizenz nicht enthalten.';
  }
  if (input.error === 'Praxis Flow App ist nicht erreichbar (Port 8080).') {
    return 'Praxis Flow läuft nicht — Stack starten oder später erneut versuchen.';
  }
  return input.error;
}

export function renderRoutingModePanel(
  host: HTMLElement,
  state: RoutingModeUiState,
  callbacks: {
    disabled?: boolean;
    onChange: (routingMode: RoutingMode) => void;
  },
): void {
  host.replaceChildren();

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'routing-mode-fieldset wizard-fieldset';
  fieldset.disabled = Boolean(state.busy || callbacks.disabled);

  const options: Array<{
    value: RoutingMode;
    label: string;
    hint: string;
    pro?: boolean;
    disabled?: boolean;
  }> = [
    {
      value: 'simple',
      label: 'Simple',
      hint: 'Topics → Standard-Aufrufziel, kein Journey-Designer.',
    },
    {
      value: 'complex',
      label: 'Complex',
      hint: 'Journeys und Mixed Routing pro Topic.',
      pro: !state.complexRoutingLicensed,
      disabled: !state.complexRoutingLicensed,
    },
  ];

  for (const option of options) {
    const label = document.createElement('label');
    label.className = 'wizard-radio routing-mode-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'routing-mode';
    input.value = option.value;
    input.checked = state.routingMode === option.value;
    input.disabled = Boolean(option.disabled || callbacks.disabled || state.busy);
    input.addEventListener('change', () => {
      if (input.checked) {
        callbacks.onChange(option.value);
      }
    });

    const text = document.createElement('span');
    text.className = 'routing-mode-option-text';
    text.append(document.createTextNode(option.label));
    if (option.pro) {
      const badge = document.createElement('span');
      badge.className = 'routing-mode-pro-badge';
      badge.textContent = 'Pro';
      text.append(document.createTextNode(' '), badge);
    }

    const hint = document.createElement('span');
    hint.className = 'routing-mode-option-hint';
    hint.textContent = option.hint;

    label.append(input, text, hint);
    fieldset.append(label);
  }

  if (!state.complexRoutingLicensed) {
    const licenseHint = document.createElement('p');
    licenseHint.className = 'wizard-hint';
    licenseHint.textContent =
      'Complex Routing erfordert eine Pro-Lizenz. Simple ist der Standard für normale Praxen.';
    fieldset.append(licenseHint);
  }

  host.append(fieldset);
}

export function routingModeFromCapabilities(
  capabilities: RoutingModeCapabilities,
): RoutingModeUiState {
  return {
    routingMode: capabilities.routingMode,
    complexRoutingLicensed: capabilities.features.complexRoutingLicensed,
  };
}
