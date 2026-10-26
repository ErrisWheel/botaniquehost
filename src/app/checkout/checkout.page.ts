import { environment } from '../../environments/environment';
import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';
import { OrdersService } from '../shared/orders.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

interface CartItem {
  id: string;
  quantity: number;
  name?: string;
  price?: number;
  image?: string;
}

interface CheckoutData {
  fullName: string;
  phone: string;
  email: string;

  // ADDRESS
  streetAddress: string;
  city: string;
  province: string;
  zip: string;
  region: string;

  // COMPLETE ADDRESS
  address: string;

  deliveryDate: string;
  deliveryTime: string;
  instructions: string;
  payment: 'cash' | 'maya';
  terms: boolean;
}

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.page.html',
  styleUrls: ['./checkout.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class CheckoutPage implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly route = inject(ActivatedRoute);

  // True while an order is being submitted: blocks double clicks, which would
  // otherwise run two cart syncs and two order requests at the same time.
  placingOrder = false;
  checkoutNotice = '';

  
  // NAVBAR
  

  menuOpen = false;
  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  cartCount = 0;
  wishlistCount = 0;
  notificationCount = 0;

  email = '';
  password = '';
  rememberMe = false;


  
  // CART
  

  cartItems: CartItem[] = [];

  private readonly CART_STORAGE_KEY =
    'botaniqueCartItems';

  private readonly USER_STORAGE_KEY =
    'botaniqueUser';

  private readonly WISHLIST_STORAGE_KEY =
    'botaniqueWishlistItems';

  private readonly NOTIFICATION_STORAGE_KEY =
    'botaniqueNotifications';


  
  // CHECKOUT
  today = '';

  
// PHILIPPINE REGIONS

philippineRegions: string[] = [
  'National Capital Region (NCR)',
  'Cordillera Administrative Region (CAR)',
  'Region I - Ilocos Region',
  'Region II - Cagayan Valley',
  'Region III - Central Luzon',
  'Region IV-A - CALABARZON',
  'MIMAROPA Region',
  'Region V - Bicol Region',
  'Region VI - Western Visayas',
  'Negros Island Region (NIR)',
  'Region VII - Central Visayas',
  'Region VIII - Eastern Visayas',
  'Region IX - Zamboanga Peninsula',
  'Region X - Northern Mindanao',
  'Region XI - Davao Region',
  'Region XII - SOCCSKSARGEN',
  'Region XIII - Caraga',
  'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)'
];

  checkout: CheckoutData = {

    fullName: '',
    phone: '',
    email: '',

    // ADDRESS
    streetAddress: '',
    city: '',
    province: '',
    zip: '',
    region: '',

    // COMPLETE ADDRESS
    address: '',

    deliveryDate: '',
    deliveryTime: '',
    instructions: '',
    payment: 'cash',
    terms: false
  };


  
  // PAYMENT
  

  selectPayment(
    payment: 'cash' | 'maya'
  ): void {

    this.checkout.payment = payment;
  }


  
  // POLICY MODALS
  

  termsModalOpen = false;
  privacyModalOpen = false;


  
  // CONSTRUCTOR
  

  constructor(
    private router: Router,
    private alertController: AlertController
  ) {}


  
  // INIT
  

  ngOnInit(): void {

    this.setToday();
    this.loadCart();
    this.loadUser();
    this.refreshNavbarCounts();

  }

  ionViewWillEnter(): void {
    // Ionic keeps pages alive in its navigation stack; reload the restored
    // browser cart when returning from Maya rather than relying on ngOnInit.
    this.loadCart();
    this.refreshNavbarCounts();

    if (this.route.snapshot.queryParamMap.get('mayaCancelled') === '1') {
      this.checkoutNotice = 'Your previous Maya payment was cancelled or expired. Your cart has been restored. Choose another payment method or try Maya again.';
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { mayaCancelled: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  ionViewDidLeave(): void {
    this.checkoutNotice = '';
  }


  
  // TODAY'S DATE
  

  private setToday(): void {

    const now = new Date();

    const year =
      now.getFullYear();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, '0');

    const day =
      String(
        now.getDate()
      ).padStart(2, '0');

    this.today =
      `${year}-${month}-${day}`;

    if (!this.checkout.deliveryDate) {

      this.checkout.deliveryDate =
        this.today;
    }
  }


  
  // LOAD CART
  

  private loadCart(): void {

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


      const parsedCart =
        JSON.parse(storedCart);


      if (Array.isArray(parsedCart)) {

        this.cartItems =
          parsedCart

            .filter(
              item =>
                item &&
                item.id
            )

            .map(item => ({

              id:
                String(item.id),

              quantity:
                Math.max(
                  1,
                  Number(item.quantity) || 1
                ),

              name:
                item.name || '',

              price:
                Number(item.price) || 0,

              image:
                item.image || ''
            }));

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

    this.updateCartCount();
  }


  
  // SYNC THE LOCAL CART TO THE REAL BACKEND CART
  private async syncCartWithBackend(token: string): Promise<void> {
    if (!this.cartItems.length) {
      throw new Error('Your cart is empty.');
    }

    // The backend is the source of truth for checkout.
    // Replace its current cart with the items shown in this checkout page
    // so guest/local cart items are not lost after login.
    const clearResponse = await fetch(`${environment.apiUrl}/cart`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!clearResponse.ok && clearResponse.status !== 404) {
      const error = await clearResponse.json().catch(() => ({}));
      throw new Error(error?.message || 'Unable to prepare your cart.');
    }

    for (const item of this.cartItems) {
      const response = await fetch(`${environment.apiUrl}/cart/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: String(item.id),
          quantity: Math.max(1, Number(item.quantity) || 1)
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error?.message ||
          `Unable to add ${item.name || 'an item'} to your checkout cart.`
        );
      }
    }
  }


  // SAVE CART
  

  private saveCart(): void {

    try {

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
  }


  
  // LOAD USER
  

  private loadUser(): void {

    try {

      const storedUser =
        localStorage.getItem(
          this.USER_STORAGE_KEY
        );

      if (!storedUser) {
        return;
      }


      const user =
        JSON.parse(storedUser);


      if (!user) {
        return;
      }


      if (user.fullName) {

        this.checkout.fullName =
          user.fullName;
      }


      if (user.email) {

        this.checkout.email =
          user.email;
      }


      if (user.phone) {

        this.checkout.phone =
          user.phone;
      }

    } catch (error) {

      console.error(
        'Unable to load user:',
        error
      );
    }
  }


  
  // NAVBAR COUNTS
  

  private refreshNavbarCounts(): void {

    this.updateCartCount();


    
    // WISHLIST
    
    try {

      const wishlist =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      if (wishlist) {

        const parsedWishlist =
          JSON.parse(wishlist);


        this.wishlistCount =
          Array.isArray(
            parsedWishlist
          )
            ? parsedWishlist.length
            : 0;

      } else {

        this.wishlistCount = 0;
      }

    } catch {

      this.wishlistCount = 0;
    }

    // NOTIFICATIONS

    try {

      const notifications =
        localStorage.getItem(
          this.NOTIFICATION_STORAGE_KEY
        );


      if (notifications) {

        const parsedNotifications =
          JSON.parse(
            notifications
          );


        if (
          Array.isArray(
            parsedNotifications
          )
        ) {

          this.notificationCount =
            parsedNotifications.filter(
              notification =>
                notification?.read !== true
            ).length;

        } else if (
          typeof parsedNotifications ===
          'number'
        ) {

          this.notificationCount =
            parsedNotifications;

        } else {

          this.notificationCount = 0;
        }

      } else {

        this.notificationCount = 0;
      }

    } catch {

      this.notificationCount = 0;
    }
  }


  
  // CART COUNT
  
  private updateCartCount(): void {

    this.cartCount =
      this.cartItems.reduce(
        (total, item) =>
          total +
          (Number(item.quantity) || 0),
        0
      );
  }


  
  // SUBTOTAL
  

  get subtotal(): number {

    return this.cartItems.reduce(
      (total, item) =>
        total +
        this.getCartItemLineTotal(item),
      0
    );
  }


  
  // DISCOUNT
  

  get discount(): number {

    /*
     * 20% discount ONLY when
     * subtotal is ABOVE ₱15,000.
     *
     * ₱15,000 exactly does NOT qualify.
     */

    return this.subtotal > 15000
      ? this.subtotal * 0.20
      : 0;
  }


  
  // SHIPPING
  

  get shipping(): number {

    /*
     * FREE shipping ONLY when
     * subtotal is ABOVE ₱15,000.
     *
     * Otherwise shipping is ₱150.
     */

    return this.subtotal > 15000
      ? 0
      : 150;
  }


  
  // TAX
  

  get tax(): number {

    /*
     * 12% tax is calculated AFTER:
     *
     * Subtotal
     * - Discount
     * + Shipping
     */

    const taxableAmount =
      this.subtotal -
      this.discount +
      this.shipping;

    return taxableAmount * 0.12;
  }


  
  // TOTAL
  
  get total(): number {

    return (
      this.subtotal -
      this.discount +
      this.shipping +
      this.tax
    );
  }


  
  // CART ITEM LINE TOTAL
  

  getCartItemLineTotal(
    item: CartItem
  ): number {

    const price =
      Number(item.price) || 0;

    const quantity =
      Number(item.quantity) || 0;

    return price * quantity;
  }


  
  // FORMAT PRICE
  

  formatPrice(
    price: number
  ): string {

    return `₱${Number(
      price || 0
    ).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;
  }


  
  // TRACK CART ITEMS
  

  trackByCartId(
    index: number,
    item: CartItem
  ): string {

    return item.id;
  }


  
  // BUILD COMPLETE ADDRESS
  

  private buildCompleteAddress(): string {

    return [
      this.checkout.streetAddress.trim(),
      this.checkout.city.trim(),
      this.checkout.province.trim(),
      this.checkout.zip.trim(),
      this.checkout.region.trim()
    ]
      .filter(Boolean)
      .join(', ');
  }


  
  // MOBILE MENU
  

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;

    if (this.menuOpen) {

      this.loginDropdownOpen =
        false;
    }
  }


  
  // CLOSE MENUS
  

  closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen =
      false;
  }


  
  // LOGIN DROPDOWN
  

  toggleLoginDropdown(event?: Event): void {

    event?.stopPropagation();

    if (this.isLoggedIn) {
      this.loginDropdownOpen = false;
      this.router.navigate(['/profile']);
      return;
    }

    this.loginDropdownOpen = !this.loginDropdownOpen;
  }


  
  // LOGIN
  

  async login(): Promise<void> {
    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password.trim()) {
      const alert = await this.alertController.create({
        header: 'Login Required',
        message: 'Please enter your email and password.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    try {
      const user = await this.authService.login(loginEmail, this.password, true);

      this.checkout.fullName = user.fullName || '';
      this.checkout.email = user.email || '';
      this.checkout.phone = user.phone || '';
      this.loginDropdownOpen = false;
      this.email = '';
      this.password = '';

      const alert = await this.alertController.create({
        header: 'Welcome Back',
        message: 'You have successfully logged in.',
        buttons: ['OK']
      });
      await alert.present();
    } catch (error: any) {
      console.error('Login error:', error);
      const alert = await this.alertController.create({
        header: 'Login Failed',
        message: error?.message || 'Unable to log in. Please try again.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }


  
  // FORGOT PASSWORD
  

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


  
  // CONTINUE AS GUEST
  

  continueAsGuest(): void {

    this.loginDropdownOpen =
      false;
  }


  
  // SIGN UP
  

  goToSignup(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/signup'
    ]);
  }


  
  // HOME
  

  goHome(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/home'
    ]);
  }


  
  // ABOUT
  

  goToAbout(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/about'
    ]);
  }


  
  // PRODUCT
  

  goToProduct(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/product'
    ]);
  }


  
  // DEVELOPERS
  

  goToDevelopers(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/developers'
    ]);
  }


  
  // CONTACT
  

  goToContact(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/contact'
    ]);
  }


  
  // WISHLIST
  

  goToWishlist(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/wishlist'
    ]);
  }


  
  // NOTIFICATIONS
  

  goToNotifications(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/notifications'
    ]);
  }


  
  // CART
  

  goToCart(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();

    this.router.navigate([
      '/cart'
    ]);
  }


  
  // PRODUCT CATEGORY
  

  goToProductCategory(
    category:
      | 'indoor'
      | 'outdoor'
      | 'accessories',
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeMenus();


    this.router.navigate(
      ['/product'],
      {
        queryParams: {
          category
        }
      }
    );
  }


  
  // TERMS & CONDITIONS MODAL
  

  openTermsModal(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    this.privacyModalOpen =
      false;

    this.termsModalOpen =
      true;
  }


  
  // CLOSE TERMS MODAL
  

  closeTermsModal(): void {

    this.termsModalOpen =
      false;
  }


  
  // AGREE TO TERMS
  

  agreeToTerms(): void {

    this.checkout.terms =
      true;

    this.termsModalOpen =
      false;
  }


  
  // PRIVACY POLICY MODAL
  

  openPrivacyModal(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    this.termsModalOpen =
      false;

    this.privacyModalOpen =
      true;
  }


  
  // CLOSE PRIVACY MODAL
  

  closePrivacyModal(): void {

    this.privacyModalOpen =
      false;
  }


  
  // PLACE ORDER
  

  private async startMayaPayment(
    orderId: string,
    token: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${environment.apiUrl}/payments/maya/checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ orderId })
        }
      );

      const body = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        typeof body?.redirectUrl !== 'string' ||
        !body.redirectUrl.startsWith('https://')
      ) {
        throw new Error(
          body?.message || 'Unable to start the Maya payment.'
        );
      }

      window.location.href = body.redirectUrl;
    } catch (error: any) {
      const alert = await this.alertController.create({
        header: 'Payment not started',
        message:
          `${error?.message || 'Unable to start the Maya payment.'} ` +
          'Your order was saved - you can retry the payment.',
        buttons: [
          {
            text: 'Retry payment',
            handler: () => {
              this.router.navigate(['/payment-result'], {
                queryParams: { orderId, outcome: 'retry' }
              });
            }
          },
          { text: 'Close', role: 'cancel' }
        ]
      });

      await alert.present();
    }
  }


  async placeOrder(): Promise<void> {
    if (this.placingOrder) return;

    this.placingOrder = true;

    try {
      await this.submitOrder();
    } finally {
      this.placingOrder = false;
    }
  }

  private async submitOrder(): Promise<void> {
    // -----------------------------
    // LOGIN CHECK
    // -----------------------------
    // Always a fresh, non-expired Firebase ID token.
    const token = await this.authService.getToken().catch(() => null);

    if (!token) {
      const alert = await this.alertController.create({
        header: 'Login Required',
        message: 'Please log in before placing your order.',
        buttons: [
          {
            text: 'Log In',
            handler: () => {
              this.router.navigate(['/login']);
            }
          },
          {
            text: 'Cancel',
            role: 'cancel'
          }
        ]
      });

      await alert.present();
      return;
    }

    // -----------------------------
    // REQUIRED DELIVERY FIELDS
    // -----------------------------
    if (
      !this.checkout.fullName.trim() ||
      !this.checkout.phone.trim() ||
      !this.checkout.email.trim() ||
      !this.checkout.streetAddress.trim() ||
      !this.checkout.city.trim() ||
      !this.checkout.province.trim() ||
      !this.checkout.zip.trim() ||
      !this.checkout.region.trim() ||
      !this.checkout.deliveryDate
    ) {
      const alert = await this.alertController.create({
        header: 'Incomplete Information',
        message:
          'Please complete all required delivery information before placing your order.',
        buttons: ['OK']
      });

      await alert.present();
      return;
    }

    // -----------------------------
    // TERMS
    // -----------------------------
    if (!this.checkout.terms) {
      const alert = await this.alertController.create({
        header: 'Terms & Conditions',
        message:
          'Please agree to the Terms and Conditions before placing your order.',
        buttons: ['OK']
      });

      await alert.present();
      return;
    }

    // -----------------------------
    // BUILD ADDRESS
    // -----------------------------
    this.checkout.address = this.buildCompleteAddress();

    // -----------------------------
    // PAYMENT
    // -----------------------------
    const paymentMethod =
      this.checkout.payment === 'maya'
        ? 'MAYA'
        : 'COD';

    // -----------------------------
    // BACKEND PAYLOAD
    // -----------------------------
    const payload = {
      customer: {
        fullName: this.checkout.fullName.trim(),
        phone: this.checkout.phone.trim(),
        email: this.checkout.email.trim().toLowerCase(),

        address: this.checkout.address,

        streetAddress:
          this.checkout.streetAddress.trim(),

        city:
          this.checkout.city.trim(),

        province:
          this.checkout.province.trim(),

        zip:
          this.checkout.zip.trim(),

        region:
          this.checkout.region.trim()
      },

      delivery: {
        date: this.checkout.deliveryDate,
        instructions:
          this.checkout.instructions?.trim() || ''
      },

      paymentMethod,

      discount: Number(this.discount) || 0
    };

    try {
      // -----------------------------
      // SYNC LOCAL CART TO BACKEND
      // -----------------------------
      await this.syncCartWithBackend(token);

      // -----------------------------
      // CREATE REAL BACKEND ORDER
      // -----------------------------
      const response = await fetch(
        `${environment.apiUrl}/orders`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },

          body: JSON.stringify(payload)
        }
      );

      const data = await response.json().catch(() => ({}));

      // -----------------------------
      // TOKEN EXPIRED / INVALID
      // -----------------------------
      if (response.status === 401) {
        await this.authService.logout().catch(() => undefined);

        const alert = await this.alertController.create({
          header: 'Session Expired',
          message:
            'Please log in again before placing your order.',
          buttons: ['OK']
        });

        await alert.present();

        await this.router.navigate(['/login']);
        return;
      }

      // -----------------------------
      // BACKEND ERROR
      // -----------------------------
      if (!response.ok) {
        throw new Error(
          data?.message ||
          'Unable to place your order.'
        );
      }

      // -----------------------------
      // ORDER HISTORY MUST REFRESH
      // -----------------------------
      // Orders are never cached in the browser. Drop the in-memory snapshot
      // and mark any request that started before this order as outdated so
      // Order History / Track Order load the new order from the API.
      this.ordersService.invalidate();

      // Keep the exact cart snapshot through the Maya redirect. Maya's hosted
      // checkout can be cancelled, in which case the payment-result page uses
      // this snapshot (or the authenticated order record) to restore checkout.
      if (paymentMethod === 'MAYA') {
        try {
          sessionStorage.setItem(
            `botaniqueMayaCart:${String(data.id)}`,
            JSON.stringify(this.cartItems)
          );
        } catch {
          // Payment-result recovery can rebuild items from the owned order.
        }
      }

      // -----------------------------
      // DO NOT MANUALLY CLEAR
      // THE BACKEND CART.
      //
      // Backend already clears it after
      // successful order creation.
      // -----------------------------
      // Clear the browser cart too. The backend cart is cleared by the
      // successful order transaction, but checkout also maintains a local
      // cart for the storefront UI. Persist the empty state so a reload
      // cannot resurrect the purchased item.
      this.cartItems = [];
      this.saveCart();

      this.updateCartCount();
      this.refreshNavbarCounts();

      // -----------------------------
      // SUCCESS
      // -----------------------------
      // Maya orders are only confirmed AFTER Maya verifies the payment on
      // the server. Here we just send the customer to Maya Checkout.
      if (paymentMethod === 'MAYA') {
        await this.startMayaPayment(String(data.id), token);
        return;
      }

      const alert = await this.alertController.create({
        header: 'Order Placed!',
        message:
          `Thank you, ${data.customerJson?.fullName || this.checkout.fullName}. ` +
          `Your order ${data.orderNumber} has been received.`,
        buttons: [
          {
            text: 'View Order',
            handler: () => {
              this.router.navigate(
                ['/track-order'],
                { queryParams: { id: data.order?.id || data.id } }
              );
            }
          },
          {
            text: 'Continue Shopping',
            handler: () => {
              this.router.navigate(['/product']);
            }
          }
        ]
      });

      await alert.present();

    } catch (error: any) {
      console.error(
        'Checkout error:',
        error
      );

      const alert = await this.alertController.create({
        header: 'Order Failed',
        message:
          error?.message ||
          'Unable to place your order. Please try again.',
        buttons: ['OK']
      });

      await alert.present();
    }
  }

}
