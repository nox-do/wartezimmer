<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    fetchDeploymentStorage,
    fetchOpsSystemSettings,
    patchOpsSystemSettings,
    previewContactLookup,
    validateContactLookup,
    type ContactLookupLayout,
    type CsvContactDelimiterMode,
    type CsvContactLookupMapping,
  } from '$lib/ops/ops-system-api';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  type MappingField = keyof CsvContactLookupMapping;

  const DEFAULT_MAPPING: CsvContactLookupMapping = {
    mobile: 'mobil',
    firstName: 'vorname',
    lastName: 'nachname',
    birthDate: 'geburtsdatum',
  };

  interface Props {
    variant?: 'settings' | 'setup';
    idPrefix?: string;
    disabled?: boolean;
    importsFolderLabel?: string;
    initialReady?: boolean;
    onReadyChange?: (ready: boolean) => void;
  }

  let {
    variant = 'settings',
    idPrefix = variant === 'setup' ? 'setup' : 'ops',
    disabled = false,
    importsFolderLabel = '',
    initialReady = false,
    onReadyChange,
  }: Props = $props();

  let loading = $state(true);
  let busy = $state(false);
  let previewBusy = $state(false);
  let importFolders = $state<{ label: string; containerPath: string }[]>([]);
  let importsHostPath = $state('');
  let selectedFolderPath = $state('');
  let delimiterMode = $state<CsvContactDelimiterMode>('semicolon');
  let hasHeader = $state(true);
  let mapping = $state<CsvContactLookupMapping>({ ...DEFAULT_MAPPING });
  let testedOk = $state(false);
  let allowAutoApplySuggestions = $state(true);
  let lastSuggestedMapping = $state<Partial<CsvContactLookupMapping>>({});
  let previewLayout = $state<ContactLookupLayout | null>(null);
  let previewColumns = $state<string[]>([]);
  let previewRows = $state<string[][]>([]);
  let previewStats = $state({ csvFileCount: 0, patientCount: 0, sampleSourceFile: '', scannedAt: '' });

  const fieldDisabled = $derived(disabled || busy);
  const folderHostLabel = $derived(importsHostPath || importsFolderLabel);
  const mappingFields: MappingField[] = ['mobile', 'lastName', 'firstName', 'birthDate'];
  const optionalFields = new Set<MappingField>(['lastName', 'firstName', 'birthDate']);

  const fieldLabels: Record<MappingField, () => string> = {
    mobile: () => t('ops.contactsColMobile'),
    lastName: () => t('ops.contactsColLastName'),
    firstName: () => t('ops.contactsColFirstName'),
    birthDate: () => t('ops.contactsColBirthDate'),
  };

  function layoutLabel(layout: ContactLookupLayout): string {
    if (layout === 'list') {
      return t('ops.contactsLayoutList');
    }
    if (layout === 'per_patient') {
      return t('ops.contactsLayoutPerPatient');
    }
    return t('ops.contactsLayoutMixed');
  }

  function formatScanTime(iso: string): string {
    if (!iso) {
      return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString();
  }

  function resetValidationState() {
    testedOk = false;
    onReadyChange?.(false);
  }

  function resetScanState() {
    allowAutoApplySuggestions = true;
    previewLayout = null;
    previewColumns = [];
    previewRows = [];
    previewStats = { csvFileCount: 0, patientCount: 0, sampleSourceFile: '', scannedAt: '' };
    resetValidationState();
  }

  function mappingSelectValue(field: MappingField): string {
    const value = mapping[field];
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function clearMappingField(field: MappingField) {
    const next = { ...mapping };
    delete next[field];
    mapping = next;
    resetValidationState();
  }

  function assignMappingField(field: MappingField, value: string | number) {
    const next = { ...mapping };
    for (const other of mappingFields) {
      if (other === field) {
        continue;
      }
      const otherValue = next[other];
      if (otherValue == null) {
        continue;
      }
      if (hasHeader ? otherValue === value : otherValue === value) {
        if (other === 'mobile') {
          continue;
        }
        delete next[other];
      }
    }
    next[field] = value;
    mapping = next;
    resetValidationState();
  }

  function handleMappingSelect(field: MappingField, rawValue: string) {
    if (rawValue === '') {
      if (optionalFields.has(field)) {
        clearMappingField(field);
      }
      return;
    }
    const value = hasHeader ? rawValue : Number.parseInt(rawValue, 10);
    if (!hasHeader && Number.isNaN(value)) {
      return;
    }
    assignMappingField(field, value);
  }

  function columnSample(columnIndex: number): string {
    const sample = previewRows[0]?.[columnIndex]?.trim() ?? '';
    if (!sample) {
      return '';
    }
    return sample.length > 28 ? `${sample.slice(0, 25)}…` : sample;
  }

  function isColumnMapped(column: string, columnIndex: number): MappingField | null {
    for (const field of mappingFields) {
      const value = mapping[field];
      if (value == null) {
        continue;
      }
      if (hasHeader ? value === column : value === columnIndex) {
        return field;
      }
    }
    return null;
  }

  function buildMappingPayload(): CsvContactLookupMapping {
    const payload: CsvContactLookupMapping = { mobile: mapping.mobile };
    if (mapping.lastName != null) {
      payload.lastName = mapping.lastName;
    }
    if (mapping.firstName != null) {
      payload.firstName = mapping.firstName;
    }
    if (mapping.birthDate != null) {
      payload.birthDate = mapping.birthDate;
    }
    return payload;
  }

  function buildPayload() {
    return {
      contactLookupFolderPath: selectedFolderPath || null,
      contactLookupDelimiterMode: delimiterMode,
      contactLookupHasHeader: hasHeader,
      contactLookupMapping: buildMappingPayload(),
    };
  }

  function buildScanBody() {
    return {
      contactLookupFolderPath: selectedFolderPath,
      contactLookupDelimiterMode: delimiterMode,
      contactLookupHasHeader: hasHeader,
      contactLookupMapping: buildMappingPayload(),
    };
  }

  async function reloadFolders() {
    const storageResult = await fetchDeploymentStorage();
    if (!storageResult.ok) {
      toastStore.error(storageResult.error.message || t('ops.loadError'));
      return;
    }
    importFolders = storageResult.data.imports.importFolders;
    importsHostPath = storageResult.data.imports.userFolderLabel;
    if (!selectedFolderPath && importFolders.length > 0) {
      selectedFolderPath = importFolders[0]!.containerPath;
    }
  }

  function applySuggestedMapping(suggested: Partial<CsvContactLookupMapping>) {
    mapping = {
      mobile: suggested.mobile ?? mapping.mobile,
      firstName: suggested.firstName ?? mapping.firstName,
      lastName: suggested.lastName ?? mapping.lastName,
      birthDate: suggested.birthDate ?? mapping.birthDate,
    };
    resetValidationState();
  }

  async function runPreview() {
    if (!selectedFolderPath) {
      return;
    }
    previewBusy = true;
    try {
      const result = await previewContactLookup(buildScanBody());
      if (!result.ok) {
        previewLayout = null;
        previewColumns = [];
        previewRows = [];
        toastStore.error(result.error.message || t('ops.loadError'));
        return;
      }
      previewLayout = result.data.layout;
      previewColumns = result.data.columns;
      previewRows = result.data.sampleRows;
      previewStats = {
        csvFileCount: result.data.csvFileCount,
        patientCount: result.data.patientCount,
        sampleSourceFile: result.data.sampleSourceFile,
        scannedAt: result.data.scannedAt,
      };
      lastSuggestedMapping = result.data.suggestedMapping;
      if (allowAutoApplySuggestions) {
        applySuggestedMapping(result.data.suggestedMapping);
        allowAutoApplySuggestions = false;
      } else {
        resetValidationState();
      }
    } finally {
      previewBusy = false;
    }
  }

  async function load() {
    const [settingsResult] = await Promise.all([fetchOpsSystemSettings(), reloadFolders()]);
    loading = false;

    if (!settingsResult.ok) {
      toastStore.error(settingsResult.error.message || t('ops.contactsLoadError'));
      return;
    }

    const s = settingsResult.data;
    delimiterMode = s.contactLookupDelimiterMode;
    hasHeader = s.contactLookupHasHeader;
    mapping = { ...s.contactLookupMapping };
    selectedFolderPath = s.contactLookupFolderPath ?? importFolders[0]?.containerPath ?? '';

    if (selectedFolderPath) {
      await runPreview();
      if (variant === 'setup' && initialReady) {
        testedOk = true;
        onReadyChange?.(true);
      }
    }
  }

  async function handleValidate() {
    if (!selectedFolderPath) {
      return;
    }
    busy = true;
    try {
      const result = await validateContactLookup(buildScanBody());
      if (!result.ok) {
        resetValidationState();
        toastStore.error(result.error.message || t('ops.loadError'));
        return;
      }
      testedOk = variant === 'settings';
      if (variant === 'setup') {
        onReadyChange?.(false);
      }
      toastStore.success(
        tf('ops.contactsValidateOk', {
          mode: result.data.detectedDelimiterMode,
          layout: layoutLabel(result.data.layout),
          files: String(result.data.csvFileCount),
          patients: String(result.data.patientCount),
        }),
      );
    } finally {
      busy = false;
    }
  }

  async function handleSave() {
    if (!selectedFolderPath) {
      return;
    }
    busy = true;
    try {
      const validateResult = await validateContactLookup(buildScanBody());
      if (!validateResult.ok) {
        resetValidationState();
        toastStore.error(validateResult.error.message || t('ops.loadError'));
        return;
      }

      const saveResult = await patchOpsSystemSettings(buildPayload());
      if (!saveResult.ok) {
        resetValidationState();
        toastStore.error(saveResult.error.message || t('ops.loadError'));
        return;
      }

      testedOk = true;
      toastStore.success(t('ops.contactsSaveOk'));
    } finally {
      busy = false;
    }
  }

  async function handleTestAndSave() {
    if (!selectedFolderPath) {
      return;
    }
    busy = true;
    try {
      const validateResult = await validateContactLookup(buildScanBody());
      if (!validateResult.ok) {
        resetValidationState();
        toastStore.error(validateResult.error.message || t('ops.loadError'));
        return;
      }

      const saveResult = await patchOpsSystemSettings(buildPayload());
      if (!saveResult.ok) {
        resetValidationState();
        toastStore.error(saveResult.error.message || t('ops.loadError'));
        return;
      }

      testedOk = true;
      onReadyChange?.(true);
      toastStore.success(
        tf('ops.contactsValidateOk', {
          mode: validateResult.data.detectedDelimiterMode,
          layout: layoutLabel(validateResult.data.layout),
          files: String(validateResult.data.csvFileCount),
          patients: String(validateResult.data.patientCount),
        }),
      );
    } finally {
      busy = false;
    }
  }

  function handleResetMapping() {
    mapping = { ...DEFAULT_MAPPING };
    resetValidationState();
  }

  onMount(() => {
    void load();
  });
</script>

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  {#if variant === 'setup'}
    <div class="staff-actions">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fieldDisabled}
        onclick={() => void reloadFolders()}
      >
        {t('ops.setup.contactsReloadFolders')}
      </Button>
    </div>
  {/if}

  <div class="staff-form-grid">
    <div class="staff-form-row">
      <label for="{idPrefix}-folder-select">{t('ops.contactsFolderLabel')}</label>
      {#if folderHostLabel}
        <p class="contact-lookup-folder-hint text-desc">
          {t('ops.contactsFolderHostHint')}
          <code>{folderHostLabel}</code>.
          {t('ops.contactsFolderHostHintSub')}
        </p>
      {/if}
      {#if importFolders.length === 0}
        <p class="text-desc">{t('ops.contactsFolderEmpty')}</p>
      {:else}
        <select
          id="{idPrefix}-folder-select"
          class="form-select"
          bind:value={selectedFolderPath}
          disabled={fieldDisabled}
          onchange={() => {
            resetScanState();
            void runPreview();
          }}
        >
          {#each importFolders as folder (folder.containerPath)}
            <option value={folder.containerPath}>{folder.label}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="staff-form-row">
      <label for="{idPrefix}-delimiter">{t('ops.contactsDelimiterLabel')}</label>
      <select
        id="{idPrefix}-delimiter"
        class="form-select"
        bind:value={delimiterMode}
        disabled={fieldDisabled}
        onchange={() => {
          allowAutoApplySuggestions = true;
          resetValidationState();
          void runPreview();
        }}
      >
        <option value="auto">auto</option>
        <option value="semicolon">;</option>
        <option value="comma">,</option>
        <option value="tab">Tab</option>
      </select>
    </div>

    <div class="staff-form-row staff-form-row staff-form-row--inline">
      <input
        id="{idPrefix}-has-header"
        type="checkbox"
        bind:checked={hasHeader}
        disabled={fieldDisabled}
        onchange={() => {
          allowAutoApplySuggestions = true;
          resetValidationState();
          void runPreview();
        }}
      />
      <label for="{idPrefix}-has-header">{t('ops.contactsHeaderLabel')}</label>
    </div>
  </div>

  <div class="staff-actions">
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={previewBusy}
      disabled={fieldDisabled || !selectedFolderPath}
      onclick={() => void runPreview()}
    >
      {t('ops.contactsScan')}
    </Button>
  </div>

  {#if previewLayout}
    <section class="contact-lookup-scan panel panel--inset" aria-label={t('ops.contactsScanResultTitle')}>
      <h3 class="section-kicker">{t('ops.contactsScanResultTitle')}</h3>
      <dl class="dl-rows">
        <div>
          <dt>{t('ops.contactsScanResultScope')}</dt>
          <dd>
            {tf('ops.contactsScanResultScopeValue', {
              files: String(previewStats.csvFileCount),
              patients: String(previewStats.patientCount),
            })}
          </dd>
        </div>
        <div>
          <dt>{t('ops.contactsScanResultMode')}</dt>
          <dd>{layoutLabel(previewLayout)}</dd>
        </div>
        {#if previewStats.scannedAt}
          <div>
            <dt>{t('ops.contactsScanResultAt')}</dt>
            <dd>{formatScanTime(previewStats.scannedAt)}</dd>
          </div>
        {/if}
        {#if previewStats.sampleSourceFile}
          <div>
            <dt>{t('ops.contactsScanResultPreview')}</dt>
            <dd><code>{previewStats.sampleSourceFile}</code></dd>
          </div>
        {/if}
      </dl>
      {#if previewLayout === 'mixed'}
        <p class="contact-lookup-warning">{t('ops.contactsMixedLayoutWarning')}</p>
      {/if}
    </section>
  {/if}

  <aside class="alert alert--info">
    <p>{t('ops.contactsDayRefreshHint')}</p>
  </aside>

  {#if previewColumns.length > 0}
    <div class="contact-lookup-mapping">
      <h3 class="contact-lookup-mapping__title">{t('ops.contactsMappingTitle')}</h3>
      <p class="text-desc">{t('ops.contactsMappingHint')}</p>
      <div class="contact-lookup-mapping-actions staff-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fieldDisabled}
          onclick={() => applySuggestedMapping(lastSuggestedMapping)}
        >
          {t('ops.contactsApplySuggestions')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fieldDisabled}
          onclick={handleResetMapping}
        >
          {t('ops.contactsResetMapping')}
        </Button>
      </div>

      <div class="contact-lookup-map" role="table" aria-label={t('ops.contactsMappingHint')}>
        <div class="contact-lookup-map__header" role="row">
          <div class="contact-lookup-map__cell contact-lookup-map__cell--system" role="columnheader">
            {t('ops.contactsMappingSystemColumn')}
          </div>
          <div class="contact-lookup-map__cell contact-lookup-map__cell--arrow" role="columnheader" aria-hidden="true"></div>
          <div class="contact-lookup-map__cell contact-lookup-map__cell--source" role="columnheader">
            {t('ops.contactsMappingSourceColumn')}
          </div>
        </div>

        {#each mappingFields as field (field)}
          <div class="contact-lookup-map__row" role="row">
            <div class="contact-lookup-map__cell contact-lookup-map__cell--system" role="cell">
              <span class="contact-lookup-map__field-name">{fieldLabels[field]()}</span>
              <span
                class="contact-lookup-map__field-meta"
                class:contact-lookup-map__field-meta--required={field === 'mobile'}
              >
                {field === 'mobile' ? t('ops.contactsMappingRequired') : t('ops.contactsMappingOptional')}
              </span>
            </div>
            <div class="contact-lookup-map__cell contact-lookup-map__cell--arrow" role="cell" aria-hidden="true">
              <span class="contact-lookup-map__arrow">→</span>
            </div>
            <div class="contact-lookup-map__cell contact-lookup-map__cell--source" role="cell">
              <select
                id="{idPrefix}-mapping-{field}"
                class="form-select"
                value={mappingSelectValue(field)}
                disabled={fieldDisabled}
                onchange={(event) => {
                  handleMappingSelect(field, event.currentTarget.value);
                }}
              >
                {#if optionalFields.has(field)}
                  <option value="">{t('ops.contactsMappingUnmapped')}</option>
                {/if}
                {#each previewColumns as column, columnIndex (columnIndex)}
                  {@const optionValue = hasHeader ? column : String(columnIndex)}
                  {@const sample = columnSample(columnIndex)}
                  <option value={optionValue}>
                    {hasHeader ? column : column}
                    {sample ? ` · ${sample}` : ''}
                  </option>
                {/each}
              </select>
            </div>
          </div>
        {/each}
      </div>

      <p class="section-kicker">{t('ops.contactsMappingPreviewTitle')}</p>
      <div class="contact-lookup-preview-wrap">
        <table class="contact-lookup-preview">
          <thead>
            <tr>
              {#each previewColumns as column, columnIndex (columnIndex)}
                {@const mappedField = isColumnMapped(column, columnIndex)}
                <th class:contact-lookup-preview__col--mapped={mappedField != null}>
                  <div class="contact-lookup-preview__head">
                    <span class="contact-lookup-preview__column">{column}</span>
                    {#if mappedField}
                      <span class="pill pill--info">→ {fieldLabels[mappedField]()}</span>
                    {/if}
                  </div>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each previewRows as row, rowIndex (rowIndex)}
              <tr>
                {#each previewColumns as _column, columnIndex (columnIndex)}
                  <td class:contact-lookup-preview__col--mapped={isColumnMapped(_column, columnIndex) != null}>
                    {row[columnIndex] ?? ''}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <div class="staff-actions">
    {#if variant === 'setup'}
      <Button
        type="button"
        variant="primary"
        loading={busy}
        disabled={fieldDisabled || !selectedFolderPath || previewLayout === 'mixed'}
        onclick={() => void handleTestAndSave()}
      >
        {t('ops.setup.contactsTestAndSave')}
      </Button>
    {:else}
      <Button
        type="button"
        variant="outline"
        loading={busy}
        disabled={fieldDisabled || !selectedFolderPath || previewLayout === 'mixed'}
        onclick={() => void handleValidate()}
      >
        {t('ops.contactsValidate')}
      </Button>
      <Button
        type="button"
        variant="primary"
        loading={busy}
        disabled={fieldDisabled || !selectedFolderPath || previewLayout === 'mixed'}
        onclick={() => void handleSave()}
      >
        {t('ops.contactsSave')}
      </Button>
    {/if}
  </div>

  {#if variant === 'setup' && (testedOk || initialReady)}
    <p class="text-desc">{t('ops.setup.contactsOwnReady')}</p>
  {/if}
{/if}

