import type { ApplySetupResult } from '../shared/host-status.js';
import {
  canLeaveWizardStep1,
  wizardCompletionLead,
  wizardHttpsEligible,
  wizardHttpsMailReady,
  type WizardHttpsPhase,
  type WizardStep,
} from './wizard-flow.js';
import { tlsNameValid } from './tls-identity.js';
import { tlsDnsWaitCopy, tlsLeaseBlockedByStaleLan } from './tls-network-view-model.js';
import type { WizardControllerState } from './wizard-controller.js';

export const WIZARD_HTTPS_CONTINUE_COPY =
  'Sie können die Einrichtung fortsetzen und HTTPS in den nächsten Tagen hier in der Manager-App fortsetzen.';

export function wizardHttpsDnsWaitCopy(mode: 'managed' | 'custom' | null | undefined): string {
  return tlsDnsWaitCopy(mode === 'custom' ? 'custom' : 'managed');
}

export function wizardCheckMark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function wizardIsCompleted(state: WizardControllerState): boolean {
  return state.step === 8 && Boolean(state.applyResult);
}

export function wizardBackHidden(state: WizardControllerState): boolean {
  if (state.step <= 1) {
    return true;
  }
  if (state.step === 8 && state.applyResult) {
    return true;
  }
  return false;
}

export function wizardNextButtonLabel(state: WizardControllerState): string {
  if (state.step === 5) {
    return wizardHttpsEligible(state.proxyEnabled) ? 'Weiter zu HTTPS' : 'Vorschau laden';
  }
  if (state.step === 6) {
    return state.httpsPhase === 'mail' ? 'Vorschau laden' : 'Weiter';
  }
  if (state.step === 7) {
    return 'Anwenden';
  }
  if (state.step === 8) {
    if (state.applyResult) {
      return 'Zum Status';
    }
    return state.busy ? 'Bitte warten …' : 'Anwenden';
  }
  if (state.step === 2 && state.routingCapabilitiesStatus === 'error') {
    return 'Erneut versuchen';
  }
  return 'Weiter';
}

export function wizardNextButtonDisabled(state: WizardControllerState): boolean {
  if (state.busy) {
    return true;
  }
  if (state.step === 2) {
    if (state.routingCapabilitiesStatus === 'error') {
      return false;
    }
    if (state.routingCapabilitiesStatus !== 'ready' || state.routingMode === null) {
      return true;
    }
  }
  if (state.step === 1) {
    return !canLeaveWizardStep1(state.status, state.busy);
  }
  if (state.step === 6) {
    return wizardHttpsNextDisabled(state.httpsPhase, state);
  }
  if (state.step === 8) {
    return Boolean(state.applyResult);
  }
  return false;
}

export function wizardHttpsNextDisabled(
  httpsPhase: WizardHttpsPhase,
  state: Pick<
    WizardControllerState,
    | 'nameMode'
    | 'customLabel'
    | 'customDomain'
    | 'ipv4Reserved'
    | 'mailAck'
    | 'customPemStaged'
    | 'status'
  >,
): boolean {
  if (httpsPhase === 'hostname') {
    return !tlsNameValid(state);
  }
  if (httpsPhase === 'lease') {
    return tlsLeaseBlockedByStaleLan(state.status?.network.lanIpStale) || !state.ipv4Reserved;
  }
  if (httpsPhase === 'mail') {
    return !wizardHttpsMailReady(state);
  }
  return false;
}

export function wizardCompletionItSettingsUrl(state: WizardControllerState): string | null {
  return state.status?.deviceUrls?.opsSetup ?? state.plan?.deviceUrls.opsSetup ?? null;
}

export function wizardApplyResultItems(result: ApplySetupResult): string[] {
  const composeOk = result.compose?.ok === true;
  return [`✓ .env geschrieben (${result.envPath})`, `${wizardCheckMark(composeOk)} Docker Compose`];
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
      return 'Routing';
    case 3:
      return 'Import & Export — Host-Ordner';
    case 4:
      return 'Netzwerk — Host & Erreichbarkeit';
    case 5:
      return 'Zugang — Proxy & Patientenportal';
    case 6:
      return 'HTTPS';
    case 7:
      return 'Vorschau — Geräte-URLs';
    case 8:
      return 'Abschluss';
  }
}
