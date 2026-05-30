import { getCurrentShift, getSettings, getState, getShiftHistory, getShiftSummary } from '../store.js';
import { showToast, formatCurrency, getWorkingDay, getWorkingDayRange } from '../utils.js';
import { syncCukcukRevenueToCloud } from '../api.js';
import * as invoiceStore from './invoiceStore.js';
import * as retryQueue from './retryQueue.js';

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
    var gasUrl = import.meta.env.VITE_GAS_URL || '';
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
      return { 
        success: true, 
        message: 'Kết nối CUKCUK thành công!', 
        authInfo: data.auth 
      };
    } else {
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
    var gasUrl = import.meta.env.VITE_GAS_URL || '';
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
      return { 
        success: true, 
        message: data.message || 'Lấy lại token kết nối thành công!', 
        authInfo: data.auth 
      };
    } else {
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
  var gasUrl = import.meta.env.VITE_GAS_URL || '';
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
    var existing = invoiceStore.getInvoice(refId);
    if (existing && existing.isManuallyEdited) {
       showToast('⚠️ Hóa đơn đã được khóa do chỉnh sửa thủ công', 'warning');
       return { success: false, message: 'Hóa đơn đã bị khóa' };
    }

    var cached = _getCachedToken();
    if (!cached) {
      var loginResult = await loginAndGetToken();
      if (!loginResult.success) {
        showToast('❌ ' + loginResult.message, 'error');
        return { success: false, message: loginResult.message };
      }
    }

    var detail = await _fetchInvoiceDetail(refId);
    if (!detail) {
      showToast('⚠️ Không lấy được chi tiết hóa đơn', 'warning');
      return { success: false, message: 'Detail not found' };
    }

    var payments = detail.SAInvoicePayments || [];
    var detailAmount = detail.Amount || 0;
    var invoicePayments = [];
    var invCash = 0, invCard = 0, invTransfer = 0;

    if (payments.length > 0) {
      for (var p = 0; p < payments.length; p++) {
        var pmt = payments[p];
        var pmtAmount = pmt.Amount || 0;
        if (pmtAmount <= 0) continue;
        var mapped = _mapPayment(pmt);
        invoicePayments.push({ method: mapped.method, amount: pmtAmount, label: mapped.label });
        if (mapped.method === 'cash') invCash += pmtAmount;
        else if (mapped.method === 'card') invCard += pmtAmount;
        else if (mapped.method === 'transfer') invTransfer += pmtAmount;
      }
    }

    // No payment = chưa thanh toán / chưa đóng bàn
    if (invoicePayments.length === 0) {
      showToast('⏳ Hóa đơn chưa được thanh toán trên CUKCUK', 'warning');
      return { success: false, message: 'Chưa thanh toán' };
    }

    var effectiveAmount = (invCash + invCard + invTransfer) || detailAmount;

    // ── Extract Items (for Drink Inventory) ──
    var itemsList = detail.SAInvoiceDetails || detail.Details || [];
    var extractedItems = [];
    if (itemsList.length > 0) {
      for (var it = 0; it < itemsList.length; it++) {
        var itemData = itemsList[it];
        var itemName = itemData.InventoryItemName || itemData.ItemName || itemData.Name || '';
        var itemQty = itemData.Quantity || itemData.Qty || 1;
        if (itemName) {
          extractedItems.push({ name: itemName, quantity: itemQty });
        }
      }
    }

    // Get existing record to preserve metadata
    var record = {
      refId: refId,
      refNo: (existing && existing.refNo) || (detail.RefNo || ''),
      refDate: (existing && existing.refDate) || (detail.RefDate || ''),
      date: (existing && existing.date) || _getWorkingDayStr(),
      tableName: (existing && existing.tableName) || (detail.TableName || ''),
      employeeName: (existing && existing.employeeName) || (detail.EmployeeName || ''),
      amount: effectiveAmount,
      payments: invoicePayments,
      items: extractedItems, // Save items for inventory
      unpaid: false,
      confirmed: true,
      syncedAt: new Date().toISOString(),
      pushedToSheets: false  // Mark for re-push
    };

    invoiceStore.upsertInvoice(record);

    var changed = !existing || existing.amount !== effectiveAmount;
    var paymentLabel = invoicePayments.map(function(pp) { return pp.label; }).join(', ');
    showToast('✅ ' + (record.refNo || refId) + ': ' + formatCurrency(effectiveAmount) + ' (' + paymentLabel + ')', 'success');
    console.log('[CUKCUK] Single sync ' + refId + ': ' + effectiveAmount + ' → ' + paymentLabel + (changed ? ' (UPDATED)' : ' (no change)'));

    return { success: true, changed: changed, amount: effectiveAmount, payments: invoicePayments };
  } catch(e) {
    console.error('[CUKCUK] Single sync error:', e);
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
}

