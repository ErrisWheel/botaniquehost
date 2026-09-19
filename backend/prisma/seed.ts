import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import catalog from './catalog.json' with { type: 'json' };

const p = new PrismaClient();

async function main() {
    for (const c of [
        { name: 'Indoor', slug: 'indoor' },
        { name: 'Outdoor', slug: 'outdoor' },
        { name: 'Accessories', slug: 'accessories' }
    ])
        await p.category.upsert({
            where: { slug: c.slug },
            update: { name: c.name },
            create: c
        });

    for (const x of catalog as any[]) {
        const cat = await p.category.findUniqueOrThrow({
            where: { slug: x.category }
        });

        await p.product.upsert({
            where: { slug: x.id },
            update: {
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
                status: 'ACTIVE'
            },
            create: {
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
    }

    const adminEmail = 'admin@botanique.local';

    if (!await p.user.findUnique({ where: { email: adminEmail } }))
        await p.user.create({
            data: {
                email: adminEmail,
                passwordHash: await bcrypt.hash('Admin12345!', 12),
                fullName: 'Botanique Administrator',
                role: 'ADMIN'
            }
        });

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
    ])
        await p.cmsPage.upsert({
            where: { slug: x.slug },
            update: x,
            create: x
        });

    for (const x of [
        { key: 'currency', value: 'PHP' },
        { key: 'shipping_flat_rate', value: '0' },
        { key: 'tax_rate', value: '0.12' }
    ])
        await p.setting.upsert({
            where: { key: x.key },
            update: { value: x.value },
            create: x
        });

    console.log(
        'Seed complete. Admin:',
        adminEmail,
        'Password: Admin12345!'
    );
}

main().finally(() => p.$disconnect());
