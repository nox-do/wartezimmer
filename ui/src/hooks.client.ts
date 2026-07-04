import { errorStore } from '$lib/stores/errorStore';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorStore.push({
      message: event.message,
      code: 'UNHANDLED_ERROR',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message =
      event.reason instanceof Error ? event.reason.message : 'Unhandled promise rejection';
    errorStore.push({
      message,
      code: 'UNHANDLED_REJECTION',
    });
  });
}
