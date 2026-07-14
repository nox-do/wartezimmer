import { redirect } from '@sveltejs/kit';
import { authSession, loadAuthSession, shouldLoadAuthSession } from '$lib/auth/session-state.svelte';
import { fetchOpsOnboarding } from '$lib/ops/ops-system-api';

export const ssr = false;

export async function load({ url }) {
  if (url.pathname.startsWith('/ops/setup')) {
    return {};
  }

  if (shouldLoadAuthSession('ops')) {
    await loadAuthSession('ops');
  }

  if (authSession.status !== 'authenticated' || !authSession.user?.roles.includes('ops')) {
    return {};
  }

  const result = await fetchOpsOnboarding();
  if (!result.ok) {
    return { onboardingCompleted: false, onboardingError: result.error.message };
  }

  if (!result.data.setupCompletedAt && !url.pathname.startsWith('/ops/setup')) {
    redirect(302, '/ops/setup');
  }

  return { onboardingCompleted: Boolean(result.data.setupCompletedAt) };
}
