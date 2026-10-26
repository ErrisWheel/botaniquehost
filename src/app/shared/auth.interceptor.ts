import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Pages that use Angular's HttpClient used to copy the Firebase ID token out
 * of localStorage, where it goes stale after an hour (the API then answers
 * 401 and the page looked empty or logged the visitor out until a reload).
 *
 * This interceptor replaces the Authorization header of every call to the
 * Botanique API with a CURRENT token from Firebase, and retries once with a
 * force-refreshed token if the API still reports 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);

  // Signed out: leave the request untouched (public endpoints, or a page
  // that already handles "not logged in" itself).
  if (!auth.isLoggedIn) return next(req);

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return from(auth.getToken().catch(() => null)).pipe(
    switchMap((token) => next(withToken(token))),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return from(auth.getToken(true).catch(() => null)).pipe(
          switchMap((token) => (token ? next(withToken(token)) : throwError(() => error)))
        );
      }
      return throwError(() => error);
    })
  );
};
