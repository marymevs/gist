export interface AgentExecution {
  id: string;
  userId: string;
  eveningGistId: string;

  taskType: 'email' | 'calendar' | 'web' | 'other';

  description: string;
  status: 'drafted' | 'confirmed' | 'executed' | 'failed';

  requiresConfirmation: boolean;

  executedAt?: any;
}
