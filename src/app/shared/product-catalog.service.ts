import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Product } from './product-data';

@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  private cachedProducts: Product[] | null = null;
  private loadingProducts: Promise<Product[]> | null = null;

  async list(force = false): Promise<Product[]> {
    if (this.loadingProducts) return (await this.loadingProducts).map(product => ({ ...product }));
    if (!force && this.cachedProducts) return this.cachedProducts.map(product => ({ ...product }));

    const request = this.fetchAll();
    this.loadingProducts = request;
    try {
      const products = await request;
      this.cachedProducts = products;
      return products.map(product => ({ ...product }));
    } finally {
      if (this.loadingProducts === request) this.loadingProducts = null;
    }
  }

  async get(identifier: string, force = false): Promise<Product | undefined> {
    const key = String(identifier || '').trim().toLowerCase();
    if (!key) return undefined;
    const products = await this.list(force);
    return products.find(product =>
      [product.id, product.slug, product.databaseId]
        .some(value => String(value || '').trim().toLowerCase() === key)
    );
  }

  findCached(identifier: string): Product | undefined {
    const key = String(identifier || '').trim().toLowerCase();
    return this.cachedProducts?.find(product =>
      [product.id, product.slug, product.databaseId]
        .some(value => String(value || '').trim().toLowerCase() === key)
    );
  }

  private async fetchAll(): Promise<Product[]> {
    const [active, outOfStock] = await Promise.all([
      this.fetchAllByStatus('ACTIVE'),
      this.fetchAllByStatus('OUT_OF_STOCK')
    ]);
    return [...active, ...outOfStock];
  }

  private async fetchAllByStatus(status: 'ACTIVE' | 'OUT_OF_STOCK'): Promise<Product[]> {
    const products: Product[] = [];
    let page = 1;
    let total = 0;
    const limit = 100;

    do {
      const response = await fetch(
        `${environment.apiUrl}/products?page=${page}&limit=${limit}&status=${status}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || `Products API returned ${response.status}`);
      if (!Array.isArray(body?.items)) throw new Error('Invalid products response.');

      products.push(...body.items.map((item: any) => this.mapProduct(item)));
      total = Number(body.total) || 0;
      if (!body.items.length) break;
      page++;
    } while (products.length < total);

    return products;
  }

  private mapProduct(raw: any): Product {
    const categoryValue = String(raw?.category?.slug || raw?.category || 'indoor').toLowerCase();
    const category: Product['category'] =
      categoryValue === 'outdoor' || categoryValue === 'accessories' ? categoryValue : 'indoor';
    const care = raw?.care && typeof raw.care === 'object' ? raw.care : {};
    const details = raw?.details && typeof raw.details === 'object' ? raw.details : {};
    const images = Array.isArray(raw?.images) ? raw.images : [];
    const slug = String(raw?.slug || raw?.id || '');

    return {
      id: slug,
      slug,
      databaseId: String(raw?.id || ''),
      name: String(raw?.name || 'Product'),
      scientific: String(raw?.scientific || ''),
      category,
      subcategory: String(raw?.subcategory || ''),
      price: Math.max(0, Number(raw?.price) || 0),
      image: String(raw?.image || images[0]?.url || ''),
      stock: Math.max(0, Number(raw?.stock) || 0),
      status: String(raw?.status || 'INACTIVE').toUpperCase(),
      lowStockThreshold: Math.max(0, Number(raw?.lowStockThreshold ?? 5) || 0),
      description: String(raw?.description || ''),
      benefits: String(raw?.benefits || ''),
      care: {
        water: String(care.water || ''),
        sunlight: String(care.sunlight || ''),
        soil: String(care.soil || ''),
        temperature: String(care.temperature || ''),
        fertilizer: String(care.fertilizer || '')
      },
      lifespan: String(raw?.lifespan || ''),
      where: String(raw?.where || ''),
      origin: String(raw?.origin || ''),
      details: {
        size: String(details.size || ''),
        growth: String(details.growth || ''),
        type: String(details.type || ''),
        difficulty: String(details.difficulty || '')
      },
      propagation: String(raw?.propagation || ''),
      hybrid: String(raw?.hybrid || '')
    };
  }
}
