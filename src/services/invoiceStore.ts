/* ============================================
   CUKCUK Invoice Store — IndexedDB Service (TypeScript)
   ============================================ */

import { invoicesDb } from './db';
import { SAInvoice, SAInvoiceDetail, PaymentLine } from '../types/invoice';
import { getWorkingDayRange, toMoney, addMoney } from '../utils';

const STORE_VERSION = 1;

// ── CRUD Operations ──

/** Check if an invoice exists by RefId */
export async function hasInvoice(refId: string): Promise<boolean> {
  const val = await invoicesDb.getItem(refId);
  return !!val;
}

/** 
 * Add or update an invoice. Returns true if NEWLY added, false if updated/existed.
 */
export async function upsertInvoice(invoice: SAInvoice): Promise<boolean> {
  const key = String(invoice.refId);
  const existing = await invoicesDb.getItem<SAInvoice>(key);
  const isNew = !existing;
  
  if (existing && (existing.manualOverride || (existing as any).isManuallyEdited)) {
    invoice.payments = existing.payments;
    invoice.manualOverride = true;
    (invoice as any).isManuallyEdited = true;
    if (existing.amount) invoice.amount = existing.amount; // Preserve amount if modified
  }
  
  await invoicesDb.setItem(key, invoice);
  return isNew;
}

/** Bulk upsert — returns count of newly added */
export async function bulkUpsert(invoices: SAInvoice[]): Promise<number> {
  let newCount = 0;
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const key = String(inv.refId);
    const existing = await invoicesDb.getItem<SAInvoice>(key);
    if (!existing) newCount++;
    
    if (existing && (existing.manualOverride || (existing as any).isManuallyEdited)) {
      inv.payments = existing.payments;
      inv.manualOverride = true;
      (inv as any).isManuallyEdited = true;
      if (existing.amount) inv.amount = existing.amount;
    }
    
    await invoicesDb.setItem(key, inv);
  }
  return newCount;
}

/** Get a single invoice by RefId */
export async function getInvoice(refId: string): Promise<SAInvoice | null> {
  return await invoicesDb.getItem<SAInvoice>(refId);
}

/** Get all invoices as array */
export async function getAllInvoices(): Promise<SAInvoice[]> {
  const result: SAInvoice[] = [];
  await invoicesDb.iterate<SAInvoice, void>((value) => {
    result.push(value);
  });
  return result;
}

/** Get total invoice count */
export async function getInvoiceCount(): Promise<number> {
  const keys = await invoicesDb.keys();
  return keys.length;
}

/** Get invoice count for a specific date (working day YYYY-MM-DD) */
export async function getCountByDate(dateStr: string): Promise<number> {
  let count = 0;
  await invoicesDb.iterate<SAInvoice, void>((value) => {
    const workDate = value.workDate || (value as any).date;
    if (workDate === dateStr) {
      count++;
    }
  });
  return count;
}

/** Check if there are any unpaid invoices for a given date */
export async function hasUnpaidInvoices(dateStr: string): Promise<boolean> {
  let foundUnpaid = false;
  await invoicesDb.iterate<SAInvoice, void>((value) => {
    const workDate = value.workDate || (value as any).date;
    if (workDate === dateStr && (value as any).unpaid) {
      foundUnpaid = true;
      return; // Stop iteration early
    }
  });
  return foundUnpaid;
}

// ── Working Day Boundaries ──
// Ngày làm việc: 12:00 trưa → 06:00 sáng hôm sau

function _parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  
  if (typeof val === 'string') {
    // .NET JSON format: "/Date(1234567890000)/"
    const netMatch = val.match(/\/Date\((\d+)\)\//);
    if (netMatch) return new Date(parseInt(netMatch[1]));
  }
  
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d;
  
  // Try dd/mm/yyyy HH:mm
  if (typeof val === 'string') {
    const parts = val.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?/);
    if (parts) {
      return new Date(
        parseInt(parts[3]),
        parseInt(parts[2]) - 1,
        parseInt(parts[1]),
        parseInt(parts[4] || '0'),
        parseInt(parts[5] || '0')
      );
    }
  }
  
  return null;
}

