import { Routes } from '@angular/router';
import { TodayComponent } from 'src/app/features/today/today.component';
import { EveningComponent } from './features/evening/evening.component';
import { ArchiveComponent } from './features/archive/archive.component';
import { DeliveryComponent } from './features/delivery/delivery.component';
import { AccountComponent } from './features/account/account.component';
import { LandingComponent } from './features/landing/landing.component';
import { SignupComponent } from './features/auth/signup.component';
import { LoginComponent } from './features/auth/login.component';

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
    path: 'today',
    component: TodayComponent,
    title: 'Gist — mygist.app',
  },

  {
    path: 'evening',
    component: EveningComponent,
    title: 'Evening Gist',
  },

  {
    path: 'archive',
    component: ArchiveComponent,
    title: 'Archive',
  },

  {
    path: 'delivery',
    component: DeliveryComponent,
    title: 'Delivery',
  },

  {
    path: 'account',
    component: AccountComponent,
    title: 'Account',
  },

  {
    path: '**',
    redirectTo: '',
  },
];
