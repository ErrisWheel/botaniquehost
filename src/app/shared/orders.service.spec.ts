import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { OrdersService } from './orders.service';

/** Minimal stand-in for AuthService: who is signed in + session-cleared hooks. */
class FakeAuth {
  currentUser: { uid: string } | null = { uid: 'user-1' };
  private listeners = new Set<() => void>();

  get isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  onSessionCleared(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  endSession(): void {
    this.currentUser = null;
    this.listeners.forEach((l) => l());
  }
}

/** API stand-in whose responses the test releases by hand. */
class FakeApi {
  calls: string[] = [];
  private waiting: Array<(body: unknown) => void> = [];

  request(path: string): Promise<unknown> {
    this.calls.push(path);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Answer the n-th request (0-based). */
  answer(n: number, body: unknown): void {
    this.waiting[n](body);
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('OrdersService', () => {
  let api: FakeApi;
  let auth: FakeAuth;
  let orders: OrdersService;

  beforeEach(() => {
    api = new FakeApi();
    auth = new FakeAuth();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        OrdersService,
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth }
      ]
    });

    orders = TestBed.inject(OrdersService);
  });

  it('shares one request between overlapping callers (ngOnInit + ionViewWillEnter)', async () => {
    const first = orders.load();
    const second = orders.load();

    expect(api.calls).toEqual(['/orders']);

    api.answer(0, [{ id: 'a' }]);

    expect(await first).toEqual([{ id: 'a' }]);
    expect(await second).toEqual([{ id: 'a' }]);
  });

  it('asks the server again on the next visit instead of serving a stored copy', async () => {
    const first = orders.load();
    api.answer(0, [{ id: 'old' }]);
    await first;

    const second = orders.load();
    expect(api.calls.length).toBe(2);

    api.answer(1, [{ id: 'new' }, { id: 'old' }]);
    expect(await second).toEqual([{ id: 'new' }, { id: 'old' }]);
  });

  it('an invalidated slow response can never overwrite newer data', async () => {
    // Profile starts loading, then checkout places an order and invalidates.
    const slow = orders.load();
    orders.invalidate();

    // The customer re-enters the page: a fresh request starts.
    const fresh = orders.load();
    expect(api.calls.length).toBe(2);

    // The OLD response (without the new order) arrives last.
    api.answer(1, [{ id: 'new-order' }]);
    api.answer(0, [{ id: 'stale' }]);

    expect(await fresh).toEqual([{ id: 'new-order' }]);
    // The caller that was waiting on the outdated request gets the newest data.
    expect(await slow).toEqual([{ id: 'new-order' }]);
    expect(orders.cached).toEqual([{ id: 'new-order' }]);
  });

  it('a forced reload (Try again) starts a new request even while one is running', async () => {
    const first = orders.load();
    const forced = orders.load(true);

    expect(api.calls.length).toBe(2);

    api.answer(1, [{ id: 'b' }]);
    api.answer(0, [{ id: 'a' }]);

    expect(await forced).toEqual([{ id: 'b' }]);
    expect(await first).toEqual([{ id: 'b' }]);
  });

  it('wipes cached orders when the session ends so another user cannot see them', async () => {
    const first = orders.load();
    api.answer(0, [{ id: 'private-order' }]);
    await first;
    expect(orders.cached.length).toBe(1);

    auth.endSession();
    expect(orders.cached).toEqual([]);

    // A different customer signs in on the same browser.
    auth.currentUser = { uid: 'user-2' };
    expect(orders.cached).toEqual([]);

    const second = orders.load();
    api.answer(1, [{ id: 'other-user-order' }]);
    expect(await second).toEqual([{ id: 'other-user-order' }]);
  });

  it('never exposes one user\'s snapshot to another uid', async () => {
    const first = orders.load();
    api.answer(0, [{ id: 'mine' }]);
    await first;

    // Identity changes without a logout event being delivered.
    auth.currentUser = { uid: 'user-2' };

    expect(orders.cached).toEqual([]);
  });

  it('rejects with NOT_SIGNED_IN when nobody is logged in', async () => {
    auth.currentUser = null;

    let failure: any;
    try {
      await orders.load();
    } catch (e) {
      failure = e;
    }

    expect(failure?.status).toBe(401);
    expect(failure?.code).toBe('NOT_SIGNED_IN');
    expect(api.calls.length).toBe(0);
  });

  it('a response that arrives after logout is not stored', async () => {
    const pending = orders.load();
    auth.endSession();
    api.answer(0, [{ id: 'late' }]);

    let failure: any;
    try {
      await pending;
    } catch (e) {
      failure = e;
    }

    await settle();
    expect(failure?.code).toBe('NOT_SIGNED_IN');
    expect(orders.cached).toEqual([]);
  });
});
