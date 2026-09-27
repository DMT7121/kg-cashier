import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { showToast, showConfirm, formatCurrency, getWorkingDay, getWorkingDayRange } from '../utils';
import {
  syncCukcukRevenueToCloud,
  saveCukcukOverrideOnCloud,
  syncCukcukToSheetsOnCloud,
  getCukcukInvoicesFromCloud,
  clearCukcukSyncLockOnCloud
} from '../services/api';
import * as invoiceStore from '../services/invoiceStore';
import * as retryQueue from './retryQueue';
import { ENDPOINTS } from '../config/endpoints';
import { Shift, ShiftSummary } from '../types/shift';
import { SAInvoice, PaymentLine } from '../types/invoice';

function getCurrentShift(): Shift | null {
  try {
    return useShiftStore().currentShift;
  } catch (e) {
    return null;
  }
}

function getSettings(): any {
  try {
    return useSettingsStore().settings;
  } catch (e) {
    return null;
  }
}

function getShiftHistory(): Shift[] {
  try {
    return useShiftStore().shifts || [];
  } catch (e) {
    return [];
  }
}

function getShiftSummary(shift: Shift | null): Partial<ShiftSummary> {
  if (!shift) return {};
  return shift.summarySnapshot || {};
}

// Initialize retry queue with Sheets push function
retryQueue.init(syncCukcukRevenueToCloud);

/**
 * CUKCUK API Helper - Official Integration
 * Documentation: https://graphapi.cukcuk.vn/document/api/index.html
 */

// ── API Base URL ──
let CUKCUK_API_BASE = '/cukcuk-api';

const useRelativeProxy = 
  !location.hostname ||
  location.hostname === 'localhost' || 
  location.hostname === '127.0.0.1' || 
  location.hostname.indexOf('pages.dev') !== -1 ||
  location.hostname.indexOf('kinggrill') !== -1 ||
  /^192\.168\./.test(location.hostname) ||
  /^10\./.test(location.hostname) ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(location.hostname);

if (!useRelativeProxy && location.protocol !== 'file:') {
  CUKCUK_API_BASE = 'https://kg-cashier.pages.dev/cukcuk-api';
}

function _getCachedToken(): string | null {
  const settings = getSettings();
  const cukcuk = settings?.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId) return null;
  return localStorage.getItem('cukcuk_connected_flag') || 'proxy_managed_token';
}

// ── Sync Cooldown ──
const SYNC_COOLDOWN = 2 * 60 * 1000; // 2 minutes
let _lastSyncApiTime = 0;
let _lastSyncHadNewData = false;

// ── Daily Revenue Cache ──
const DAILY_REVENUE_KEY = 'cukcuk_daily_revenue';
const CACHE_VERSION_KEY = 'cukcuk_cache_version';
const CACHE_VERSION = 4; // Bump: force re-sync to fetch SAInvoiceDetails (drink inventory items)

// ── Auto-migrate: clear corrupted cache from old versions ──
(function _migrateCacheIfNeeded() {
  try {
    const ver = localStorage.getItem(CACHE_VERSION_KEY);
    if (!ver || parseInt(ver) < CACHE_VERSION) {
      localStorage.removeItem(DAILY_REVENUE_KEY);
      localStorage.removeItem('cukcuk_sync_meta');
      localStorage.removeItem('cukcuk_invoice_store'); // Force re-fetch of all invoice details
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf('cukcuk_synced_refs_') === 0) keysToRemove.push(key);
      }
      for (let j = 0; j < keysToRemove.length; j++) localStorage.removeItem(keysToRemove[j]);
      localStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));
      console.log('[CUKCUK] Cache migrated to v' + CACHE_VERSION + ' — old corrupted data cleared');
    }
  } catch (e) { /* ignore */ }
})();

async function safeResponseJson(response: Response, fallback: any = null): Promise<any> {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e: any) {
      console.warn('[CUKCUK] Response is not valid JSON. Length:', text.length, 'Error:', e.message);
      return fallback;
    }
  } catch (err) {
    return fallback;
  }
}

// ── Get Token Health Status from Proxy ──
export async function loginAndGetToken(): Promise<{ success: boolean; message: string; authInfo?: any }> {
  try {
    const reqHeaders: Record<string, string> = {};
    const gasUrl = ENDPOINTS.gas || '';
    if (gasUrl) reqHeaders['X-Gas-Url'] = gasUrl;
    const settings = getSettings();
    if (settings && settings.adminPassword) {
      reqHeaders['X-Admin-Password'] = settings.adminPassword;
    }

    const response = await fetch(CUKCUK_API_BASE + '/health', {
      headers: reqHeaders
    });

    if (!response.ok) {
      return { success: false, message: 'Lỗi HTTP ' + response.status + ' khi gọi proxy' };
    }

    const data = await safeResponseJson(response);
    if (data && data.success && data.status === 'connected') {
      localStorage.setItem('cukcuk_connected_flag', 'connected');
      return { 
        success: true, 
        message: 'Kết nối CUKCUK thành công!', 
        authInfo: data.auth 
      };
    } else {
      localStorage.removeItem('cukcuk_connected_flag');
      return { 
        success: false, 
        message: (data && data.message) || 'Không thể xác thực kết nối CUKCUK' 
      };
    }
  } catch (e: any) {
    return { success: false, message: 'Lỗi kết nối proxy: ' + e.message };
  }
}