function _workingDayDate(dt: any): string {
  const d = _parseDate(dt);
  if (!d) {
    const now = new Date();
    return _dateStr(now);
  }
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return _dateStr(d);
}

function _dateStr(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export interface PeriodBounds {
  start: Date;
  end: Date;
  label: string;
}

export function getPeriodBounds(period: string, refDate?: string | Date): PeriodBounds {
  let now: Date;
  let shouldShift = true;

  if (refDate) {
    if (typeof refDate === 'string') {
      const parts = refDate.split('-');
      if (parts.length === 3) {
        now = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      } else {
        now = new Date(refDate);
      }
      shouldShift = false;
    } else {
      now = new Date(refDate.getTime());
      if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
        shouldShift = false;
      }
    }
  } else {
    now = new Date();
  }

  const workNow = new Date(now);
  if (shouldShift && workNow.getHours() < 6) {
    workNow.setDate(workNow.getDate() - 1);
  }

  let start: Date;
  let end: Date;
  let label: string;

  const _pad2 = (n: number) => String(n).padStart(2, '0');

  switch (period) {
    case 'day': {
      const dateStr = _dateStr(workNow);
      const range = getWorkingDayRange(dateStr);
      start = range.start;
      end = range.end;
      label = `Hôm nay (${_pad2(workNow.getDate())}/${_pad2(workNow.getMonth() + 1)})`;
      break;
    }
    case 'week': {
      const dayOfWeek = workNow.getDay(); // 0=CN, 1=T2...
      const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mon = new Date(workNow);
      mon.setDate(mon.getDate() - daysToMon);
      start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), 12, 0, 0);
      const nextMon = new Date(mon);
      nextMon.setDate(nextMon.getDate() + 7);
      end = new Date(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate(), 6, 0, 0);
      label = `Tuần (${_pad2(mon.getDate())}/${_pad2(mon.getMonth() + 1)} → ${_pad2(nextMon.getDate())}/${_pad2(nextMon.getMonth() + 1)})`;
      break;
    }
    case 'month': {
      start = new Date(workNow.getFullYear(), workNow.getMonth(), 1, 12, 0, 0);
      const nm = new Date(workNow.getFullYear(), workNow.getMonth() + 1, 1);
      end = new Date(nm.getFullYear(), nm.getMonth(), nm.getDate(), 6, 0, 0);
      label = `Tháng ${workNow.getMonth() + 1}/${workNow.getFullYear()}`;
      break;
    }
    case 'quarter': {
      const qStart = Math.floor(workNow.getMonth() / 3) * 3;
      start = new Date(workNow.getFullYear(), qStart, 1, 12, 0, 0);
      end = new Date(workNow.getFullYear(), qStart + 3, 1, 6, 0, 0);
      label = `Quý ${Math.floor(qStart / 3) + 1}/${workNow.getFullYear()}`;
      break;
    }
    case 'year':
    default: {
      start = new Date(workNow.getFullYear(), 0, 1, 12, 0, 0);
      end = new Date(workNow.getFullYear() + 1, 0, 1, 6, 0, 0);
      label = `Năm ${workNow.getFullYear()}`;
      break;
    }
  }

  return { start, end, label };
}

function _effectiveTotal(inv: SAInvoice): number {
  const payments = inv.payments;
  if (payments && payments.length > 0) {
    let sum = 0;
    for (let i = 0; i < payments.length; i++) {
      sum += payments[i].amount || 0;
    }
    return sum;
  }
  return inv.amount || 0;
}

