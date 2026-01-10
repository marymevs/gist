import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
  limit,
  doc,
  setDoc
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { LyricEntry } from '../models/lyric-entry.model';

@Injectable({
  providedIn: 'root'
})
export class LyricsService {
  private firestore = inject(Firestore);
  private readonly COLLECTION_NAME = 'lyrics';

  private get collectionRef() {
    return collection(this.firestore, this.COLLECTION_NAME);
  }

  /** Today as a YYYY-MM-DD key (client-side) */
  getTodayKey(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Get lyric for a given date key */
  getLyricByDate$(dateKey: string): Observable<LyricEntry | null> {
    const q = query(
      this.collectionRef,
      where('dateKey', '==', dateKey),
      limit(1)
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(results => (results[0] as LyricEntry | undefined) ?? null)
    );
  }

  /** Get today's lyric (client-time) */
  getTodayLyric$(): Observable<LyricEntry | null> {
    const todayKey = this.getTodayKey();
    return this.getLyricByDate$(todayKey);
  }

  /** Get all lyrics, newest first, for archive view */
  getArchiveLyrics$(): Observable<LyricEntry[]> {
    const todayKey = this.getTodayKey();

    const q = query(
      this.collectionRef,
      where('dateKey', '<', todayKey),
      orderBy('dateKey', 'desc')
    );

    return collectionData(q, { idField: 'id' }) as Observable<LyricEntry[]>;
  }

  /** Create or overwrite a lyric entry for a given dateKey */
  async upsertLyricForDate(entry: Omit<LyricEntry, 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = Date.now();
    const dateKey = entry.dateKey;

    const docRef = doc(this.collectionRef, dateKey); // one doc per date
    const payload: LyricEntry = {
      ...entry,
      createdAt: now,
      updatedAt: now
    };

    await setDoc(docRef, payload, { merge: true });
  }
}
