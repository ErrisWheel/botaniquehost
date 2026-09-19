import { environment } from '../../environments/environment';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface Developer {
  name: string;
  birth: string;
  age: string;
  gender: string;
  nationality: string;
  address: string;
  number: string;
  email: string;
  occupation: string;
  role: string;
  education: string;
  image: string;
  shortDescription: string;
  description: string;
  skills?: string[];
}

interface CartItem {
  id: string;
  quantity: number;
  name?: string;
  price?: number;
  image?: string;
}

@Component({
  selector: 'app-developers',
  templateUrl: './developers.page.html',
  styleUrls: ['./developers.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class DevelopersPage implements OnInit {

  // NAVIGATION

  menuOpen = false;
  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }
  cartCount = 0;
  wishlistCount = 0;
  notificationCount = 0;


  // LOGIN

  email = '';
  password = '';
  rememberMe = false;


  // CART

  cartDrawerOpen = false;
  cartItems: CartItem[] = [];
  private readonly CART_STORAGE_KEY = 'botaniqueCartItems';


  // DEVELOPER MODAL

  selectedDeveloper: Developer | null = null;


  // DEVELOPERS

  developers: Developer[] = [

    // DEVELOPER 1

    {
      name: 'Del Rosario, Erris Joshua',

      role: 'Lead Backend Developer',

      birth: '6 Jul 2005',

      age: '21',

      gender: 'Male',

      nationality: 'Filipino',

      address:
        'Kasiyahan St., Holy Spirit, Quezon City',

      number:
        '09915807183',

      email:
        'qjeadelrosario@tip.edu.ph',

      occupation:
        'Student / Developer',

      education:
        'BS Information Technology (Undergraduate) | Technological Institute of the Philippines',

      image: 'https://drive.google.com/thumbnail?id=1NEY7jtVhce-5dnDw4Uy2O3wi_UNHmNCL&sz=w1200',

      shortDescription:
        'Responsible for the overall development of Database',

      description:
        'Focuses on data and backend systems to keep everything running smoothly and efficiently.',

      skills: [
        'Technical Data Fluency',
        'Backend Engineering',
        'Performance Optimization'
      ]
    },


    // DEVELOPER 2

    {
      name: 'De Vera, Lisa Leslie',

      role: 'Lead Front-End Developer (Mobile)',

      birth: '18 Jul 2005',

      age: '21',

      gender: 'Female',

      nationality: 'Filipino',

      address:
        'Sta. Elena, Marikina City',

      number:
        '09696091041',

      email:
        'qllsdevera@tip.edu.ph',

      occupation:
        'Student',

      education:
        'BS Information Technology (Undergraduate) | Technological Institute of the Philippines',

      image: 'https://drive.google.com/thumbnail?id=1Q12zzi5SDuccI_bIDoKGzLbCzkLRUqzI&sz=w1200',

      shortDescription:
        'Responsible for the overall development of Botanique Mobile Application.',

      description:
        'Developed, tested, and enhanced mobile application features.',

      skills: [
        'Software Development',
        'Backend Management',
        'Debugging & Troubleshooting',
        'Application Functionality Integration'
      ]
    },


    // DEVELOPER 3

    {
      name: 'Destor, Christine Joy',

      role: 'Lead Front-End Developer (Web)',

      birth: '19 Jun 2006',

      age: '19',

      gender: 'Female',

      nationality: 'Filipino',

      address:
        'Novaliches, Quezon City',

      number:
        '09323840438',

      email:
        'qcjpdestor@tip.edu.ph',

      occupation:
        'Student',

      education:
        'BS Information Technology (Undergraduate) | Technological Institute of the Philippines',

      image: 'https://drive.google.com/thumbnail?id=1bEmx2utYtWR0eNne5KireN5HpmWFvifs&sz=w1200',
      shortDescription:
        'Responsible for the overall development of Botanique Web Application.',

      description:
        'Designs and builds clean, user-friendly websites that work well on any device.',

      skills: [
        'Frontend Development',
        'UI/UX Design',
        'Responsive Web Design',
        'Prototyping & Wireframing'
      ]
    },


    // DEVELOPER 4

    {
      name: 'Marzol, Kristelle Anne',

      role: 'Lead Front-End Developer (Web)',

      birth: '03 Dec 2005',

      age: '20',

      gender: 'Female',

      nationality: 'Filipino',

      address:
        'Cainta, Rizal',

      number:
        '09187843707',

      email:
        'qkabmarzol@tip.edu.ph',

      occupation:
        'Student',

      education:
        'BS Information Technology (Undergraduate) | Technological Institute of the Philippines',

      image:
        'https://drive.google.com/thumbnail?id=1e5zwNcBP9fr2xH7FyROekVQFVZpUOmuh&sz=w1200',

      shortDescription:
        'Responsible for the overall development of Web Application.',

      description:
        'Helps build and test the system while making sure everything is accurate and works properly.',

      skills: [
        'Frontend Development',
        'Software Testing',
        'Attention to Detail'
      ]
    },


    // DEVELOPER 5

    {
      name: 'Roxas, Ardee',

      role: 'Researcher',

      birth: '17 Sep 2006',

      age: '19',

      gender: 'Male',

      nationality: 'Filipino',

      address:
        'Spring Valley Penafrancia Cupang, Antipolo City',

      number:
        '09151429815',

      email:
        'qaproxas@tip.edu.ph',

      occupation:
        'Student',

      education:
        'BS Information Technology (Undergraduate) | Technological Institute of the Philippines',

      image: 'https://drive.google.com/thumbnail?id=1QTM3-OkxeTMl6MF1yiP6kHoadmqvGpUT&sz=w1200',

      shortDescription:
        'Responsible for the checking the development of Botanique.',

      description:
        'Works on the user side of the system while testing and researching ways to improve it.',

      skills: [
        'Front-End Programming',
        'System Evaluation & Testing',
        'Information & Business Research'
      ]
    }

  ];


  // CONSTRUCTOR

  constructor(
    private router: Router
  ) { }


  // INITIALIZATION

  ngOnInit(): void {
    this.loadCart();
    this.loadNavbarCounts();
  }


  // NAVBAR COUNTS

  loadNavbarCounts(): void {
    this.loadCartCount();
    this.loadWishlistCount();
    this.loadNotificationCount();
  }


  // LOAD CART

  loadCart(): void {

    try {

      const savedCart =
        localStorage.getItem(
          this.CART_STORAGE_KEY
        );

      if (!savedCart) {

        this.cartItems = [];

        this.updateCartCount();

        return;
      }

      const parsedCart =
        JSON.parse(savedCart);

      if (Array.isArray(parsedCart)) {

        this.cartItems =
          parsedCart.filter(
            (item: any) =>
              item &&
              typeof item.id === 'string'
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

    this.updateCartCount();
  }


  // SAVE CART

  saveCart(): void {

    try {

      localStorage.setItem(
        this.CART_STORAGE_KEY,
        JSON.stringify(this.cartItems)
      );

    } catch (error) {

      console.error(
        'Unable to save cart:',
        error
      );
    }

    this.updateCartCount();
  }


  // UPDATE CART COUNT

  updateCartCount(): void {

    this.cartCount =
      this.cartItems.reduce(
        (total, item) =>
          total +
          (Number(item.quantity) || 0),
        0
      );
  }


  // OPEN CART

  goToCart(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.loadCart();

    this.cartDrawerOpen = true;
  }


  // CLOSE CART

  closeCart(): void {
    this.cartDrawerOpen = false;
  }


  increaseQuantity(item: CartItem): void {

    if (!item) {
      return;
    }

    item.quantity =
      (Number(item.quantity) || 0) + 1;

    this.saveCart();
  }


  decreaseQuantity(item: CartItem): void {

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

    this.saveCart();
  }

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

        return total +
          (price * quantity);

      },
      0
    );
  }


  // FORMAT CART PRICE

  formatCartPrice(
    price: number
  ): string {

    return `₱${Number(price || 0).toLocaleString('en-PH')}`;
  }


  // CONTINUE SHOPPING

  continueShopping(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeCart();

    this.router.navigate([
      '/product'
    ]);
  }


  // CHECKOUT

  checkout(
    event?: Event
  ): void {

    event?.preventDefault();

    if (this.cartItems.length === 0) {

      alert(
        'Your cart is empty.'
      );

      return;
    }

    this.closeCart();

    this.router.navigate([
      '/checkout'
    ]);
  }


  // CART COUNT FROM STORAGE

  loadCartCount(): void {

    try {

      const savedCart =
        localStorage.getItem(
          this.CART_STORAGE_KEY
        );

      if (!savedCart) {

        this.cartCount = 0;

        return;
      }

      const parsedCart =
        JSON.parse(savedCart);

      if (!Array.isArray(parsedCart)) {

        this.cartCount = 0;

        return;
      }

      this.cartCount =
        parsedCart.reduce(
          (
            total: number,
            item: CartItem
          ) =>
            total +
            (Number(item.quantity) || 0),
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

  loadWishlistCount(): void {

    try {

      const savedWishlist =
        localStorage.getItem(
          'botaniqueWishlistItems'
        );

      if (!savedWishlist) {

        this.wishlistCount = 0;

        return;
      }

      const wishlistItems =
        JSON.parse(
          savedWishlist
        );

      if (Array.isArray(wishlistItems)) {

        this.wishlistCount =
          wishlistItems.length;

      } else {

        this.wishlistCount = 0;
      }

    } catch (error) {

      console.error(
        'Unable to load wishlist count:',
        error
      );

      this.wishlistCount = 0;
    }
  }


  // NOTIFICATION COUNT

  loadNotificationCount(): void {

    try {

      const savedNotifications =
        localStorage.getItem(
          'botaniqueNotifications'
        );

      if (!savedNotifications) {

        this.notificationCount = 0;

        return;
      }

      const notifications =
        JSON.parse(
          savedNotifications
        );

      if (Array.isArray(notifications)) {

        /*
         * Count only unread notifications
         * when read/isRead is available.
         */

        this.notificationCount =
          notifications.filter(
            (notification: any) => {

              if (
                typeof notification !== 'object' ||
                notification === null
              ) {
                return true;
              }

              if (
                'read' in notification
              ) {
                return !notification.read;
              }

              if (
                'isRead' in notification
              ) {
                return !notification.isRead;
              }

              return true;
            }
          ).length;

      } else if (
        typeof notifications === 'number'
      ) {

        this.notificationCount =
          notifications;

      } else {

        this.notificationCount = 0;
      }

    } catch (error) {

      console.error(
        'Unable to load notification count:',
        error
      );

      this.notificationCount = 0;
    }
  }


  // HOME

  goHome(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/home'
    ]);
  }


  // MOBILE MENU

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


  // CLOSE MENUS

  closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen = false;
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


  // ABOUT

  stayOnAbout(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/about'
    ]);
  }


  goToAbout(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/about'
    ]);
  }


  // PRODUCT

  goToProduct(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/product'
    ]);
  }


  // DEVELOPERS

  goToDevelopers(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    if (
      this.router.url === '/developers' ||
      this.router.url.startsWith('/developers?')
    ) {

      this.scrollToDevelopers();

      return;
    }

    this.router.navigate([
      '/developers'
    ]);
  }


  // SCROLL TO DEVELOPERS

  scrollToDevelopers(
    event?: Event
  ): void {

    event?.preventDefault();

    const section =
      document.getElementById(
        'developerProfiles'
      );

    const container =
      document.querySelector(
        '.developers-scroll'
      ) as HTMLElement | null;

    if (!section) {
      return;
    }

    if (container) {

      const containerRect =
        container.getBoundingClientRect();

      const sectionRect =
        section.getBoundingClientRect();

      const top =
        container.scrollTop +
        (
          sectionRect.top -
          containerRect.top
        ) -
        20;

      container.scrollTo({

        top,

        behavior: 'smooth'

      });

    } else {

      section.scrollIntoView({

        behavior: 'smooth',

        block: 'start'

      });
    }

    this.menuOpen = false;
  }


  // CONTACT

  goToContact(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/contact'
    ]);
  }


  // WISHLIST

  goToWishlist(event: Event): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/wishlist'
    ]);
  }


  // NOTIFICATIONS

  goToNotifications(
    event: Event
  ): void {

    event.preventDefault();

    this.closeMenus();

    this.router.navigate([
      '/notifications'
    ]);
  }


  // SIGN UP

  goToSignup(event: Event): void {

    event.preventDefault();

    this.loginDropdownOpen =
      false;

    this.router.navigate([
      '/signup'
    ]);
  }


  // LOGIN

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


  // FORGOT PASSWORD

  forgotPassword(event: Event): void {

    event.preventDefault();

    alert(
      'Forgot Password clicked.'
    );
  }


  // CONTINUE AS GUEST

  continueAsGuest(): void {

    this.loginDropdownOpen =
      false;

    this.router.navigate([
      '/home'
    ]);
  }


  // OPEN DEVELOPER PROFILE

  openDeveloper(
    developer: Developer
  ): void {

    this.selectedDeveloper =
      developer;

    document.body.style.overflow =
      'hidden';
  }


  // CLOSE DEVELOPER PROFILE

  closeDeveloper(): void {

    this.selectedDeveloper =
      null;

    document.body.style.overflow =
      '';
  }

}