function _isInBounds(inv: SAInvoice, bounds: PeriodBounds): boolean {
  if (inv.refDate) {
    const dt = _parseDate(inv.refDate);
    if (dt) {
      return dt >= bounds.start && dt < bounds.end;
    }
  }
  const dateStrVal = inv.workDate || (inv as any).date;
  if (dateStrVal) {
    const fromStr = _dateStr(bounds.start);
    const toStr = _dateStr(bounds.end);
    return dateStrVal >= fromStr && dateStrVal <= toStr;
  }
  return false;
}

/** Lọc hóa đơn theo kỳ — chính xác theo timestamp, loại trừ bill chưa thanh toán */
export async function getInvoicesForPeriod(period: string, refDate?: string | Date): Promise<SAInvoice[]> {
  const bounds = getPeriodBounds(period, refDate);
  const all = await getAllInvoices();
  return all.filter((inv) => {
    if ((inv as any).unpaid) return false;
    return _isInBounds(inv, bounds);
  });
}

// ── Revenue Summaries ──

export interface RevenueSummaryResult {
  period: string;
  periodLabel: string;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalBills: number;
  avgPerBill: number;
  avgDaily: number;
  daysWithData: number;
  firstDate: string;
  lastDate: string;
}

/** Tổng hợp doanh thu theo kỳ */
export async function getRevenueSummary(period: string, refDate?: string | Date): Promise<RevenueSummaryResult> {
  const invoices = await getInvoicesForPeriod(period, refDate);
  const bounds = getPeriodBounds(period, refDate);
  
  const result: RevenueSummaryResult = {
    period: period,
    periodLabel: bounds.label,
    totalRevenue: 0,
    totalCash: 0,
    totalCard: 0,
    totalTransfer: 0,
    totalBills: invoices.length,
    avgPerBill: 0,
    avgDaily: 0,
    daysWithData: 0,
    firstDate: '',
    lastDate: ''
  };

  const dateSet: Record<string, boolean> = {};

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    result.totalRevenue += _effectiveTotal(inv);
    
    const wDay = inv.refDate ? _workingDayDate(inv.refDate) : (inv.workDate || (inv as any).date || '');
    dateSet[wDay] = true;
    if (!result.firstDate || wDay < result.firstDate) result.firstDate = wDay;
    if (!result.lastDate || wDay > result.lastDate) result.lastDate = wDay;

    const payments = inv.payments || [];
    for (let j = 0; j < payments.length; j++) {
      switch (payments[j].method) {
        case 'cash': result.totalCash += payments[j].amount || 0; break;
        case 'card': result.totalCard += payments[j].amount || 0; break;
        case 'transfer': result.totalTransfer += payments[j].amount || 0; break;
      }
    }
  }

  result.daysWithData = Object.keys(dateSet).length;
  result.avgPerBill = result.totalBills > 0 ? Math.round(result.totalRevenue / result.totalBills) : 0;
  result.avgDaily = result.daysWithData > 0 ? Math.round(result.totalRevenue / result.daysWithData) : 0;

  return result;
}

export interface DailyBreakdownItem {
  date: string;
  total: number;
  cash: number;
  card: number;
  transfer: number;
  bills: number;
}

/** Phân tích doanh thu theo ngày làm việc, sắp xếp giảm dần */
export async function getDailyBreakdown(period: string, refDate?: string | Date): Promise<DailyBreakdownItem[]> {
  const invoices = await getInvoicesForPeriod(period, refDate);
  const days: Record<string, DailyBreakdownItem> = {};

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const wDay = inv.refDate ? _workingDayDate(inv.refDate) : (inv.workDate || (inv as any).date || 'unknown');
    
    if (!days[wDay]) {
      days[wDay] = { date: wDay, total: 0, cash: 0, card: 0, transfer: 0, bills: 0 };
    }
    days[wDay].total += _effectiveTotal(inv);
    days[wDay].bills++;

    const payments = inv.payments || [];
    for (let j = 0; j < payments.length; j++) {
      switch (payments[j].method) {
        case 'cash': days[wDay].cash += payments[j].amount || 0; break;
        case 'card': days[wDay].card += payments[j].amount || 0; break;
        case 'transfer': days[wDay].transfer += payments[j].amount || 0; break;
      }
    }
  }

  return Object.values(days).sort((a, b) => (a.date > b.date ? -1 : 1));
}

