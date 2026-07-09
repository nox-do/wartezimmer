import type { ApplySetupResult } from '../shared/host-status.js';
import type { WizardStep } from './wizard-flow.js';
import { canLeaveWizardStep1, wizardCompletionLead } from './wizard-flow.js';
import type { WizardControllerState } from './wizard-controller.js';

export function wizardCheckMark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function wizardIsCompleted(state: WizardControllerState): boolean {
  return state.step === 7 && Boolean(state.applyResult);
}

export function wizardBackHidden(state: WizardControllerState): boolean {
  if (state.step <= 1) {
    return true;
  }
  if (state.step === 7 && state.applyResult) {
    return true;
  }
  return false;
}

export function wizardNextButtonLabel(state: WizardControllerState): string {
  if (state.step === 5) {
    return 'Vorschau laden';
  }
  if (state.step === 6) {
    return 'Anwenden';
  }
  if (state.step === 7) {
    return state.applyResult ? 'Zum Status' : 'Bitte warten …';
  }
  return 'Weiter';
}

export function wizardNextButtonDisabled(state: WizardControllerState): boolean {
  if (state.busy) {
    return true;
  }
  if (state.step === 3 && state.routingCapabilitiesStatus !== 'ready') {
    return true;
  }
  if (state.step === 1) {
    return !canLeaveWizardStep1(state.status, state.busy);
  }
  if (state.step === 7) {
    return !state.applyResult;
  }
  return false;
}

export function wizardCompletionItSettingsUrl(state: WizardControllerState): string | null {
  return state.status?.deviceUrls?.opsSetup ?? state.plan?.deviceUrls.opsSetup ?? null;
}

export function wizardApplyResultItems(result: ApplySetupResult): string[] {
  const composeOk = result.compose?.ok === true;
  const items = [`✓ .env geschrieben (${result.envPath})`, `${wizardCheckMark(composeOk)} Docker Compose`];
  if (result.gatewayComposeSkipped) {
    items.push(
      'Gateway-Dienst auf diesem Praxis-PC übersprungen; Werte für separates Linux-Gateway gespeichert',
    );
  }
  return items;
}

export function wizardCompletionLeadText(state: WizardControllerState): string {
  if (!state.status || state.probeStatusText) {
    return 'Host-Einrichtung wird abgeschlossen …';
  }
  return wizardCompletionLead(state.status.probes);
}

export function wizardStepTitle(step: WizardStep): string {
  switch (step) {
    case 1:
      return 'Voraussetzungen';
    case 2:
      return 'Netzwerk — LAN-IP wählen';
    case 3:
      return 'Praxis — Anzeigename';
    case 4:
      return 'Gast-WLAN (optional)';
    case 5:
      return 'Import & Export — Host-Ordner';
    case 6:
      return 'Vorschau — Geräte-URLs';
    case 7:
      return 'Abschluss';
  }
}
