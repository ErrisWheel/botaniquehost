import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
}

interface Dashboard {
  orders: number;
  revenue: number;
  customers: number;
  products: number;
  lowStock: number;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss']
})
export class AdminPage implements OnInit {

  private readonly API_URL = environment.apiUrl;

  loading = true;
  error = '';

  dashboard: Dashboard = {
    orders: 0,
    revenue: 0,
    customers: 0,
    products: 0,
    lowStock: 0
  };

  users: AdminUser[] = [];

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadAdminData();
  }

  private getHeaders(): HttpHeaders {
    const token =
      localStorage.getItem('botaniqueToken') ||
      localStorage.getItem('token');

    return new HttpHeaders({
      Authorization: `Bearer ${token || ''}`
    });
  }

  loadAdminData(): void {
    this.loading = true;
    this.error = '';

    const headers = this.getHeaders();

    this.http
      .get<Dashboard>(
        `${this.API_URL}/admin/dashboard`,
        { headers }
      )
      .subscribe({
        next: (dashboard) => {
          this.dashboard = dashboard;
          this.loadUsers();
        },
        error: (error) => {
          console.error('Admin dashboard error:', error);

          if (error.status === 401) {
            this.error =
              'Your admin session is missing or expired. Please log in again.';
          } else if (error.status === 403) {
            this.error =
              'Administrator access required. This account is not an admin.';
          } else {
            this.error =
              'Unable to load the admin dashboard.';
          }

          this.loading = false;
        }
      });
  }

  private loadUsers(): void {
    const headers = this.getHeaders();

    this.http
      .get<AdminUser[]>(
        `${this.API_URL}/admin/users`,
        { headers }
      )
      .subscribe({
        next: (users) => {
          this.users = users;
          this.loading = false;
        },
        error: (error) => {
          console.error('Admin users error:', error);

          if (error.status === 401) {
            this.error =
              'Your admin session is missing or expired.';
          } else if (error.status === 403) {
            this.error =
              'Administrator access required.';
          } else {
            this.error =
              'Dashboard loaded, but users could not be loaded.';
          }

          this.loading = false;
        }
      });
  }

  refresh(): void {
    this.loadAdminData();
  }

  isAdmin(user: AdminUser): boolean {
    return user.role === 'ADMIN';
  }

  toggleSuspension(user: AdminUser): void {
    const nextSuspended = !user.isSuspended;

    const confirmed = window.confirm(
      nextSuspended
        ? `Suspend ${user.email}?`
        : `Unsuspend ${user.email}?`
    );

    if (!confirmed) {
      return;
    }

    const headers = this.getHeaders();

    this.http
      .patch<AdminUser>(
        `${this.API_URL}/admin/users/${user.id}`,
        {
          isSuspended: nextSuspended
        },
        { headers }
      )
      .subscribe({
        next: (updatedUser) => {
          user.isSuspended = updatedUser.isSuspended;
        },
        error: (error) => {
          console.error(
            'Unable to update user suspension:',
            error
          );

          alert(
            error?.error?.message ||
            'Unable to update user.'
          );
        }
      });
  }

  logout(): void {
    localStorage.removeItem('botaniqueToken');
    localStorage.removeItem('token');
    localStorage.removeItem('botaniqueUser');
    localStorage.removeItem('botaniqueRememberMe');

    this.router.navigateByUrl('/login');
  }

  goHome(): void {
    this.router.navigateByUrl('/home');
  }
}