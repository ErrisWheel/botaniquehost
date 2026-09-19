import { environment } from '../../environments/environment';
import { Component } from '@angular/core';
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
      const response = await fetch(
        `${environment.apiUrl}/auth/login`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            email:
              this.email.trim().toLowerCase(),

            password:
              this.password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
          'Invalid email or password.'
        );
      }

      // IMPORTANT:
      // This is what checkout needs.
      localStorage.setItem(
        'botaniqueToken',
        data.token
      );

      // Keep frontend user information.
      localStorage.setItem(
        'botaniqueUser',
        JSON.stringify({
          id: data.user.id,
          name: data.user.fullName,
          fullName: data.user.fullName,
          email: data.user.email,
          phone: data.user.phone || '',
          role: data.user.role
        })
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

      alert(
        'Welcome back! You have successfully logged in.'
      );

      await this.router.navigate(['/home']);

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

  forgotPassword(
    event: Event
  ): void {

    event.preventDefault();

    alert(
      'Password recovery is not available yet.'
    );
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
