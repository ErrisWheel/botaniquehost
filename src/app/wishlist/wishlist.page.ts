import { environment } from '../../environments/environment';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Router,
  NavigationEnd
} from '@angular/router';
import { filter, Subscription } from 'rxjs';


/* WISHLIST ITEM */

interface WishlistItem {
  id: string | number;
  name: string;
  price: number;
  image: string;
  category?: string;
  subcategory?: string;
}


/* CART ITEM */

interface CartItem {
  id: string | number;
  name?: string;
  price?: number;
  image?: string;
  quantity: number;
}


/* COMPONENT */

@Component({
  selector: 'app-wishlist',
  templateUrl: './wishlist.page.html',
  styleUrls: ['./wishlist.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class WishlistPage implements OnInit, OnDestroy {

  /* STORAGE KEYS */

  private readonly WISHLIST_KEY =
    'botaniqueWishlistItems';

  private readonly CART_KEY =
    'botaniqueCartItems';

  private readonly USERS_KEY =
    'botaniqueUsers';

  private readonly USER_KEY =
    'botaniqueUser';

  private readonly NOTIFICATION_KEY =
    'botaniqueNotificationCount';


  /* ROUTER SUBSCRIPTION */

  private routerEventsSubscription?: Subscription;


  /* WISHLIST */

  wishlistItems: WishlistItem[] = [];

  wishlistCount = 0;


  /* CART */

  cartItems: CartItem[] = [];

  cartCount = 0;

  cartSubtotal = 0;

  cartDrawerOpen = false;


  /* NOTIFICATIONS */

  notificationCount = 0;


  /* MOBILE MENU */

  menuOpen = false;


  /* LOGIN */

  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  email = '';

  password = '';

  rememberMe = false;


  /* CONSTRUCTOR */

  constructor(
    private router: Router
  ) {}


  /* ON INIT */

  ngOnInit(): void {

    this.refreshData();

    this.loadRememberedEmail();

    this.routerEventsSubscription =
      this.router.events
        .pipe(
          filter(
            event =>
              event instanceof NavigationEnd
          )
        )
        .subscribe(
          (event: NavigationEnd) => {

            if (
              event.urlAfterRedirects
                .split('?')[0] === '/wishlist'
            ) {

              this.refreshData();

              this.loadRememberedEmail();

            }

          }
        );


    window.addEventListener(
      'storage',
      this.handleStorageChange
    );

  }


  /* IONIC PAGE ENTER */

  ionViewWillEnter(): void {

    this.refreshData();

    this.loadRememberedEmail();

  }


  /* DESTROY */

  ngOnDestroy(): void {

    this.routerEventsSubscription?.unsubscribe();

    window.removeEventListener(
      'storage',
      this.handleStorageChange
    );

  }


  /* STORAGE CHANGE */

  private handleStorageChange = (
    event: StorageEvent
  ): void => {

    if (
      event.key === this.WISHLIST_KEY ||
      event.key === this.CART_KEY ||
      event.key === this.NOTIFICATION_KEY
    ) {

      this.refreshData();

    }

  };


  /* REFRESH ALL DATA */

  refreshData(): void {

    this.loadWishlist();

    this.loadCart();

    this.loadNotificationCount();

  }


  /* LOAD WISHLIST */

  loadWishlist(): void {

    try {

      const savedWishlist =
        localStorage.getItem(
          this.WISHLIST_KEY
        );


      if (!savedWishlist) {

        this.wishlistItems = [];

        this.wishlistCount = 0;

        return;

      }


      const parsedWishlist =
        JSON.parse(savedWishlist);


      if (!Array.isArray(parsedWishlist)) {

        this.wishlistItems = [];

        this.wishlistCount = 0;

        return;

      }

      const normalizedItems: WishlistItem[] =
        parsedWishlist
          .filter(
            (item: any) =>
              item &&
              item.id !== undefined &&
              item.id !== null
          )
          .map(
            (item: any): WishlistItem => ({

              id: item.id,

              name:
                String(
                  item.name || 'Plant'
                ),

              price:
                Number(item.price) || 0,

              image:
                String(
                  item.image || ''
                ),

              category:
                item.category ||
                undefined,

              subcategory:
                item.subcategory ||
                undefined

            })
          );

      const uniqueItems: WishlistItem[] = [];

      const seenIds =
        new Set<string>();


      for (
        const item of normalizedItems
      ) {

        const id =
          String(item.id);


        if (
          !seenIds.has(id)
        ) {

          seenIds.add(id);

          uniqueItems.push(item);

        }

      }


      this.wishlistItems =
        uniqueItems;


      this.wishlistCount =
        this.wishlistItems.length;

      localStorage.setItem(
        this.WISHLIST_KEY,
        JSON.stringify(
          this.wishlistItems
        )
      );

    } catch (error) {

      console.error(
        'Unable to load wishlist:',
        error
      );

      this.wishlistItems = [];

      this.wishlistCount = 0;

    }

  }


  /* UPDATE WISHLIST COUNT */

  updateWishlistCount(): void {

    this.wishlistCount =
      this.wishlistItems.length;

  }


  /* SAVE WISHLIST */

  saveWishlist(): void {

    try {

      localStorage.setItem(
        this.WISHLIST_KEY,
        JSON.stringify(
          this.wishlistItems
        )
      );

    } catch (error) {

      console.error(
        'Unable to save wishlist:',
        error
      );

    }


    this.updateWishlistCount();

  }


  /* REMOVE FROM WISHLIST */

  removeFromWishlist(
    item: WishlistItem
  ): void {

    this.wishlistItems =
      this.wishlistItems.filter(
        wishlistItem =>
          String(wishlistItem.id) !==
          String(item.id)
      );


    this.saveWishlist();

  }


  /* MOVE TO CART */

  moveToCart(
    item: WishlistItem
  ): void {

    const existingItem =
      this.cartItems.find(
        cartItem =>
          String(cartItem.id) ===
          String(item.id)
      );


    if (existingItem) {

      existingItem.quantity += 1;

    } else {

      this.cartItems.push({

        id: item.id,

        name: item.name,

        price:
          Number(item.price) || 0,

        image: item.image,

        quantity: 1

      });

    }

    this.wishlistItems =
      this.wishlistItems.filter(
        wishlistItem =>
          String(wishlistItem.id) !==
          String(item.id)
      );

    this.saveWishlist();

    this.saveCart();


    /*
     * Open cart drawer.
     */

    this.cartDrawerOpen = true;

  }


  /* CART */

  loadCart(): void {

    try {

      const savedCart =
        localStorage.getItem(
          this.CART_KEY
        );


      if (!savedCart) {

        this.cartItems = [];

        this.updateCartTotals();

        return;

      }


      const parsedCart =
        JSON.parse(savedCart);


      if (Array.isArray(parsedCart)) {

        this.cartItems =
          parsedCart.map(
            (item: any): CartItem => ({

              id: item.id,

              name:
                item.name,

              price:
                Number(item.price) || 0,

              image:
                item.image,

              quantity:
                Math.max(
                  1,
                  Number(item.quantity) || 1
                )

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


    this.updateCartTotals();

  }


  /* SAVE CART */

  saveCart(): void {

    try {

      localStorage.setItem(
        this.CART_KEY,
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


    this.updateCartTotals();

  }


  /* UPDATE CART TOTALS */

  updateCartTotals(): void {

    this.cartCount =
      this.cartItems.reduce(
        (total, item) =>
          total +
          (Number(item.quantity) || 0),
        0
      );


    this.cartSubtotal =
      this.cartItems.reduce(
        (total, item) =>
          total +
          (
            (Number(item.price) || 0) *
            (Number(item.quantity) || 0)
          ),
        0
      );

  }


  /* INCREASE QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    item.quantity =
      (Number(item.quantity) || 0) + 1;

    this.saveCart();

  }


  /* DECREASE QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    if (item.quantity > 1) {

      item.quantity -= 1;

      this.saveCart();

    } else {

      this.removeFromCart(item);

    }

  }


  /* REMOVE FROM CART */

  removeFromCart(
    item: CartItem
  ): void {

    this.cartItems =
      this.cartItems.filter(
        cartItem =>
          String(cartItem.id) !==
          String(item.id)
      );

    this.saveCart();

  }


  /* OPEN CART */

  goToCart(
    event?: Event
  ): void {

    event?.preventDefault();

    this.loadCart();

    this.cartDrawerOpen = true;

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

    this.router.navigate([
      '/product'
    ]);

  }


  /* CHECKOUT */

  checkout(
    event?: Event
  ): void {

    event?.preventDefault();


    if (
      this.cartItems.length === 0
    ) {

      return;

    }


    this.closeCart();

    this.router.navigate([
      '/checkout'
    ]);

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
        maximumFractionDigits: 0
      }
    ).format(
      Number(price) || 0
    );

  }


  formatCartPrice(
    price: number
  ): string {

    return this.formatPrice(price);

  }


  /* MOBILE MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;

  }


  closeMenu(): void {

    this.menuOpen = false;

  }


  /* NAVIGATION */

  goHome(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/home'
    ]);

  }


  goToAbout(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/about'
    ]);

  }


  goToProduct(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/product'
    ]);

  }


  goToProductCategory(
    category:
      'indoor' |
      'outdoor' |
      'accessories',
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate(
      ['/product'],
      {
        queryParams: {
          category
        }
      }
    );

  }


  goToDevelopers(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/developers'
    ]);

  }


  goToContact(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/contact'
    ]);

  }


  goToWishlist(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.loadWishlist();

    this.router.navigate([
      '/wishlist'
    ]);

  }


  goToNotifications(event?: Event): void {

    event?.preventDefault();

    this.closeMenu();

    this.router.navigate([
      '/notifications'
    ]);

  }


  /* LOGIN */

  toggleLoginDropdown(event?: Event): void {

    event?.stopPropagation();

    if (this.isLoggedIn) {
      this.loginDropdownOpen = false;
      this.router.navigate(['/profile']);
      return;
    }

    this.loginDropdownOpen = !this.loginDropdownOpen;
  }


  loadRememberedEmail(): void {

    try {

      const rememberedEmail =
        localStorage.getItem(
          'botaniqueRememberedEmail'
        );


      if (rememberedEmail) {

        this.email =
          rememberedEmail;

        this.rememberMe = true;

      }

    } catch (error) {

      console.error(
        'Unable to load remembered email:',
        error
      );

    }

  }


  async login(): Promise<void> {

    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password.trim()) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const response = await fetch(`${environment.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: this.password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.token || !data?.user) {
        throw new Error(data?.message || 'Invalid email or password.');
      }

      localStorage.setItem('botaniqueToken', data.token);
      localStorage.setItem('botaniqueUser', JSON.stringify({
        id: data.user.id,
        name: data.user.fullName || data.user.name || '',
        fullName: data.user.fullName || data.user.name || '',
        email: data.user.email,
        phone: data.user.phone || '',
        role: data.user.role
      }));

      this.email = '';
      this.password = '';
      this.loginDropdownOpen = false;

      alert(`Welcome back, ${data.user.fullName || data.user.email}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(error?.message || 'Unable to log in. Please try again.');
    }
  }


  forgotPassword(event?: Event): void {

    event?.preventDefault();

    alert(
      'Password recovery is not available yet.'
    );

  }


  continueAsGuest(): void {

    this.loginDropdownOpen = false;

    alert(
      'Continuing as guest.'
    );

  }


  goToSignup(event?: Event): void {

    event?.preventDefault();

    this.loginDropdownOpen = false;

    this.router.navigate([
      '/signup'
    ]);

  }


  /* NOTIFICATION COUNT */

  loadNotificationCount(): void {

    try {

      const savedCount =
        localStorage.getItem(
          this.NOTIFICATION_KEY
        );


      this.notificationCount =
        savedCount
          ? Number(savedCount) || 0
          : 0;

    } catch (error) {

      console.error(
        'Unable to load notification count:',
        error
      );

      this.notificationCount = 0;

    }

  }

}
