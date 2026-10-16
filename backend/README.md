# Botanique Backend

Standalone REST API for the existing Ionic/Angular Botanique frontend. The frontend is not modified by this project.

## Stack
Node.js 20+, Express, TypeScript, Prisma, PostgreSQL, Firebase Authentication (Admin SDK token verification), Maya Checkout (sandbox), EmailJS, PDFKit.

## Install / run in VS Code terminal
```powershell
cd botanique-backend
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma migrate deploy   # NOT run automatically by dev/start
npm run prisma:seed          # only creates missing rows
npm run dev
```

API: `http://localhost:3000/api`
Health: `GET /api/health`

Authentication is Firebase Authentication. There is no default admin password any more - see `docs/SETUP.md` (section 'First administrator').

## Main API areas
- `/api/auth` Firebase session sync (`POST /session`), profile (`GET/PATCH /me`), account deletion (`DELETE /me`)
- `/api/products` catalog/search/filter/sort + admin CRUD
- `/api/cart` authenticated cart
- `/api/wishlist` wishlist
- `/api/addresses` delivery addresses
- `/api/orders` checkout, history, details, tracking status, invoices, returns
- `/api/payments` Maya checkout creation, payment status (verified with Maya), Maya webhook
- `/api/reviews` ratings/reviews
- `/api/support` contact/support tickets
- `/api/notifications` customer/admin notifications
- `/api/admin` dashboard statistics, orders (search/filter/detail/validated status), products (inventory list), accounts, sales analytics, audit trail - see `docs/ADMIN_AND_MIGRATION.md`
- `/api/cms` pages and promotions
- `/api/settings` platform configuration

Prices are stored as whole Philippine pesos because the supplied frontend catalog uses values such as 390, 790, 1690. Maya receives them as PHP amounts.

## Important frontend boundary
Do not copy these backend files into `src/app`. Keep this as a separate sibling project. The existing Ionic frontend can later call `http://localhost:3000/api` through Angular's HttpClient.
