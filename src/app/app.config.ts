import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import {
  provideFunctions,
  getFunctions,
  connectFunctionsEmulator,
} from '@angular/fire/functions';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { provideStorage, getStorage } from '@angular/fire/storage';
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
    // Firestore always hits production — real user doc needed for function to work.
    provideFirestore(() => getFirestore()),
    // Auth always hits production — Google OAuth doesn't work through the emulator.
    // Real ID tokens issued by production Auth are accepted by the Functions emulator.
    provideAuth(() => getAuth()),
    provideFunctions(() => {
      const functions = getFunctions();
      if (useEmulators) connectFunctionsEmulator(functions, 'localhost', 5001);
      return functions;
    }),
    provideStorage(() => getStorage()),
    provideMessaging(() => getMessaging()),
    provideRouter(routes),
  ],
};
