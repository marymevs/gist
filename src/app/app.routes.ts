import { Routes } from '@angular/router';
import { TodayComponent } from 'src/app/features/today/today.component';
import { EveningComponent } from './features/evening/evening.component';
import { ArchiveComponent } from './features/archive/archive.component';
import { DeliveryComponent } from './features/delivery/delivery.component';
import { AccountComponent } from './features/account/account.component';
import { LandingComponent } from './features/landing/landing.component';
import { SignupComponent } from './features/auth/signup.component';
import { LoginComponent } from './features/auth/login.component';
import { OnboardingComponent } from './features/onboarding/onboarding.component';
import { PrivacyPolicyComponent } from './features/privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from './features/terms-of-service/terms-of-service.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: LandingComponent,
    title: 'Gist — mygist.app',
  },

  {
    path: 'signup',
    component: SignupComponent,
    title: 'Gist — mygist.app',
  },

  {
    path: 'login',
    component: LoginComponent,
    title: 'Gist — mygist.app',
  },

  {
    path: 'onboarding',
    component: OnboardingComponent,
    canActivate: [authGuard],
    title: 'Set up your Gist',
  },

  {
    path: 'today',
    component: TodayComponent,
    canActivate: [authGuard],
    title: 'Gist — mygist.app',
  },

  {
    path: 'evening',
    component: EveningComponent,
    canActivate: [authGuard],
    title: 'Evening Gist',
  },

  {
    path: 'archive',
    component: ArchiveComponent,
    canActivate: [authGuard],
    title: 'Archive',
  },

  {
    path: 'delivery',
    component: DeliveryComponent,
    canActivate: [authGuard],
    title: 'Delivery',
  },

  {
    path: 'account',
    component: AccountComponent,
    canActivate: [authGuard],
    title: 'Account',
  },

  {
    path: 'privacy',
    component: PrivacyPolicyComponent,
    title: 'Privacy Policy — Gist',
  },

  {
    path: 'terms',
    component: TermsOfServiceComponent,
    title: 'Terms of Service — Gist',
  },

  {
    path: '**',
    redirectTo: '',
  },
];
