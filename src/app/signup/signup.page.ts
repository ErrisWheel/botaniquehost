import { environment } from '../../environments/environment';
import { Component, inject } from '@angular/core';
import { AuthService } from '../shared/auth.service';
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

  private readonly authService = inject(AuthService);

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
      await this.authService.register({
        fullName: this.fullName,
        email: this.email,
        password: this.password,
        phone: this.phone
      });

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
