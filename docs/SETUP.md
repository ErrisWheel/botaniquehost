# Botanique - Firebase Auth + Maya Checkout (sandbox) + EmailJS

Everything below is run from the **project root** (`Botanique/`) unless it says `backend/`.

## 0. How it fits together

```
Angular/Ionic app ──Firebase Web SDK──▶ Firebase Auth (passwords, sessions, reset e-mails)
      │  Authorization: Bearer <Firebase ID token>
      ▼
Express API ──Firebase Admin SDK──▶ verifies token (signature, expiry, revoked/deleted)
      │         └▶ maps uid ──▶ `User` row (role & ownership ALWAYS come from the DB)
      ├──▶ POST /api/payments/maya/checkout   → Maya "Create Checkout" (public key) → redirect URL
      ├──▶ POST /api/payments/maya/webhook/:secret  ← Maya (body NOT trusted; re-verified)
      ├──▶ GET  /api/payments/maya/status/:id → asks Maya (secret key) what really happened
      └──▶ EmailJS REST API (private key) → order confirmation (sent at most once per order)
```

## 1. Install

```bash
# project root (Angular/Ionic app) - also installs the new `firebase` package
npm install

# backend
cd backend
npm install            # installs firebase-admin, removes bcryptjs/jsonwebtoken/nodemailer/stripe
```

## 2. Firebase

1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off).
3. **Authentication → Settings → Authorized domains**: `localhost` is there by default; add your deployed frontend domain later.
4. **Project settings (gear) → General → Your apps → Web (`</>`) → Register app.** Copy the `firebaseConfig` values into **both** `src/environments/environment.ts` and `src/environments/environment.prod.ts` (replace every `REPLACE_ME`). These are public identifiers, not secrets.
5. **Project settings → Service accounts → Generate new private key.** From the downloaded JSON put into `backend/.env`:
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` on **one line**, keeping the `\n` sequences, inside double quotes.
   Then **delete/securely store the JSON**. Never commit it (it is git-ignored by pattern, but don't rely on that).
6. (Optional) **Authentication → Templates** to customise the verification / password-reset e-mails.

### Existing customers (migration from the old login)
Old users have bcrypt hashes in the database. Firebase imports bcrypt natively, so **customers keep their current passwords**:

```bash
cd backend
npm run users:import-firebase                # dry run, changes nothing
npm run users:import-firebase -- --apply     # import into Firebase + link rows
npm run accounts:audit                       # read-only report of orphaned/mismatched accounts
```
This also covers the old default admin `admin@botanique.local` (password unchanged until you change it - **change it**, see below).

### First administrator
- Existing admin row: run the import above, log in with the same credentials, then change the password in *Profile → Change password*.
- Fresh database: set `SEED_ADMIN_EMAIL` in `backend/.env` before seeding, register that e-mail in the app, click the verification link Firebase e-mails you, log in. The seeded row is linked to your Firebase login on first sign-in.
- More admins: Admin panel → Accounts → *New account* (role Administrator; creates the Firebase login + row, no password is typed - the person uses *Forgot password*), or provision the team with `npm run admins:provision` (see `docs/ADMIN_AND_MIGRATION.md`).

## Neon connection strings (Prisma 6)

For Neon, configure BOTH URLs. In Neon Console → **Connect**, copy the pooled URL with `-pooler` in the hostname, then turn connection pooling off to copy the direct URL. Keep each value private and do not commit them.

- `DATABASE_URL`: the **direct/unpooled** Neon connection string. Prisma migrations and CLI schema operations use this.
- `DATABASE_URL_POOLED`: the **pooled** Neon connection string (hostname includes `-pooler`). The deployed backend uses this for normal queries.

Set both variables in `backend/.env` locally and in Render → `botanique-backend` → **Environment**. Replace the expired Render database URL; do not leave it in either variable. Use the exact connection strings Neon provides, including their SSL query parameters.

## 3. Database migration (run against YOUR database)

The migration `backend/prisma/migrations/20261003000000_firebase_maya_emailjs` is **additive** (new columns/table, `User.passwordHash` becomes nullable). Nothing is dropped.

```bash
cd backend
# 1) BACK UP FIRST (your .env DATABASE_URL points at a hosted Postgres):
#    pg_dump "$DATABASE_URL" > botanique-backup.sql
npx prisma migrate status      # shows pending migrations
npx prisma migrate deploy      # applies them, including the review uniqueness index
npx prisma generate
```
The review migration removes older duplicate reviews for the same customer/product (retaining the newest one) before adding the uniqueness index, so take and verify a database backup before deploying it.

`npm run dev` and `npm start` no longer run `prisma migrate deploy` or the seed automatically - run `npm run db:migrate:deploy` yourself (and `npm run prisma:seed` if you want missing catalogue rows added; it never overwrites existing data). The seed does not create a default admin. See `docs/ADMIN_AND_MIGRATION.md` for the full, safe deployment steps.

For the branded custom reset/verification action page and Firebase template setup, follow [`docs/FIREBASE_AUTH_EMAILS.md`](FIREBASE_AUTH_EMAILS.md).

## 4. Maya (sandbox)

1. Get sandbox keys: **Maya Business Manager → Developer Sandbox Application Management** (see https://developers.maya.ph/). You need the **public key** (`pk-...`) and **secret key** (`sk-...`).
2. In `backend/.env`:
   ```
   MAYA_ENV="sandbox"
   MAYA_PUBLIC_KEY="pk-..."
   MAYA_SECRET_KEY="sk-..."
   MAYA_WEBHOOK_SECRET="<output of: openssl rand -hex 32>"
   FRONTEND_URL="http://localhost:8100"
   BACKEND_PUBLIC_URL="https://<public https URL of the backend>"
   ```
3. **Webhook.** Maya can only call a public `https` URL, so for local testing start a tunnel (e.g. `ngrok http 4000`) and set `BACKEND_PUBLIC_URL` to the tunnel URL. Then register the four events (`PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `PAYMENT_CANCELLED`):
   ```bash
   cd backend && npm run maya:webhooks
   ```
   (or add them by hand in Maya Manager with callback URL `https://<host>/api/payments/maya/webhook/<MAYA_WEBHOOK_SECRET>`).
   Even without the webhook, the result page and a background job re-check pending payments with Maya, so payments are not lost.
