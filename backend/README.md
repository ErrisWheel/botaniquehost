# Botanique Backend

Standalone REST API for the existing Ionic/Angular Botanique frontend. The frontend is not modified by this project.

## Stack
Node.js 20+, Express, TypeScript, Prisma, SQLite, JWT, bcrypt, Stripe, Nodemailer, PDFKit.

## Install / run in VS Code terminal
```powershell
cd botanique-backend
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

API: `http://localhost:3000/api`
Health: `GET /api/health`

Default admin: `admin@botanique.local` / `Admin12345!` — change it immediately.

## Main API areas
- `/api/auth` customer registration/login/profile/password reset
- `/api/products` catalog/search/filter/sort + admin CRUD
- `/api/cart` authenticated cart
- `/api/wishlist` wishlist
- `/api/addresses` delivery addresses
- `/api/orders` checkout, history, details, tracking status, invoices, returns
- `/api/payments` Stripe PaymentIntent + webhook
- `/api/reviews` ratings/reviews
- `/api/support` contact/support tickets
- `/api/notifications` customer/admin notifications
- `/api/admin` users, admins, inventory, analytics, audit trail
- `/api/cms` pages and promotions
- `/api/settings` platform configuration

Prices are stored as whole Philippine pesos because the supplied frontend catalog uses values such as 390, 790, 1690. Stripe converts them to centavos only when creating a payment intent.

## Important frontend boundary
Do not copy these backend files into `src/app`. Keep this as a separate sibling project. The existing Ionic frontend can later call `http://localhost:3000/api` through Angular's HttpClient.
