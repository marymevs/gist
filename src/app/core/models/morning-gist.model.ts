export interface MorningGist {
  id: string;
  userId: string;

  date: string; // YYYY-MM-DD
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: {
    time?: string;
    title: string;
    note?: string;
  }[];

  worldItems: {
    headline: string;
    implication: string;
  }[];

  gistBullets: string[];

  oneThing: string;

  delivery: {
    method: 'web' | 'fax';
    pages: number;
    deliveredAt?: any;
    status: 'queued' | 'delivered' | 'failed';
  };

  createdAt: any;
}
