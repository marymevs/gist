import { Routes } from '@angular/router';
import { TodayComponent } from 'src/app/features/today/today.component';
import { EveningComponent } from './features/evening/evening.component';
import { ArchiveComponent } from './features/archive/archive.component';
import { DeliveryComponent } from './features/delivery/delivery.component';
import { AccountComponent } from './features/account/account.component';

export const routes: Routes = [
  {
    path: '',
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
