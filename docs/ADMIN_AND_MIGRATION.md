# Admin dashboard, order integrity and deployment

This document covers what changed in the admin/order/inventory work, how to
deploy it **safely against your existing database**, and how to provision the
five team administrators.

> Nothing in this project resets or deletes data. The migration is additive,
> `npm start` / `npm run dev` no longer run migrations or the seed on their own,
> and the seed only creates rows that are missing.

---

## 1. Deploy steps (run on YOUR machine / YOUR database)

```bash
# 0) Back up first (DATABASE_URL = your hosted Postgres)
pg_dump "$DATABASE_URL" > botanique-backup-$(date +%F).sql

# 1) Install dependencies (root = Angular app, backend = API)
npm ci
cd backend && npm ci

# 2) Check what is pending, then apply it. This is a deliberate manual step.
npx prisma migrate status
npx prisma migrate deploy          # applies 20261014000000_order_integrity_and_admin_indexes
npx prisma generate

# 3) Optional: add any catalogue rows that do not exist yet.
#    Never overwrites products, prices, stock, CMS pages or settings.
npm run prisma:seed

# 4) Verify, build, start
npm test
npm run build
npm start                          # = node dist/src/server.js  (no migrate, no seed)

# Frontend (project root)
ng build
```

**Important:** `npm start` used to run `prisma migrate deploy && prisma seed`
before the server. It no longer does. If your hosting start command is
`npm start`, add the migration as a separate, deliberate step (for example a
Render "pre-deploy command": `npm run db:migrate:deploy`). The new backend code
reads the new `Order.cancelledAt` / `Order.stockRestoredAt` columns, so **apply
the migration before (or together with) deploying the new backend**.

`npm run db:reset` still exists from the original project. It is **destructive
(wipes the database)**; use it only on a throw-away local database.

### What the migration does

File: `backend/prisma/migrations/20261014000000_order_integrity_and_admin_indexes/migration.sql`

| Change | Effect on existing data |
|---|---|
| `ALTER TABLE "Order" ADD COLUMN "cancelledAt", "stockRestoredAt"` (nullable) | none |
| `UPDATE "Order" ... WHERE "status" = 'CANCELLED'` | sets the two new timestamps on orders that are **already cancelled**, so the new restock logic can never add their stock a second time. **No product stock is changed.** |
| 11 `CREATE INDEX` statements | speed up the admin lists, dashboard counts and customer order history. No data change. |

Nothing is dropped, renamed or made stricter.

### Cancelled orders from before this release (optional clean-up)

Before this release, an **administrator** cancelling an order did **not** put the
stock back (only Maya cancel/expiry did), and cancelling a paid order set the
payment status to `REFUNDED` even though no refund had been sent. To list the
affected orders (read-only query):

```sql
SELECT o."orderNumber", o."paymentMethod", o."paymentStatus", o."total", o."cancelledAt"
FROM "Order" o
WHERE o."status" = 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentEvent" e
    WHERE e."orderId" = o."id" AND e."status" IN ('PAYMENT_CANCELLED', 'PAYMENT_EXPIRED')
  )
ORDER BY o."createdAt";
```

Review those by hand: adjust product stock in the admin dashboard (Products →
*Adjust stock*) where the goods really are back on the shelf, and check any
`REFUNDED` orders whose refund was never actually sent. The migration cannot
decide this for you, so it deliberately leaves stock untouched.

---

## 2. Rules the backend now enforces

* **Authentication / authorization** – every `/api/admin/*` route (and the admin
  routes of `/api/products` and `/api/orders`) requires a verified Firebase ID
  token **and** a database role of `ADMIN`, read on every request. The Angular
  guard is only a convenience.
* **Checkout** – one cart can become only one order (the cart rows are claimed in
  the same transaction); stock is reserved with a conditional update, so the last
  unit can never be sold twice; an order is refused if the price changed while the
  customer was checking out.
* **Cancellation** – the status change, the refund state and the stock return
  happen in one transaction; stock is returned exactly once per order (atomic
  claim on `Order.stockRestoredAt`), even if the request is repeated, two admins
  click together, or a Maya callback arrives afterwards.
* **Status transitions** – `PENDING → PROCESSING → SHIPPED → DELIVERED`;
  `PENDING/PROCESSING → CANCELLED`; `DELIVERED` and `CANCELLED` are final. A Maya
  order cannot be processed/shipped until payment is confirmed. Cash-on-delivery
  becomes `PAID` when delivered.
