
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.botanique.app',
  appName: 'Botanique',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#f7f5ef',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: false
    }
  }
};

export default config;
