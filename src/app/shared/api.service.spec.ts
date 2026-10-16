import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from './api.service';
import { AuthService } from './auth.service';

/** AuthService stand-in that records which tokens were requested. */
class FakeAuth {
  isLoggedIn = true;
  tokenRequests: boolean[] = [];

  async getToken(forceRefresh = false): Promise<string | null> {
    this.tokenRequests.push(forceRefresh);
    return forceRefresh ? 'fresh-token' : 'cached-token';
  }
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('ApiService', () => {
  const realFetch = globalThis.fetch;
  let auth: FakeAuth;
  let api: ApiService;
  let seenAuthHeaders: string[];

  beforeEach(() => {
    auth = new FakeAuth();
    seenAuthHeaders = [];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }]
    });
    api = TestBed.inject(ApiService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const stubFetch = (...responses: Response[]) => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seenAuthHeaders.push(
        String((init?.headers as Record<string, string>)?.['Authorization'])
      );
      return responses.shift() ?? reply(500, { message: 'unexpected call' });
    }) as typeof fetch;
  };

  it('sends a token obtained from Firebase, not one copied into localStorage', async () => {
    stubFetch(reply(200, [{ id: 'o1' }]));

    const body = await api.request<unknown[]>('/orders');

    expect(body).toEqual([{ id: 'o1' }]);
    expect(seenAuthHeaders).toEqual(['Bearer cached-token']);
    expect(auth.tokenRequests).toEqual([false]);
  });

  it('on 401 refreshes the token once and retries', async () => {
    stubFetch(reply(401, { message: 'Invalid or expired token' }), reply(200, [{ id: 'o1' }]));

    const body = await api.request<unknown[]>('/orders');

    expect(body).toEqual([{ id: 'o1' }]);
    expect(seenAuthHeaders).toEqual(['Bearer cached-token', 'Bearer fresh-token']);
    expect(auth.tokenRequests).toEqual([false, true]);
  });

  it('gives up after one retry and reports the 401', async () => {
    stubFetch(reply(401, { message: 'nope' }), reply(401, { message: 'still nope' }));

    let failure: unknown;
    try {
      await api.request('/orders');
    } catch (e) {
      failure = e;
    }

    expect(failure instanceof ApiError).toBe(true);
    expect((failure as ApiError).isUnauthorized).toBe(true);
    expect((failure as ApiError).message).toBe('still nope');
    expect(seenAuthHeaders.length).toBe(2);
  });

  it('does not send anything when nobody is signed in', async () => {
    auth.getToken = async () => null;
    stubFetch(reply(200, {}));

    let failure: unknown;
    try {
      await api.request('/orders');
    } catch (e) {
      failure = e;
    }

    expect((failure as ApiError).code).toBe('NOT_SIGNED_IN');
    expect(seenAuthHeaders.length).toBe(0);
  });

  it('turns a network failure into a readable error', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    let failure: unknown;
    try {
      await api.request('/orders');
    } catch (e) {
      failure = e;
    }

    expect((failure as ApiError).code).toBe('NETWORK_ERROR');
  });
});
