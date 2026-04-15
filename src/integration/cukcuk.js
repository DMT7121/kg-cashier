import { addTransaction, getCurrentShift, getSettings, getState } from '../store.js';
import { showToast } from '../utils.js';
import { syncCukcukRevenueToCloud } from '../api.js';

/**
 * CUKCUK API Helper - Official Integration
 * Documentation: https://graphapi.cukcuk.vn/document/api/index.html
 * 
 * Login response: { Data: { AccessToken, CompanyCode, Domain, AppID } }
 * SAInvoices response: { Data: [ { RefId, RefNo, Amount, TableName, ... } ] }
 * SAInvoice Detail: { SAInvoicePayments: [ { PaymentType, Amount, PaymentName } ] }
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

// ── Centralized API Call with Auto-Retry on 401 ──
// Official CUKCUK pattern: https://graphapi.cukcuk.vn/document/articles/using_authen.html
// If 401 → clear token → re-login → retry request once
async function _cukcukApiCall(url, options, _isRetry) {
  // Ensure we have a valid token
  var auth = await loginAndGetToken();
  if (!auth.success) {
    return { _authFailed: true, message: auth.message };
  }
  
  // Set auth headers
  if (!options.headers) options.headers = {};
  options.headers['Authorization'] = 'Bearer ' + auth.token;
  options.headers['CompanyCode'] = auth.companyCode;
  
  var response = await fetch(CUKCUK_API_BASE + url, options);
  
  // 401 = Token expired → re-login and retry once
  if (response.status === 401 && !_isRetry) {
    console.log('[CUKCUK] 401 received, refreshing token...');
    _clearCachedToken();
    return _cukcukApiCall(url, options, true);
  }
  
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' from ' + url);
  }
  
  return await response.json();
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
        return { success: false, message: 'CORS bị chặn. Cần mở webapp qua localhost (Vite dev server).' };
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
      
      if (errMsg.toLowerCase().indexOf('invalid signature') !== -1) {
        errMsg = 'Chữ ký không hợp lệ. Vui lòng:\n' +
          '1) Vào https://' + cleanDomain + '.cukcuk.vn → Ứng dụng → API\n' +
          '2) Bấm "TẠO MÃ KẾT NỐI" → lấy Secret Key mới\n' +
          '3) Copy vào Cài đặt → CUKCUK';
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

// ── Force Re-Sync: Clear old CUKCUK data and re-fetch with payment details ──
export async function resyncAllTransactions() {
  var shift = getCurrentShift();
  if (!shift) {
    showToast('Bạn cần mở ca trước', 'warning');
    return { success: false };
  }
  
  // Remove all existing CUKCUK transactions from current shift
  var txList = shift.transactions || [];
  var removedCount = 0;
  var newTxList = [];
  for (var i = 0; i < txList.length; i++) {
    if (txList[i].note && txList[i].note.indexOf('[CUKCUK]') !== -1) {
      removedCount++;
    } else {
      newTxList.push(txList[i]);
    }
  }
  shift.transactions = newTxList;
  
  // Save cleaned state
  var s = getState();
  s.currentShift = shift;
  // Trigger save
  try {
    localStorage.setItem('kg_cashier_state', JSON.stringify(s));
  } catch(e) { /* ignore */ }
  
  console.log('[CUKCUK] Removed ' + removedCount + ' old CUKCUK transactions. Re-syncing...');
  showToast('🔄 Đã xóa ' + removedCount + ' giao dịch cũ. Đang đồng bộ lại...', 'info');
  
  // Now sync fresh
  return await syncTransactions();
}

