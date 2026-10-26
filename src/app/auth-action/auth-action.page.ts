import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../shared/auth.service';

@Component({
  selector: 'app-auth-action',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-action.page.html',
  styleUrls: ['./auth-action.page.scss']
})
export class AuthActionPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  mode: 'resetPassword' | 'verifyEmail' | '' = '';
  code = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  loading = true;
  submitting = false;
  success = false;
  message = '';
  resetRequestEmail = '';
  canRequestNewResetLink = false;

  async ngOnInit(): Promise<void> {
    const requestedMode = this.route.snapshot.queryParamMap.get('mode') || '';
    this.code = this.route.snapshot.queryParamMap.get('oobCode') || '';
    if (!this.code || !['resetPassword', 'verifyEmail'].includes(requestedMode)) {
      this.mode = '';
      this.loading = false;
      this.message = 'This link is incomplete or is not supported.';
      return;
    }
    this.mode = requestedMode as 'resetPassword' | 'verifyEmail';

    try {
      if (this.mode === 'verifyEmail') {
        await this.auth.completeEmailVerification(this.code);
        this.success = true;
        this.message = 'Your email address has been verified. You can now sign in to Botanique.';
      } else {
        this.email = await this.auth.validatePasswordResetCode(this.code);
        this.message = '';
      }
    } catch (error: any) {
      this.message = error?.message || 'This link is invalid, expired, or has already been used.';
      this.canRequestNewResetLink = this.mode === 'resetPassword';
    } finally {
      this.loading = false;
    }
  }

  async submitPassword(): Promise<void> {
    if (this.password.length < 6) {
      this.message = 'Use a password with at least 6 characters.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.message = 'The passwords do not match.';
      return;
    }

    this.submitting = true;
    this.message = '';
    try {
      await this.auth.completePasswordReset(this.code, this.password);
      this.success = true;
      this.password = '';
      this.confirmPassword = '';
      this.message = 'Your password has been reset. You can now sign in with your new password.';
    } catch (error: any) {
      this.message = error?.message || 'We could not reset your password. Request a new link and try again.';
      if (/expired|invalid|already been used|no longer valid/i.test(this.message)) {
        this.canRequestNewResetLink = true;
      }
    } finally {
      this.submitting = false;
    }
  }

  async requestNewResetLink(): Promise<void> {
    const address = (this.resetRequestEmail || this.email).trim();
    if (!address) {
      this.message = 'Enter your email address to request a new reset link.';
      return;
    }
    this.submitting = true;
    try {
      await this.auth.resetPassword(address);
      this.message = 'If an account exists for that email address, a new password reset link has been sent.';
      this.resetRequestEmail = address;
    } catch (error: any) {
      this.message = error?.message || 'Unable to request a reset email right now.';
    } finally {
      this.submitting = false;
    }
  }

  async resendVerification(): Promise<void> {
    this.submitting = true;
    try {
      await this.auth.resendVerificationEmail();
      this.message = 'A new verification email has been sent.';
    } catch (error: any) {
      this.message = error?.message || 'Log in and request a new verification email.';
    } finally {
      this.submitting = false;
    }
  }

  goLogin(): void {
    void this.router.navigate(['/login']);
  }

  goHome(): void {
    void this.router.navigate(['/home']);
  }
}
