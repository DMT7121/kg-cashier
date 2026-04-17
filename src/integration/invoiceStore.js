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
  var isNew = !store.invoices[key];
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
    if (!store.invoices[key]) newCount++;
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

// ── Query by Date ──

/** Get invoices for a specific date (YYYY-MM-DD) */
export function getInvoicesByDate(dateStr) {
  return getAllInvoices().filter(function(inv) {
    return inv.date === dateStr;
  });
}

/** Get invoices in date range [fromDate, toDate] inclusive */
export function getInvoicesByDateRange(fromDate, toDate) {
  return getAllInvoices().filter(function(inv) {
    return inv.date >= fromDate && inv.date <= toDate;
  });
}

/** Get start date for a period */
function _getPeriodStartDate(period) {
  var today = new Date();
  switch (period) {
    case 'year':
      return today.getFullYear() + '-01-01';
    case 'quarter':
      var qMonth = Math.floor(today.getMonth() / 3) * 3;
      return today.getFullYear() + '-' + String(qMonth + 1).padStart(2, '0') + '-01';
    case 'month':
      return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-01';
    case 'week':
      var d = new Date(today);
      d.setDate(d.getDate() - 6);
      return _dateStr(d);
    default: // 'day'
      return _todayStr();
  }
}

/** Get invoices for a named period */
export function getInvoicesForPeriod(period) {
  var fromDate = _getPeriodStartDate(period);
  var toDate = _todayStr();
  return getInvoicesByDateRange(fromDate, toDate);
}

// ── Revenue Summaries ──

/** Get aggregate revenue summary for a period */
export function getRevenueSummary(period) {
  var invoices = getInvoicesForPeriod(period);
  var result = {
    period: period,
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
    result.totalRevenue += inv.amount || 0;
    dateSet[inv.date] = true;
    if (!result.firstDate || inv.date < result.firstDate) result.firstDate = inv.date;
    if (!result.lastDate || inv.date > result.lastDate) result.lastDate = inv.date;

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

/** Get daily breakdown array for a period, sorted desc */
export function getDailyBreakdown(period) {
  var invoices = getInvoicesForPeriod(period);
  var days = {};

  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    var date = inv.date;
    if (!days[date]) {
      days[date] = { date: date, total: 0, cash: 0, card: 0, transfer: 0, bills: 0 };
    }
    days[date].total += inv.amount || 0;
    days[date].bills++;

    var payments = inv.payments || [];
    for (var j = 0; j < payments.length; j++) {
      switch (payments[j].method) {
        case 'cash': days[date].cash += payments[j].amount || 0; break;
        case 'card': days[date].card += payments[j].amount || 0; break;
        case 'transfer': days[date].transfer += payments[j].amount || 0; break;
      }
    }
  }

  // Sort descending by date
  return Object.values(days).sort(function(a, b) {
    return a.date > b.date ? -1 : 1;
  });
}

/** Get revenue for today (working day) */
export function getTodayRevenue() {
  // Working day: if before 6AM, counts as yesterday
  var now = new Date();
  var workingDate;
  if (now.getHours() < 6) {
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    workingDate = _dateStr(yesterday);
  } else {
    workingDate = _dateStr(now);
  }

  var invoices = getInvoicesByDate(workingDate);
  var result = { date: workingDate, total: 0, cash: 0, card: 0, transfer: 0, bills: invoices.length, lastSync: '' };

  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    result.total += inv.amount || 0;
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
