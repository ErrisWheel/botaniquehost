import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'signup',
    loadComponent: () => import('./signup/signup.page').then(m => m.SignupPage)
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.page').then(m => m.AboutPage)
  },
  {
    path: 'product',
    loadComponent: () => import('./product/product.page').then(m => m.ProductPage)
  },
  {
    path: 'developers',
    loadComponent: () => import('./developers/developers.page').then(m => m.DevelopersPage)
  },
  {
    path: 'checkout',
    loadComponent: () => import('./checkout/checkout.page').then(m => m.CheckoutPage)
  },
  {
    path: 'contact',
    loadComponent: () => import('./contact/contact.page').then(m => m.ContactPage)
  },
  {
    path: 'product-detail',
    loadComponent: () =>
      import('./product-detail/product-detail.page')
        .then(m => m.ProductDetailPage)
  },
  {
    path: 'wishlist',
    loadComponent: () => import('./wishlist/wishlist.page').then(m => m.WishlistPage)
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./notification/notification.page')
        .then(m => m.NotificationPage)
  },

  // ADMIN
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin/admin.page')
        .then(m => m.AdminPage)
  },

  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.page').then(m => m.ProfilePage)
  },
  {
    path: 'track-order',
    loadComponent: () => import('./track-order/track-order.page').then(m => m.TrackOrderPage)
  },
];