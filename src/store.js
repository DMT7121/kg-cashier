/* ============================================
   KG-CASHIER — Data Store (localStorage + Cloud Sync)
   COMPATIBLE: No optional chaining, no bare catch
   ============================================ */

// Safe dynamic import - if api.js fails, store still works
var _cloudSync = null;
var _cloudClose = null;
var _cloudAudit = null;

try {
  // Use dynamic import pattern that won't crash module loading
  import('./api.js').then(function(api) {
    _cloudSync = api.syncShiftToCloud;
    _cloudClose = api.closeShiftOnCloud;
    _cloudAudit = api.addAuditLog;
    console.log('[Store] API module loaded successfully');
  }).catch(function(err) {
    console.warn('[Store] API module failed to load:', err.message);
  });
} catch (e) {
  console.warn('[Store] Dynamic import not supported:', e.message);
}

var STORAGE_KEY = 'kg-cashier-data';
var SESSION_KEY = 'kg-cashier-session';

var defaultCategories = {
  income: ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'],
  expense: ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác']
};

var state = null;
var listeners = [];

function defaults() {
  return {
    currentShift: null,
    shifts: [],
    categories: JSON.parse(JSON.stringify(defaultCategories)),
    cashiers: ['Thu ngân 1', 'Thu ngân 2', 'Thu ngân 3'],
    auditLog: [],
    notifications: [],
    settings: {
      storeName: "KING's GRILL",
      storeAddress: '34, Hoàng Văn Thụ, Chánh Nghĩa, TDM, Bình Dương',
      autoSync: true,
      discrepancyThreshold: 50000,
      shiftWarningHours: 10,
      requireLogin: false
    }
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ── Load / Save ──────────────────────────────
export function getState() {
  if (!state) {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        var def = defaults();
        // Merge manually for compatibility
        for (var key in def) {
          if (parsed[key] === undefined) parsed[key] = def[key];
        }
        state = parsed;
      } else {
        state = defaults();
      }
    } catch (e) {
      console.error('[Store] Load error:', e);
      state = defaults();
    }
  }
  return state;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[Store] Save failed:', e);
  }
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](state); } catch (e) { /* ignore */ }
  }
}

export function subscribe(fn) {
  listeners.push(fn);
  return function() {
    listeners = listeners.filter(function(l) { return l !== fn; });
  };
}

// ── Audit Trail (Feature 10) ─────────────────
export function addAudit(action, details) {
  if (details === undefined) details = '';
  var s = getState();
  var user = getLoggedInUser();
  var userName = (user && user.name) ? user.name : 'SYSTEM';
  var entry = { timestamp: new Date().toISOString(), user: userName, action: action, details: details };
  if (!s.auditLog) s.auditLog = [];
  s.auditLog.unshift(entry);
  if (s.auditLog.length > 500) s.auditLog.length = 500;
  save();
  // Fire and forget cloud sync
  if (_cloudAudit) {
    try { _cloudAudit(entry).catch(function() {}); } catch (e) { /* ignore */ }
  }
}

export function getAuditLog() {
  return getState().auditLog || [];
}

// ── Notifications (Feature 5) ────────────────
export function addNotification(message, type) {
  if (!type) type = 'info';
  var s = getState();
  if (!s.notifications) s.notifications = [];
  s.notifications.unshift({ id: uid(), message: message, type: type, timestamp: new Date().toISOString(), read: false });
  if (s.notifications.length > 50) s.notifications.length = 50;
  save();
}

export function getNotifications() { return getState().notifications || []; }
export function getUnreadCount() {
  var notifs = getState().notifications || [];
  var count = 0;
  for (var i = 0; i < notifs.length; i++) {
    if (!notifs[i].read) count++;
  }
  return count;
}

export function markAllRead() {
  var s = getState();
  var notifs = s.notifications || [];
  for (var i = 0; i < notifs.length; i++) { notifs[i].read = true; }
  save();
}

export function clearNotifications() {
  getState().notifications = [];
  save();
}

// ── Login / Session (Feature 8 - RBAC) ───────
export function setLoggedInUser(user) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { /* ignore */ }
}

export function getLoggedInUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

