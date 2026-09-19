import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config.js';
import { errorHandler } from './middleware/error.js';
import auth from './routes/auth.js';
import products from './routes/products.js';
import cart from './routes/cart.js';
import wishlist from './routes/wishlist.js';
import orders from './routes/orders.js';
import addresses from './routes/addresses.js';
import reviews from './routes/reviews.js';
import support from './routes/support.js';
import notifications from './routes/notifications.js';
import admin from './routes/admin.js';
import cms from './routes/cms.js';
import settings from './routes/settings.js';
import payments from './routes/payments.js';

const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(
    cors({
        origin: env.CORS_ORIGIN
            .split(',')
            .map((x) => x.trim()),
        credentials: true
    })
);

app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json' }),
    payments
);

app.use(express.json({ limit: '2mb' }));

app.use(
    morgan(
        env.NODE_ENV === 'production'
            ? 'combined'
            : 'dev'
    )
);

fs.mkdirSync(
    path.resolve(env.UPLOAD_DIR),
    { recursive: true }
);

app.use(
    '/uploads',
    express.static(
        path.resolve(env.UPLOAD_DIR)
    )
);

app.get('/api/health', (_req, res) =>
    res.json({
        ok: true,
        service: 'botanique-backend',
        time: new Date().toISOString()
    })
);

app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/cart', cart);
app.use('/api/wishlist', wishlist);
app.use('/api/orders', orders);
app.use('/api/addresses', addresses);
app.use('/api/reviews', reviews);
app.use('/api/support', support);
app.use('/api/notifications', notifications);
app.use('/api/admin', admin);
app.use('/api/cms', cms);
app.use('/api/settings', settings);
app.use('/api/payments', payments);

app.use(errorHandler);

app.listen(env.PORT, () =>
    console.log(
        `Botanique backend running at http://localhost:${env.PORT}`
    )
);
