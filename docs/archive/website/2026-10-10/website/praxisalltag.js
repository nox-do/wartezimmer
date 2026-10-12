document.querySelectorAll('.p-wish-image').forEach((button) => {
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.p-image-hint').textContent = active
      ? 'Graustufen anzeigen'
      : 'In Farbe entdecken';
  });
});
