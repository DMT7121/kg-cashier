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

// ── Working Day Boundaries ──
// A "working day" runs from 12:00 PM (noon) to 06:00 AM the next morning.
// All period filters use actual timestamps (refDate) for accurate filtering.

/**
 * Get the working day date string for a given timestamp.
 * Before 06:00 AM = previous calendar day.
 */
function _workingDayDate(dt) {
  var d = new Date(dt);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return _dateStr(d);
}

/**
 * Get period time boundaries as { start: Date, end: Date }
 * start = 12:00 PM on the first day of the period
 * end = 06:00 AM on the day after the last day of the period
 */
function _getPeriodBounds(period) {
  var now = new Date();
  var start, end;

  switch (period) {
    case 'day': {
      // Today: 12:00 PM today → 06:00 AM tomorrow
      // If before 6AM, "today" is actually yesterday
      var today = new Date(now);
      if (today.getHours() < 6) {
        today.setDate(today.getDate() - 1);
      }
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
      var tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      end = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 6, 0, 0);
      break;
    }
    case 'week': {
      // Week: Monday 12:00 PM → next Monday 06:00 AM
      var monday = new Date(now);
      if (monday.getHours() < 6) monday.setDate(monday.getDate() - 1);
      var dayOfWeek = monday.getDay(); // 0=Sun, 1=Mon...
      var diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since Monday
      monday.setDate(monday.getDate() - diff);
      start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 12, 0, 0);
      var nextMonday = new Date(monday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      end = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), 6, 0, 0);
      break;
    }
    case 'month': {
      // Month: 1st 12:00 PM → 1st of next month 06:00 AM
      var workingDay = new Date(now);
      if (workingDay.getHours() < 6) workingDay.setDate(workingDay.getDate() - 1);
      start = new Date(workingDay.getFullYear(), workingDay.getMonth(), 1, 12, 0, 0);
      var nextMonth = new Date(workingDay.getFullYear(), workingDay.getMonth() + 1, 1);
      end = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextMonth.getDate(), 6, 0, 0);
      break;
    }
    case 'quarter': {
      // Quarter: Q-start 1st 12:00 PM → Q-end+1 1st 06:00 AM
      var wd = new Date(now);
      if (wd.getHours() < 6) wd.setDate(wd.getDate() - 1);
      var qStart = Math.floor(wd.getMonth() / 3) * 3; // 0,3,6,9
      start = new Date(wd.getFullYear(), qStart, 1, 12, 0, 0);
      var qEnd = qStart + 3;
      end = new Date(wd.getFullYear(), qEnd, 1, 6, 0, 0);
      break;
    }
    case 'year':
    default: {
      // Year: Jan 1 12:00 PM → Jan 1 next year 06:00 AM
      var wy = new Date(now);
      if (wy.getHours() < 6) wy.setDate(wy.getDate() - 1);
      start = new Date(wy.getFullYear(), 0, 1, 12, 0, 0);
      end = new Date(wy.getFullYear() + 1, 0, 1, 6, 0, 0);
      break;
    }
  }

  return { start: start, end: end };
}

/** Get invoices for a named period using timestamp-based filtering */
export function getInvoicesForPeriod(period) {
  var bounds = _getPeriodBounds(period);
  var all = getAllInvoices();

  return all.filter(function(inv) {
    // Use refDate (original CUKCUK datetime) for accurate time-based filtering
    if (inv.refDate) {
      var dt = new Date(inv.refDate);
      if (!isNaN(dt.getTime())) {
        return dt >= bounds.start && dt < bounds.end;
      }
    }
    // Fallback: use date string (less accurate but works for older data)
    var fromDate = _dateStr(bounds.start);
    var toDate = _dateStr(bounds.end);
    return inv.date >= fromDate && inv.date <= toDate;
  });
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

/** Get revenue for today (working day) using period bounds */
export function getTodayRevenue() {
  var bounds = _getPeriodBounds('day');
  var invoices = getInvoicesForPeriod('day');
  var workingDate = _dateStr(bounds.start);
  
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

/** Get invoices for a specific date (YYYY-MM-DD) — utility */
export function getInvoicesByDate(dateStr) {
  return getAllInvoices().filter(function(inv) {
    return inv.date === dateStr;
  });
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
