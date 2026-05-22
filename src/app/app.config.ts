import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';
import { provideAuth, getAuth } from '@angular/fire/auth';
import {
  provideFirestore,
  getFirestore,
  connectFirestoreEmulator,
} from '@angular/fire/firestore';
import {
  provideFunctions,
  getFunctions,
  connectFunctionsEmulator,
} from '@angular/fire/functions';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import {
  provideStorage,
  getStorage,
  connectStorageEmulator,
} from '@angular/fire/storage';
import { routes } from './app.routes';
import { provideRouter } from '@angular/router';
import {
  getAnalytics,
  provideAnalytics,
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';
import { getDatabase, provideDatabase } from '@angular/fire/database';

const useEmulators = typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (useEmulators) connectFirestoreEmulator(firestore, 'localhost', 8080);
      return firestore;
    }),
    // Auth always hits production — Google OAuth doesn't work through the emulator.
    // Real ID tokens issued by production Auth are accepted by the Functions emulator.
    provideAuth(() => getAuth()),
    provideFunctions(() => {
      const functions = getFunctions();
      if (useEmulators) connectFunctionsEmulator(functions, 'localhost', 5001);
      return functions;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (useEmulators) connectStorageEmulator(storage, 'localhost', 9199);
      return storage;
    }),
    provideMessaging(() => getMessaging()),
    provideRouter(routes),
  ],
};
