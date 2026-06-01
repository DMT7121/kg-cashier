export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  paymentMethod?: 'cash' | 'card' | 'transfer';
  amount: number;
  note: string | null;
  timestamp: string; // ISO Datetime string
}
