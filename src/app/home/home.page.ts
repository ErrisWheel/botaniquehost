import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';


/* CART ITEM */

interface CartItem {
  id: string;
  quantity: number;
  name?: string;
  price?: number;
  image?: string;
}


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class HomePage implements OnInit {

  /* NAVIGATION */

  menuOpen: boolean = false;
  loginDropdownOpen: boolean = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }


  /* CART */

  cartCount: number = 0;

  cartDrawerOpen: boolean = false;

  cartItems: CartItem[] = [];


  /* WISHLIST */

  wishlistCount: number = 0;


  /* NOTIFICATIONS */

  notificationCount: number = 0;


  /*   LOGIN */

  email: string = '';
  password: string = '';
  rememberMe: boolean = false;


  /*   VIDEO SCROLL ANIMATION */

  videoProgress: number = 0;


  /*   NEWSLETTER */

  newsletterEmail: string = '';
  newsletterMessage: string = '';


  /*   STORAGE KEYS */

  private readonly CART_STORAGE_KEY =
    'botaniqueCartItems';

  private readonly WISHLIST_STORAGE_KEY =
    'botaniqueWishlistItems';

  private readonly NOTIFICATION_STORAGE_KEY =
    'botaniqueNotifications';


  /*   CONSTRUCTOR */

  constructor(
    private router: Router
  ) {}


  /*   INITIALIZATION */

  ngOnInit(): void {

    this.loadCart();

    this.refreshNavbarCounts();

  }


  /*   HOME */

  goHome(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/home']);

  }


  /*   MOBILE MENU */

  toggleMenu(): void {

    this.menuOpen = !this.menuOpen;

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


  /*   MAIN NAVIGATION */

  goToAbout(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/about']);

  }


  goToProduct(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/product']);

  }


  goToDevelopers(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/developers']);

  }


  goToContact(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/contact']);

  }


  /*   WISHLIST NAVIGATION */

  goToWishlist(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/wishlist']);

  }


  /*   NOTIFICATION NAVIGATION */

  goToNotifications(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate(['/notifications']);

  }


  /*   SIGN UP */

  goToSignup(event: Event): void {

    event.preventDefault();

    this.loginDropdownOpen = false;

    this.router.navigate(['/signup']);

  }


  /*   CLOSE MENUS */

  private closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen = false;

  }


  /*   SEARCH */

  search(): void {

    alert('Search clicked.');

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

  forgotPassword(event: Event): void {

    event.preventDefault();

    alert(
      'Forgot Password clicked.'
    );

  }


  /*   CONTINUE AS GUEST */

  continueAsGuest(): void {

    this.loginDropdownOpen = false;

    alert(
      'Continuing as guest.'
    );

  }


  /*   OPEN CART */

  goToCart(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.loadCart();

    this.cartDrawerOpen = true;

    document.body.classList.add(
      'cart-drawer-open'
    );

  }


  /*   CLOSE CART */

  closeCart(): void {

    this.cartDrawerOpen = false;

    document.body.classList.remove(
      'cart-drawer-open'
    );

  }


  /*   LOAD CART */

  loadCart(): void {

    try {

      const storedCart =
        localStorage.getItem(
          this.CART_STORAGE_KEY
        );

      if (!storedCart) {

        this.cartItems = [];

        this.cartCount = 0;

        return;

      }

      const parsedCart =
        JSON.parse(storedCart);

      if (!Array.isArray(parsedCart)) {

        this.cartItems = [];

        this.cartCount = 0;

        return;

      }

      this.cartItems =
        parsedCart
          .filter(
            (item: any) =>
              item &&
              item.id &&
              Number(item.quantity) > 0
          )
          .map(
            (item: any): CartItem => ({
              id: String(item.id),
              quantity:
                Number(item.quantity) || 1,
              name:
                item.name || '',
              price:
                Number(item.price) || 0,
              image:
                item.image || ''
            })
          );

      this.updateCartCount();

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

    try {

      localStorage.setItem(
        this.CART_STORAGE_KEY,
        JSON.stringify(this.cartItems)
      );

      this.updateCartCount();

    } catch (error) {

      console.error(
        'Unable to save cart:',
        error
      );

    }

  }


  /*   INCREASE CART QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    item.quantity++;

    this.saveCart();

  }


  /*   DECREASE CART QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    if (item.quantity > 1) {

      item.quantity--;

    } else {

      this.removeFromCart(item);

      return;

    }

    this.saveCart();

  }


  /*   REMOVE FROM CART */

  removeFromCart(
    item: CartItem
  ): void {

    this.cartItems =
      this.cartItems.filter(
        cartItem =>
          cartItem.id !== item.id
      );

    this.saveCart();

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


  /*   CART PRICE FORMAT */

  formatCartPrice(
    price: number
  ): string {

    return `₱${Number(price || 0).toLocaleString(
      'en-PH'
    )}`;

  }


  /*   UPDATE CART COUNT */

  updateCartCount(): void {

    try {

      const storedCart =
        localStorage.getItem(
          this.CART_STORAGE_KEY
        );

      if (!storedCart) {

        this.cartCount = 0;

        return;

      }

      const cartItems =
        JSON.parse(storedCart);

      if (!Array.isArray(cartItems)) {

        this.cartCount = 0;

        return;

      }

      this.cartCount =
        cartItems.reduce(
          (
            total: number,
            item: any
          ) => {

            const quantity =
              Number(item.quantity) || 0;

            return total + quantity;

          },
          0
        );

    } catch (error) {

      console.error(
        'Unable to load cart count:',
        error
      );

      this.cartCount = 0;

    }

  }


  /*   CONTINUE SHOPPING */

  continueShopping(
    event?: Event
  ): void {

    if (event) {

      event.preventDefault();

    }

    this.closeCart();

  }


  /*   CHECKOUT */

  checkout(
    event?: Event
  ): void {

    if (event) {

      event.preventDefault();

    }

    if (!this.cartItems.length) {

      alert(
        'Your cart is empty.'
      );

      return;

    }

    this.closeCart();

    this.router.navigate([
      '/product'
    ]);

  }


  /*   WISHLIST COUNT */

  updateWishlistCount(): void {

    try {

      const storedWishlist =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );

      if (!storedWishlist) {

        this.wishlistCount = 0;

        return;

      }

      const wishlistItems =
        JSON.parse(storedWishlist);

      if (!Array.isArray(wishlistItems)) {

        this.wishlistCount = 0;

        return;

      }

      this.wishlistCount =
        wishlistItems.length;

    } catch (error) {

      console.error(
        'Unable to load wishlist count:',
        error
      );

      this.wishlistCount = 0;

    }

  }


  /*   NOTIFICATION COUNT */

  updateNotificationCount(): void {

    try {

      const storedNotifications =
        localStorage.getItem(
          this.NOTIFICATION_STORAGE_KEY
        );

      if (!storedNotifications) {

        this.notificationCount = 0;

        return;

      }

      const notifications =
        JSON.parse(
          storedNotifications
        );

      if (!Array.isArray(notifications)) {

        this.notificationCount = 0;

        return;

      }

      this.notificationCount =
        notifications.filter(
          (notification: any) =>
            notification.read !== true
        ).length;

    } catch (error) {

      console.error(
        'Unable to load notification count:',
        error
      );

      this.notificationCount = 0;

    }

  }


  /*   REFRESH NAVBAR COUNTS */

  refreshNavbarCounts(): void {

    this.updateCartCount();

    this.updateWishlistCount();

    this.updateNotificationCount();

  }


  /*   VIDEO SCROLL ANIMATION */

  onHomeScroll(event: Event): void {

    const container =
      event.target as HTMLElement;

    if (!container) {

      return;

    }

    const section =
      container.querySelector(
        '#plantScrollExpand'
      ) as HTMLElement;

    if (!section) {

      return;

    }

    const scrollTop =
      container.scrollTop;

    const sectionTop =
      section.offsetTop;

    const expandDistance =
      window.innerHeight * 0.5;

    if (expandDistance <= 0) {

      this.videoProgress = 0;

      return;

    }

    let progress =
      (scrollTop - sectionTop) /
      expandDistance;

    progress = Math.max(
      0,
      Math.min(
        1,
        progress
      )
    );

    this.videoProgress =
      progress;

  }


  /*   NEWSLETTER */

  subscribeNewsletter(): void {

    const email =
      this.newsletterEmail.trim();

    if (!email) {

      this.newsletterMessage =
        'Please enter your email address.';

      return;

    }

    this.newsletterMessage =
      'Thank you for subscribing!';

    this.newsletterEmail = '';

  }

}