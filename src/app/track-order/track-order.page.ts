import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

/* =========================================================
   ORDER ITEM
========================================================= */

interface OrderItem {
  id?: string | number;
  name: string;
  image: string;
  price: number;
  quantity: number;
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

  private orderId = '';

  private readonly ORDER_KEY = 'botaniqueOrders';

  private readonly API_URL = 'http://localhost:4000/api';
  /* STATUS FILTER */


  statusFilter = 'all';


  /* CART */

  cartDrawerOpen = false;

  cartItems: CartItem[] = [];

  cartSubtotal = 0;

  private readonly CART_KEY = 'botaniqueCartItems';


  /* USER STORAGE */

  private readonly USER_KEY = 'botaniqueUser';

  private readonly USERS_KEY = 'botaniqueUsers';

  private readonly WISHLIST_KEY = 'botaniqueWishlistItems';

  private readonly NOTIFICATION_KEY = 'botaniqueNotifications';


  /* CONSTRUCTOR */

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient
  ) {}


  /* INIT */

  ngOnInit(): void {

    this.route.queryParams.subscribe(params => {

      this.orderId = params['id'] || '';

      this.loadOrder();

    });


    /* CART */

    this.loadCart();

    this.updateCartCount();


    /* WISHLIST */

    this.updateWishlistCount();


    /* NOTIFICATIONS */

    this.updateNotificationCount();

  }


  /* LOAD ORDER */

  loadOrder(): void {
    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');

    if (!token) {
      this.order = null;

      alert(
        'Please log in to view your order.'
      );

      this.router.navigateByUrl('/login');
      return;
    }

    const headers =
      new HttpHeaders({
        Authorization:
          `Bearer ${token}`
      });

    /*
     * The checkout page may send either the database order ID
     * or an order number. Try the specific-order endpoint first.
     * If that does not work, load the customer's orders and find
     * the matching order by ID or order number.
     */
    if (this.orderId) {
      this.loadSpecificOrder(
        this.orderId,
        headers
      );
      return;
    }

    /* No ID = load the latest order */
    this.loadLatestOrder(headers);
  }

  private loadSpecificOrder(
    identifier: string,
    headers: HttpHeaders
  ): void {
    const requestedId = String(identifier).trim();

    this.http
      .get<any>(
        `${this.API_URL}/orders/${encodeURIComponent(requestedId)}`,
        { headers }
      )
      .subscribe({
        next: (response) => {
          /*
           * Some APIs return { order: {...} } while others return
           * the order object directly.
           */
          const rawOrder =
            response?.order ||
            response?.data ||
            response;

          if (
            rawOrder &&
            (
              rawOrder.id !== undefined ||
              rawOrder.orderNumber !== undefined
            )
          ) {
            this.order =
              this.normalizeOrder(rawOrder);

            return;
          }

          /*
           * If the endpoint returned an unexpected shape, fall back
           * to the customer's order list.
           */
          this.findOrderInList(
            requestedId,
            headers
          );
        },

        error: (error) => {
          console.error(
            'Unable to load order by ID:',
            error
          );

          /*
           * A mismatch between order ID and order number should not
           * make the Track Order page say "order not found".
           * Search the authenticated customer's orders instead.
           */
          if (
            error?.status === 401
          ) {
            this.handleUnauthorized();
            return;
          }

          this.findOrderInList(
            requestedId,
            headers
          );
        }
      });
  }

  private loadLatestOrder(
    headers: HttpHeaders
  ): void {
    this.http
      .get<any>(
        `${this.API_URL}/orders`,
        { headers }
      )
      .subscribe({
        next: (response) => {
          const orders =
            this.extractOrders(response);

          if (orders.length === 0) {
            this.order = null;
            return;
          }

          /*
           * Use createdAt when available so the newest order is
           * actually selected even if the API does not return
           * newest-first.
           */
          orders.sort(
            (a: any, b: any) => {
              const aTime =
                new Date(
                  a?.createdAt || 0
                ).getTime();

              const bTime =
                new Date(
                  b?.createdAt || 0
                ).getTime();

              return bTime - aTime;
            }
          );

          this.order =
            this.normalizeOrder(
              orders[0]
            );
        },

        error: (error) => {
          console.error(
            'Unable to load orders:',
            error
          );

          if (
            error?.status === 401
          ) {
            this.handleUnauthorized();
            return;
          }

          this.order = null;

          alert(
            'Unable to load your orders.'
          );
        }
      });
  }

  private findOrderInList(
    identifier: string,
    headers: HttpHeaders
  ): void {
    this.http
      .get<any>(
        `${this.API_URL}/orders`,
        { headers }
      )
      .subscribe({
        next: (response) => {
          const orders =
            this.extractOrders(response);

          const wanted =
            String(identifier)
              .trim()
              .toLowerCase();

          const found =
            orders.find(
              (item: any) => {
                const id =
                  String(
                    item?.id ?? ''
                  )
                    .trim()
                    .toLowerCase();

                const orderNumber =
                  String(
                    item?.orderNumber ?? ''
                  )
                    .trim()
                    .toLowerCase();

                return (
                  id === wanted ||
                  orderNumber === wanted
                );
              }
            );

          if (found) {
            this.order =
              this.normalizeOrder(
                found
              );

            /*
             * Replace the URL with the actual database ID once we
             * have found the order. This also prevents a future
             * refresh from repeating an order-number lookup.
             */
            if (
              found?.id !== undefined &&
              found?.id !== null
            ) {
              const actualId =
                String(found.id);

              if (
                actualId !==
                String(this.orderId)
              ) {
                this.orderId = actualId;

                this.router.navigate(
                  ['/track-order'],
                  {
                    queryParams: {
                      id: actualId
                    },
                    replaceUrl: true
                  }
                );
              }
            }

            return;
          }

          /*
           * Last fallback: checkout stores the completed order in
           * localStorage. This lets the Track Order page still show
           * the order if the backend's specific-order route uses a
           * different identifier format.
           */
          const localOrder =
            this.getStoredLastOrder();

          if (
            localOrder &&
            this.orderMatches(
              localOrder,
              wanted
            )
          ) {
            this.order =
              this.normalizeOrder(
                localOrder
              );

            return;
          }

          this.order = null;

          alert(
            'Order not found.'
          );
        },

        error: (error) => {
          console.error(
            'Unable to load orders:',
            error
          );

          if (
            error?.status === 401
          ) {
            this.handleUnauthorized();
            return;
          }

          /*
           * Backend list lookup failed, so try the locally stored
           * order created immediately after checkout.
           */
          const localOrder =
            this.getStoredLastOrder();

          if (
            localOrder &&
            this.orderMatches(
              localOrder,
              String(identifier)
                .trim()
                .toLowerCase()
            )
          ) {
            this.order =
              this.normalizeOrder(
                localOrder
              );

            return;
          }

          this.order = null;

          alert(
            'Unable to load this order.'
          );
        }
      });
  }

  private extractOrders(
    response: any
  ): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (
      Array.isArray(response?.orders)
    ) {
      return response.orders;
    }

    if (
      Array.isArray(response?.data)
    ) {
      return response.data;
    }

    if (
      Array.isArray(response?.data?.orders)
    ) {
      return response.data.orders;
    }

    return [];
  }

  private getStoredLastOrder(): any | null {
    const raw =
      localStorage.getItem(
        'botaniqueLastOrder'
      );

    if (!raw) {
      return null;
    }

    try {
      const parsed =
        JSON.parse(raw);

      /*
       * Support both:
       *   botaniqueLastOrder = order
       * and
       *   botaniqueLastOrder = { order: order }
       */
      return (
        parsed?.order ||
        parsed?.data ||
        parsed ||
        null
      );
    } catch (error) {
      console.error(
        'Unable to read stored last order:',
        error
      );

      return null;
    }
  }

  private orderMatches(
    order: any,
    identifier: string
  ): boolean {
    const wanted =
      String(identifier || '')
        .trim()
        .toLowerCase();

    if (!wanted) {
      return false;
    }

    const id =
      String(
        order?.id ?? ''
      )
        .trim()
        .toLowerCase();

    const orderNumber =
      String(
        order?.orderNumber ?? ''
      )
        .trim()
        .toLowerCase();

    return (
      id === wanted ||
      orderNumber === wanted
    );
  }

  private handleUnauthorized(): void {
    this.order = null;

    localStorage.removeItem(
      'botaniqueToken'
    );

    localStorage.removeItem(
      'token'
    );

    alert(
      'Your session has expired. Please log in again.'
    );

    this.router.navigateByUrl(
      '/login'
    );
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
      rawOrder?.paymentMethod === 'COD'
        ? 'Cash on Delivery'
        : rawOrder?.paymentMethod ||
          'Cash on Delivery';


    /* TOTAL */

    const total =
      Number(
        rawOrder?.total
      ) || 0;


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

  private normalizeStatus(
    status?: string
  ): string {

    const value =
      String(
        status || 'Processing'
      )
        .trim()
        .toLowerCase()
        .replace(/-/g, '_')
        .replace(/\s+/g, '_');


    switch (value) {

      /* PROCESSING */

      case 'pending':
      case 'processing':
      case 'confirmed':
      case 'preparing':
        return 'Processing';


      /* SHIPPED */

      case 'shipped':
      case 'in_transit':
      case 'intransit':
        return 'Shipped';


      /* OUT FOR DELIVERY */

      case 'out_for_delivery':
      case 'outfordelivery':
      case 'delivery':
        return 'Out for Delivery';


      /* DELIVERED */

      case 'delivered':
      case 'complete':
      case 'completed':
        return 'Delivered';


      /* CANCELLED */

      case 'cancelled':
      case 'canceled':
      case 'cancel':
        return 'Cancelled';


      /* DEFAULT */

      default:
        return 'Processing';

    }

  }


  /* FILTER ORDERS */
  
  filterOrders(): void {

    if (
      this.statusFilter === 'all'
    ) {

      this.loadOrder();

      return;

    }


    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');


    if (!token) {

      this.order = null;

      return;

    }


    const headers =
      new HttpHeaders({
        Authorization:
          `Bearer ${token}`
      });


    this.http
      .get<any[]>(
        `${this.API_URL}/orders`,
        { headers }
      )
      .subscribe({

        next: (orders) => {

          if (
            !Array.isArray(orders)
          ) {

            this.order = null;

            return;

          }


          const found =
            orders.find(
              (item: any) => {

                const normalized =
                  this.normalizeStatus(
                    item?.status
                  );


                if (
                  this.statusFilter ===
                  'Shipped'
                ) {

                  return (
                    normalized ===
                    'Shipped' ||
                    normalized ===
                    'Out for Delivery'
                  );

                }


                return (
                  normalized ===
                  this.statusFilter
                );

              }
            );


          if (!found) {

            this.order = null;

            return;

          }


          this.order =
            this.normalizeOrder(
              found
            );


          if (
            this.order?.id
          ) {

            this.router.navigate(
              ['/track-order'],
              {
                queryParams: {
                  id: this.order.id
                },
                replaceUrl: true
              }
            );

          }

        },

        error: (error) => {

          console.error(
            'Unable to filter orders:',
            error
          );

          this.order = null;

        }

      });

  }


  /* STATUS STEP */

  private getStatusStep(
    status?: string
  ): number {

    const normalized =
      this.normalizeStatus(
        status
      );


    switch (normalized) {

      case 'Processing':
        return 1;

      case 'Shipped':
        return 2;

      case 'Out for Delivery':
        return 3;

      case 'Delivered':
        return 4;

      case 'Cancelled':
        return 1;

      default:
        return 1;

    }

  }


  /* STEP NUMBER */

  private getStepNumber(
    step:
      | 'processing'
      | 'shipped'
      | 'out_for_delivery'
      | 'delivered'
  ): number {

    switch (step) {

      case 'processing':
        return 1;

      case 'shipped':
        return 2;

      case 'out_for_delivery':
        return 3;

      case 'delivered':
        return 4;

      default:
        return 1;

    }

  }


  /* CHECK COMPLETED STEP */

  isStepCompleted(
    step:
      | 'processing'
      | 'shipped'
      | 'out_for_delivery'
      | 'delivered'
  ): boolean {

    if (!this.order) {

      return false;

    }


    const currentStep =
      this.getStatusStep(
        this.order.status
      );


    const stepNumber =
      this.getStepNumber(
        step
      );

    return (
      currentStep >=
      stepNumber
    );

  }


  /* CHECK CURRENT STEP */

  isCurrentStep(
    step:
      | 'processing'
      | 'shipped'
      | 'out_for_delivery'
      | 'delivered'
  ): boolean {

    if (!this.order) {

      return false;

    }


    const currentStep =
      this.getStatusStep(
        this.order.status
      );


    return (
      currentStep ===
      this.getStepNumber(step)
    );

  }


  /* CHECK REACHED STEP */

  isStepReached(
    step:
      | 'processing'
      | 'shipped'
      | 'out_for_delivery'
      | 'delivered'
  ): boolean {

    if (!this.order) {

      return false;

    }


    const currentStep =
      this.getStatusStep(
        this.order.status
      );


    return (
      currentStep >=
      this.getStepNumber(step)
    );

  }


  /* STATUS MESSAGE */

  getStatusMessage(
    status: string
  ): string {

    const normalized =
      this.normalizeStatus(
        status
      );


    switch (normalized) {

      case 'Processing':

        return 'Your order is being prepared.';


      case 'Shipped':

        return 'Your order is on its way.';


      case 'Out for Delivery':

        return 'Your Botanique order is arriving today.';


      case 'Delivered':

        return 'Your order has been delivered.';


      case 'Cancelled':

        return 'This order has been cancelled.';


      default:

        return 'We are preparing your order.';

    }

  }


  /* STATUS CSS CLASS */

  getOrderStatusClass(
    status?: string
  ): string {

    const normalized =
      this.normalizeStatus(
        status
      );


    switch (normalized) {

      case 'Delivered':

        return 'status-delivered';


      case 'Shipped':

        return 'status-shipped';


      case 'Out for Delivery':

        return 'status-shipped';


      case 'Cancelled':

        return 'status-cancelled';


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
      const response = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: this.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Invalid email or password.');
      }

      localStorage.setItem('botaniqueToken', data.token);
      localStorage.setItem('botaniqueUser', JSON.stringify({
        id: data.user.id,
        name: data.user.fullName,
        fullName: data.user.fullName,
        email: data.user.email,
        phone: data.user.phone || '',
        role: data.user.role
      }));

      this.closeLoginDropdown();
      this.email = '';
      this.password = '';
      this.loadOrder();

      alert(`Welcome back, ${data.user.fullName || 'Botanique customer'}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(error?.message || 'Unable to log in. Please try again.');
    }
  }


  /* FORGOT PASSWORD */

  forgotPassword(
    event?: Event
  ): void {

    event?.preventDefault();


    const enteredEmail =
      prompt(
        'Enter the email address associated with your Botanique account:',
        this.email
      );


    if (!enteredEmail) {

      return;

    }


    const usersRaw =
      localStorage.getItem(
        this.USERS_KEY
      );


    if (!usersRaw) {

      alert(
        'No account was found.'
      );

      return;

    }


    try {

      const users =
        JSON.parse(usersRaw);


      const email =
        enteredEmail
          .trim()
          .toLowerCase();


      const foundUser =
        Array.isArray(users)
          ? users.find(
              (user: any) =>
                String(
                  user?.email || ''
                )
                  .trim()
                  .toLowerCase() ===
                email
            )
          : null;


      if (!foundUser) {

        alert(
          'No account is registered with that email address.'
        );

        return;

      }


      alert(
        'Password recovery is not connected to email yet.'
      );

    } catch {

      alert(
        'Unable to process the request right now.'
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