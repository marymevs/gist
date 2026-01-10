import { Component, OnInit, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { LyricsService } from 'src/app/core/services/lyrics.service'; // adjust path if yours is different
import { LyricEntry } from 'src/app/core/models/lyric-entry.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-daily-lyric-page',
  standalone: true,
  imports: [AsyncPipe, NgIf],
  templateUrl: './daily-lyric.component.html',
  styleUrls: ['./daily-lyric.component.scss']
})
export class DailyLyricComponent implements OnInit {
  private lyricsService = inject(LyricsService);

  currentDateKey!: string;
  currentLyric$!: Observable<LyricEntry | null>;
  showAnalysis = false;

  ngOnInit(): void {
    // start on today
    this.setDateKey(this.lyricsService.getTodayKey());
  }

  seeToday(): void {
    const todayKey = this.lyricsService.getTodayKey();
    this.setDateKey(todayKey);
  }

  // So that we will only show 'see today' button if we are not looking at today
  get isOnToday(): boolean {
  return this.currentDateKey === this.lyricsService.getTodayKey();
}

  /** UI: toggle analysis card on/off */
  toggleAnalysis(): void {
    this.showAnalysis = !this.showAnalysis;
  }

  /** Logic: go to the previous calendar day */
  seeYesterday(): void {
  const [year, month, day] = this.currentDateKey
    .split('-')
    .map(Number);

  // month is 0-based in JS Dates
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() - 1);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  const yesterdayKey = `${yyyy}-${mm}-${dd}`;
  this.setDateKey(yesterdayKey);
}

  /** Helper: update both the date label and observable */
  private setDateKey(dateKey: string): void {
    this.currentDateKey = dateKey;
    this.currentLyric$ = this.lyricsService.getLyricByDate$(dateKey);
    this.showAnalysis = false; // reset when switching days
  }
}
