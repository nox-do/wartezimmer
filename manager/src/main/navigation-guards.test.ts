import assert from 'node:assert/strict';
import test from 'node:test';
import { installNavigationGuards, rendererNavigationAllowed } from './navigation-guards.js';

test('rendererNavigationAllowed permits dev reloads but not external or other file navigation', () => {
  assert.equal(
    rendererNavigationAllowed('http://localhost:5173/index.html', 'http://localhost:5173/'),
    true,
  );
  assert.equal(
    rendererNavigationAllowed(
      'http://localhost:5173/index.html',
      'https://example.com/api/setup/host/status',
    ),
    false,
  );
  assert.equal(
    rendererNavigationAllowed(
      'file:///Applications/Praxis/renderer/index.html',
      'file:///tmp/dropped.html',
    ),
    false,
  );
});

test('installNavigationGuards denies new windows and top-level navigation', () => {
  const handlers: {
    open?: () => { action: string };
    navigate?: (event: { preventDefault(): void }, url: string) => void;
  } = {};
  const fakeWebContents = {
    getURL() {
      return 'file:///Applications/Praxis/renderer/index.html';
    },
    setWindowOpenHandler(handler: () => { action: string }) {
      handlers.open = handler;
    },
    on(event: string, handler: (event: { preventDefault(): void }, url: string) => void) {
      if (event === 'will-navigate') {
        handlers.navigate = handler;
      }
      return fakeWebContents;
    },
  };

  installNavigationGuards(
    fakeWebContents as unknown as Parameters<typeof installNavigationGuards>[0],
  );

  assert.equal(handlers.open?.().action, 'deny');
  let prevented = false;
  handlers.navigate?.(
    {
      preventDefault() {
        prevented = true;
      },
    },
    'https://example.com',
  );
  assert.equal(prevented, true);
});