export interface TodayRevenueResult {
  date: string;
  total: number;
  cash: number;
  card: number;
  transfer: number;
  bills: number;
  lastSync: string;
}

/** Get revenue for today (working day) using period bounds */
export async function getTodayRevenue(): Promise<TodayRevenueResult> {
  const bounds = getPeriodBounds('day');
  const invoices = await getInvoicesForPeriod('day');
  const workingDate = _dateStr(bounds.start);
  
  const result: TodayRevenueResult = {
    date: workingDate,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    bills: invoices.length,
    lastSync: ''
  };

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    result.total += _effectiveTotal(inv);
    const syncedAt = (inv as any).syncedAt || '';
    if (syncedAt > result.lastSync) result.lastSync = syncedAt;

    const payments = inv.payments || [];
    for (let j = 0; j < payments.length; j++) {
      switch (payments[j].method) {
        case 'cash': result.cash += payments[j].amount || 0; break;
        case 'card': result.card += payments[j].amount || 0; break;
        case 'transfer': result.transfer += payments[j].amount || 0; break;
      }
    }
  }

  return result;
}

/** Get invoices for a specific date (YYYY-MM-DD) — utility, excludes unpaid */
export async function getInvoicesByDate(dateStr: string): Promise<SAInvoice[]> {
  const all = await getAllInvoices();
  return all.filter((inv) => {
    const workDate = inv.workDate || (inv as any).date;
    return workDate === dateStr && !(inv as any).unpaid;
  });
}

/** Get invoices strictly within a shift's time window (Respects startTime/endTime if available) */
export async function getInvoicesByShiftTime(dateStr: string, startTime?: string, endTime?: string): Promise<SAInvoice[]> {
  const allForDate = await getInvoicesByDate(dateStr);
  const dp = dateStr.split('-');
  
  const startT = startTime 
    ? new Date(startTime).getTime() 
    : new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), 12, 0, 0).getTime();
  const endT = endTime 
    ? new Date(endTime).getTime() 
    : new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]) + 1, 6, 0, 0).getTime();
  
  return allForDate.filter((inv) => {
    if (!inv.refDate) return false;
    let dt: number;
    const match = String(inv.refDate).match(/\/Date\((\d+)\)\//);
    if (match) dt = parseInt(match[1]);
    else dt = new Date(inv.refDate).getTime();
    
    return dt >= startT && dt <= endT;
  });
}

/** Edit payment methods on an invoice directly in the store */
export async function editInvoicePayment(refId: string, newPayments: PaymentLine[]): Promise<{ oldPayments: PaymentLine[], newPayments: PaymentLine[] }> {
  const key = String(refId);
  const inv = await invoicesDb.getItem<SAInvoice>(key);
  if (!inv) throw new Error('Không tìm thấy hóa đơn: ' + refId);
  const oldPayments = inv.payments || [];
  inv.payments = newPayments;
  inv.manualOverride = JSON.stringify(newPayments);
  (inv as any).isManuallyEdited = true;
  (inv as any).unpaid = false;
  let total = 0;
  for (let i = 0; i < newPayments.length; i++) {
    total += newPayments[i].amount || 0;
  }
  if (total > 0) inv.amount = total;
  await invoicesDb.setItem(key, inv);
  return { oldPayments, newPayments };
}

// ── Google Sheets Tracking ──

/** Mark invoices as pushed to Google Sheets */
export async function markPushedToSheets(refIds: string[]): Promise<void> {
  for (let i = 0; i < refIds.length; i++) {
    const key = String(refIds[i]);
    const inv = await invoicesDb.getItem<SAInvoice>(key);
    if (inv) {
      (inv as any).pushedToSheets = true;
      await invoicesDb.setItem(key, inv);
    }
  }
}

