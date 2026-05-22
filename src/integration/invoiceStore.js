/* ══════════════════════════════════════════════════════════════
   CUKCUK Invoice Store — Single Source of Truth
   
   Mỗi hóa đơn CUKCUK lưu DUY NHẤT 1 lần theo RefId.
   Tách biệt hoàn toàn khỏi shift.transactions.
   Dashboard, Analytics, Report đều đọc từ đây.
   ══════════════════════════════════════════════════════════════ */

var STORE_KEY = 'cukcuk_invoice_store';
var STORE_VERSION = 1;

// ── Internal helpers ──

function _load() {
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      var data = JSON.parse(saved);
      if (data && data.version === STORE_VERSION) return data;
    }
  } catch(e) { /* ignore */ }
  return { invoices: {}, version: STORE_VERSION };
}

function _save(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch(e) { /* ignore */ }
}

function _todayStr() {
  var now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── CRUD Operations ──

/** Check if an invoice exists by RefId */
export function hasInvoice(refId) {
  var store = _load();
  return !!store.invoices[String(refId)];
}

/** 
 * Add or update an invoice. Returns true if NEWLY added, false if updated/existed.
 * Invoice shape:
 * {
 *   refId: string,      // CUKCUK RefId (primary key)
 *   refNo: string,      // Bill number (HD001234)
 *   refDate: string,     // Original datetime from CUKCUK
 *   date: string,        // Working day YYYY-MM-DD
 *   tableName: string,   // Table name
 *   employeeName: string,
 *   amount: number,      // Total bill amount
 *   payments: [{ method: 'cash'|'card'|'transfer', amount: number, label: string }],
 *   syncedAt: string,    // ISO timestamp when synced
 *   pushedToSheets: boolean
 * }
 */
export function upsertInvoice(invoice) {
  var store = _load();
  var key = String(invoice.refId);
  var existing = store.invoices[key];
  var isNew = !existing;
  
  if (existing && existing.manualOverride) {
    invoice.payments = existing.payments;
    invoice.manualOverride = true;
    if (existing.amount) invoice.amount = existing.amount; // Preserve amount if modified
  }
  
  store.invoices[key] = invoice;
  _save(store);
  return isNew;
}

/** Bulk upsert — returns count of newly added */
export function bulkUpsert(invoices) {
  var store = _load();
  var newCount = 0;
  for (var i = 0; i < invoices.length; i++) {
    var key = String(invoices[i].refId);
    var existing = store.invoices[key];
    if (!existing) newCount++;
    
    if (existing && existing.manualOverride) {
      invoices[i].payments = existing.payments;
      invoices[i].manualOverride = true;
      if (existing.amount) invoices[i].amount = existing.amount;
    }
    
    store.invoices[key] = invoices[i];
  }
  _save(store);
  return newCount;
}

/** Get a single invoice by RefId */
export function getInvoice(refId) {
  var store = _load();
  return store.invoices[String(refId)] || null;
}

/** Get all invoices as array */
export function getAllInvoices() {
  var store = _load();
  var result = [];
  var invoices = store.invoices;
  for (var key in invoices) {
    if (invoices.hasOwnProperty(key)) {
      result.push(invoices[key]);
    }
  }
  return result;
}

/** Get total invoice count */
export function getInvoiceCount() {
  var store = _load();
  return Object.keys(store.invoices).length;
}

/** Get invoice count for a specific date (working day YYYY-MM-DD) */
export function getCountByDate(dateStr) {
  var store = _load();
  var count = 0;
  for (var key in store.invoices) {
    if (store.invoices.hasOwnProperty(key) && store.invoices[key].date === dateStr) {
      count++;
    }
  }
  return count;
}

/** Check if there are any unpaid invoices for a given date */
export function hasUnpaidInvoices(dateStr) {
  var store = _load();
  for (var key in store.invoices) {
    if (store.invoices.hasOwnProperty(key)) {
      var inv = store.invoices[key];
      if (inv.date === dateStr && inv.unpaid) return true;
    }
  }
  return false;
}

// ── Working Day Boundaries ──
// Ngày làm việc: 12:00 trưa → 06:00 sáng hôm sau
// Tất cả bộ lọc dùng refDate timestamp (thời gian gốc từ CUKCUK)

/**
 * Robust date parser — handles ISO, .NET /Date()/, and various formats
 */
function _parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  
  // .NET JSON format: "/Date(1234567890000)/"
  if (typeof val === 'string') {
    var netMatch = val.match(/\/Date\((\d+)\)\//);
    if (netMatch) return new Date(parseInt(netMatch[1]));
  }
  
  var d = new Date(val);
  if (!isNaN(d.getTime())) return d;
  
  // Try dd/mm/yyyy HH:mm
  if (typeof val === 'string') {
    var parts = val.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?/);
    if (parts) {
      return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]),
                       parseInt(parts[4] || 0), parseInt(parts[5] || 0));
    }
  }
  
  return null;
}

