import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Error thrown for every failed API call, with the HTTP status attached. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The session is gone or invalid even after a forced token refresh. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Authenticated JSON requests to the Botanique API.
 *
 * Every request asks Firebase for a CURRENT ID token (the SDK refreshes it
 * when it is about to expire) instead of reading a copy from localStorage,
 * which goes stale after an hour. If the server still answers 401 (the token
 * expired between being issued and being verified) the token is force
 * refreshed and the request is retried exactly once.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    let res = await this.send(path, options, false);

    if (res.status === 401 && this.auth.isLoggedIn) {
      res = await this.send(path, options, true);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new ApiError(
        data?.message || `Request failed (${res.status}).`,
        res.status,
        typeof data?.code === 'string' ? data.code : undefined
      );
    }

    return data as T;
  }

  private async send(
    path: string,
    options: ApiRequestOptions,
    forceRefresh: boolean
  ): Promise<Response> {
    let token: string | null;
    try {
      token = await this.auth.getToken(forceRefresh);
    } catch {
      throw new ApiError(
        'Unable to refresh your session. Please check your connection and try again.',
        0,
        'TOKEN_REFRESH_FAILED'
      );
    }

    if (!token) {
      throw new ApiError('Please log in to continue.', 401, 'NOT_SIGNED_IN');
    }

    const hasBody = options.body !== undefined;

    try {
      return await fetch(`${environment.apiUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {})
        },
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
        // Never let the browser serve a stored copy of account data.
        cache: 'no-store'
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new ApiError(
        'Unable to reach the server. Please check your connection and try again.',
        0,
        'NETWORK_ERROR'
      );
    }
  }
}