export function logoutUser() {
  var user = getLoggedInUser();
  var userName = (user && user.name) ? user.name : '';
  addAudit('LOGOUT', userName);
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

export function isLoggedIn() {
  return !!getLoggedInUser();
}

export function hasRole(requiredRole) {
  var user = getLoggedInUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (requiredRole === 'manager') return user.role === 'manager';
  return true;
}

// ── Settings (Feature 9) ─────────────────────
export function getSettings() {
  var s = getState();
  return s.settings || defaults().settings;
}

export function updateSettings(newSettings) {
  var s = getState();
  if (!s.settings) s.settings = defaults().settings;
  for (var key in newSettings) {
    s.settings[key] = newSettings[key];
  }
  save();
  addAudit('UPDATE_SETTINGS', JSON.stringify(newSettings));
}

// ── Current shift ────────────────────────────
export function getCurrentShift() { return getState().currentShift; }

export function openShift(opts) {
  var cashierName = opts.cashierName;
  var shiftNumber = opts.shiftNumber;
  var date = opts.date;
  var startingCash = opts.startingCash;

  console.log('[Store] openShift called:', cashierName, shiftNumber, date, startingCash);

  var s = getState();
  if (s.currentShift) {
    throw new Error('Đã có ca đang mở. Hãy đóng ca trước.');
  }

  s.currentShift = {
    id: uid(),
    cashierName: cashierName,
    shiftNumber: shiftNumber,
    date: date,
    startTime: new Date().toISOString(),
    endTime: null,
    startingCash: Number(startingCash) || 0,
    transactions: [],
    otherTransactions: [],
    cashCount: {},
    invoices: [],
    status: 'open',
    notes: '',
    cashToKeep: 0,
    cashToDeposit: 0
  };
  save();

  console.log('[Store] Shift opened successfully:', s.currentShift.id);

  addAudit('OPEN_SHIFT', 'Ca ' + shiftNumber + ' - ' + cashierName);
  addNotification('Ca ' + shiftNumber + ' đã được mở bởi ' + cashierName, 'success');
  _syncCurrentShift();
  return s.currentShift;
}

export function closeShift(opts) {
  if (!opts) opts = {};
  var s = getState();
  if (!s.currentShift) throw new Error('Không có ca nào đang mở');

  s.currentShift.endTime = new Date().toISOString();
  s.currentShift.status = 'closed';
  s.currentShift.notes = opts.notes || '';
  s.currentShift.cashToKeep = Number(opts.cashToKeep) || 0;
  s.currentShift.cashToDeposit = Number(opts.cashToDeposit) || 0;

  var summary = getShiftSummary(s.currentShift);

  // Check discrepancy (Feature 5)
  var threshold = (s.settings && s.settings.discrepancyThreshold) ? s.settings.discrepancyThreshold : 50000;
  if (summary.cashCountTotal > 0 && Math.abs(summary.discrepancy) > threshold) {
    addNotification('⚠️ Chênh lệch tiền mặt: ' + summary.discrepancy.toLocaleString('vi-VN') + 'đ', 'warning');
  }

  s.shifts.unshift(JSON.parse(JSON.stringify(s.currentShift)));
  var closedShift = s.currentShift;
  s.currentShift = null;
  save();
  addAudit('CLOSE_SHIFT', 'Ca ' + closedShift.shiftNumber + ' - Doanh thu: ' + summary.totalIncome.toLocaleString('vi-VN') + 'đ');
  addNotification('Ca ' + closedShift.shiftNumber + ' đã đóng - DT: ' + summary.totalIncome.toLocaleString('vi-VN') + 'đ', 'info');

  if (_cloudClose) {
    try { _cloudClose(closedShift).catch(function() {}); } catch (e) { /* ignore */ }
  }
}

// ── Transactions ─────────────────────────────
export function addTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  var tx = {
    id: uid(),
    type: opts.type,
    category: opts.category,
    amount: Number(opts.amount),
    paymentMethod: opts.paymentMethod || 'cash',
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.transactions.push(tx);
  save();
  addAudit('ADD_TX', (opts.type === 'income' ? '+' : '-') + Number(opts.amount).toLocaleString('vi-VN') + 'đ - ' + opts.category);
  _syncCurrentShift();
  return tx;
}

export function removeTransaction(id) {
  var s = getState();
  if (!s.currentShift) return;
  var tx = null;
  for (var i = 0; i < s.currentShift.transactions.length; i++) {
    if (s.currentShift.transactions[i].id === id) {
      tx = s.currentShift.transactions[i];
      break;
    }
  }
  s.currentShift.transactions = s.currentShift.transactions.filter(function(t) { return t.id !== id; });
  save();
  if (tx) addAudit('REMOVE_TX', tx.category + ' - ' + tx.amount.toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
}

export function addOtherTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  var tx = {
    id: uid(),
    type: opts.type,
    category: opts.category,
    amount: Number(opts.amount),
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.otherTransactions.push(tx);
  save();
  addAudit('ADD_OTHER_TX', opts.type + ': ' + opts.category + ' - ' + Number(opts.amount).toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
  return tx;
}

export function removeOtherTransaction(id) {
  var s = getState();
  if (!s.currentShift) return;
  s.currentShift.otherTransactions = s.currentShift.otherTransactions.filter(function(t) { return t.id !== id; });
  save();
  _syncCurrentShift();
}

// ── Cash count ───────────────────────────────
export function updateCashCount(counts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  var newCounts = {};
  for (var key in counts) { newCounts[key] = counts[key]; }
  s.currentShift.cashCount = newCounts;
  save();
  var total = 0;
  for (var d in counts) { total += Number(d) * Number(counts[d]); }
  addAudit('UPDATE_CASH_COUNT', 'Tổng: ' + total.toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
}

// ── Invoices ─────────────────────────────────
export function addInvoice(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  var inv = {
    id: uid(),
    name: opts.name,
    fileType: opts.fileType || 'image',
    data: opts.data,
    driveFileId: opts.driveFileId,
    driveUrl: opts.driveUrl,
    thumbnailUrl: opts.thumbnailUrl,
    linkedTransactionId: opts.linkedTransactionId || null,
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.invoices.push(inv);
  save();
  addAudit('ADD_INVOICE', opts.name);
  return inv;
}

export function removeInvoice(id) {
  var s = getState();
  if (!s.currentShift) return;
  s.currentShift.invoices = s.currentShift.invoices.filter(function(i) { return i.id !== id; });
  save();
}

// ── Summary ──────────────────────────────────
export function getShiftSummary(shift) {
  if (!shift) shift = getState().currentShift;
  if (!shift) return null;
  var txs = shift.transactions || [];
  var otherTxs = shift.otherTransactions || [];

  var totalIncome = 0, totalExpense = 0, cashIncome = 0, cardIncome = 0, transferIncome = 0, cashExpense = 0, otherIncome = 0, otherExpense = 0, billCount = 0;

  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    if (t.type === 'income') {
      totalIncome += t.amount;
      billCount++;
      if (t.paymentMethod === 'cash') cashIncome += t.amount;
      else if (t.paymentMethod === 'card') cardIncome += t.amount;
      else if (t.paymentMethod === 'transfer') transferIncome += t.amount;
    } else {
      totalExpense += t.amount;
      if (t.paymentMethod === 'cash') cashExpense += t.amount;
    }
  }

  for (var j = 0; j < otherTxs.length; j++) {
    if (otherTxs[j].type === 'income') otherIncome += otherTxs[j].amount;
    else otherExpense += otherTxs[j].amount;
  }

  var cashCountTotal = 0;
  var cc = shift.cashCount || {};
  for (var denom in cc) {
    cashCountTotal += Number(denom) * Number(cc[denom]);
  }

  var expectedCash = shift.startingCash + cashIncome - cashExpense + otherIncome - otherExpense;
  var discrepancy = cashCountTotal - expectedCash;

  return {
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    cashIncome: cashIncome,
    cardIncome: cardIncome,
    transferIncome: transferIncome,
    cashExpense: cashExpense,
    otherIncome: otherIncome,
    otherExpense: otherExpense,
    cashCountTotal: cashCountTotal,
    expectedCash: expectedCash,
    discrepancy: discrepancy,
    revenue: totalIncome,
    billCount: billCount,
    netTotal: expectedCash
  };
}

// ── History ──────────────────────────────────
export function getShiftHistory() { return getState().shifts || []; }

export function deleteShiftFromHistory(id) {
  var s = getState();
  s.shifts = s.shifts.filter(function(sh) { return sh.id !== id; });
  save();
  addAudit('DELETE_SHIFT_HISTORY', 'ID: ' + id);
}

export function getCategories() { return getState().categories; }

// ── Cloud Sync ───────────────────────────────
var _syncTimer = null;

function _syncCurrentShift() {
  var settings = getState().settings;
  if (!settings || !settings.autoSync) return;
  if (!_cloudSync) return;

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function() {
    var shift = getCurrentShift();
    if (shift) {
      // Clone and remove heavy data
      var cleanShift = JSON.parse(JSON.stringify(shift));
      if (cleanShift.invoices) {
        for (var i = 0; i < cleanShift.invoices.length; i++) {
          delete cleanShift.invoices[i].data;
        }
      }
      try { _cloudSync(cleanShift).catch(function() {}); } catch (e) { /* ignore */ }
    }
  }, 3000);
}

// ── Analytics Helpers (Feature 4) ────────────
export function getDailyReport(dateStr) {
  var shifts = getShiftHistory().filter(function(s) { return s.date === dateStr; });
  var totalIncome = 0, totalExpense = 0, cashTotal = 0, cardTotal = 0, transferTotal = 0, billCount = 0;
  for (var i = 0; i < shifts.length; i++) {
    var sm = getShiftSummary(shifts[i]);
    totalIncome += sm.totalIncome;
    totalExpense += sm.totalExpense + sm.otherExpense;
    cashTotal += sm.cashIncome;
    cardTotal += sm.cardIncome;
    transferTotal += sm.transferIncome;
    billCount += sm.billCount;
  }
  return {
    date: dateStr, shifts: shifts.length, totalIncome: totalIncome, totalExpense: totalExpense,
    cashTotal: cashTotal, cardTotal: cardTotal, transferTotal: transferTotal,
    billCount: billCount, net: totalIncome - totalExpense
  };
}

export function getWeeklyReport() {
  var today = new Date();
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
  }
  return days;
}

export function getMonthlyReport() {
  var today = new Date();
  var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  var days = [];
  var d = new Date(firstDay);
  while (d <= today) {
    var dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
