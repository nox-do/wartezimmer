const tabs = document.querySelector('.visit-tabs');
const stages = tabs ? [...tabs.querySelectorAll('[data-stage]')] : [];
const panels = [...document.querySelectorAll('[data-panel]')];

function selectStage(name, focus = false) {
  if (!stages.some((button) => button.dataset.stage === name)) return;
  stages.forEach((button) => {
    const selected = button.dataset.stage === name;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

if (tabs) {
  tabs.hidden = false;
  tabs.setAttribute('role', 'tablist');
  stages.forEach((button) => {
    const name = button.dataset.stage;
    button.id = `tab-${name}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `visit-${name}`);
    const panel = document.getElementById(`visit-${name}`);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    button.addEventListener('click', () => selectStage(name));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = stages.indexOf(button);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? stages.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + stages.length) % stages.length;
      selectStage(stages[next].dataset.stage, true);
    });
  });
  selectStage('ankommen');
  const selectFromHash = () => {
    const panel = panels.find((item) => `#${item.id}` === location.hash);
    if (panel) selectStage(panel.dataset.panel);
  };
  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
  document.querySelectorAll('[data-visit]').forEach((link) => {
    link.addEventListener('click', () => selectStage(link.dataset.visit));
  });
}
const overviewDialog = document.querySelector('.overview-dialog');
if (overviewDialog) {
  const openOverview = () => {
    if (!overviewDialog.open) overviewDialog.showModal();
  };
  document.querySelectorAll('[data-open-overview], a[href="#wz-ueberblick"]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openOverview();
    });
  });
  overviewDialog
    .querySelector('[data-close-overview]')
    .addEventListener('click', () => overviewDialog.close());
  const revealOverview = () => {
    if (location.hash === '#wz-ueberblick') openOverview();
  };
  window.addEventListener('hashchange', revealOverview);
  revealOverview();
}

if (overviewDialog) {
  const pins = [...overviewDialog.querySelectorAll('[data-overview-note]')];
  pins.forEach((pin) => {
    pin.addEventListener('click', () => {
      pins.forEach((item) => item.setAttribute('aria-pressed', String(item === pin)));
      overviewDialog.querySelectorAll('.overview-note').forEach((note) => {
        const selected = note.id === `note-${pin.dataset.overviewNote}`;
        note.classList.toggle('is-active', selected);
        if (selected) note.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      });
    });
  });
}

document.querySelectorAll('[data-gallery]').forEach((gallery) => {
  const slides = [...gallery.querySelectorAll('[data-gallery-slide]')];
  if (slides.length < 2) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;

  function nextSlide() {
    index = (index + 1) % slides.length;
    slides.forEach((slide, i) => {
      slide.hidden = i !== index;
    });
  }

  function syncPlayback() {
    clearInterval(timer);
    if (reducedMotion.matches || document.hidden) return;
    timer = setInterval(() => {
      const bounds = gallery.getBoundingClientRect();
      const visibleHeight = Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0);
      if (bounds.height <= 0 || visibleHeight < bounds.height * 0.25) return;
      nextSlide();
    }, 2000);
  }
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
  syncPlayback();
});
