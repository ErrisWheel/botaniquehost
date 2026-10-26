import { environment } from '../../environments/environment';
import { Component, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';

interface BotaniqueUser {
  fullName?: string;
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {

  private readonly authService = inject(AuthService);

  /* LOGIN DATA */

  email = '';

  password = '';

  rememberMe = false;

  showPassword = false;


  /* IMAGE ACCORDION */

  hoveredImage: number | null = 0;


  constructor(
    private router: Router
  ) {}


  /* IMAGE ACCORDION METHODS */

  setHoveredImage(index: number): void {
    this.hoveredImage = index;
  }


  clearHoveredImage(): void {
    this.hoveredImage = null;
  }


  /* PASSWORD TOGGLE */

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }


  /* LOGIN */

  async login(form: NgForm): Promise<void> {
    if (form.invalid) {
      alert(
        'Please enter your email address and password.'
      );
      return;
    }

    try {
      const user = await this.authService.login(
        this.email,
        this.password,
        this.rememberMe
      );

      alert('Welcome back! You have successfully logged in.');

      if (user.role === 'ADMIN') {
        await this.router.navigate(['/admin']);
      } else {
        await this.router.navigate(['/home']);
      }

    } catch (error: any) {
      console.error(
        'Login error:',
        error
      );

      alert(
        error?.message ||
        'Unable to log in. Please try again.'
      );
    }
  }


  /* FORGOT PASSWORD */

  async forgotPassword(
    event: Event
  ): Promise<void> {

    event.preventDefault();

    const email = (
      this.email.trim() ||
      prompt('Enter the email address of your account:') ||
      ''
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


  /* CONTINUE AS GUEST */

  continueAsGuest(): void {

    localStorage.removeItem(
      'botaniqueUser'
    );


    this.router.navigate(
      ['/home']
    );

  }


  /* GO TO SIGN UP */

  goToSignup(
    event: Event
  ): void {

    event.preventDefault();

    this.router.navigate(
      ['/signup']
    );

  }

}
