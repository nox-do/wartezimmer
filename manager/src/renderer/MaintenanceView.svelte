<script lang="ts">
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import type { HostStatus } from '../shared/host-status.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import {
    createMaintenanceController,
    type MaintenanceController,
    type MaintenanceState,
  } from './maintenance-controller.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import StackControls from './StackControls.svelte';
  import SoftwareUpdatePanel from './SoftwareUpdatePanel.svelte';
  import StoragePathsPanel from './StoragePathsPanel.svelte';
  import BackupPanel from './BackupPanel.svelte';
  import LogsPanel from './LogsPanel.svelte';
  import RestoreWizardDialog from './RestoreWizardDialog.svelte';
  import PfupdateWizardDialog from './PfupdateWizardDialog.svelte';
  import {
    createRestoreWizardController,
    type RestoreWizardController,
  } from './restore-wizard-controller.js';
  import {
    createPfupdateWizardController,
    type PfupdateWizardController,
  } from './pfupdate-wizard-controller.js';
  import {
    maintenanceErrorFocusKey,
    maintenanceSectionToOpenForErrorChange,
    type MaintenanceErrors,
    type MaintenanceExpanderId,
  } from './maintenance-view-model.js';
  import type { RestoreWizardState } from './restore-wizard-flow.js';
  import type { PfupdateWizardState } from './pfupdate-wizard-flow.js';

  let {
    onAfterMutation,
    onReinstall,
  }: {
    onAfterMutation: () => void;
    onReinstall: () => void;
  } = $props();

  let snapshot = $state<MaintenanceState | null>(null);
  let openSection = $state<MaintenanceExpanderId | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;
  let confirmCancel: (() => void) | null = null;
  let pinResetOpen = $state(false);

  let controller = $state<MaintenanceController | null>(null);
  let restoreWizard = $state<RestoreWizardController | null>(null);
  let pfupdateWizard = $state<PfupdateWizardController | null>(null);
  let restoreSnapshot = $state<RestoreWizardState | null>(null);
  let pfupdateSnapshot = $state<PfupdateWizardState | null>(null);
  let hostPlatform = $state('linux');
  let lastSessionGeneration = $state<number | null>(null);
  /** Skip config effect once after session show() used this same snapshot ref. */
  let sessionOpenConfig = $state<HostStatus | null>(null);
  let previousErrors = $state<MaintenanceErrors | null>(null);
  let previousErrorsKey = $state('');

  const viewLoading = $derived(managerShell.viewLoading.maintenance);
  const maintenanceLocked = $derived(
    Boolean(snapshot?.activeOperation) ||
      Boolean(restoreSnapshot?.busy) ||
      Boolean(pfupdateSnapshot?.busy),
  );

  function requireApi(): PraxisManagerApi {
    const api = window.praxisManager;
    if (!api) {
      throw new Error(
        'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
      );
    }
    return api;
  }

  function syncSnapshot(): void {
    snapshot = controller ? { ...controller.getState() } : null;
  }

  function syncRestoreSnapshot(): void {
    restoreSnapshot = restoreWizard ? { ...restoreWizard.getState() } : null;
  }

  function syncPfupdateSnapshot(): void {
    pfupdateSnapshot = pfupdateWizard ? { ...pfupdateWizard.getState() } : null;
  }

  function requestConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmCancel = onCancel ?? null;
    confirmOpen = true;
  }

  function closeConfirm(runCancel: boolean): void {
    const cancel = confirmCancel;
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
    confirmCancel = null;
    if (runCancel) {
      cancel?.();
    }
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    closeConfirm(false);
    action?.();
  }

  function closePinReset(runCancel: boolean): void {
    if (!pinResetOpen) {
      return;
    }
    pinResetOpen = false;
    if (runCancel) {
      controller?.cancelPinReset();
    }
  }

  function confirmPinReset(): void {
    closePinReset(false);
    controller?.executePinReset();
  }

  function toggleSection(id: MaintenanceExpanderId): void {
    openSection = openSection === id ? null : id;
  }

  function onImportsChange(value: string): void {
    controller?.setImportsPath(value);
  }

  function onExportsChange(value: string): void {
    controller?.setExportsPath(value);
  }

  onMount(() => {
    const api = requireApi();
    hostPlatform = api.hostPlatform;

    controller = createMaintenanceController({
      api,
      onAfterMutation,
      requestConfirm,
      onStateChange: syncSnapshot,
    });
    restoreWizard = createRestoreWizardController({
      api,
      onAfterMutation,
      onStateChange: syncRestoreSnapshot,
    });
    pfupdateWizard = createPfupdateWizardController({
      api,
      onAfterMutation,
      getHostStatus: () => controller?.getState().status ?? null,
      onApplySuccess: (result) => {
        controller?.recordPfupdateSuccess(result);
      },
      onStateChange: syncPfupdateSnapshot,
    });
    syncSnapshot();
    syncRestoreSnapshot();
    syncPfupdateSnapshot();
  });

  $effect(() => {
    const c = controller;
    const session = managerShell.maintenanceSession;
    if (!c) {
      return;
    }

    if (!session) {
      if (lastSessionGeneration !== null) {
        closeConfirm(true);
        closePinReset(true);
        c.hide();
        lastSessionGeneration = null;
        sessionOpenConfig = null;
      }
      return;
    }

    if (session.generation !== lastSessionGeneration) {
      const status = managerShell.configSnapshot;
      if (!status) {
        return;
      }
      lastSessionGeneration = session.generation;
      sessionOpenConfig = status;
      c.show(status);
      // Live compose from runtime — do not rely on config.compose after Shell merge removal.
      const runtime = managerShell.runtimeSnapshot;
      if (runtime) {
        c.applyRuntimeHealth(runtime);
      }
    }
  });

  $effect(() => {
    const c = controller;
    const status = managerShell.configSnapshot;
    const session = managerShell.maintenanceSession;
    if (!c || !status || !session) {
      return;
    }
    // Session-Start wendet denselben Snapshot bereits in show() an.
    if (status === sessionOpenConfig) {
      return;
    }
    c.applyConfigSnapshot(status);
  });

  $effect(() => {
    const c = controller;
    const health = managerShell.runtimeSnapshot;
    const session = managerShell.maintenanceSession;
    if (!c || !health || !session || managerShell.activeView !== 'maintenance') {
      return;
    }
    c.applyRuntimeHealth(health);
  });

  $effect(() => {
    if (!snapshot) {
      previousErrors = null;
      previousErrorsKey = '';
      return;
    }
    const key = maintenanceErrorFocusKey(snapshot.errors);
    if (key === previousErrorsKey) {
      return;
    }
    const section = maintenanceSectionToOpenForErrorChange(previousErrors, snapshot.errors);
    previousErrors = { ...snapshot.errors };
    previousErrorsKey = key;
    if (section && openSection !== section) {
      openSection = section;
    }
  });
