import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { dockerPrerequisitesHints } from '../shared/docker-prerequisites-ui.js';
import {
  DOCKER_FILE_SHARING_HINT,
  needsDockerFileSharingHint,
} from '../shared/docker-file-sharing-hint.js';
import { createFolderPathField } from './folder-path-field.js';
import { gatewayBridgeDefaultsFromNetwork, resolvedLanIp } from './wizard-state.js';
import { renderGatewayPanel, renderLanIpPanel } from './host-network-panels.js';
import {
  deliveryImagesReady,
  needsDeliveryImages,
  pickAndLoadReleaseArchive,
  WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
} from './delivery-images-flow.js';
import {
  applyWizardSetup,
  canLeaveWizardStep1,
  createWizardFlowState,
  dockerReady,
  loadWizardNetwork,
  loadWizardPlan,
  planWizardAdvance,
  previousWizardStep,
  refreshWizardStatus,
  refreshWizardStatusAfterApply,
  WIZARD_PROBE_WAIT_MESSAGE,
  wizardCompletionLead,
  wizardProbeFailureHint,
  WIZARD_STEP_LABELS,
  WIZARD_STEPS,
  type WizardFlowState,
  type WizardStep,
} from './wizard-flow.js';
import { queryRequired } from './dom.js';

export type WizardCallbacks = {
  onComplete: () => void;
  onCancel: () => void;
};

type WizardState = WizardFlowState & {
  busy: boolean;
  probeStatusText: string | null;
  error: string | null;
};

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

function appendCheckItem(list: HTMLElement, label: string, ok: boolean): void {
  const li = document.createElement('li');
  li.className = ok ? 'is-done' : 'is-open';
  const check = document.createElement('span');
  check.className = 'wizard-check';
  check.textContent = ok ? '✓' : '○';
  const text = document.createElement('span');
  text.textContent = label;
  li.append(check, text);
  list.append(li);
}

function createInitialState(status: HostStatus | null): WizardState {
  return {
    ...createWizardFlowState(status),
    busy: false,
    probeStatusText: null,
    error: null,
  };
}

function appendWizardHint(panel: HTMLElement, text: string, className = 'wizard-hint'): void {
  const hint = document.createElement('p');
  hint.className = className;
  hint.textContent = text;
  panel.append(hint);
}

function appendSummaryRows(panel: HTMLElement, rows: Array<[string, string]>): void {
  const list = document.createElement('dl');
  list.className = 'status-grid wizard-summary-grid';
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  panel.append(list);
}

function renderStepIndicator(container: HTMLElement, current: WizardStep): void {
  container.replaceChildren();
  WIZARD_STEPS.forEach((stepNum, index) => {
    if (index > 0) {
      const separator = document.createElement('li');
      separator.className = 'wizard-step-separator';
      separator.textContent = '›';
      container.append(separator);
    }

    const item = document.createElement('li');
    item.className = 'wizard-step-indicator';
    if (stepNum === current) {
      item.classList.add('is-current');
      item.setAttribute('aria-current', 'step');
    } else if (stepNum < current) {
      item.classList.add('is-done');
    } else {
      item.classList.add('is-upcoming');
    }

    const label = WIZARD_STEP_LABELS[index];
    item.title = label;

    const badge = document.createElement('span');
    badge.className = 'wizard-step-badge';
    badge.textContent = String(stepNum);
    item.append(badge);

    if (stepNum === current) {
      const labelEl = document.createElement('span');
      labelEl.className = 'wizard-step-label';
      labelEl.textContent = label;
      item.append(labelEl);
    }

    container.append(item);
  });
}

function renderError(container: HTMLElement, message: string | null): void {
  if (!message) {
    container.hidden = true;
    container.textContent = '';
    return;
  }
  container.hidden = false;
  container.textContent = message;
}

