# Firebase authentication email setup

The application continues to use Firebase Authentication for password resets and email verification. These messages are **not** sent through EmailJS. The custom, responsive landing page for both flows is `/auth-action`.

## Required Firebase Console configuration

1. In **Firebase Console → Authentication → Templates**, edit **Password reset** and **Email address verification**.
2. For each template, choose **Customize action URL** and set it to `https://<your-frontend-host>/auth-action` (replace the host with the deployed Angular app domain; do not include a query string).
3. In **Authentication → Settings → Authorized domains**, ensure the exact frontend hostname is listed. For local testing, add `localhost` if Firebase does not already list it.
4. Keep the Firebase-generated `%LINK%` in each email body. Firebase adds the `mode` and `oobCode` parameters to the custom action URL. Do not manually create, log, or reuse those codes.
5. Set the public-facing project name to **Botanique**. A custom sender domain can be configured separately in Firebase if desired; it is not required for the action page to work.

`AuthService` passes `https://<current-origin>/auth-action` as the continuation URL so Firebase-generated actions can return to the frontend. The custom **action URL** above is what sends users through the designed page that consumes the action code.

## Suggested reset email

**Subject:** Reset your Botanique password

**Body text:**

> Hello,

We received a request to reset the password for your Botanique account. Use the secure link below to choose a new password:

%LINK%

If you did not request a password reset, you can ignore this email. Your password will not change unless you complete the reset.

For your security, do not share this link with anyone.

Botanique Support

## Suggested verification email

**Subject:** Verify your Botanique email address

**Body text:**

> Hello,

Thank you for creating a Botanique account. Please verify your email address using the secure link below:

%LINK%

If you did not create a Botanique account, you can ignore this email.

Thank you,
Botanique Support

## Notes

Firebase's built-in authentication email templates support branding and editable subject/body content, but do not provide the same full HTML/CSS control as an app-owned email service. To keep Firebase's single-use code validation and avoid introducing a second authentication-email sender, this patch improves the action page and provides polished, readable text templates rather than moving credentials/reset links into EmailJS. Verify the final look and delivery from Firebase Console using test accounts.