4. Test with Maya's sandbox test cards/accounts: https://developers.maya.ph/docs/sandbox-credentials-and-cards
5. Optional hardening: `MAYA_WEBHOOK_ENFORCE_IP="true"` (+ `TRUST_PROXY=1` on Render) restricts webhooks to Maya's published IPs.

Payment rules enforced by the server: prices come from the DB; discount/shipping/tax/total are recomputed on the server; the order is marked **PAID only after the backend fetches the payment from Maya with the secret key and it is `PAYMENT_SUCCESS` for the same reference number, PHP, and exactly the stored total**. Redirect URLs and webhook bodies are never believed. Duplicate callbacks are no-ops (unique `PaymentEvent.eventKey` + atomic updates).

## 5. EmailJS

1. https://dashboard.emailjs.com → **Email Services → Add New Service** (Gmail/Outlook/etc.) → copy the **Service ID**.
2. **Account → General**: copy **Public Key**. **Account → API keys**: copy the **Private Key**.
3. **Account → Security → enable "Allow EmailJS API for non-browser applications"** (required: the backend calls the REST API with the private key).
4. **Email Templates → Create New Template**, switch the content editor to **Code Editor (`</>`)** and paste `docs/emailjs/order-confirmation.html`. Then set the fields exactly as shown:
   | Field | Value |
   |---|---|
   | Subject | `Your Botanique order {{order_id}} - {{payment_status}}` |
   | To Email | `{{customer_email}}` |
   | From Name | `Botanique` |
   | Reply To | your support address |
   Save and copy the **Template ID**.

**Receipt privacy check:** open the template currently referenced by `EMAILJS_ORDER_TEMPLATE_ID` (do not just create a new template). Its **To Email** must be exactly `{{customer_email}}`, not a personal mailbox or a fixed address. Clear CC/BCC unless each additional recipient is intentionally authorized. Check the selected Email Service's default recipient/routing settings too. The backend fills `customer_email` from the order's linked database account; for legacy orders with no linked account it uses the e-mail saved with that order. A fixed To/CC/BCC value in the EmailJS dashboard can override the source-code recipient, so test with two separate accounts after saving the settings.
5. `backend/.env`:
   ```
   EMAILJS_PUBLIC_KEY="..."
   EMAILJS_PRIVATE_KEY="..."
   EMAILJS_SERVICE_ID="service_..."
   EMAILJS_ORDER_TEMPLATE_ID="template_..."
   EMAILJS_SUPPORT_EMAIL="support@yourshop.com"   # optional footer
   ```
   If the free plan's template/service limits get in your way, EmailJS' own rate limit is 1 request/second; the app sends one e-mail per order.

### Template variables the backend sends
`customer_name`, `customer_email`, `order_id`, `order_date`, `order_items` (plain text list), `order_items_html` (pre-escaped table rows - use `{{{triple braces}}}`), `order_subtotal`, `order_discount`, `order_shipping`, `order_tax`, `order_total`, `payment_method`, `payment_status`, `delivery_address`, `delivery_date`, `delivery_instructions`, `support_email`.

When e-mails are sent: **COD** orders immediately after placing the order; **Maya** orders only after Maya-verified payment. Each order is claimed atomically (`confirmationEmailStatus`), so repeated webhooks/polls never send a second copy. A failed send is stored on the order (`FAILED`, not visible to customers), logged, retried at most every 2 minutes by later callbacks, never changes payment status, and admins can resend: `POST /api/orders/admin/:id/resend-confirmation[?force=true]`.

## 6. Run

```bash
# terminal 1 - backend (from backend/)
cd backend
cp .env.example .env     # first time only, then fill it in
npm run dev              # http://localhost:4000

# terminal 2 - frontend (from the project root)
npm start                # http://localhost:8100 or 4200 (see package.json)
```

## 7. Build & test

```bash
# project root
npm run lint
npm run build
# backend/
cd backend
npm run build            # tsc
npm test                 # unit + route tests (node:test via tsx)
```

## 8. Manual test checklist (needs your credentials)
1. Register → Firebase user + DB row created; log out; log in; reload the page (still logged in); tick/untick "remember me".
2. Profile → change password (needs current password), delete account (asks for password).
3. "Forgot password" → e-mail arrives from Firebase.
4. Add to cart → checkout with **COD** → confirmation e-mail arrives.
5. Checkout with **Maya** → redirected to Maya sandbox → pay → return to `/payment-result` → shows *Payment received* → e-mail arrives once.
6. Repeat with cancel and with a failing sandbox card → order shows cancelled/failed, no e-mail.
7. Replay the webhook (Maya Manager "resend", or `curl -X POST .../maya/webhook/<secret> -H 'content-type: application/json' -d '{"requestReferenceNumber":"BOT-..."}'`) → still exactly one e-mail, order unchanged.
8. Temporarily break `EMAILJS_PRIVATE_KEY` → pay → order is still PAID, `confirmationEmailStatus=FAILED`.
