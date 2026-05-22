export interface DeliveryLog {
  id: string;
  userId: string;

  type: 'morning';
  method: 'web' | 'email';

  status: 'queued' | 'delivered' | 'failed';

  pages?: number;

  createdAt: any;
}
