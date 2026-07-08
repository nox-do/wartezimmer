export type MaintenanceExpanderId = 'operations' | 'practice' | 'security' | 'diagnostics';

export function createMaintenanceAccordion(
  root: HTMLElement,
  defaultOpen: MaintenanceExpanderId = 'practice',
): {
  open: (id: MaintenanceExpanderId) => void;
} {
  const expanders = [...root.querySelectorAll<HTMLElement>('.maintenance-expander')];

  function setOpen(id: MaintenanceExpanderId | null): void {
    for (const expander of expanders) {
      const expanderId = expander.dataset.expanderId as MaintenanceExpanderId | undefined;
      const trigger = expander.querySelector<HTMLButtonElement>('.maintenance-expander-trigger');
      const panel = expander.querySelector<HTMLElement>('.maintenance-expander-panel');
      if (!trigger || !panel || !expanderId) {
        continue;
      }
      const isOpen = expanderId === id;
      expander.classList.toggle('is-open', isOpen);
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      panel.hidden = !isOpen;
    }
  }

  for (const expander of expanders) {
    const expanderId = expander.dataset.expanderId as MaintenanceExpanderId | undefined;
    const trigger = expander.querySelector<HTMLButtonElement>('.maintenance-expander-trigger');
    if (!trigger || !expanderId) {
      continue;
    }
    trigger.addEventListener('click', () => {
      if (expander.classList.contains('is-open')) {
        setOpen(null);
        return;
      }
      setOpen(expanderId);
    });
  }

  setOpen(defaultOpen);

  return {
    open: setOpen,
  };
}