/**
 * Xác định ngày làm việc từ một timestamp.
 * Trước 06:00 AM = thuộc ngày hôm trước.
 */
function _workingDayDate(dt) {
  var d = _parseDate(dt);
  if (!d) return _todayStr();
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return _dateStr(d);
}

/**
 * Tính boundaries (mốc thời gian) cho từng kỳ
 * 
 * Hôm nay:  12:00 PM hôm nay → 06:00 AM hôm sau
 * Tuần này: 12:00 PM thứ 2   → 06:00 AM thứ 2 tuần sau
 * Tháng:    12:00 PM ngày 01  → 06:00 AM ngày 01 tháng sau
 * Quý:      12:00 PM ngày 01 đầu quý → 06:00 AM ngày 01 quý sau
 * Năm:      12:00 PM 01/01    → 06:00 AM 01/01 năm sau
 * 
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getPeriodBounds(period, refDate) {
  var now = refDate ? new Date(refDate) : new Date();
  var start, end, label;

  // Xác định ngày làm việc hiện tại
  var workNow = new Date(now);
  if (workNow.getHours() < 6) workNow.setDate(workNow.getDate() - 1);

  switch (period) {
    case 'day': {
      start = new Date(workNow.getFullYear(), workNow.getMonth(), workNow.getDate(), 12, 0, 0);
      var nextDay = new Date(workNow);
      nextDay.setDate(nextDay.getDate() + 1);
      end = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 6, 0, 0);
      label = 'Hôm nay (' + _pad2(workNow.getDate()) + '/' + _pad2(workNow.getMonth()+1) + ')';
      break;
    }
    case 'week': {
      var dayOfWeek = workNow.getDay(); // 0=CN, 1=T2...
      var daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      var mon = new Date(workNow);
      mon.setDate(mon.getDate() - daysToMon);
      start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), 12, 0, 0);
      var nextMon = new Date(mon);
      nextMon.setDate(nextMon.getDate() + 7);
      end = new Date(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate(), 6, 0, 0);
      label = 'Tuần (' + _pad2(mon.getDate()) + '/' + _pad2(mon.getMonth()+1) + ' → ' + _pad2(nextMon.getDate()) + '/' + _pad2(nextMon.getMonth()+1) + ')';
      break;
    }
    case 'month': {
      start = new Date(workNow.getFullYear(), workNow.getMonth(), 1, 12, 0, 0);
      var nm = new Date(workNow.getFullYear(), workNow.getMonth() + 1, 1);
      end = new Date(nm.getFullYear(), nm.getMonth(), nm.getDate(), 6, 0, 0);
      label = 'Tháng ' + (workNow.getMonth() + 1) + '/' + workNow.getFullYear();
      break;
    }
    case 'quarter': {
      var qStart = Math.floor(workNow.getMonth() / 3) * 3;
      start = new Date(workNow.getFullYear(), qStart, 1, 12, 0, 0);
      end = new Date(workNow.getFullYear(), qStart + 3, 1, 6, 0, 0);
      label = 'Quý ' + (Math.floor(qStart / 3) + 1) + '/' + workNow.getFullYear();
      break;
    }
    case 'year':
    default: {
      start = new Date(workNow.getFullYear(), 0, 1, 12, 0, 0);
      end = new Date(workNow.getFullYear() + 1, 0, 1, 6, 0, 0);
      label = 'Năm ' + workNow.getFullYear();
      break;
    }
  }

  return { start: start, end: end, label: label };
}

function _pad2(n) { return n < 10 ? '0' + n : String(n); }

/**
 * Get effective total for an invoice.
 * Prefers sum of payments over stored amount to ensure consistency.
 * This handles existing data where inv.amount may differ from sum(payments).
 */
function _effectiveTotal(inv) {
  var payments = inv.payments;
  if (payments && payments.length > 0) {
    var sum = 0;
    for (var i = 0; i < payments.length; i++) {
      sum += payments[i].amount || 0;
    }
    return sum;
  }
  return inv.amount || 0;
}

/**
 * Kiểm tra hóa đơn có nằm trong khoảng thời gian không
 */
