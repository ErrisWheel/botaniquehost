import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiError, ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * UX guard only: the API enforces real authorization on every request by
 * verifying the Firebase ID token and reading the role from the database.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn ? true : router.createUrlTree(['/login']);
};

/**
 * Admin screens. The role cached in localStorage is only a hint (anyone can
 * edit it), so the guard also asks the backend who this user is right now.
 * A demoted or suspended administrator is therefore turned away at the door,
 * not only when the first admin API call fails. If the backend cannot be
 * reached the page is still shown: every admin API call is authorized
 * server-side anyway and the page reports the error.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const api = inject(ApiService);
  const router = inject(Router);

  if (!auth.isLoggedIn) return router.createUrlTree(['/login']);
  if (auth.profile?.role !== 'ADMIN') return router.createUrlTree(['/home']);

  try {
    const me = await api.request<{ role?: string; isSuspended?: boolean }>('/auth/me');
    return me.role === 'ADMIN' && !me.isSuspended ? true : router.createUrlTree(['/home']);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return router.createUrlTree([e.status === 401 ? '/login' : '/home']);
    }
    return true;
  }
};
