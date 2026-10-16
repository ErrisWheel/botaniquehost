/**
 * Minimal in-memory stand-in for the parts of PrismaClient used by the
 * payment / e-mail code, so idempotency logic can be tested without Postgres.
 *
 * Models: where-operators actually used by the app (equality, null, not, in,
 * lt/lte/gt/gte, OR), atomic updateMany returning {count}, increment/decrement,
 * a UNIQUE constraint on PaymentEvent.eventKey (throws Prisma's P2002) and
 * transactions with rollback. Transactions are serialised (stricter than
 * Postgres), which is fine for these tests.
 *
 * This is a MOCK: it proves the application's control flow, not Postgres.
 */
type Row = Record<string, any>;

const cmp = (a: any, b: any) => (a instanceof Date ? a.getTime() : a) - (b instanceof Date ? b.getTime() : b);

function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (v === undefined) return true;
        if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
        if (k === 'AND') return (v as Row[]).every((w) => matches(row, w));
        const cur = row[k];
        if (v === null) return cur === null || cur === undefined;
        if (v instanceof Date || typeof v !== 'object') return cur instanceof Date && v instanceof Date ? cur.getTime() === v.getTime() : cur === v;
        return Object.entries(v as Row).every(([op, x]) => {
            switch (op) {
                case 'not': return x === null ? cur != null : cur !== x;
                case 'in': return (x as any[]).includes(cur);
                case 'lt': return cur != null && cmp(cur, x) < 0;
                case 'lte': return cur != null && cmp(cur, x) <= 0;
                case 'gt': return cur != null && cmp(cur, x) > 0;
                case 'gte': return cur != null && cmp(cur, x) >= 0;
                case 'equals': return cur === x;
                case 'mode': return true;
                case 'contains':
                    return typeof cur === 'string' && cur.toLowerCase().includes(String(x).toLowerCase());
                default: throw new Error(`FakeDb: unsupported operator ${op}`);
            }
        });
    });
}

type Journal = Array<() => void> | null;

function apply(row: Row, data: Row, journal: Journal = null) {
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        if (journal) {
            const had = k in row;
            const old = row[k];
            journal.push(() => (had ? (row[k] = old) : delete row[k]));
        }
        if (v && typeof v === 'object' && !(v instanceof Date) && ('increment' in v || 'decrement' in v)) {
            row[k] = (row[k] ?? 0) + (v.increment ?? 0) - (v.decrement ?? 0);
        } else row[k] = v;
    }
}

export class FakeDb {
    orders: Row[] = [];
    items: Row[] = [];
    products: Row[] = [];
    events: Row[] = [];
    notifications: Row[] = [];
    audits: Row[] = [];
    users: Row[] = [];
    carts: Row[] = [];
    cartItems: Row[] = [];
    returns: Row[] = [];
    wishlist: Row[] = [];
    private lock: Promise<unknown> = Promise.resolve();
    private seq = 0;

