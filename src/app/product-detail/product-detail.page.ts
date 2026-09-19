import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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

  /* PRODUCT */

  product: Product | undefined;

  productId = '';


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

  ngOnInit(): void {

    this.route.queryParams.subscribe(params => {

      this.productId =
        params['id'] ?? '';

      this.product =
        CATALOG.find(
          item => item.id === this.productId
        );

    });

    this.loadCart();

    this.refreshNavbarCounts();

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


  /* FORGOT PASSWORD */

  forgotPassword(event?: Event): void {

    event?.preventDefault();

    alert(
      'Password recovery is not available yet.'
    );

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


    if (!product) {

      product = this.product;

    }


    if (!product) {

      return;

    }


    const existingItem =
      this.cartItems.find(
        item =>
          item.id === product!.id
      );


    if (existingItem) {

      existingItem.quantity =
        (Number(existingItem.quantity) || 0) + 1;

    } else {

      this.cartItems.push({

        id: product.id,

        quantity: 1,

        name: product.name,

        price: product.price,

        image: product.image

      });

    }


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

  }


  /* INCREASE CART DRAWER QUANTITY */

  increaseQuantity(
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


    cartItem.quantity =
      (Number(cartItem.quantity) || 0) + 1;


    this.cartItems = [
      ...this.cartItems
    ];


    this.saveCart();

    this.refreshNavbarCounts();

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


    const item =
      this.cartItems.find(
        cartItem =>
          cartItem.id === productId
      );


    if (!item) {

      const product =
        CATALOG.find(
          p =>
            p.id === productId
        );


      if (product) {

        this.addToCart(product);

      }

      return;

    }


    item.quantity =
      (Number(item.quantity) || 0) + 1;


    this.cartItems = [
      ...this.cartItems
    ];


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

        const product =
          CATALOG.find(
            p =>
              p.id === item.id
          );


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
                  item.image

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

        const product =
          CATALOG.find(
            item =>
              item.id === productId
          );


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