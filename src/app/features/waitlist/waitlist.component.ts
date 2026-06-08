import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './waitlist.component.html',
  styleUrls: ['../auth/auth.shared.scss'],
})
export class WaitlistComponent {
  email = '';
  name = '';
  loading = false;
  submitted = false;
  error = '';

  constructor(private firestore: Firestore) {}

  async join(): Promise<void> {
    const email = this.email.trim();
    if (!email) {
      this.error = 'Please enter your email.';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      const ref = collection(this.firestore, 'waitlist');
      await addDoc(ref, {
        email,
        name: this.name.trim() || null,
        source: 'web',
        createdAt: serverTimestamp(),
      });
      this.submitted = true;
    } catch (e: any) {
      this.error = e?.message ?? 'Something went wrong. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
