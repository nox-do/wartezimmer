<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import TerminalReceiptBon from '$lib/components/terminal/TerminalReceiptBon.svelte';
  import { terminalReceiptPrint } from '$lib/terminal/terminal-receipt-print.svelte';
  import type { TerminalReceiptPrintPayload } from '$lib/terminal/terminal-receipt-print.svelte';
  import { markTicketPrinted } from '$lib/terminal/terminal-print-settings';
  import {
    dequeueNext,
    PRINT_AFTERPRINT_TIMEOUT_MS,
    type ReceiptPrintJob,
  } from '$lib/terminal/terminal-receipt-print-queue';

  let activePayload = $state<TerminalReceiptPrintPayload | null>(terminalReceiptPrint.queue[0]?.payload ?? null);
  let pageStyleEl = $state<HTMLStyleElement | null>(null);
  let printing = $state(false);
  let currentJob = $state<ReceiptPrintJob | null>(null);
  let afterPrintTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);

  function syncPageStyle(widthMm: number) {
    pageStyleEl?.remove();
    const style = document.createElement('style');
    style.setAttribute('data-terminal-receipt-page', 'true');
    style.textContent = `@media print { @page { size: ${widthMm}mm auto; margin: 2mm; } }`;
    document.head.appendChild(style);
    pageStyleEl = style;
  }

  function clearAfterPrintTimeout() {
    if (afterPrintTimeoutId != null) {
      clearTimeout(afterPrintTimeoutId);
      afterPrintTimeoutId = null;
    }
  }

  function clearPrintDomState() {
    document.body.classList.remove('terminal-receipt-print-active');
    pageStyleEl?.remove();
    pageStyleEl = null;
    activePayload = null;
  }

  function completePrintJob() {
    if (!printing) {
      return;
    }

    const finished = currentJob;
    clearAfterPrintTimeout();
    printing = false;
    currentJob = null;
    clearPrintDomState();

    if (
      finished?.payload.kind === 'ticket' &&
      finished.payload.visitId &&
      finished.payload.visitId.trim()
    ) {
      markTicketPrinted(finished.payload.visitId);
    }

    drainQueue();
  }

  function drainQueue() {
    if (printing || typeof window === 'undefined') {
      return;
    }

    const { remaining, job } = dequeueNext(terminalReceiptPrint.queue);
    if (!job) {
      return;
    }

    terminalReceiptPrint.queue = remaining;
    runPrint(job);
  }

  function runPrint(job: ReceiptPrintJob) {
    if (printing || typeof window === 'undefined') {
      return;
    }

    printing = true;
    currentJob = job;
    activePayload = job.payload;
    syncPageStyle(terminalReceiptPrint.printWidthMm);
    document.body.classList.add('terminal-receipt-print-active');

    const onAfterPrint = () => {
      window.removeEventListener('afterprint', onAfterPrint);
      completePrintJob();
    };
    window.addEventListener('afterprint', onAfterPrint);

    clearAfterPrintTimeout();
    afterPrintTimeoutId = setTimeout(() => {
      window.removeEventListener('afterprint', onAfterPrint);
      completePrintJob();
    }, PRINT_AFTERPRINT_TIMEOUT_MS);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  $effect(() => {
    const queueLength = terminalReceiptPrint.queue.length;
    if (queueLength === 0 || printing) {
      return;
    }
    drainQueue();
  });

  onMount(() => {
    return () => {
      clearAfterPrintTimeout();
      printing = false;
      currentJob = null;
      clearPrintDomState();
    };
  });
</script>

{#if activePayload}
  <div
    class="terminal-receipt-print-layer"
    use:portal={{ zIndex: 1, className: 'terminal-receipt-print-portal' }}
  >
    <TerminalReceiptBon payload={activePayload} />
  </div>
{/if}
