<script lang="ts">
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
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
  import RoutingModePanel from './RoutingModePanel.svelte';
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
  import type { RestoreWizardState } from './restore-wizard-flow.js';
  import type { PfupdateWizardState } from './pfupdate-wizard-flow.js';

  type MaintenanceExpanderId = 'operations' | 'practice' | 'security' | 'diagnostics';

  let {
    onAfterMutation,
  }: {
    onAfterMutation: () => void;
  } = $props();

  let snapshot = $state<MaintenanceState | null>(null);
  let openSection = $state<MaintenanceExpanderId | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;
  let pinResetOpen = $state(false);

  let controller = $state<MaintenanceController | null>(null);
  let restoreWizard = $state<RestoreWizardController | null>(null);
  let pfupdateWizard = $state<PfupdateWizardController | null>(null);
  let restoreSnapshot = $state<RestoreWizardState | null>(null);
  let pfupdateSnapshot = $state<PfupdateWizardState | null>(null);
  let hostPlatform = $state('linux');
  let lastSessionGeneration = $state<number | null>(null);

  const viewLoading = $derived(managerShell.viewLoading.maintenance);

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

  function requestConfirm(message: string, onConfirm: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmOpen = true;
  }

  function closeConfirm(): void {
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    closeConfirm();
    action?.();
  }

  function toggleSection(id: MaintenanceExpanderId): void {
    openSection = openSection === id ? null : id;
  }

  function onImportsChange(value: string): void {
    controller?.setImportsPath(value);
    syncSnapshot();
  }

  function onExportsChange(value: string): void {
    controller?.setExportsPath(value);
    syncSnapshot();
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
        syncSnapshot();
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
        c.clearError();
        syncSnapshot();
        lastSessionGeneration = null;
      }
      return;
    }

    if (session.generation !== lastSessionGeneration) {
      lastSessionGeneration = session.generation;
      c.show(session.status);
      syncSnapshot();
    }
  });

  $effect(() => {
    const c = controller;
    const status = managerShell.hostStatus;
    const session = managerShell.maintenanceSession;
    if (!c || !status || !session) {
      return;
    }
    // Session-Start wendet denselben Snapshot bereits in show() an.
    if (status === session.status) {
      return;
    }
    c.applyConfigSnapshot(status);
    syncSnapshot();
  });

  $effect(() => {
    const c = controller;
    const health = managerShell.runtimeHealth;
    const session = managerShell.maintenanceSession;
    if (!c || !health || !session || managerShell.activeView !== 'maintenance') {
      return;
    }
    c.applyRuntimeHealth(health);
    syncSnapshot();
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
    Vier Bereiche für den Alltag der Praxis-IT. Klicke einen Bereich, um die Details ein- oder
    auszuklappen.
  </p>

  {#if snapshot}
    <div class="maintenance-accordion" id="maintenance-accordion">
      <MaintenanceSection
        open={openSection === 'operations'}
        title="Betrieb & Updates"
        subtitle="Stack · Software-Update"
        copy="Stack steuern und Software-Updates einspielen."
        onToggle={() => toggleSection('operations')}
      >
        <StackControls
          status={snapshot.status}
          compose={snapshot.compose}
          busy={snapshot.busy}
          onToggle={(wantRunning) => controller?.handleStackToggle(wantRunning)}
          onRestartBuild={() => controller?.restartBuild()}
          onRestart={() => controller?.restart()}
        />
        <SoftwareUpdatePanel
          status={snapshot.status}
          statusText={snapshot.softwareUpdateStatusText}
          busy={snapshot.busy || (pfupdateSnapshot?.busy ?? false)}
          onImport={() => {
            pfupdateWizard?.open();
            syncPfupdateSnapshot();
          }}
        />
      </MaintenanceSection>

      <MaintenanceSection
        open={openSection === 'practice'}
        title="Praxis-Einstellungen"
        subtitle="Routing-Modus · Import & Export"
        copy="Patientenwege und Host-Ordner für Import/Export."
        onToggle={() => toggleSection('practice')}
      >
        <RoutingModePanel
          routingMode={snapshot.routingMode}
          routingModeSaved={snapshot.routingModeSaved}
          complexRoutingLicensed={snapshot.complexRoutingLicensed}
          openVisitCount={snapshot.openVisitCount}
          statusText={snapshot.routingModeStatusText}
          busy={snapshot.busy}
          onChange={(routingMode) => {
            controller?.setRoutingMode(routingMode);
            syncSnapshot();
          }}
          onSave={() => controller?.saveRoutingMode()}
        />
        {#if snapshot.busy && snapshot.routingMode === null}
          <p class="wizard-progress is-active" role="status">
            <span class="spinner" aria-hidden="true"></span>
            Routing-Modus wird geladen …
          </p>
        {/if}
        <hr class="panel-section-divider" />
        <StoragePathsPanel
          {hostPlatform}
          status={snapshot.status}
          compose={snapshot.compose}
          importsHostPath={snapshot.importsHostPath}
          exportsHostPath={snapshot.exportsHostPath}
          storageStatusText={snapshot.storageStatusText}
          busy={snapshot.busy}
          onImportsChange={onImportsChange}
          onExportsChange={onExportsChange}
          onBrowseImports={() => {
            void controller?.browseImportsFolder().then(() => syncSnapshot());
          }}
          onBrowseExports={() => {
            void controller?.browseExportsFolder().then(() => syncSnapshot());
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
          busy={snapshot.busy}
          onBackup={() => controller?.backupPf()}
          onValidateBackup={() => controller?.validatePfbackup()}
          onRestore={() => {
            restoreWizard?.openStandalone();
            syncRestoreSnapshot();
          }}
          onPinReset={() => {
            pinResetOpen = true;
          }}
        />
      </MaintenanceSection>

      <MaintenanceSection
        open={openSection === 'diagnostics'}
        title="Logs & Diagnose"
        subtitle="app · sandbox · gateway"
        copy="Container-Logs der laufenden Dienste einsehen."
        onToggle={() => toggleSection('diagnostics')}
      >
        <LogsPanel
          logsService={snapshot.logsService}
          logsText={snapshot.logsText}
          busy={snapshot.busy}
          onServiceChange={(service) => controller?.requestLogsRefresh(service)}
          onRefresh={() => controller?.requestLogsRefresh(snapshot!.logsService)}
        />
      </MaintenanceSection>
    </div>

    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>
    {/if}
  {/if}

  <ConfirmDialog
    open={confirmOpen}
    onConfirm={confirmAndRun}
    onCancel={closeConfirm}
  >
    <p>{confirmMessage}</p>
  </ConfirmDialog>

  <ConfirmDialog
    open={pinResetOpen}
    confirmLabel="Zurücksetzen & neu starten"
    onConfirm={() => {
      pinResetOpen = false;
      controller?.executePinReset();
    }}
    onCancel={() => {
      pinResetOpen = false;
    }}
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
        syncRestoreSnapshot();
      }}
      onConfirmRestore={() => {
        restoreWizard?.confirmRestore();
        syncRestoreSnapshot();
      }}
      onRetry={() => {
        restoreWizard?.retryRestore();
        syncRestoreSnapshot();
      }}
      onSkip={() => {
        restoreWizard?.skipAfterFailure();
        syncRestoreSnapshot();
      }}
      onClose={() => {
        restoreWizard?.close();
        syncRestoreSnapshot();
      }}
      onToggleCredentialSkip={(value) => {
        restoreWizard?.setSkipProviderCredentials(value);
        syncRestoreSnapshot();
      }}
    />
  {/if}

  {#if pfupdateSnapshot}
    <PfupdateWizardDialog
      snapshot={pfupdateSnapshot}
      onConfirmApply={() => {
        pfupdateWizard?.confirmApply();
        syncPfupdateSnapshot();
      }}
      onClose={() => {
        pfupdateWizard?.close();
        syncPfupdateSnapshot();
      }}
    />
  {/if}
</div>
