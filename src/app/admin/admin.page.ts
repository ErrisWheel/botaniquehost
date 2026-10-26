import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../shared/api.service';
import { AuthService } from '../shared/auth.service';

type Tab = 'overview' | 'orders' | 'products' | 'accounts';

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

interface CustomerInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  zip?: string;
}

interface PersonRef {
  id?: string;
  fullName: string;
  email: string;
  phone?: string | null;
}

interface DashboardStats {
  totals: {
    orders: number;
    customers: number;
    activeAdmins: number;
    products: number;
    revenue: number;
    revenueGross: number;
    revenueRefunded: number;
    revenueOrders: number;
  };
  ordersByStatus: Record<string, number>;
  paymentsByStatus: Record<string, number>;
  pendingRefunds: { count: number; amount: number };
  inventory: { inStock: number; lowStock: number; outOfStock: number; inactive: number };
  lowStockProducts: Array<{
    id: string;
    slug: string;
    name: string;
    stock: number;
    lowStockThreshold: number;
    state: string;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    user: PersonRef | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId?: string | null;
    createdAt: string;
    user: { fullName: string; email: string } | null;
  }>;
}

interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  customerJson?: CustomerInfo | null;
  user: PersonRef | null;
  _count?: { items: number };
  allowedStatuses: string[];
  refundDue: boolean;
}

interface AdminOrderDetail extends AdminOrderRow {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  paidAt?: string | null;
  cancelledAt?: string | null;
  stockRestoredAt?: string | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  returns: Array<{
    id: string;
    reason: string;
    status: string;
    refundAmount?: number | null;
    createdAt: string;
  }>;
  paymentEvents: Array<{ id: string; status: string; createdAt: string }>;
  activity: Array<{
    id: string;
    action: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    user: { fullName: string; email: string } | null;
  }>;
}

interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  scientific?: string | null;
  subcategory: string;
  categoryId: string;
  price: number;
  image?: string | null;
  status: string;
  stock: number;
  lowStockThreshold: number;
  description: string;
  stockState: string;
  orderLines: number;
  category?: { id: string; name: string; slug: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
  orderCount: number;
}

interface ProductForm {
  id?: string;
  slug: string;
  name: string;
  scientific: string;
  categoryId: string;
  subcategory: string;
  price: number | null;
  stock: number | null;
  lowStockThreshold: number | null;
  description: string;
  image: string;
  status: string;
}

interface AccountForm {
  email: string;
  fullName: string;
  phone: string;
  role: 'CUSTOMER' | 'ADMIN';
}

const PAGE_SIZE = 20;

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  EXPIRED: 'Payment expired',
  CANCELLED: 'Not charged',
  REFUND_PENDING: 'Refund due',
  REFUNDED: 'Refunded'
};

