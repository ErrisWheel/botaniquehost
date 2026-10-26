import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';
import { ProductCatalogService } from '../shared/product-catalog.service';
import { ApiError, ApiService } from '../shared/api.service';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  Product,
  CartItem,
  CATALOG
} from '../shared/product-data';


@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class ProductDetailPage implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly productCatalog = inject(ProductCatalogService);
  private catalogProducts: Product[] = CATALOG.map(product => ({ ...product }));

  /* PRODUCT */

  product: Product | undefined;

  productId = '';
  reviews: any[] = [];
  reviewOrders: any[] = [];
  reviewsLoading = false;
  reviewsLoadError = '';
  reviewOrdersLoading = false;
  reviewOrdersError = '';
  hasAlreadyReviewed = false;
  reviewSubmitting = false;
  reviewRating = 0;
  reviewComment = '';
  reviewOrderId = '';
  reviewFeedback = '';
  reviewFeedbackError = false;
  private reviewsLoadSeq = 0;
  private reviewOrdersLoadSeq = 0;
  private skipInitialReviewsRefresh = true;
  readonly reviewStars = [1, 2, 3, 4, 5];

  get averageRating(): number | null {
    if (!this.reviews.length) return null;
    return this.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / this.reviews.length;
  }


  /* NAVBAR */

  menuOpen = false;

  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }


  /* NAVBAR COUNTS */

  cartCount = 0;

  wishlistCount = 0;

  notificationCount = 0;


  /* LOGIN */

  email = '';

  password = '';

  rememberMe = false;


  /* CART DRAWER */

  cartDrawerOpen = false;

  cartItems: CartItem[] = [];


  /* STORAGE */

  private readonly CART_STORAGE_KEY =
    'botaniqueCartItems';

  private readonly WISHLIST_STORAGE_KEY =
    'botaniqueWishlistItems';

  private readonly NOTIFICATION_STORAGE_KEY =
    'botaniqueNotifications';


  /* CONSTRUCTOR */

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}


  /* INIT */

  ionViewWillEnter(): void {
    if (this.skipInitialReviewsRefresh) {
      this.skipInitialReviewsRefresh = false;
      return;
    }
    if (this.productId) {
      void this.loadReviews();
      void this.loadReviewOrders();
    }
  }

  ngOnInit(): void {

    this.route.queryParams.subscribe(params => {

      this.productId =
        params['id'] ?? '';

      this.product =
        CATALOG.find(
          item => item.id === this.productId
        );
      void this.loadProductFromDatabase(this.productId);

      void this.loadReviews();
      void this.loadReviewOrders();

    });

    this.loadCart();

    this.refreshNavbarCounts();

  }

  private async loadProductFromDatabase(identifier: string): Promise<void> {
    if (!identifier) {
      this.product = undefined;
      this.cdr.markForCheck();
      return;
    }

    try {
      const products = await this.productCatalog.list(true);
      this.catalogProducts = products;
      this.product = this.findCatalogProduct(identifier);
      this.syncCartProductData(products);
    } catch (error) {
      console.error('Unable to load product data from database:', error);
    } finally {
      this.cdr.markForCheck();
    }
  }

  private findCatalogProduct(identifier: string): Product | undefined {
    const key = String(identifier || '').trim().toLowerCase();
    return this.catalogProducts.find(product =>
      [product.id, product.slug, product.databaseId].some(
        value => String(value || '').trim().toLowerCase() === key
      )
    );
  }

  private syncCartProductData(products: Product[]): void {
    const lookup = new Map<string, Product>();
    for (const product of products) {
      for (const key of [product.id, product.slug, product.databaseId]) {
        if (key) lookup.set(String(key), product);
      }
    }
    this.cartItems = this.cartItems.map(item => {
      const product = lookup.get(String(item.id));
      if (!product) return { ...item, quantity: 1, stock: 0, status: 'INACTIVE' };
      const stock = Math.max(0, Number(product.stock) || 0);
      const quantity = product.status === 'ACTIVE' && stock > 0
        ? Math.min(Math.max(1, Number(item.quantity) || 1), stock)
        : 1;
      return {
        ...item,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity,
        stock,
        status: product.status
      };
    });
    this.saveCart();
  }

  private async loadReviews(): Promise<void> {
    const sequence = ++this.reviewsLoadSeq;
    const slug = this.productId;
    if (!slug) {
      this.reviews = [];
      this.reviewsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.reviews = [];
    this.reviewsLoading = true;
    this.reviewsLoadError = '';
    this.cdr.markForCheck();
    try {
      const response = await fetch(
        `${environment.apiUrl}/reviews/product/${encodeURIComponent(slug)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) }
      );
      const body = await response.json().catch(() => []);
      if (sequence !== this.reviewsLoadSeq) return;
      if (!response.ok) throw new Error(body?.message || 'Unable to load reviews.');
      this.reviews = Array.isArray(body) ? body : [];
    } catch {
      if (sequence === this.reviewsLoadSeq) {
        this.reviews = [];
        this.reviewsLoadError = 'Reviews are temporarily unavailable. Please try again later.';
      }
    } finally {
      if (sequence === this.reviewsLoadSeq) {
        this.reviewsLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  retryLoadReviews(): void {
    void this.loadReviews();
  }

  private async loadReviewOrders(): Promise<void> {
    const sequence = ++this.reviewOrdersLoadSeq;
    if (!this.authService.isLoggedIn) {
      this.reviewOrders = [];
      this.reviewOrderId = '';
      this.reviewOrdersLoading = false;
      this.hasAlreadyReviewed = false;
      this.reviewOrdersError = '';
      this.cdr.markForCheck();
      return;
    }

    this.reviewOrders = [];
    this.reviewOrderId = '';
    this.hasAlreadyReviewed = false;
    this.reviewOrdersLoading = true;
    this.reviewOrdersError = '';
    this.cdr.markForCheck();
    try {
      if (!this.productId) throw new Error('The requested product could not be identified.');
      const eligibility = await this.api.request<{
        eligibleOrders?: any[];
        hasReviewed?: boolean;
      }>(`/reviews/product/${encodeURIComponent(this.productId)}/eligibility`, {
        signal: AbortSignal.timeout(15000)
      });
      if (sequence !== this.reviewOrdersLoadSeq) return;
      this.reviewOrders = Array.isArray(eligibility?.eligibleOrders)
        ? eligibility.eligibleOrders
        : [];
      this.hasAlreadyReviewed = eligibility?.hasReviewed === true;
      if (!this.reviewOrders.some((order: any) => order.id === this.reviewOrderId)) {
        this.reviewOrderId = String(this.reviewOrders[0]?.id || '');
      }
    } catch (error: any) {
      if (sequence === this.reviewOrdersLoadSeq) {
        this.reviewOrders = [];
        this.reviewOrdersError = error instanceof ApiError && error.status === 404
          ? 'This product could not be found. Please return to the product list and try again.'
          : error instanceof Error && error.message
            ? error.message
            : 'We could not check your delivered orders. Please try again.';
      }
    } finally {
      if (sequence === this.reviewOrdersLoadSeq) {
        this.reviewOrdersLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  retryReviewEligibility(): void {
    void this.loadReviewOrders();
  }

  reviewStarsFor(rating: number): string {
    const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  async submitReview(): Promise<void> {
    if (!this.authService.isLoggedIn) {
      this.reviewFeedback = 'Please log in to submit a review.';
      this.reviewFeedbackError = true;
      this.cdr.markForCheck();
      return;
    }
    if (this.reviewRating < 1 || !this.reviewOrderId || !this.reviewComment.trim()) {
      this.reviewFeedback = 'Choose a star rating, select a delivered order, and enter your written feedback.';
      this.reviewFeedbackError = true;
      this.cdr.markForCheck();
      return;
    }

    this.reviewSubmitting = true;
    this.reviewFeedback = '';
    try {
      const token = await this.authService.getToken();
      if (!token) throw new Error('Please log in again to submit your review.');
      const response = await fetch(
        `${environment.apiUrl}/reviews/product/${encodeURIComponent(this.productId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            rating: this.reviewRating,
            comment: this.reviewComment.trim(),
            orderId: this.reviewOrderId
          })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || 'Unable to submit your review.');

      this.reviewComment = '';
      this.reviewRating = 0;
      this.reviewFeedback = body?.isApproved === false
        ? 'Your review was saved and is awaiting moderation.'
        : 'Thank you. Your review has been submitted.';
      this.reviewFeedbackError = false;
      this.hasAlreadyReviewed = true;
      this.reviewOrders = [];
      await this.loadReviews();
    } catch (error: any) {
      this.reviewFeedback = error?.message || 'Unable to submit your review. Please try again.';
      this.reviewFeedbackError = true;
    } finally {
      this.reviewSubmitting = false;
      this.cdr.markForCheck();
    }
  }


  /* PRICE FORMAT */

  formatPrice(price: number): string {

    return `₱${Number(price).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;

  }


  /* CART PRICE FORMAT */

  formatCartPrice(price: number): string {

    return `₱${Number(price).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;

  }


  /* NAVIGATION */

  goHome(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();
    this.closeCart();

    this.router.navigate([
      '/home'
    ]);

  }


  goToAbout(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();
    this.closeCart();

    this.router.navigate([
      '/about'
    ]);

  }


  goToProduct(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();
    this.closeCart();

    this.router.navigate([
      '/product'
    ]);

  }


  goToDevelopers(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();
    this.closeCart();

    this.router.navigate([
      '/developers'
    ]);

  }


  goToContact(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();
    this.closeCart();

    this.router.navigate([
      '/contact'
    ]);

  }


  goToSignup(event?: Event): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/signup'
    ]);

  }


  /* CART ICON
     OPENS CART DRAWER */

  goToCart(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.openCart();

  }


  /* WISHLIST NAVIGATION */

  goToWishlist(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/wishlist'
    ]);

  }


  /* NOTIFICATIONS NAVIGATION */

  goToNotifications(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/notifications'
    ]);

  }


  /* MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;

    if (this.menuOpen) {

      this.loginDropdownOpen =
        false;

      this.cartDrawerOpen =
        false;

    }

  }


  toggleLoginDropdown(event?: Event): void {

    event?.stopPropagation();

    if (this.isLoggedIn) {
      this.loginDropdownOpen = false;
      this.router.navigate(['/profile']);
      return;
    }

    this.loginDropdownOpen = !this.loginDropdownOpen;
  }


  closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen = false;

  }


  /* LOGIN */

  async login(): Promise<void> {

    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password.trim()) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const user = await this.authService.login(loginEmail, this.password, true);

      this.email = '';
      this.password = '';
      this.loginDropdownOpen = false;

      alert(`Welcome back, ${user.fullName || user.email}!`);
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

    this.router.navigate([
      '/home'
    ]);

  }


  /* OPEN CART DRAWER */

  openCart(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.loadCart();

    this.closeMenus();

    this.cartDrawerOpen = true;

  }


  /* CLOSE CART DRAWER */

  closeCart(): void {

    this.cartDrawerOpen = false;

  }


  /* CONTINUE SHOPPING */

  continueShopping(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeCart();

    this.router.navigate([
      '/product'
    ]);

  }


  /* GET CART QUANTITY */

  getCartQuantity(
    productId: string
  ): number {

    const item =
      this.cartItems.find(
        cartItem =>
          cartItem.id === productId
      );

    if (!item) {

      return 0;

    }

    return Math.max(
      0,
      Number(item.quantity) || 0
    );

  }


  /* ADD TO CART */

  addToCart(
    product?: Product,
    event?: Event
  ): void {
    event?.preventDefault();
    event?.stopPropagation();

    product = product || this.product;
    if (!product) return;

    const currentProduct = this.findCatalogProduct(product.id);
    const stock = Number(currentProduct?.stock);
    if (!currentProduct || !Number.isFinite(stock) || stock < 1 || currentProduct.status?.toUpperCase() !== 'ACTIVE') {
      window.alert('This product is unavailable or its stock could not be verified.');
      return;
    }

    const existingItem = this.cartItems.find(item => String(item.id) === String(currentProduct.id));
    const currentQuantity = Number(existingItem?.quantity || 0);
    if (currentQuantity >= stock) {
      window.alert(`Only ${stock} unit(s) of ${currentProduct.name} are available.`);
      return;
    }

    if (existingItem) {
      existingItem.quantity = currentQuantity + 1;
      existingItem.stock = stock;
      existingItem.status = currentProduct.status;
      existingItem.name = currentProduct.name;
      existingItem.price = currentProduct.price;
      existingItem.image = currentProduct.image;
    } else {
      this.cartItems.push({
        id: currentProduct.id,
        quantity: 1,
        name: currentProduct.name,
        price: currentProduct.price,
        image: currentProduct.image,
        stock,
        status: currentProduct.status
      });
    }

    this.cartItems = [...this.cartItems];
    this.saveCart();
    this.refreshNavbarCounts();
  }


  /* INCREASE CART DRAWER QUANTITY */

  increaseQuantity(item: CartItem): void {
    this.increaseProductQuantity(String(item.id));
  }


  /* DECREASE CART DRAWER QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    const cartItem =
      this.cartItems.find(
        currentItem =>
          currentItem.id === item.id
      );


    if (!cartItem) {

      return;

    }


    const quantity =
      Number(cartItem.quantity) || 0;


    if (quantity <= 1) {

      this.removeFromCart(item);

      return;

    }


    cartItem.quantity =
      quantity - 1;


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

  }


  /* INCREASE PRODUCT QUANTITY
     FOR PRODUCT DETAIL PAGE */

  increaseProductQuantity(
    productId: string,
    event?: Event
  ): void {
    event?.preventDefault();
    event?.stopPropagation();

    const product = this.findCatalogProduct(productId);
    const stock = Number(product?.stock);
    if (!product || !Number.isFinite(stock) || stock < 1 || product.status?.toUpperCase() !== 'ACTIVE') {
      window.alert('This product is unavailable or its stock could not be verified.');
      return;
    }

    const item = this.cartItems.find(cartItem => String(cartItem.id) === String(productId));
    if (!item) {
      this.addToCart(product);
      return;
    }
    if (Number(item.quantity || 0) >= stock) {
      window.alert(`Only ${stock} unit(s) of ${product.name} are available.`);
      return;
    }

    item.quantity = Number(item.quantity || 0) + 1;
    item.stock = stock;
    item.status = product.status;
    this.cartItems = [...this.cartItems];
    this.saveCart();
    this.refreshNavbarCounts();
  }


  /* DECREASE PRODUCT QUANTITY
     FOR PRODUCT DETAIL PAGE */

  decreaseProductQuantity(
    productId: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    const item =
      this.cartItems.find(
        cartItem =>
          cartItem.id === productId
      );


    if (!item) {

      return;

    }


    const quantity =
      Number(item.quantity) || 0;


    if (quantity <= 1) {

      this.removeFromCart(item);

      return;

    }


    item.quantity =
      quantity - 1;


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

  }


  /* REMOVE FROM CART */

  removeFromCart(
    itemOrId: CartItem | string
  ): void {

    const productId =
      typeof itemOrId === 'string'
        ? itemOrId
        : itemOrId.id;


    this.cartItems =
      this.cartItems.filter(
        item =>
          item.id !== productId
      );


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

  }


  /* CHANGE CART QUANTITY */

  changeCartQty(
    productId: string,
    change: number
  ): void {

    const item =
      this.cartItems.find(
        cartItem =>
          cartItem.id === productId
      );


    if (!item) {

      return;

    }


    const quantity =
      (Number(item.quantity) || 0) +
      change;


    if (quantity <= 0) {

      this.removeFromCart(
        productId
      );

      return;

    }


    item.quantity =
      quantity;


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

  }


  /* CART SUBTOTAL */

  get cartSubtotal(): number {

    return this.cartItems.reduce(
      (total, item) => {

        const product = this.findCatalogProduct(String(item.id));


        if (!product) {

          return total;

        }


        return (
          total +
          product.price *
          (Number(item.quantity) || 0)
        );

      },
      0
    );

  }


  /* SAVE CART */

  saveCart(): void {

    try {

      this.cartItems =
        this.cartItems
          .filter(
            item =>
              item &&
              typeof item.id === 'string' &&
              Number(item.quantity) > 0
          )
          .map(
            item => ({

              ...item,

              quantity:
                Number(item.quantity) || 1

            })
          );


      localStorage.setItem(
        this.CART_STORAGE_KEY,
        JSON.stringify(
          this.cartItems
        )
      );

    } catch (error) {

      console.error(
        'Unable to save cart:',
        error
      );

    }


    this.updateCartCount();

  }


  /* LOAD CART */

  loadCart(): void {

    try {

      const storedCart =
        localStorage.getItem(
          this.CART_STORAGE_KEY
        );


      if (!storedCart) {

        this.cartItems = [];

        this.updateCartCount();

        return;

      }


      const parsed =
        JSON.parse(
          storedCart
        );


      if (Array.isArray(parsed)) {

        this.cartItems =
          parsed
            .filter(
              (item: any) =>
                item &&
                typeof item.id === 'string' &&
                Number(item.quantity) > 0
            )
            .map(
              (item: any): CartItem => ({

                id:
                  item.id,

                quantity:
                  Number(item.quantity) || 1,

                name:
                  item.name,

                price:
                  Number(item.price) ||
                  undefined,

                image:
                  item.image,

                stock: item.stock ?? this.findCatalogProduct(String(item.id))?.stock,

                status: item.status ?? this.findCatalogProduct(String(item.id))?.status

              })
            );

      } else {

        this.cartItems = [];

      }

    } catch (error) {

      console.error(
        'Unable to load cart:',
        error
      );

      this.cartItems = [];

    }


    this.cartItems = [
      ...this.cartItems
    ];


    this.updateCartCount();

  }


  /* CART COUNT */

  updateCartCount(): void {

    this.cartCount =
      this.cartItems.reduce(
        (total, item) =>
          total +
          (Number(item.quantity) || 0),
        0
      );

  }


  /* CHECKOUT FROM CART DRAWER */

  checkout(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();


    if (
      this.cartItems.length === 0
    ) {

      alert(
        'Your shopping bag is empty.'
      );

      return;

    }


    this.closeCart();

    this.closeMenus();


    this.router.navigate([
      '/checkout'
    ]);

  }


  /* OLD CHECKOUT METHOD
     KEPT FOR COMPATIBILITY */

  goToCheckout(
    event?: Event
  ): void {

    this.checkout(event);

  }


  /* WISHLIST */

  isInWishlist(
    productId: string
  ): boolean {

    try {

      const stored =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      if (!stored) {

        return false;

      }


      const wishlist =
        JSON.parse(
          stored
        );


      return (
        Array.isArray(wishlist) &&
        wishlist.some(
          (item: any) =>
            item?.id === productId
        )
      );

    } catch {

      return false;

    }

  }


  /* TOGGLE WISHLIST */

  toggleWishlist(
    productId: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    if (!productId) {

      return;

    }


    try {

      const stored =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      let wishlist: any[] = [];


      if (stored) {

        const parsed =
          JSON.parse(
            stored
          );


        if (Array.isArray(parsed)) {

          wishlist = parsed;

        }

      }


      const index =
        wishlist.findIndex(
          item =>
            item?.id === productId
        );


      if (index !== -1) {

        wishlist.splice(
          index,
          1
        );

      } else {

        const product = this.findCatalogProduct(productId);


        if (!product) {

          return;

        }


        wishlist.push({

          id:
            product.id,

          name:
            product.name,

          price:
            product.price,

          image:
            product.image

        });

      }


      localStorage.setItem(
        this.WISHLIST_STORAGE_KEY,
        JSON.stringify(
          wishlist
        )
      );


      this.updateWishlistCount();

    } catch (error) {

      console.error(
        'Unable to update wishlist:',
        error
      );

    }

  }


  /* WISHLIST COUNT */

  updateWishlistCount(): void {

    try {

      const stored =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      if (!stored) {

        this.wishlistCount = 0;

        return;

      }


      const wishlist =
        JSON.parse(
          stored
        );


      this.wishlistCount =
        Array.isArray(wishlist)
          ? wishlist.length
          : 0;

    } catch {

      this.wishlistCount = 0;

    }

  }


  /* NOTIFICATION COUNT */

  updateNotificationCount(): void {

    try {

      const stored =
        localStorage.getItem(
          this.NOTIFICATION_STORAGE_KEY
        );


      if (!stored) {

        this.notificationCount = 0;

        return;

      }


      const notifications =
        JSON.parse(
          stored
        );


      if (
        Array.isArray(
          notifications
        )
      ) {

        this.notificationCount =
          notifications.filter(
            (notification: any) =>
              notification?.read !== true
          ).length;

      } else if (
        typeof notifications === 'number'
      ) {

        this.notificationCount =
          notifications;

      } else {

        this.notificationCount = 0;

      }

    } catch {

      this.notificationCount = 0;

    }

  }


  /* REFRESH NAVBAR COUNTS */

  refreshNavbarCounts(): void {

    this.updateCartCount();

    this.updateWishlistCount();

    this.updateNotificationCount();

  }

}
