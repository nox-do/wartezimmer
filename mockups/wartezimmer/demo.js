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
  root.querySelectorAll('a[href^="#"]').forEach((el) =>
    el.addEventListener('click', (event) => {
      const target = root.querySelector(el.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      }
    }),
  );
})();
