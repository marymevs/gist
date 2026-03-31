/**
 * Connector interface — extensible data pull pattern.
 *
 * Every data source implements `pull(userId, date) → ConnectorResult<T>`.
 * The orchestrator calls all connectors in parallel via Promise.all,
 * then assembles the results into the generation context.
 */

export type ConnectorStatus = 'ok' | 'partial' | 'failed';

export type ConnectorResult<T> = {
  data: T;
  status: ConnectorStatus;
  error?: string;
};

/**
 * A connector pulls data for a single user on a single date.
 *
 * - `name`: unique identifier (e.g., 'calendar', 'weather', 'moon')
 * - `pull`: async function that fetches data. Must never throw —
 *   return status: 'failed' with an error message instead.
 */
export type Connector<T> = {
  name: string;
  pull: (ctx: ConnectorContext) => Promise<ConnectorResult<T>>;
};

export type ConnectorContext = {
  userId: string;
  userEmail?: string;
  dateKey: string;
  timezone: string;
  city: string;
  prefs?: {
    email?: {
      vipSenders?: string[];
      includeUnreadOnly?: boolean;
      includeInboxOnly?: boolean;
      maxCards?: number;
      lookbackHours?: number;
      maxCandidates?: number;
      enableAi?: boolean;
    };
  };
  now: Date;
};
