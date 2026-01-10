export interface LyricEntry {
  id?: string;          // Firestore document id
  dateKey: string;      // e.g. '2025-12-11' – one per day
  songTitle: string;
  albumTitle?: string;
  lyric: string;        // the actual Drake bar
  analysis: string;     // the philosophical breakdown
  createdAt: number;    // timestamp (Date.now())
  updatedAt?: number;   // timestamp
}