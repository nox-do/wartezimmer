<script lang="ts">
  import IconButton from './IconButton.svelte';
  import { backupInfoText } from './maintenance-view-model.js';

  let {
    latestBackupPath,
    envExists,
    backupStatusText = '',
    pinResetStatusText = '',
    busy = false,
    onBackup,
    onValidateBackup,
    onRestore,
    onPinReset,
  }: {
    latestBackupPath: string | null;
    envExists: boolean | undefined;
    backupStatusText?: string;
    pinResetStatusText?: string;
    busy?: boolean;
    onBackup: () => void;
    onValidateBackup: () => void;
    onRestore: () => void;
    onPinReset: () => void;
  } = $props();
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
    <button type="button" class="btn-secondary" disabled={busy} onclick={onBackup}>
      Backup erstellen
    </button>
    <button type="button" class="btn-secondary" disabled={busy} onclick={onValidateBackup}>
      Backup prüfen
    </button>
    <button type="button" class="btn-secondary" disabled={busy} onclick={onRestore}>
      Wiederherstellen …
    </button>
  </div>
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

<style>
  .maintenance-backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
</style>