// ── Push manual edit to Google Sheets ──
export async function pushManualEditToSheets(refId) {
  var inv = invoiceStore.getInvoice(refId);
  if (!inv) return { success: false };
  var shift = getCurrentShift() || { id: 'manual' };
  
  var invCash = 0, invCard = 0, invTransfer = 0;
  (inv.payments || []).forEach(function(p) {
    if (p.method === 'cash') invCash += p.amount;
    else if (p.method === 'card') invCard += p.amount;
    else if (p.method === 'transfer') invTransfer += p.amount;
  });
  
  var sheetData = [{
    refId: inv.refId, refNo: inv.refNo || '', refDate: inv.refDate || '',
    tableName: inv.tableName || '', employeeName: inv.employeeName || '', amount: inv.amount,
    cashAmount: invCash, cardAmount: invCard, transferAmount: invTransfer,
    paymentInfo: inv.payments.map(function(pp) { return pp.label + ': ' + pp.amount.toLocaleString('vi-VN'); }).join(' + ')
  }];
  
  try {
    var sheetsRes = await syncCukcukRevenueToCloud(sheetData, shift.id);
    if (sheetsRes && sheetsRes.success) {
      invoiceStore.markPushedToSheets([refId]);
      return { success: true };
    } else {
      retryQueue.enqueue(sheetData, shift.id, [refId]);
      return { success: false, queued: true };
    }
  } catch(e) {
    retryQueue.enqueue(sheetData, shift.id, [refId]);
    return { success: false, queued: true };
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
    return { success: false, message: 'Chưa cấu hình' };
  }

  try {
    // ═══ Use SHIFT DATE for working day range ═══
    var shiftDate = shift.date || _getWorkingDayStr();
    var workingDay = _getWorkingDayRange(shiftDate);
    var fromDate = workingDay.from;
    var toDate = workingDay.to;
    var todayStr = shiftDate;
    
    // Clean up old indexes periodically
    _cleanupOldSyncIndexes();
    
    // invoiceStore = bộ nhớ ghi nhớ giao dịch đã đồng bộ (key: RefId)
    // → getInvoice(refId) !== null → đã đồng bộ → BỎ QUA
    // → getInvoice(refId) === null → MỚI → fetch detail + lưu
    var totalStored = invoiceStore.getInvoiceCount();
    var storedCount = invoiceStore.getCountByDate(todayStr);
    console.log('[CUKCUK] v4 sync | date:', todayStr, '| storedAll:', totalStored, '| storedToday:', storedCount, '| force:', !!force);

    // ═══ COOLDOWN (auto-sync only) ═══
    if (!force) {
      var timeSinceLastSync = Date.now() - _lastSyncApiTime;
      if (timeSinceLastSync < SYNC_COOLDOWN && !_lastSyncHadNewData) {
        return { success: true, synced: 0, total: storedCount, skipped: storedCount, amount: 0, date: todayStr, smart: true, cooldown: true };
      }
    }

    // ═══ STEP 1: Fetch page 1 to get apiTotal ═══
    var useFrom = force ? null : fromDate;
    var useTo = force ? null : toDate;

    var data = await _fetchInvoices(useFrom, useTo, 1);
    if (data._authFailed) return { success: false, message: data.message };
    if (!data.Success) throw new Error(data.ErrorMessage || data.Message || 'Lỗi API');

    var firstPageInvoices = _extractPageData(data);
    var apiTotal = data.Total || firstPageInvoices.length;
    var newOnApi = apiTotal - totalStored;
    console.log('[CUKCUK] API total: ' + apiTotal + ' | Stored: ' + totalStored + ' | Diff: ' + newOnApi);

    // ═══ STEP 2: Smart scan — only pages with potential new invoices ═══
    var toProcess = [];
    var allSyncedRefIds = [];

    function _scanPage(pageInvoices) {
      var newOnThisPage = 0;
      for (var k = 0; k < pageInvoices.length; k++) {
        var inv = pageInvoices[k];
        var refId = String(inv.RefId || inv.RefID || ('idx-' + k));
        var apiAmount = inv.Amount || 0;
        allSyncedRefIds.push(refId);
        if (apiAmount <= 0) continue;
        var existing = invoiceStore.getInvoice(refId);
        if (!existing) {
          toProcess.push({ inv: inv, refId: refId, reason: 'new' });
          newOnThisPage++;
          console.log('[CUKCUK] ★ NEW: ' + (inv.RefNo || refId) + ' ' + apiAmount.toLocaleString() + 'đ');
        } else if (existing.unpaid && !existing.manualOverride) {
          toProcess.push({ inv: inv, refId: refId, reason: 'unpaid-refresh' });
          newOnThisPage++;
        }
      }
      return newOnThisPage;
    }

    if (force) {
      // ═══ FORCE: Targeted scan — only pages that COULD have new invoices ═══
      var totalPages = Math.ceil(apiTotal / 100) || 1;

      if (newOnApi > 0) {
        // New invoices detected! Scan from the page where they start
        var startPage = Math.floor(totalStored / 100) + 1;
        if (startPage < 1) startPage = 1;
        console.log('[CUKCUK] SMART: ' + newOnApi + ' new detected, scanning pages ' + startPage + '-' + totalPages);
        showToast('🔍 Tìm ' + newOnApi + ' hóa đơn mới...', 'info');

        for (var pg = startPage; pg <= totalPages; pg++) {
          var pgData = (pg === 1) ? data : await _fetchInvoices(useFrom, useTo, pg);
          if (pg !== 1 && (pgData._authFailed || !pgData.Success)) break;
          var pgInvoices = (pg === 1) ? firstPageInvoices : _extractPageData(pgData);
          if (pgInvoices.length === 0) break;
          _scanPage(pgInvoices);
        }
      } else {
        // API says same count — do a quick check on page 1 + last page for edge cases
        console.log('[CUKCUK] SMART: API total unchanged (' + apiTotal + '), checking page 1 + last page');
        _scanPage(firstPageInvoices);
        if (totalPages > 1) {
          var lastData = await _fetchInvoices(useFrom, useTo, totalPages);
          if (lastData.Success) {
            var lastInvoices = _extractPageData(lastData);
            _scanPage(lastInvoices);
          }
        }
      }
    } else {
      // ═══ AUTO: Scan page 1 only, extend if new found ═══
      var newOnPage1 = _scanPage(firstPageInvoices);
      if (firstPageInvoices.length >= 100 && (newOnPage1 > 0 || newOnApi > 0)) {
        var page = 2;
        var emptyRun = 0;
        while (page <= 20) {
          var pageData = await _fetchInvoices(useFrom, useTo, page);
          if (pageData._authFailed || !pageData.Success) break;
          var pageInvoices = _extractPageData(pageData);
          if (pageInvoices.length === 0) break;
          var n = _scanPage(pageInvoices);
          if (n === 0) { emptyRun++; if (emptyRun >= 2) break; } else { emptyRun = 0; }
          if (pageInvoices.length < 100) break;
          page++;
        }
      }
    }

    console.log('[CUKCUK] Scan complete: ' + toProcess.length + ' to process, ' + allSyncedRefIds.length + ' scanned');

    // ═══ STEP 3: Nothing to update ═══
    if (toProcess.length === 0) {
      _addSyncedRefIdsBulk(todayStr, allSyncedRefIds);
      _lastSyncApiTime = Date.now();
      _lastSyncHadNewData = false;
      _setSyncMeta({ lastTotal: apiTotal, lastSyncTime: new Date().toISOString(), lastDate: todayStr });
      if (force) showToast('ℹ️ API: ' + apiTotal + ' hóa đơn — tất cả đã đồng bộ', 'info');
      return { success: true, synced: 0, total: apiTotal, skipped: allSyncedRefIds.length, amount: 0, date: todayStr, smart: true };
    }

    // ═══ STEP 5: Fetch details for invoices that need update ═══
    if (toProcess.length > 3) {
      showToast('📥 ' + toProcess.length + ' hóa đơn cần cập nhật từ CUKCUK...', 'info');
    }
    
    var count = 0;
    var totalAmount = 0;
    var paymentStats = { cash: 0, card: 0, transfer: 0 };
    var sheetData = [];
    var invoiceRecords = [];
    var BATCH_SIZE = 5;

    console.log('[CUKCUK] Processing ' + toProcess.length + ' invoices in parallel batches of ' + BATCH_SIZE);

    // Process in parallel batches
    for (var batchStart = 0; batchStart < toProcess.length; batchStart += BATCH_SIZE) {
      var batch = toProcess.slice(batchStart, batchStart + BATCH_SIZE);
      
      // Fire all detail requests in this batch concurrently
      var detailPromises = batch.map(function(item) {
        return _fetchInvoiceDetail(item.refId).then(function(detail) {
          return { item: item, detail: detail };
        });
      });
      
      var results = await Promise.all(detailPromises);
      
      // Process results
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        var inv = r.item.inv;
        var refId = r.item.refId;
        var detail = r.detail;
        var refNo = inv.RefNo || '';
        var tableName = inv.TableName || '';
        var employeeName = inv.EmployeeName || '';
        var refDate = inv.RefDate || '';
        var payments = (detail && detail.SAInvoicePayments) ? detail.SAInvoicePayments : null;
        
        // ★ Use detail Amount (tax-inclusive) if available, fallback to list Amount
        var detailAmount = (detail && detail.Amount) ? detail.Amount : (inv.Amount || 0);
        
        var invoicePayments = [];
        var invCash = 0, invCard = 0, invTransfer = 0;

        if (payments && payments.length > 0) {
          for (var p = 0; p < payments.length; p++) {
            var pmt = payments[p];
            var pmtAmount = pmt.Amount || 0;
            if (pmtAmount <= 0) continue;
            
            var mapped = _mapPayment(pmt);
            invoicePayments.push({ method: mapped.method, amount: pmtAmount, label: mapped.label });

            if (mapped.method === 'cash') invCash += pmtAmount;
            else if (mapped.method === 'card') invCard += pmtAmount;
            else if (mapped.method === 'transfer') invTransfer += pmtAmount;
          }
        }

        // ★ No payment data = bill chưa thanh toán (chưa đóng bàn)
        if (invoicePayments.length === 0) {
          console.log('[CUKCUK] Unpaid bill:', refId, refNo, '(' + detailAmount.toLocaleString() + 'đ)');
          // Save as unpaid — won't re-fetch, won't count as revenue
          invoiceRecords.push({
            refId: refId, refNo: refNo, refDate: refDate, date: _getWorkingDayFromRefDate(refDate, todayStr),
            tableName: tableName, employeeName: employeeName,
            amount: detailAmount, payments: [],
            unpaid: true, confirmed: true,
            syncedAt: new Date().toISOString(), pushedToSheets: false
          });
          continue;
        }

        // ★ effectiveAmount = sum of payments (tax-inclusive)
        var effectiveAmount = (invCash + invCard + invTransfer) || detailAmount;
        // (NEW invoice only — existing invoices are skipped at STEP 3)
        
        invoiceRecords.push({
          refId: refId, refNo: refNo, refDate: refDate, date: _getWorkingDayFromRefDate(refDate, todayStr),
          tableName: tableName, employeeName: employeeName,
          amount: effectiveAmount, payments: invoicePayments,
          unpaid: false, confirmed: true,
          syncedAt: new Date().toISOString(), pushedToSheets: false
        });
        
        paymentStats.cash += invCash;
        paymentStats.card += invCard;
        paymentStats.transfer += invTransfer;
        totalAmount += effectiveAmount;
        count++;

        sheetData.push({
          refId: refId, refNo: refNo, refDate: refDate,
          tableName: tableName, employeeName: employeeName, amount: effectiveAmount,
          cashAmount: invCash, cardAmount: invCard, transferAmount: invTransfer,
          paymentInfo: invoicePayments.map(function(pp) { return pp.label + ': ' + pp.amount.toLocaleString('vi-VN'); }).join(' + ')
        });
      }

      // Progress toast per batch
      if (batchStart + BATCH_SIZE < toProcess.length) {
        showToast('📥 ' + Math.min(batchStart + BATCH_SIZE, toProcess.length) + '/' + toProcess.length + ' hóa đơn...', 'info');
      }
    }

    // ★ BULK WRITES — single localStorage + invoiceStore write
    if (invoiceRecords.length > 0) {
      invoiceStore.bulkUpsert(invoiceRecords);
    }
    _addSyncedRefIdsBulk(todayStr, allSyncedRefIds);

    // 7. Update sync meta (Invoice Store is now the source of truth for revenue)
    _setSyncMeta({ lastTotal: apiTotal, lastSyncTime: new Date().toISOString(), lastDate: todayStr });
    _lastSyncApiTime = Date.now();
    _lastSyncHadNewData = count > 0;

    // 7b. Push to cloud for cross-device sync (non-blocking)
    if (count > 0) {
      invoiceStore.pushInvoicesToCloud(todayStr).catch(function() {});
    }

    // 8. Push to Google Sheets (with retry queue fallback)
    if (sheetData.length > 0) {
      console.log('[CUKCUK] Pushing ' + sheetData.length + ' NEW invoices to Google Sheets...');
      var pushedRefIds = sheetData.map(function(sd) { return sd.refId; });
      try {
        var sheetsRes = await syncCukcukRevenueToCloud(sheetData, shift.id);
        if (sheetsRes && sheetsRes.success) {
          console.log('[CUKCUK→Sheets] ✅ ' + sheetsRes.message);
          invoiceStore.markPushedToSheets(pushedRefIds);
          showToast('☁️ Đã đẩy ' + sheetData.length + ' hóa đơn lên Sheets', 'success');
        } else {
          // Push failed → enqueue for retry
          retryQueue.enqueue(sheetData, shift.id, pushedRefIds);
          showToast('⚠️ Sheets tạm lỗi, sẽ tự động thử lại', 'warning');
        }
      } catch(pushErr) {
        retryQueue.enqueue(sheetData, shift.id, pushedRefIds);
        console.warn('[CUKCUK→Sheets] Failed, queued for retry:', pushErr.message);
      }
    }

    // 8b. Process retry queue (replaces old unpushed retry logic)
    retryQueue.processQueue();

    // 9. Report results
    var statsMsg = '';
    if (paymentStats.cash > 0) statsMsg += 'TM: ' + paymentStats.cash.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.card > 0) statsMsg += '| Thẻ: ' + paymentStats.card.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.transfer > 0) statsMsg += '| CK: ' + paymentStats.transfer.toLocaleString('vi-VN') + 'đ';

    if (count > 0) {
      showToast('✅ +' + count + ' hóa đơn mới (' + totalAmount.toLocaleString('vi-VN') + 'đ) — ' + statsMsg, 'success');
      if (window.refreshView) window.refreshView();
    }

    return { success: true, synced: count, total: apiTotal, skipped: storedCount, amount: totalAmount, payments: paymentStats, date: todayStr, smart: true };

  } catch (e) {
    console.error('[CUKCUK Sync Error]', e);
    showToast('❌ Lỗi đồng bộ: ' + e.message, 'error');
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

/**
 * Sync CUKCUK invoices for a specific date (used by history view).
 * Fetches all pages of invoices for the given working day, stores in invoiceStore.
 * @param {string} dateStr - YYYY-MM-DD working day date
 * @returns {Promise<{success, synced, total}>}
 */
export async function syncInvoicesForDate(dateStr) {
  if (!dateStr) return { success: false, message: 'Chưa chỉ định ngày' };
  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.key) return { success: false, message: 'Chưa cấu hình CUKCUK' };

  try {
    var range = _getWorkingDayRange(dateStr);
    showToast('🔄 Đang tải hóa đơn POS ngày ' + dateStr + '...', 'info');

    // Fetch all pages
    var allInvoices = [];
    var page = 1;
    while (page <= 50) {
      var data = await _fetchInvoices(range.from, range.to, page);
      if (data._authFailed) return { success: false, message: data.message };
      if (!data.Success) throw new Error(data.ErrorMessage || 'Lỗi API');
      var pageItems = _extractPageData(data);
      if (pageItems.length === 0) break;
      allInvoices = allInvoices.concat(pageItems);
      if (pageItems.length < 100) break;
      page++;
    }

    if (allInvoices.length === 0) {
      showToast('ℹ️ Không tìm thấy hóa đơn POS cho ngày ' + dateStr, 'info');
      return { success: true, synced: 0, total: 0 };
    }

    // Fetch details in batches of 5
    var BATCH = 5;
    var records = [];
    for (var b = 0; b < allInvoices.length; b += BATCH) {
      var batch = allInvoices.slice(b, b + BATCH);
      var promises = batch.map(function(inv) {
        var refId = String(inv.RefId || inv.RefID || '');
        return _fetchInvoiceDetail(refId).then(function(detail) {
          return { inv: inv, refId: refId, detail: detail };
        });
      });
      var results = await Promise.all(promises);

      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        var inv = r.inv;
        var refId = r.refId;
        var detail = r.detail;
        var detailAmount = (detail && detail.Amount) ? detail.Amount : (inv.Amount || 0);
        var invoicePayments = [];
        var pmts = (detail && detail.SAInvoicePayments) ? detail.SAInvoicePayments : [];

        for (var p = 0; p < pmts.length; p++) {
          var pmt = pmts[p];
          if ((pmt.Amount || 0) <= 0) continue;
          var mapped = _mapPayment(pmt);
          invoicePayments.push({ method: mapped.method, amount: pmt.Amount, label: mapped.label });
        }

        var effAmt = 0;
        invoicePayments.forEach(function(ip) { effAmt += ip.amount; });
        if (!effAmt) effAmt = detailAmount;

        records.push({
          refId: refId, refNo: inv.RefNo || '', refDate: inv.RefDate || '', date: dateStr,
          tableName: inv.TableName || '', employeeName: inv.EmployeeName || '',
          amount: effAmt, payments: invoicePayments,
          unpaid: invoicePayments.length === 0, confirmed: true,
          syncedAt: new Date().toISOString(), pushedToSheets: false
        });
      }

      if (b + BATCH < allInvoices.length) {
        showToast('📥 ' + Math.min(b + BATCH, allInvoices.length) + '/' + allInvoices.length + ' hóa đơn...', 'info');
      }
    }

    // Save to invoiceStore
    var paidRecords = records.filter(function(r) { return !r.unpaid; });
    if (records.length > 0) invoiceStore.bulkUpsert(records);

    showToast('✅ Đồng bộ ' + paidRecords.length + '/' + allInvoices.length + ' hóa đơn POS ngày ' + dateStr, 'success');
    return { success: true, synced: paidRecords.length, total: allInvoices.length, records: paidRecords };

  } catch(e) {
    console.error('[CUKCUK] syncInvoicesForDate error:', e);
    showToast('❌ Lỗi: ' + e.message, 'error');
    return { success: false, message: e.message };
  }
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