/** Get invoices not yet pushed to Sheets */
export async function getUnpushedInvoices(): Promise<SAInvoice[]> {
  const all = await getAllInvoices();
  return all.filter((inv) => !(inv as any).pushedToSheets);
}

// ── Maintenance ──

/** Clear all data (for reset) */
export async function clearAll(): Promise<void> {
  await invoicesDb.clear();
}

/** Remove invoices older than N days */
export async function cleanupOlderThan(days: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = _dateStr(cutoff);

  const keys = await invoicesDb.keys();
  let removed = 0;
  for (const key of keys) {
    const inv = await invoicesDb.getItem<SAInvoice>(key);
    if (inv) {
      const workDate = inv.workDate || (inv as any).date || '';
      if (workDate < cutoffStr) {
        await invoicesDb.removeItem(key);
        removed++;
      }
    }
  }
  return removed;
}

/**
 * Auto-cleanup invoices older than 90 days to prevent browser database bloat.
 */
export async function cleanupOldInvoices(maxDays = 90): Promise<number> {
  const removed = await cleanupOlderThan(maxDays);
  if (removed > 0) {
    console.log(`[InvoiceStore] Auto-cleanup: removed ${removed} invoices older than ${maxDays} days from IndexedDB`);
  }
  return removed;
}

// ── Cross Device Sync ──

/** Push today's invoices to cloud for cross-device sync. */
export async function pushInvoicesToCloud(dateStr: string): Promise<void> {
  try {
    const { saveConfigToCloud } = await import('./api');
    const invoices = await getInvoicesByDate(dateStr);
    if (invoices.length === 0) return;

    // Compact format: only fields needed to reconstruct on other devices
    const compact = invoices.map((inv) => ({
      refId: inv.refId,
      refNo: inv.refNo,
      refDate: inv.refDate,
      date: inv.workDate || (inv as any).date,
      tableName: inv.tableName,
      employeeName: inv.employeeName,
      amount: inv.amount,
      payments: inv.payments,
      unpaid: (inv as any).unpaid,
      syncedAt: (inv as any).syncedAt,
      isManuallyEdited: (inv as any).isManuallyEdited
    }));

    await saveConfigToCloud('cukcuk_invoices_' + dateStr, compact);
    console.log(`[InvoiceStore] ☁️ Pushed ${compact.length} invoices to cloud for ${dateStr}`);
  } catch (e: any) {
    console.warn('[InvoiceStore] Cloud push failed:', e.message);
  }
}

/** Pull invoices from cloud and merge missing ones into local store. */
export async function pullInvoicesFromCloud(dateStr: string): Promise<number> {
  try {
    const { getConfigFromCloud } = await import('./api');
    const result = await getConfigFromCloud();
    if (!result || !result.success) return 0;
    const configData = result.config || result.data || {};
    if (!configData || typeof configData !== 'object') return 0;

    const cloudInvoices = configData['cukcuk_invoices_' + dateStr];
    if (!Array.isArray(cloudInvoices) || cloudInvoices.length === 0) return 0;

    let added = 0;
    for (let i = 0; i < cloudInvoices.length; i++) {
      const inv = cloudInvoices[i];
      const key = String(inv.refId);
      const existing = await invoicesDb.getItem<SAInvoice>(key);
      if (!existing) {
        const newInv: SAInvoice = {
          refId: inv.refId,
          refNo: inv.refNo || '',
          refDate: inv.refDate || '',
          workDate: inv.date || dateStr,
          tableName: inv.tableName || '',
          employeeName: inv.employeeName || '',
          amount: inv.amount || 0,
          payments: inv.payments || [],
          isPaid: !inv.unpaid,
          isCancelled: false,
          isDeleted: false,
          rowHash: '',
          itemsCount: 0
        };
        (newInv as any).unpaid = !!inv.unpaid;
        (newInv as any).syncedAt = inv.syncedAt || new Date().toISOString();
        (newInv as any).pushedToSheets = false;
        (newInv as any).isManuallyEdited = !!inv.isManuallyEdited;
        
        await invoicesDb.setItem(key, newInv);
        added++;
      } else if (inv.isManuallyEdited && !existing.manualOverride) {
        existing.payments = inv.payments || [];
        existing.amount = inv.amount || 0;
        existing.manualOverride = JSON.stringify(inv.payments);
        (existing as any).isManuallyEdited = true;
        (existing as any).unpaid = false;
        await invoicesDb.setItem(key, existing);
        added++;
      }
    }

    if (added > 0) {
      console.log(`[InvoiceStore] ☁️ Pulled ${added} new invoices from cloud (total cloud: ${cloudInvoices.length})`);
    }
    return added;
  } catch (e: any) {
    console.warn('[InvoiceStore] Cloud pull failed:', e.message);
    return 0;
  }
}

