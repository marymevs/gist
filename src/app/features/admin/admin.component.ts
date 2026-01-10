import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LyricsService } from 'src/app/core/services/lyrics.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent {
  private lyricsService = inject(LyricsService);

  dateKey = this.lyricsService.getTodayKey();
  songTitle = '';
  albumTitle = '';
  lyric = '';
  analysis = '';
  saving = false;
  successMessage = '';
  errorMessage = '';

  async save() {
    this.saving = true;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await this.lyricsService.upsertLyricForDate({
        dateKey: this.dateKey,
        songTitle: this.songTitle.trim(),
        albumTitle: this.albumTitle.trim() || undefined,
        lyric: this.lyric.trim(),
        analysis: this.analysis.trim()
      });

      this.successMessage = 'Saved successfully. Today’s bar is live.';
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Something went wrong saving this entry.';
    } finally {
      this.saving = false;
    }
  }
}