* **Payment is separate from fulfilment** – `paymentStatus` is one of `PENDING,
  PAID, FAILED, EXPIRED, CANCELLED, REFUND_PENDING, REFUNDED`. Cancelling a paid
  order sets `REFUND_PENDING`; an administrator confirms the refund was really
  sent with **Mark refund as sent**.
* **Revenue** = orders that are `PAID` **and not cancelled**, minus refunds
  recorded on return requests. Pending, failed, expired, cancelled and refund
  orders never count.
* **Accounts** – an administrator cannot change their own role, suspend or delete
  themselves; the **last active administrator** can never be demoted, suspended or
  deleted (also under concurrent requests); deleting an account keeps its orders
  (the link becomes empty, the customer/delivery snapshot stays on the order).
* **Products** – strict validation (whole-peso price, whole stock, safe image
  URL); a product that appears in any order is **deactivated** instead of deleted;
  stock is changed with an atomic `+/-` adjustment instead of overwriting the
  number.
* **Seed** – creates only missing rows; never updates existing products or users;
  prints no password.

---

## 3. Provisioning the five team administrators

Administrators: **Marzol, Del Rosario, De Vera, Roxas, Destor**. The existing
administrator is not touched. No e-mail addresses or passwords are stored in this
repository, and none are invented – **you must supply the five real e-mail
addresses.**

There is deliberately **no public or admin-panel route that grants admin rights
to a team list**: provisioning is an operator action that needs the server's
Firebase service-account credentials and database access.

### What you need

