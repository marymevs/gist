import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
} from 'firebase/auth';

@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./auth.shared.scss'],
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: Auth, private router: Router) {}

  async loginWithGoogle(): Promise<void> {
    this.error = '';
    this.loading = true;

    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      await this.router.navigate(['/today']);
    } catch (e: any) {
      this.error = e?.message ?? 'Google login failed.';
    } finally {
      this.loading = false;
    }
  }

  async loginWithEmail(): Promise<void> {
    this.error = '';
    this.loading = true;

    try {
      await signInWithEmailAndPassword(this.auth, this.email, this.password);
      await this.router.navigate(['/today']);
    } catch (e: any) {
      this.error = e?.message ?? 'Login failed.';
    } finally {
      this.loading = false;
    }
  }
}
