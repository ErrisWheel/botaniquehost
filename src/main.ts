import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/shared/auth.service';
import { authInterceptor } from './app/shared/auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    // Explicit HTTP client; the interceptor attaches a fresh Firebase ID token.
    provideHttpClient(withInterceptors([authInterceptor])),
    // Restore the Firebase session before any page loads.
    provideAppInitializer(() => inject(AuthService).init()),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
});
