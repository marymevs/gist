import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { switchMap, map, take } from 'rxjs';
import { of } from 'rxjs';

/**
 * Redirects users to /onboarding if they haven't completed it.
 * Used on protected routes like /today, /archive, etc.
 */
export const requireOnboardingGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const firestore = inject(Firestore);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    switchMap((u) => {
      if (!u) return of(router.createUrlTree(['/login']));
      const ref = doc(firestore, 'users', u.uid);
      return docData(ref).pipe(
        take(1),
        map((data: any) => {
          if (data?.onboardingComplete) return true;
          return router.createUrlTree(['/onboarding']);
        }),
      );
    }),
  );
};

/**
 * Redirects users to /today if they've already completed onboarding.
 * Used on the /onboarding route.
 */
export const skipIfOnboardedGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const firestore = inject(Firestore);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    switchMap((u) => {
      if (!u) return of(router.createUrlTree(['/login']));
      const ref = doc(firestore, 'users', u.uid);
      return docData(ref).pipe(
        take(1),
        map((data: any) => {
          if (data?.onboardingComplete) return router.createUrlTree(['/today']);
          return true;
        }),
      );
    }),
  );
};
