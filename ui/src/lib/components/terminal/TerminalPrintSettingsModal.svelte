<script lang="ts">
  import FormField from '$lib/components/forms/FormField.svelte';
  import { browser } from '$app/environment';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    getPracticeProfileFallback,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import {
    downloadWindowsBatLauncher,
    downloadWindowsPs1Launcher,
    resolveTerminalKioskUrl,
  } from '$lib/terminal/terminal-kiosk-launcher';
  import {
    requestTerminalReceiptPrint,
    setTerminalPrintWidthMm,
    terminalReceiptPrint,
  } from '$lib/terminal/terminal-receipt-print.svelte';
  import {
    TERMINAL_PRINT_WIDTH_OPTIONS,
    type TerminalPrintWidthMm,
  } from '$lib/terminal/terminal-print-settings';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  let { open = $bindable(false), onClose }: Props = $props();

  let draftWidthMm = $state<TerminalPrintWidthMm>(terminalReceiptPrint.printWidthMm);

  const terminalKioskUrl = $derived(
    browser ? resolveTerminalKioskUrl(window.location.origin) : '/terminal',
  );

  const setupSteps = $derived([
    t('terminal.printSettingsSetupStep1'),
    t('terminal.printSettingsSetupStep2'),
    t('terminal.printSettingsSetupStep3'),
    tf('terminal.printSettingsSetupStep4', { width: draftWidthMm }),
  ]);

  $effect(() => {
    if (open) {
      draftWidthMm = terminalReceiptPrint.printWidthMm;
    }
  });

  function formatReceiptTimestamp(): string {
    return new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function saveWidth(widthMm: TerminalPrintWidthMm) {
    draftWidthMm = widthMm;
    setTerminalPrintWidthMm(widthMm);
  }

  function runTestPrint() {
    const practiceName = practiceDisplayLabel(
      getPracticeProfileFallback(),
      t('terminal.practiceFallback'),
    );
    requestTerminalReceiptPrint({
      practiceName,
      ticketCode: t('terminal.printSettingsTestTicket'),
      topicLabel: t('terminal.printSettingsTestTopic'),
      printedAtLabel: formatReceiptTimestamp(),
      kind: 'test',
    });
  }

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

<Modal
  bind:open
  title={t('terminal.printSettingsTitle')}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="560px"
  dimBackdrop={true}
  closeOnBackdropClick={true}
  onClose={handleClose}
>
  <div class="modal-form">
    <p class="modal-form-hint">{t('terminal.printSettingsLead')}</p>

    <div class="modal-form-field">
      <span>{t('terminal.printSettingsSetupTitle')}</span>
      <ol class="terminal-print-settings-steps">
        {#each setupSteps as step, index (index)}
          <li>{step}</li>
        {/each}
      </ol>
    </div>

    <fieldset class="modal-form-field">
      <legend>{t('terminal.printSettingsWidthLabel')}</legend>
      <div role="radiogroup" aria-label={t('terminal.printSettingsWidthLabel')}>
        {#each TERMINAL_PRINT_WIDTH_OPTIONS as widthMm (widthMm)}
          <label class="modal-form-check">
            <input
              type="radio"
              name="terminal-print-width"
              value={widthMm}
              checked={draftWidthMm === widthMm}
              onchange={() => saveWidth(widthMm)}
            />
            <span>{tf('terminal.printSettingsWidthOption', { width: widthMm })}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="modal-form-field">
      <span>{t('terminal.printSettingsChromeTitle')}</span>
      <p class="modal-form-hint">{t('terminal.printSettingsChromeLead')}</p>
    </div>

    <FormField label={t('terminal.printSettingsLauncherUrlLabel')}>
      {#snippet children(field)}
        <input {...field} class="form-input modal-form-id-input" readonly value={terminalKioskUrl} />
      {/snippet}
    </FormField>

    <p class="modal-form-hint">{t('terminal.printSettingsLauncherNote')}</p>
    <div class="terminal-print-downloads">
        <Button variant="outline" onclick={() => downloadWindowsBatLauncher(terminalKioskUrl)}>
          {t('terminal.printSettingsDownloadBat')}
        </Button>
        <Button variant="outline" onclick={() => downloadWindowsPs1Launcher(terminalKioskUrl)}>
          {t('terminal.printSettingsDownloadPs1')}
        </Button>
      </div>

    <div class="form-actions">
      <Button variant="secondary" onclick={runTestPrint}>
        {t('terminal.printSettingsTestPrint')}
      </Button>
      <Button variant="primary" onclick={handleClose}>
        {t('terminal.printSettingsDone')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .terminal-print-settings-steps {
    margin: 0;
    padding-left: 1.2rem;
    font-size: var(--text-base);
    font-weight: 400;
    line-height: 1.45;
    color: var(--foreground);
  }

  .terminal-print-settings-steps li + li {
    margin-top: 0.35rem;
  }

  .terminal-print-downloads {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
