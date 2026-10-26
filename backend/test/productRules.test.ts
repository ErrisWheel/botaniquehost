import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    productCreateSchema,
    productUpdateSchema,
    stockAdjustSchema
} from '../src/services/productRules.js';

const valid = {
    slug: 'monstera-deliciosa',
    name: 'Monstera Deliciosa',
    categoryId: 'cat1',
    price: 850,
    description: 'A classic.',
    stock: 12
};

const ok = (schema: any, v: unknown) => assert.equal(schema.safeParse(v).success, true, JSON.stringify(schema.safeParse(v).error?.issues));
const bad = (schema: any, v: unknown) => assert.equal(schema.safeParse(v).success, false);

test('a valid new product passes and gets safe defaults', () => {
    const r: any = productCreateSchema.parse(valid);
    assert.equal(r.status, 'ACTIVE');
    assert.equal(r.lowStockThreshold, 5);
    assert.equal(r.subcategory, '');
});

test('price must be a positive whole number of pesos', () => {
    for (const price of [0, -5, 12.5, Number.NaN, '850' as any, 1e12]) bad(productCreateSchema, { ...valid, price });
    ok(productCreateSchema, { ...valid, price: 1 });
});

test('stock and threshold must be whole numbers >= 0', () => {
    for (const stock of [-1, 1.5, '3' as any]) bad(productCreateSchema, { ...valid, stock });
    bad(productCreateSchema, { ...valid, lowStockThreshold: -1 });
    ok(productCreateSchema, { ...valid, stock: 0 });
});

test('slug: lowercase words with hyphens only, required on create', () => {
    for (const slug of ['Has Caps', 'a', 'bad_slug', '../etc', '-lead', 'trail-', 'x'.repeat(81)]) bad(productCreateSchema, { ...valid, slug });
    const { slug: _s, ...noSlug } = valid;
    bad(productCreateSchema, noSlug);
});

test('image must be an http(s) URL or a site path - never javascript: or data:', () => {
    for (const image of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'ftp://x/y.png', 'file:///etc/passwd'])
        bad(productCreateSchema, { ...valid, image });
    for (const image of ['https://cdn.example.com/a.jpg', '/uploads/a.jpg', 'assets/plants/a.webp'])
        ok(productCreateSchema, { ...valid, image });
});

test('unknown / dangerous fields are rejected instead of silently saved (mass assignment)', () => {
    bad(productCreateSchema, { ...valid, id: 'forced-id' });
    bad(productCreateSchema, { ...valid, createdAt: new Date() });
    bad(productUpdateSchema, { name: 'x y', id: 'other' });
    bad(productUpdateSchema, { slug: 'new-slug' }); // slug is not editable
});

test('update accepts partial data but not an empty body', () => {
    ok(productUpdateSchema, { price: 900 });
    ok(productUpdateSchema, { status: 'INACTIVE' });
    bad(productUpdateSchema, {});
    bad(productUpdateSchema, { price: 0 });
});

test('stock adjustment: whole non-zero delta only', () => {
    ok(stockAdjustSchema, { delta: 5 });
    ok(stockAdjustSchema, { delta: -3 });
    for (const delta of [0, 1.5, '2' as any, 2_000_000]) bad(stockAdjustSchema, { delta });
    bad(stockAdjustSchema, { delta: 1, stock: 99 });
});
