import { z } from 'zod';

/** Product image reference: an absolute http(s) URL or a site-relative path. */
const imageRef = z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^(https?:\/\/|\/|assets\/|uploads\/)/i.test(v), {
        message: 'Image must be an http(s) URL or a site path (assets/..., uploads/...)'
    });

const slug = z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Whole pesos (the Order/Product columns are integers). */
export const price = z.number().int().min(1).max(10_000_000);
export const stockQty = z.number().int().min(0).max(1_000_000);

const common = {
    name: z.string().trim().min(2).max(120),
    scientific: optionalText(160),
    categoryId: z.string().trim().min(1),
    subcategory: z.string().trim().max(80),
    price,
    description: z.string().trim().min(1).max(5000),
    benefits: optionalText(2000),
    image: imageRef.optional(),
    stock: stockQty,
    lowStockThreshold: z.number().int().min(0).max(100_000),
    care: z.any().optional(),
    details: z.any().optional(),
    lifespan: optionalText(160),
    where: optionalText(300),
    origin: optionalText(160),
    propagation: optionalText(500),
    hybrid: optionalText(300),
    // OUT_OF_STOCK is derived from the stock level; it is still accepted so
    // older clients keep working, but it is normalised (see statusForStock).
    status: z.enum(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'])
};

export const productCreateSchema = z
    .object({
        slug,
        ...common,
        subcategory: common.subcategory.default(''),
        stock: common.stock.default(0),
        lowStockThreshold: common.lowStockThreshold.default(5),
        status: common.status.default('ACTIVE'),
        images: z.array(imageRef).max(20).optional()
    })
    .strict();

/** The slug is not editable: the storefront and carts reference products by it. */
export const productUpdateSchema = z
    .object({
        name: common.name,
        scientific: common.scientific,
        categoryId: common.categoryId,
        subcategory: common.subcategory,
        price: common.price,
        description: common.description,
        benefits: common.benefits,
        image: common.image,
        stock: common.stock,
        lowStockThreshold: common.lowStockThreshold,
        care: common.care,
        details: common.details,
        lifespan: common.lifespan,
        where: common.where,
        origin: common.origin,
        propagation: common.propagation,
        hybrid: common.hybrid,
        status: common.status
    })
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, {
        message: 'Nothing to update'
    });

export const stockAdjustSchema = z
    .object({
        // Positive = received stock, negative = removed (damage, correction).
        delta: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, {
            message: 'delta must not be 0'
        })
    })
    .strict();
