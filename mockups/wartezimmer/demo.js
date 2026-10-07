(() => {
  const root = document.getElementById('wz-concept');
  if (!root) return;
  const demo = { step: 0, view: 'team' };
  const qs = (id) => root.querySelector('#' + id);
  const stages = [
    {
      title: 'Neue Anmeldung',
      state: 'Angemeldet',
      location: 'Anmeldung',
      next: 'Wartezimmer',
      team: 'Die Anmeldung erscheint direkt in Ihrer Übersicht.',
      place: 'Anmeldeterminal',
      patient: 'Sie sind angemeldet.',
      patientNext: 'Bitte nehmen Sie im Wartezimmer Platz.',
      detail: 'Ihre Nummer verbindet Sie mit Ihrem Aufruf.',
      caption: 'Eine Nummer begleitet den Besuch.',
      button: 'Weiter zum Warten',
    },
    {
      title: 'Wartende im Blick',
      state: 'Wartet',
      location: 'Wartezimmer',
      next: 'Aufruf durch das Team',
      team: 'Sie sehen Anliegen, Wartezeit und vorgesehenen Raum.',
      place: 'Wartezimmeranzeige',
      patient: 'Ihre Nummer ist erfasst.',
      patientNext: 'Sie werden mit Ihrer Nummer aufgerufen.',
      detail: 'Unterschiedliche Anliegen haben unterschiedliche Abläufe.',
      caption: 'Das Team behält die Übersicht und entscheidet über den Aufruf.',
      button: 'A–014 aufrufen',
    },
    {
      title: 'Patient aufgerufen',
      state: 'Aufgerufen',
      location: 'Weg zu Zimmer 2',
      next: 'Ankunft bestätigen',
      team: 'Der Aufruf erscheint auf dem Wartezimmermonitor.',
      place: 'Wartezimmeranzeige',
      patient: 'Bitte kommen Sie zu uns.',
      patientNext: 'Zimmer 2',
      detail: 'Ihre Nummer und Ihr Ziel. Ohne öffentliche Namensanzeige.',
      caption: 'Eine klare Nachricht zeigt den nächsten Schritt.',
      button: 'Noch einmal ansehen',
    },
  ];
  function renderDemo() {
    const s = stages[demo.step];
    root
      .querySelectorAll('[data-w-step]')
      .forEach((el) =>
        el.setAttribute('aria-pressed', String(Number(el.dataset.wStep) === demo.step)),
      );
    root
      .querySelectorAll('[data-w-view]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.wView === demo.view)));
    qs('wz-team-screen').hidden = demo.view !== 'team';
    qs('wz-patient-screen').hidden = demo.view !== 'patient';
    qs('wz-demo-screen').classList.toggle('is-called', demo.step === 2);
    const values = {
      'wz-screen-title': s.title,
      'wz-state': s.state,
      'wz-location': s.location,
      'wz-next': s.next,
      'wz-team-message': s.team,
      'wz-patient-place': s.place,
      'wz-patient-message': s.patient,
      'wz-patient-next': s.patientNext,
      'wz-patient-detail': s.detail,
      'wz-demo-caption': s.caption,
      'wz-demo-button-label': s.button,
    };
    Object.entries(values).forEach(([id, value]) => {
      qs(id).textContent = value;
    });
  }
  renderDemo();
  root.querySelectorAll('[data-w-step]').forEach((el) =>
    el.addEventListener('click', () => {
      demo.step = Number(el.dataset.wStep);
      renderDemo();
    }),
  );
  root.querySelectorAll('[data-w-view]').forEach((el) =>
    el.addEventListener('click', () => {
      demo.view = el.dataset.wView;
      renderDemo();
    }),
  );
  qs('wz-demo-advance').addEventListener('click', () => {
    demo.step = (demo.step + 1) % 3;
    renderDemo();
  });
  const moduleButtons = [...root.querySelectorAll('[data-w-module]')];
  const modulePanels = [...root.querySelectorAll('[data-w-module-panel]')];
  function selectModule(index) {
    moduleButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.wModule) === index));
    });
    modulePanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.wModulePanel) !== index;
    });
  }
  selectModule(0);
  moduleButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const index = Number(button.dataset.wModule);
      selectModule(index);
      if (window.matchMedia('(max-width: 640px)').matches) {
        modulePanels[index].scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'nearest',
        });
      }
    }),
  );
  const downloadToggle = qs('wz-download-toggle');
  const downloadOpen = qs('wz-download-open');
  const downloadPanel = qs('wz-download-panel');
  function setDownloadsOpen(open) {
    downloadPanel.hidden = !open;
    downloadToggle.setAttribute('aria-expanded', String(open));
    downloadOpen.setAttribute('aria-expanded', String(open));
  }
  downloadToggle.addEventListener('click', () => setDownloadsOpen(downloadPanel.hidden));
  downloadOpen.addEventListener('click', () => setDownloadsOpen(true));
  const carousel = root.querySelector('[data-w-carousel]');
  if (carousel) {
    const buttons = [...carousel.querySelectorAll('[data-w-slide]')];
    const panels = [...carousel.querySelectorAll('[data-w-slide-panel]')];
    let current = 0;
    function selectSlide(index) {
      current = (index + panels.length) % panels.length;
      panels.forEach((panel, i) => {
        panel.hidden = i !== current;
      });
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
      carousel.querySelector('[data-w-carousel-count]').textContent =
        `${current + 1} / ${panels.length}`;
    }
    buttons.forEach((button, i) => button.addEventListener('click', () => selectSlide(i)));
    carousel
      .querySelector('[data-w-carousel-prev]')
      .addEventListener('click', () => selectSlide(current - 1));
    carousel
      .querySelector('[data-w-carousel-next]')
      .addEventListener('click', () => selectSlide(current + 1));
    carousel.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-w-slide], [data-w-carousel-prev], [data-w-carousel-next]'))
        return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectSlide(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? panels.length - 1
            : current + (event.key === 'ArrowRight' ? 1 : -1),
      );
      buttons[current].focus();
    });
    const viewport = carousel.querySelector('[data-w-carousel-viewport]');
    let touchStart = null;
    viewport.addEventListener(
      'touchstart',
      (event) => {
        touchStart =
          event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
      },
      { passive: true },
    );
    viewport.addEventListener(
      'touchend',
      (event) => {
        if (!touchStart || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - touchStart.x;
        const dy = event.changedTouches[0].clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
          selectSlide(current + (dx < 0 ? 1 : -1));
      },
      { passive: true },
    );
    viewport.addEventListener(
      'touchcancel',
      () => {
        touchStart = null;
      },
      { passive: true },
    );
    carousel.querySelector('[data-w-carousel-controls]').hidden = false;
    selectSlide(0);
  }
})();
