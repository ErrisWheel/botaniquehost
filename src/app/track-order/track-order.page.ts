import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../shared/auth.service';
import { ApiService, ApiError } from '../shared/api.service';
import { OrdersService } from '../shared/orders.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';

/* =========================================================
   ORDER ITEM
========================================================= */

interface OrderItem {
  id?: string | number;
  name: string;
  image: string;
  price: number;
  quantity: number;
  productId?: string;
  productSlug?: string;
}

/* =========================================================
   ORDER
========================================================= */

interface Order {
  id: string;
  orderNumber?: string;
  date: string;
  status: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  paymentStatus: string;
  customerReceivedAt?: string | null;
  returns?: Array<{ id: string; reason: string; status: string; refundAmount?: number | null; createdAt?: string }>;

  items: OrderItem[];

  address?: string;
  phone?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  paymentMethod?: string;

  createdAt?: string;
}

/* =========================================================
   CART ITEM
========================================================= */

interface CartItem {
  id: string | number;
  name: string;
  image?: string;
  price: number;
  quantity: number;
}

/* =========================================================
   TRACK ORDER PAGE
========================================================= */

@Component({
  selector: 'app-track-order',
  templateUrl: './track-order.page.html',
  styleUrls: ['./track-order.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class TrackOrderPage implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);

  /* NAVBAR */

  menuOpen = false;
  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  wishlistCount = 0;
  notificationCount = 0;
  cartCount = 0;

  email = '';
  password = '';
  rememberMe = false;


  /* ORDER */

  order: Order | null = null;
  mapEmbedUrl: SafeResourceUrl | null = null;
  mapDirectionsUrl = '';
  receiptSubmitting = false;
  receiptError = '';
  reviewModalOpen = false;
  productReviewSubmitting = false;
  storeReviewSubmitting = false;
  reviewProductSelection = '';
  productReviewRating = 0;
  productReviewComment = '';
  storeReviewRating = 0;
  storeReviewComment = '';
  productReviewFeedback = '';
  productReviewFeedbackError = false;
  cancelSubmitting = false;
  cancelError = '';
  returnModalOpen = false;
  returnSubmitting = false;
  returnReason = '';
  returnError = '';
  storeReviewFeedback = '';
  storeReviewFeedbackError = false;
  storeReviewSummary: { average: number | null; count: number } = { average: null, count: 0 };
  readonly reviewStars = [1, 2, 3, 4, 5];
  orders: Order[] = [];
  ordersLoading = false;
  ordersError = '';
  private ordersLoaded = false;

  private orderId = '';
  private ordersSeq = 0;
  private skipFirstViewEnterRefresh = true;

  get isDetailView(): boolean {
    return !!this.orderId;
  }

  get shouldShowOrderMap(): boolean {
    const status = this.order ? this.normalizeStatus(this.order.status) : '';
    return status === 'On delivery' || status === 'Delivered';
  }

  get reviewableItems(): OrderItem[] {
    return (this.order?.items || []).filter((item) => !!(item.productSlug || item.productId));
  }


  get currentReturnRequest(): NonNullable<Order['returns']>[number] | undefined {
    return [...(this.order?.returns || [])]
      .filter(item => item.status !== 'REJECTED')
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
  }

  get returnButtonLabel(): string {
    const status = this.currentReturnRequest?.status;
    if (status === 'REQUESTED') return 'Return Requested';
    if (status === 'APPROVED') return 'Return Approved · Refund Pending';
    if (status === 'REFUNDED') return 'Refund Confirmed';
    return 'Request a Return';
  }

  get returnRequestActive(): boolean {
    return !!this.currentReturnRequest;
  }

  reviewStarsFor(rating: number): string {
    const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  get filteredOrders(): Order[] {
    if (this.statusFilter === 'all') return this.orders;
    return this.orders.filter(
      item => this.normalizeStatus(item.status) === this.statusFilter
    );
  }

  // Lookup state. The template shows loading / error / not-found separately.
  orderLoading = false;
  orderError = '';

  // Newest lookup wins: slower, older responses are ignored.
  private loadSeq = 0;
  private pendingLoad: { key: string; promise: Promise<void> } | null = null;

  private readonly API_URL = `${environment.apiUrl}`;
  /* STATUS FILTER */


  statusFilter = 'all';


  /* CART */

  cartDrawerOpen = false;

  cartItems: CartItem[] = [];

  cartSubtotal = 0;

  private readonly CART_KEY = 'botaniqueCartItems';


  /* USER STORAGE */

  private readonly USER_KEY = 'botaniqueUser';


  private readonly WISHLIST_KEY = 'botaniqueWishlistItems';

  private readonly NOTIFICATION_KEY = 'botaniqueNotifications';


  /* CONSTRUCTOR */

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}


  /* INIT */

  ngOnInit(): void {

    // Support both the explicit /track-order/:orderId route (used by Profile
    // history) and older ?id= links (checkout/payment result). Watching both
    // streams keeps the selected order correct when Ionic reuses a page.
    combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
      ([params, queryParams]) => {
        const nextId = String(
          params.get('orderId') || queryParams.get('id') || ''
        ).trim();
        const changed = nextId !== this.orderId;

        if (!changed) {
          if (!nextId && !this.ordersLoaded && !this.ordersLoading && !this.ordersError) {
            void this.loadOrders(true);
          }
          return;
        }

        this.orderId = nextId;

        if (nextId) {
          // Clear the previous detail immediately. Never leave the newest order
          // visible while the requested historical order is being fetched.
          this.order = null;
          this.orderLoading = true;
          this.orderError = '';
          this.cdr.markForCheck();
          void this.loadOrder(true);
        } else {
          this.order = null;
          this.orderLoading = false;
          if (this.orders.length === 0 || this.ordersLoaded) void this.loadOrders(true);
          this.cdr.markForCheck();
        }
      }
    );


    /* CART */

    this.loadCart();

    this.updateCartCount();


    /* WISHLIST */

    this.updateWishlistCount();


    /* NOTIFICATIONS */

    this.updateNotificationCount();

  }


  // Ionic keeps this page in its navigation stack, so ngOnInit does not run
  // again when the customer returns (e.g. after payment or from the profile).
  // Reload every time the page becomes active so status changes show up
  // without a manual reload.
  ionViewWillEnter(): void {
    // ngOnInit handles the first entry; refresh fresh data on later visits.
    if (this.skipFirstViewEnterRefresh) {
      this.skipFirstViewEnterRefresh = false;
    } else if (this.orderId) {
      void this.loadOrder(true);
    } else {
      void this.loadOrders(true);
    }

    this.loadCart();
    this.updateCartCount();
    this.updateWishlistCount();
    this.updateNotificationCount();
  }


  /* LOAD ORDER */

  /**
   * Loads the order named by ?id= (database id or order number). Calls for the
   * same order that arrive while one is running share it, and a newer lookup
   * always replaces an older one. The no-id route shows the full order list.
   */
  loadOrder(force = false): Promise<void> {

    const key = this.orderId;

    if (!force && this.pendingLoad?.key === key) {
      return this.pendingLoad.promise;
    }

    const seq = ++this.loadSeq;

    const promise: Promise<void> =
      this.fetchOrder(key, seq).finally(() => {
        if (this.pendingLoad?.promise === promise) {
          this.pendingLoad = null;
        }
      });

    this.pendingLoad = { key, promise };

    return promise;

  }

  retryLoadOrder(): void {

    void this.loadOrder(true);

  }

  private async fetchOrder(
    identifier: string,
    seq: number
  ): Promise<void> {

    if (!this.authService.isLoggedIn) {

      this.order = null;
      this.orderLoading = false;

      alert(
        'Please log in to view your order.'
      );

      await this.router.navigateByUrl('/login');

      return;

    }

    this.orderLoading = true;
    this.orderError = '';
    this.cdr.markForCheck();

    try {

      const found =
        identifier
          ? await this.findOrder(identifier)
          : await this.findLatestOrder();

      // A newer lookup started while we waited: let it decide what to show.
      if (seq !== this.loadSeq) {
        return;
      }

      this.order =
        found
          ? this.normalizeOrder(found)
          : null;
      this.prepareOrderMap(this.order);

      /*
       * Replace an order number in the URL with the real database ID so a
       * refresh does not repeat the number lookup.
       */
      if (
        found?.id !== undefined &&
        found?.id !== null &&
        identifier &&
        String(found.id) !== identifier
      ) {

        this.orderId = String(found.id);

        void this.router.navigate(
          ['/track-order'],
          {
            queryParams: {
              id: this.orderId
            },
            replaceUrl: true
          }
        );

      }

    } catch (error: any) {

      if (seq !== this.loadSeq) {
        return;
      }

      console.error(
        'Unable to load order:',
        error
      );

      if (
        error instanceof ApiError &&
        error.isUnauthorized
      ) {

        await this.handleUnauthorized();

        return;

      }

      this.order = null;

      this.orderError =
        error instanceof ApiError
          ? error.message
          : 'Unable to load your order. Please try again.';

    } finally {

      if (seq === this.loadSeq) {
        this.orderLoading = false;
        this.cdr.markForCheck();
      }

    }

  }

  /** The checkout page may pass the database ID or the order number. */
  private async findOrder(
    identifier: string
  ): Promise<any | null> {

    const requestedId = String(identifier).trim();

    try {

      const response: any =
        await this.ordersService.loadOne(requestedId);

      const rawOrder =
        response?.order ||
        response?.data ||
        response;

      if (rawOrder) {
        const returnedId = String(rawOrder.id ?? '').trim().toLowerCase();
        const returnedNumber = String(rawOrder.orderNumber ?? '').trim().toLowerCase();

        // Defensive check: even if an intermediary returns a stale order, do
        // not mistake it for the explicitly requested one.
        if (
          returnedId === requestedId.toLowerCase() ||
          returnedNumber === requestedId.toLowerCase()
        ) {
          return rawOrder;
        }
      }

    } catch (error: any) {

      // Only "not found" falls back to the order-number lookup below;
      // anything else (401, network, server error) is a real failure.
      if (
        !(error instanceof ApiError) ||
        error.status !== 404
      ) {
        throw error;
      }

    }

    const wanted = requestedId.toLowerCase();

    const orders = await this.ordersService.load();

    return (
      orders.find(
        (item: any) =>
          String(item?.id ?? '').trim().toLowerCase() === wanted ||
          String(item?.orderNumber ?? '').trim().toLowerCase() === wanted
      ) || null
    );

  }

  private async findLatestOrder(): Promise<any | null> {

    const orders = await this.ordersService.load();

    if (orders.length === 0) {
      return null;
    }

    // Newest first, whatever order the API returned them in.
    return [...orders].sort(
      (a: any, b: any) =>
        new Date(b?.createdAt || 0).getTime() -
        new Date(a?.createdAt || 0).getTime()
    )[0];

  }

  private async handleUnauthorized(): Promise<void> {

    this.order = null;

    await this.authService.logout().catch(() => undefined);

    alert(
      'Your session has expired. Please log in again.'
    );

    await this.router.navigateByUrl('/login');

  }


  /* NORMALIZE ORDER */

  private normalizeOrder(
    rawOrder: any
  ): Order {

    const rawItems =
      Array.isArray(rawOrder?.items)
        ? rawOrder.items
        : [];


    /* NORMALIZE ITEMS */

    const items: OrderItem[] =
      rawItems.map(
        (item: any) => {

          const quantity =
            Number(
              item?.quantity
            );


          return {

            id:
              item?.id,

            productId:
              String(item?.productId || item?.product?.id || ''),

            productSlug:
              String(item?.product?.slug || ''),

            name:
              item?.productName ||
              item?.name ||
              'Botanique Product',

            image:
              item?.image ||
              item?.product?.image ||
              '',

            price:
              Number(
                item?.unitPrice ??
                item?.price
              ) || 0,

            quantity:
              quantity > 0
                ? quantity
                : 1

          };

        }
      );


    /* CUSTOMER */

    let customer: any = {};

    if (
      rawOrder?.customerJson
    ) {

      try {

        customer =
          typeof rawOrder.customerJson ===
          'string'
            ? JSON.parse(
                rawOrder.customerJson
              )
            : rawOrder.customerJson;

      } catch {

        customer = {};

      }

    }


    /* DELIVERY */

    let delivery: any = {};

    if (
      rawOrder?.deliveryJson
    ) {

      try {

        delivery =
          typeof rawOrder.deliveryJson ===
          'string'
            ? JSON.parse(
                rawOrder.deliveryJson
              )
            : rawOrder.deliveryJson;

      } catch {

        delivery = {};

      }

    }


    /* ADDRESS */

    const address =
      customer?.address ||
      [
        customer?.streetAddress,
        customer?.city,
        customer?.province,
        customer?.region,
        customer?.zip
      ]
        .filter(
          part =>
            part !== undefined &&
            part !== null &&
            String(part).trim() !== ''
        )
        .join(', ');


    /* PHONE */

    const phone =
      customer?.phone ||
      '';


    /* DELIVERY DATE */

    const deliveryDate =
      delivery?.date ||
      '';


    /* DELIVERY TIME */

    const deliveryTime =
      delivery?.time ||
      '';


    /* PAYMENT */

    const paymentMethod =
      rawOrder?.paymentMethod === 'MAYA'
        ? 'Maya'
        : rawOrder?.paymentMethod === 'COD'
          ? 'Cash on Delivery'
          : rawOrder?.paymentMethod || 'Cash on Delivery';


    /* TOTAL */

    const itemSubtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const numericField = (value: unknown, fallback = 0) => {
      const n = Number(value);
      return value !== null && value !== undefined && Number.isFinite(n) ? n : fallback;
    };

    const total = numericField(rawOrder?.total, itemSubtotal);


    return {

      id:
        String(
          rawOrder?.id ||
          rawOrder?.orderNumber ||
          'BOTANIQUE-ORDER'
        ),

      orderNumber:
        String(
          rawOrder?.orderNumber ||
          rawOrder?.id ||
          'BOTANIQUE-ORDER'
        ),

      date:
        rawOrder?.createdAt ||
        '',

      status:
        this.normalizeStatus(
          rawOrder?.status
        ),

      total,

      subtotal: numericField(rawOrder?.subtotal, itemSubtotal),
      discount: numericField(rawOrder?.discount),
      shipping: numericField(rawOrder?.shipping),
      tax: numericField(rawOrder?.tax),
      paymentStatus: String(rawOrder?.paymentStatus || 'PENDING'),
      customerReceivedAt: rawOrder?.customerReceivedAt || null,
      returns: Array.isArray(rawOrder?.returns) ? rawOrder.returns.map((item: any) => ({
        id: String(item?.id || ''),
        reason: String(item?.reason || ''),
        status: String(item?.status || 'REQUESTED').toUpperCase(),
        refundAmount: item?.refundAmount === null || item?.refundAmount === undefined ? null : Number(item.refundAmount),
        createdAt: String(item?.createdAt || '')
      })) : [],

      items,

      address,

      phone,

      deliveryDate,

      deliveryTime,

      paymentMethod,

      createdAt:
        rawOrder?.createdAt ||
        ''

    };

  }

  private prepareOrderMap(order: Order | null): void {
    const status = order ? this.normalizeStatus(order.status) : '';
    const rawDestination: any = order?.address;
    const destination = (typeof rawDestination === 'string' ? rawDestination : this.formatAddress(rawDestination)).trim();
    if (!order || !['On delivery', 'Delivered'].includes(status) || !destination) {
      this.mapEmbedUrl = null;
      this.mapDirectionsUrl = '';
      return;
    }
    const target = encodeURIComponent(destination);
    if (status === 'Delivered') {
      this.mapEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?q=${target}&output=embed`);
      this.mapDirectionsUrl = `https://www.google.com/maps/search/?api=1&query=${target}`;
      return;
    }
    const store = 'Botanique Studio, 938 Aurora Boulevard, Cubao, Quezon City';
    const origin = encodeURIComponent(store);
    this.mapEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?saddr=${origin}&daddr=${target}&output=embed`);
    this.mapDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${target}`;
  }

  async confirmOrderReceived(): Promise<void> {
    if (
      !this.order ||
      !['On delivery', 'Delivered'].includes(this.normalizeStatus(this.order.status)) ||
      this.order.customerReceivedAt ||
      this.receiptSubmitting
    ) return;
    this.receiptSubmitting = true;
    this.receiptError = '';
    this.cdr.markForCheck();
    try {
      const result = await this.api.request<any>(`/orders/${encodeURIComponent(this.order.id)}/received`, { method: 'POST' });
      this.order = this.normalizeOrder(result?.order || result);
      this.prepareOrderMap(this.order);
      this.ordersService.invalidate();
      if (result?.changed === false) {
        this.receiptError = 'Receipt has already been confirmed for this order.';
        return;
      }
      this.reviewProductSelection = this.reviewableItems[0]?.productSlug || this.reviewableItems[0]?.productId || '';
      this.productReviewRating = 0;
      this.productReviewComment = '';
      this.storeReviewRating = 0;
      this.storeReviewComment = '';
      this.productReviewFeedback = '';
      this.storeReviewFeedback = '';
      this.reviewModalOpen = true;
      void this.loadStoreReviewSummary();
    } catch (error: any) {
      this.receiptError = error instanceof ApiError ? error.message : 'Unable to confirm receipt right now. Please try again.';
    } finally {
      this.receiptSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  /* CANCEL ORDER — PENDING ONLY */

async cancelOrder(): Promise<void> {
  if (
    !this.order ||
    this.normalizeStatus(this.order.status) !== 'Pending' ||
    this.cancelSubmitting
  ) {
    return;
  }

  const confirmed = window.confirm(
    'Are you sure you want to cancel this order?'
  );

  if (!confirmed) {
    return;
  }

  this.cancelSubmitting = true;
  this.cancelError = '';
  this.cdr.markForCheck();

  try {
    const result = await this.api.request<any>(
      `/orders/${encodeURIComponent(this.order.id)}/cancel`,
      { method: 'POST' }
    );

    const updatedOrder = result?.order || result;

    if (updatedOrder && typeof updatedOrder === 'object') {
      this.order = this.normalizeOrder(updatedOrder);
      this.prepareOrderMap(this.order);
    } else {
      this.order.status = 'Cancelled';
    }

    this.ordersService.invalidate();

    if (!this.isDetailView) {
      await this.loadOrders(true);
    }
  } catch (error: any) {
    console.error('Unable to cancel order:', error);

    this.cancelError =
      error instanceof ApiError
        ? error.message
        : 'Unable to cancel your order. Please try again.';
  } finally {
    this.cancelSubmitting = false;
    this.cdr.markForCheck();
  }
}

  openReturnModal(): void {
    if (!this.order || this.normalizeStatus(this.order.status) !== 'Delivered' || this.returnRequestActive || this.returnSubmitting) return;
    this.returnReason = '';
    this.returnError = '';
    this.returnModalOpen = true;
    this.cdr.markForCheck();
  }

  closeReturnModal(): void {
    if (this.returnSubmitting) return;
    this.returnModalOpen = false;
    this.returnError = '';
    this.cdr.markForCheck();
  }

  async submitReturnRequest(): Promise<void> {
    const reason = this.returnReason.trim();
    if (!this.order || this.normalizeStatus(this.order.status) !== 'Delivered' || this.returnSubmitting) return;
    if (reason.length < 5) {
      this.returnError = 'Please provide a reason with at least 5 characters.';
      return;
    }
    if (this.returnRequestActive) {
      this.returnError = 'A return request already exists for this order.';
      return;
    }

    this.returnSubmitting = true;
    this.returnError = '';
    this.cdr.markForCheck();
    try {
      const result = await this.api.request<any>(`/orders/${encodeURIComponent(this.order.id)}/return`, {
        method: 'POST',
        body: { reason }
      });
      const created = result?.returnRequest || result;
      this.order.returns = [...(this.order.returns || []), {
        id: String(created?.id || ''),
        reason: String(created?.reason || reason),
        status: String(created?.status || 'REQUESTED').toUpperCase(),
        refundAmount: created?.refundAmount === null || created?.refundAmount === undefined ? null : Number(created.refundAmount),
        createdAt: String(created?.createdAt || new Date().toISOString())
      }];
      this.returnModalOpen = false;
      this.returnReason = '';
      this.ordersService.invalidate();
    } catch (error: any) {
      this.returnError = error instanceof ApiError ? error.message : 'Unable to submit your return request. Please try again.';
    } finally {
      this.returnSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  closeReviewModal(): void {
    this.reviewModalOpen = false;
    this.cdr.markForCheck();
  }

  private async loadStoreReviewSummary(): Promise<void> {
    try {
      this.storeReviewSummary = await this.api.request<{ average: number | null; count: number }>('/reviews/store/summary');
    } catch {
      this.storeReviewSummary = { average: null, count: 0 };
    }
    this.cdr.markForCheck();
  }

  async submitProductReviewFromOrder(): Promise<void> {
    if (!this.order || !this.reviewProductSelection || this.productReviewRating < 1 || this.productReviewSubmitting) return;
    this.productReviewSubmitting = true;
    this.productReviewFeedback = '';
    try {
      await this.api.request(`/reviews/product/${encodeURIComponent(this.reviewProductSelection)}`, {
        method: 'POST', body: { orderId: this.order.id, rating: this.productReviewRating, comment: this.productReviewComment.trim() || undefined }
      });
      this.productReviewFeedback = 'Thank you. Your product review has been saved.';
      this.productReviewFeedbackError = false;
      this.productReviewRating = 0;
      this.productReviewComment = '';
    } catch (error: any) {
      this.productReviewFeedback = error?.message || 'Unable to save your product review. Please try again.';
      this.productReviewFeedbackError = true;
    } finally {
      this.productReviewSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  async submitStoreReviewFromOrder(): Promise<void> {
    if (!this.order || this.storeReviewRating < 1 || this.storeReviewSubmitting) return;
    this.storeReviewSubmitting = true;
    this.storeReviewFeedback = '';
    try {
      await this.api.request('/reviews/store', {
        method: 'POST', body: { orderId: this.order.id, rating: this.storeReviewRating, comment: this.storeReviewComment.trim() || undefined }
      });
      this.storeReviewFeedback = 'Thank you. Your store review has been saved.';
      this.storeReviewFeedbackError = false;
      this.storeReviewRating = 0;
      this.storeReviewComment = '';
      await this.loadStoreReviewSummary();
    } catch (error: any) {
      this.storeReviewFeedback = error?.message || 'Unable to save your store review. Please try again.';
      this.storeReviewFeedbackError = true;
    } finally {
      this.storeReviewSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  paymentStatusLabel(status?: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Pending',
      PAID: 'Paid',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired',
      REFUND_PENDING: 'Refund pending',
      REFUNDED: 'Refunded'
    };
    const value = String(status || 'PENDING').toUpperCase();
    return labels[value] || value;
  }


  /* FORMAT ADDRESS */

  private formatAddress(
    address: any
  ): string {

    if (!address) {

      return '';

    }


    if (
      typeof address ===
      'string'
    ) {

      return address;

    }


    const parts = [

      address.label,

      address.street,

      address.city,

      address.province,

      address.region,

      address.zip

    ];


    return parts
      .filter(
        part =>
          part !== undefined &&
          part !== null &&
          String(part).trim() !== ''
      )
      .map(
        part =>
          String(part).trim()
      )
      .join(', ');

  }


  /* NORMALIZE STATUS */
  normalizeStatus(status?: string): string {
    const value = String(status || 'Pending')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_')
      .replace(/\s+/g, '_');

    switch (value) {
      case 'pending':
        return 'Pending';
      case 'processing':
      case 'confirmed':
      case 'preparing':
        return 'Processing';
      case 'processed':
        return 'Processed';
      case 'sorting':
      case 'order_is_being_sorted':
      case 'being_sorted':
        return 'Order is being sorted';
      // Old shipped orders are displayed as On delivery after the data migration.
      case 'shipped':
      case 'in_transit':
      case 'intransit':
      case 'on_delivery':
      case 'out_for_delivery':
      case 'outfordelivery':
      case 'delivery':
        return 'On delivery';
      case 'delivered':
      case 'complete':
      case 'completed':
        return 'Delivered';
      case 'cancelled':
      case 'canceled':
      case 'cancel':
        return 'Cancelled';
      default:
        return 'Pending';
    }
  }

  /* ORDER LIST + STATUS FILTER */

  async loadOrders(force = false): Promise<void> {
    const seq = ++this.ordersSeq;
    this.ordersLoading = true;
    this.ordersError = '';
    this.cdr.markForCheck();

    if (!this.authService.isLoggedIn) {
      this.orders = [];
      this.ordersLoaded = false;
      this.ordersLoading = false;
      this.ordersError = 'Please log in to view your orders.';
      this.cdr.markForCheck();
      await this.router.navigateByUrl('/login');
      return;
    }

    try {
      const rawOrders = await this.ordersService.load(force);
      if (seq !== this.ordersSeq) return;

      this.orders = rawOrders
        .map((raw: any) => this.normalizeOrder(raw))
        .sort((a, b) => {
          const aTime = new Date(a.createdAt || a.date || 0).getTime();
          const bTime = new Date(b.createdAt || b.date || 0).getTime();
          return bTime - aTime;
        });
      this.ordersLoaded = true;
    } catch (error: any) {
      if (seq !== this.ordersSeq) return;
      console.error('Unable to load orders:', error);

      if (error instanceof ApiError && error.isUnauthorized) {
        await this.handleUnauthorized();
        return;
      }

      this.orders = [];
      this.ordersLoaded = false;
      this.ordersError = error instanceof ApiError
        ? error.message
        : 'Unable to load your orders. Please try again.';
    } finally {
      if (seq === this.ordersSeq) {
        this.ordersLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  async showAllOrders(): Promise<void> {
    this.statusFilter = 'all';
    if (!this.isDetailView) {
      await this.loadOrders(true);
      return;
    }

    ++this.loadSeq;
    this.order = null;
    this.orderLoading = true;
    this.orderError = '';
    this.cdr.markForCheck();
    await this.router.navigateByUrl('/track-order', { replaceUrl: true });
  }

  async filterOrders(): Promise<void> {
    // The dropdown filters the full order list locally, so changing filters is
    // immediate and cannot accidentally select an unrelated single order.
    if (this.isDetailView) {
      ++this.loadSeq; // ignore any outstanding detail request
      this.order = null;
      this.orderLoading = true; // keep the detail view from flashing a false 'not found' during navigation
      this.orderError = '';
      this.cdr.markForCheck();
      await this.router.navigateByUrl('/track-order', { replaceUrl: true });
      return;
    }

    if (!this.ordersLoading && !this.ordersLoaded && !this.ordersError) {
      await this.loadOrders(true);
    }
    this.cdr.markForCheck();
  }

  trackOrder(orderId: string): void {
    const selectedOrderId = String(orderId || '').trim();
    if (!selectedOrderId) return;

    this.statusFilter = 'all';
    this.order = null;
    this.orderError = '';
    this.orderLoading = true;
    this.cdr.markForCheck();
    void this.router.navigate(['/track-order', selectedOrderId]);
  }

  retryLoadOrders(): void {
    void this.loadOrders(true);
  }

  /* STATUS STEP */
  private getStatusStep(status?: string): number {
    if (this.normalizeStatus(status) === 'Cancelled') return 0;

    const steps: Record<string, number> = {
      Pending: 1,
      Processing: 2,
      Processed: 3,
      'Order is being sorted': 4,
      'On delivery': 5,
      Delivered: 6
    };
    return steps[this.normalizeStatus(status)] ?? 1;
  }

  private getStepNumber(
    step: 'pending' | 'processing' | 'processed' | 'sorting' | 'on_delivery' | 'delivered'
  ): number {
    const steps = {
      pending: 1,
      processing: 2,
      processed: 3,
      sorting: 4,
      on_delivery: 5,
      delivered: 6
    };
    return steps[step];
  }

  isStepCompleted(
    step: 'pending' | 'processing' | 'processed' | 'sorting' | 'on_delivery' | 'delivered'
  ): boolean {
    if (!this.order || this.normalizeStatus(this.order.status) === 'Cancelled') return false;
    return this.getStatusStep(this.order.status) > this.getStepNumber(step);
  }

  isCurrentStep(
    step: 'pending' | 'processing' | 'processed' | 'sorting' | 'on_delivery' | 'delivered'
  ): boolean {
    if (!this.order || this.normalizeStatus(this.order.status) === 'Cancelled') return false;
    return this.getStatusStep(this.order.status) === this.getStepNumber(step);
  }

  isStepReached(
    step: 'pending' | 'processing' | 'processed' | 'sorting' | 'on_delivery' | 'delivered'
  ): boolean {
    if (!this.order || this.normalizeStatus(this.order.status) === 'Cancelled') return false;
    return this.getStatusStep(this.order.status) >= this.getStepNumber(step);
  }

  /* STATUS MESSAGE */
  getStatusMessage(status: string): string {
    switch (this.normalizeStatus(status)) {
      case 'Pending':
        return 'Your order has been received and is awaiting processing.';
      case 'Processing':
        return 'Your order is being prepared.';
      case 'Processed':
        return 'Your order is prepared and ready for sorting.';
      case 'Order is being sorted':
        return 'Your parcel is being sorted for delivery.';
      case 'On delivery':
        return 'Your Botanique order is on its way.';
      case 'Delivered':
        return 'Your order has been delivered.';
      case 'Cancelled':
        return 'This order has been cancelled.';
      default:
        return 'We are preparing your order.';
    }
  }

  /* STATUS CSS CLASS */
  getOrderStatusClass(status?: string): string {
    switch (this.normalizeStatus(status)) {
      case 'Delivered':
        return 'status-delivered';
      case 'On delivery':
        return 'status-on-delivery';
      case 'Order is being sorted':
        return 'status-sorting';
      case 'Processed':
        return 'status-processed';
      case 'Cancelled':
        return 'status-cancelled';
      case 'Pending':
        return 'status-pending';
      default:
        return 'status-processing';
    }
  }

  /* ITEM COUNT */

  getItemCount(): number {

    if (!this.order) {

      return 0;

    }


    return this.order.items.reduce(
      (
        total: number,
        item: OrderItem
      ) => {

        return total +
          Number(
            item.quantity || 0
          );

      },
      0
    );

  }


  /* FORMAT PRICE */

  formatPrice(
    price: number
  ): string {

    return new Intl.NumberFormat(
      'en-PH',
      {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
      }
    ).format(
      Number(price) || 0
    );

  }


  /* FORMAT CART PRICE */

  formatCartPrice(
    price: number
  ): string {

    return this.formatPrice(
      price
    );

  }


  /* FORMAT DATE */

  formatDate(
    date: string
  ): string {

    if (!date) {

      return '—';

    }


    const parsedDate =
      new Date(date);


    if (
      isNaN(
        parsedDate.getTime()
      )
    ) {

      return date;

    }


    return parsedDate.toLocaleDateString(
      'en-US',
      {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }
    );

  }


  /* LOAD CART */

  loadCart(): void {

    const raw =
      localStorage.getItem(
        this.CART_KEY
      );


    if (!raw) {

      this.cartItems = [];

      this.cartSubtotal = 0;

      return;

    }


    try {

      const parsed =
        JSON.parse(raw);


      if (!Array.isArray(parsed)) {

        this.cartItems = [];

        this.cartSubtotal = 0;

        return;

      }


      this.cartItems =
        parsed.map(
          (item: any) => {

            const quantity =
              Number(
                item?.quantity
              );


            return {

              id:
                item?.id,

              name:
                item?.name ||
                'Product',

              image:
                item?.image ||
                '',

              price:
                Number(
                  item?.price
                ) || 0,

              quantity:
                quantity > 0
                  ? quantity
                  : 1

            };

          }
        );


      this.updateCartSubtotal();

    } catch (error) {

      console.error(
        'Unable to load cart:',
        error
      );

      this.cartItems = [];

      this.cartSubtotal = 0;

    }

  }


  /* SAVE CART */

  saveCart(): void {

    localStorage.setItem(
      this.CART_KEY,
      JSON.stringify(
        this.cartItems
      )
    );

  }


  /* UPDATE CART SUBTOTAL */

  updateCartSubtotal(): void {

    this.cartSubtotal =
      this.cartItems.reduce(
        (
          total: number,
          item: CartItem
        ) => {

          return total +
            (
              Number(item.price) *
              Number(item.quantity)
            );

        },
        0
      );

  }


  /* INCREASE QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    if (!item) {

      return;

    }


    item.quantity =
      Number(
        item.quantity || 0
      ) + 1;


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* DECREASE QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    if (!item) {

      return;

    }


    const quantity =
      Number(
        item.quantity || 1
      );


    if (quantity <= 1) {

      this.removeFromCart(
        item.id
      );

      return;

    }


    item.quantity =
      quantity - 1;


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* REMOVE FROM CART */

  removeFromCart(
    id: string | number
  ): void {

    this.cartItems =
      this.cartItems.filter(
        item =>
          String(item.id) !==
          String(id)
      );


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* OPEN CART */

  goToCart(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.loadCart();

    this.updateCartCount();

    this.cartDrawerOpen = true;

  }


  /* OPEN CART */

  openCart(): void {

    this.loadCart();

    this.updateCartCount();

    this.cartDrawerOpen = true;

    this.closeMenus();

  }


  /* CLOSE CART */

  closeCart(): void {

    this.cartDrawerOpen = false;

  }


  /* CONTINUE SHOPPING */

  continueShopping(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeCart();

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* CHECKOUT */

  checkout(
    event?: Event
  ): void {

    event?.preventDefault();


    if (
      this.cartItems.length === 0
    ) {

      alert(
        'Your cart is empty.'
      );

      return;

    }


    this.saveCart();

    this.closeCart();


    this.router.navigateByUrl(
      '/checkout'
    );

  }


  /* UPDATE CART COUNT */

  updateCartCount(): void {

    const raw =
      localStorage.getItem(
        this.CART_KEY
      );


    if (!raw) {

      this.cartCount = 0;

      return;

    }


    try {

      const items =
        JSON.parse(raw);


      if (!Array.isArray(items)) {

        this.cartCount = 0;

        return;

      }


      this.cartCount =
        items.reduce(
          (
            total: number,
            item: any
          ) => {

            return total +
              Number(
                item?.quantity || 1
              );

          },
          0
        );

    } catch {

      this.cartCount = 0;

    }

  }


  /* UPDATE WISHLIST COUNT */

  updateWishlistCount(): void {

    const raw =
      localStorage.getItem(
        this.WISHLIST_KEY
      );


    if (!raw) {

      this.wishlistCount = 0;

      return;

    }


    try {

      const items =
        JSON.parse(raw);


      this.wishlistCount =
        Array.isArray(items)
          ? items.length
          : 0;

    } catch {

      this.wishlistCount = 0;

    }

  }


  /* UPDATE NOTIFICATION COUNT */

  updateNotificationCount(): void {

    const raw =
      localStorage.getItem(
        this.NOTIFICATION_KEY
      );


    if (!raw) {

      this.notificationCount = 0;

      return;

    }


    try {

      const notifications =
        JSON.parse(raw);


      if (
        !Array.isArray(
          notifications
        )
      ) {

        this.notificationCount = 0;

        return;

      }


      this.notificationCount =
        notifications.filter(
          (notification: any) =>
            !notification?.read
        ).length;

    } catch {

      this.notificationCount = 0;

    }

  }


  /* LOGIN DROPDOWN */

  toggleLoginDropdown(event?: Event): void {

    event?.stopPropagation();

    if (this.isLoggedIn) {
      this.loginDropdownOpen = false;
      this.router.navigate(['/profile']);
      return;
    }

    this.loginDropdownOpen = !this.loginDropdownOpen;
  }


  /* CLOSE LOGIN DROPDOWN */

  closeLoginDropdown(): void {

    this.loginDropdownOpen = false;

  }


  /* LOGIN */

  async login(): Promise<void> {
    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const user = await this.authService.login(loginEmail, this.password, true);

      this.closeLoginDropdown();
      this.email = '';
      this.password = '';
      void this.loadOrder();

      alert(`Welcome back, ${user.fullName || 'Botanique customer'}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(error?.message || 'Unable to log in. Please try again.');
    }
  }


  /* FORGOT PASSWORD */

  async forgotPassword(
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    const email = (
      prompt('Enter the email address of your Botanique account:') || ''
    ).trim();

    if (!email) {
      return;
    }

    try {
      await this.authService.resetPassword(email);
      alert(
        'If an account exists for that email address, a password reset link has been sent.'
      );
    } catch (error: any) {
      alert(
        error?.message ||
        'Unable to send the reset email. Please try again.'
      );
    }
  }


  /* CONTINUE AS GUEST */

  continueAsGuest(): void {

    this.loginDropdownOpen = false;

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;


    if (this.menuOpen) {

      this.loginDropdownOpen = false;

      this.cartDrawerOpen = false;

    }

  }


  /* CLOSE MENUS */

  closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen = false;

  }


  /* HOME */

  goHome(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/home'
    );

  }


  /* ABOUT */

  goToAbout(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/about'
    );

  }


  /* STAY ON ABOUT */

  stayOnAbout(
    event?: Event
  ): void {

    event?.preventDefault();

    this.menuOpen = false;

  }


  /* PRODUCT */

  goToProduct(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* DEVELOPERS */

  goToDevelopers(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/developers'
    );

  }


  /* CONTACT */

  goToContact(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/contact'
    );

  }


  /* WISHLIST */

  goToWishlist(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/wishlist'
    );

  }


  /* NOTIFICATIONS */

  goToNotifications(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/notifications'
    );

  }


  /* SIGN UP */

  goToSignup(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/signup'
    );

  }


  /* BACK TO MY ORDERS */

  goBack(): void {

    this.closeMenus();

    this.closeCart();

    this.router.navigateByUrl(
      '/profile'
    );

  }

}