function _isInBounds(inv, bounds) {
  // Ưu tiên dùng refDate (thời gian thực từ CUKCUK)
  if (inv.refDate) {
    var dt = _parseDate(inv.refDate);
    if (dt) {
      return dt >= bounds.start && dt < bounds.end;
    }
  }
  // Fallback: dùng trường date (ít chính xác hơn)
  if (inv.date) {
    var fromStr = _dateStr(bounds.start);
    var toStr = _dateStr(bounds.end);
    return inv.date >= fromStr && inv.date <= toStr;
  }
  return false;
}

/** Lọc hóa đơn theo kỳ — chính xác theo timestamp, loại trừ bill chưa thanh toán */
export function getInvoicesForPeriod(period, refDate) {
  var bounds = getPeriodBounds(period, refDate);
  return getAllInvoices().filter(function(inv) {
    if (inv.unpaid) return false; // ★ Loại bill chưa thanh toán
    return _isInBounds(inv, bounds);
  });
}

// ── Revenue Summaries ──

/** Tổng hợp doanh thu theo kỳ */
export function getRevenueSummary(period, refDate) {
  var invoices = getInvoicesForPeriod(period, refDate);
  var bounds = getPeriodBounds(period, refDate);
  var result = {
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

  var dateSet = {};

  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    result.totalRevenue += _effectiveTotal(inv);
    
    // Nhóm theo ngày làm việc
    var wDay = inv.refDate ? _workingDayDate(inv.refDate) : (inv.date || '');
    dateSet[wDay] = true;
    if (!result.firstDate || wDay < result.firstDate) result.firstDate = wDay;
    if (!result.lastDate || wDay > result.lastDate) result.lastDate = wDay;

    var payments = inv.payments || [];
    for (var j = 0; j < payments.length; j++) {
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

/** Phân tích doanh thu theo ngày làm việc, sắp xếp giảm dần */
export function getDailyBreakdown(period, refDate) {
  var invoices = getInvoicesForPeriod(period, refDate);
  var days = {};

  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    // Nhóm theo ngày làm việc (trước 6h sáng = ngày trước)
    var wDay = inv.refDate ? _workingDayDate(inv.refDate) : (inv.date || 'unknown');
    
    if (!days[wDay]) {
      days[wDay] = { date: wDay, total: 0, cash: 0, card: 0, transfer: 0, bills: 0 };
    }
    days[wDay].total += _effectiveTotal(inv);
    days[wDay].bills++;

    var payments = inv.payments || [];
    for (var j = 0; j < payments.length; j++) {
      switch (payments[j].method) {
        case 'cash': days[wDay].cash += payments[j].amount || 0; break;
        case 'card': days[wDay].card += payments[j].amount || 0; break;
        case 'transfer': days[wDay].transfer += payments[j].amount || 0; break;
      }
    }
  }

  return Object.values(days).sort(function(a, b) {
    return a.date > b.date ? -1 : 1;
  });
}

/** Get revenue for today (working day) using period bounds */
export function getTodayRevenue() {
  var bounds = getPeriodBounds('day');
  var invoices = getInvoicesForPeriod('day');
  var workingDate = _dateStr(bounds.start);
  
  var result = { date: workingDate, total: 0, cash: 0, card: 0, transfer: 0, bills: invoices.length, lastSync: '' };

  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    result.total += _effectiveTotal(inv);
    if (inv.syncedAt > result.lastSync) result.lastSync = inv.syncedAt;

    var payments = inv.payments || [];
    for (var j = 0; j < payments.length; j++) {
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
export function getInvoicesByDate(dateStr) {
  return getAllInvoices().filter(function(inv) {
    return inv.date === dateStr && !inv.unpaid;
  });
}

/** Get invoices strictly within a shift's time window (Aligned to Working Day: 12 PM - 6 AM) */
export function getInvoicesByShiftTime(dateStr, startTime, endTime) {
  var allForDate = getInvoicesByDate(dateStr);
  var dp = dateStr.split('-');
  
  // Đồng bộ hoàn toàn với Báo Cáo Ngày (12:00 PM hôm nay -> 06:00 AM hôm sau)
  var startT = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), 12, 0, 0).getTime();
  var endT = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]) + 1, 6, 0, 0).getTime();
  
  return allForDate.filter(function(inv) {
    if (!inv.refDate) return false;
    // Extract actual time from CUKCUK .NET date format or ISO string
    var dt;
    var match = String(inv.refDate).match(/\/Date\((\d+)\)\//);
    if (match) dt = parseInt(match[1]);
    else dt = new Date(inv.refDate).getTime();
    
    return dt >= startT && dt <= endT;
  });
}

