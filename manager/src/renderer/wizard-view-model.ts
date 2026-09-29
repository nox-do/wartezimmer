import { wizardIsBusy, wizardProgress } from './wizard-controller.js';
import type { ApplySetupResult } from '../shared/host-status.js';
import {
  canLeaveWizardStep1,
  wizardCompletionLead,
  wizardUsesExistingTlsConfiguration,
  type WizardStep,
} from './wizard-flow.js';
import type { WizardControllerState } from './wizard-controller.js';

export function wizardCheckMark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function wizardIsCompleted(state: WizardControllerState): boolean {
  return (
    state.step === 8 &&
    (Boolean(state.applyResult) || wizardUsesExistingTlsConfiguration(state.status))
  );
}

export function wizardBackHidden(state: WizardControllerState): boolean {
  if (state.step <= 1) {
    return true;
  }
  if (wizardIsCompleted(state)) {
    return true;
  }
  return false;
}

export function wizardNextButtonLabel(state: WizardControllerState): string {
  if (state.step === 5) {
    if (wizardUsesExistingTlsConfiguration(state.status)) {
      return 'Bestehende Einrichtung prüfen';
    }
    return 'Vorschau laden';
  }
  if (state.step === 7) {
    return wizardUsesExistingTlsConfiguration(state.status) ? 'Abschließen' : 'Anwenden';
  }
  if (state.step === 8) {
    if (state.applyResult) {
      return 'Zum Status';
    }
    return wizardIsBusy(state) ? 'Bitte warten …' : 'Anwenden';
  }
  return 'Weiter';
}

export function wizardNextButtonDisabled(state: WizardControllerState): boolean {
  if (wizardIsBusy(state)) {
    return true;
  }
  if (state.step === 1) {
    return !canLeaveWizardStep1(state.status, wizardIsBusy(state));
  }
  if (state.step === 8) {
    return Boolean(state.applyResult);
  }
  return false;
}

export function wizardCompletionItSettingsUrl(state: WizardControllerState): string | null {
  return state.status?.deviceUrls?.opsSetup ?? state.plan?.deviceUrls.opsSetup ?? null;
}

export function wizardApplyResultItems(result: ApplySetupResult): string[] {
  const composeOk = result.compose?.ok === true;
  return ['✓ Konfiguration gespeichert', `${wizardCheckMark(composeOk)} Docker Compose`];
}

export function wizardCompletionLeadText(state: WizardControllerState): string {
  if (!state.status || wizardProgress(state)) {
    return 'Host-Einrichtung wird abgeschlossen …';
  }
  return wizardCompletionLead(state.status.probes);
}

export function wizardStepTitle(step: WizardStep): string {
  switch (step) {
    case 1:
      return 'Voraussetzungen';
    case 3:
      return 'Import & Export';
    case 5:
      return 'Zugriff im Praxisnetz';
    case 7:
      return 'Zusammenfassung – interner Betrieb';
    case 8:
      return 'Abschluss';
  }
}
