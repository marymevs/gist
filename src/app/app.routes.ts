import { Routes } from '@angular/router';
import { DailyLyricComponent } from 'src/app/features/daily-lyric/daily-lyric.component';
import { ArchiveComponent } from 'src/app/features/archive/archive.component';
import { AdminComponent } from 'src/app/features/admin/admin.component';

export const routes: Routes = [
  {
    path: '',
    component: DailyLyricComponent,
    title: 'Drake of the Day'
  },
  {
    path: 'archive',
    component: ArchiveComponent,
    title: 'Archive – Drake of the Day'
  },
  {
    path: 'admin',
    component: AdminComponent,
    title: 'Admin – Drake of the Day'
  },
  {
    path: '**',
    redirectTo: ''
  }
];

