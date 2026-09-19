import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';

import {
  Product,
  CartItem,
  CATALOG
} from '../shared/product-data';


/* USER */

interface User {
  name?: string;
  email: string;
  password: string;
}


/* SUBCATEGORIES */

const SUBCATEGORIES: Record<string, string[]> = {

  indoor: [
    'All',
    'Air-Purifying',
    'Low-Light',
    'Large Foliage'
  ],

  outdoor: [
    'All',
    'Ornamental',
    'Herbs & Edible Plants',
    'Garden Shrubs & Small Trees'
  ],

  accessories: [
    'All',
    'Care & Maintenance',
    'Structural Support',
    'Display & Decor'
  ]

};


/* PRODUCT PAGE */

@Component({
  selector: 'app-product',
  templateUrl: './product.page.html',
  styleUrls: ['./product.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class ProductPage implements OnInit {

  /* DATA */

  readonly catalog = CATALOG;

  readonly subcategoryMap = SUBCATEGORIES;


  /* NAVBAR */

  menuOpen = false;

  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  searchBoxOpen = false;

  cartDrawerOpen = false;


  /* CART */

  cartCount = 0;

  cartItems: CartItem[] = [];


  /* WISHLIST */

  wishlistCount = 0;

  private readonly WISHLIST_STORAGE_KEY =
    'botaniqueWishlistItems';


  /* NOTIFICATIONS */

  notificationCount = 0;

  private readonly NOTIFICATION_STORAGE_KEY =
    'botaniqueNotifications';


  /* LOGIN */

  email = '';
  password = '';
  rememberMe = false;


  /* SEARCH */
  searchTerm = '';


  /* CATEGORY */

  currentCategory:
    | 'all'
    | 'indoor'
    | 'outdoor'
    | 'accessories' = 'all';

  currentSubcategory = 'All';


  /* PRODUCT FEEDBACK */

  addedProductId: string | null = null;


  /* CONSTRUCTOR */

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController
  ) {}


  /* INIT */

  ngOnInit(): void {

    this.updateCartState();
    this.loadLoggedInUser();
    this.updateWishlistCount();
    this.updateNotificationCount();

    this.route.queryParamMap.subscribe(params => {

      const category =
        params.get('category');


      if (
        category === 'indoor' ||
        category === 'outdoor' ||
        category === 'accessories'
      ) {

        this.currentCategory =
          category;

      } else {

        this.currentCategory =
          'all';

      }


      this.currentSubcategory =
        'All';

    });

  }


  /* SUBCATEGORIES */

  get subcategories(): string[] {

    if (this.currentCategory === 'all') {
      return [];
    }

    return (
      this.subcategoryMap[
        this.currentCategory
      ] || ['All']
    );

  }


  /* FILTERED PRODUCTS */

  get filteredProducts(): Product[] {

    let products: Product[];


    if (this.currentCategory === 'all') {

      products = [
        ...this.catalog
      ];

    } else {

      products =
        this.catalog.filter(
          product =>
            product.category ===
            this.currentCategory
        );


      if (
        this.currentSubcategory !== 'All'
      ) {

        products =
          products.filter(
            product =>
              product.subcategory ===
              this.currentSubcategory
          );

      }

    }


    const term =
      this.searchTerm
        .trim()
        .toLowerCase();


    if (!term) {
      return products;
    }


    return products.filter(
      product =>
        product.name
          .toLowerCase()
          .includes(term)

        ||

        product.scientific
          .toLowerCase()
          .includes(term)

        ||

        product.subcategory
          .toLowerCase()
          .includes(term)

        ||

        product.category
          .toLowerCase()
          .includes(term)
    );

  }


  /* CATEGORY SELECTION */

  selectCategory(
    category:
      | 'all'
      | 'indoor'
      | 'outdoor'
      | 'accessories'
  ): void {

    this.currentCategory =
      category;

    this.currentSubcategory =
      'All';


    if (category === 'all') {

      this.router.navigate(
        ['/product']
      );

    } else {

      this.router.navigate(
        ['/product'],
        {
          queryParams: {
            category
          }
        }
      );

    }

  }


  selectSubcategory(
    subcategory: string
  ): void {

    this.currentSubcategory =
      subcategory;

  }


  /* SEARCH */

  toggleSearch(): void {

    this.searchBoxOpen =
      !this.searchBoxOpen;


    if (!this.searchBoxOpen) {

      this.searchTerm =
        '';

    }

  }


  search(): void {

    this.searchBoxOpen =
      true;

  }


  onSearch(): void {

    this.searchTerm =
      this.searchTerm.trimStart();

  }


  clearSearch(): void {

    this.searchTerm =
      '';

    this.searchBoxOpen =
      false;

  }


  /* MOBILE MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;


    if (this.menuOpen) {

      this.closeLoginDropdown();

    }

  }


  closeMenu(): void {

    this.menuOpen =
      false;

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


  closeLoginDropdown(): void {

    this.loginDropdownOpen =
      false;

  }


  /* NAVIGATION */

  goHome(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/home'
    ]);

  }


  goToAbout(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/about'
    ]);

  }


  goToProduct(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();


    this.currentCategory =
      'all';

    this.currentSubcategory =
      'All';


    this.router.navigate([
      '/product'
    ]);

  }


  goToServices(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/services'
    ]);

  }


  goToDevelopers(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/developers'
    ]);

  }


  goToContact(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/contact'
    ]);

  }


  goToSignup(event?: Event): void {

    event?.preventDefault();

    this.closeOverlays();

    this.router.navigate([
      '/signup'
    ]);

  }


  /* CATEGORY NAVIGATION */

  goToProductCategory(
    category:
      | 'indoor'
      | 'outdoor'
      | 'accessories',
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeOverlays();


    this.router.navigate(
      ['/product'],
      {
        queryParams: {
          category
        }
      }
    );

  }


  /* PRODUCT DETAIL */

  openProductDetail(
    id: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.closeOverlays();


    this.router.navigate(
      ['/product-detail'],
      {
        queryParams: {
          id
        }
      }
    );

  }


  /* GET PRODUCT */

  getProduct(
    id: string
  ): Product | undefined {

    return this.catalog.find(
      product =>
        product.id === id
    );

  }


  /* FORMAT PRICE */

  formatPrice(
    value: number
  ): string {

    return `₱${Number(value).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;

  }


  /*
   * Cart-specific price formatter.
   *
   * Your HTML uses:
   * formatCartPrice(...)
   */

  formatCartPrice(
    value: number
  ): string {

    return `₱${Number(value || 0).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;

  }


  /* TRACK PRODUCT */

  trackByProductId(
    _index: number,
    product: Product
  ): string {

    return product.id;

  }


  /* TRACK CART */

  trackByCartId(
    _index: number,
    item: CartItem
  ): string {

    return String(item.id);

  }


  /* CART QUANTITY */

  getCartQuantity(
    productId: string
  ): number {

    const item =
      this.cartItems.find(
        cartItem =>
          String(cartItem.id) ===
          String(productId)
      );


    if (!item) {
      return 0;
    }


    const quantity =
      Number(item.quantity);


    return Number.isFinite(quantity)
      ? Math.max(0, quantity)
      : 0;

  }


  /* CART TOTAL */

  get cartSubtotal(): number {

    return this.cartItems.reduce(
      (total, item) => {

        const product =
          this.getProduct(
            String(item.id)
          );

        const price =
          Number(item.price) ||
          Number(product?.price) ||
          0;


        const quantity =
          Number(item.quantity) || 0;


        return total +
          price * quantity;

      },
      0
    );

  }


  /* OPEN CART */

  openCart(): void {

    this.closeMenu();

    this.closeLoginDropdown();

    this.updateCartState();

    this.cartDrawerOpen =
      true;

  }


  openCartDrawer(): void {

    this.openCart();

  }


  goToCart(event?: Event): void {

    event?.preventDefault();

    event?.stopPropagation();

    this.openCart();

  }


  /* CLOSE CART */

  closeCartDrawer(): void {

    this.cartDrawerOpen =
      false;

  }


  closeCart(): void {

    this.closeCartDrawer();

  }


  /* ADD TO CART */

  addToCart(
    id: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    const product =
      this.getProduct(id);


    if (!product) {

      console.error(
        'Product not found:',
        id
      );

      return;

    }


    const existingItem =
      this.cartItems.find(
        item =>
          String(item.id) ===
          String(id)
      );


    if (existingItem) {

      existingItem.quantity =
        Number(
          existingItem.quantity || 0
        ) + 1;

    } else {

      this.cartItems.push({

        id: product.id,

        name: product.name,

        price: product.price,

        image: product.image,

        quantity: 1

      });

    }


    this.saveCartItems();


    this.addedProductId =
      id;

    this.openCart();


    window.setTimeout(() => {

      if (
        this.addedProductId === id
      ) {

        this.addedProductId =
          null;

      }

    }, 1200);

  }


  /* INCREASE PRODUCT QUANTITY */

  increaseProductQuantity(
    id: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    const item =
      this.cartItems.find(
        cartItem =>
          String(cartItem.id) ===
          String(id)
      );


    if (!item) {

      this.addToCart(id);

      return;

    }


    item.quantity =
      Number(
        item.quantity || 0
      ) + 1;


    this.saveCartItems();

  }


  /* DECREASE PRODUCT QUANTITY */

  decreaseProductQuantity(
    id: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    const item =
      this.cartItems.find(
        cartItem =>
          String(cartItem.id) ===
          String(id)
      );


    if (!item) {
      return;
    }


    item.quantity =
      Number(
        item.quantity || 0
      ) - 1;


    if (item.quantity <= 0) {

      this.removeFromCart(
        String(id)
      );

      return;

    }


    this.saveCartItems();

  }


  /* CART DRAWER QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    this.increaseProductQuantity(
      String(item.id)
    );

  }


  decreaseQuantity(
    item: CartItem
  ): void {

    this.decreaseProductQuantity(
      String(item.id)
    );

  }


  /* REMOVE FROM CART */

  removeFromCart(
    itemOrId: CartItem | string
  ): void {


    const id =
      typeof itemOrId === 'string'
        ? itemOrId
        : String(itemOrId.id);


    this.cartItems =
      this.cartItems.filter(
        item =>
          String(item.id) !== id
      );


    this.saveCartItems();

  }


  /* CHANGE CART QUANTITY */

  changeCartQty(
    id: string,
    delta: number
  ): void {

    const item =
      this.cartItems.find(
        cartItem =>
          String(cartItem.id) ===
          String(id)
      );


    if (!item) {
      return;
    }


    item.quantity =
      Number(
        item.quantity || 0
      ) + delta;


    if (item.quantity <= 0) {

      this.removeFromCart(id);

      return;

    }


    this.saveCartItems();

  }


  /* LOAD CART */

  private updateCartState(): void {

    try {

      const storedCart =
        localStorage.getItem(
          'botaniqueCartItems'
        );


      const cart =
        storedCart
          ? JSON.parse(storedCart)
          : [];


      if (!Array.isArray(cart)) {

        this.cartItems = [];

        this.cartCount = 0;

        return;

      }


      this.cartItems =
        cart
          .filter(
            (item: any) =>
              item &&
              item.id !== undefined &&
              Number(item.quantity) > 0
          )
          .map(
            (item: any): CartItem => ({

              id: String(item.id),

              quantity:
                Number(item.quantity) || 1,

              name:
                item.name ||
                this.getProduct(
                  String(item.id)
                )?.name,

              price:
                Number(item.price) ||
                this.getProduct(
                  String(item.id)
                )?.price,

              image:
                item.image ||
                this.getProduct(
                  String(item.id)
                )?.image

            })
          );


      this.updateCartCount();

    } catch {

      this.cartItems = [];

      this.cartCount = 0;

    }

  }


  /* SAVE CART */

  private saveCartItems(): void {

    this.cartItems =
      this.cartItems.filter(
        item =>
          item &&
          item.id !== undefined &&
          Number(item.quantity) > 0
      );


    localStorage.setItem(
      'botaniqueCartItems',
      JSON.stringify(
        this.cartItems
      )
    );


    this.updateCartCount();

  }


  /* CART COUNT */

  private updateCartCount(): void {

    this.cartCount =
      this.cartItems.reduce(
        (sum, item) =>
          sum +
          (
            Number(item.quantity) || 0
          ),
        0
      );

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
        JSON.parse(stored);


      return (
        Array.isArray(wishlist) &&
        wishlist.some(
          (item: any) =>
            String(item?.id) ===
            String(productId)
        )
      );

    } catch {

      return false;

    }

  }


  toggleWishlist(
    productId: string,
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    try {

      const stored =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      let wishlist: any[] = [];


      if (stored) {

        const parsed =
          JSON.parse(stored);


        if (Array.isArray(parsed)) {

          wishlist =
            parsed;

        }

      }


      const index =
        wishlist.findIndex(
          item =>
            String(item?.id) ===
            String(productId)
        );


      if (index !== -1) {

        wishlist.splice(
          index,
          1
        );

      } else {

        const product =
          this.getProduct(productId);


        if (!product) {
          return;
        }


        wishlist.push({

          id: product.id,

          name: product.name,

          price: product.price,

          image: product.image,

          category: product.category,

          subcategory:
            product.subcategory

        });

      }


      localStorage.setItem(
        this.WISHLIST_STORAGE_KEY,
        JSON.stringify(wishlist)
      );


      this.updateWishlistCount();

    } catch (error) {

      console.error(
        'Unable to update wishlist:',
        error
      );

    }

  }


  private updateWishlistCount(): void {

    try {

      const stored =
        localStorage.getItem(
          this.WISHLIST_STORAGE_KEY
        );


      if (!stored) {

        this.wishlistCount =
          0;

        return;

      }


      const wishlist =
        JSON.parse(stored);


      this.wishlistCount =
        Array.isArray(wishlist)
          ? wishlist.length
          : 0;

    } catch {

      this.wishlistCount =
        0;

    }

  }


  /* WISHLIST PAGE */

  goToWishlist(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeOverlays();


    this.router.navigate([
      '/wishlist'
    ]);

  }


  /* NOTIFICATIONS */

  private updateNotificationCount(): void {

    try {

      const stored =
        localStorage.getItem(
          this.NOTIFICATION_STORAGE_KEY
        );


      if (!stored) {

        this.notificationCount =
          0;

        return;

      }


      const notifications =
        JSON.parse(stored);


      if (Array.isArray(notifications)) {

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

        this.notificationCount =
          0;

      }

    } catch {

      this.notificationCount =
        0;

    }

  }


  goToNotifications(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeOverlays();


    this.router.navigate([
      '/notifications'
    ]);

  }


  /* LOAD LOGGED-IN USER */

  private loadLoggedInUser(): void {

    try {

      const storedUser =
        localStorage.getItem(
          'botaniqueUser'
        );


      if (!storedUser) {
        return;
      }


      const user =
        JSON.parse(
          storedUser
        );


      if (user?.email) {

        this.email =
          user.email;

      }

    } catch {

    }

  }


  /* LOGIN */

  async login(
    form?: NgForm
  ): Promise<void> {

    if (
      form &&
      form.invalid
    ) {

      await this.showAlert(
        'Login Required',
        'Please enter your email address and password.'
      );

      return;

    }


    if (
      !this.email.trim() ||
      !this.password.trim()
    ) {

      await this.showAlert(
        'Login Required',
        'Please enter your email address and password.'
      );

      return;

    }


    let users: User[] = [];


    try {

      users =
        JSON.parse(
          localStorage.getItem(
            'botaniqueUsers'
          ) || '[]'
        );

    } catch {

      users = [];

    }


    const user =
      users.find(
        item =>
          item.email.toLowerCase() ===
            this.email.toLowerCase()
          &&
          item.password ===
            this.password
      );


    if (!user) {

      await this.showAlert(
        'Login Failed',
        'Incorrect email or password.'
      );

      return;

    }


    localStorage.setItem(
      'botaniqueUser',
      JSON.stringify(user)
    );


    if (this.rememberMe) {

      localStorage.setItem(
        'botaniqueRememberMe',
        'true'
      );

    } else {

      localStorage.removeItem(
        'botaniqueRememberMe'
      );

    }


    this.closeLoginDropdown();

    this.password = '';


    await this.showAlert(
      'Welcome Back',
      `Welcome back, ${user.name || user.email}!`
    );

  }


  /* FORGOT PASSWORD */

  async forgotPassword(
    event?: Event
  ): Promise<void> {

    event?.preventDefault();


    await this.showAlert(
      'Forgot Password',
      'Please contact Botanique support to reset your password.'
    );

  }


  /* CONTINUE AS GUEST */

  continueAsGuest(): void {

    this.closeLoginDropdown();


    this.router.navigate([
      '/home'
    ]);

  }


  /* CHECKOUT */

  goToCheckout(
    event?: Event
  ): void {

    event?.preventDefault();


    if (
      this.cartItems.length === 0
    ) {

      this.showAlert(
        'Empty Cart',
        'Your shopping bag is empty.'
      );

      return;

    }


    this.closeCartDrawer();


    this.router.navigate([
      '/checkout'
    ]);

  }


  checkout(
    event?: Event
  ): void {

    this.goToCheckout(
      event
    );

  }

  continueShopping(
    event?: Event
  ): void {

    event?.preventDefault();

    event?.stopPropagation();


    this.closeCartDrawer();


    this.router.navigate([
      '/product'
    ]);

  }


  /* CLOSE OVERLAYS */

  private closeOverlays(): void {

    this.closeMenu();

    this.closeLoginDropdown();

    this.closeCartDrawer();

  }


  /* ALERT */

  private async showAlert(
    header: string,
    message: string
  ): Promise<void> {

    const alert =
      await this.alertController.create({

        header,

        message,

        buttons: [
          'OK'
        ]

      });


    await alert.present();

  }

}