import { httpFetch } from './http-fetch';

export async function patientBearerFetch<T>(
  path: string,
  sessionToken: string,
  init: RequestInit = {},
) {
  return httpFetch<T>(path, init, { authToken: sessionToken });
}
