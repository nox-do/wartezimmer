const EASTER_EGG_CLICK_COUNT = 7;

let triggerEasterEggCountdown = EASTER_EGG_CLICK_COUNT;

export function resetClockEasterEggCountdown(): void {
  triggerEasterEggCountdown = EASTER_EGG_CLICK_COUNT;
}

export function handleClockEasterEggClick(target: EventTarget | null, onTrigger: () => void): void {
  if (triggerEasterEggCountdown === EASTER_EGG_CLICK_COUNT && target instanceof HTMLElement) {
    target.removeEventListener('mouseleave', resetClockEasterEggCountdown);
    target.addEventListener('mouseleave', resetClockEasterEggCountdown, {
      once: true,
      passive: true,
    });
  }

  triggerEasterEggCountdown -= 1;

  if (triggerEasterEggCountdown === 0) {
    onTrigger();
    triggerEasterEggCountdown = EASTER_EGG_CLICK_COUNT;
  }
}
