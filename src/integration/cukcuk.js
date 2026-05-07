import { getCurrentShift, getSettings, getState, getShiftHistory, getShiftSummary } from '../store.js';
import { showToast, formatCurrency } from '../utils.js';
import { syncCukcukRevenueToCloud } from '../api.js';
import * as invoiceStore from './invoiceStore.js';

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
// Uses /cukcuk-api proxy path:
// - Dev (localhost): Vite proxy → graphapi.cukcuk.vn
// - Production (Cloudflare Pages): Pages Function → graphapi.cukcuk.vn
var CUKCUK_API_BASE = '/cukcuk-api';

// ── Token Cache ──
var _cachedToken = null;
var _cachedCompanyCode = null;
var _cachedTokenTime = 0;
var TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours (official CUKCUK TTL)

// ── Daily Revenue Cache ──
var DAILY_REVENUE_KEY = 'cukcuk_daily_revenue';
var CACHE_VERSION_KEY = 'cukcuk_cache_version';
var CACHE_VERSION = 3; // Bump: force re-sync with tax-inclusive amounts

// ── Auto-migrate: clear corrupted cache from old versions ──
(function _migrateCacheIfNeeded() {
  try {
    var ver = localStorage.getItem(CACHE_VERSION_KEY);
    if (!ver || parseInt(ver) < CACHE_VERSION) {
      localStorage.removeItem(DAILY_REVENUE_KEY);
      localStorage.removeItem('cukcuk_sync_meta');
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

function _getCachedToken() {
  if (_cachedToken && (Date.now() - _cachedTokenTime) < TOKEN_TTL) {
    return { token: _cachedToken, companyCode: _cachedCompanyCode };
  }
  try {
    var saved = localStorage.getItem('cukcuk_token');
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.token && (Date.now() - parsed.time) < TOKEN_TTL) {
        _cachedToken = parsed.token;
        _cachedCompanyCode = parsed.companyCode;
        _cachedTokenTime = parsed.time;
        return { token: _cachedToken, companyCode: _cachedCompanyCode };
      }
    }
  } catch(e) { /* ignore */ }
  return null;
}

function _setCachedToken(token, companyCode) {
  _cachedToken = token;
  _cachedCompanyCode = companyCode;
  _cachedTokenTime = Date.now();
  try {
    localStorage.setItem('cukcuk_token', JSON.stringify({ 
      token: token, companyCode: companyCode, time: _cachedTokenTime 
    }));
  } catch(e) { /* ignore */ }
}

function _clearCachedToken() {
  _cachedToken = null;
  _cachedCompanyCode = null;
  _cachedTokenTime = 0;
  try { localStorage.removeItem('cukcuk_token'); } catch(e) { /* ignore */ }
}

// ── Centralized API Call with Auto-Retry on Auth Failure ──
// Official pattern: https://graphapi.cukcuk.vn/document/articles/using_authen.html
// CUKCUK may return auth errors as:
//   (A) HTTP 401 status
//   (B) HTTP 200 + JSON { Success: false, ErrorMessage: "Authorization has been denied..." }
// Both cases → clear token → re-login → retry once
async function _cukcukApiCall(url, options, _isRetry) {
  // Ensure we have a valid token
  var auth = await loginAndGetToken();
  if (!auth.success) {
    return { _authFailed: true, message: auth.message };
  }
  
  // Set auth headers — clone options to avoid mutating on retry
  var reqHeaders = {};
  if (options.headers) {
    for (var hk in options.headers) reqHeaders[hk] = options.headers[hk];
  }
  reqHeaders['Authorization'] = 'Bearer ' + auth.token;
  reqHeaders['CompanyCode'] = auth.companyCode;
  
  var fetchOpts = { method: options.method || 'GET', headers: reqHeaders };
  if (options.body) fetchOpts.body = options.body;
  
  var response = await fetch(CUKCUK_API_BASE + url, fetchOpts);
  
  // Case A: HTTP 401 status
  if (response.status === 401 && !_isRetry) {
    console.log('[CUKCUK] HTTP 401, refreshing token...');
    _clearCachedToken();
    return _cukcukApiCall(url, options, true);
  }
  
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' from ' + url);
  }
  
  var data = await response.json();
  
  // Case B: HTTP 200 but auth error in body
  if (!_isRetry && data && !data.Success) {
    var errMsg = (data.ErrorMessage || data.Message || '').toLowerCase();
    if (errMsg.indexOf('authorization') !== -1 || errMsg.indexOf('denied') !== -1 || 
        errMsg.indexOf('token') !== -1 || errMsg.indexOf('expired') !== -1 ||
        errMsg.indexOf('hết hạn') !== -1) {
      console.log('[CUKCUK] Auth error in body:', data.ErrorMessage || data.Message, '→ refreshing token...');
      _clearCachedToken();
      return _cukcukApiCall(url, options, true);
    }
  }
  
  return data;
}