/**
 * Merges raw invoices loaded from Google Sheets (KG_CUKCUK_INVOICES) into local IndexedDB.
 * Respects ManualLock / manual overrides correctly.
 */
export async function mergeCloudInvoices(cloudInvoices: any[]): Promise<number> {
  let added = 0;
  for (let i = 0; i < cloudInvoices.length; i++) {
    const raw = cloudInvoices[i];
    const refId = String(raw.RefId || raw.refId || '');
    if (!refId) continue;

    const existing = await invoicesDb.getItem<SAInvoice>(refId);
    
    // Parse payments list from Sheet row
    let payments: PaymentLine[] = [];
    const manualLock = raw.ManualLock === true || String(raw.ManualLock).toLowerCase() === 'true';
    const jsonStr = manualLock ? (raw.ManualOverrideJson || raw.PaymentJson) : raw.PaymentJson;
    
    if (jsonStr) {
      try {
        payments = JSON.parse(jsonStr);
      } catch (e) {
        payments = [];
      }
    }

    // Determine values
    const amount = Number(raw.Amount) || 0;
    const isPaid = raw.IsPaid === true || String(raw.IsPaid).toLowerCase() === 'true';
    const isCancelled = raw.IsCancelled === true || String(raw.IsCancelled).toLowerCase() === 'true';
    const isDeleted = raw.IsDeleted === true || String(raw.IsDeleted).toLowerCase() === 'true';

    // If local version has manualOverride but cloud version doesn't have ManualLock yet,
    // we should preserve local override until it's successfully pushed to Sheets.
    if (existing && (existing.manualOverride || (existing as any).isManuallyEdited) && !manualLock) {
      continue; 
    }

    const newInv: SAInvoice = {
      refId: refId,
      refNo: String(raw.RefNo || raw.refNo || ''),
      refDate: String(raw.RefDate || raw.refDate || ''),
      workDate: String(raw.WorkDate || raw.workDate || ''),
      tableName: String(raw.TableName || raw.tableName || ''),
      employeeName: String(raw.EmployeeName || raw.employeeName || ''),
      amount: amount,
      payments: payments,
      isPaid: isPaid,
      isCancelled: isCancelled,
      isDeleted: isDeleted,
      rowHash: String(raw.RowHash || raw.rowHash || ''),
      itemsCount: Number(raw.ItemsCount || raw.itemsCount) || 0
    };
    (newInv as any).unpaid = !isPaid;
    (newInv as any).syncedAt = String(raw.UpdatedAt || raw.LastFetchedAt || new Date().toISOString());
    (newInv as any).pushedToSheets = true; // Loaded from Sheets, so it is already on Sheets
    
    if (manualLock) {
      newInv.manualOverride = true;
      (newInv as any).isManuallyEdited = true;
    }

    await invoicesDb.setItem(refId, newInv);
    added++;
  }
  return added;
}
