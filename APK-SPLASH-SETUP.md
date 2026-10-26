# Botanique Android splash-screen setup

The provided `resources/splash.png` and `resources/icon.png` are copies of `src/assets/images/logo.png`.

After installing dependencies, generate the native Android icon/splash assets and sync Capacitor:

```bash
npm install
npx capacitor-assets generate --android
npx cap sync android
```

Then build the APK from Android Studio. The Android platform folder is not included in this source archive, so generate/add it first if needed with `npx cap add android`.
