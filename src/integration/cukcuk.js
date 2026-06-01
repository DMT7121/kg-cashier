import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';

function getCurrentShift() {
  try {
    return useShiftStore().currentShift;
  } catch (e) {
    return null;
  }
}

function getSettings() {
  try {
    return useSettingsStore().settings;
  } catch (e) {
    return null;
  }
}

function getShiftHistory() {
  try {
    return useShiftStore().shifts || [];
  } catch (e) {
    return [];
  }
}

function getShiftSummary(shift) {
  if (!shift) return {};
  return shift.summarySnapshot || {};
}
import { showToast, formatCurrency, getWorkingDay, getWorkingDayRange } from '../utils.js';
import {
  syncCukcukRevenueToCloud,
  saveCukcukOverrideOnCloud,
  syncCukcukToSheetsOnCloud,
  getCukcukInvoicesFromCloud
} from '../services/api';
import * as invoiceStore from '../services/invoiceStore';
import * as retryQueue from './retryQueue.js';
import { ENDPOINTS } from '../config/endpoints.js';

// Initialize retry queue with Sheets push function
retryQueue.init(syncCukcukRevenueToCloud);

/**
 * CUKCUK API Helper - Official Integration
 * Documentation: https://graphapi.cukcuk.vn/document/api/index.html
 * 
 * Login response: { Data: { AccessToken, CompanyCode, Domain, AppID } }
 * SAInvoices response: { Data: [ { RefId, RefNo, Amount, TableName, ... } ] }
 * SAInvoice Detail: { SAInvoicePayments: [ { PaymentType, Amount, PaymentName } ] }
 * 
 * === AUTO-SYNC BY DATE ===
 * System auto-loads CUKCUK invoices for TODAY's date only.
 * Payment methods (cash/card/transfer) are auto-detected from PaymentName.
 * Revenue totals are synced for weekly/monthly tracking.
 */

// ── API Base URL ──
// - Dev (localhost/LAN) & Production (Cloudflare Pages with Functions): Use relative /cukcuk-api proxy to bypass CORS
// - Fallback: Use external Cloudflare Worker proxy if running as a static file or other hosting environments
var CUKCUK_API_BASE = '/cukcuk-api';

var useRelativeProxy = 
  !location.hostname ||
  location.hostname === 'localhost' || 
  location.hostname === '127.0.0.1' || 
  location.hostname.indexOf('pages.dev') !== -1 ||
  location.hostname.indexOf('kinggrill') !== -1 ||
  /^192\.168\./.test(location.hostname) ||
  /^10\./.test(location.hostname) ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(location.hostname);

if (!useRelativeProxy && location.protocol !== 'file:') {
  CUKCUK_API_BASE = 'https://kg-cukcuk-api.dmt-kgwork.workers.dev';
}

// ── Token Cache ──
var _cachedToken = null;
var _cachedCompanyCode = null;
var _cachedTokenTime = 0;
var TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours (official CUKCUK TTL)

function _getCachedToken() {
  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId || !cukcuk.key) return null;
  return localStorage.getItem('cukcuk_connected_flag') || 'proxy_managed_token';
}

// ── Active Login Lock ──
var _activeLoginPromise = null;

// ── Sync Cooldown ──
// Minimum time between API calls when auto-sync finds no new data
var SYNC_COOLDOWN = 2 * 60 * 1000; // 2 minutes
var _lastSyncApiTime = 0;
var _lastSyncHadNewData = false;

// ── Daily Revenue Cache ──
var DAILY_REVENUE_KEY = 'cukcuk_daily_revenue';
var CACHE_VERSION_KEY = 'cukcuk_cache_version';
var CACHE_VERSION = 4; // Bump: force re-sync to fetch SAInvoiceDetails (drink inventory items)

