export interface EveningGist {
  id: string;
  userId: string;

  date: string;

  outcomes: string[];

  calendarPreferences: {
    deepWork: boolean;
    movement: boolean;
    earlyStart: boolean;
  };

  constraints: {
    mustDoBeforeNoon?: string;
    cannotHappen?: string;
  };

  agentTasks: {
    run: boolean;
    description: string;
    domain: 'email' | 'calendar' | 'web' | 'other';
    deadline?: string;
    confirm: boolean;
  }[];

  permissions: {
    draftOnly: boolean;
    sendMessages: boolean;
    scheduleEvents: boolean;
    purchasesAllowed: boolean;
    newLoginsAllowed: boolean;
    spendLimit: number;
  };

  reflection?: {
    win?: string;
    release?: string;
    intention?: string;
  };

  status: 'waiting' | 'parsed' | 'planned' | 'executed' | 'complete';

  createdAt: any;
}
