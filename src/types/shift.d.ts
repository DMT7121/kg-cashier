import { Transaction } from './transaction';

export interface CashCountDetail {
  [denomination: string]: number;
}

export interface ShiftSummary {
  totalIncome: number;
  totalExpense: number;
  cashIncome: number;
  cardIncome: number;
  transferIncome: number;
  cashExpense: number;
  otherIncome: number;
  otherExpense: number;
  cukcukRevenue: number;
  cukcukBills: number;
  billCount: number;
  expectedCash: number;
  manualIncome: number;
  manualBills: number;
  revenue: number;
  netTotal: number;
  cashCountTotal: number;
  discrepancy: number;
}

export interface Shift {
  id: string;
  cashierName: string;
  shiftNumber: number;
  date: string;
  startTime: string;
  endTime: string | null;
  startingCash: number;
  transactions: Transaction[];
  otherTransactions: Transaction[];
  cashCount: CashCountDetail;
  cashCountTotal?: number;
  status: 'open' | 'closed';
  notes: string;
  shiftPassword?: string;
  cashToKeep: number;
  cashToDeposit: number;
  reopenedAt?: string;
  lastReopenedAt?: string;
  reclosedAt?: string;
  discrepancyNotes?: string;
  originalSummarySnapshot?: ShiftSummary;
  updatedAt: string;
  version: number;
  deviceId: string;
  
  // Snapshots and detail count states
  pinnedCash?: CashCountDetail;
  keepCash?: CashCountDetail;
  handoverCash?: CashCountDetail;
  drinkInventorySnapshot?: any;
  cukcukInvoicesSnapshot?: any[];
  originalCukcukInvoicesSnapshot?: any[];
  summarySnapshot?: ShiftSummary;
  invoices?: any[];
}
