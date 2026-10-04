import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface CartItem {
  id: string;
  quantity: number;
  name?: string;
  price?: number;
  image?: string;
}

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class AboutPage implements OnInit {

  private readonly authService = inject(AuthService);


  // NAVBAR

  menuOpen: boolean = false;
  loginDropdownOpen: boolean = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  cartCount: number = 0;
  wishlistCount: number = 0;
  notificationCount: number = 0;

  email: string = '';
  password: string = '';
  rememberMe: boolean = false;



  // CART DRAWER

  cartDrawerOpen: boolean = false;
  cartItems: CartItem[] = [];

  // CAROUSEL


  currentSlide: number = 0;


  // LOCAL STORAGE KEYS
  private readonly CART_STORAGE_KEY = 'botaniqueCartItems';
  private readonly WISHLIST_STORAGE_KEY =
    'botaniqueWishlistItems';
  private readonly NOTIFICATION_STORAGE_KEY =
    'botaniqueNotifications';



  // CONSTRUCTOR
  constructor(private router: Router) {}



  // INITIALIZATION
  ngOnInit(): void {
    this.loadCart();
    this.refreshNavbarCounts();
  }



  // NAVIGATION
  goHome(event: Event): void {
    event.preventDefault();
    this.closeMenus();
    this.router.navigate(['/home']);
  }


  stayOnAbout(event: Event): void {
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


  goToWishlist(event: Event): void {
    event.preventDefault();
    this.closeMenus();
    this.router.navigate(['/wishlist']);
  }


  goToNotifications(event: Event): void {
    event.preventDefault();
    this.closeMenus();
    this.router.navigate(['/notifications']);
  }


  goToSignup(event: Event): void {
    event.preventDefault();
    this.loginDropdownOpen = false;
    this.router.navigate(['/signup']);
  }



  // CART


  goToCart(event: Event): void {
    event.preventDefault();
    this.closeMenus();
    this.loadCart();
    this.cartDrawerOpen = true;
  }


  openCart(): void {
    this.loadCart();
    this.cartDrawerOpen = true;
  }


  closeCart(): void {
    this.cartDrawerOpen = false;
  }



  // LOAD CART


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
        parsedCart.map((item: any) => ({
          id: String(item.id),
          quantity: Number(item.quantity) || 1,
          name: item.name,
          price: Number(item.price) || 0,
          image: item.image
        }));

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



  // SAVE CART


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



  // INCREASE QUANTITY


  increaseQuantity(item: CartItem): void {
    item.quantity =
      (Number(item.quantity) || 0) + 1;

    this.saveCart();
  }



  // DECREASE QUANTITY


  decreaseQuantity(item: CartItem): void {
    const quantity =
      Number(item.quantity) || 0;
    if (quantity <= 1) {
      this.removeFromCart(item.id);

      return;
    }

    item.quantity =
      quantity - 1;

    this.saveCart();
  }



  // REMOVE FROM CART


  removeFromCart(productId: string): void {

    this.cartItems =
      this.cartItems.filter(
        item => item.id !== productId
      );

    this.saveCart();
  }



  // CART SUBTOTAL


  get cartSubtotal(): number {

    return this.cartItems.reduce(
      (total, item) => {

        const price =
          Number(item.price) || 0;

        const quantity =
          Number(item.quantity) || 0;

        return total + (price * quantity);

      },
      0
    );
  }



  // CART PRICE FORMAT


  formatCartPrice(price: number): string {

    return `₱${(
      Number(price) || 0
    ).toLocaleString('en-PH')}`;
  }



  // CONTINUE SHOPPING


  continueShopping(event: Event): void {

    event.preventDefault();

    this.closeCart();

    this.router.navigate(['/product']);
  }



  // CHECKOUT


  checkout(event: Event): void {

    event.preventDefault();

    if (this.cartItems.length === 0) {

      alert('Your cart is empty.');

      return;
    }

    this.closeCart();

    this.router.navigate(['/product'], {
      queryParams: {
        checkout: 'true'
      }
    });
  }

  // MOBILE MENU
  toggleMenu(): void {

    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.loginDropdownOpen = false;
    }
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


  continueAsGuest(): void {

    this.loginDropdownOpen = false;
    this.router.navigate(['/home']);
  }



  // CLOSE NAVBAR MENUS
  private closeMenus(): void {

    this.menuOpen = false;
    this.loginDropdownOpen = false;
  }



  // CART COUNT
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



  // WISHLIST COUNT


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

  // NOTIFICATION COUNT


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

  // REFRESH NAVBAR COUNTS


  refreshNavbarCounts(): void {
    this.updateCartCount();
    this.updateWishlistCount();
    this.updateNotificationCount();
  }



  // CAROUSEL

  moveSlide(direction: number): void {

    this.currentSlide += direction;
    if (this.currentSlide < 0) {
      this.currentSlide = 2;
    }
    if (this.currentSlide > 2) {
      this.currentSlide = 0;
    }
  }


  goToSlide(index: number): void {
    this.currentSlide = index;
  }

}
