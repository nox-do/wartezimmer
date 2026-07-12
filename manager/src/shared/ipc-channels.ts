export const IPC_GET_SETUP_API_BASE = 'praxis:get-setup-api-base';
export const IPC_FETCH_SETUP_STATUS = 'praxis:fetch-setup-status';
export const IPC_SETUP_API_CALL = 'praxis:setup-api-call';
export const IPC_OPEN_EXTERNAL_URL = 'praxis:open-external-url';
export const IPC_SAVE_PFBACKUP = 'praxis:save-pfbackup';
export const IPC_READ_PFBACKUP_FOR_VALIDATE = 'praxis:read-pfbackup-for-validate';
export const IPC_SELECT_FOLDER = 'praxis:select-folder';
export const IPC_SELECT_RELEASE_ARCHIVE = 'praxis:select-release-archive';
export const IPC_SELECT_PFUPDATE_ARCHIVE = 'praxis:select-pfupdate-archive';

export const SETUP_API_PATH_PREFIX = '/api/setup/host/';

export type SetupApiCallRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
};