// ── HMAC-SHA256 Signature (Web Crypto API) ──
async function _generateSignature(message, secret) {
  var encoder = new TextEncoder();
  var keyData = encoder.encode(secret);
  var messageData = encoder.encode(message);

  var cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  var signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  var array = new Uint8Array(signature);
  var hex = '';
  for (var i = 0; i < array.length; i++) {
    hex += array[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ── Get Clean Domain ──
function _getCleanDomain(rawDomain) {
  var d = (rawDomain || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/\.cukcuk\.vn\/?$/, '');
  d = d.replace(/\/$/, '');
  return d;
}

// ── Working Day Logic ──
// Ngày làm việc: 12:00 trưa → 06:00 sáng hôm sau
// VD: Ca ngày 16/04 = 16/04 12:00:00 → 17/04 05:59:59
function _getWorkingDayStr() {
  var now = new Date();
  // If before 6:00 AM, the working day is YESTERDAY
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * Get the CUKCUK API date range for a given shift date.
 * Working day: shiftDate 12:00:00 → shiftDate+1 05:59:59
 * @param {string} shiftDate - YYYY-MM-DD of the shift
 */
function _getWorkingDayRange(shiftDate) {
  if (!shiftDate) shiftDate = _getWorkingDayStr();
  // Start: shiftDate at 12:00:00 (noon)
  var from = shiftDate + 'T12:00:00';
  // End: next day at 05:59:59
  var d = new Date(shiftDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  var nextY = d.getFullYear();
  var nextM = String(d.getMonth() + 1).padStart(2, '0');
  var nextD = String(d.getDate()).padStart(2, '0');
  var to = nextY + '-' + nextM + '-' + nextD + 'T05:59:59';
  return { from: from, to: to, date: shiftDate };
}

// Keep simple today helper for cache keys
function _getTodayStr() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ── Login & Get Token ──
export async function loginAndGetToken() {
  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId || !cukcuk.key) {
    return { success: false, message: 'Chưa cấu hình CUKCUK. Vào Cài đặt → CUKCUK để nhập Domain, App ID và Secret Key.' };
  }

  // Check cache first
  var cached = _getCachedToken();
  if (cached) {
    console.log('[CUKCUK] Using cached token');
    return { success: true, token: cached.token, companyCode: cached.companyCode };
  }

  try {
    var loginTime = new Date().toISOString().split('.')[0] + 'Z';
    var cleanDomain = _getCleanDomain(cukcuk.domain);
    var appId = cukcuk.appId.trim();
    var secretKey = cukcuk.key.trim();

    var payloadStr = JSON.stringify({
      AppID: appId,
      Domain: cleanDomain,
      LoginTime: loginTime
    });

    var signature = await _generateSignature(payloadStr, secretKey);

    console.log('[CUKCUK] Login attempt:', { appId: appId, domain: cleanDomain, loginTime: loginTime });

    var response = await fetch(CUKCUK_API_BASE + '/api/Account/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        AppID: appId,
        Domain: cleanDomain,
        LoginTime: loginTime,
        SignatureInfo: signature
      })
    });

    if (!response.ok) {
      if (response.status === 405) {
        // 405 from CUKCUK API means invalid request format  
        var body405 = '';
        try { body405 = await response.text(); } catch(e) {}
        console.warn('[CUKCUK] Login 405:', body405);
        return { success: false, message: '❌ CUKCUK API từ chối (405). Kiểm tra App ID và Domain trong Cài đặt.' };
      }
      throw new Error('HTTP ' + response.status);
    }

    var data = await response.json();
    
    if (data.Success && data.Data) {
      // Data is an object: { AccessToken, CompanyCode, Domain, AppID }
      var accessToken = data.Data.AccessToken || data.Data;
      var companyCode = data.Data.CompanyCode || cleanDomain;
      
      _setCachedToken(accessToken, companyCode);
      console.log('[CUKCUK] Login successful! CompanyCode:', companyCode);
      return { success: true, token: accessToken, companyCode: companyCode };
    } else {
      _clearCachedToken();
      var errMsg = data.ErrorMessage || data.Message || 'Lỗi không xác định';
      var errLower = errMsg.toLowerCase();
      
      if (errLower.indexOf('invalid signature') !== -1 || errLower.indexOf('chữ ký') !== -1) {
        errMsg = '🔑 Secret Key đã hết hạn hoặc không hợp lệ!\n\n' +
          'Cách fix:\n' +
          '1) Vào https://' + cleanDomain + '.cukcuk.vn\n' +
          '2) Thiết lập → Ứng dụng → API\n' +
          '3) Bấm "TẠO MÃ KẾT NỐI" → Copy Secret Key mới\n' +
          '4) Dán vào Cài đặt → CUKCUK → Lưu';
      } else if (errLower.indexOf('authorization') !== -1 || errLower.indexOf('denied') !== -1) {
        errMsg = '🔒 Xác thực bị từ chối!\n\n' +
          'Token có thể đã hết hạn. Vui lòng:\n' +
          '1) Kiểm tra Secret Key trong Cài đặt → CUKCUK\n' +
          '2) Nếu vẫn lỗi, vào https://' + cleanDomain + '.cukcuk.vn\n' +
          '   → Thiết lập → Ứng dụng → API\n' +
          '3) Bấm "TẠO MÃ KẾT NỐI" → lấy Secret Key mới';
      }
      
      console.warn('[CUKCUK] Login failed:', data);
      return { success: false, message: errMsg };
    }
  } catch (e) {
    console.error('[CUKCUK] Connection error:', e);
    if (e.message && e.message.indexOf('Failed to fetch') !== -1) {
      return { success: false, message: 'Không thể kết nối CUKCUK API. Kiểm tra Internet hoặc dùng localhost.' };
    }
    return { success: false, message: 'Lỗi kết nối: ' + e.message };
  }
}

// ── Test Connection ──
export async function testConnection() {
  _clearCachedToken();
  return loginAndGetToken();
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

// ── Force Re-Sync: Clear old CUKCUK data and re-fetch with payment details ──
export async function resyncAllTransactions() {
  var shift = getCurrentShift();
  if (!shift) {
    showToast('Bạn cần mở ca trước', 'warning');
    return { success: false };
  }
  
  var todayStr = shift.date || _getWorkingDayStr();
  
  // Remove today's invoices from Invoice Store
  var allInvoices = invoiceStore.getAllInvoices();
  var removedCount = 0;
  for (var i = 0; i < allInvoices.length; i++) {
    if (allInvoices[i].date === todayStr) removedCount++;
  }
  // Clear and re-add non-today invoices
  var keepInvoices = allInvoices.filter(function(inv) { return inv.date !== todayStr; });
  invoiceStore.clearAll();
  invoiceStore.bulkUpsert(keepInvoices);
  
  // Clear the synced RefID index so everything re-downloads
  _clearSyncedRefIds(todayStr);
  _setSyncMeta({ lastTotal: 0, lastSyncTime: '', lastDate: todayStr });
  
  console.log('[CUKCUK] Removed ' + removedCount + ' invoices for ' + todayStr + '. Re-syncing...');
  showToast('🔄 Đã xóa ' + removedCount + ' hóa đơn. Đang đồng bộ lại...', 'info');
  
  // Now sync fresh
  return await syncTransactions();
}

// ── Sync a single invoice by RefId ──
export async function syncSingleInvoice(refId) {
  try {
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
    } else {
      invCash = detailAmount;
      invoicePayments.push({ method: 'cash', amount: detailAmount, label: 'Tiền mặt' });
    }

    var effectiveAmount = (invCash + invCard + invTransfer) || detailAmount;

    // Get existing record to preserve metadata
    var existing = invoiceStore.getInvoice(refId);
    var record = {
      refId: refId,
      refNo: (existing && existing.refNo) || (detail.RefNo || ''),
      refDate: (existing && existing.refDate) || (detail.RefDate || ''),
      date: (existing && existing.date) || _getWorkingDayStr(),
      tableName: (existing && existing.tableName) || (detail.TableName || ''),
      employeeName: (existing && existing.employeeName) || (detail.EmployeeName || ''),
      amount: effectiveAmount,
      payments: invoicePayments,
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

// ══════════════════════════════════════════════════════════════
//   MAIN SYNC — Đồng bộ thông minh, chỉ tải hóa đơn MỚI
//   
//   Chiến lược:
//   1. Kiểm tra tổng hóa đơn từ CUKCUK API
//   2. So sánh với số đã sync → nếu bằng nhau → skip (0 API calls)
//   3. Chỉ tải chi tiết thanh toán cho hóa đơn CHƯA có
//   4. Dùng localStorage Set cho tra cứu O(1)
// ══════════════════════════════════════════════════════════════
export async function syncTransactions() {
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
    
    // Load the synced RefID index for today (O(1) lookups)
    var syncedRefs = _getSyncedRefIds(todayStr);
    var syncedCount = Object.keys(syncedRefs).length;
    var syncMeta = _getSyncMeta();
    
    console.log('[CUKCUK] Smart sync for', todayStr, '| Already synced:', syncedCount, 'refs');

    // ═══ STEP 1: Fetch page 1 to get total count ═══
    var data = await _fetchInvoices(fromDate, toDate, 1);
    
    if (data._authFailed) {
      return { success: false, message: data.message };
    }

    if (!data.Success) {
      var errDetail = data.ErrorMessage || data.Message || 'Lỗi API';
      throw new Error(errDetail);
    }

    var firstPageInvoices = [];
    if (data.Data) {
      if (Array.isArray(data.Data)) firstPageInvoices = data.Data;
      else if (data.Data.PageData) firstPageInvoices = data.Data.PageData;
      else if (data.Data.Items) firstPageInvoices = data.Data.Items;
    }
    
    var apiTotal = data.Total || firstPageInvoices.length;

    // ═══ STEP 2: Collect ALL invoices from all pages ═══
    var allApiInvoices = firstPageInvoices.slice();

    if (firstPageInvoices.length >= 100 && apiTotal > firstPageInvoices.length) {
      var page = 2;
      var maxPages = 20;
      while (page <= maxPages) {
        var pageData = await _fetchInvoices(fromDate, toDate, page);
        if (pageData._authFailed || !pageData.Success) break;
        
        var pageInvoices = [];
        if (pageData.Data) {
          if (Array.isArray(pageData.Data)) pageInvoices = pageData.Data;
          else if (pageData.Data.PageData) pageInvoices = pageData.Data.PageData;
          else if (pageData.Data.Items) pageInvoices = pageData.Data.Items;
        }
        
        for (var pi = 0; pi < pageInvoices.length; pi++) {
          allApiInvoices.push(pageInvoices[pi]);
        }
        
        if (pageInvoices.length < 100) break;
        page++;
      }
    }

    // ═══ STEP 2b: Quick skip — if count unchanged AND all TODAY invoices confirmed ═══
    if (apiTotal > 0 && apiTotal <= syncedCount) {
      // Count matches — only do a lightweight check for unconfirmed invoices
      var hasUnconfirmed = false;
      for (var qi = 0; qi < allApiInvoices.length; qi++) {
        var qInv = allApiInvoices[qi];
        var qRefId = String(qInv.RefId || qInv.RefID || ('idx-' + qi));
        var qExisting = invoiceStore.getInvoice(qRefId);
        if (!qExisting || !qExisting.confirmed || qExisting.amount !== (qInv.Amount || 0)) {
          hasUnconfirmed = true; break;
        }
      }
      if (!hasUnconfirmed) {
        // All invoices confirmed and amounts match — truly nothing to do
        return { success: true, synced: 0, total: apiTotal, skipped: syncedCount, amount: 0, date: todayStr, smart: true };
      }
    }

    // ═══ STEP 3: Smart diff — detect NEW, CHANGED, or UNCONFIRMED invoices ═══
    var toProcess = [];
    var allSyncedRefIds = [];

    for (var k = 0; k < allApiInvoices.length; k++) {
      var inv = allApiInvoices[k];
      var refId = String(inv.RefId || inv.RefID || ('idx-' + k));
      var apiAmount = inv.Amount || 0;
      
      allSyncedRefIds.push(refId);
      if (apiAmount <= 0) continue;

      var existing = invoiceStore.getInvoice(refId);
      
      if (!existing) {
        // NEW invoice
        toProcess.push({ inv: inv, refId: refId, reason: 'new' });
      } else if (existing.amount !== apiAmount) {
        // Amount CHANGED
        toProcess.push({ inv: inv, refId: refId, reason: 'amount_changed' });
      } else if (!existing.confirmed) {
        // Not yet confirmed via detail API — need to verify payment
        toProcess.push({ inv: inv, refId: refId, reason: 'unconfirmed' });
      }
      // confirmed invoices with matching amount → skip (already verified)
    }

    console.log('[CUKCUK] Scanned ' + allApiInvoices.length + ' invoices, ' + toProcess.length + ' need detail fetch');

    // ═══ STEP 4: Nothing to update ═══
    if (toProcess.length === 0) {
      _addSyncedRefIdsBulk(todayStr, allSyncedRefIds);
      _setSyncMeta({ lastTotal: apiTotal, lastSyncTime: new Date().toISOString(), lastDate: todayStr });
      return { success: true, synced: 0, total: apiTotal, skipped: allApiInvoices.length, amount: 0, date: todayStr, smart: true };
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
        } else {
          // No payment detail — use tax-inclusive amount, default to cash
          invCash = detailAmount;
          invoicePayments.push({ method: 'cash', amount: detailAmount, label: 'Tiền mặt' });
        }

        // ★ effectiveAmount = sum of payments (tax-inclusive)
        var effectiveAmount = (invCash + invCard + invTransfer) || detailAmount;
        
        // ★ Compare with existing — skip if amount AND payment breakdown are identical
        var existingInv = invoiceStore.getInvoice(refId);
        if (existingInv) {
          var sameAmount = existingInv.amount === effectiveAmount;
          var samePayments = existingInv.payments && existingInv.payments.length === invoicePayments.length;
          if (samePayments) {
            for (var cp = 0; cp < invoicePayments.length; cp++) {
              if (!existingInv.payments[cp] || existingInv.payments[cp].method !== invoicePayments[cp].method || existingInv.payments[cp].amount !== invoicePayments[cp].amount) {
                samePayments = false; break;
              }
            }
          }
          if (sameAmount && samePayments) {
            // Data unchanged — but mark as confirmed so we don't re-check next cycle
            if (!existingInv.confirmed) {
              existingInv.confirmed = true;
              invoiceStore.upsertInvoice(existingInv);
            }
            continue;
          }
          console.log('[CUKCUK] Updating ' + refId + ' (' + r.item.reason + ')');
        }
        
        invoiceRecords.push({
          refId: refId, refNo: refNo, refDate: refDate, date: todayStr,
          tableName: tableName, employeeName: employeeName,
          amount: effectiveAmount, payments: invoicePayments,
          confirmed: true, // ★ Detail API verified — won't re-check next cycle
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

    // 8. Push to Google Sheets (fire-and-forget) + mark as pushed
    if (sheetData.length > 0) {
      console.log('[CUKCUK] Pushing ' + sheetData.length + ' NEW invoices to Google Sheets...');
      var pushedRefIds = sheetData.map(function(sd) { return sd.refId; });
      syncCukcukRevenueToCloud(sheetData, shift.id).then(function(res) {
        if (res && res.success) {
          console.log('[CUKCUK→Sheets] ✅ ' + res.message);
          invoiceStore.markPushedToSheets(pushedRefIds);
          showToast('☁️ Đã đẩy ' + sheetData.length + ' hóa đơn lên Sheets', 'success');
        } else {
          console.warn('[CUKCUK→Sheets] ⚠️ ' + (res && res.message || 'Failed'));
        }
      }).catch(function(err) {
        console.warn('[CUKCUK→Sheets] Error:', err.message);
      });
    }

    // 8b. Retry any previously unpushed invoices (fire-and-forget)
    try {
      var unpushed = invoiceStore.getUnpushedInvoices();
      // Exclude invoices we just pushed above
      var alreadyPushing = {};
      for (var ui = 0; ui < sheetData.length; ui++) alreadyPushing[sheetData[ui].refId] = true;
      var retryList = unpushed.filter(function(inv) { return !alreadyPushing[inv.refId]; });

      if (retryList.length > 0) {
        console.log('[CUKCUK] Retrying ' + retryList.length + ' previously unpushed invoices...');
        var retryData = retryList.map(function(inv) {
          var cash = 0, card = 0, transfer = 0;
          (inv.payments || []).forEach(function(p) {
            if (p.method === 'cash') cash += p.amount || 0;
            else if (p.method === 'card') card += p.amount || 0;
            else if (p.method === 'transfer') transfer += p.amount || 0;
          });
          return { refId: inv.refId, refNo: inv.refNo || '', refDate: inv.refDate || '', tableName: inv.tableName || '', employeeName: inv.employeeName || '', amount: inv.amount || 0, cashAmount: cash, cardAmount: card, transferAmount: transfer };
        });
        var retryRefIds = retryData.map(function(d) { return d.refId; });
        syncCukcukRevenueToCloud(retryData, shift.id).then(function(res) {
          if (res && res.success) {
            invoiceStore.markPushedToSheets(retryRefIds);
            console.log('[CUKCUK→Sheets] ✅ Retry OK: ' + retryRefIds.length + ' invoices');
          }
        }).catch(function() {});
      }
    } catch(retryErr) { /* ignore retry failures */ }

    // 9. Report results
    var statsMsg = '';
    if (paymentStats.cash > 0) statsMsg += 'TM: ' + paymentStats.cash.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.card > 0) statsMsg += '| Thẻ: ' + paymentStats.card.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.transfer > 0) statsMsg += '| CK: ' + paymentStats.transfer.toLocaleString('vi-VN') + 'đ';

    if (count > 0) {
      showToast('✅ +' + count + ' hóa đơn mới (' + totalAmount.toLocaleString('vi-VN') + 'đ) — ' + statsMsg, 'success');
      if (window.refreshView) window.refreshView();
    }

    return { success: true, synced: count, total: apiTotal, skipped: syncedCount, amount: totalAmount, payments: paymentStats, date: todayStr, smart: true };

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

// ── Export Invoice Store for direct access ──
export { invoiceStore };
