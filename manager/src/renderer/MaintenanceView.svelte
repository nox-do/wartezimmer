<script lang="ts">
  import { onMount } from 'svelte';
  import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
  import type { HostStatus } from '../shared/host-status.js';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import {
    createMaintenanceController,
    type MaintenanceController,
    type MaintenanceState,
  } from './maintenance-controller.js';
  import {
    getMaintenanceCallbacks,
    registerMaintenanceViewAdapter,
  } from './maintenance-view-adapter.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import StackControls from './StackControls.svelte';
  import SoftwareUpdatePanel from './SoftwareUpdatePanel.svelte';
  import RoutingModePanel from './RoutingModePanel.svelte';
  import StoragePathsPanel from './StoragePathsPanel.svelte';
  import BackupPanel from './BackupPanel.svelte';
  import LogsPanel from './LogsPanel.svelte';

  type MaintenanceExpanderId = 'operations' | 'practice' | 'security' | 'diagnostics';

  let snapshot = $state<MaintenanceState | null>(null);
  let viewLoading = $state(false);
  let openSection = $state<MaintenanceExpanderId | null>('practice');
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;
  let pinResetOpen = $state(false);

  let controller: MaintenanceController | null = null;
  let hostPlatform = $state('linux');

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
      onAfterMutation: () => getMaintenanceCallbacks().onAfterMutation?.(),
      requestConfirm,
      onStateChange: syncSnapshot,
    });
    syncSnapshot();

    const unregister = registerMaintenanceViewAdapter({
      show(status: HostStatus) {
        controller?.show(status);
        syncSnapshot();
      },
      hide() {
        controller?.clearError();
        syncSnapshot();
      },
      setLoading(loading: boolean) {
        viewLoading = loading;
      },
      applyConfigSnapshot(status: HostStatus) {
        controller?.applyConfigSnapshot(status);
        syncSnapshot();
      },
      applyRuntimeHealth(health: HostRuntimeHealth) {
        controller?.applyRuntimeHealth(health);
        syncSnapshot();
      },
    });

    return unregister;
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
        copy="Stack starten, neu starten und Release-Pakete importieren."
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
          busy={snapshot.busy}
          onImport={() => controller?.importSoftware()}
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
          statusText={snapshot.routingModeStatusText}
          busy={snapshot.busy}
          onChange={(routingMode) => {
            controller?.setRoutingMode(routingMode);
            syncSnapshot();
          }}
          onSave={() => controller?.saveRoutingMode()}
        />
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
        subtitle=".env-Backup · Staff-PINs"
        copy="Konfiguration sichern und MFA-/Ops-PIN zurücksetzen."
        onToggle={() => toggleSection('security')}
      >
        <BackupPanel
          latestBackupPath={snapshot.latestBackupPath}
          envExists={snapshot.status?.envExists}
          pinResetStatusText={snapshot.pinResetStatusText}
          busy={snapshot.busy}
          onBackup={() => controller?.backupEnv()}
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
</div>
