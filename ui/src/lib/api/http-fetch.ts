import { getClientConfig } from '$lib/auth/app-config';
import type { Result } from '$lib/types/result';

type ApiErrorBody = {
  code?: string;
  message?: string;
  details?: unknown;
};

export type HttpFetchOptions = {
  authToken?: string;
  credentials?: RequestCredentials;
  csrfToken?: string;
  csrfHeaderName?: string;
  includeClientOriginHeader?: boolean;
  onUnauthorized?: () => void;
  skipJsonContentType?: boolean;
};

function buildUrl(path: string): string {
  const { baseUrl } = getClientConfig();
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function getClientOrigin(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.origin;
}

export async function httpFetch<T>(
  path: string,
  init: RequestInit = {},
  options: HttpFetchOptions = {},
): Promise<Result<T>> {
  const headers = new Headers(init.headers);

  if (
    !options.skipJsonContentType &&
    !headers.has('Content-Type') &&
    init.body != null &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.authToken) {
    headers.set('Authorization', `Bearer ${options.authToken}`);
  }

  if (options.csrfToken) {
    headers.set(options.csrfHeaderName ?? 'X-CSRF-Token', options.csrfToken);
  }

  if (options.includeClientOriginHeader) {
    const origin = getClientOrigin();
    if (origin) {
      headers.set('X-Client-Origin', origin);
    }
  }

  try {
    const response = await fetch(buildUrl(path), {
      ...init,
      credentials: options.credentials ?? init.credentials,
      headers,
    });

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const errorBody = (
        typeof body === 'object' && body !== null ? body : null
      ) as ApiErrorBody | null;
      if (response.status === 401) {
        options.onUnauthorized?.();
      }

      return {
        ok: false,
        error: {
          message: errorBody?.message ?? response.statusText,
          code: errorBody?.code,
          details: errorBody?.details,
          status: response.status,
        },
      };
    }

    return { ok: true, data: body as T };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : 'Network request failed',
        code: 'NETWORK_ERROR',
      },
    };
  }
}
