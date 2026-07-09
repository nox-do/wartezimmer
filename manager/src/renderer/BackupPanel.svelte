<script lang="ts">
  import IconButton from './IconButton.svelte';
  import { backupInfoText } from './maintenance-view-model.js';

  let {
    latestBackupPath,
    envExists,
    pinResetStatusText = '',
    busy = false,
    onBackup,
    onPinReset,
  }: {
    latestBackupPath: string | null;
    envExists: boolean | undefined;
    pinResetStatusText?: string;
    busy?: boolean;
    onBackup: () => void;
    onPinReset: () => void;
  } = $props();
</script>

<div class="panel-section">
  <div class="panel-section-heading">
    <h2>Sicherung (.env)</h2>
    <IconButton
      icon="info"
      class="btn-icon-muted info-tip-trigger"
      ariaLabel="Hilfe zur .env-Sicherung"
      describedBy="maintenance-backup-tip"
    />
    <div id="maintenance-backup-tip" class="info-tip-panel" role="tooltip">
      <p>
        Sichert die Konfigurationsdatei im Install-Home und öffnet einen Speichern-Dialog zum Download
        (LAN-IP, Secrets, Import-/Export-Pfade). Datenbank-Volumes und Staff-PINs werden nicht
        mitgesichert.
      </p>
      <p>
        Wiederherstellen: gewünschte <code>.env.backup-*</code> manuell über die aktuelle
        <code>.env</code> kopieren (vorher Stack stoppen), danach neu starten. Kein automatischer
        Restore in dieser Version.
      </p>
    </div>
  </div>
  <p class="maintenance-backup-status">{backupInfoText(latestBackupPath, envExists)}</p>
  <button type="button" class="btn-secondary" disabled={busy} onclick={onBackup}>.env sichern</button>
</div>

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
  <button type="button" class="btn-secondary" disabled={busy} onclick={onPinReset}>
    MFA- &amp; Ops-PIN auf 0000 zurücksetzen
  </button>
</div>
