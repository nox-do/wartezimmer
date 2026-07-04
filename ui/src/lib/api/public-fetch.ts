import { httpFetch, type HttpFetchOptions } from './http-fetch';

type PublicFetchOptions = Omit<HttpFetchOptions, 'authToken' | 'onUnauthorized'>;

export async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
  options: PublicFetchOptions = {},
) {
  return httpFetch<T>(path, init, options);
}
