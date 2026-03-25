export interface DeliveryLog {
  id: string;
  userId: string;

  type: 'morning' | 'evening';
  method: 'fax' | 'web' | 'email';

  status: 'queued' | 'delivered' | 'received' | 'failed';

  pages?: number;

  createdAt: any;
}