// ── Auto-migrate: clear corrupted cache from old versions ──
(function _migrateCacheIfNeeded() {
  try {
    var ver = localStorage.getItem(CACHE_VERSION_KEY);
    if (!ver || parseInt(ver) < CACHE_VERSION) {
      localStorage.removeItem(DAILY_REVENUE_KEY);
      localStorage.removeItem('cukcuk_sync_meta');
      localStorage.removeItem('cukcuk_invoice_store'); // Force re-fetch of all invoice details
      // Clear all synced ref indexes
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('cukcuk_synced_refs_') === 0) keysToRemove.push(key);
      }
      for (var j = 0; j < keysToRemove.length; j++) localStorage.removeItem(keysToRemove[j]);
      localStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));
      console.log('[CUKCUK] Cache migrated to v' + CACHE_VERSION + ' — old corrupted data cleared');
    }
  } catch(e) { /* ignore */ }
})();

// ── Get Token Health Status from Proxy ──
export async function loginAndGetToken() {
  try {
    var reqHeaders = {};
    var gasUrl = ENDPOINTS.gas || '';
    if (gasUrl) reqHeaders['X-Gas-Url'] = gasUrl;
    var settings = getSettings();
    if (settings && settings.adminPassword) {
      reqHeaders['X-Admin-Password'] = settings.adminPassword;
    }
    reqHeaders['X-Cukcuk-Pin'] = '712121';

    var response = await fetch(CUKCUK_API_BASE + '/health', {
      headers: reqHeaders
    });

    if (!response.ok) {
      return { success: false, message: 'Lỗi HTTP ' + response.status + ' khi gọi proxy' };
    }

    var data = await response.json();
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
  } catch(e) {
    return { success: false, message: 'Lỗi kết nối proxy: ' + e.message };
  }
}

// ── Test Connection (Forces token refresh) ──
export async function testConnection() {
  try {
    var reqHeaders = {};
    var gasUrl = ENDPOINTS.gas || '';
    if (gasUrl) reqHeaders['X-Gas-Url'] = gasUrl;
    var settings = getSettings();
    if (settings && settings.adminPassword) {
      reqHeaders['X-Admin-Password'] = settings.adminPassword;
    }
    reqHeaders['X-Cukcuk-Pin'] = '712121';

    var response = await fetch(CUKCUK_API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: reqHeaders
    });

    if (!response.ok) {
      return { success: false, message: 'Lỗi HTTP ' + response.status + ' khi gọi proxy' };
    }

    var data = await response.json();
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
  } catch(e) {
    return { success: false, message: 'Lỗi kết nối proxy: ' + e.message };
  }
}

// ── Centralized API Call (Proxy handles token attachment & auto-retry) ──
async function _cukcukApiCall(url, options) {
  var reqHeaders = {};
  if (options.headers) {
    for (var hk in options.headers) reqHeaders[hk] = options.headers[hk];
  }

  // Attach GAS routing instructions for the CF proxy fallback
  var gasUrl = ENDPOINTS.gas || '';
  if (gasUrl) {
    reqHeaders['X-Gas-Url'] = gasUrl;
  }
  
  var settings = getSettings();
  if (settings && settings.adminPassword) {
    reqHeaders['X-Admin-Password'] = settings.adminPassword;
  }
  reqHeaders['X-Cukcuk-Pin'] = '712121';

  var fetchOpts = { 
    method: options.method || 'GET', 
    headers: reqHeaders 
  };
  if (options.body) fetchOpts.body = options.body;
  
  var response = await fetch(CUKCUK_API_BASE + url, fetchOpts);
  
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' from ' + url);
  }
  
  var data = await response.json();
  
  // If proxy returned a JSON success = false wrapping an error, handle it
  if (data && data.success === false && data.error) {
    throw new Error(data.error.message || 'Proxy error');
  }

  return data;
}

// ── Working Day Helpers for CUKCUK ──
function _getWorkingDayStr() {
  return getWorkingDay();
}

function _formatLocalISO(date) {
  if (!date) return null;
  var pad = function(n) { return n < 10 ? '0' + n : String(n); };
  return date.getFullYear() + '-' +
         pad(date.getMonth() + 1) + '-' +
         pad(date.getDate()) + 'T' +
         pad(date.getHours()) + ':' +
         pad(date.getMinutes()) + ':' +
         pad(date.getSeconds());
}

function _getWorkingDayRange(shiftDate) {
  return getWorkingDayRange(shiftDate);
}

