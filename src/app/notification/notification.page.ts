import {
  Component,
  OnInit,
  OnDestroy
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  Router,
  NavigationEnd
} from '@angular/router';

import {
  Subscription,
  filter
} from 'rxjs';


/* NOTIFICATION INTERFACE */

interface NotificationItem {
  id: number;
  type: 'order' | 'wishlist' | 'promotion' | 'system';
  title: string;
  message: string;
  time: string;
  read: boolean;
}


/* CART INTERFACE */

interface CartItem {
  id: string | number;
  name?: string;
  price?: number;
  image?: string;
  quantity: number;
}


/* WISHLIST INTERFACE */

interface WishlistItem {
  id: string | number;
  name?: string;
  price?: number;
  image?: string;
}


/* COMPONENT */

@Component({
  selector: 'app-notification',

  templateUrl: './notification.page.html',

  styleUrls: ['./notification.page.scss'],

  standalone: true,

  imports: [
    CommonModule,
    FormsModule
  ]
})


export class NotificationPage
  implements OnInit, OnDestroy {


  /* NAVBAR */

  menuOpen = false;

  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  email = '';

  password = '';

  rememberMe = false;


  /*   NAVBAR COUNTS */

  wishlistCount = 0;

  notificationCount = 0;

  cartCount = 0;


  /*   NOTIFICATIONS */

  notifications: NotificationItem[] = [];


  /*   CART */

  cartDrawerOpen = false;

  cartItems: CartItem[] = [];


  /*   ROUTER SUBSCRIPTION */

  private routerSubscription?: Subscription;


  /*   STORAGE KEYS */

  private readonly NOTIFICATIONS_KEY =
    'botaniqueNotifications';

  private readonly NOTIFICATION_COUNT_KEY =
    'botaniqueNotificationCount';

  private readonly WISHLIST_KEY =
    'botaniqueWishlistItems';

  private readonly CART_KEY =
    'botaniqueCartItems';


  /*   CONSTRUCTOR */

  constructor(
    private router: Router
  ) {}


  /*   INIT */

  ngOnInit(): void {

    /* LOAD INITIAL DATA */

    this.loadNotifications();

    this.loadCart();

    this.updateWishlistCount();

    this.updateCartCount();

    this.updateNotificationCount();


    /* REFRESH WHEN NAVIGATION FINISHES */

    this.routerSubscription =
      this.router.events
        .pipe(
          filter(
            event =>
              event instanceof NavigationEnd
          )
        )
        .subscribe(() => {

          this.loadNotifications();

          this.loadCart();

          this.updateWishlistCount();

          this.updateCartCount();

          this.updateNotificationCount();

        });


    /* STORAGE LISTENER */

    window.addEventListener(
      'storage',
      this.handleStorageChange
    );
  }


  /*   DESTROY */

  ngOnDestroy(): void {

    this.routerSubscription?.unsubscribe();

    window.removeEventListener(
      'storage',
      this.handleStorageChange
    );
  }


  /*   STORAGE CHANGE */

  private handleStorageChange = (
    event: StorageEvent
  ): void => {

    if (
      event.key === this.NOTIFICATIONS_KEY ||
      event.key === this.NOTIFICATION_COUNT_KEY ||
      event.key === this.WISHLIST_KEY ||
      event.key === this.CART_KEY
    ) {

      this.loadNotifications();

      this.loadCart();

      this.updateWishlistCount();

      this.updateCartCount();

      this.updateNotificationCount();
    }
  };


  /*   LOAD NOTIFICATIONS */

  private loadNotifications(): void {

    const saved =
      localStorage.getItem(
        this.NOTIFICATIONS_KEY
      );


    if (saved) {

      try {

        const parsed =
          JSON.parse(saved);


        if (Array.isArray(parsed)) {

          this.notifications =
            parsed;

          this.updateNotificationCount();

          return;
        }

      } catch (error) {

        console.error(
          'Unable to load notifications:',
          error
        );
      }
    }


    /* DEFAULT NOTIFICATIONS */

    this.notifications = [

      {
        id: 1,

        type: 'order',

        title: 'Welcome to Botanique',

        message:
          'Thank you for joining Botanique. Your plant journey starts here.',

        time: 'Just now',

        read: false
      },

      {
        id: 2,

        type: 'promotion',

        title: 'New plants are available',

        message:
          'Discover our latest collection of beautiful plants for your space.',

        time: 'Today',

        read: false
      },

      {
        id: 3,

        type: 'wishlist',

        title: 'Your wishlist is waiting',

        message:
          'Some of your favorite plants are still waiting for you.',

        time: 'Yesterday',

        read: true
      }

    ];


    this.saveNotifications();
  }


  /*   SAVE NOTIFICATIONS */

  private saveNotifications(): void {

    localStorage.setItem(
      this.NOTIFICATIONS_KEY,
      JSON.stringify(
        this.notifications
      )
    );

    this.updateNotificationCount();
  }


  get hasUnreadNotifications(): boolean {

    return this.notifications.some(
      notification =>
        !notification.read
    );
  }


  markAsRead(
    id: number
  ): void {

    const notification =
      this.notifications.find(
        item =>
          item.id === id
      );


    if (!notification) {
      return;
    }


    notification.read = true;

    this.saveNotifications();
  }


  /*   MARK ALL AS READ */

  markAllAsRead(): void {

    this.notifications =
      this.notifications.map(
        notification => ({
          ...notification,
          read: true
        })
      );


    this.saveNotifications();
  }


  /*   DELETE NOTIFICATION */

  deleteNotification(
    id: number
  ): void {

    this.notifications =
      this.notifications.filter(
        notification =>
          notification.id !== id
      );


    this.saveNotifications();
  }


  /*   NOTIFICATION COUNT */

  private updateNotificationCount(): void {

    this.notificationCount =
      this.notifications.filter(
        notification =>
          !notification.read
      ).length;


    localStorage.setItem(
      this.NOTIFICATION_COUNT_KEY,
      String(
        this.notificationCount
      )
    );
  }


  /*   WISHLIST COUNT */

  private updateWishlistCount(): void {

    const saved =
      localStorage.getItem(
        this.WISHLIST_KEY
      );


    if (!saved) {

      this.wishlistCount = 0;

      return;
    }


    try {

      const wishlist =
        JSON.parse(saved);


      if (Array.isArray(wishlist)) {

        const uniqueIds =
          new Set(
            wishlist.map(
              (item: WishlistItem) =>
                String(item.id)
            )
          );


        this.wishlistCount =
          uniqueIds.size;

      } else {

        this.wishlistCount = 0;
      }

    } catch (error) {

      console.error(
        'Unable to read wishlist:',
        error
      );

      this.wishlistCount = 0;
    }
  }


  /*   LOAD CART */

  private loadCart(): void {

    const saved =
      localStorage.getItem(
        this.CART_KEY
      );


    if (!saved) {

      this.cartItems = [];

      this.cartCount = 0;

      return;
    }


    try {

      const parsed =
        JSON.parse(saved);


      if (Array.isArray(parsed)) {

        this.cartItems =
          parsed.map(
            (item: CartItem) => ({

              ...item,

              quantity:
                Number(item.quantity) || 1,

              price:
                Number(item.price) || 0

            })
          );


        this.updateCartCount();

      } else {

        this.cartItems = [];

        this.cartCount = 0;
      }

    } catch (error) {

      console.error(
        'Unable to load cart:',
        error
      );

      this.cartItems = [];

      this.cartCount = 0;
    }
  }


  /*   SAVE CART */

  private saveCart(): void {

    localStorage.setItem(
      this.CART_KEY,
      JSON.stringify(
        this.cartItems
      )
    );


    this.updateCartCount();
  }


  /*   CART COUNT */

  private updateCartCount(): void {

    this.cartCount =
      this.cartItems.reduce(
        (
          total: number,
          item: CartItem
        ) => {

          return total +
            (Number(item.quantity) || 0);

        },

        0
      );
  }


  /*   CART SUBTOTAL */

  get cartSubtotal(): number {

    return this.cartItems.reduce(
      (
        total: number,
        item: CartItem
      ) => {

        const price =
          Number(item.price) || 0;

        const quantity =
          Number(item.quantity) || 0;


        return total +
          (price * quantity);

      },

      0
    );
  }


  /*   OPEN CART */

  goToCart(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.loadCart();

    this.cartDrawerOpen = true;
  }


  /*   CLOSE CART */

  closeCart(): void {

    this.cartDrawerOpen = false;
  }


  /*   CONTINUE SHOPPING */

  continueShopping(
    event: Event
  ): void {

    event.preventDefault();

    this.cartDrawerOpen = false;

    this.menuOpen = false;

    this.loginDropdownOpen = false;


    this.router.navigate([
      '/product'
    ]);
  }


  /*   INCREASE CART QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    item.quantity =
      (Number(item.quantity) || 0) + 1;


    this.saveCart();
  }


  /*   DECREASE CART QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    const currentQuantity =
      Number(item.quantity) || 0;


    if (currentQuantity > 1) {

      item.quantity =
        currentQuantity - 1;

    } else {

      this.cartItems =
        this.cartItems.filter(
          cartItem =>
            String(cartItem.id) !==
            String(item.id)
        );
    }


    this.saveCart();
  }


  /*   REMOVE CART ITEM */

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


  /*   FORMAT CART PRICE */

  formatCartPrice(
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


  /*   CHECKOUT */

  checkout(
    event: Event
  ): void {

    event.preventDefault();


    if (
      this.cartItems.length === 0
    ) {

      alert(
        'Your cart is empty.'
      );

      return;
    }


    this.cartDrawerOpen = false;

    this.menuOpen = false;

    this.loginDropdownOpen = false;


    this.router.navigate([
      '/checkout'
    ]);
  }


  /*   MOBILE MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;


    if (this.menuOpen) {

      this.loginDropdownOpen =
        false;
    }
  }


  /*   LOGIN DROPDOWN */

  toggleLoginDropdown(event?: Event): void {

    event?.stopPropagation();

    if (this.isLoggedIn) {
      this.loginDropdownOpen = false;
      this.router.navigate(['/profile']);
      return;
    }

    this.loginDropdownOpen = !this.loginDropdownOpen;
  }


  /*   LOGIN */

  async login(): Promise<void> {

    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password.trim()) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/auth/login', {
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


  /*   FORGOT PASSWORD */

  forgotPassword(
    event: Event
  ): void {

    event.preventDefault();

    alert(
      'Password recovery is not available yet.'
    );
  }


  /*   CONTINUE AS GUEST */

  continueAsGuest(): void {

    this.loginDropdownOpen =
      false;

    alert(
      'You are continuing as a guest.'
    );
  }


  /*   SIGN UP */

  goToSignup(
    event: Event
  ): void {

    event.preventDefault();

    this.loginDropdownOpen = false;

    this.menuOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/signup'
    ]);
  }


  /*   HOME */

  goHome(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/home'
    ]);
  }


  /*   ABOUT */

  goToAbout(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/about'
    ]);
  }


  /*   PRODUCT */

  goToProduct(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/product'
    ]);
  }


  /*   PRODUCT CATEGORY */

  goToProductCategory(
    category: string,
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate(
      ['/product'],
      {
        queryParams: {
          category: category
        }
      }
    );
  }


  /*   DEVELOPERS */

  goToDevelopers(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/developers'
    ]);
  }


  /*   CONTACT */

  goToContact(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/contact'
    ]);
  }


  /*   WISHLIST */

  goToWishlist(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/wishlist'
    ]);
  }


  /*   NOTIFICATIONS */

  goToNotifications(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/notifications'
    ]);
  }


  /*   FOOTER ABOUT */

  stayOnAbout(
    event: Event
  ): void {

    event.preventDefault();

    this.menuOpen = false;

    this.loginDropdownOpen = false;

    this.cartDrawerOpen = false;


    this.router.navigate([
      '/about'
    ]);
  }

}