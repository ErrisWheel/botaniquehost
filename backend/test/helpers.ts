// Minimum env so src/config.ts can be imported in unit tests (no real services).
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.DATABASE_URL_POOLED ??= process.env.DATABASE_URL;
process.env.EMAILJS_SUPPORT_EMAIL ??= 'support@example.test';
process.env.MAYA_PUBLIC_KEY ??= 'pk-test-not-real';
process.env.MAYA_SECRET_KEY ??= 'sk-test-not-real';
process.env.MAYA_WEBHOOK_SECRET ??= 'unit-test-webhook-secret';
process.env.EMAILJS_PUBLIC_KEY ??= 'pub-test-not-real';
process.env.EMAILJS_PRIVATE_KEY ??= 'priv-test-not-real';
process.env.EMAILJS_SERVICE_ID ??= 'service_test';
process.env.EMAILJS_ORDER_TEMPLATE_ID ??= 'template_test';
process.env.FRONTEND_URL ??= 'http://localhost:8100';
