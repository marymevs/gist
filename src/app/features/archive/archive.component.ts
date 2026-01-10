import { Component, OnInit, inject } from '@angular/core';
import { AsyncPipe, NgForOf, DatePipe } from '@angular/common';
import { LyricsService } from '../../core/services/lyrics.service';
import { LyricEntry } from '../../core/models/lyric-entry.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [AsyncPipe, NgForOf, DatePipe],
  templateUrl: './archive.component.html',
  styleUrls: ['./archive.component.scss']
})
export class ArchiveComponent implements OnInit {
  private lyricsService = inject(LyricsService);

  lyrics$!: Observable<LyricEntry[]>;

  ngOnInit(): void {
    this.lyrics$ = this.lyricsService.getArchiveLyrics$();
  }
}