const query = (params: Record<string, string | number | undefined>): string => {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss']
})
export class AdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  readonly fulfillmentStatuses = ['PENDING', 'PROCESSING', 'PROCESSED', 'SORTING', 'ON_DELIVERY', 'DELIVERED'];
  /** Cancellation is an exceptional terminal outcome, not a fulfilment stage. */
  readonly orderStatuses = [...this.fulfillmentStatuses, 'CANCELLED'];
  readonly paymentStatuses = Object.keys(PAYMENT_LABELS);
  readonly pageSize = PAGE_SIZE;

  tab: Tab = 'overview';
  private initialised = false;
  private skipFirstViewEnterRefresh = true;

  /** Shown above the tabs after an action (success or failure). */
  notice: { kind: 'ok' | 'error'; text: string } | null = null;

  get myId(): string | undefined {
    return this.authService.profile?.id;
  }

  /* ---------------------------------- overview ---------------------------------- */

  stats: DashboardStats | null = null;
  statsLoading = false;
  statsError = '';
  private statsSeq = 0;

  /* ----------------------------------- orders ----------------------------------- */

  orderFilters = { q: '', status: '', paymentStatus: '', paymentMethod: '', from: '', to: '' };
  orders: AdminOrderRow[] = [];
  ordersTotal = 0;
  ordersPage = 1;
  ordersLoading = false;
  ordersError = '';
  private ordersSeq = 0;

  selectedOrder: AdminOrderDetail | null = null;
  orderLoading = false;
  orderError = '';
  orderBusy = false;
  private orderSeq = 0;

  /* ---------------------------------- products ---------------------------------- */

  productFilters = { q: '', stock: 'all', sort: 'name' };
  products: AdminProduct[] = [];
  productsTotal = 0;
  productsPage = 1;
  productsLoading = false;
  productsError = '';
  private productsSeq = 0;

  categories: Category[] = [];
  stockDeltas: Record<string, number | null> = {};
  productBusyId = '';

  productForm: ProductForm | null = null;
  productFormError = '';
  productSaving = false;

  /* ---------------------------------- accounts ---------------------------------- */

  accountFilters = { q: '', role: '', suspended: '' };
  accounts: AdminUser[] = [];
  accountsTotal = 0;
  accountsPage = 1;
  accountsLoading = false;
  accountsError = '';
  accountBusyId = '';
  private accountsSeq = 0;

  accountForm: AccountForm | null = null;
  accountFormError = '';
  accountSaving = false;

  ngOnInit(): void {
    this.initialised = true;
    void this.loadTab(this.tab);
  }

  /** Ionic calls this whenever the kept-alive page becomes active. The first
   * entry is already loaded by ngOnInit, so skip that duplicate request. */
  ionViewWillEnter(): void {
    if (this.skipFirstViewEnterRefresh) {
      this.skipFirstViewEnterRefresh = false;
      return;
    }
    if (this.initialised) void this.loadTab(this.tab);
  }

  /* ------------------------------------ shell ----------------------------------- */

  setTab(tab: Tab): void {
    this.tab = tab;
    this.notice = null;
    this.cdr.markForCheck();
    void this.loadTab(tab);
  }

  refresh(): void {
    this.notice = null;
    void this.loadTab(this.tab);
  }

  private loadTab(tab: Tab): Promise<void> {
    switch (tab) {
      case 'overview':
        return this.loadStats();
      case 'orders':
        return this.loadOrders();
      case 'products':
        return Promise.all([this.loadProducts(), this.loadCategories()]).then(() => undefined);
      case 'accounts':
        return this.loadAccounts();
    }
  }

  /** Readable message for any failure; a revoked session ends the visit. */
  private describe(e: unknown, fallback: string): string {
    if (e instanceof ApiError) {
      if (e.status === 401) {
        void this.authService.logout().finally(() => this.router.navigateByUrl('/login'));
        return 'Your session expired. Please log in again.';
      }
      if (e.status === 403) return 'Administrator access required. This account is not an active admin.';
      return e.message || fallback;
    }
    return fallback;
  }

  private ok(text: string): void {
    this.notice = { kind: 'ok', text };
  }

  private fail(e: unknown, fallback: string): void {
    this.notice = { kind: 'error', text: this.describe(e, fallback) };
  }

  /* ---------------------------------- overview ---------------------------------- */

  async loadStats(): Promise<void> {
    const seq = ++this.statsSeq;
    this.statsLoading = true;
    this.statsError = '';
    this.cdr.markForCheck();
    try {
      const stats = await this.api.request<DashboardStats>('/admin/dashboard');
      if (seq !== this.statsSeq) return;
      this.stats = stats;
    } catch (e) {
      if (seq !== this.statsSeq) return;
      this.statsError = this.describe(e, 'Unable to load the dashboard.');
    } finally {
      if (seq === this.statsSeq) { this.statsLoading = false; this.cdr.markForCheck(); }
    }
  }

  statusCount(status: string): number {
    return this.stats?.ordersByStatus[status] ?? 0;
  }

  orderStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Pending',
      PROCESSING: 'Processing',
      PROCESSED: 'Processed',
      SORTING: 'Order is being sorted',
      ON_DELIVERY: 'On delivery',
      SHIPPED: 'On delivery', // legacy value, also normalized by the migration
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled'
    };
    return labels[status] ?? status;
  }

  openOrderFromOverview(id: string): void {
    this.tab = 'orders';
    void this.loadOrders();
    void this.openOrder(id);
  }

  /* ----------------------------------- orders ----------------------------------- */

  applyOrderFilters(): void {
    void this.loadOrders(1);
  }

  clearOrderFilters(): void {
    this.orderFilters = { q: '', status: '', paymentStatus: '', paymentMethod: '', from: '', to: '' };
    void this.loadOrders(1);
  }

  async loadOrders(page = this.ordersPage): Promise<void> {
    const seq = ++this.ordersSeq;
    this.ordersLoading = true;
    this.ordersError = '';
    this.cdr.markForCheck();
    try {
      const f = this.orderFilters;
      const data = await this.api.request<Paged<AdminOrderRow>>(
        `/admin/orders${query({
          q: f.q.trim(),
          status: f.status,
          paymentStatus: f.paymentStatus,
          paymentMethod: f.paymentMethod,
          from: f.from,
          to: f.to,
          page,
          limit: PAGE_SIZE
        })}`
      );
      if (seq !== this.ordersSeq) return; // a newer search replaced this one
      this.orders = data.items;
      this.ordersTotal = data.total;
      this.ordersPage = data.page;
    } catch (e) {
      if (seq !== this.ordersSeq) return;
      this.orders = [];
      this.ordersTotal = 0;
      this.ordersError = this.describe(e, 'Unable to load orders.');
    } finally {
      if (seq === this.ordersSeq) { this.ordersLoading = false; this.cdr.markForCheck(); }
    }
  }

  async openOrder(id: string): Promise<void> {
    const seq = ++this.orderSeq;
    this.orderLoading = true;
    this.orderError = '';
    this.selectedOrder = null;
    this.cdr.markForCheck();
    try {
      const order = await this.api.request<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`);
      if (seq !== this.orderSeq) return;
      this.selectedOrder = order;
    } catch (e) {
      if (seq !== this.orderSeq) return;
      this.orderError = this.describe(e, 'Unable to load this order.');
    } finally {
      if (seq === this.orderSeq) { this.orderLoading = false; this.cdr.markForCheck(); }
    }
  }

  closeOrder(): void {
    this.orderSeq++;
    this.selectedOrder = null;
    this.orderError = '';
    this.orderLoading = false;
  }

  async changeOrderStatus(order: AdminOrderDetail, next: string): Promise<void> {
    if (this.orderBusy) return;

    const refundNote =
      next === 'CANCELLED' && order.paymentStatus === 'PAID'
        ? ' The customer has already paid, so a refund will be marked as due.'
        : '';
    const stockNote = next === 'CANCELLED' ? ' Reserved stock will be returned to the shop.' : '';
    if (!window.confirm(`Change order ${order.orderNumber} to ${next}?${stockNote}${refundNote}`)) return;

    this.orderBusy = true;
    try {
      await this.api.request(`/admin/orders/${encodeURIComponent(order.id)}/status`, {
        method: 'PATCH',
        body: { status: next }
      });
      this.ok(`Order ${order.orderNumber} is now ${next}.`);
      await Promise.all([this.openOrder(order.id), this.loadOrders()]);
    } catch (e) {
      this.fail(e, 'Unable to change the order status.');
      // The order may have changed under us: show its real state again.
      void this.openOrder(order.id);
    } finally {
      this.orderBusy = false;
      this.cdr.markForCheck();
    }
  }

  async markRefunded(order: AdminOrderDetail): Promise<void> {
    if (this.orderBusy) return;
    if (
      !window.confirm(
        `Confirm that the refund of ₱${order.total} for order ${order.orderNumber} has really been sent to the customer?`
      )
    )
      return;

    this.orderBusy = true;
    try {
      await this.api.request(`/admin/orders/${encodeURIComponent(order.id)}/refunded`, { method: 'POST' });
      this.ok(`Order ${order.orderNumber} marked as refunded.`);
      await Promise.all([this.openOrder(order.id), this.loadOrders()]);
    } catch (e) {
      this.fail(e, 'Unable to mark the order as refunded.');
    } finally {
      this.orderBusy = false;
      this.cdr.markForCheck();
    }
  }

  customerName(o: { user: PersonRef | null; customerJson?: CustomerInfo | null }): string {
    return o.user?.fullName || o.customerJson?.fullName || 'Deleted account';
  }

  customerEmail(o: { user: PersonRef | null; customerJson?: CustomerInfo | null }): string {
    return o.user?.email || o.customerJson?.email || '';
  }

  paymentLabel(status: string): string {
    return PAYMENT_LABELS[status] ?? status;
  }

  /* ---------------------------------- products ---------------------------------- */

  applyProductFilters(): void {
    void this.loadProducts(1);
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories = await this.api.request<Category[]>('/admin/categories');
      this.cdr.markForCheck();
    } catch {
      // The list view works without it; the form reports the problem if needed.
    }
  }

  async loadProducts(page = this.productsPage): Promise<void> {
    const seq = ++this.productsSeq;
    this.productsLoading = true;
    this.productsError = '';
    this.cdr.markForCheck();
    try {
      const f = this.productFilters;
      const data = await this.api.request<Paged<AdminProduct>>(
        `/admin/products${query({ q: f.q.trim(), stock: f.stock, sort: f.sort, page, limit: PAGE_SIZE })}`
      );
      if (seq !== this.productsSeq) return;
      this.products = data.items;
      this.productsTotal = data.total;
      this.productsPage = data.page;
    } catch (e) {
      if (seq !== this.productsSeq) return;
      this.products = [];
      this.productsTotal = 0;
      this.productsError = this.describe(e, 'Unable to load products.');
    } finally {
      if (seq === this.productsSeq) { this.productsLoading = false; this.cdr.markForCheck(); }
    }
  }

  newProduct(): void {
    this.productFormError = '';
    this.productForm = {
      slug: '',
      name: '',
      scientific: '',
      categoryId: this.categories[0]?.id ?? '',
      subcategory: '',
      price: null,
      stock: 0,
      lowStockThreshold: 5,
      description: '',
      image: '',
      status: 'ACTIVE'
    };
  }

  editProduct(p: AdminProduct): void {
    this.productFormError = '';
    this.productForm = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      scientific: p.scientific ?? '',
      categoryId: p.categoryId,
      subcategory: p.subcategory,
      price: p.price,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      description: p.description,
      image: p.image ?? '',
      status: p.status === 'OUT_OF_STOCK' ? 'ACTIVE' : p.status
    };
  }

  cancelProductForm(): void {
    this.productForm = null;
    this.productFormError = '';
  }

  async saveProduct(): Promise<void> {
    const f = this.productForm;
    if (!f || this.productSaving) return;

    const wholeNumber = (v: number | null, min: number): v is number =>
      typeof v === 'number' && Number.isInteger(v) && v >= min;

    if (f.name.trim().length < 2) return this.rejectProduct('Enter a product name.');
    if (!f.categoryId) return this.rejectProduct('Choose a category.');
    if (!wholeNumber(f.price, 1)) return this.rejectProduct('Price must be a whole number of pesos (1 or more).');
    if (!wholeNumber(f.lowStockThreshold, 0)) return this.rejectProduct('Low-stock level must be 0 or more.');
    if (!f.description.trim()) return this.rejectProduct('Enter a description.');
    if (!f.id && !wholeNumber(f.stock, 0)) return this.rejectProduct('Starting stock must be a whole number (0 or more).');
    if (!f.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug.trim()))
      return this.rejectProduct('Slug: lowercase letters, numbers and hyphens only (e.g. monstera-deliciosa).');

    const common = {
      name: f.name.trim(),
      categoryId: f.categoryId,
      subcategory: f.subcategory.trim(),
      price: f.price,
      lowStockThreshold: f.lowStockThreshold,
      description: f.description.trim(),
      status: f.status,
      ...(f.scientific.trim() ? { scientific: f.scientific.trim() } : {}),
      ...(f.image.trim() ? { image: f.image.trim() } : {})
    };

    this.productSaving = true;
    this.productFormError = '';
    try {
      if (f.id) {
        // Stock is NOT sent when editing: use "Adjust stock" so a sale made a
        // moment ago is never overwritten by a stale number from this form.
        await this.api.request(`/products/${encodeURIComponent(f.id)}`, { method: 'PATCH', body: common });
        this.ok(`Saved ${common.name}.`);
      } else {
        await this.api.request('/products', {
          method: 'POST',
          body: { ...common, slug: f.slug.trim(), stock: f.stock }
        });
        this.ok(`Created ${common.name}.`);
      }
      this.productForm = null;
      await this.loadProducts();
    } catch (e) {
      this.productFormError = this.describe(e, 'Unable to save the product.');
    } finally {
      this.productSaving = false;
      this.cdr.markForCheck();
    }
  }

  private rejectProduct(message: string): void {
    this.productFormError = message;
  }

  async adjustStock(p: AdminProduct): Promise<void> {
    const delta = this.stockDeltas[p.id];
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
      this.notice = { kind: 'error', text: 'Enter a whole number to add (e.g. 10) or remove (e.g. -3).' };
      return;
    }
    if (this.productBusyId) return;

    this.productBusyId = p.id;
    try {
      await this.api.request(`/products/${encodeURIComponent(p.id)}/stock`, {
        method: 'POST',
        body: { delta }
      });
      this.stockDeltas[p.id] = null;
      this.ok(`${p.name}: stock ${delta > 0 ? '+' : ''}${delta}.`);
      await this.loadProducts();
    } catch (e) {
      this.fail(e, 'Unable to adjust the stock.');
    } finally {
      this.productBusyId = '';
      this.cdr.markForCheck();
    }
  }

  async setProductActive(p: AdminProduct, active: boolean): Promise<void> {
    if (this.productBusyId) return;
    this.productBusyId = p.id;
    try {
      await this.api.request(`/products/${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        body: { status: active ? 'ACTIVE' : 'INACTIVE' }
      });
      this.ok(`${p.name} is now ${active ? 'visible in the shop' : 'hidden from the shop'}.`);
      await this.loadProducts();
    } catch (e) {
      this.fail(e, 'Unable to update the product.');
    } finally {
      this.productBusyId = '';
      this.cdr.markForCheck();
    }
  }

  async removeProduct(p: AdminProduct): Promise<void> {
    if (this.productBusyId) return;

    const text =
      p.orderLines > 0
        ? `"${p.name}" appears in ${p.orderLines} order line(s), so it will be hidden (deactivated) instead of deleted and existing orders stay intact. Continue?`
        : `Permanently delete "${p.name}"? It has never been ordered.`;
    if (!window.confirm(text)) return;

    this.productBusyId = p.id;
    try {
      const res = await this.api.request<{ message?: string }>(`/products/${encodeURIComponent(p.id)}`, {
        method: 'DELETE'
      });
      this.ok(res.message || 'Done.');
      await this.loadProducts();
    } catch (e) {
      this.fail(e, 'Unable to remove the product.');
    } finally {
      this.productBusyId = '';
      this.cdr.markForCheck();
    }
  }

  stockLabel(state: string): string {
    switch (state) {
      case 'OUT_OF_STOCK':
        return 'Out of stock';
      case 'LOW_STOCK':
        return 'Low stock';
      case 'INACTIVE':
        return 'Hidden';
      default:
        return 'In stock';
    }
  }

  /* ---------------------------------- accounts ---------------------------------- */

  applyAccountFilters(): void {
    void this.loadAccounts(1);
  }

  async loadAccounts(page = this.accountsPage): Promise<void> {
    const seq = ++this.accountsSeq;
    this.accountsLoading = true;
    this.accountsError = '';
    this.cdr.markForCheck();
    try {
      const f = this.accountFilters;
      const data = await this.api.request<Paged<AdminUser>>(
        `/admin/users${query({ q: f.q.trim(), role: f.role, suspended: f.suspended, page, limit: PAGE_SIZE })}`
      );
      if (seq !== this.accountsSeq) return;
      this.accounts = data.items;
      this.accountsTotal = data.total;
      this.accountsPage = data.page;
    } catch (e) {
      if (seq !== this.accountsSeq) return;
      this.accounts = [];
      this.accountsTotal = 0;
      this.accountsError = this.describe(e, 'Unable to load accounts.');
    } finally {
      if (seq === this.accountsSeq) { this.accountsLoading = false; this.cdr.markForCheck(); }
    }
  }

  isAdmin(user: AdminUser): boolean {
    return user.role === 'ADMIN';
  }

  isMe(user: AdminUser): boolean {
    return !!this.myId && user.id === this.myId;
  }

  private async patchAccount(user: AdminUser, body: Record<string, unknown>, done: string): Promise<void> {
    if (this.accountBusyId) return;
    this.accountBusyId = user.id;
    try {
      await this.api.request(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body });
      this.ok(done);
    } catch (e) {
      // e.g. "last active administrator" - the server's reason is shown as is.
      this.fail(e, 'Unable to update the account.');
    } finally {
      this.accountBusyId = '';
      this.cdr.markForCheck();
      await this.loadAccounts();
    }
  }

  toggleSuspension(user: AdminUser): void {
    const next = !user.isSuspended;
    const text = next
      ? `Suspend ${user.email}? They will be signed out of the API immediately and cannot use the shop.`
      : `Reactivate ${user.email}?`;
    if (!window.confirm(text)) return;
    void this.patchAccount(user, { isSuspended: next }, `${user.email} ${next ? 'suspended' : 'reactivated'}.`);
  }

  changeRole(user: AdminUser): void {
    const next = this.isAdmin(user) ? 'CUSTOMER' : 'ADMIN';
    const text =
      next === 'ADMIN'
        ? `Give ${user.email} FULL administrator access (orders, products, accounts)?`
        : `Remove administrator access from ${user.email}?`;
    if (!window.confirm(text)) return;
    void this.patchAccount(user, { role: next }, `${user.email} is now ${next === 'ADMIN' ? 'an administrator' : 'a customer'}.`);
  }

  async deleteAccount(user: AdminUser): Promise<void> {
    if (this.accountBusyId) return;
    const orders = user.orderCount > 0 ? ` Their ${user.orderCount} order(s) are kept for your records.` : '';
    if (!window.confirm(`Permanently delete the account ${user.email}? This also removes their login.${orders}`)) return;

    this.accountBusyId = user.id;
    try {
      await this.api.request(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      this.ok(`${user.email} deleted.`);
    } catch (e) {
      this.fail(e, 'Unable to delete the account.');
    } finally {
      this.accountBusyId = '';
      this.cdr.markForCheck();
      await this.loadAccounts();
    }
  }

  newAccount(): void {
    this.accountFormError = '';
    this.accountForm = { email: '', fullName: '', phone: '', role: 'CUSTOMER' };
  }

  cancelAccountForm(): void {
    this.accountForm = null;
    this.accountFormError = '';
  }

  async saveAccount(): Promise<void> {
    const f = this.accountForm;
    if (!f || this.accountSaving) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) {
      this.accountFormError = 'Enter a valid e-mail address.';
      return;
    }
    if (f.fullName.trim().length < 2) {
      this.accountFormError = 'Enter the full name.';
      return;
    }
    if (
      f.role === 'ADMIN' &&
      !window.confirm(`Create ${f.email.trim()} as a full ADMINISTRATOR? Double-check the address.`)
    )
      return;

    this.accountSaving = true;
    this.accountFormError = '';
    try {
      const res = await this.api.request<{ message?: string }>('/admin/users', {
        method: 'POST',
        body: {
          email: f.email.trim(),
          fullName: f.fullName.trim(),
          role: f.role,
          ...(f.phone.trim() ? { phone: f.phone.trim() } : {})
        }
      });
      this.accountForm = null;
      this.ok(res.message || 'Account created.');
      await this.loadAccounts(1);
    } catch (e) {
      this.accountFormError = this.describe(e, 'Unable to create the account.');
    } finally {
      this.accountSaving = false;
      this.cdr.markForCheck();
    }
  }

  /* ------------------------------------ paging ---------------------------------- */

  pages(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  goOrders(delta: number): void {
    void this.loadOrders(this.ordersPage + delta);
  }

  goProducts(delta: number): void {
    void this.loadProducts(this.productsPage + delta);
  }

  goAccounts(delta: number): void {
    void this.loadAccounts(this.accountsPage + delta);
  }

  /* ------------------------------------ misc ------------------------------------ */

  logout(): void {
    void this.authService.logout().finally(() => this.router.navigateByUrl('/login'));
  }

  goHome(): void {
    this.router.navigateByUrl('/home');
  }
}
