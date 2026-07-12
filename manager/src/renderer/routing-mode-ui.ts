import type { RoutingMode } from '../shared/host-status.js';

export type RoutingModePanelContext = 'wizard' | 'maintenance';

export const ROUTING_MODE_WIZARD_INTRO_LEAD = 'Wohin soll der Patient nach dem Check-in?';
export const ROUTING_MODE_WIZARD_INTRO_DETAIL =
  'Praxis Flow steuert den Weg vom Terminal über Wartezimmer und Aufruf bis zum Zielraum. Wählen Sie, wie detailliert Sie diese Wege konfigurieren möchten.';
export const ROUTING_MODE_WIZARD_FOOTNOTE =
  'Der Modus gilt praxisweit. Simple ist der Standard und lässt sich jederzeit in den IT-Einstellungen anpassen.';

export function formatRoutingModeMaintenanceFootnote(openVisitCount: number): string {
  if (openVisitCount <= 0) {
    return 'Modus gilt praxisweit. Wechsel nur möglich, wenn keine Wartenummern aktiv sind.';
  }
  const label = openVisitCount === 1 ? 'Wartenummer' : 'Wartenummern';
  return `Modus gilt praxisweit. Wechsel gesperrt: ${openVisitCount} ${label} noch aktiv.`;
}

export function formatRoutingModeError(input: {
  code?: string;
  error: string;
  details?: Record<string, unknown>;
}): string {
  if (input.code === 'ROUTING_MODE_CHANGE_BLOCKED') {
    const count = Number(
      input.details?.openVisitCount ?? input.details?.activeJourneyVisitCount ?? 0,
    );
    if (count > 0) {
      const label = count === 1 ? 'Wartenummer' : 'Wartenummern';
      return `Wechsel nicht möglich: ${count} ${label} noch aktiv.`;
    }
    return 'Wechsel nicht möglich: Es sind noch Wartenummern aktiv.';
  }
  if (input.code === 'COMPLEX_ROUTING_NOT_LICENSED') {
    return 'Complex Routing ist in Ihrer Lizenz nicht enthalten.';
  }
  if (input.error === 'Praxis Flow App ist nicht erreichbar (Port 8080).') {
    return 'Praxis Flow läuft nicht — Stack starten oder später erneut versuchen.';
  }
  return input.error;
}

export type RoutingModeOption = {
  value: RoutingMode;
  label: string;
  hint: string;
  recommended?: boolean;
  pro?: boolean;
  disabled?: boolean;
};

export function buildRoutingModeOptions(
  context: RoutingModePanelContext,
  complexRoutingLicensed: boolean,
  openVisitCount = 0,
  currentMode: RoutingMode | null = null,
): RoutingModeOption[] {
  const changeBlocked = openVisitCount > 0;

  const optionDisabled = (value: RoutingMode, extra = false): boolean =>
    extra ||
    (changeBlocked && currentMode != null && value !== currentMode) ||
    (changeBlocked && currentMode == null);

  if (context === 'wizard') {
    return [
      {
        value: 'simple',
        label: 'Simple Routing',
        hint: 'Pro Anliegen (Topic) legen Sie ein Standard-Ziel fest — z. B. „Blutabnahme → Labor“. Kein Journey-Designer, schneller Start.',
        recommended: true,
        disabled: optionDisabled('simple'),
      },
      {
        value: 'complex',
        label: 'Complex Routing',
        hint: 'Pro Anliegen können Sie eine Journey mit mehreren Schritten definieren — z. B. Check-in → Labor → Warten → Behandlungszimmer. Sinnvoll bei MVZ, Diagnostik oder wiederkehrenden Mehrschritt-Abläufen.',
        pro: !complexRoutingLicensed,
        disabled: optionDisabled('complex', !complexRoutingLicensed),
      },
    ];
  }

  return [
    {
      value: 'simple',
      label: 'Simple Routing',
      hint: 'Pro Anliegen (Topic) ein Standard-Ziel — z. B. „Blutabnahme → Labor“. Kein Journey-Designer.',
      recommended: true,
      disabled: optionDisabled('simple'),
    },
    {
      value: 'complex',
      label: 'Complex Routing',
      hint: 'Journey mit mehreren Schritten — z. B. Check-in → Labor → Warten → Behandlungszimmer. Für MVZ/Diagnostik.',
      pro: !complexRoutingLicensed,
      disabled: optionDisabled('complex', !complexRoutingLicensed),
    },
  ];
}
