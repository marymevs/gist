import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  private themeService = inject(ThemeService);
  private auth = inject(Auth);

  readonly theme = this.themeService.theme;
  readonly user$ = authState(this.auth);

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
