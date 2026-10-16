import { PrismaClient } from '@prisma/client';
import catalog from './catalog.json' with { type: 'json' };

/**
 * Initial data. Safe to run any number of times:
 *
 *   - It only CREATES rows that are missing. It never updates or overwrites an
 *     existing category, product, CMS page or setting, so prices, stock,
 *     descriptions or INACTIVE/OUT_OF_STOCK flags that an administrator changed
 *     in the dashboard survive every deploy and restart.
 *   - It never touches existing users (an existing administrator is not
 *     modified, demoted or re-created).
 *   - It creates no account with a known password. The Firebase login is
 *     created separately (see docs/ADMIN_AND_MIGRATION.md).
 */
const p = new PrismaClient();

const created = {
    categories: 0,
    products: 0,
    cmsPages: 0,
    settings: 0,
    admin: false
};

async function main() {
    for (const c of [
        { name: 'Indoor', slug: 'indoor' },
        { name: 'Outdoor', slug: 'outdoor' },
        { name: 'Accessories', slug: 'accessories' }
    ]) {
        if (await p.category.findUnique({ where: { slug: c.slug } })) continue;
        await p.category.create({ data: c });
        created.categories++;
    }

    for (const x of catalog as any[]) {
        if (await p.product.findUnique({ where: { slug: x.id } })) continue;

        const cat = await p.category.findUniqueOrThrow({
            where: { slug: x.category }
        });

        await p.product.create({
            data: {
                slug: x.id,
                name: x.name,
                scientific: x.scientific,
                categoryId: cat.id,
                subcategory: x.subcategory,
                price: x.price,
                description: x.description,
                benefits: x.benefits,
                image: x.image,
                care: x.care,
                lifespan: x.lifespan,
                where: x.where,
                origin: x.origin,
                details: x.details,
                propagation: x.propagation,
                hybrid: x.hybrid,
                stock: 20,
                status: 'ACTIVE'
            }
        });
        created.products++;
    }

    // Optional bootstrap of the FIRST administrator row. Register / sign in
    // with that e-mail through the app (Firebase) and it is linked to your
    // login automatically. An existing row is left exactly as it is.
    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();

    if (adminEmail && !(await p.user.findUnique({ where: { email: adminEmail } }))) {
        await p.user.create({
            data: {
                email: adminEmail,
                passwordHash: null,
                fullName: 'Botanique Administrator',
                role: 'ADMIN'
            }
        });
        created.admin = true;
    }

    for (const x of [
        {
            slug: 'about',
            title: 'About Us',
            content: 'Botanique — plants and accessories.'
        },
        {
            slug: 'contact',
            title: 'Contact',
            content: 'Contact Botanique support through the support API.'
        },
        {
            slug: 'faqs',
            title: 'FAQs',
            content: 'Frequently asked questions.'
        },
        {
            slug: 'privacy',
            title: 'Privacy Policy',
            content: 'Your account data is stored securely for order processing.'
        }
    ]) {
        if (await p.cmsPage.findUnique({ where: { slug: x.slug } })) continue;
        await p.cmsPage.create({ data: x });
        created.cmsPages++;
    }

    for (const x of [
        { key: 'currency', value: 'PHP' },
        { key: 'shipping_flat_rate', value: '0' },
        { key: 'tax_rate', value: '0.12' }
    ]) {
        if (await p.setting.findUnique({ where: { key: x.key } })) continue;
        await p.setting.create({ data: x });
        created.settings++;
    }

    console.log(
        `Seed complete (existing data left untouched). Created: ${created.categories} categories, ` +
            `${created.products} products, ${created.cmsPages} CMS pages, ${created.settings} settings` +
            (created.admin ? ', 1 administrator row (no password; sign in through Firebase).' : '.')
    );
}

main()
    .catch((e) => {
        console.error('Seed failed:', e?.message ?? e);
        process.exitCode = 1;
    })
    .finally(() => p.$disconnect());
