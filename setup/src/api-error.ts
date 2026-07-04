export function resolveSetupApiError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : 'internal error';
  if (
    message === 'ENV_MISSING' ||
    message === 'ENV_EXAMPLE_MISSING' ||
    message === 'INVALID_FOLDER_PATH' ||
    message === 'FOLDER_PATH_NOT_DIRECTORY' ||
    message === 'DOCKER_NOT_READY' ||
    message === 'RELEASE_ARCHIVE_NOT_FOUND' ||
    message === 'RELEASE_ARCHIVE_NOT_FOUND' ||
    message === 'RELEASE_SHA256_MISSING' ||
    message.startsWith('RELEASE_SHA256_MISMATCH') ||
    message.startsWith('RELEASE_MANIFEST_ARCHIVE_MISMATCH') ||
    message.startsWith('RELEASE_IMAGES_UNRECOGNIZED') ||
    message.startsWith('DOCKER_LOAD_FAILED')
  ) {
    return { status: 400, error: message };
  }
  return { status: 500, error: message };
}
