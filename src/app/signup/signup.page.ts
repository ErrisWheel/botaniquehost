import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss']
})
export class SignupPage {

  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';

  phone = '';
  street = '';
  city = '';
  province = '';
  zip = '';
  region = '';

  termsAccepted = false;

  showPassword = false;
  showConfirmPassword = false;

  hoveredImage: number | null = null;

  constructor(private router: Router) {}

  // PASSWORD 

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }


  // PLANT IMAGES 

  setHoveredImage(index: number): void {
    this.hoveredImage = index;
  }

  clearHoveredImage(): void {
    this.hoveredImage = null;
  }


  // SIGN UP 

  async signup(form: NgForm): Promise<void> {
    if (form.invalid) {
      alert('Please fill in all required fields.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    // Backend requires minimum 8 characters.
    if (this.password.length < 8) {
      alert(
        'Password must be at least 8 characters.'
      );
      return;
    }

    if (!/^09\d{9}$/.test(this.phone)) {
      alert(
        'Please enter an 11-digit PH mobile number starting with 09.'
      );
      return;
    }

    if (!/^\d{4}$/.test(this.zip)) {
      alert(
        'Please enter a 4-digit ZIP code.'
      );
      return;
    }

    if (!this.termsAccepted) {
      alert(
        'Please agree to the Terms of Service and Privacy Policy.'
      );
      return;
    }

    try {
      const response = await fetch(
        'http://localhost:4000/api/auth/register',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            fullName:
              this.fullName.trim(),

            email:
              this.email.trim().toLowerCase(),

            password:
              this.password,

            phone:
              this.phone.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
          'Unable to create account.'
        );
      }

      // Store real backend authentication.
      localStorage.setItem(
        'botaniqueToken',
        data.token
      );

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

      alert(
        'Your account has been created successfully.'
      );

      await this.router.navigate(['/home']);

    } catch (error: any) {
      console.error(
        'Signup error:',
        error
      );

      alert(
        error?.message ||
        'Unable to create your account.'
      );
    }
  }


  // NAVIGATION 

  goToLogin(event: Event): void {
    event.preventDefault();
    this.router.navigate(['/login']);
  }


  // LEGAL 

  showTerms(event: Event): void {
    event.preventDefault();

    alert(
      'Terms of Service\n\nPlease review and accept the Botanique Terms of Service.'
    );
  }


  showPrivacy(event: Event): void {
    event.preventDefault();

    alert(
      'Privacy Policy\n\nPlease review the Botanique Privacy Policy.'
    );
  }

}