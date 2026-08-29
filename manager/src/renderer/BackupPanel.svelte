<script lang="ts">
  /**
   * HTTPS-State (Pilot) when tls.state !== off — sidecar praxis-flow-tls-<timestamp>.tgz
   * next to .pfbackup. Restore stays the existing wizard (sibling sidecar, else second file dialog).
   * Electron-Main owns path/timestamp lookup; Setup receives tlsSidecarBase64,
   * never a renderer-selected host path.
   * Mock: docs/mocks/lan-tls-wizard/app.js renderMaintenance
   */
  import { siblingTlsSidecarBasename } from '@praxis-flow/server-shared/backup-path-labels';
  import IconButton from './IconButton.svelte';
  import { backupInfoText } from './maintenance-view-model.js';

  let {
    latestBackupPath,
    envExists,
    backupStatusText = '',
    tlsSidecarStatusText = '',
    pinResetStatusText = '',
    locked = false,
    backupError = null,
    tlsSidecarError = null,
    pinError = null,
    tlsEnabled = false,
    onBackup,
    onValidateBackup,
    onRestore,
    onExportTlsSidecar,
    onInspectTlsSidecar,
    onPinReset,
  }: {
    latestBackupPath: string | null;
    envExists: boolean | undefined;
    backupStatusText?: string;
    tlsSidecarStatusText?: string;
    pinResetStatusText?: string;
    locked?: boolean;
    backupError?: string | null;
    tlsSidecarError?: string | null;
    pinError?: string | null;
    tlsEnabled?: boolean;
    onBackup: () => void;
    onValidateBackup: () => void;
    onRestore: () => void;
    onExportTlsSidecar: () => void;
    onInspectTlsSidecar: () => void;
    onPinReset: () => void;
  } = $props();

  const sidecarName = $derived(
    latestBackupPath ? siblingTlsSidecarBasename(latestBackupPath) : 'praxis-flow-tls-<timestamp>.tgz',
  );
</script>

<div class="panel-section">
  <div class="panel-section-heading">
    <h2>Praxis-Backup (.pfbackup)</h2>
    <IconButton
      icon="info"
      class="btn-icon-muted info-tip-trigger"
      ariaLabel="Hilfe zum Praxis-Backup"
      describedBy="maintenance-backup-tip"
    />
    <div id="maintenance-backup-tip" class="info-tip-panel" role="tooltip">
      <p>
        Sichert Settings aus der App-Datenbank, die Stack-<code>.env</code> und den
        Manager-Release-Stand (<code>manager-state.json</code>) in einer
        <code>.pfbackup</code>-Datei mit Prüfsummen.
      </p>
      <p>
        Patientendaten und laufende Warteschlange werden nicht mitgesichert. Mit
        „Wiederherstellen“ importieren Sie Settings aus einer <code>.pfbackup</code>-Datei in eine
        frische Datenbank (Stack kurz offline).
      </p>
    </div>
  </div>
  <p class="maintenance-backup-status">{backupInfoText(latestBackupPath, envExists)}</p>
  {#if backupStatusText}
    <p class="maintenance-backup-status">{backupStatusText}</p>
  {/if}
  <div class="maintenance-backup-actions">
    <button type="button" class="btn-secondary" disabled={locked} onclick={onBackup}>
      Backup erstellen
    </button>
    <button type="button" class="btn-secondary" disabled={locked} onclick={onValidateBackup}>
      Backup prüfen
    </button>
    <button type="button" class="btn-secondary" disabled={locked} onclick={onRestore}>
      Wiederherstellen …
    </button>
  </div>
  {#if backupError}
    <p class="error">{backupError}</p>
  {/if}
</div>

{#if tlsEnabled}
  <div class="panel-section">
    <h2>HTTPS-State (Pilot)</h2>
    <p class="hint">
      Caddy-Daten und ACME-Berechtigung liegen nicht in der <code>.pfbackup</code>. Extra sichern,
      sobald HTTPS vorbereitet ist — nicht erst nach dem Umstellen. Dateiname
      <code>{sidecarName}</code> neben der <code>.pfbackup</code>. Beide Dateien zusammen kopieren;
      nicht nur die Backup-Datei.
    </p>
    <p class="hint">
      Electron-Main liest das Sidecar gleichen Zeitstempels und übergibt den Inhalt an Setup. Nur
      bei aktivem HTTPS folgt ohne Treffer der zweite Dateidialog — bestehender Restore-Assistent,
      kein zweiter Assistent. Inspect-Zeile analog Routing/Portal.
    </p>
    {#if tlsSidecarStatusText}
      <p class="maintenance-backup-status">{tlsSidecarStatusText}</p>
    {/if}
    {#if tlsSidecarError}
      <p class="error">{tlsSidecarError}</p>
    {/if}
    <div class="maintenance-backup-actions">
      <button type="button" class="btn-secondary" disabled={locked} onclick={onExportTlsSidecar}>
        HTTPS-State sichern
      </button>
      <button type="button" class="btn-secondary" disabled={locked} onclick={onInspectTlsSidecar}>
        HTTPS-State prüfen
      </button>
    </div>
  </div>
{/if}

<div class="panel-section">
  <h2>Staff-PINs (MFA &amp; Ops)</h2>
  <p class="hint">
    Setzt MFA- und Ops-PIN auf den Default <strong>0000</strong> zurück (nur Datenbank).
    Raum-Panel-PIN bleibt unverändert. Stack wird gestoppt, PINs zurückgesetzt und neu gestartet.
    Danach MFA-PIN in MFA → Betrieb, Ops-PIN in System → PIN &amp; Sicherheit vergeben.
  </p>
  {#if pinResetStatusText}
    <p class="maintenance-backup-status">{pinResetStatusText}</p>
  {/if}
  {#if pinError}
    <p class="error">{pinError}</p>
  {/if}
  <button type="button" class="btn-secondary" disabled={locked} onclick={onPinReset}>
    MFA- &amp; Ops-PIN auf 0000 zurücksetzen
  </button>
</div>

<style>
  .maintenance-backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
</style>
