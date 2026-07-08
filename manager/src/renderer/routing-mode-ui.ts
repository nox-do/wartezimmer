import type { RoutingMode, RoutingModeCapabilities } from '../shared/host-status.js';

export type RoutingModeUiState = {
  routingMode: RoutingMode;
  complexRoutingLicensed: boolean;
  busy?: boolean;
};

export type RoutingModePanelContext = 'wizard' | 'maintenance';

export const ROUTING_MODE_WIZARD_INTRO_LEAD = 'Wohin soll der Patient nach dem Check-in?';
export const ROUTING_MODE_WIZARD_INTRO_DETAIL =
  'Praxis Flow steuert den Weg vom Terminal über Wartezimmer und Aufruf bis zum Zielraum. Wählen Sie, wie detailliert Sie diese Wege konfigurieren möchten.';
export const ROUTING_MODE_WIZARD_FOOTNOTE =
  'Der Modus gilt praxisweit. Simple ist der Standard und lässt sich jederzeit in den IT-Einstellungen anpassen.';
export const ROUTING_MODE_MAINTENANCE_FOOTNOTE =
  'Modus gilt praxisweit. Änderbar in den IT-Einstellungen. Wechsel blockiert bei aktiven Patientenwegen.';

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

function routingModeOptions(
  context: RoutingModePanelContext,
  complexRoutingLicensed: boolean,
): Array<{
  value: RoutingMode;
  label: string;
  hint: string;
  recommended?: boolean;
  pro?: boolean;
  disabled?: boolean;
}> {
  if (context === 'wizard') {
    return [
      {
        value: 'simple',
        label: 'Simple Routing',
        hint: 'Pro Anliegen (Topic) legen Sie ein Standard-Ziel fest — z. B. „Blutabnahme → Labor“. Kein Journey-Designer, schneller Start.',
        recommended: true,
      },
      {
        value: 'complex',
        label: 'Complex Routing',
        hint: 'Pro Anliegen können Sie eine Journey mit mehreren Schritten definieren — z. B. Check-in → Labor → Warten → Behandlungszimmer. Sinnvoll bei MVZ, Diagnostik oder wiederkehrenden Mehrschritt-Abläufen.',
        pro: !complexRoutingLicensed,
        disabled: !complexRoutingLicensed,
      },
    ];
  }

  return [
    {
      value: 'simple',
      label: 'Simple Routing',
      hint: 'Pro Anliegen (Topic) ein Standard-Ziel — z. B. „Blutabnahme → Labor“. Kein Journey-Designer.',
      recommended: true,
    },
    {
      value: 'complex',
      label: 'Complex Routing',
      hint: 'Journey mit mehreren Schritten — z. B. Check-in → Labor → Warten → Behandlungszimmer. Für MVZ/Diagnostik.',
      pro: !complexRoutingLicensed,
      disabled: !complexRoutingLicensed,
    },
  ];
}

export function renderRoutingModePanel(
  host: HTMLElement,
  state: RoutingModeUiState,
  callbacks: {
    context?: RoutingModePanelContext;
    disabled?: boolean;
    onChange: (routingMode: RoutingMode) => void;
  },
): void {
  const context = callbacks.context ?? 'maintenance';
  host.replaceChildren();

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'routing-mode-card-fieldset';
  fieldset.disabled = Boolean(state.busy || callbacks.disabled);

  const options = routingModeOptions(context, state.complexRoutingLicensed);

  for (const option of options) {
    const card = document.createElement('label');
    card.className = 'routing-mode-card';
    if (state.routingMode === option.value) {
      card.classList.add('is-selected');
    }
    if (option.disabled) {
      card.classList.add('is-disabled');
    }

    const input = document.createElement('input');
    input.type = 'radio';
    input.className = 'routing-mode-card-input';
    input.name = 'routing-mode';
    input.value = option.value;
    input.checked = state.routingMode === option.value;
    input.disabled = Boolean(option.disabled || callbacks.disabled || state.busy);
    input.addEventListener('change', () => {
      if (input.checked) {
        callbacks.onChange(option.value);
      }
    });

    const body = document.createElement('span');
    body.className = 'routing-mode-card-body';

    const head = document.createElement('span');
    head.className = 'routing-mode-card-head';

    const title = document.createElement('span');
    title.className = 'routing-mode-card-title';
    title.textContent = option.label;
    head.append(title);

    if (option.recommended) {
      const badge = document.createElement('span');
      badge.className = 'routing-mode-recommended-badge';
      badge.textContent = 'empfohlen';
      head.append(badge);
    }
    if (option.pro) {
      const badge = document.createElement('span');
      badge.className = 'routing-mode-pro-badge';
      badge.textContent = 'Pro';
      head.append(badge);
    }

    const hint = document.createElement('span');
    hint.className = 'routing-mode-card-hint';
    hint.textContent = option.hint;

    body.append(head, hint);
    card.append(input, body);
    fieldset.append(card);
  }

  if (!state.complexRoutingLicensed) {
    const licenseHint = document.createElement('p');
    licenseHint.className = 'wizard-hint';
    licenseHint.textContent =
      'Complex Routing erfordert eine Pro-Lizenz. Simple ist der Standard für normale Praxen.';
    fieldset.append(licenseHint);
  }

  host.append(fieldset);

  const footnoteText =
    context === 'wizard' ? ROUTING_MODE_WIZARD_FOOTNOTE : ROUTING_MODE_MAINTENANCE_FOOTNOTE;
  const footnote = document.createElement('p');
  footnote.className = 'wizard-hint routing-mode-footnote';
  footnote.textContent = footnoteText;
  host.append(footnote);
}

export function routingModeFromCapabilities(
  capabilities: RoutingModeCapabilities,
): RoutingModeUiState {
  return {
    routingMode: capabilities.routingMode,
    complexRoutingLicensed: capabilities.features.complexRoutingLicensed,
  };
}