/**
 * Derive working day (YYYY-MM-DD) from a CUKCUK RefDate string.
 * If the invoice time is before 06:00, the working day is the previous calendar day.
 * @param {string} refDate - e.g. "2026-05-13T23:15:00" or "/Date(1747148100000)/"
 * @param {string} fallback - fallback date if parsing fails
 */
function _getWorkingDayFromRefDate(refDate, fallback) {
  if (!refDate) return fallback;
  var dt;
  // Handle .NET "/Date(...)/" format
  var match = String(refDate).match(/\/Date\((\d+)\)\//);
  if (match) {
    dt = new Date(parseInt(match[1]));
  } else {
    dt = new Date(refDate);
  }
  if (isNaN(dt.getTime())) return fallback;
  // Before 6AM = previous working day
  if (dt.getHours() < 6) {
    dt.setDate(dt.getDate() - 1);
  }
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var d = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ── Extract invoice array from API response Data field ──
function _extractPageData(data) {
  if (!data || !data.Data) return [];
  if (Array.isArray(data.Data)) return data.Data;
  if (data.Data.PageData) return data.Data.PageData;
  if (data.Data.Items) return data.Data.Items;
  return [];
}

// ── Fetch SAInvoices (uses centralized _cukcukApiCall with auto-retry) ──
async function _fetchInvoices(startDate, endDate, pageIndex) {
  if (!pageIndex) pageIndex = 1;
  
  var body = {
    Page: pageIndex,
    Limit: 100
  };

  if (startDate) body.FromDate = startDate;
  if (endDate) body.ToDate = endDate;

  console.log('[CUKCUK] Fetching invoices, page', pageIndex);

  return await _cukcukApiCall('/api/v1/sainvoices/paging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ── Fetch Invoice Detail (payment breakdown, auto-retry on 401) ──
async function _fetchInvoiceDetail(refId) {
  try {
    var data = await _cukcukApiCall('/api/v1/sainvoices/' + refId, {
      method: 'GET'
    });
    
    if (data._authFailed) return null;
    if (data.Success && data.Data) {
      return data.Data;
    }
  } catch(e) {
    console.warn('[CUKCUK] Detail fetch failed for', refId, e.message);
  }
  return null;
}

// ── Map CUKCUK payment to webapp payment method ──
// Use PaymentName (Vietnamese text) for reliable mapping
// since PaymentType numbers may vary per CUKCUK account
function _mapPayment(payment) {
  var name = (payment.PaymentName || '').toLowerCase();
  var type = payment.PaymentType;
  
  // String-based matching (most reliable)
  if (name.indexOf('mặt') !== -1 || name.indexOf('tiền mặt') !== -1 || name.indexOf('cash') !== -1) {
    return { method: 'cash', label: 'Tiền mặt' };
  }
  if (name.indexOf('chuyển') !== -1 || name.indexOf('khoản') !== -1 || name.indexOf('ngân hàng') !== -1 || name.indexOf('bank') !== -1 || name.indexOf('transfer') !== -1) {
    return { method: 'transfer', label: 'Chuyển khoản' };
  }
  if (name.indexOf('thẻ') !== -1 || name.indexOf('card') !== -1 || name.indexOf('visa') !== -1 || name.indexOf('master') !== -1) {
    return { method: 'card', label: 'Thẻ' };
  }
  
  // Fallback to PaymentType number
  switch (type) {
    case 1: return { method: 'cash', label: 'Tiền mặt' };
    case 2: return { method: 'card', label: 'Thẻ' };
    case 3: return { method: 'transfer', label: 'Chuyển khoản' };
    default: return { method: 'cash', label: name || 'Khác' };
  }
}

// ══════════════════════════════════════════════════════════════
//   DAILY REVENUE CACHE — Theo dõi doanh thu hàng ngày
//   Lưu doanh thu theo ngày để đồng bộ tuần/tháng nhanh hơn
// ══════════════════════════════════════════════════════════════

function _getDailyRevenueCache() {
  try {
    var saved = localStorage.getItem(DAILY_REVENUE_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore */ }
  return {};
}

function _saveDailyRevenueCache(cache) {
  try {
    localStorage.setItem(DAILY_REVENUE_KEY, JSON.stringify(cache));
  } catch(e) { /* ignore */ }
}

/**
 * Recalculate daily revenue from shift transactions (SOURCE OF TRUTH).
 * This is IDEMPOTENT — call it 100 times, same result.
 * Scans all CUKCUK transactions in the shift, sums by payment method.
 */
function _recalcDailyRevenue(dateStr, shift) {
  if (!shift || !shift.transactions) return;
  
  var cash = 0, card = 0, transfer = 0, bills = 0;
  var seenRefs = {}; // Track unique bill refs to count bills (not payment splits)
  
  for (var i = 0; i < shift.transactions.length; i++) {
    var tx = shift.transactions[i];
    if (!tx.note || tx.note.indexOf('[CUKCUK]') === -1) continue;
    if (tx.type !== 'income') continue;
    
    var amt = tx.amount || 0;
    switch (tx.paymentMethod) {
      case 'card': card += amt; break;
      case 'transfer': transfer += amt; break;
      default: cash += amt;
    }
    
    // Count unique bills (extract RefId from note)
    var refMatch = tx.note.match(/\[Ref:CUKCUK-([^\]]+)\]/);
    if (refMatch && !seenRefs[refMatch[1]]) {
      seenRefs[refMatch[1]] = true;
      bills++;
    }
  }
  
  var cache = _getDailyRevenueCache();
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
 * @param {string} period - 'week' | 'month' | 'quarter' | 'year'
 * @returns {Array} of { date, total, cash, card, transfer, bills }
 */
export function getDailyRevenueSummary(period) {
  var cache = _getDailyRevenueCache();
  var today = new Date();
  var days = [];
  var numDays;
  
  switch (period) {
    case 'year':
      // From Jan 1 of current year
      numDays = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / 86400000) + 1;
      break;
    case 'quarter':
      // Current quarter (Q1=Jan-Mar, Q2=Apr-Jun, etc.)
      var qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      numDays = Math.ceil((today - qStart) / 86400000) + 1;
      break;
    case 'month':
      numDays = today.getDate();
      break;
    default: // 'week'
      numDays = 7;
  }
  
  for (var i = numDays - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var dateStr = y + '-' + m + '-' + dd;
    
    var cached = cache[dateStr];
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
      var shifts = getShiftHistory().filter(function(s) { return s.date === dateStr; });
      var dayTotal = 0, dayCash = 0, dayCard = 0, dayTransfer = 0, dayBills = 0;
      for (var j = 0; j < shifts.length; j++) {
        var sm = getShiftSummary(shifts[j]);
        dayTotal += sm.totalIncome;
        dayCash += sm.cashIncome;
        dayCard += sm.cardIncome;
        dayTransfer += sm.transferIncome;
        dayBills += sm.billCount;
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
 * @param {string} period - 'week' | 'month' | 'quarter' | 'year'
 */
export function getRevenueSummary(period) {
  var days = getDailyRevenueSummary(period);
  var result = {
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
  
  for (var i = 0; i < days.length; i++) {
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
  
  // Generate readable period label
  var now = new Date();
  switch (period) {
    case 'year':
      result.periodLabel = 'Năm ' + now.getFullYear();
      break;
    case 'quarter':
      var q = Math.floor(now.getMonth() / 3) + 1;
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
//   Dùng Set trong localStorage để tra cứu O(1) thay vì O(n×m)
// ══════════════════════════════════════════════════════════════

var SYNCED_REFS_PREFIX = 'cukcuk_synced_refs_';
var SYNC_META_KEY = 'cukcuk_sync_meta';

/**
 * Get the Set of already-synced RefIDs for a given date.
 * Stored as JSON array in localStorage for persistence.
 */
function _getSyncedRefIds(dateStr) {
  try {
    var saved = localStorage.getItem(SYNCED_REFS_PREFIX + dateStr);
    if (saved) {
      var arr = JSON.parse(saved);
      // Use object as Set for IE/old browser compat
      var set = {};
      for (var i = 0; i < arr.length; i++) set[arr[i]] = true;
      return set;
    }
  } catch(e) { /* ignore */ }
  return {};
}

/**
 * Add a RefID to the synced index for today.
 */
function _addSyncedRefId(dateStr, refId) {
  try {
    var saved = localStorage.getItem(SYNCED_REFS_PREFIX + dateStr);
    var arr = saved ? JSON.parse(saved) : [];
    if (arr.indexOf(refId) === -1) {
      arr.push(refId);
      localStorage.setItem(SYNCED_REFS_PREFIX + dateStr, JSON.stringify(arr));
    }
  } catch(e) { /* ignore */ }
}

/**
 * Bulk-add multiple RefIDs at once (single localStorage write).
 * Much faster than calling _addSyncedRefId N times.
 */
function _addSyncedRefIdsBulk(dateStr, refIds) {
  if (!refIds || refIds.length === 0) return;
  try {
    var saved = localStorage.getItem(SYNCED_REFS_PREFIX + dateStr);
    var arr = saved ? JSON.parse(saved) : [];
    var existing = {};
    for (var i = 0; i < arr.length; i++) existing[arr[i]] = true;
    for (var j = 0; j < refIds.length; j++) {
      if (!existing[refIds[j]]) {
        arr.push(refIds[j]);
        existing[refIds[j]] = true;
      }
    }
    localStorage.setItem(SYNCED_REFS_PREFIX + dateStr, JSON.stringify(arr));
  } catch(e) { /* ignore */ }
}

/**
 * Get sync metadata (last known total, last sync time).
 */
function _getSyncMeta() {
  try {
    var saved = localStorage.getItem(SYNC_META_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore */ }
  return { lastTotal: 0, lastSyncTime: '', lastDate: '' };
}

function _setSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch(e) { /* ignore */ }
}

/**
 * Clear synced index for a date (used by resync).
 */
function _clearSyncedRefIds(dateStr) {
  try {
    localStorage.removeItem(SYNCED_REFS_PREFIX + dateStr);
  } catch(e) { /* ignore */ }
}

/**
 * Clean up old synced indexes (keep only last 3 days).
 */
function _cleanupOldSyncIndexes() {
  try {
    var today = new Date();
    var keepDates = {};
    for (var i = 0; i < 3; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      keepDates[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')] = true;
    }
    for (var k = 0; k < localStorage.length; k++) {
      var key = localStorage.key(k);
      if (key && key.indexOf(SYNCED_REFS_PREFIX) === 0) {
        var dateStr = key.replace(SYNCED_REFS_PREFIX, '');
        if (!keepDates[dateStr]) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch(e) { /* ignore */ }
}

// resyncAllTransactions() removed — syncTransactions(force=true) now handles
// unpaid bill refresh without deleting any data.

// ── Sync a single invoice by RefId ──
export async function syncSingleInvoice(refId) {
  try {
    var existing = await invoiceStore.getInvoice(refId);
    if (existing && (existing.manualOverride || existing.isManuallyEdited)) {
       showToast('⚠️ Hóa đơn đã được khóa do chỉnh sửa thủ công', 'warning');
       return { success: false, message: 'Hóa đơn đã bị khóa' };
    }

    var dateStr = (existing && (existing.date || existing.workDate)) || _getWorkingDayStr();
    
    // Trigger date sync to Sheets and pull updated data
    var res = await syncInvoicesForDate(dateStr);
    if (res && res.success) {
      var updated = await invoiceStore.getInvoice(refId);
      if (updated) {
        var paymentLabel = (updated.payments || []).map(function(pp) { return pp.label; }).join(', ');
        showToast('✅ ' + (updated.refNo || refId) + ': ' + formatCurrency(updated.amount) + ' (' + paymentLabel + ')', 'success');
        return { success: true, changed: !existing || existing.amount !== updated.amount, amount: updated.amount, payments: updated.payments };
      } else {
        return { success: false, message: 'Không tìm thấy hóa đơn trên Sheets sau khi đồng bộ' };
      }
    } else {
      return { success: false, message: res.message || 'Không thể đồng bộ' };
    }
  } catch(e) {
    console.error('[CUKCUK] Single sync error:', e);
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

export async function pushManualEditToSheets(refId, oldPayments, newPayments) {
  try {
    const inv = await invoiceStore.getInvoice(refId);
    if (!inv) return { success: false, message: 'Không tìm thấy hóa đơn cục bộ' };
    
    const shift = getCurrentShift() || { id: 'manual' };
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
  } catch (e) {
    console.error('[CUKCUK] Push override error:', e);
    return { success: false, message: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
//   MAIN SYNC — Đồng bộ thông minh, chỉ tải hóa đơn MỚI
//   
//   Chiến lược:
//   1. Kiểm tra tổng hóa đơn từ CUKCUK API
//   2. So sánh với số đã sync → nếu bằng nhau → skip (0 API calls)
//   3. Chỉ tải chi tiết thanh toán cho hóa đơn CHƯA có
//   4. Dùng localStorage Set cho tra cứu O(1)
// ══════════════════════════════════════════════════════════════
export async function syncTransactions(force) {
  var shift = getCurrentShift();
  if (!shift) {
    return { success: false, message: 'Chưa mở ca' };
  }

  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.key) {
    return { success: false, message: 'Chưa cấu hình CUKCUK' };
  }

  try {
    var shiftDate = shift.date || _getWorkingDayStr();
    showToast('🔄 Đang đồng bộ hóa đơn CUKCUK lên Sheets...', 'info');

    // 1. Trigger Apps Script backend sync to fetch from CUKCUK and update sheets
    const syncRes = await syncCukcukToSheetsOnCloud({
      workDate: shiftDate,
      forceDetail: !!force,
      mode: 'manual'
    });

    if (!syncRes || !syncRes.success) {
      throw new Error(syncRes?.message || 'Không thể đồng bộ CUKCUK sang Sheets');
    }

    showToast('📥 Đang tải dữ liệu từ Sheets về Webapp...', 'info');

    // 2. Load the invoices from Sheets (ultra-fast direct gviz/tq or fallback)
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
      const localMap = {};
      allLocal.forEach(function(inv) {
        localMap[inv.refId] = inv;
      });
      localStorage.setItem('cukcuk_invoice_store', JSON.stringify({ invoices: localMap }));
    } catch (dbErr) {
      console.warn('[CUKCUK] Failed to write cukcuk_invoice_store legacy cache:', dbErr);
    }

    // 4. Calculate stats for the return object
    var paymentStats = { cash: 0, card: 0, transfer: 0 };
    var totalAmount = 0;
    var count = 0;
    
    cloudInvoices.forEach(function(inv) {
      var isManual = inv.ManualLock === true || String(inv.ManualLock).toLowerCase() === 'true';
      var jsonStr = isManual ? (inv.ManualOverrideJson || inv.PaymentJson) : inv.PaymentJson;
      var payments = [];
      if (jsonStr) {
        try { payments = JSON.parse(jsonStr); } catch(e) {}
      }
      var isPaid = inv.IsPaid === true || String(inv.IsPaid).toLowerCase() === 'true';
      if (isPaid) {
        payments.forEach(function(p) {
          var pmtAmount = p.amount || p.Amount || 0;
          var method = (p.method || p.Method || '').toLowerCase();
          if (method === 'cash') paymentStats.cash += pmtAmount;
          else if (method === 'card') paymentStats.card += pmtAmount;
          else if (method === 'transfer') paymentStats.transfer += pmtAmount;
        });
        var effAmt = Number(inv.Amount) || 0;
        totalAmount += effAmt;
        count++;
      }
    });

    _setSyncMeta({
      lastTotal: cloudInvoices.length,
      lastSyncTime: new Date().toISOString(),
      lastDate: shiftDate
    });

    var statsMsg = '';
    if (paymentStats.cash > 0) statsMsg += 'TM: ' + paymentStats.cash.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.card > 0) statsMsg += '| Thẻ: ' + paymentStats.card.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.transfer > 0) statsMsg += '| CK: ' + paymentStats.transfer.toLocaleString('vi-VN') + 'đ';

    showToast('✅ Đồng bộ thành công! Nhận ' + count + ' hóa đơn (' + totalAmount.toLocaleString('vi-VN') + 'đ) từ Sheets', 'success');

    if (window.refreshView) {
      try { window.refreshView(); } catch(e) {}
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
  } catch (e) {
    console.error('[CUKCUK Sync Error]', e);
    showToast('❌ Lỗi đồng bộ: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

export async function syncInvoicesForDate(dateStr) {
  if (!dateStr) return { success: false, message: 'Chưa chỉ định ngày' };
  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.key) return { success: false, message: 'Chưa cấu hình CUKCUK' };

  try {
    showToast('🔄 Đang đồng bộ hóa đơn CUKCUK ngày ' + dateStr + '...', 'info');

    // 1. Sync from CUKCUK to Sheets via GAS
    const syncRes = await syncCukcukToSheetsOnCloud({
      workDate: dateStr,
      mode: 'manual'
    });

    if (!syncRes || !syncRes.success) {
      throw new Error(syncRes?.message || 'Không thể đồng bộ CUKCUK sang Sheets');
    }

    showToast('📥 Đang tải hóa đơn ngày ' + dateStr + ' từ Sheets...', 'info');

    // 2. Load from Sheets
    const loadRes = await getCukcukInvoicesFromCloud({ workDate: dateStr });
    if (!loadRes || !loadRes.success) {
      throw new Error(loadRes?.message || 'Không thể tải hóa đơn từ Sheets');
    }

    const cloudInvoices = loadRes.invoices || [];

    // 3. Merge into local store
    const mergedCount = await invoiceStore.mergeCloudInvoices(cloudInvoices);

    // Update legacy cukcuk_invoice_store cache
    try {
      const allLocal = await invoiceStore.getAllInvoices();
      const localMap = {};
      allLocal.forEach(function(inv) {
        localMap[inv.refId] = inv;
      });
      localStorage.setItem('cukcuk_invoice_store', JSON.stringify({ invoices: localMap }));
    } catch (e) {}

    // Calculate stats
    var paidCount = 0;
    var totalAmount = 0;
    cloudInvoices.forEach(function(inv) {
      var isPaid = inv.IsPaid === true || String(inv.IsPaid).toLowerCase() === 'true';
      if (isPaid) {
        paidCount++;
        totalAmount += Number(inv.Amount) || 0;
      }
    });

    showToast('✅ Đã đồng bộ ' + paidCount + ' hóa đơn ngày ' + dateStr + ' từ Sheets', 'success');

    if (window.refreshView) {
      try { window.refreshView(); } catch(e) {}
    }

    return {
      success: true,
      synced: mergedCount,
      total: cloudInvoices.length,
      records: cloudInvoices
    };
  } catch (e) {
    console.error('[CUKCUK] syncInvoicesForDate error:', e);
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

// ── Connection Status ──
export function getConnectionStatus() {
  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId || !cukcuk.key) {
    return { configured: false, connected: false, message: 'Chưa cấu hình' };
  }
  var cached = _getCachedToken();
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
export function getLastSyncInfo() {
  var todayRevenue = invoiceStore.getTodayRevenue();
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
 * Aggregates CUKCUK connection, sync state, cooldown, and Sheets queue.
 */
export function getSyncStatus() {
  var conn = getConnectionStatus();
  var meta = _getSyncMeta();
  var now = Date.now();
  var cooldownRemaining = 0;
  if (!_lastSyncHadNewData && _lastSyncApiTime > 0) {
    var elapsed = now - _lastSyncApiTime;
    if (elapsed < SYNC_COOLDOWN) {
      cooldownRemaining = Math.ceil((SYNC_COOLDOWN - elapsed) / 1000);
    }
  }
  var queueStatus = retryQueue.getStatus();
  var storedCount = 0;
  try {
    var todayStr = meta.lastDate || '';
    if (todayStr) storedCount = invoiceStore.getCountByDate(todayStr);
  } catch(e) { /* ignore */ }

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
