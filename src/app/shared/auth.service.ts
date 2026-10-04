import { Injectable } from '@angular/core';
import { FirebaseError, getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type Auth,
  type User
} from 'firebase/auth';
import { environment } from '../../environments/environment';

export interface BotaniqueUser {
  id: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

/** Keys read by the existing pages - kept so no page has to be rewritten. */
const TOKEN_KEY = 'botaniqueToken';
const USER_KEY = 'botaniqueUser';
const LEGACY_KEYS = ['token', 'botaniqueRememberMe'];

/**
 * Single place that talks to Firebase Authentication.
 *
 * Firebase owns passwords, sessions and persistence. The backend only ever
 * receives a Firebase ID token (Authorization: Bearer ...) and verifies it
 * with the Firebase Admin SDK. The token is mirrored into localStorage
 * ('botaniqueToken') only so the existing pages, which read that key, keep
 * working; AuthService keeps it fresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth: Auth;

  constructor() {
    const app = getApps()[0] ?? initializeApp(environment.firebase);
    this.auth = getAuth(app);
  }

  get currentUser(): User | null {
    return this.auth.currentUser;
  }

  get isLoggedIn(): boolean {
    return !!this.auth.currentUser;
  }

  /** Cached profile from the backend (role comes from the database). */
  get profile(): BotaniqueUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as BotaniqueUser) : null;
    } catch {
      return null;
    }
  }

  /** Runs once at app start (see main.ts), before any route is activated. */
  async init(): Promise<void> {
    if (environment.firebase.apiKey.startsWith('REPLACE_ME')) {
      console.warn(
        '[auth] Firebase is not configured. Fill in `firebase` in src/environments/environment.ts.'
      );
    }

    // Keep the mirrored token fresh (Firebase refreshes it about hourly).
    onIdTokenChanged(this.auth, async (user) => {
      if (user) {
        try {
          localStorage.setItem(TOKEN_KEY, await user.getIdToken());
        } catch {
          /* offline: keep the previous value */
        }
      } else {
        this.clearLocal();
      }
    });

    // Background tabs throttle timers; refresh when the user comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.auth.currentUser) {
        void this.getToken();
      }
    });

    await this.auth.authStateReady();

    const user = this.auth.currentUser;
    if (!user) {
      // Also discards an old pre-Firebase JWT left in localStorage, so the
      // pages do not think the visitor is still logged in.
      this.clearLocal();
      return;
    }

    try {
      localStorage.setItem(TOKEN_KEY, await user.getIdToken());
      if (!this.profile) await this.syncProfile();
    } catch (e) {
      console.warn('[auth] Could not restore session:', e);
    }
  }

  /** Always returns a non-expired ID token (refreshing if needed). */
  async getToken(forceRefresh = false): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken(forceRefresh);
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  async register(input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<BotaniqueUser> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(
        this.auth,
        input.email.trim().toLowerCase(),
        input.password
      );

      await updateProfile(cred.user, { displayName: input.fullName.trim() });
      // Lets us safely link a pre-existing account with the same e-mail.
      sendEmailVerification(cred.user).catch(() => undefined);

      try {
        return await this.syncProfile(
          { fullName: input.fullName.trim(), phone: input.phone },
          true
        );
      } catch (e) {
        // Login exists but the store profile could not be created. Signing in
        // later retries it automatically (POST /auth/session is idempotent).
        await signOut(this.auth);
        this.clearLocal();
        throw new Error(
          'Your login was created, but we could not finish setting up your profile. Please log in to complete it.'
        );
      }
    } catch (e) {
      throw new Error(this.friendlyError(e));
    }
  }

  async login(
    email: string,
    password: string,
    remember = true
  ): Promise<BotaniqueUser> {
    try {
      await setPersistence(
        this.auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(
        this.auth,
        email.trim().toLowerCase(),
        password
      );
    } catch (e) {
      throw new Error(this.friendlyError(e));
    }

    try {
      return await this.syncProfile();
    } catch (e) {
      await signOut(this.auth).catch(() => undefined);
      this.clearLocal();
      throw e instanceof Error ? e : new Error(this.friendlyError(e));
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } finally {
      this.clearLocal();
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim().toLowerCase());
    } catch (e) {
      const code = (e as FirebaseError)?.code;
      // Do not reveal whether the address has an account.
      if (code === 'auth/user-not-found') return;
      throw new Error(this.friendlyError(e));
    }
  }

  /** Real password change performed by Firebase (re-authenticates first). */
  async changePassword(current: string, next: string): Promise<void> {
    const user = this.requireUser();
    try {
      await this.reauthenticate(user, current);
      await updatePassword(user, next);
    } catch (e) {
      throw new Error(this.friendlyError(e));
    }
  }

  /**
   * Permanently deletes the account: the backend removes the Firebase login
   * (Admin SDK) and the database profile; orders are kept for the shop's
   * records but detached from the user.
   */
  async deleteAccount(currentPassword: string): Promise<void> {
    const user = this.requireUser();
    try {
      await this.reauthenticate(user, currentPassword);
    } catch (e) {
      throw new Error(this.friendlyError(e));
    }

    const token = await user.getIdToken(true);
    const res = await fetch(`${environment.apiUrl}/auth/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || 'Unable to delete your account.');
    }

    await signOut(this.auth).catch(() => undefined);
    this.clearLocal();
  }

  /* ------------------------------------------------------------------ */

  /** Creates / links the database profile for the signed-in Firebase user. */
  private async syncProfile(
    profile?: { fullName?: string; phone?: string },
    forceRefresh = false
  ): Promise<BotaniqueUser> {
    const token = await this.getToken(forceRefresh);
    if (!token) throw new Error('You are not signed in.');

    const res = await fetch(`${environment.apiUrl}/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(profile ?? {})
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.user) {
      throw new Error(
        data?.message || 'Unable to load your account. Please try again.'
      );
    }

    const user: BotaniqueUser = {
      id: data.user.id,
      name: data.user.fullName,
      fullName: data.user.fullName,
      email: data.user.email,
      phone: data.user.phone || '',
      role: data.user.role
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  private requireUser(): User {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('Please log in first.');
    return user;
  }

  private reauthenticate(user: User, password: string) {
    return reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email as string, password)
    );
  }

  private clearLocal(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  }

  private friendlyError(e: unknown): string {
    const code = (e as FirebaseError)?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-login-credentials':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Please log in instead.';
      case 'auth/weak-password':
        return 'Please choose a stronger password (at least 6 characters).';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      case 'auth/requires-recent-login':
        return 'Please log in again and retry.';
      case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      case 'auth/invalid-api-key':
      case 'auth/configuration-not-found':
        return 'Authentication is not configured yet. Please contact the site owner.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled for this project.';
      default:
        return (e as Error)?.message || 'Something went wrong. Please try again.';
    }
  }
}
