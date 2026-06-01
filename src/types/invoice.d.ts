export interface PaymentLine {
  method: 'cash' | 'card' | 'transfer' | 'other';
  amount: number;
}

export interface SAInvoiceDetail {
  itemRowKey: string;
  refId: string;
  refNo: string;
  refDate: string;
  workDate: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  discountAmount: number;
  isDrink: boolean;
  isFood: boolean;
}

export interface SAInvoice {
  refId: string;
  refNo: string;
  refDate: string;
  workDate: string;
  amount: number;
  payments: PaymentLine[];
  tableName: string;
  employeeName: string;
  status?: string;
  isPaid: boolean;
  isCancelled: boolean;
  isDeleted: boolean;
  rowHash: string;
  itemsCount: number;
  items?: SAInvoiceDetail[];
  manualOverrideJson?: string;
  manualLock?: boolean;
  manualOverride?: string | boolean;
}