    // Operations bound to a journal. The root db has none (auto-commit); each
    // transaction gets its own, so a rollback undoes ONLY that transaction's
    // writes - exactly like a real database, not a whole-DB snapshot.
    private ops(journal: Journal) {
        const self = this;
        const withRelations = (o: Row | undefined, include?: Row) => {
            if (!o) return null;
            const out: Row = structuredClone(o);
            if (include?.items) {
                out.items = structuredClone(self.items.filter((i) => i.orderId === o.id));
                if (include.items?.include?.product)
                    out.items.forEach((i: Row) => (i.product = structuredClone(self.products.find((p) => p.id === i.productId) ?? null)));
            }
            if (include?.user) out.user = structuredClone(self.users.find((u) => u.id === o.userId) ?? null);
            return out;
        };
        const findOrders = (where?: Row) => self.orders.filter((o) => matches(o, where));
        const remove = (rows: Row[], hit: Row[]) => {
            for (const r of hit) {
                const i = rows.indexOf(r);
                if (i < 0) continue;
                rows.splice(i, 1);
                journal?.push(() => rows.splice(Math.min(i, rows.length), 0, r));
            }
        };
        const sorted = (rows: Row[], orderBy?: Row | Row[]) => {
            const o = Array.isArray(orderBy) ? orderBy[0] : orderBy;
            if (!o) return rows;
            const [[k, dir]] = Object.entries(o) as [string, string][];
            return [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[k], b[k]));
        };
        const page = (rows: Row[], { skip = 0, take }: Row) => rows.slice(skip, take === undefined ? undefined : skip + take);
        const sum = (rows: Row[], key: string) => rows.reduce((t, r) => t + (r[key] ?? 0), 0);
        const table = (rows: Row[], unique?: (r: Row) => void) => ({
            create: async ({ data }: { data: Row }) => {
                const r = { id: `id${++self.seq}`, createdAt: new Date(), ...data };
                unique?.(r);
                rows.push(r);
                journal?.push(() => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
                return structuredClone(r);
            },
            findUnique: async ({ where }: { where: Row }) => structuredClone(rows.find((r) => matches(r, where)) ?? null),
            findMany: async (a: Row = {}) =>
                structuredClone(page(sorted(rows.filter((r) => matches(r, a.where)), a.orderBy), a)),
            count: async ({ where }: Row = {}) => rows.filter((r) => matches(r, where)).length,
            deleteMany: async ({ where }: Row = {}) => {
                const hit = rows.filter((r) => matches(r, where));
                remove(rows, hit);
                return { count: hit.length };
            }
        });

        return {
            order: {
                findFirst: async ({ where, include }: Row) => withRelations(findOrders(where)[0], include),
                findUnique: async ({ where, include }: Row) => withRelations(findOrders(where)[0], include),
                findUniqueOrThrow: async ({ where, include }: Row) => {
                    const o = findOrders(where)[0];
                    if (!o) throw new Error('Record not found');
                    return withRelations(o, include);
                },
                findMany: async (a: Row = {}) =>
                    page(sorted(findOrders(a.where), a.orderBy), a).map((o) => withRelations(o, a.include) as Row),
                count: async ({ where }: Row = {}) => findOrders(where).length,
                aggregate: async ({ where }: Row = {}) => {
                    const hit = findOrders(where);
                    return { _sum: { total: hit.length ? sum(hit, 'total') : null }, _count: { _all: hit.length } };
                },
                groupBy: async ({ by, where }: Row) => {
                    const groups = new Map<string, number>();
                    for (const o of findOrders(where)) groups.set(o[by[0]], (groups.get(o[by[0]]) ?? 0) + 1);
                    return [...groups].map(([v, n]) => ({ [by[0]]: v, _count: { _all: n } }));
                },
                create: async ({ data }: Row) => {
                    const { items, ...rest } = data;
                    const o: Row = { id: `id${++self.seq}`, createdAt: new Date(), updatedAt: new Date(), ...rest };
                    self.orders.push(o);
                    journal?.push(() => { const i = self.orders.indexOf(o); if (i >= 0) self.orders.splice(i, 1); });
                    for (const it of items?.create ?? []) {
                        const row = { id: `id${++self.seq}`, orderId: o.id, ...it };
                        self.items.push(row);
                        journal?.push(() => { const i = self.items.indexOf(row); if (i >= 0) self.items.splice(i, 1); });
                    }
                    return structuredClone(o);
                },
                update: async ({ where, data }: Row) => {
                    const o = findOrders(where)[0];
                    if (!o) throw new Error('Record not found');
                    apply(o, data, journal);
                    return structuredClone(o);
                },
                updateMany: async ({ where, data }: Row) => {
                    const hit = findOrders(where);
                    hit.forEach((o) => apply(o, data, journal));
                    return { count: hit.length };
                }
            },
            paymentEvent: table(self.events, (r) => {
                if (self.events.some((e) => e.eventKey === r.eventKey))
                    throw Object.assign(new Error('Unique constraint failed on eventKey'), { code: 'P2002' });
            }),
            product: {
                findUnique: async ({ where }: Row) => structuredClone(self.products.find((x) => matches(x, where)) ?? null),
                findUniqueOrThrow: async ({ where }: Row) => {
                    const p = self.products.find((x) => matches(x, where));
                    if (!p) throw new Error('Record not found');
                    return structuredClone(p);
                },
                findMany: async (a: Row = {}) => structuredClone(page(sorted(self.products.filter((x) => matches(x, a.where)), a.orderBy), a)),
                count: async ({ where }: Row = {}) => self.products.filter((x) => matches(x, where)).length,
                create: async ({ data }: Row) => {
                    const p = { id: `id${++self.seq}`, createdAt: new Date(), ...data };
                    self.products.push(p);
                    journal?.push(() => { const i = self.products.indexOf(p); if (i >= 0) self.products.splice(i, 1); });
                    return structuredClone(p);
                },
                delete: async ({ where }: Row) => {
                    const p = self.products.find((x) => matches(x, where));
                    if (!p) throw new Error('Record not found');
                    remove(self.products, [p]);
                    return structuredClone(p);
                },
                update: async ({ where, data }: Row) => {
                    const p = self.products.find((x) => matches(x, where));
                    if (!p) throw new Error('Record not found');
                    apply(p, data, journal);
                    return structuredClone(p);
                },
                updateMany: async ({ where, data }: Row) => {
                    const hit = self.products.filter((x) => matches(x, where));
                    hit.forEach((p) => apply(p, data, journal));
                    return { count: hit.length };
                }
            },
            notification: table(self.notifications),
            auditLog: table(self.audits),
            user: {
                findUnique: async ({ where }: Row) => structuredClone(self.users.find((u) => matches(u, where)) ?? null),
                findMany: async (a: Row = {}) => structuredClone(page(sorted(self.users.filter((u) => matches(u, a.where)), a.orderBy), a)),
                count: async ({ where }: Row = {}) => self.users.filter((u) => matches(u, where)).length,
                create: async ({ data }: Row) => {
                    for (const k of ['email', 'firebaseUid'])
                        if (data[k] != null && self.users.some((u) => u[k] === data[k]))
                            throw Object.assign(new Error(`Unique constraint failed on ${k}`), { code: 'P2002' });
                    const u = { id: `id${++self.seq}`, role: 'CUSTOMER', isSuspended: false, createdAt: new Date(), ...data };
                    self.users.push(u);
                    journal?.push(() => { const i = self.users.indexOf(u); if (i >= 0) self.users.splice(i, 1); });
                    return structuredClone(u);
                },
                updateMany: async ({ where, data }: Row) => {
                    const hit = self.users.filter((u) => matches(u, where));
                    hit.forEach((u) => apply(u, data, journal));
                    return { count: hit.length };
                },
                update: async ({ where, data }: Row) => {
                    const u = self.users.find((x) => matches(x, where));
                    if (!u) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
                    apply(u, data, journal);
                    return structuredClone(u);
                },
                delete: async ({ where }: Row) => {
                    const u = self.users.find((x) => matches(x, where));
                    if (!u) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
                    remove(self.users, [u]);
                    // ON DELETE SET NULL, like the real schema: orders keep existing.
                    for (const o of self.orders) if (o.userId === u.id) apply(o, { userId: null }, journal);
                    return structuredClone(u);
                }
            },
            cart: {
                findUnique: async ({ where, include }: Row) => {
                    const c = self.carts.find((x) => matches(x, where));
                    if (!c) return null;
                    const out: Row = structuredClone(c);
                    if (include?.items) {
                        out.items = structuredClone(self.cartItems.filter((i) => i.cartId === c.id));
                        if (include.items?.include?.product)
                            out.items.forEach((i: Row) => (i.product = structuredClone(self.products.find((p) => p.id === i.productId))));
                    }
                    return out;
                }
            },
            cartItem: table(self.cartItems),
            wishlistItem: table(self.wishlist),
            orderItem: { count: async ({ where }: Row = {}) => self.items.filter((i) => matches(i, where)).length },
            returnRequest: {
                aggregate: async ({ where = {} }: Row) => {
                    const { order: orderWhere, ...rest } = where;
                    const hit = self.returns.filter(
                        (r) => matches(r, rest) && (!orderWhere || matches(self.orders.find((o) => o.id === r.orderId) ?? {}, orderWhere))
                    );
                    return { _sum: { refundAmount: hit.length ? sum(hit, 'refundAmount') : null } };
                }
            }
        };
    }

    private root = this.ops(null);
    order = this.root.order;
    paymentEvent = this.root.paymentEvent;
    product = this.root.product;
    notification = this.root.notification;
    auditLog = this.root.auditLog;
    user = this.root.user;
    cart = this.root.cart;
    cartItem = this.root.cartItem;
    wishlistItem = this.root.wishlistItem;
    orderItem = this.root.orderItem;
    returnRequest = this.root.returnRequest;

    $transaction = async (fn: (tx: any) => Promise<unknown>, _options?: unknown) => {
        const run = async () => {
            const journal: Array<() => void> = [];
            try {
                return await fn(this.ops(journal));
            } catch (e) {
                journal.reverse().forEach((undo) => undo());
                throw e;
            }
        };
        const next = this.lock.then(run, run);
        this.lock = next.catch(() => undefined);
        return next;
    };
}