/** Edit payment methods on an invoice directly in the store */
export function editInvoicePayment(refId, newPayments) {
  var store = _load();
  var key = String(refId);
  var inv = store.invoices[key];
  if (!inv) throw new Error('Không tìm thấy hóa đơn: ' + refId);
  inv.payments = newPayments;
  inv.manualOverride = true;
  inv.unpaid = false;
  var total = 0;
  for (var i = 0; i < newPayments.length; i++) {
    total += newPayments[i].amount || 0;
  }
  if (total > 0) inv.amount = total;
  store.invoices[key] = inv;
  _save(store);
}

// ── Google Sheets Tracking ──

/** Mark invoices as pushed to Google Sheets */
export function markPushedToSheets(refIds) {
  var store = _load();
  for (var i = 0; i < refIds.length; i++) {
    var key = String(refIds[i]);
    if (store.invoices[key]) {
      store.invoices[key].pushedToSheets = true;
    }
  }
  _save(store);
}

/** Get invoices not yet pushed to Sheets */
export function getUnpushedInvoices() {
  return getAllInvoices().filter(function(inv) {
    return !inv.pushedToSheets;
  });
}

// ── Maintenance ──

/** Clear all data (for reset) */
export function clearAll() {
  _save({ invoices: {}, version: STORE_VERSION });
}

/** Remove invoices older than N days */
export function cleanupOlderThan(days) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffStr = _dateStr(cutoff);

  var store = _load();
  var removed = 0;
  for (var key in store.invoices) {
    if (store.invoices.hasOwnProperty(key) && store.invoices[key].date < cutoffStr) {
      delete store.invoices[key];
      removed++;
    }
  }
  if (removed > 0) _save(store);
  return removed;
}

// ── Migration: Extract from shift.transactions ──

/**
 * One-time migration: extract CUKCUK transactions from shifts into Invoice Store.
 * Groups payment splits back into single invoices.
 */
export function migrateFromShifts(currentShift, shiftHistory) {
  var store = _load();
  var migrated = 0;
  var allShifts = [];
  if (currentShift) allShifts.push(currentShift);
  if (shiftHistory) allShifts = allShifts.concat(shiftHistory);

  for (var s = 0; s < allShifts.length; s++) {
    var shift = allShifts[s];
    var txList = shift.transactions || [];
    // Group by RefId (a bill with multiple payment methods creates multiple transactions)
    var billGroups = {};

    for (var i = 0; i < txList.length; i++) {
      var tx = txList[i];
      if (!tx.note || tx.note.indexOf('[CUKCUK]') === -1) continue;
      if (tx.type !== 'income') continue;

      var refMatch = tx.note.match(/\[Ref:CUKCUK-([^\]]+)\]/);
      if (!refMatch) continue;
      var refId = refMatch[1];

      if (!billGroups[refId]) {
        // Extract info from note
        var billMatch = tx.note.match(/Bill\s+(\S+)/);
        var tableMatch = tx.note.match(/Bill\s+\S+\s+-\s+([^[(\]]+)/);
        var dateMatch = tx.note.match(/\((\d{2})\/(\d{2})\/(\d{4})\)/);
        var dateStr = shift.date || '';
        if (dateMatch) {
          dateStr = dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1];
        }

        billGroups[refId] = {
          refId: refId,
          refNo: billMatch ? billMatch[1] : '',
          refDate: tx.timestamp || '',
          date: dateStr,
          tableName: tableMatch ? tableMatch[1].trim() : '',
          employeeName: '',
          amount: 0,
          payments: [],
          syncedAt: tx.timestamp || new Date().toISOString(),
          pushedToSheets: false,
          migrated: true
        };
      }

      billGroups[refId].amount += tx.amount || 0;
      billGroups[refId].payments.push({
        method: tx.paymentMethod || 'cash',
        amount: tx.amount || 0,
        label: tx.paymentMethod === 'card' ? 'Thẻ' : tx.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'
      });
    }

    // Save unique bills
    for (var rid in billGroups) {
      if (billGroups.hasOwnProperty(rid) && !store.invoices[rid]) {
        store.invoices[rid] = billGroups[rid];
        migrated++;
      }
    }
  }

  if (migrated > 0) _save(store);
  return migrated;
}

/**
 * Remove CUKCUK transactions from a shift's transaction list.
 * Returns the cleaned transaction list.
 */
export function removeCukcukFromTransactions(transactions) {
  if (!transactions) return [];
  return transactions.filter(function(tx) {
    return !(tx.note && tx.note.indexOf('[CUKCUK]') !== -1);
  });
}