// ── Sync Transactions from CUKCUK → Webapp Revenue ──
export async function syncTransactions() {
  var shift = getCurrentShift();
  if (!shift) {
    showToast('Bạn cần mở ca trước khi đồng bộ', 'warning');
    return { success: false, message: 'Chưa mở ca' };
  }

  var settings = getSettings();
  var cukcuk = settings.cukcuk;
  if (!cukcuk || !cukcuk.key) {
    showToast('Vui lòng cấu hình CUKCUK API trong Cài đặt', 'error');
    return { success: false, message: 'Chưa cấu hình' };
  }

  showToast('🔄 Đang đồng bộ hóa đơn từ CUKCUK...', 'info');

  try {
    // 1. Determine date range from shift
    var fromDate = shift.startTime || new Date().toISOString();
    var toDate = shift.endTime || new Date().toISOString();
    
    console.log('[CUKCUK] Sync range:', fromDate, '→', toDate);

    // 2. Fetch ALL pages of invoices (auto-retry on 401 via _cukcukApiCall)
    var allInvoices = [];
    var page = 1;
    var maxPages = 20;
    var apiTotal = 0;

    while (page <= maxPages) {
      var data = await _fetchInvoices(fromDate, toDate, page);
      
      if (data._authFailed) {
        showToast('❌ ' + (data.message || 'Đăng nhập thất bại'), 'error');
        return { success: false, message: data.message };
      }

      if (!data.Success) {
        var errDetail = data.ErrorMessage || data.Message || 'Lỗi API';
        throw new Error(errDetail);
      }

      var pageInvoices = [];
      if (data.Data) {
        if (Array.isArray(data.Data)) pageInvoices = data.Data;
        else if (data.Data.PageData) pageInvoices = data.Data.PageData;
        else if (data.Data.Items) pageInvoices = data.Data.Items;
      }
      
      if (data.Total) apiTotal = data.Total;
      allInvoices = allInvoices.concat(pageInvoices);
      console.log('[CUKCUK] Page ' + page + ': ' + pageInvoices.length + ' invoices (' + allInvoices.length + '/' + apiTotal + ')');
      
      if (page > 1) {
        showToast('📥 Trang ' + page + '... (' + allInvoices.length + '/' + apiTotal + ' hóa đơn)', 'info');
      }

      if (pageInvoices.length < 100) break;
      page++;
    }

    console.log('[CUKCUK] Total fetched: ' + allInvoices.length + ' invoices');

    // 4. Filter new invoices (not yet synced)
    var newInvoices = [];
    var skippedCount = 0;
    var txList = shift.transactions || [];

    for (var i = 0; i < allInvoices.length; i++) {
      var inv = allInvoices[i];
      var refId = inv.RefId || inv.RefID || ('idx-' + i);
      var txId = 'CUKCUK-' + refId;
      
      var exists = false;
      for (var j = 0; j < txList.length; j++) {
        if (txList[j].note && txList[j].note.indexOf(txId) !== -1) {
          exists = true;
          break;
        }
      }

      if (exists) {
        skippedCount++;
      } else {
        newInvoices.push(inv);
      }
    }

    console.log('[CUKCUK] New invoices to process: ' + newInvoices.length + ', skipped: ' + skippedCount);

    if (newInvoices.length === 0) {
      if (skippedCount > 0) {
        showToast('✅ Tất cả ' + skippedCount + ' hóa đơn đã được đồng bộ.', 'info');
      } else {
        showToast('ℹ️ Không có hóa đơn mới từ CUKCUK.', 'info');
      }
      return { success: true, synced: 0, total: allInvoices.length, skipped: skippedCount, amount: 0 };
    }

    // 5. Fetch payment details for new invoices
    showToast('🔍 Đang lấy chi tiết thanh toán ' + newInvoices.length + ' hóa đơn...', 'info');
    
    var count = 0;
    var totalAmount = 0;
    var paymentStats = { cash: 0, card: 0, transfer: 0 };
    var sheetData = []; // Collect data for Google Sheets push

    for (var k = 0; k < newInvoices.length; k++) {
      var inv = newInvoices[k];
      var refId = inv.RefId || inv.RefID || ('idx-' + k);
      var txId = 'CUKCUK-' + refId;
      var refNo = inv.RefNo || '';
      var tableName = inv.TableName || '';
      var employeeName = inv.EmployeeName || '';
      var refDate = inv.RefDate || '';
      var amount = inv.Amount || 0;
      
      if (amount <= 0) continue;

      // Format date
      var dateStr = '';
      if (refDate) {
        try { dateStr = new Date(refDate).toLocaleDateString('vi-VN'); } catch(e) { /* ignore */ }
      }

      // Fetch detail to get payment breakdown (auto-retry on 401)
      var detail = await _fetchInvoiceDetail(refId);
      
      var payments = (detail && detail.SAInvoicePayments) ? detail.SAInvoicePayments : null;
      
      // Compute payment amounts for sheet
      var invCash = 0, invCard = 0, invTransfer = 0;
      var payInfoParts = [];

      if (payments && payments.length > 0) {
        // Create separate transaction for each payment method
        for (var p = 0; p < payments.length; p++) {
          var pmt = payments[p];
          var pmtAmount = pmt.Amount || 0;
          if (pmtAmount <= 0) continue;
          
          var mapped = _mapPayment(pmt);
          var pmtMethod = mapped.method;
          var pmtLabel = mapped.label;
          
          // Track per-method
          if (pmtMethod === 'cash') invCash += pmtAmount;
          else if (pmtMethod === 'card') invCard += pmtAmount;
          else if (pmtMethod === 'transfer') invTransfer += pmtAmount;
          payInfoParts.push(pmtLabel + ': ' + pmtAmount.toLocaleString('vi-VN'));
          
          // Build note with payment info
          var noteText = '[CUKCUK] Bill ' + refNo;
          if (tableName) noteText += ' - ' + tableName;
          if (payments.length > 1) noteText += ' [' + pmtLabel + ']';
          if (dateStr) noteText += ' (' + dateStr + ')';
          noteText += ' [Ref:' + txId + ']';

          addTransaction({
            type: 'income',
            category: 'Doanh thu bán hàng',
            amount: pmtAmount,
            paymentMethod: pmtMethod,
            note: noteText
          });
          
          paymentStats[pmtMethod] = (paymentStats[pmtMethod] || 0) + pmtAmount;
          totalAmount += pmtAmount;
        }
        count++;
      } else {
        // No detail/payment info → fallback: add as single cash transaction
        invCash = amount;
        payInfoParts.push('Tiền mặt: ' + amount.toLocaleString('vi-VN'));
        
        var noteText = '[CUKCUK] Bill ' + refNo;
        if (tableName) noteText += ' - ' + tableName;
        if (dateStr) noteText += ' (' + dateStr + ')';
        noteText += ' [Ref:' + txId + ']';

        addTransaction({
          type: 'income',
          category: 'Doanh thu bán hàng',
          amount: amount,
          paymentMethod: 'cash',
          note: noteText
        });
        
        paymentStats.cash += amount;
        totalAmount += amount;
        count++;
      }

      // Collect for Google Sheets
      sheetData.push({
        refId: refId,
        refNo: refNo,
        refDate: refDate,
        tableName: tableName,
        employeeName: employeeName,
        amount: amount,
        cashAmount: invCash,
        cardAmount: invCard,
        transferAmount: invTransfer,
        paymentInfo: payInfoParts.join(' + ')
      });

      // Progress every 10 invoices
      if (k > 0 && k % 10 === 0) {
        showToast('📥 Xử lý ' + k + '/' + newInvoices.length + ' hóa đơn...', 'info');
      }
      
      // Small delay to avoid API rate limiting (50ms between detail calls)
      if (k < newInvoices.length - 1) {
        await new Promise(function(r) { setTimeout(r, 50); });
      }
    }

    // 6. Push to Google Sheets (fire-and-forget, non-blocking)
    if (sheetData.length > 0) {
      console.log('[CUKCUK] Pushing ' + sheetData.length + ' invoices to Google Sheets...');
      syncCukcukRevenueToCloud(sheetData, shift.id).then(function(res) {
        if (res && res.success) {
          console.log('[CUKCUK→Sheets] ✅ ' + res.message);
        } else {
          console.warn('[CUKCUK→Sheets] ⚠️ ' + (res && res.message || 'Failed'));
        }
      }).catch(function(err) {
        console.warn('[CUKCUK→Sheets] Error:', err.message);
      });
    }

    // 7. Report results
    var statsMsg = '';
    if (paymentStats.cash > 0) statsMsg += 'TM: ' + paymentStats.cash.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.card > 0) statsMsg += '| Thẻ: ' + paymentStats.card.toLocaleString('vi-VN') + 'đ ';
    if (paymentStats.transfer > 0) statsMsg += '| CK: ' + paymentStats.transfer.toLocaleString('vi-VN') + 'đ';

    if (count > 0) {
      showToast('✅ Đồng bộ ' + count + ' hóa đơn (' + totalAmount.toLocaleString('vi-VN') + 'đ) — ' + statsMsg, 'success');
      if (window.refreshView) window.refreshView();
    }

    return { success: true, synced: count, total: allInvoices.length, skipped: skippedCount, amount: totalAmount, payments: paymentStats };

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