1. `backend/.env` with `DATABASE_URL` and the three Firebase Admin variables
   (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
2. The five real e-mail addresses (and, optionally, display names; the surname is
   used if you give none).

### Steps

```bash
cd backend

# Put the addresses in your SHELL (not in a committed file). PowerShell:
$env:TEAM_ADMIN_EMAIL_MARZOL      = "marzol@yourdomain.example"
$env:TEAM_ADMIN_EMAIL_DEL_ROSARIO = "delrosario@yourdomain.example"
$env:TEAM_ADMIN_EMAIL_DE_VERA     = "devera@yourdomain.example"
$env:TEAM_ADMIN_EMAIL_ROXAS       = "roxas@yourdomain.example"
$env:TEAM_ADMIN_EMAIL_DESTOR      = "destor@yourdomain.example"
# optional full names: TEAM_ADMIN_NAME_MARZOL="First Marzol" ...

# 1) DRY RUN (default): shows what would happen, changes nothing
npm run admins:provision

# 2) Apply
npm run admins:provision -- --apply

# 3) Optional: also print one-time password-setup links (terminal only)
npm run admins:provision -- --apply --print-reset-links
```

If you leave a variable unset and run the command in a terminal it asks for that
address (leave empty to skip). In a non-interactive shell it skips that person.

For each address the script:

* creates the **Firebase login** with a random password that is never shown or
  stored, plus the matching database row with role `ADMIN`;
* leaves an **existing administrator unchanged** (safe to re-run; no duplicates);
* **does not promote an existing customer** unless you add `--promote-existing`
  (protects against typos);
* links an existing Firebase login instead of creating a second one, and never
  changes anyone's password;
* refuses the same address for two people and any invalid address.

### Password setup (invitation)

Each new administrator opens the login page, chooses **Forgot password**, enters
their address and sets their own password from the e-mail Firebase sends. (Make
sure the **Password reset** template is enabled in Firebase console →
Authentication → Templates.) `--print-reset-links` is an alternative: it prints a
one-time link per person to *your terminal only* – send each link privately to its
owner, never paste it into chat or commit it.

### Test accounts you can log into immediately (development / staging ONLY)

Real addresses need a real inbox. For a dedicated **dev/staging** Firebase project
and an **isolated test database** (never production) the script can create usable
logins with generated, unique, strong passwords instead:

```bash
cd backend
# needs backend/.env of the TEST environment (DATABASE_URL + FIREBASE_* service account)
export ALLOW_TEST_ADMIN_ACCOUNTS=yes            # explicit "this is not production" confirmation
export FIREBASE_WEB_API_KEY="<public web API key of the SAME test Firebase project>"   # only for --verify-login
export BOTANIQUE_API_URL="http://localhost:4000/api"                                     # only for --verify-login

# dry run first
npm run admins:provision -- --test-identities
# create; credentials go to a private file OUTSIDE the project folder
npm run admins:provision -- --apply --test-identities \
    --credentials-file=../../Botanique-Admin-Test-Credentials.txt --verify-login
```

* Uses the reserved test addresses `marzol.admin@botanique.test`,
  `delrosario.admin@botanique.test`, `devera.admin@botanique.test`,
  `roxas.admin@botanique.test`, `destor.admin@botanique.test` for anyone without a
  `TEAM_ADMIN_EMAIL_*` value. Test mode refuses any address that is not a reserved
  test address (`.test`, `.example`, `.invalid`, `.localhost`, example.com/net/org),
  so a generated password can never be attached to a real person's mailbox.
* Refused when `NODE_ENV=production`, when `ALLOW_TEST_ADMIN_ACCOUNTS` is not `yes`,
  or when Firebase Admin is not configured.
* Passwords are generated once (24 random bytes + a policy-friendly tail), **never
  printed or logged**, never stored in the database or audit log, and written only
  to the credentials file (owner-only permissions, never overwritten, path inside
  the project refused). Delete that file when you are done; it is git-ignored.
* Repeatable: a second run reports `unchanged`, creates no duplicates and does not
  reset any password. Accounts that already existed are not listed in the file
  because their passwords are not known to the script. The existing administrator
  and all customers are untouched.
* `--verify-login` signs each new account in through Firebase and asks the API
  (`GET /auth/me`) who it is; it passes only if the backend says `ADMIN` and not
  suspended. Nothing it prints contains a password or token.
* The test accounts are marked e-mail-verified (they have no inbox). Use them to
  log in on the normal Botanique login page.

### Replacing test addresses with real ones

1. Export the five real `TEAM_ADMIN_EMAIL_*` values and run the normal provisioning
   (without `--test-identities`) against the real project - see "Steps" above.
2. In the **test** project, delete the `*.admin@botanique.test` users in Firebase
   console and their rows (Admin dashboard > Accounts > Delete, or SQL on the test
   database). Never do this on production data.

### What is verified here, and what is not

The script's decisions are covered by automated tests using an in-memory fake
database, a fake Firebase and a fake `fetch` (133 backend tests in total, run in a
stub harness). It has **not** been run against a real Firebase project or database:
the environment this was built in had no Firebase service account, no
`DATABASE_URL`, no Postgres server and could not reach Google's identity
endpoints. **So no administrator accounts have been created and no login has been
verified.** To create them you need exactly: (a) the Firebase Admin service-account
values of a dev/staging project, (b) that environment's `DATABASE_URL`, (c) the
project's public web API key and the API URL if you want `--verify-login`. Run the
dry run first and check the masked addresses it prints.

---

## 4. Environment variables

New, **optional**, only for the provisioning command (put them in your shell, not
in a file you commit): `TEAM_ADMIN_EMAIL_MARZOL`, `TEAM_ADMIN_EMAIL_DEL_ROSARIO`,
`TEAM_ADMIN_EMAIL_DE_VERA`, `TEAM_ADMIN_EMAIL_ROXAS`, `TEAM_ADMIN_EMAIL_DESTOR`
and `TEAM_ADMIN_NAME_<SAME KEY>`. They are listed with empty placeholders in
`backend/.env.example`. Test mode (section 3) additionally reads
`ALLOW_TEST_ADMIN_ACCOUNTS` (must be `yes`), and `--verify-login` reads
`FIREBASE_WEB_API_KEY` and `BOTANIQUE_API_URL`; all three are read from your shell
only and are not needed by the running API. No other variable was added.

---

## 5. Known limitations

* **The storefront catalogue is static** (`product-data.ts`): product
  pages read bundled data. Admin edits to **price and stock** are what checkout
  charges and reserves; edits to name, description or image are stored in the
  database but do not appear on storefront pages until that catalogue is made
  dynamic. The product screen says so.
* **Delivery addresses** are kept in the browser (`localStorage`); they are not
  cleared on logout to avoid losing data.
* **Admin order search** matches the order number and the linked account's name or
  e-mail (not the name typed into a guest/deleted account's checkout snapshot).
* **Refunds** are recorded, not executed: Botanique has no Maya refund API call.
  Send the refund in the Maya dashboard, then press *Mark refund as sent*.
* **Not run in the build sandbox** (see the final report): `ng build`, `ng test`,
  `ng lint`, the real `tsc` build, real Postgres/Prisma, live Firebase, Maya and
  EmailJS. Run `npm test`, `npm run build` and `ng build` after `npm ci`.


## Order fulfilment statuses (October 2026)

The six forward fulfilment stages are `PENDING`, `PROCESSING`, `PROCESSED`, `SORTING`, `ON_DELIVERY`, and `DELIVERED`. `CANCELLED` remains a separate terminal outcome so existing cancellation, refund, and stock-restoration protections continue to work. The migration `20261016000000_order_fulfilment_statuses` converts old `SHIPPED` orders to `ON_DELIVERY`; apply it with `npm run db:migrate:deploy` before deploying the matching backend.
