import { Routes } from '@angular/router';
import { TodayComponent } from 'src/app/features/today/today.component';
import { EveningComponent } from './features/evening/evening.component';

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
    path: '**',
    redirectTo: '',
  },
];
