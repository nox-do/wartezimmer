import type { RoutingMode } from '../shared/host-status.js';

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
): RoutingModeOption[] {
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
