<script lang="ts">
  import FolderPathField from './FolderPathField.svelte';
  import { fileSharingHintText, storageWarningText, storagePathsChanged } from './maintenance-view-model.js';
  import type { ComposeStatus, HostStatus } from '../shared/host-status.js';

  let {
    hostPlatform,
    status,
    compose,
    importsHostPath,
    exportsHostPath,
    storageStatusText = '',
    locked = false,
    error = null,
    onImportsChange,
    onExportsChange,
    onBrowseImports,
    onBrowseExports,
    onApply,
  }: {
    hostPlatform: string;
    status: HostStatus | null;
    compose: ComposeStatus | null;
    importsHostPath: string;
    exportsHostPath: string;
    storageStatusText?: string;
    locked?: boolean;
    error?: string | null;
    onImportsChange: (value: string) => void;
    onExportsChange: (value: string) => void;
    onBrowseImports: () => void | Promise<string | null>;
    onBrowseExports: () => void | Promise<string | null>;
    onApply: () => void;
  } = $props();

  const fileSharingHint = $derived(fileSharingHintText(hostPlatform));
  const warning = $derived(
    storageWarningText(
      compose?.running ?? false,
      storagePathsChanged(importsHostPath, exportsHostPath, status?.folders),
    ),
  );
</script>

<div class="panel-section">
  <h2>Import &amp; Export</h2>
  <p class="hint">
    Host-Ordner für Docker-Bind-Mounts (<code>/imports</code>, <code>/exports</code>). Kontakt-CSV und
    MFA-Exporte landen hier auf dem Rechner.
  </p>
  {#if fileSharingHint}
    <p class="hint">{fileSharingHint}</p>
  {/if}
  <FolderPathField
    label="Importordner"
    value={importsHostPath}
    disabled={locked}
    onChange={onImportsChange}
    onBrowse={onBrowseImports}
  />
  <FolderPathField
    label="Exportordner"
    value={exportsHostPath}
    disabled={locked}
    onChange={onExportsChange}
    onBrowse={onBrowseExports}
  />
  {#if warning}
    <p class="hint">{warning}</p>
  {/if}
  <div class="actions-row">
    <button type="button" class="btn-secondary" disabled={locked} onclick={onApply}>Übernehmen</button>
  </div>
  {#if storageStatusText}
    <p class="maintenance-backup-status">{storageStatusText}</p>
  {/if}
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>
