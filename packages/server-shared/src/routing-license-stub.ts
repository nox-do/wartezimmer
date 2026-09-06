/**
 * Stub until offline/signed license infra ships.
 * Current product policy: complex routing is allowed by default in production;
 * an explicit false env flag is the only current opt-out hook for future
 * entitlement control without blocking the normal default path.
 */
export function isComplexRoutingLicensed(): boolean {
  const explicit = process.env.COMPLEX_ROUTING_LICENSED?.trim();
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }

  return true;
}
