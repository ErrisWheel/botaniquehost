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
            if (include?.items) out.items = structuredClone(self.items.filter((i) => i.orderId === o.id));
            if (include?.user) out.user = structuredClone(self.users.find((u) => u.id === o.userId) ?? null);
            return out;
        };
        const findOrders = (where?: Row) => self.orders.filter((o) => matches(o, where));
        const table = (rows: Row[], unique?: (r: Row) => void) => ({
            create: async ({ data }: { data: Row }) => {
                const r = { id: `id${++self.seq}`, createdAt: new Date(), ...data };
                unique?.(r);
                rows.push(r);
                journal?.push(() => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
                return structuredClone(r);
            },
            findUnique: async ({ where }: { where: Row }) => structuredClone(rows.find((r) => matches(r, where)) ?? null)
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
                findMany: async ({ where, take }: Row) => findOrders(where).slice(0, take).map((o) => structuredClone(o)),
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
            user: { findUnique: async ({ where }: Row) => structuredClone(self.users.find((u) => matches(u, where)) ?? null) }
        };
    }

    private root = this.ops(null);
    order = this.root.order;
    paymentEvent = this.root.paymentEvent;
    product = this.root.product;
    notification = this.root.notification;
    auditLog = this.root.auditLog;
    user = this.root.user;

    $transaction = async (fn: (tx: any) => Promise<unknown>) => {
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
