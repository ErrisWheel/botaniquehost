import { environment } from '../../environments/environment';
/* CONTACT PAGE */

import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';

import { CommonModule } from '@angular/common';

import { FormsModule, NgForm } from '@angular/forms';

import { Router } from '@angular/router';

/* CONTACT MODEL */

interface ContactForm {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

/* CART ITEM MODEL */

interface CartItem {
  id: string | number;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

/* USER MODEL */

interface UserAccount {
  fullName?: string;
  name?: string;
  email: string;
  password?: string;
}

/* CONTACT PAGE COMPONENT */

@Component({
  selector: 'app-contact',
  templateUrl: './contact.page.html',
  styleUrls: ['./contact.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ContactPage implements OnInit {
  private readonly authService = inject(AuthService);

  /* NAVBAR */

  menuOpen: boolean = false;
  loginDropdownOpen: boolean = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }
  email: string = '';
  password: string = '';
  rememberMe: boolean = false;

  /* NAVBAR COUNTS */

  wishlistCount: number = 0;
  notificationCount: number = 0;
  cartCount: number = 0;

  /* CART DRAWER */

  cartDrawerOpen: boolean = false;
  cartItems: CartItem[] = [];
  cartSubtotal: number = 0;

  /* CONTACT FORM */

  contact: ContactForm = {
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  };

  /* STORAGE KEYS */

  private readonly CART_KEY = 'botaniqueCartItems';

  private readonly WISHLIST_KEY = 'botaniqueWishlistItems';

  private readonly NOTIFICATION_COUNT_KEY = 'botaniqueNotificationCount';

  private readonly CURRENT_USER_KEY = 'botaniqueUser';

  private readonly NOTIFICATIONS_KEY = 'botaniqueNotifications';

  /* CONSTRUCTOR */

  constructor(private router: Router) {}

  /* ON INIT */

  ngOnInit(): void {
    this.loadCart();
    this.loadWishlistCount();
    this.loadNotificationCount();
    this.loadCurrentUser();
    this.updateCartTotals();
  }

  /* NAVBAR */

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  /* CLOSE MOBILE MENU */

  closeMenu(): void {
    this.menuOpen = false;
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

  /* HOME */

  goHome(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/home']);
  }

  /* ABOUT */

  goToAbout(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/about']);
  }

  /* PRODUCT */

  goToProduct(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/product']);
  }

  /* PRODUCT CATEGORY */

  goToProductCategory(category: string, event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/product'], {
      queryParams: {
        category: category,
      },
    });
  }

  /* DEVELOPERS */

  goToDevelopers(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/developers']);
  }

  /* CONTACT */

  goToContact(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.router.navigate(['/contact']);
  }

  readonly storeAddress =
    'Botanique Studio, 938 Aurora Boulevard, Cubao, Quezon City';
  readonly directionsUrl =
    'https://www.google.com/maps/dir/?api=1&destination=938+Aurora+Boulevard,+Cubao,+Quezon+City';
  readonly googleMapsUrl =
    'https://www.google.com/maps/search/?api=1&query=938+Aurora+Boulevard,+Cubao,+Quezon+City';

  openDirections(): void {
    window.open(this.directionsUrl, '_blank', 'noopener,noreferrer');
  }

  openGoogleMaps(): void {
    window.open(this.googleMapsUrl, '_blank', 'noopener,noreferrer');
  }

  async copyAddress(): Promise<void> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(this.storeAddress);
      } else {
        const helper = document.createElement('textarea');
        helper.value = this.storeAddress;
        helper.setAttribute('readonly', 'true');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        document.body.removeChild(helper);
      }

