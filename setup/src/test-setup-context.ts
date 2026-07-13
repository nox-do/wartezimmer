import type { SetupContext } from './setup-context.js';

/** Minimal SetupContext for setup package unit tests. */
export function testSetupContext(home: string): SetupContext {
  return {
    home,
    composeProjectName: 'pf-test',
    mode: 'install',
    templateRoot: home,
  };
}