</script>

<div
  id="maintenance-view"
  class="app maintenance"
  hidden={managerShell.activeView !== 'maintenance'}
  aria-busy={viewLoading ? 'true' : 'false'}
>
  <LoadingOverlay loading={viewLoading} />

  <p class="maintenance-page-intro">
    Vier Bereiche für den Alltag der Praxis-IT. Öffnen Sie einen Bereich, um die Details ein- oder
    auszuklappen.
  </p>

  {#if snapshot}
    <div class="maintenance-accordion" id="maintenance-accordion">
      <MaintenanceSection
        open={openSection === 'operations'}
        title="Betrieb & Updates"
        subtitle="Stack · Software-Update · Neuinstallation"
        copy="Stack steuern und Software-Updates einspielen."
        onToggle={() => toggleSection('operations')}
      >
        <StackControls
          compose={snapshot.compose}
          locked={maintenanceLocked}
          error={snapshot.errors.stack}
          onToggle={(wantRunning) => controller?.handleStackToggle(wantRunning)}
          onRestart={() => controller?.restart()}
          onRebuild={() => controller?.rebuild()}
          rebuildStatus={snapshot.rebuildStatusText}
        />
        <hr class="panel-section-divider" />
        <SoftwareUpdatePanel
          status={snapshot.status}
          statusText={snapshot.softwareUpdateStatusText}
          locked={maintenanceLocked}
          updateRunning={pfupdateSnapshot?.busy ?? false}
          onImport={() => {
            pfupdateWizard?.open();
          }}
        />
        <hr class="panel-section-divider" />
        <section class="panel-section">
          <h2>Neuinstallation</h2>
          <p class="hint">Praxis Flow mit einem Software-Paket neu einrichten. Der Assistent führt durch die Vorbereitung und Bestätigung.</p>
          <button type="button" class="btn-secondary" disabled={maintenanceLocked} onclick={onReinstall}>Neu installieren …</button>
        </section>
      </MaintenanceSection>

      <MaintenanceSection
        open={openSection === 'practice'}
        title="Import & Export"
        subtitle="Import & Export"
        copy="Host-Ordner für Import/Export der Praxis."
        onToggle={() => toggleSection('practice')}
      >
        <StoragePathsPanel
          {hostPlatform}
          status={snapshot.status}
          compose={snapshot.compose}
          importsHostPath={snapshot.importsHostPath}
          exportsHostPath={snapshot.exportsHostPath}
          storageStatusText={snapshot.storageStatusText}
          locked={maintenanceLocked}
          error={snapshot.errors.storage}
          onImportsChange={onImportsChange}
          onExportsChange={onExportsChange}
          onBrowseImports={() => {
            void controller?.browseImportsFolder();
          }}
          onBrowseExports={() => {
            void controller?.browseExportsFolder();
          }}
          onApply={() => controller?.applyStorage()}
        />
      </MaintenanceSection>

      <MaintenanceSection
        open={openSection === 'security'}
        title="Sicherung & Zugänge"
        subtitle=".pfbackup · Staff-PINs"
        copy="Settings und Stack-Konfiguration sichern; MFA-/Ops-PIN zurücksetzen."
        onToggle={() => toggleSection('security')}
      >
        <BackupPanel
          latestBackupPath={snapshot.latestBackupPath}
          envExists={snapshot.status?.envExists}
          pinResetStatusText={snapshot.pinResetStatusText}
          backupStatusText={snapshot.backupStatusText}
          locked={maintenanceLocked}
          backupError={snapshot.errors.backup}
          pinError={snapshot.errors.pin}
          tlsEnabled={(snapshot.status?.tls?.state ?? 'off') !== 'off'}
          onBackup={() => controller?.backupPf()}
          onRestore={() => {
            restoreWizard?.openStandalone();
          }}
          onPinReset={() => {
            if (controller?.beginPinReset()) {
              pinResetOpen = true;
            }
          }}
        />
      </MaintenanceSection>

      <MaintenanceSection
        open={openSection === 'diagnostics'}
        title="Logs & Diagnose"
        subtitle="app · sandbox"
        copy="Container-Logs der laufenden Dienste einsehen."
        onToggle={() => toggleSection('diagnostics')}
      >
        <LogsPanel
          logsService={snapshot.logsService}
          logsText={snapshot.logsText}
          locked={maintenanceLocked}
          error={snapshot.errors.logs}
          onServiceChange={(service) => controller?.requestLogsRefresh(service)}
          onRefresh={() => controller?.requestLogsRefresh(snapshot!.logsService)}
        />
      </MaintenanceSection>
    </div>
  {/if}

  <ConfirmDialog
    open={confirmOpen}
    onConfirm={confirmAndRun}
    onCancel={() => closeConfirm(true)}
  >
    <p>{confirmMessage}</p>
  </ConfirmDialog>

  <ConfirmDialog
    open={pinResetOpen}
    confirmLabel="Zurücksetzen & neu starten"
    onConfirm={confirmPinReset}
    onCancel={() => closePinReset(true)}
  >
    <p>
      MFA- und Ops-PIN werden auf <strong>0000</strong> zurückgesetzt. Der Stack wird gestoppt, die
      Datenbank aktualisiert und neu gestartet. Terminal und MFA sind kurz offline.
    </p>
  </ConfirmDialog>

  {#if restoreSnapshot}
    <RestoreWizardDialog
      snapshot={restoreSnapshot}
      onChooseRestore={(restore) => {
        restoreWizard?.chooseRestore(restore);
      }}
      onCancelHttps={() => restoreWizard?.cancelHttpsConfirmation()}
      onConfirmRestore={() => {
        restoreWizard?.confirmRestore();
      }}
      onRetry={() => {
        restoreWizard?.retryRestore();
      }}
      onSkip={() => {
        restoreWizard?.skipAfterFailure();
      }}
      onClose={() => {
        restoreWizard?.close();
      }}
      onToggleCredentialSkip={(value) => {
        restoreWizard?.setSkipProviderCredentials(value);
      }}
    />
  {/if}

  {#if pfupdateSnapshot}
    <PfupdateWizardDialog
      snapshot={pfupdateSnapshot}
      onConfirmApply={() => {
        pfupdateWizard?.confirmApply();
      }}
      onClose={() => {
        pfupdateWizard?.close();
      }}
    />
  {/if}
</div>
