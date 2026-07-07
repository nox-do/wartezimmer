import { t } from '$lib/i18n/i18nStore.svelte';

type ApiError = {
  code?: string;
  message?: string;
};

export function journeySettingsErrorMessage(error: ApiError): string {
  if (error.code === 'JOURNEY_TEMPLATE_LOCKED') {
    return error.message || t('mfa.settings.journeyTemplateLocked');
  }
  if (error.code === 'INVALID_ARGUMENT') {
    return error.message || t('mfa.settings.journeySaveInvalid');
  }
  return error.message || t('mfa.settings.journeySaveFailed');
}
