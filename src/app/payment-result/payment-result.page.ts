import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../shared/auth.service';
import { OrdersService } from '../shared/orders.service';

type Phase =
  | 'checking'
  | 'paid'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'unverified'
  | 'error';

interface StatusResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  verified?: boolean;
}

const POLL_MS = 3000;
const MAX_POLLS = 12;

/**
 * Landing page for Maya's success / failure / cancel redirects.
 *
 * The `outcome` query parameter is only a hint - anyone can type it into the
 * address bar. The page NEVER shows "paid" from it. It asks the backend,
 * which verifies the payment with Maya using the secret key.
 */
@Component({
  selector: 'app-payment-result',
  templateUrl: './payment-result.page.html',
  styleUrls: ['./payment-result.page.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class PaymentResultPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);

  phase: Phase = 'checking';
  orderId = '';
  orderNumber = '';
  total = 0;
  message = '';
  retrying = false;

  private polls = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  ngOnInit(): void {
    this.orderId = this.route.snapshot.queryParamMap.get('orderId') || '';

    if (!this.orderId) {
      this.phase = 'error';
      this.message = 'No order was specified.';
      return;
    }

    void this.check();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  get canRetry(): boolean {
    return this.phase === 'pending' || this.phase === 'failed' || this.phase === 'unverified';
  }

  formatPrice(value: number): string {
    return `₱${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  async check(): Promise<void> {
    if (this.destroyed) return;

    try {
      const token = await this.authService.getToken();
      if (!token) {
        await this.router.navigate(['/login']);
        return;
      }

      const res = await fetch(
        `${environment.apiUrl}/payments/maya/status/${encodeURIComponent(this.orderId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 404) {
        this.phase = 'error';
        this.message = 'We could not find that order on your account.';
        return;
      }

      const data = (await res.json().catch(() => ({}))) as StatusResponse & { message?: string };

      if (!res.ok) {
        this.phase = 'error';
        this.message = data?.message || 'Unable to check your payment right now.';
        return;
      }

      this.orderNumber = data.orderNumber;
      this.total = data.total;

      // The order's payment / status may have changed (paid, cancelled,
      // expired): make Order History and Track Order load fresh data.
      this.ordersService.invalidate();

      this.apply(data);
    } catch {
      this.phase = 'error';
      this.message = 'Unable to reach the server. Please check your connection.';
    }
  }

  private apply(d: StatusResponse): void {
    if (d.paymentStatus === 'PAID') {
      this.phase = 'paid';
      return;
    }
    if (d.paymentStatus === 'CANCELLED') {
      this.phase = 'cancelled';
      return;
    }
    if (d.paymentStatus === 'EXPIRED') {
      this.phase = 'expired';
      return;
    }
    if (d.paymentStatus === 'FAILED') {
      this.phase = 'failed';
      return;
    }

    // Still pending. If we could not reach Maya, say so honestly.
    if (d.verified === false) {
      this.phase = 'unverified';
      return;
    }

    this.polls++;
    if (this.polls < MAX_POLLS) {
      this.phase = 'checking';
      this.timer = setTimeout(() => void this.check(), POLL_MS);
    } else {
      this.phase = 'pending';
    }
  }

  async retryPayment(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    this.message = '';

    try {
      const token = await this.authService.getToken();
      const res = await fetch(`${environment.apiUrl}/payments/maya/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderId: this.orderId })
      });
      const body = await res.json().catch(() => ({}));

      if (
        !res.ok ||
        typeof body?.redirectUrl !== 'string' ||
        !body.redirectUrl.startsWith('https://')
      ) {
        this.message = body?.message || 'Unable to restart the payment.';
        this.retrying = false;
        return;
      }

      window.location.href = body.redirectUrl;
    } catch {
      this.message = 'Unable to restart the payment. Please try again.';
      this.retrying = false;
    }
  }

  recheck(): void {
    this.polls = 0;
    this.phase = 'checking';
    void this.check();
  }

  viewOrder(): void {
    void this.router.navigate(['/track-order'], { queryParams: { id: this.orderId } });
  }

  continueShopping(): void {
    void this.router.navigate(['/product']);
  }
}
