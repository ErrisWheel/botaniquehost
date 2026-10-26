import { Injectable, inject } from '@angular/core';
import { ApiError, ApiService } from './api.service';
import { AuthService } from './auth.service';

/** A raw order exactly as the API returns it. Pages map it to their own view. */
export type ApiOrder = Record<string, any>;

interface InFlight {
  generation: number;
  promise: Promise<ApiOrder[]>;
}

/**
 * Single place that loads the signed-in customer's orders.
 *
 * Guarantees:
 *  - Always asks the server (no localStorage copy of orders any more).
 *  - Calls made while a request is already running share that request, so
 *    ngOnInit + ionViewWillEnter do not fire two overlapping fetches.
 *  - `invalidate()` (after checkout, payment, status change) drops the
 *    snapshot AND marks every running request as outdated. An outdated
 *    response is never used: the caller gets the result of a request that
 *    started after the invalidation, so a slow old response can never
 *    overwrite newer data.
 *  - Data is bound to the Firebase user. Logging out or switching accounts
 *    wipes it, so one customer's orders can never appear for another.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private generation = 0;
  private inflight: InFlight | null = null;
  private snapshot: { uid: string; orders: ApiOrder[] } | null = null;

  constructor() {
    this.auth.onSessionCleared(() => this.reset());
  }

  /** Last orders loaded for the CURRENT user (empty for anyone else). */
  get cached(): ApiOrder[] {
    const uid = this.auth.currentUser?.uid;
    const snapshot = this.snapshot;
    return uid && snapshot && snapshot.uid === uid ? snapshot.orders : [];
  }

  /**
   * Loads the latest orders from the API.
   * @param force start a brand-new request even if one is already running
   *              (used by "Try again").
   */
  load(force = false): Promise<ApiOrder[]> {
    const uid = this.auth.currentUser?.uid;

    if (!uid) {
      this.reset();
      return Promise.reject(
        new ApiError('Please log in to view your orders.', 401, 'NOT_SIGNED_IN')
      );
    }

    if (this.snapshot && this.snapshot.uid !== uid) this.reset();

    if (this.inflight && !force) return this.inflight.promise;

    const generation = ++this.generation;

    const promise: Promise<ApiOrder[]> = this.api
      .request<unknown>('/orders')
      .then((body) => {
        const orders = Array.isArray(body) ? (body as ApiOrder[]) : [];

        // Outdated (invalidated, replaced by a forced reload, or the user
        // changed while we waited): follow the newest request instead.
        if (
          generation !== this.generation ||
          this.auth.currentUser?.uid !== uid
        ) {
          return this.inflight && this.inflight.generation > generation
            ? this.inflight.promise
            : this.load();
        }

        this.snapshot = { uid, orders };
        return orders;
      })
      .finally(() => {
        if (this.inflight?.promise === promise) this.inflight = null;
      });

    this.inflight = { generation, promise };
    return promise;
  }

  /** Loads one of the caller's own orders (404 if it is not theirs). */
  loadOne(id: string): Promise<ApiOrder> {
    return this.api.request<ApiOrder>(`/orders/${encodeURIComponent(id)}`);
  }

  /** Call after anything that changes an order (checkout, payment, cancel). */
  invalidate(): void {
    this.generation++;
    this.snapshot = null;
    this.inflight = null;
  }

  /** Call when the session ends or the account changes. */
  reset(): void {
    this.invalidate();
  }
}
 