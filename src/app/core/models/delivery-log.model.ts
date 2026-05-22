export interface DeliveryLog {
  id: string;
  userId: string;

  type: 'morning';
  method: 'fax' | 'web' | 'email';

  status: 'queued' | 'delivered' | 'received' | 'failed';

  pages?: number;

  createdAt: any;
}
