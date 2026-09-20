import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

interface Address {
  id?: string;
  label: string;
  name?: string;
  street: string;
  city: string;
  province: string;
  zip: string;
  region?: string;
  phone?: string;
  isDefault?: boolean;
}

interface OrderItem {
  name: string;
  image: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  orderNumber?: string;
  date: string;
  status: string;
  total: number;
  items: OrderItem[];
}

interface CartItem {
  id: string | number;
  name: string;
  image?: string;
  price: number;
  quantity: number;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class ProfilePage implements OnInit {

  /* NAVIGATION */

  menuOpen = false;
  loginDropdownOpen = false;

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('botaniqueToken');
  }

  wishlistCount = 0;
  notificationCount = 0;
  cartCount = 0;


  /* LOGIN DROPDOWN */

  email = '';
  password = '';
  rememberMe = false;

  showDropdownPassword = false;


  /* CURRENT USER */

  currentUser: any = null;

  private readonly API_URL = `${environment.apiUrl}`;

  profileName = '';
  profileEmail = '';
  profileSince = '';

  profileForm = {
    name: '',
    email: '',
    phone: ''
  };


  /* PROFILE TABS */

  activeTab:
    | 'info'
    | 'settings'
    | 'addresses'
    | 'orders' = 'info';


  /* PASSWORD */

  passwordForm = {
    current: '',
    newPassword: '',
    confirm: ''
  };

  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;


  /* ADDRESSES */

  addresses: Address[] = [];

  private readonly ADDRESS_KEY = 'botaniqueAddresses';


  /* ORDERS */

  orders: Order[] = [];

  private readonly ORDER_KEY = 'botaniqueOrders';


  /* CART */

  cartDrawerOpen = false;

  cartItems: CartItem[] = [];

  cartSubtotal = 0;

  private readonly CART_KEY = 'botaniqueCartItems';


  /* STORAGE KEYS */

  private readonly USER_KEY = 'botaniqueUser';
  private readonly USERS_KEY = 'botaniqueUsers';
  private readonly WISHLIST_KEY = 'botaniqueWishlistItems';
  private readonly NOTIFICATION_KEY = 'botaniqueNotifications';


  /* CONSTRUCTOR */

  constructor(
    private router: Router,
    private http: HttpClient
  ) {}


  /* INIT */

  ngOnInit(): void {

    this.loadCurrentUser();

    this.loadAddresses();

    this.loadOrders();

    this.loadCart();

    this.updateCartCount();

    this.updateWishlistCount();

    this.updateNotificationCount();

  }

  // Ionic can reuse this page instead of constructing a new component.
  // Refresh server-backed data whenever the profile becomes visible again.
  ionViewWillEnter(): void {
    this.loadCurrentUser();
    this.loadOrders();
    this.loadAddresses();
    this.loadCart();
    this.updateCartCount();
  }


  /* CURRENT USER */

  loadCurrentUser(): void {

    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');


    if (!token) {

      this.currentUser = null;

      this.profileName = '';
      this.profileEmail = '';
      this.profileSince = '';

      this.profileForm = {
        name: '',
        email: '',
        phone: ''
      };

      return;

    }

    // Show the last confirmed profile immediately while /me is loading.
    // This also prevents a temporary API failure from making saved details
    // appear to disappear after navigation/reload.
    try {
      const cached = localStorage.getItem(this.USER_KEY);
      if (cached) {
        const user = JSON.parse(cached);
        if (user) {
          this.currentUser = user;
          this.profileName = user.fullName || user.name || '';
          this.profileEmail = user.email || '';
          this.profileForm = {
            name: this.profileName,
            email: this.profileEmail,
            phone: user.phone || ''
          };
        }
      }
    } catch {
      // Ignore malformed cached profile; /me remains the source of truth.
    }


    const headers =
      new HttpHeaders({
        Authorization:
          `Bearer ${token}`
      });


    this.http
      .get<any>(
        `${this.API_URL}/auth/me`,
        { headers }
      )
      .subscribe({

        next: (user) => {

          this.currentUser = user;


          const userName =
            user?.fullName ||
            user?.name ||
            '';

          const userEmail =
            user?.email ||
            '';

          const userPhone =
            user?.phone ||
            '';


          this.profileName =
            userName;

          this.profileEmail =
            userEmail;


          this.profileForm = {

            name:
              userName,

            email:
              userEmail,

            phone:
              userPhone

          };

          // Cache the confirmed backend profile so a transient reload/API
          // failure cannot make saved information appear to disappear.
          try {
            localStorage.setItem(
              this.USER_KEY,
              JSON.stringify({
                ...user,
                name: userName
              })
            );
          } catch {
            // Ignore storage errors; the backend remains authoritative.
          }


          /*
           * Backend /me does not currently
           * return createdAt, so leave the
           * membership date blank.
           */

          this.profileSince = '';

        },

        error: (error) => {

          console.error(
            'Unable to load profile:',
            error
          );


          // Keep the last confirmed local profile on transient failures.
          // A 401 is different: the authentication session is no longer valid.
          if (error?.status === 401) {
            this.currentUser = null;
            this.profileName = '';
            this.profileEmail = '';
            this.profileSince = '';
            this.profileForm = {
              name: '',
              email: '',
              phone: ''
            };


            localStorage.removeItem(
              'botaniqueToken'
            );

            localStorage.removeItem(
              'token'
            );

            alert(
              'Your session has expired. Please log in again.'
            );

            this.router.navigateByUrl(
              '/login'
            );

          }

        }

      });

  }


