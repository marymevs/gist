export interface DeliveryLog {
  id: string;
  userId: string;

  type: 'morning';
  method: 'web' | 'email';

  status: 'queued' | 'delivered' | 'received' | 'failed';

  pages?: number;

  createdAt: any;
}
