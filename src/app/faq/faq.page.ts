import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface FaqItem { question: string; answer: string; }
interface FaqCategory { title: string; items: FaqItem[]; }

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faq.page.html',
  styleUrls: ['./faq.page.scss']
})
export class FaqPage {
  constructor(private readonly router: Router) {}

  readonly categories: FaqCategory[] = [
    { title: 'Orders & delivery', items: [
      { question: 'Where can I see my order status?', answer: 'Sign in and open Profile → Order History. Open the relevant order to see its current status and the tracking information available for that order.' },
      { question: 'Does the tracking map show the rider’s live location?', answer: 'The map is a route preview between the store and the delivery address. It does not represent a live rider GPS position.' },
      { question: 'Can I change or cancel an order?', answer: 'Order changes depend on the order’s current status and the options available in your account. Contact Botanique through the Contact Us page with your order number before assuming a change or cancellation is confirmed.' },
      { question: 'Why is my order still processing?', answer: 'The status shown in Order History is the latest status recorded by the store. If it has not changed or you need an update, contact support with your order number.' }
    ]},
    { title: 'Payments & refunds', items: [
      { question: 'Which payment methods can I choose?', answer: 'Checkout displays the payment methods currently enabled for the store. Select an available method before placing the order.' },
      { question: 'Maya returned me to the store but payment is still pending. What should I do?', answer: 'The app checks the payment status with the backend and Maya before marking an order as paid. If it remains pending, do not repeatedly pay or create another order; use the payment result screen or contact support with your order number.' },
      { question: 'How do I request a refund?', answer: 'Refund eligibility and handling depend on the order and payment status. Contact Botanique through Contact Us with your order number; this FAQ does not promise an automatic refund or a specific processing time.' }
    ]},
    { title: 'Account & security', items: [
      { question: 'How do I reset my password?', answer: 'On the Login page, choose Forgot Password and enter your account email. Use the reset link sent by Firebase Authentication. If the link expires or has already been used, request a new one.' },
      { question: 'How do I verify my email address?', answer: 'Open the verification email sent after registration and follow its link. If the link is invalid or expired, sign in and request another verification email where available.' },
      { question: 'Why can’t I submit a review?', answer: 'Reviews require you to be signed in and to have a delivered order containing that specific product. Select the eligible order, choose a one-to-five-star rating, and provide written feedback.' }
    ]}
  ];

  goHome(): void { void this.router.navigate(['/home']); }
  goLogin(): void { void this.router.navigate(['/login']); }
  goContact(): void { void this.router.navigate(['/contact']); }
}
