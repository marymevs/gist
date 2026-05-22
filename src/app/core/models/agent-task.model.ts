export interface AgentExecution {
  id: string;
  userId: string;

  taskType: 'email' | 'calendar' | 'web' | 'other';

  description: string;
  status: 'drafted' | 'confirmed' | 'executed' | 'failed';

  requiresConfirmation: boolean;

  executedAt?: any;
}