/**
 * Auto-cleanup invoices older than 90 days to prevent localStorage bloat.
 */
export function cleanupOldInvoices(maxDays) {
  if (!maxDays) maxDays = 90;
  var store = _load();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  var cutoffStr = _dateStr(cutoff);
  var removed = 0;
  for (var refId in store.invoices) {
    if (store.invoices.hasOwnProperty(refId)) {
      var inv = store.invoices[refId];
      if (inv.date && inv.date < cutoffStr) {
        delete store.invoices[refId];
        removed++;
      }
    }
  }
  if (removed > 0) {
    _save(store);
    console.log('[InvoiceStore] Auto-cleanup: removed ' + removed + ' invoices older than ' + maxDays + ' days');
  }
  return removed;
}

// ══════════════════════════════════════════════════════════════
// CROSS-DEVICE SYNC — share invoices between localhost + production
// Uses GAS config store as cloud relay
// ══════════════════════════════════════════════════════════════

/**
 * Push today's invoices to cloud for cross-device sync.
 * Only pushes a compact summary (not full invoice data) to stay within GAS limits.
 */
export async function pushInvoicesToCloud(dateStr) {
  try {
    var { saveConfigToCloud } = await import('../api.js');
    var invoices = getInvoicesByDate(dateStr);
    if (invoices.length === 0) return;

    // Compact format: only fields needed to reconstruct on other device
    var compact = invoices.map(function(inv) {
      return {
        refId: inv.refId, refNo: inv.refNo, refDate: inv.refDate, date: inv.date,
        tableName: inv.tableName, employeeName: inv.employeeName,
        amount: inv.amount, payments: inv.payments,
        unpaid: inv.unpaid, syncedAt: inv.syncedAt,
        isManuallyEdited: inv.isManuallyEdited
      };
    });

    await saveConfigToCloud('cukcuk_invoices_' + dateStr, compact);
    console.log('[InvoiceStore] ☁️ Pushed ' + compact.length + ' invoices to cloud for ' + dateStr);
  } catch (e) {
    console.warn('[InvoiceStore] Cloud push failed:', e.message);
  }
}

/**
 * Pull invoices from cloud and merge missing ones into local store.
 * Returns count of newly added invoices.
 */
export async function pullInvoicesFromCloud(dateStr) {
  try {
    var { getConfigFromCloud } = await import('../api.js');
    var result = await getConfigFromCloud();
    if (!result || !result.success) return 0;
    // GAS config API returns result.config — support result.data as fallback
    var configData = result.config || result.data || {};
    if (!configData || typeof configData !== 'object') return 0;

    var cloudInvoices = configData['cukcuk_invoices_' + dateStr];
    if (!Array.isArray(cloudInvoices) || cloudInvoices.length === 0) return 0;

    // Merge: add only invoices not already in local store
    var store = _load();
    var added = 0;
    for (var i = 0; i < cloudInvoices.length; i++) {
      var inv = cloudInvoices[i];
      var key = String(inv.refId);
      if (!store.invoices[key]) {
        store.invoices[key] = {
          refId: inv.refId, refNo: inv.refNo || '', refDate: inv.refDate || '', date: inv.date || dateStr,
          tableName: inv.tableName || '', employeeName: inv.employeeName || '',
          amount: inv.amount || 0, payments: inv.payments || [],
          unpaid: !!inv.unpaid, confirmed: true,
          syncedAt: inv.syncedAt || new Date().toISOString(), pushedToSheets: false,
          isManuallyEdited: !!inv.isManuallyEdited
        };
        added++;
      } else if (inv.isManuallyEdited && !store.invoices[key].isManuallyEdited) {
        // If cloud version is manually edited but local is not, update local
        store.invoices[key].payments = inv.payments || [];
        store.invoices[key].amount = inv.amount || 0;
        store.invoices[key].isManuallyEdited = true;
        store.invoices[key].unpaid = false;
        added++;
      }
    }

    if (added > 0) {
      _save(store);
      console.log('[InvoiceStore] ☁️ Pulled ' + added + ' new invoices from cloud (total cloud: ' + cloudInvoices.length + ')');
    }
    return added;
  } catch (e) {
    console.warn('[InvoiceStore] Cloud pull failed:', e.message);
    return 0;
  }
}

// Auto-cleanup on module load (once per session)
(function() {
  try {
    var lastCleanup = sessionStorage.getItem('invoice_cleanup_done');
    if (!lastCleanup) {
      cleanupOldInvoices(90);
      sessionStorage.setItem('invoice_cleanup_done', '1');
    }
  } catch(e) { /* ignore */ }
})();