// ── Test Connection (Forces token refresh) ──
export async function testConnection(): Promise<{ success: boolean; message: string; authInfo?: any }> {
  try {
    const reqHeaders: Record<string, string> = {};
    const gasUrl = ENDPOINTS.gas || '';
    if (gasUrl) reqHeaders['X-Gas-Url'] = gasUrl;
    const settings = getSettings();
    if (settings && settings.adminPassword) {
      reqHeaders['X-Admin-Password'] = settings.adminPassword;
    }
    const cuk = settings?.cukcuk;
    if (cuk) {
      if (cuk.domain) reqHeaders['X-Cukcuk-Domain'] = cuk.domain;
      if (cuk.appId) reqHeaders['X-Cukcuk-App-Id'] = cuk.appId;
      if (cuk.key && !cuk.key.includes('*') && !cuk.key.includes('•')) {
        reqHeaders['X-Cukcuk-Secret-Key'] = cuk.key;
      }
    }

    const response = await fetch(CUKCUK_API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: reqHeaders
    });

    if (!response.ok) {
      return { success: false, message: 'Lỗi HTTP ' + response.status + ' khi gọi proxy' };
    }

    const data = await safeResponseJson(response);
    if (data && data.success) {
      localStorage.setItem('cukcuk_connected_flag', 'connected');
      return { 
        success: true, 
        message: data.message || 'Lấy lại token kết nối thành công!', 
        authInfo: data.auth 
      };
    } else {
      localStorage.removeItem('cukcuk_connected_flag');
      return { 
        success: false, 
        message: (data && data.message) || 'Làm mới token kết nối thất bại' 
      };
    }
  } catch (e: any) {
    return { success: false, message: 'Lỗi kết nối proxy: ' + e.message };
  }
}

// ── Centralized API Call (Proxy handles token attachment & auto-retry) ──
async function _cukcukApiCall(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<any> {
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (options.headers) {
    for (const hk in options.headers) reqHeaders[hk] = options.headers[hk];
  }

  // Attach GAS routing instructions for the CF proxy fallback
  const gasUrl = ENDPOINTS.gas || '';
  if (gasUrl) {
    reqHeaders['X-Gas-Url'] = gasUrl;
  }
  
  const settings = getSettings();
  if (settings && settings.adminPassword) {
    reqHeaders['X-Admin-Password'] = settings.adminPassword;
  }
  const cuk = settings?.cukcuk;
  if (cuk) {
    if (cuk.domain) reqHeaders['X-Cukcuk-Domain'] = cuk.domain;
    if (cuk.appId) reqHeaders['X-Cukcuk-App-Id'] = cuk.appId;
    if (cuk.key && !cuk.key.includes('*') && !cuk.key.includes('•')) {
      reqHeaders['X-Cukcuk-Secret-Key'] = cuk.key;
    }
  }

  const fetchOpts: RequestInit = { 
    method: options.method || 'GET', 
    headers: reqHeaders 
  };
  if (options.body) fetchOpts.body = options.body;
  
  const response = await fetch(CUKCUK_API_BASE + url, fetchOpts);
  
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' from ' + url);
  }
  
  const data = await safeResponseJson(response);
  
  // If proxy returned a JSON success = false wrapping an error, handle it
  if (data && data.success === false && data.error) {
    throw new Error(data.error.message || 'Proxy error');
  }

  return data;
}

function _getWorkingDayStr(): string {
  return getWorkingDay();
}

