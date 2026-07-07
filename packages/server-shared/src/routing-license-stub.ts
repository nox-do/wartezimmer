/** Stub until offline/signed license infra ships. Shared by app and setup host API. */
export function isComplexRoutingLicensed(): boolean {
  const explicit = process.env.COMPLEX_ROUTING_LICENSED?.trim();
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return nodeEnv !== 'production';
}
