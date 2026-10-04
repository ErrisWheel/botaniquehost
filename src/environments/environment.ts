// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces environment.ts with environment.prod.ts.

export const environment = {
  production: false,
  apiUrl: 'http://localhost:4000/api',

  // Firebase WEB app config (Firebase console -> Project settings -> Your apps).
  // These values are public identifiers, not secrets - security comes from
  // Firebase Auth rules + server-side token verification. Replace every
  // REPLACE_ME before running. NEVER put a service-account key here.
  firebase: {
    apiKey: 'AIzaSyAfDfyglDDGHcnKoHQEBtb0JRfs33INwA8',
    authDomain: 'botanique-authen.firebaseapp.com',
    projectId: 'botanique-authen',
    storageBucket: 'botanique-authen.firebasestorage.app',
    messagingSenderId: '325882027430',
    appId: '1:325882027430:web:9d95d7f21bc742b4dcc367'
  }
};