function _getCleanDomain(domain: string): string {
  if (!domain) return '';
  return domain.replace(/https?:\/\//, '').replace(/\/$/, '');
}

// ══════════════════════════════════════════════════════════════
//   DAILY REVENUE CACHE — Theo dõi doanh thu hàng ngày
// ══════════════════════════════════════════════════════════════

function _getDailyRevenueCache(): Record<string, any> {
  try {
    const saved = localStorage.getItem(DAILY_REVENUE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return {};
}

function _saveDailyRevenueCache(cache: Record<string, any>): void {
  try {
    localStorage.setItem(DAILY_REVENUE_KEY, JSON.stringify(cache));
  } catch (e) { /* ignore */ }
}

/**
 * Recalculate daily revenue from shift transactions (SOURCE OF TRUTH).
 */
export function recalcDailyRevenue(dateStr: string, shift: Shift | null): void {
  if (!shift || !shift.transactions) return;
  
  let cash = 0, card = 0, transfer = 0, bills = 0;
  const seenRefs: Record<string, boolean> = {};
  
  for (let i = 0; i < shift.transactions.length; i++) {
    const tx = shift.transactions[i];
    if (!tx.note || tx.note.indexOf('[CUKCUK]') === -1) continue;
    if (tx.type !== 'income') continue;
    
    const amt = tx.amount || 0;
    switch (tx.paymentMethod) {
      case 'card': card += amt; break;
      case 'transfer': transfer += amt; break;
      default: cash += amt;
    }
    
    // Count unique bills (extract RefId from note)
    const refMatch = tx.note.match(/\[Ref:CUKCUK-([^\]]+)\]/);
    if (refMatch && refMatch[1] && !seenRefs[refMatch[1]]) {
      seenRefs[refMatch[1]] = true;
      bills++;
    }
  }
  
  const cache = _getDailyRevenueCache();
  cache[dateStr] = {
    cash: cash,
    card: card,
    transfer: transfer,
    total: cash + card + transfer,
    bills: bills,
    lastSync: new Date().toISOString()
  };
  _saveDailyRevenueCache(cache);
  console.log('[CUKCUK] Daily revenue RECALC for', dateStr, ': total=' + cache[dateStr].total + ' (' + bills + ' bills)');
}

/**
 * Get daily revenue summaries for a date range.
 */
export function getDailyRevenueSummary(period: string): any[] {
  const cache = _getDailyRevenueCache();
  const today = new Date();
  const days = [];
  let numDays: number;
  
  switch (period) {
    case 'year':
      numDays = Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
      break;
    case 'quarter':
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      numDays = Math.ceil((today.getTime() - qStart.getTime()) / 86400000) + 1;
      break;
    case 'month':
      numDays = today.getDate();
      break;
    default: // 'week'
      numDays = 7;
  }
  
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = y + '-' + m + '-' + dd;
    
    const cached = cache[dateStr];
    if (cached) {
      days.push({
        date: dateStr,
        total: cached.total,
        cash: cached.cash,
        card: cached.card,
        transfer: cached.transfer,
        bills: cached.bills,
        source: 'cukcuk',
        lastSync: cached.lastSync
      });
    } else {
      const shifts = getShiftHistory().filter((s) => s.date === dateStr);
      let dayTotal = 0, dayCash = 0, dayCard = 0, dayTransfer = 0, dayBills = 0;
      for (let j = 0; j < shifts.length; j++) {
        const sm = getShiftSummary(shifts[j]);
        dayTotal += sm.totalIncome || 0;
        dayCash += sm.cashIncome || 0;
        dayCard += sm.cardIncome || 0;
        dayTransfer += sm.transferIncome || 0;
        dayBills += sm.billCount || 0;
      }
      days.push({
        date: dateStr,
        total: dayTotal,
        cash: dayCash,
        card: dayCard,
        transfer: dayTransfer,
        bills: dayBills,
        source: dayTotal > 0 ? 'history' : 'none',
        lastSync: ''
      });
    }
  }
  
  return days;
}

/**
 * Get aggregate revenue summary with date range info.
 */
export function getRevenueSummary(period: string): any {
  const days = getDailyRevenueSummary(period);
  const result = {
    period: period,
    days: days,
    totalRevenue: 0,
    totalCash: 0,
    totalCard: 0,
    totalTransfer: 0,
    totalBills: 0,
    avgDaily: 0,
    daysWithData: 0,
    firstDate: '',
    lastDate: '',
    periodLabel: ''
  };
  
  for (let i = 0; i < days.length; i++) {
    result.totalRevenue += days[i].total;
    result.totalCash += days[i].cash;
    result.totalCard += days[i].card;
    result.totalTransfer += days[i].transfer;
    result.totalBills += days[i].bills;
    if (days[i].total > 0) {
      result.daysWithData++;
      if (!result.firstDate) result.firstDate = days[i].date;
      result.lastDate = days[i].date;
    }
  }
  
  result.avgDaily = result.daysWithData > 0 ? Math.round(result.totalRevenue / result.daysWithData) : 0;
  
  const now = new Date();
  switch (period) {
    case 'year':
      result.periodLabel = 'Năm ' + now.getFullYear();
      break;
    case 'quarter':
      const q = Math.floor(now.getMonth() / 3) + 1;
      result.periodLabel = 'Quý ' + q + '/' + now.getFullYear();
      break;
    case 'month':
      result.periodLabel = 'Tháng ' + (now.getMonth() + 1) + '/' + now.getFullYear();
      break;
    default:
      result.periodLabel = '7 ngày gần nhất';
  }
  
  return result;
}

// ══════════════════════════════════════════════════════════════
//   SYNCED REFID INDEX — Ghi nhận thông minh hóa đơn đã sync
// ══════════════════════════════════════════════════════════════

const SYNC_META_KEY = 'cukcuk_sync_meta';

function _getSyncMeta(): { lastTotal: number; lastSyncTime: string; lastDate: string } {
  try {
    const saved = localStorage.getItem(SYNC_META_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return { lastTotal: 0, lastSyncTime: '', lastDate: '' };
}

function _setSyncMeta(meta: { lastTotal: number; lastSyncTime: string; lastDate: string }): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch (e) { /* ignore */ }
}

// ── Sync a single invoice by RefId ──
export async function syncSingleInvoice(refId: string): Promise<{ success: boolean; message?: string; changed?: boolean; amount?: number; payments?: PaymentLine[] }> {
  try {
    const existing = await invoiceStore.getInvoice(refId);
    if (existing && (existing.manualOverride || (existing as any).isManuallyEdited)) {
       showToast('⚠️ Hóa đơn đã được khóa do chỉnh sửa thủ công', 'warning');
       return { success: false, message: 'Hóa đơn đã bị khóa' };
    }

    const dateStr = (existing && (existing.workDate || (existing as any).date)) || _getWorkingDayStr();
    
    const res = await syncInvoicesForDate(dateStr);
    if (res && res.success) {
      const updated = await invoiceStore.getInvoice(refId);
      if (updated) {
        const paymentLabel = (updated.payments || []).map((pp: any) => pp.label || pp.Method || pp.method || '').join(', ');
        showToast('✅ ' + (updated.refNo || refId) + ': ' + formatCurrency(updated.amount) + ' (' + paymentLabel + ')', 'success');
        return { success: true, changed: !existing || existing.amount !== updated.amount, amount: updated.amount, payments: updated.payments };
      } else {
        return { success: false, message: 'Không tìm thấy hóa đơn trên Sheets sau khi đồng bộ' };
      }
    } else {
      return { success: false, message: res.message || 'Không thể đồng bộ' };
    }
  } catch (e: any) {
    console.error('[CUKCUK] Single sync error:', e);
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

export async function pushManualEditToSheets(refId: string, oldPayments?: any[], newPayments?: any[]): Promise<{ success: boolean; message?: string }> {
  try {
    const inv = await invoiceStore.getInvoice(refId);
    if (!inv) return { success: false, message: 'Không tìm thấy hóa đơn cục bộ' };
    
    const shift = getCurrentShift() || { cashierName: 'SYSTEM' };
    const cashierName = shift.cashierName || 'SYSTEM';

    const oldValStr = JSON.stringify(oldPayments || []);
    const newValStr = JSON.stringify(newPayments || inv.payments || []);

    const res = await saveCukcukOverrideOnCloud({
      refId: refId,
      overrideType: 'payment',
      oldValueJson: oldValStr,
      newValueJson: newValStr,
      reason: 'Chỉnh sửa thủ công trên Webapp',
      editedBy: cashierName,
      editedAt: new Date().toISOString()
    });

    if (res && res.success) {
      await invoiceStore.markPushedToSheets([refId]);
      return { success: true };
    } else {
      return { success: false, message: res ? res.message : 'Lỗi kết nối cloud' };
    }
  } catch (e: any) {
    console.error('[CUKCUK] Push override error:', e);
    return { success: false, message: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
//   MAIN SYNC — Đồng bộ thông minh, chỉ tải hóa đơn MỚI
// ══════════════════════════════════════════════════════════════
export async function syncTransactions(force?: boolean): Promise<{ success: boolean; message?: string; synced?: number; total?: number; skipped?: number; amount?: number; payments?: any; date?: string; smart?: boolean }> {
  const shift = getCurrentShift();
  const settings = getSettings();
  const cukcuk = settings?.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId) {
    return { success: false, message: 'Chưa cấu hình CUKCUK' };
  }

  const shiftDate = shift?.date || _getWorkingDayStr();
  try {
    showToast('🔄 Đang đồng bộ hóa đơn CUKCUK lên Sheets...', 'info');

    // 1. Trigger Apps Script backend sync to fetch from CUKCUK and update sheets
    const syncRes = await syncCukcukToSheetsOnCloud({
      workDate: shiftDate,
      forceDetail: !!force,
      mode: 'manual'
    });

    if (!syncRes || (!syncRes.success && !syncRes.ok)) {
      throw new Error(syncRes?.message || 'Không thể đồng bộ CUKCUK sang Sheets');
    }

    showToast('📥 Đang tải dữ liệu từ Sheets về Webapp...', 'info');

    // 2. Load the invoices from Sheets
    const loadRes = await getCukcukInvoicesFromCloud({ workDate: shiftDate });
    if (!loadRes || !loadRes.success) {
      throw new Error(loadRes?.message || 'Không thể tải hóa đơn từ Sheets');
    }

    const cloudInvoices = loadRes.invoices || [];

    // 3. Merge into local store
    const mergedCount = await invoiceStore.mergeCloudInvoices(cloudInvoices);

    // Write today's invoices to localStorage 'cukcuk_invoice_store' for DrinkInventory.vue
    try {
      const allLocal = await invoiceStore.getAllInvoices();
      const localMap: Record<string, any> = {};
      allLocal.forEach((inv) => {
        localMap[inv.refId] = inv;
      });
      localStorage.setItem('cukcuk_invoice_store', JSON.stringify({ invoices: localMap }));
    } catch (dbErr) {
      console.warn('[CUKCUK] Failed to write cukcuk_invoice_store legacy cache:', dbErr);
    }

    // 4. Calculate stats for the return object
    const paymentStats = { cash: 0, card: 0, transfer: 0 };
    let totalAmount = 0;
    let count = 0;
    
    cloudInvoices.forEach((inv: any) => {
      const isManual = inv.ManualLock === true || String(inv.ManualLock).toLowerCase() === 'true';
      const jsonStr = isManual ? (inv.ManualOverrideJson || inv.PaymentJson) : inv.PaymentJson;
      let payments: any[] = [];
      if (jsonStr) {
        try { payments = JSON.parse(jsonStr); } catch (e) {}
      }
      const isPaid = inv.IsPaid === true || String(inv.IsPaid).toLowerCase() === 'true';
      if (isPaid) {
        payments.forEach((p) => {
          const pmtAmount = p.amount || p.Amount || 0;
          const method = (p.method || p.Method || '').toLowerCase();
          if (method === 'cash') paymentStats.cash += pmtAmount;
          else if (method === 'card') paymentStats.card += pmtAmount;
          else if (method === 'transfer') paymentStats.transfer += pmtAmount;
        });
        const effAmt = Number(inv.Amount) || 0;
        totalAmount += effAmt;
        count++;
      }
    });

    _setSyncMeta({
      lastTotal: cloudInvoices.length,
      lastSyncTime: new Date().toISOString(),
      lastDate: shiftDate
    });

    showToast('✅ Đồng bộ thành công! Nhận ' + count + ' hóa đơn (' + totalAmount.toLocaleString('vi-VN') + 'đ) từ Sheets', 'success');

    if ((window as any).refreshView) {
      try { (window as any).refreshView(); } catch (e) {}
    }

    return {
      success: true,
      synced: mergedCount,
      total: cloudInvoices.length,
      skipped: cloudInvoices.length - mergedCount,
      amount: totalAmount,
      payments: paymentStats,
      date: shiftDate,
      smart: true
    };
  } catch (e: any) {
    console.error('[CUKCUK Sync Error]', e);
    if (e.message && e.message.includes('một thiết bị khác')) {
      const confirmUnlock = await showConfirm(
        'Hệ thống đang thực hiện đồng bộ hóa hóa đơn từ một thiết bị khác (hoặc khóa đồng bộ bị kẹt). Bạn có muốn cưỡng bức mở khóa đồng bộ và thử lại không?',
        {
          title: 'Giải phóng khóa đồng bộ',
          confirmText: 'Mở khóa & Thử lại',
          cancelText: 'Bỏ qua',
          type: 'warning'
        }
      );
      if (confirmUnlock) {
        showToast('🔄 Đang giải phóng khóa đồng bộ...', 'info');
        const unlockRes = await clearCukcukSyncLockOnCloud({ workDate: shiftDate });
        if (unlockRes && (unlockRes.success || unlockRes.ok)) {
          showToast('🔓 Đã mở khóa đồng bộ thành công. Đang đồng bộ lại...', 'success');
          return syncTransactions(force);
        } else {
          showToast('❌ Không thể giải phóng khóa: ' + (unlockRes?.message || 'Lỗi không xác định'), 'error');
        }
      }
    }
    showToast('❌ Lỗi đồng bộ: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

export function parseCukcukPayments(inv: any): { 
  payments: PaymentLine[]; 
  cash: number; 
  card: number; 
  transfer: number; 
  other: number;
  deposit: number;
} {
  const rawPayments = inv.SAInvoicePayments || inv.Payments || [];
  const totalAmount = Number(inv.TotalAmount) || Number(inv.Amount) || 0;
  const deposit = Number(inv.DepositAmount) || 0;
  
  let cash = 0, card = 0, transfer = 0, other = 0;
  const parsedPayments: PaymentLine[] = [];

  if (Array.isArray(rawPayments) && rawPayments.length > 0) {
    rawPayments.forEach((p: any) => {
      const amt = Number(p.Amount) || 0;
      if (amt <= 0) return;
      
      const name = String(p.PaymentName || p.CardName || '').toLowerCase();
      const type = Number(p.PaymentType);

      if (name.includes('mặt') || name.includes('cash')) {
        cash += amt;
        parsedPayments.push({ method: 'cash', amount: amt });
      } else if (name.includes('chuyển') || name.includes('khoản') || name.includes('ck') || name.includes('ngân hàng') || name.includes('bank') || name.includes('transfer') || name.includes('qr')) {
        transfer += amt;
        parsedPayments.push({ method: 'transfer', amount: amt });
      } else if (name.includes('thẻ') || name.includes('card') || name.includes('atm') || name.includes('pos') || name.includes('visa') || name.includes('master')) {
        card += amt;
        parsedPayments.push({ method: 'card', amount: amt });
      } else {
        if (type === 1) {
          cash += amt;
          parsedPayments.push({ method: 'cash', amount: amt });
        } else if (type === 2) {
          if (name.includes('khoản') || name.includes('chuyển')) {
            transfer += amt;
            parsedPayments.push({ method: 'transfer', amount: amt });
          } else {
            card += amt;
            parsedPayments.push({ method: 'card', amount: amt });
          }
        } else if (type === 3) {
          transfer += amt;
          parsedPayments.push({ method: 'transfer', amount: amt });
        } else {
          other += amt;
          parsedPayments.push({ method: 'cash', amount: amt });
        }
      }
    });
  }

  // Handle deposit: Do NOT combine deposit with transfer (CK)
  if (deposit > 0) {
    parsedPayments.push({ method: 'deposit', amount: deposit });
  }

  // Fallback to direct amount fields if payments list was empty
  const nonDepositPayments = parsedPayments.filter(p => p.method !== 'deposit');
  if (nonDepositPayments.length === 0) {
    const cAmt = Number(inv.CashAmount) || 0;
    const cardAmt = Number(inv.CardAmount) || 0;
    const transAmt = Number(inv.TransferAmount) || 0;

    if (cAmt > 0) {
      cash = cAmt;
      parsedPayments.push({ method: 'cash', amount: cAmt });
    }
    if (cardAmt > 0) {
      card = cardAmt;
      parsedPayments.push({ method: 'card', amount: cardAmt });
    }
    if (transAmt > 0) {
      transfer = transAmt;
      parsedPayments.push({ method: 'transfer', amount: transAmt });
    }
    if (cash === 0 && card === 0 && transfer === 0 && (totalAmount - deposit) > 0) {
      cash = totalAmount - deposit;
      parsedPayments.push({ method: 'cash', amount: totalAmount - deposit });
    }
  }

  return { payments: parsedPayments, cash, card, transfer, other, deposit };
}

export async function fetchInvoicesDirectFromCukcuk(dateStr: string, toDateStr?: string): Promise<SAInvoice[]> {
  const fromDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const toDate = toDateStr ? (toDateStr.includes('T') ? toDateStr : `${toDateStr}T23:59:59`) : (dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59`);
  
  let page = 1;
  const limit = 100;
  let allItems: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const res = await _cukcukApiCall('/api/v1/sainvoices/paging-with-detail', {
      method: 'POST',
      body: JSON.stringify({
        FromDate: fromDate,
        ToDate: toDate,
        Page: page,
        Limit: limit
      })
    });

    if (res && res.Success && Array.isArray(res.Data)) {
      allItems = allItems.concat(res.Data);
      if (res.Data.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  const invoices: SAInvoice[] = allItems.map((raw: any) => {
    const paymentBreakdown = parseCukcukPayments(raw);
    const effAmt = Number(raw.TotalAmount) || Number(raw.Amount) || (paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.transfer);
    const isPaid = raw.IsPaid !== undefined ? (raw.IsPaid === true || String(raw.IsPaid).toLowerCase() === 'true') : true;

    const rawDate = String(raw.RefDate || raw.CreatedDate || '');
    let wDate = dateStr;
    if (rawDate && rawDate.length >= 10) {
      wDate = rawDate.substring(0, 10);
    }

    const details = Array.isArray(raw.SAInvoiceDetails) ? raw.SAInvoiceDetails : [];
    const mappedItems: any[] = details.map((d: any, idx: number) => {
      const itemName = String(d.InventoryItemName || d.ItemName || d.InventoryItemCode || '');
      const itemCode = String(d.InventoryItemCode || d.ItemCode || '');
      const unitName = String(d.UnitName || '');
      const quantity = Number(d.Quantity || 0);
      const unitPrice = Number(d.UnitPrice || 0);
      const amount = Number(d.Amount || 0);
      const discountAmount = Number(d.DiscountAmount || 0);

      return {
        itemRowKey: String(d.RefDetailId || d.ItemId || `${raw.RefId}_${idx}`),
        refId: String(raw.RefId || ''),
        refNo: String(raw.RefNo || ''),
        refDate: rawDate,
        workDate: wDate,
        itemId: String(d.InventoryItemId || d.ItemId || ''),
        itemCode,
        itemName,
        name: itemName,
        unitName,
        quantity,
        unitPrice,
        amount,
        discountAmount,
        isDrink: false,
        isFood: false
      };
    });

    const invObj: SAInvoice = {
      refId: String(raw.RefId || ''),
      refNo: String(raw.RefNo || ''),
      refDate: rawDate,
      workDate: wDate,
      tableName: String(raw.TableName || ''),
      employeeName: String(raw.EmployeeName || ''),
      amount: effAmt,
      payments: paymentBreakdown.payments,
      isPaid: isPaid,
      isCancelled: !!raw.IsCancelled,
      isDeleted: !!raw.IsDeleted,
      rowHash: '',
      itemsCount: details.length,
      items: mappedItems
    };

    (invObj as any).cashAmount = paymentBreakdown.cash;
    (invObj as any).cardAmount = paymentBreakdown.card;
    (invObj as any).transferAmount = paymentBreakdown.transfer;
    (invObj as any).depositAmount = paymentBreakdown.deposit;
    (invObj as any).unpaid = !isPaid;
    (invObj as any).syncedAt = new Date().toISOString();
    
    return invObj;
  });

  return invoices;
}

export async function syncInvoicesForDate(dateStr: string, silent = false, toDateStr?: string): Promise<{ success: boolean; message?: string; synced?: number; total?: number; records?: any[] }> {
  if (!dateStr) return { success: false, message: 'Chưa chỉ định ngày' };
  const settings = getSettings();
  const cukcuk = settings?.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId) return { success: false, message: 'Chưa cấu hình CUKCUK' };

  try {
    const rangeLabel = toDateStr && toDateStr !== dateStr ? `${dateStr} đến ${toDateStr}` : dateStr;
    if (!silent) showToast('🔄 Đang đồng bộ hóa đơn CUKCUK ngày ' + rangeLabel + '...', 'info');

    // 1. Direct fetch from CUKCUK via proxy (instantaneous ~ 1s)
    let fetchedInvoices: SAInvoice[] = [];
    try {
      fetchedInvoices = await fetchInvoicesDirectFromCukcuk(dateStr, toDateStr);
    } catch (apiErr: any) {
      console.warn('[CUKCUK] Direct API fetch failed, falling back to Sheets:', apiErr);
    }

    if (fetchedInvoices.length > 0) {
      // Upsert into local IndexedDB
      const mergedCount = await invoiceStore.bulkUpsert(fetchedInvoices);
      
      // Update legacy cukcuk_invoice_store cache
      try {
        const allLocal = await invoiceStore.getAllInvoices();
        const localMap: Record<string, any> = {};
        allLocal.forEach((inv) => { localMap[inv.refId] = inv; });
        localStorage.setItem('cukcuk_invoice_store', JSON.stringify({ invoices: localMap }));
      } catch (e) {}

      // Trigger background Sheets sync so Google Sheets stays in sync without delaying UI
      syncCukcukToSheetsOnCloud({ workDate: dateStr, mode: 'auto' }).catch(err => {
        console.warn('[CUKCUK] Background sheets sync notice:', err);
      });

      if (!silent) showToast(`✅ Đã đồng bộ ${fetchedInvoices.length} hóa đơn (${rangeLabel}) từ CUKCUK!`, 'success');

      if ((window as any).refreshView) {
        try { (window as any).refreshView(); } catch (e) {}
      }

      return {
        success: true,
        synced: mergedCount,
        total: fetchedInvoices.length,
        records: fetchedInvoices
      };
    }

    // 2. Fallback: Sync via GAS if direct fetch didn't return any records
    const syncRes = await syncCukcukToSheetsOnCloud({
      workDate: dateStr,
      mode: 'manual'
    });

    if (!syncRes || (!syncRes.success && !syncRes.ok)) {
      throw new Error(syncRes?.message || 'Không thể đồng bộ CUKCUK sang Sheets');
    }

    const loadRes = await getCukcukInvoicesFromCloud({ workDate: dateStr });
    if (!loadRes || !loadRes.success) {
      throw new Error(loadRes?.message || 'Không thể tải hóa đơn từ Sheets');
    }

    const cloudInvoices = loadRes.invoices || [];
    const mergedCount = await invoiceStore.mergeCloudInvoices(cloudInvoices);

    // Update legacy cukcuk_invoice_store cache
    try {
      const allLocal = await invoiceStore.getAllInvoices();
      const localMap: Record<string, any> = {};
      allLocal.forEach((inv) => {
        localMap[inv.refId] = inv;
      });
      localStorage.setItem('cukcuk_invoice_store', JSON.stringify({ invoices: localMap }));
    } catch (e) {}

    let paidCount = 0;
    let totalAmount = 0;
    cloudInvoices.forEach((inv: any) => {
      const isPaid = inv.IsPaid === true || String(inv.IsPaid).toLowerCase() === 'true';
      if (isPaid) {
        paidCount++;
        totalAmount += Number(inv.Amount) || 0;
      }
    });

    if (!silent) showToast('✅ Đã đồng bộ ' + paidCount + ' hóa đơn ngày ' + dateStr + ' từ Sheets', 'success');

    if ((window as any).refreshView) {
      try { (window as any).refreshView(); } catch (e) {}
    }

    return {
      success: true,
      synced: mergedCount,
      total: cloudInvoices.length,
      records: cloudInvoices
    };
  } catch (e: any) {
    console.error('[CUKCUK] syncInvoicesForDate error:', e);
    if (e.message && e.message.includes('một thiết bị khác')) {
      const confirmUnlock = await showConfirm(
        'Hệ thống đang thực hiện đồng bộ hóa hóa đơn từ một thiết bị khác (hoặc khóa đồng bộ bị kẹt). Bạn có muốn cưỡng bức mở khóa đồng bộ và thử lại không?',
        {
          title: 'Giải phóng khóa đồng bộ',
          confirmText: 'Mở khóa & Thử lại',
          cancelText: 'Bỏ qua',
          type: 'warning'
        }
      );
      if (confirmUnlock) {
        showToast('🔄 Đang giải phóng khóa đồng bộ...', 'info');
        const unlockRes = await clearCukcukSyncLockOnCloud({ workDate: dateStr });
        if (unlockRes && (unlockRes.success || unlockRes.ok)) {
          showToast('🔓 Đã mở khóa đồng bộ thành công. Đang đồng bộ lại...', 'success');
          return syncInvoicesForDate(dateStr);
        } else {
          showToast('❌ Không thể giải phóng khóa: ' + (unlockRes?.message || 'Lỗi không xác định'), 'error');
        }
      }
    }
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

// ── Connection Status ──
export function getConnectionStatus(): { configured: boolean; connected: boolean; domain?: string; message: string } {
  const settings = getSettings();
  const cukcuk = settings?.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId || (!cukcuk.key && !cukcuk.hasKey)) {
    return { configured: false, connected: false, message: 'Chưa cấu hình' };
  }
  const cached = _getCachedToken();
  return {
    configured: true,
    connected: !!cached,
    domain: _getCleanDomain(cukcuk.domain),
    message: cached ? 'Đã kết nối' : 'Chưa đăng nhập'
  };
}

/**
 * Get the last sync time for today
 */
export async function getLastSyncInfo(): Promise<any> {
  const todayRevenue = await invoiceStore.getTodayRevenue();
  if (todayRevenue && todayRevenue.bills > 0) {
    return {
      date: todayRevenue.date,
      lastSync: todayRevenue.lastSync,
      total: todayRevenue.total,
      bills: todayRevenue.bills,
      cash: todayRevenue.cash,
      card: todayRevenue.card,
      transfer: todayRevenue.transfer
    };
  }
  return null;
}

// ── Export Invoice Store for direct access ──
export { invoiceStore };

/**
 * Get comprehensive sync status for UI status bar.
 */
export function getSyncStatus(): any {
  const conn = getConnectionStatus();
  const meta = _getSyncMeta();
  const now = Date.now();
  let cooldownRemaining = 0;
  if (!_lastSyncHadNewData && _lastSyncApiTime > 0) {
    const elapsed = now - _lastSyncApiTime;
    if (elapsed < SYNC_COOLDOWN) {
      cooldownRemaining = Math.ceil((SYNC_COOLDOWN - elapsed) / 1000);
    }
  }
  const queueStatus = retryQueue.getStatus();
  let storedCount = 0;
  try {
    const todayStr = meta.lastDate || '';
    if (todayStr) {
      invoiceStore.getCountByDate(todayStr).then((c) => {
        storedCount = c;
      });
    }
  } catch (e) { /* ignore */ }

  return {
    connected: conn.connected,
    configured: conn.configured,
    billCount: storedCount,
    lastSyncTime: meta.lastSyncTime || '',
    lastSyncDate: meta.lastDate || '',
    cooldownSeconds: cooldownRemaining,
    sheetsQueue: queueStatus
  };
}

/**
 * Tải hóa đơn từ Cloud Sheets và gộp vào IndexedDB cục bộ ngầm.
 * Trả về số lượng hóa đơn mới được thêm hoặc cập nhật.
 */
export async function pullAndMergeCukcukInvoices(dateStr: string): Promise<number> {
  if (!dateStr) return 0;
  const loadRes = await getCukcukInvoicesFromCloud({ workDate: dateStr });
  if (loadRes && loadRes.success && Array.isArray(loadRes.invoices)) {
    const mergedCount = await invoiceStore.mergeCloudInvoices(loadRes.invoices);
    
    // Update last sync metadata to avoid duplicate visual notifications
    if (mergedCount > 0) {
      try {
        const meta = _getSyncMeta();
        meta.lastSyncTime = new Date().toISOString();
        meta.lastDate = dateStr;
        _setSyncMeta(meta);
      } catch (e) {}
    }
    
    return mergedCount;
  }
  return 0;
}