      window.alert('Store address copied to clipboard.');
    } catch (error) {
      console.error('Unable to copy address:', error);
      window.alert(
        'Unable to copy the address automatically. Please copy it manually.',
      );
    }
  }

  /* WISHLIST */

  goToWishlist(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/wishlist']);
  }

  /* NOTIFICATIONS */

  goToNotifications(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.cartDrawerOpen = false;
    this.router.navigate(['/notifications']);
  }

  /* CART */

  goToCart(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    this.loginDropdownOpen = false;
    this.loadCart();
    this.cartDrawerOpen = true;
  }

  /* CLOSE CART */

  closeCart(): void {
    this.cartDrawerOpen = false;
  }

  /* CONTINUE SHOPPING */

  continueShopping(event?: Event): void {
    event?.preventDefault();
    this.cartDrawerOpen = false;
    this.router.navigate(['/product']);
  }

  /* CART - LOAD */

  private loadCart(): void {
    try {
      const storedCart = localStorage.getItem(this.CART_KEY);

      if (!storedCart) {
        this.cartItems = [];
        this.updateCartTotals();
        return;
      }

      const parsedCart = JSON.parse(storedCart);

      if (Array.isArray(parsedCart)) {
        this.cartItems = parsedCart
          .map(
            (item: any): CartItem => ({
              id: item.id,

              name: item.name || 'Plant',

              price: Number(item.price) || 0,

              image: item.image || '',

              quantity: Math.max(1, Number(item.quantity) || 1),
            }),
          )
          .filter(
            (item: CartItem) => item.id !== undefined && item.id !== null,
          );
      } else {
        this.cartItems = [];
      }
    } catch (error) {
      console.error('Unable to load cart:', error);

      this.cartItems = [];
    }

    this.updateCartTotals();
  }

  /* CART - SAVE */

  private saveCart(): void {
    try {
      localStorage.setItem(this.CART_KEY, JSON.stringify(this.cartItems));
    } catch (error) {
      console.error('Unable to save cart:', error);
    }
  }

  /* CART - UPDATE TOTALS */

  private updateCartTotals(): void {
    this.cartCount = this.cartItems.reduce((total: number, item: CartItem) => {
      return total + Math.max(0, Number(item.quantity) || 0);
    }, 0);

    this.cartSubtotal = this.cartItems.reduce(
      (total: number, item: CartItem) => {
        const price = Number(item.price) || 0;

        const quantity = Math.max(0, Number(item.quantity) || 0);

        return total + price * quantity;
      },
      0,
    );
  }

  /* CART - INCREASE QUANTITY */

  increaseQuantity(item: CartItem): void {
    const existingItem = this.cartItems.find(
      (cartItem: CartItem) => String(cartItem.id) === String(item.id),
    );

    if (!existingItem) {
      return;
    }

    existingItem.quantity = Math.max(1, Number(existingItem.quantity) || 1) + 1;

    this.saveCart();

    this.updateCartTotals();
  }

  /* CART - DECREASE QUANTITY */

  decreaseQuantity(item: CartItem): void {
    const existingItem = this.cartItems.find(
      (cartItem: CartItem) => String(cartItem.id) === String(item.id),
    );

    if (!existingItem) {
      return;
    }

    if (Number(existingItem.quantity) > 1) {
      existingItem.quantity--;
    } else {
      this.cartItems = this.cartItems.filter(
        (cartItem: CartItem) => String(cartItem.id) !== String(item.id),
      );
    }

    this.saveCart();
    this.updateCartTotals();
  }

  removeFromCart(itemId: string | number): void {
    this.cartItems = this.cartItems.filter(
      (cartItem: CartItem) => String(cartItem.id) !== String(itemId),
    );

    this.saveCart();
    this.updateCartTotals();
  }

  /* CART - FORMAT PRICE */

  formatCartPrice(price: number): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(price) || 0);
  }

  /* CHECKOUT */

  checkout(event?: Event): void {
    event?.preventDefault();

    this.loadCart();

    if (this.cartItems.length === 0) {
      alert('Your cart is empty. Please add a product before checking out.');

      return;
    }

    this.cartDrawerOpen = false;

    this.router.navigate(['/checkout']);
  }

  /* WISHLIST COUNT */

  private loadWishlistCount(): void {
    try {
      const storedWishlist = localStorage.getItem(this.WISHLIST_KEY);

      if (!storedWishlist) {
        this.wishlistCount = 0;

        return;
      }

      const wishlist = JSON.parse(storedWishlist);

      if (Array.isArray(wishlist)) {
        this.wishlistCount = wishlist.length;
      } else {
        this.wishlistCount = 0;
      }
    } catch (error) {
      console.error('Unable to load wishlist:', error);

      this.wishlistCount = 0;
    }
  }

  /* NOTIFICATION COUNT */

  private loadNotificationCount(): void {
    try {
      const storedCount = localStorage.getItem(this.NOTIFICATION_COUNT_KEY);

      if (storedCount !== null) {
        const count = Number(storedCount);

        this.notificationCount = Number.isFinite(count)
          ? Math.max(0, count)
          : 0;

        return;
      }

      const storedNotifications = localStorage.getItem(this.NOTIFICATIONS_KEY);

      if (!storedNotifications) {
        this.notificationCount = 0;

        return;
      }

      const notifications = JSON.parse(storedNotifications);

      if (Array.isArray(notifications)) {
        this.notificationCount = notifications.filter(
          (notification: any) => !notification.read,
        ).length;
      } else {
        this.notificationCount = 0;
      }
    } catch (error) {
      console.error('Unable to load notification count:', error);

      this.notificationCount = 0;
    }
  }

  /* LOAD CURRENT USER */

  private loadCurrentUser(): void {
    try {
      const storedUser = localStorage.getItem(this.CURRENT_USER_KEY);

      if (!storedUser) {
        return;
      }

      const user = JSON.parse(storedUser);

      if (!user) {
        return;
      }

      if (!this.contact.email && user.email) {
        this.contact.email = user.email;
      }

      if (!this.contact.name && (user.fullName || user.name)) {
        this.contact.name = user.fullName || user.name;
      }
    } catch (error) {
      console.error('Unable to load current user:', error);
    }
  }

  /* LOGIN */

  async login(): Promise<void> {
    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password.trim()) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const user = await this.authService.login(
        loginEmail,
        this.password,
        true,
      );

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

  async forgotPassword(event?: Event): Promise<void> {
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
        'If an account exists for that email address, a password reset link has been sent.',
      );
    } catch (error: any) {
      alert(
        error?.message || 'Unable to send the reset email. Please try again.',
      );
    }
  }

  /* CONTINUE AS GUEST */

  continueAsGuest(): void {
    this.loginDropdownOpen = false;

    this.email = '';

    this.password = '';

    this.rememberMe = false;

    alert('You are continuing as a guest.');
  }

  /* SIGN UP */

  goToSignup(event?: Event): void {
    event?.preventDefault();

    this.loginDropdownOpen = false;

    this.closeMenu();

    this.cartDrawerOpen = false;

    this.router.navigate(['/signup']);
  }

  /* CONTACT FORM SUBMIT */

  submitContactForm(form: NgForm): void {
    if (!form || form.invalid) {
      form?.control.markAllAsTouched();

      alert('Please complete all required fields before sending your message.');

      return;
    }

    const name = this.contact.name.trim();

    const email = this.contact.email.trim();

    const phone = this.contact.phone.trim();

    const subject = this.contact.subject;

    const message = this.contact.message.trim();

    if (!name || !email || !subject || !message) {
      alert('Please complete all required fields.');

      return;
    }

    const submission = {
      id: Date.now(),
      name,
      email,
      phone,
      subject,
      message,
      createdAt: new Date().toISOString(),
    };

    try {
      const storageKey = 'botaniqueContactMessages';

      const storedMessages = localStorage.getItem(storageKey);

      let messages: any[] = storedMessages ? JSON.parse(storedMessages) : [];

      if (!Array.isArray(messages)) {
        messages = [];
      }

      messages.push(submission);

      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.error('Unable to save contact message:', error);
    }

    this.addContactNotification();

    alert(
      'Thank you for contacting Botanique! We received your message and will get back to you within 24 hours.',
    );

    this.contact = {
      name: '',
      email: this.getCurrentUserEmail(),
      phone: '',
      subject: '',
      message: '',
    };

    form.resetForm(this.contact);
  }

  /* GET CURRENT USER EMAIL */

  private getCurrentUserEmail(): string {
    try {
      const storedUser = localStorage.getItem(this.CURRENT_USER_KEY);

      if (!storedUser) {
        return '';
      }

      const user = JSON.parse(storedUser);

      return user?.email || '';
    } catch {
      return '';
    }
  }

  /* CONTACT NOTIFICATION */

  private addContactNotification(): void {
    try {
      const storageKey = this.NOTIFICATIONS_KEY;

      const stored = localStorage.getItem(storageKey);

      let notifications: any[] = stored ? JSON.parse(stored) : [];

      if (!Array.isArray(notifications)) {
        notifications = [];
      }

      notifications.unshift({
        id: Date.now(),

        type: 'system',

        title: 'Message Sent Successfully',

        message:
          'Your message has been received. Our Botanique team will get back to you within 24 hours.',

        time: 'Just now',

        read: false,
      });

      localStorage.setItem(storageKey, JSON.stringify(notifications));

      this.notificationCount = notifications.filter(
        (notification: any) => !notification.read,
      ).length;

      localStorage.setItem(
        this.NOTIFICATION_COUNT_KEY,
        String(this.notificationCount),
      );
    } catch (error) {
      console.error('Unable to create notification:', error);
    }
  }

  /* REFRESH STORAGE DATA */

  refreshPageData(): void {
    this.loadCart();

    this.loadWishlistCount();

    this.loadNotificationCount();

    this.updateCartTotals();
  }

  /* BROWSER STORAGE EVENT */

  onStorageChange(event: StorageEvent): void {
    if (
      event.key === this.CART_KEY ||
      event.key === this.WISHLIST_KEY ||
      event.key === this.NOTIFICATION_COUNT_KEY ||
      event.key === this.NOTIFICATIONS_KEY
    ) {
      this.refreshPageData();
    }
  }

  useMyLocation(): void {
    if (!navigator.geolocation) {
      window.alert('Geolocation is not supported on this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const destination = '938+Aurora+Boulevard,+Cubao,+Quezon+City';
        const url = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destination}`;

        window.open(url, '_blank', 'noopener,noreferrer');
      },
      () => {
        window.alert(
          'Please allow location access so we can route from your current location.',
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }
}
