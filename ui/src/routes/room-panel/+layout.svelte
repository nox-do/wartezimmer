<script lang="ts">
  let { children } = $props();
</script>

<div class="room-panel-page">
  {@render children()}
</div>

<style>
  .room-panel-page {
    min-height: 100dvh;
    height: 100dvh;
    background: #f7f7f4;
    color: #151713;
  }

  :global(.room-panel-login) {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    width: 100%;
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  }

  :global(.room-panel-login__shell) {
    width: min(100%, 24rem);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  :global(.room-panel-login__kicker) {
    margin: 0;
    text-align: center;
    font-weight: 800;
    text-transform: uppercase;
    color: #166534 !important;
    letter-spacing: 0.04em;
  }

  :global(.room-panel-login__form) {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1rem;
    border: 1px solid #deded6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 30px rgb(20 23 19 / 8%);
  }

  :global(.room-panel-login__error) {
    margin: 0;
    color: #b42318;
    font-weight: 700;
  }

  :global(.room-panel-pin-login__pin-field) {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  :global(.room-panel-pin-login__pin-label) {
    font-size: 0.875rem;
    font-weight: 600;
    color: #52564d;
  }

  :global(.room-panel-pin-login__pin-display) {
    min-height: 3.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.75rem 1rem;
    border: 2px solid #c7cdc4;
    border-radius: 8px;
    background: #f7f7f4;
    font-size: clamp(1.5rem, 5vw, 2rem);
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #151713;
  }

  :global(.room-panel-pin-login__pin-display--empty) {
    color: #8a9187;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  :global(.room-panel-pin-login__pin-dot) {
    line-height: 1;
  }

  :global(.room-panel-pin-login .numpad) {
    margin-top: 0.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e3e6e0;
  }

  :global(.room-panel-pin-login .numpad-grid) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
  }

  :global(.room-panel-pin-login .numpad-key) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 3.25rem;
    height: clamp(3.25rem, 11vmin, 4rem);
    padding: 0.5rem;
    border: 2px solid #151713;
    border-radius: 8px;
    background: #ffffff;
    font-size: clamp(1.35rem, 4.5vw, 1.75rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #151713;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  :global(.room-panel-pin-login .numpad-key:active:not(:disabled)) {
    background: #eef1eb;
    transform: translateY(1px);
  }

  :global(.room-panel-pin-login .numpad-key--clear) {
    font-size: 0.75rem;
    font-weight: 800;
    background: #fdecec;
    border-color: #e8b4b0;
    color: #b42318;
  }

  :global(.room-panel-pin-login .numpad-key--back) {
    font-size: clamp(1.25rem, 4vw, 1.5rem);
  }

  :global(.room-panel-pin-login .numpad-key:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.room-panel-live-shell) {
    height: 100dvh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  :global(.room-panel-live-actions) {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-right))
      max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
    border-top: 1px solid #deded6;
    background: #ffffff;
    color: #52564d;
    font-weight: 600;
  }

  :global(.room-panel-live-error) {
    color: #b42318;
    font-weight: 800;
  }

  :global(.room-panel-preview) {
    --room-panel-ticket-size: clamp(2rem, 6.5vh, 3.25rem);
    --room-panel-ticket-next-size: clamp(2.35rem, 7.5vh, 3.85rem);

    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2vh, 1.25rem);
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      clamp(1rem, 3vh, 1.5rem) max(1rem, env(safe-area-inset-left));
    background: #ffffff;
  }

  :global(.room-panel-preview[data-live='true']) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  :global(.room-panel-preview__header) {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  :global(.room-panel-preview__room) {
    font-size: clamp(1.35rem, 4vh, 2.5rem);
    font-weight: 800;
    line-height: 1.05;
  }

  :global(.room-panel-preview__mode) {
    padding: 0.35rem 0.65rem;
    border-radius: 999px;
    background: #e7f5e7;
    color: #166534;
    font-size: 0.875rem;
    font-weight: 800;
  }

  :global(.room-panel-preview__lead) {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: clamp(0.75rem, 2vw, 1.25rem);
    padding: clamp(0.75rem, 2vh, 1rem) clamp(0.875rem, 2.5vw, 1.25rem);
    border-radius: 12px;
    background: #f3f6f2;
  }

  :global(.room-panel-preview[data-state='enter'] .room-panel-preview__lead) {
    background: #fff8eb;
  }

  :global(.room-panel-preview__icon) {
    flex-shrink: 0;
    width: clamp(3.25rem, 10vh, 4.5rem);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #e7f5e7;
    color: #166534;
  }

  :global(.room-panel-preview[data-state='enter'] .room-panel-preview__icon) {
    background: #fff4de;
    color: #9a3412;
  }

  :global(.room-panel-preview__state) {
    margin: 0;
    font-size: clamp(1.25rem, 3.8vh, 2.25rem);
    font-weight: 800;
    line-height: 1.12;
    letter-spacing: 0;
  }

  :global(.room-panel-preview__main) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2vh, 1rem);
  }

  :global(.room-panel-call-section) {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: clamp(0.65rem, 1.8vh, 0.85rem);
    border: 1px solid #d8e3d4;
    border-radius: 10px;
    background: #f7fbf5;
  }

  :global(.room-panel-call-section__title),
  :global(.room-panel-items-section__title) {
    margin: 0;
    font-size: clamp(0.95rem, 2.2vh, 1.1rem);
    font-weight: 800;
    color: #166534;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  :global(.room-panel-call-section__empty),
  :global(.room-panel-items-section__empty) {
    margin: 0;
    font-size: clamp(0.95rem, 2.4vh, 1.15rem);
    font-weight: 600;
    color: #6b7268;
  }

  :global(.room-panel-call-section__list) {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  :global(.room-panel-call-section__item) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.35rem 0.25rem;
  }

  :global(.room-panel-call-section__code) {
    font-size: clamp(1.35rem, 4vh, 2rem);
    font-weight: 850;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  :global(.room-panel-call-section__name) {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #3f453b;
    font-size: clamp(0.95rem, 2.2vh, 1.15rem);
    font-weight: 700;
  }

  :global(.room-panel-call-section__action) {
    width: min(100%, 14rem);
  }

  :global(.room-panel-items-section) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global(.room-panel-preview__queue-viewport) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.room-panel-preview__queue) {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    gap: clamp(0.35rem, 1.5vh, 0.85rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  :global(.room-panel-preview__queue--cols-2) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    justify-content: stretch;
    gap: clamp(0.5rem, 1.5vh, 0.85rem);
  }

  :global(.room-panel-preview__queue--paginated) {
    height: auto;
    max-height: 100%;
    justify-content: flex-start;
    align-content: start;
  }

  :global(.room-panel-preview__queue--paginated.room-panel-preview__queue--cols-2) {
    align-content: start;
  }

  :global(.room-panel-preview__queue-item) {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: clamp(0.35rem, 1.2vh, 0.65rem) clamp(0.5rem, 2vw, 0.75rem);
    border-left: 4px solid transparent;
    text-align: center;
    min-width: 0;
  }

  :global(.room-panel-preview__queue-item--next) {
    border-left-color: #166534;
    background: linear-gradient(90deg, rgb(22 101 52 / 8%), transparent 72%);
    border-radius: 0 10px 10px 0;
  }

  :global(.room-panel-preview[data-state='enter'] .room-panel-preview__queue-item--next) {
    border-left-color: #9a3412;
    background: linear-gradient(90deg, rgb(154 52 18 / 10%), transparent 72%);
  }

  :global(.room-panel-preview__queue-code) {
    font-size: var(--room-panel-ticket-size);
    font-weight: 850;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  :global(.room-panel-preview__queue-item--next .room-panel-preview__queue-code) {
    font-size: var(--room-panel-ticket-next-size);
    font-weight: 900;
  }

  :global(.room-panel-preview__queue-name) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #3f453b;
    font-size: clamp(1rem, 2.5vh, 1.5rem);
    font-weight: 700;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.room-panel-preview__queue-action) {
    width: min(100%, 16rem);
    margin-top: 0.15rem;
  }

  :global(.room-panel-preview__pages) {
    flex-shrink: 0;
    margin: clamp(0.35rem, 1vh, 0.75rem) 0 0;
    text-align: center;
    font-size: clamp(0.75rem, 1.6vh, 0.9rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #6b7268;
  }

  @media (orientation: landscape) and (max-height: 560px) {
    :global(.room-panel-preview) {
      --room-panel-ticket-size: clamp(1.75rem, 8vh, 2.75rem);
      --room-panel-ticket-next-size: clamp(2rem, 9vh, 3rem);
    }

    :global(.room-panel-preview__main) {
      flex-direction: column;
      gap: 0.75rem;
    }

    :global(.room-panel-items-section) {
      min-height: 0;
    }

    :global(.room-panel-preview__lead) {
      width: min(40%, 18rem);
      flex-direction: column;
      justify-content: center;
      text-align: center;
    }

    :global(.room-panel-preview__queue) {
      justify-content: center;
    }
  }

  :global(.room-panel-relogin-hotspot) {
    position: fixed;
    left: max(0px, env(safe-area-inset-left));
    bottom: max(0px, env(safe-area-inset-bottom));
    z-index: 9990;
    width: 4.5rem;
    height: 4.5rem;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }
</style>