  /* INITIALS */

  getInitials(
    name: string | undefined
  ): string {

    if (!name) {
      return 'B';
    }


    const parts =
      name
        .trim()
        .split(/\s+/)
        .filter(Boolean);


    if (parts.length === 1) {

      return parts[0]
        .charAt(0)
        .toUpperCase();

    }


    return (
      parts[0].charAt(0) +
      parts[parts.length - 1].charAt(0)
    ).toUpperCase();

  }


  /* SAVE PROFILE */

  async saveProfile(): Promise<void> {

    const newName = this.profileForm.name.trim();
    const newEmail = this.profileForm.email.trim().toLowerCase();
    const newPhone = this.profileForm.phone.trim();

    if (!newName) {
      alert('Please enter your full name.');
      return;
    }

    if (!newEmail) {
      alert('Please enter your email address.');
      return;
    }

    if (!this.currentUser) {
      alert('Please log in before updating your profile.');
      return;
    }

    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');

    if (!token) {
      alert('Your session has expired. Please log in again.');
      await this.router.navigateByUrl('/login');
      return;
    }

    const oldProfileName = this.profileName;

    try {
      const updated = await firstValueFrom(
        this.http.patch<any>(
          `${this.API_URL}/auth/me`,
          {
            fullName: newName,
            email: newEmail,
            phone: newPhone
          },
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${token}`
            })
          }
        )
      );

      // The backend is the source of truth. Only update local UI/storage
      // after the PATCH succeeds, so a failed save cannot look successful.
      this.currentUser = {
        ...this.currentUser,
        ...updated,
        name: updated.fullName
      };

      localStorage.setItem(
        this.USER_KEY,
        JSON.stringify(this.currentUser)
      );

      this.profileName = updated.fullName || newName;
      this.profileEmail = updated.email || newEmail;
      this.profileForm = {
        name: this.profileName,
        email: this.profileEmail,
        phone: updated.phone || newPhone
      };

      this.addresses = this.addresses.map((address) =>
        !address.name || address.name === oldProfileName
          ? { ...address, name: this.profileName }
          : address
      );
      this.saveAddresses();

      alert('Your profile has been updated.');

    } catch (error: any) {
      console.error('Unable to save profile:', error);

      if (error?.status === 401) {
        localStorage.removeItem('botaniqueToken');
        localStorage.removeItem('token');
        alert('Your session has expired. Please log in again.');
        await this.router.navigateByUrl('/login');
        return;
      }

      alert(
        error?.error?.message ||
        'Unable to save your profile. Please try again.'
      );
    }

  }


  /* TABS */

  selectTab(
    tab:
      | 'info'
      | 'settings'
      | 'addresses'
      | 'orders'
  ): void {

    this.activeTab = tab;

    if (tab === 'orders') {
      this.loadOrders();
    }

    this.menuOpen = false;

    this.loginDropdownOpen = false;


    const scrollContainer =
      document.querySelector(
        '.profile-scroll'
      ) as HTMLElement | null;


    if (scrollContainer) {

      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

    } else {

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

    }

  }


  /* ADDRESS STORAGE */

  loadAddresses(): void {

    const raw =
      localStorage.getItem(
        this.ADDRESS_KEY
      );


    if (!raw) {

      this.addresses = [];

      return;
    }


    try {

      const parsed =
        JSON.parse(raw);


      this.addresses =
        Array.isArray(parsed)
          ? parsed
          : [];

    } catch {

      this.addresses = [];

    }

  }


  saveAddresses(): void {

    localStorage.setItem(
      this.ADDRESS_KEY,
      JSON.stringify(this.addresses)
    );

  }


  /* ADD ADDRESS */

  addAddress(): void {

    const label =
      prompt(
        'Address label (Home, Work, etc.):',
        'Home'
      );


    if (
      label === null ||
      !label.trim()
    ) {

      return;
    }


    const street =
      prompt(
        'Street / House No. / Barangay:'
      );


    if (
      street === null ||
      !street.trim()
    ) {

      return;
    }


    const city =
      prompt(
        'City / Municipality:'
      );


    if (
      city === null ||
      !city.trim()
    ) {

      return;
    }


    const province =
      prompt(
        'Province:'
      );


    if (
      province === null ||
      !province.trim()
    ) {

      return;
    }


    const zip =
      prompt(
        'ZIP Code:'
      );


    if (
      zip === null ||
      !zip.trim()
    ) {

      return;
    }


    const phone =
      prompt(
        'Phone Number:',
        this.profileForm.phone || ''
      ) || '';


    const newAddress: Address = {

      id:
        Date.now().toString(),

      label:
        label.trim(),

      name:
        this.profileForm.name.trim(),

      street:
        street.trim(),

      city:
        city.trim(),

      province:
        province.trim(),

      zip:
        zip.trim(),

      region:
        'NCR',

      phone:
        phone.trim(),

      isDefault:
        this.addresses.length === 0

    };


    this.addresses.push(
      newAddress
    );


    this.saveAddresses();


    alert(
      'Address added successfully.'
    );

  }


  /* EDIT ADDRESS */

  editAddress(
    index: number
  ): void {

    const address =
      this.addresses[index];


    if (!address) {
      return;
    }


    const label =
      prompt(
        'Address label:',
        address.label || 'Home'
      );


    if (
      label === null ||
      !label.trim()
    ) {

      return;
    }


    const name =
      prompt(
        'Full Name:',
        address.name ||
        this.profileForm.name
      );


    if (
      name === null ||
      !name.trim()
    ) {

      return;
    }


    const street =
      prompt(
        'Street / House No. / Barangay:',
        address.street
      );


    if (
      street === null ||
      !street.trim()
    ) {

      return;
    }


    const city =
      prompt(
        'City / Municipality:',
        address.city
      );


    if (
      city === null ||
      !city.trim()
    ) {

      return;
    }


    const province =
      prompt(
        'Province:',
        address.province
      );


    if (
      province === null ||
      !province.trim()
    ) {

      return;
    }


    const zip =
      prompt(
        'ZIP Code:',
        address.zip
      );


    if (
      zip === null ||
      !zip.trim()
    ) {

      return;
    }


    const region =
      prompt(
        'Region:',
        address.region || 'NCR'
      );


    if (region === null) {
      return;
    }


    const phone =
      prompt(
        'Phone Number:',
        address.phone ||
        this.profileForm.phone ||
        ''
      );


    if (phone === null) {
      return;
    }


    this.addresses[index] = {

      ...address,

      label:
        label.trim(),

      name:
        name.trim(),

      street:
        street.trim(),

      city:
        city.trim(),

      province:
        province.trim(),

      zip:
        zip.trim(),

      region:
        region.trim(),

      phone:
        phone.trim()

    };


    this.saveAddresses();


    alert(
      'Address updated successfully.'
    );

  }


  /* DELETE ADDRESS */

  deleteAddress(
    index: number
  ): void {

    if (!this.addresses[index]) {
      return;
    }


    const confirmed =
      confirm(
        'Are you sure you want to delete this address?'
      );


    if (!confirmed) {
      return;
    }


    const wasDefault =
      !!this.addresses[index].isDefault;


    this.addresses.splice(
      index,
      1
    );


    if (
      wasDefault &&
      this.addresses.length > 0
    ) {

      this.addresses =
        this.addresses.map(
          (address, i) => ({
            ...address,
            isDefault: i === 0
          })
        );

    }


    this.saveAddresses();


    alert(
      'Address deleted.'
    );

  }


  /* SET DEFAULT ADDRESS */

  setDefaultAddress(
    index: number
  ): void {

    if (!this.addresses[index]) {
      return;
    }


    this.addresses =
      this.addresses.map(
        (address, i) => ({
          ...address,
          isDefault: i === index
        })
      );


    this.saveAddresses();


    alert(
      'Default address updated.'
    );

  }


  /* ORDERS */

  loadOrders(): void {

    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');


    if (!token) {

      this.orders = [];

      return;

    }

    // Load the last confirmed server response immediately. The API below
    // remains authoritative, but this makes order history resilient to page
    // reuse and brief backend/network delays.
    try {
      const raw = localStorage.getItem(this.ORDER_KEY);
      const cached = raw ? JSON.parse(raw) : [];
      if (Array.isArray(cached)) {
        this.orders = cached;
      }
    } catch {
      // Ignore malformed local order history.
    }


    const headers =
      new HttpHeaders({
        Authorization:
          `Bearer ${token}`
      });


    this.http
      .get<any[]>(
        `${this.API_URL}/orders`,
        { headers }
      )
      .subscribe({

        next: (orders) => {

          if (
            !Array.isArray(orders)
          ) {

            this.orders = [];

            return;

          }


          this.orders =
            orders.map(
              (order: any) => {

                const items =
                  Array.isArray(
                    order?.items
                  )
                    ? order.items.map(
                        (item: any) => ({

                          name:
                            item?.productName ||
                            item?.name ||
                            'Product',

                          image:
                            item?.image ||
                            item?.product?.image ||
                            '',

                          price:
                            Number(
                              item?.unitPrice ??
                              item?.price ??
                              0
                            ),

                          quantity:
                            Number(
                              item?.quantity ||
                              1
                            )

                        })
                      )
                    : [];


                const calculatedTotal =
                  items.reduce(
                    (
                      total: number,
                      item: OrderItem
                    ) =>
                      total +
                      (
                        item.price *
                        item.quantity
                      ),
                    0
                  );


                return {

                  id:
                    String(
                      order?.id ||
                      order?.orderNumber ||
                      ''
                    ),

                  orderNumber:
                    String(
                      order?.orderNumber ||
                      order?.id ||
                      ''
                    ),

                  date:
                    order?.createdAt ||
                    '',

                  status:
                    this.normalizeOrderStatus(
                      order?.status
                    ),

                  total:
                    Number(
                      order?.total ??
                      calculatedTotal
                    ),

                  items

                };

              }
            );

          // Persist the real server orders as a display cache. The next
          // request still refreshes from /api/orders, so this is not a
          // substitute for the database.
          try {
            localStorage.setItem(
              this.ORDER_KEY,
              JSON.stringify(this.orders)
            );
          } catch {
            // Ignore storage quota/serialization errors.
          }

        },

        error: (error) => {

          console.error(
            'Unable to load orders:',
            error
          );


          // Keep the cached order history on transient failures.
          // Only a 401 means the authenticated session is invalid.
          if (
            error?.status === 401
          ) {
            this.orders = [];

            localStorage.removeItem(
              'botaniqueToken'
            );

            localStorage.removeItem(
              'token'
            );

            alert(
              'Your session has expired. Please log in again.'
            );

            this.router.navigateByUrl(
              '/login'
            );

          }

        }

      });

  }

  /* NORMALIZE ORDER STATUS */

  private normalizeOrderStatus(
    status?: string
  ): string {

    const value =
      String(
        status || 'PENDING'
      )
        .trim()
        .toLowerCase()
        .replace(/-/g, '_')
        .replace(/\s+/g, '_');


    switch (value) {

      case 'pending':
        return 'Pending';

      case 'processing':
      case 'confirmed':
      case 'preparing':
        return 'Processing';

      case 'shipped':
      case 'in_transit':
      case 'intransit':
        return 'Shipped';

      case 'out_for_delivery':
      case 'outfordelivery':
      case 'delivery':
        return 'Out for Delivery';

      case 'delivered':
      case 'complete':
      case 'completed':
        return 'Delivered';

      case 'cancelled':
      case 'canceled':
      case 'cancel':
        return 'Cancelled';

      default:
        return 'Pending';

    }

  }

  /* ORDER STATUS */

  getOrderStatusClass(
    status: string
  ): string {

    switch (
      status?.toLowerCase()
    ) {

      case 'delivered':
        return 'status-delivered';

      case 'cancelled':
      case 'canceled':
        return 'status-cancelled';

      case 'processing':
        return 'status-processing';

      case 'shipped':
        return 'status-shipped';

      default:
        return 'status-pending';

    }

  }


  /* PASSWORD */

  changePassword(): void {

    if (!this.currentUser) {

      alert(
        'Please log in before changing your password.'
      );

      return;
    }


    if (
      !this.passwordForm.current ||
      !this.passwordForm.newPassword ||
      !this.passwordForm.confirm
    ) {

      alert(
        'Please complete all password fields.'
      );

      return;
    }


    if (
      this.passwordForm.newPassword.length < 6
    ) {

      alert(
        'Your new password must contain at least 6 characters.'
      );

      return;
    }


    if (
      this.passwordForm.newPassword !==
      this.passwordForm.confirm
    ) {

      alert(
        'The new passwords do not match.'
      );

      return;
    }


    const usersRaw =
      localStorage.getItem(
        this.USERS_KEY
      );


    let passwordChanged = false;


    if (usersRaw) {

      try {

        const users =
          JSON.parse(usersRaw);


        if (Array.isArray(users)) {

          const userIndex =
            users.findIndex(
              (user: any) =>
                user.email ===
                this.currentUser.email
            );


          if (userIndex !== -1) {

            const user =
              users[userIndex];


            const storedPassword =
              user.password || '';


            if (
              storedPassword &&
              storedPassword !==
              this.passwordForm.current
            ) {

              alert(
                'Your current password is incorrect.'
              );

              return;
            }


            users[userIndex] = {

              ...user,

              password:
                this.passwordForm.newPassword

            };


            localStorage.setItem(
              this.USERS_KEY,
              JSON.stringify(users)
            );


            passwordChanged = true;

          }

        }

      } catch {

      }

    }


    this.currentUser.password =
      this.passwordForm.newPassword;


    localStorage.setItem(
      this.USER_KEY,
      JSON.stringify(this.currentUser)
    );


    this.passwordForm = {

      current: '',
      newPassword: '',
      confirm: ''

    };


    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;


    if (passwordChanged) {

      alert(
        'Your password has been changed successfully.'
      );

    } else {

      alert(
        'Your password has been changed.'
      );

    }

  }


  /* PASSWORD TOGGLES */

  toggleCurrentPassword(): void {

    this.showCurrentPassword =
      !this.showCurrentPassword;

  }


  toggleNewPassword(): void {

    this.showNewPassword =
      !this.showNewPassword;

  }


  toggleConfirmPassword(): void {

    this.showConfirmPassword =
      !this.showConfirmPassword;

  }


  toggleDropdownPassword(): void {

    this.showDropdownPassword =
      !this.showDropdownPassword;

  }


  /* DELETE ACCOUNT */

  deleteAccount(): void {

    if (!this.currentUser) {

      alert(
        'No logged-in account was found.'
      );

      return;
    }


    const confirmed =
      confirm(
        'Are you sure you want to permanently delete your account? This action cannot be undone.'
      );


    if (!confirmed) {
      return;
    }


    const currentEmail =
      this.currentUser.email;


    const usersRaw =
      localStorage.getItem(
        this.USERS_KEY
      );


    if (usersRaw) {

      try {

        const users =
          JSON.parse(usersRaw);


        if (Array.isArray(users)) {

          const remainingUsers =
            users.filter(
              (user: any) =>
                user.email !==
                currentEmail
            );


          localStorage.setItem(
            this.USERS_KEY,
            JSON.stringify(remainingUsers)
          );

        }

      } catch {

        // Ignore invalid user storage.

      }

    }


    localStorage.removeItem(
      this.USER_KEY
    );

    localStorage.removeItem(
      this.ADDRESS_KEY
    );

    localStorage.removeItem(
      this.ORDER_KEY
    );


    this.currentUser = null;

    this.profileName = '';
    this.profileEmail = '';
    this.profileSince = '';

    this.addresses = [];
    this.orders = [];


    alert(
      'Your Botanique account has been deleted.'
    );


    this.router.navigateByUrl(
      '/home'
    );

  }


  /* CART STORAGE */

  loadCart(): void {

    const raw =
      localStorage.getItem(
        this.CART_KEY
      );


    if (!raw) {

      this.cartItems = [];
      this.cartSubtotal = 0;

      return;
    }


    try {

      const parsed =
        JSON.parse(raw);


      if (!Array.isArray(parsed)) {

        this.cartItems = [];
        this.cartSubtotal = 0;

        return;
      }


      this.cartItems =
        parsed.map(
          (item: any) => ({

            id:
              item.id,

            name:
              item.name ||
              'Product',

            image:
              item.image ||
              '',

            price:
              Number(
                item.price || 0
              ),

            quantity:
              Math.max(
                1,
                Number(
                  item.quantity || 1
                )
              )

          })
        );


      this.updateCartSubtotal();

    } catch {

      this.cartItems = [];
      this.cartSubtotal = 0;

    }

  }


  saveCart(): void {

    localStorage.setItem(
      this.CART_KEY,
      JSON.stringify(this.cartItems)
    );

  }


  /* OPEN CART */

  openCart(): void {

    this.loadCart();

    this.updateCartCount();

    this.cartDrawerOpen = true;

    this.loginDropdownOpen = false;
    this.menuOpen = false;

  }


  /* CLOSE CART */

  closeCart(): void {

    this.cartDrawerOpen = false;

  }


  /* CART PRICE */

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


  /* CART SUBTOTAL */

  updateCartSubtotal(): void {

    this.cartSubtotal =
      this.cartItems.reduce(
        (
          total: number,
          item: CartItem
        ) =>
          total +
          (
            Number(item.price) *
            Number(item.quantity)
          ),
        0
      );

  }


  /* INCREASE CART QUANTITY */

  increaseQuantity(
    item: CartItem
  ): void {

    if (!item) {
      return;
    }


    item.quantity =
      Number(item.quantity || 0) + 1;


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* DECREASE CART QUANTITY */

  decreaseQuantity(
    item: CartItem
  ): void {

    if (!item) {
      return;
    }


    const currentQuantity =
      Number(item.quantity || 1);


    if (currentQuantity <= 1) {

      this.removeFromCart(
        item.id
      );

      return;
    }


    item.quantity =
      currentQuantity - 1;


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* REMOVE FROM CART */

  removeFromCart(
    id: string | number
  ): void {

    this.cartItems =
      this.cartItems.filter(
        item =>
          String(item.id) !==
          String(id)
      );


    this.saveCart();

    this.updateCartSubtotal();

    this.updateCartCount();

  }


  /* CONTINUE SHOPPING */

  continueShopping(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeCart();

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* TRACK ORDER */

  trackOrder(orderId: string): void {
    if (!orderId) {
      return;
    }

    this.router.navigate(
      ['/track-order'],
      { queryParams: { id: orderId } }
    );
  }


  /* CHECKOUT */

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


    this.saveCart();

    this.closeCart();

    this.router.navigateByUrl(
      '/checkout'
    );

  }


  /* CART COUNT */

  updateCartCount(): void {

    const raw =
      localStorage.getItem(
        this.CART_KEY
      );


    if (!raw) {

      this.cartCount = 0;

      return;
    }


    try {

      const items =
        JSON.parse(raw);


      if (!Array.isArray(items)) {

        this.cartCount = 0;

        return;
      }


      this.cartCount =
        items.reduce(
          (
            total: number,
            item: any
          ) =>
            total +
            Number(
              item.quantity || 1
            ),
          0
        );

    } catch {

      this.cartCount = 0;

    }

  }


  /* WISHLIST COUNT */

  updateWishlistCount(): void {

    const raw =
      localStorage.getItem(
        this.WISHLIST_KEY
      );


    if (!raw) {

      this.wishlistCount = 0;

      return;
    }


    try {

      const items =
        JSON.parse(raw);


      this.wishlistCount =
        Array.isArray(items)
          ? items.length
          : 0;

    } catch {

      this.wishlistCount = 0;

    }

  }


  /* NOTIFICATION COUNT */

  updateNotificationCount(): void {

    const raw =
      localStorage.getItem(
        this.NOTIFICATION_KEY
      );


    if (!raw) {

      this.notificationCount = 0;

      return;
    }


    try {

      const notifications =
        JSON.parse(raw);


      if (!Array.isArray(notifications)) {

        this.notificationCount = 0;

        return;
      }


      this.notificationCount =
        notifications.filter(
          (notification: any) =>
            !notification.read
        ).length;

    } catch {

      this.notificationCount = 0;

    }

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

    this.loginDropdownOpen = false;

  }


  /* LOGIN */

  async login(): Promise<void> {
    const loginEmail = this.email.trim().toLowerCase();

    if (!loginEmail || !this.password) {
      alert('Please enter your email and password.');
      return;
    }

    try {
      const response = await fetch(`${environment.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: this.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Invalid email or password.');
      }

      localStorage.setItem('botaniqueToken', data.token);
      localStorage.setItem('botaniqueUser', JSON.stringify({
        id: data.user.id,
        name: data.user.fullName,
        fullName: data.user.fullName,
        email: data.user.email,
        phone: data.user.phone || '',
        role: data.user.role
      }));

      this.email = '';
      this.password = '';
      this.closeLoginDropdown();
      this.loadCurrentUser();
      this.loadOrders();

      alert(`Welcome back, ${data.user.fullName || 'to Botanique'}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(error?.message || 'Unable to log in. Please try again.');
    }
  }


  /* FORGOT PASSWORD */

  forgotPassword(
    event?: Event
  ): void {

    event?.preventDefault();


    const email =
      prompt(
        'Enter the email address associated with your Botanique account:',
        this.email
      );


    if (!email) {
      return;
    }


    const usersRaw =
      localStorage.getItem(
        this.USERS_KEY
      );


    if (!usersRaw) {

      alert(
        'No account was found.'
      );

      return;
    }


    try {

      const users =
        JSON.parse(usersRaw);


      const foundUser =
        Array.isArray(users)
          ? users.find(
              (user: any) =>
                user.email ===
                email.trim()
            )
          : null;


      if (!foundUser) {

        alert(
          'No account is registered with that email address.'
        );

        return;
      }


      alert(
        'Password recovery is not connected to email yet. Please contact Botanique support or use your account settings to change your password.'
      );

    } catch {

      alert(
        'Unable to process the request right now.'
      );

    }

  }


  /* CONTINUE AS GUEST */

  continueAsGuest(): void {

    this.loginDropdownOpen = false;

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* LOGOUT */

  logout(): void {
    localStorage.removeItem('botaniqueToken');
    localStorage.removeItem('token');
    localStorage.removeItem('botaniqueUser');
    localStorage.removeItem('botaniqueRememberMe');

    this.currentUser = null;

    this.profileName = '';
    this.profileEmail = '';
    this.profileSince = '';

    this.profileForm = {
      name: '',
      email: '',
      phone: ''
    };

    this.loginDropdownOpen = false;
    this.menuOpen = false;

    alert('Logged out. See you soon! 👋');

    this.router.navigateByUrl('/home');
  }


  /* MOBILE MENU */

  toggleMenu(): void {

    this.menuOpen =
      !this.menuOpen;


    if (this.menuOpen) {

      this.loginDropdownOpen = false;

    }

  }


  /* CLOSE MENUS */

  closeMenus(): void {

    this.menuOpen = false;

    this.loginDropdownOpen = false;

  }


  /* HOME */

  goHome(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/home'
    );

  }


  /* ABOUT */

  goToAbout(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/about'
    );

  }


  /* STAY ON ABOUT LINK */

  stayOnAbout(
    event?: Event
  ): void {

    event?.preventDefault();

    this.menuOpen = false;

  }


  /* PRODUCT */

  goToProduct(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/product'
    );

  }


  /* DEVELOPERS */

  goToDevelopers(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/developers'
    );

  }


  /* CONTACT */

  goToContact(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/contact'
    );

  }


  /* WISHLIST */

  goToWishlist(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/wishlist'
    );

  }


  /* NOTIFICATIONS */

  goToNotifications(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.router.navigateByUrl(
      '/notifications'
    );

  }


  /* CART */

  goToCart(
    event?: Event
  ): void {

    event?.preventDefault();

    this.closeMenus();

    this.loadCart();

    this.cartDrawerOpen = true;

  }


  /* SIGN UP */

  goToSignup(
    event?: Event
  ): void {

    event?.preventDefault();

    this.loginDropdownOpen = false;

    this.menuOpen = false;

    this.router.navigateByUrl(
      '/signup'
    );

  }

}
