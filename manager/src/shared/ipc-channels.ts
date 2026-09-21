export const IPC_SETUP_API_CALL = 'praxis:setup-api-call';
export const IPC_OPEN_EXTERNAL_URL = 'praxis:open-external-url';
export const IPC_SAVE_PFBACKUP = 'praxis:save-pfbackup';
export const IPC_READ_PFBACKUP_FOR_VALIDATE = 'praxis:read-pfbackup-for-validate';
export const IPC_INSPECT_PFBACKUP_FILE = 'praxis:inspect-pfbackup-file';
export const IPC_SELECT_FOLDER = 'praxis:select-folder';
export const IPC_SELECT_RELEASE_ARCHIVE = 'praxis:select-release-archive';
export const IPC_SELECT_PFUPDATE_ARCHIVE = 'praxis:select-pfupdate-archive';
export const IPC_STAGE_TLS_PEM = 'praxis:stage-tls-pem';
export const IPC_RENEW_TLS_PEM = 'praxis:renew-tls-pem';

export const SETUP_API_PATH_PREFIX = '/api/setup/host/';

export type SetupApiCallRequest = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
};

export type SetupApiCallResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; message: string };
