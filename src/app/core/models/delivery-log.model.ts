export interface DeliveryLog {
  id: string;
  userId: string;

  type: 'morning' | 'evening';
  method: 'fax' | 'web';

  status: 'queued' | 'delivered' | 'received' | 'failed';

  pages?: number;

  createdAt: any;
}
