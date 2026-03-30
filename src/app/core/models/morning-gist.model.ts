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

  emailCards: {
    id: string;
    threadId: string;
    messageId: string;
    fromName?: string;
    fromEmail?: string;
    subject: string;
    snippet: string;
    receivedAt: string;
    category: 'Action' | 'WaitingOn' | 'FYI';
    urgency: number;
    importance: number;
    why: string;
    suggestedNextStep?: string;
  }[];

  gistBullets: string[];

  oneThing: string;

  delivery: {
    method: 'web' | 'email' | 'fax';
    pages: number;
    deliveredAt?: any;
    status: 'queued' | 'delivered' | 'failed';
    /** iFax job ID — present on fax deliveries, used to correlate webhook callbacks. */
    ifaxJobId?: string;
  };

  createdAt: any;
}