export function createWizardView(
  root: HTMLElement,
  api: PraxisManagerApi,
  callbacks: WizardCallbacks,
): { show: (status: HostStatus | null) => void; hide: () => void } {
  const stepIndicator = queryRequired<HTMLElement>(root, '#wizard-steps', 'Wizard-UI');
  const content = queryRequired<HTMLElement>(root, '#wizard-content', 'Wizard-UI');
  const errorBox = queryRequired<HTMLElement>(root, '#wizard-error', 'Wizard-UI');
  const backBtn = queryRequired<HTMLButtonElement>(root, '#wizard-back', 'Wizard-UI');
  const nextBtn = queryRequired<HTMLButtonElement>(root, '#wizard-next', 'Wizard-UI');
  const cancelBtn = queryRequired<HTMLButtonElement>(root, '#wizard-cancel', 'Wizard-UI');

  let state = createInitialState(null);

  function setBusy(busy: boolean): void {
    state = { ...state, busy };
    backBtn.disabled = busy;
    nextBtn.disabled = busy;
    cancelBtn.disabled = busy;
  }

  function setError(message: string | null): void {
    state = { ...state, error: message };
    renderError(errorBox, message);
  }

  async function browseFolder(
    field: 'importsHostPath' | 'exportsHostPath',
  ): Promise<string | null> {
    const current = state[field].trim() || undefined;
    const result = await api.selectFolder(current);
    if (result.canceled || !result.path) {
      return null;
    }
    state = { ...state, [field]: result.path };
    return result.path;
  }

  async function loadReleaseArchive(): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      const pickResult = await pickAndLoadReleaseArchive(api, {
        loadingMessage: WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
        onProgress: (progress) => {
          state = { ...state, releaseImportStatus: progress.statusText };
          render();
        },
      });
      if (pickResult.canceled) {
        state = { ...state, releaseImportStatus: null };
        return false;
      }
      if (!pickResult.ok) {
        state = { ...state, releaseImportStatus: null };
        if (pickResult.error) {
          setError(pickResult.error);
        }
        return false;
      }
      state = { ...state, status: await refreshWizardStatus(api), releaseImportStatus: null };
      return true;
    } finally {
      setBusy(false);
      render();
    }
  }

  function renderStep1(): void {
    const status = state.status;
    const ready = dockerReady(status);
    const imagesReady = deliveryImagesReady(status);
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Voraussetzungen';
    panel.append(title);

    if (!status) {
      const p = document.createElement('p');
      p.textContent = 'Status wird geladen …';
      panel.append(p);
    } else {
      const list = document.createElement('ul');
      list.className = 'wizard-checklist';
      appendCheckItem(list, 'Docker installiert', status.docker.installed);
      appendCheckItem(list, 'Docker-Daemon läuft', status.docker.daemonRunning);
      appendCheckItem(list, 'docker compose verfügbar', status.docker.composeAvailable);
      if (status.deliveryImages.required) {
        appendCheckItem(list, 'Software-Paket (app + sandbox)', imagesReady);
      }
      panel.append(list);

      if (!ready) {
        const { installLink, hints } = dockerPrerequisitesHints(status.docker, api.hostPlatform);
        for (const hint of hints) {
          appendWizardHint(panel, hint);
        }
        if (installLink) {
          const installBtn = document.createElement('button');
          installBtn.type = 'button';
          installBtn.className = 'btn-secondary wizard-install-link';
          installBtn.textContent = installLink.buttonLabel;
          installBtn.disabled = state.busy;
          installBtn.addEventListener('click', () => {
            void api.openExternalUrl(installLink.url);
          });
          panel.append(installBtn);
        }
        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'btn-secondary wizard-install-link';
        refreshBtn.textContent = state.busy ? 'Prüfe …' : 'Erneut prüfen';
        refreshBtn.disabled = state.busy;
        refreshBtn.addEventListener('click', () => {
          void (async () => {
            setBusy(true);
            try {
              state = { ...state, status: await refreshWizardStatus(api) };
              setError(null);
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
              render();
            }
          })();
        });
        panel.append(refreshBtn);
      } else if (needsDeliveryImages(status)) {
        appendWizardHint(
          panel,
          'Release-Paket aus Ihrer Praxis-Flow-Freigabe wählen (eine .tar.gz-Datei mit app- und sandbox-Image). manifest.json oder SHA256SUMS.txt muss im selben Ordner liegen — SHA256 wird vor dem Import geprüft.',
        );
        const loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'btn-secondary wizard-install-link';
        loadBtn.textContent = state.busy ? 'Import läuft …' : 'Release-Paket wählen …';
        loadBtn.disabled = state.busy;
        loadBtn.addEventListener('click', () => {
          void loadReleaseArchive();
        });
        panel.append(loadBtn);
      }

      if (state.releaseImportStatus && state.busy) {
        const importStatus = document.createElement('p');
        importStatus.className = 'wizard-progress is-active';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        importStatus.append(spinner, document.createTextNode(state.releaseImportStatus));
        panel.append(importStatus);
      }
    }

    content.replaceChildren(panel);
    nextBtn.textContent = 'Weiter';
    nextBtn.disabled = !canLeaveWizardStep1(status, state.busy);
    backBtn.hidden = true;
  }

  function renderStep2(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Netzwerk — LAN-IP wählen';
    panel.append(title);

    const intro = document.createElement('p');
    intro.textContent =
      'Die App lauscht auf allen Interfaces (Port 8080). Hier legen Sie fest, unter welcher Host-Adresse Terminal, TV und MFA die app im Praxis-LAN/-WLAN erreichen — nicht localhost.';
    panel.append(intro);

    const lanHost = document.createElement('div');
    panel.append(lanHost);
    renderLanIpPanel(lanHost, {
      state: state,
      network: state.network,
      status: state.status,
      disabled: state.busy,
      variant: 'wizard',
      radioName: 'wizard-lan-ip',
      onChange: (patch) => {
        state = { ...state, ...patch };
      },
      onRerender: () => render(),
    });

    content.replaceChildren(panel);
    nextBtn.textContent = 'Weiter';
    backBtn.hidden = false;
  }

  function renderStep3(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Praxis — Anzeigename';
    panel.append(title);

    const intro = document.createElement('p');
    intro.textContent =
      'Dieser Name wird an verschiedenen Stellen in Praxis Flow verwendet, um den Namen Ihrer Praxis anzuzeigen.';
    panel.append(intro);

    if (state.status?.envExists && state.practiceDisplayName.trim()) {
      appendWizardHint(panel, `Aktueller Wert aus .env: ${state.practiceDisplayName.trim()}`);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'wizard-input';
    input.value = state.practiceDisplayName;
    input.addEventListener('input', () => {
      state = { ...state, practiceDisplayName: input.value };
    });
    panel.append(input);

    content.replaceChildren(panel);
    nextBtn.textContent = 'Weiter';
    backBtn.hidden = false;
  }

  function renderStep4(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Gast-WLAN (optional)';
    panel.append(title);

    const gatewayHost = document.createElement('div');
    panel.append(gatewayHost);
    const renderGateway = () => {
      renderGatewayPanel(gatewayHost, {
        state: state,
        network: state.network,
        status: state.status,
        lanIpFallback: resolvedLanIp(state),
        disabled: state.busy,
        radioName: 'wizard-gateway-interface',
        onChange: (patch) => {
          state = { ...state, ...patch };
        },
        onRerender: () => renderGateway(),
      });
    };
    renderGateway();

    if (state.status?.gateway?.enabled && state.status.envExists) {
      appendWizardHint(panel, 'Bestehende Gast-WLAN-Einstellungen aus der Konfiguration übernommen.');
    }

    content.replaceChildren(panel);
    nextBtn.textContent = 'Weiter';
    backBtn.hidden = false;
  }

  function renderStep5(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Import & Export — Host-Ordner';
    panel.append(title);

    const intro = document.createElement('p');
    intro.textContent =
      'Diese Ordner werden per Docker-Bind-Mount mit /imports und /exports im app-Container verbunden — für Kontakt-CSV und MFA-Exporte.';
    panel.append(intro);

    if (needsDockerFileSharingHint(api.hostPlatform)) {
      appendWizardHint(panel, DOCKER_FILE_SHARING_HINT);
    }

    if (state.status?.envExists) {
      appendWizardHint(
        panel,
        'Aktuelle Pfade aus .env sind vorausgefüllt. Beim Anwenden werden sie in die Konfiguration übernommen.',
      );
    }

    panel.append(
      createFolderPathField({
        label: 'Importordner (Kontakte, CSV)',
        value: state.importsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          state = { ...state, importsHostPath: value };
        },
        onBrowse: () => browseFolder('importsHostPath'),
      }),
      createFolderPathField({
        label: 'Exportordner (Dokumente aus MFA)',
        value: state.exportsHostPath,
        disabled: state.busy,
        onChange: (value) => {
          state = { ...state, exportsHostPath: value };
        },
        onBrowse: () => browseFolder('exportsHostPath'),
      }),
    );

    content.replaceChildren(panel);
    nextBtn.textContent = 'Vorschau laden';
    backBtn.hidden = false;
  }

  function renderStep6(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Vorschau — Geräte-URLs';
    panel.append(title);

    const plan = state.plan;
    if (!plan) {
      const p = document.createElement('p');
      p.textContent = 'Plan wird geladen …';
      panel.append(p);
    } else {
      const entries: Array<[string, string]> = [
        ['Terminal', plan.deviceUrls.terminal],
        ['TV', plan.deviceUrls.tv],
        ['MFA', plan.deviceUrls.mfa],
        ['Portal', plan.deviceUrls.portal],
        ['Ops Setup', plan.deviceUrls.opsSetup],
      ];
      appendSummaryRows(panel, entries);

      if (state.gatewayEnabled && Object.keys(plan.gatewayEnv).length > 0) {
        const gatewayTitle = document.createElement('h3');
        gatewayTitle.className = 'wizard-subheading';
        gatewayTitle.textContent = 'Gast-WLAN (Gateway)';
        panel.append(gatewayTitle);

        const gatewayEntries: Array<[string, string]> = [
          ['Interface', plan.gatewayEnv.GATEWAY_INTERFACE ?? state.gatewayInterface],
          ['Gateway-IP', plan.gatewayEnv.GATEWAY_IP ?? state.gatewayIp],
          ['Portal-URL', plan.gatewayEnv.APP_PORTAL_URL ?? ''],
          ['App-API für Gateway', plan.gatewayEnv.APP_API_URL ?? ''],
          ['Gateway-Bridge für app', plan.gatewayEnv.GATEWAY_AUTH_BRIDGE_URL ?? ''],
        ];
        appendSummaryRows(panel, gatewayEntries);
      }

      const folderTitle = document.createElement('h3');
      folderTitle.className = 'wizard-subheading';
      folderTitle.textContent = 'Host-Ordner (Docker-Mounts)';
      panel.append(folderTitle);

      const folderEntries: Array<[string, string]> = [
        ['Import', state.importsHostPath.trim()],
        ['Export', state.exportsHostPath.trim()],
      ];
      appendSummaryRows(panel, folderEntries);
    }

    content.replaceChildren(panel);
    nextBtn.textContent = 'Anwenden';
    backBtn.hidden = false;
  }

  function renderStep7(): void {
    const panel = document.createElement('div');
    panel.className = 'wizard-panel';

    const title = document.createElement('h2');
    title.textContent = 'Abschluss';
    panel.append(title);

    const result = state.applyResult;
    if (!result) {
      const p = document.createElement('p');
      p.textContent =
        'Der Manager schreibt die technische Compose-Konfiguration, legt die Host-Ordner an und startet den lokalen Stack.';
      panel.append(p);
      if (state.status?.envExists) {
        appendWizardHint(
          panel,
          'Bestehende technische Werte werden übernommen, soweit sie gültig sind. Platzhalter-Secrets werden ersetzt; Staff-PINs liegen in der Datenbank und werden nicht überschrieben.',
        );
      }
    } else {
      const applyTitle = document.createElement('h3');
      applyTitle.className = 'wizard-subheading';
      applyTitle.textContent = 'Anwenden';
      panel.append(applyTitle);

      const applyList = document.createElement('ul');
      applyList.className = 'wizard-checklist';
      const composeOk = result.compose?.ok === true;
      const applyItems = [
        `✓ .env geschrieben (${result.envPath})`,
        `${mark(composeOk)} Docker Compose`,
      ];
      if (result.gatewayComposeSkipped) {
        applyItems.push(
          'Gateway-Dienst auf diesem Praxis-PC übersprungen; Werte für separates Linux-Gateway gespeichert',
        );
      }
      for (const text of applyItems) {
        const li = document.createElement('li');
        li.textContent = text;
        applyList.append(li);
      }
      panel.append(applyList);

      if (!composeOk && result.compose?.detail) {
        appendWizardHint(panel, result.compose.detail);
      }

      const status = state.status;
      if (status) {
        const probeTitle = document.createElement('h3');
        probeTitle.className = 'wizard-subheading';
        probeTitle.textContent = 'Prüfen';
        panel.append(probeTitle);

        if (state.probeStatusText) {
          const waiting = document.createElement('p');
          waiting.className = 'wizard-progress is-active';
          const spinner = document.createElement('span');
          spinner.className = 'spinner';
          spinner.setAttribute('aria-hidden', 'true');
          waiting.append(spinner, document.createTextNode(state.probeStatusText));
          panel.append(waiting);
        }

        const probeList = document.createElement('ul');
        probeList.className = 'wizard-checklist';
        for (const probe of status.probes) {
          const li = document.createElement('li');
          li.textContent = `${mark(probe.ok)} ${probe.message}`;
          probeList.append(li);
        }
        if (!state.probeStatusText) {
          panel.append(probeList);
        }

        const failureHint = wizardProbeFailureHint(status.probes);
        if (failureHint) {
          appendWizardHint(panel, failureHint);
        }
      } else {
        const p = document.createElement('p');
        p.textContent = 'Probes werden geladen …';
        panel.append(p);
      }

      const doneIntro = document.createElement('p');
      doneIntro.textContent =
        status && !state.probeStatusText
          ? wizardCompletionLead(status.probes)
          : 'Host-Einrichtung wird abgeschlossen …';
      panel.append(doneIntro);

      appendWizardHint(
        panel,
        'MFA-, Ops- und Panel-PIN: Standard 0000 — MFA/Panel in MFA → Betrieb, Ops in System → PIN & Sicherheit. Vergessene MFA- oder Ops-PIN: Manager → Wartung.',
      );

      const actions = document.createElement('div');
      actions.className = 'wizard-done-actions';

      const setupUrl = status?.deviceUrls?.opsSetup ?? state.plan?.deviceUrls.opsSetup;
      const itSettingsBtn = document.createElement('button');
      itSettingsBtn.type = 'button';
      itSettingsBtn.className = 'btn-secondary';
      itSettingsBtn.textContent = 'IT-Einstellungen in Praxis Flow öffnen';
      itSettingsBtn.disabled = !setupUrl || state.busy;
      itSettingsBtn.addEventListener('click', () => {
        if (setupUrl) {
          void api.openExternalUrl(setupUrl);
        }
      });
      actions.append(itSettingsBtn);
      panel.append(actions);
    }

    content.replaceChildren(panel);
    nextBtn.textContent = result ? 'Zum Status' : 'Bitte warten …';
    nextBtn.disabled = !result || state.busy;
    backBtn.hidden = Boolean(result);
  }

  function render(): void {
    renderStepIndicator(stepIndicator, state.step);
    renderError(errorBox, state.error);

    switch (state.step) {
      case 1:
        renderStep1();
        break;
      case 2:
        renderStep2();
        break;
      case 3:
        renderStep3();
        break;
      case 4:
        renderStep4();
        break;
      case 5:
        renderStep5();
        break;
      case 6:
        renderStep6();
        break;
      case 7:
        renderStep7();
        break;
    }
  }

  async function runWizardAfterAction(
    after: NonNullable<Extract<ReturnType<typeof planWizardAdvance>, { type: 'goto' }>['after']>,
  ): Promise<void> {
    if (after === 'loadNetwork') {
      const network = await loadWizardNetwork(api);
      state = {
        ...state,
        network,
        ...gatewayBridgeDefaultsFromNetwork(state, network),
      };
      return;
    }
    if (after === 'loadPlan') {
      state = { ...state, plan: await loadWizardPlan(api, state) };
      return;
    }
    state = {
      ...state,
      applyResult: await applyWizardSetup(api, state),
      probeStatusText: WIZARD_PROBE_WAIT_MESSAGE,
    };
    render();
    state = {
      ...state,
      status: await refreshWizardStatusAfterApply(api),
      probeStatusText: null,
    };
  }

  async function goNext(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const action = planWizardAdvance(state.step, state);
      if (action.type === 'validate-error') {
        setError(action.message);
        return;
      }
      if (action.type === 'complete') {
        callbacks.onComplete();
        return;
      }

      state = { ...state, step: action.step, ...action.patch };
      render();
      if (action.after) {
        await runWizardAfterAction(action.after);
        render();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      render();
    }
  }

  function goBack(): void {
    if (state.step <= 1 || state.busy) {
      return;
    }
    if (state.step === 7 && state.applyResult) {
      return;
    }
    setError(null);
    state = { ...state, step: previousWizardStep(state.step) };
    render();
  }

  nextBtn.addEventListener('click', () => {
    void goNext();
  });
  backBtn.addEventListener('click', goBack);
  cancelBtn.addEventListener('click', () => {
    if (!state.busy) {
      callbacks.onCancel();
    }
  });

  return {
    show(status: HostStatus | null) {
      state = createInitialState(status);
      root.hidden = false;
      render();
    },
    hide() {
      root.hidden = true;
      state = createInitialState(null);
    },
  };
}
