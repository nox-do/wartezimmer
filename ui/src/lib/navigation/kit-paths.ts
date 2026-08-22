/* eslint-disable @typescript-eslint/no-explicit-any -- resolve() is overload-per-route; dynamic paths widen here only */
import { goto, replaceState } from '$app/navigation';
import { resolve } from '$app/paths';

type GotoOptions = Parameters<typeof goto>[1];

/** Prefix app base path for internal route hrefs (SvelteKit 2). Prefer `resolve()` from `$app/paths` in `.svelte` templates — ESLint only recognizes that import. */
export function resolvedHref(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  // resolve() is overload-narrowed per route; dynamic paths need a wide cast at this boundary.
  return resolve(href as any);
}

export function gotoResolved(path: string, opts?: GotoOptions): ReturnType<typeof goto> {
  return goto(resolve(path as any), opts);
}

export function replaceStateResolved(
  path: string,
  state: App.PageState,
): ReturnType<typeof replaceState> {
  return replaceState(resolve(path as any), state);
}
