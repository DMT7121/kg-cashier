/* ============================================
   KG-CASHIER — Data Store (localStorage + Cloud Sync)
   ============================================ */
import { syncShiftToCloud, closeShiftOnCloud, addAuditLog as cloudAudit } from './api.js';

const STORAGE_KEY = 'kg-cashier-data';
const SESSION_KEY = 'kg-cashier-session';

const defaultCategories = {
  income: ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'],
  expense: ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác']
};

let state = null;
let listeners = [];

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
      const saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? { ...defaults(), ...JSON.parse(saved) } : defaults();
    } catch { state = defaults(); }
  }
  return state;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error('Save failed:', e); }
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// ── Audit Trail (Feature 10) ─────────────────
export function addAudit(action, details = '') {
  const s = getState();
  const user = getLoggedInUser();
  const entry = { timestamp: new Date().toISOString(), user: user?.name || 'SYSTEM', action, details };
  if (!s.auditLog) s.auditLog = [];
  s.auditLog.unshift(entry);
  if (s.auditLog.length > 500) s.auditLog.length = 500;
  save();
  // Fire and forget cloud sync
  cloudAudit(entry).catch(() => {});
}

export function getAuditLog() {
  return getState().auditLog || [];
}

// ── Notifications (Feature 5) ────────────────
export function addNotification(message, type = 'info') {
  const s = getState();
  if (!s.notifications) s.notifications = [];
  s.notifications.unshift({ id: uid(), message, type, timestamp: new Date().toISOString(), read: false });
  if (s.notifications.length > 50) s.notifications.length = 50;
  save();
}

export function getNotifications() { return getState().notifications || []; }
export function getUnreadCount() { return (getState().notifications || []).filter(n => !n.read).length; }

export function markAllRead() {
  const s = getState();
  (s.notifications || []).forEach(n => n.read = true);
  save();
}

export function clearNotifications() {
  getState().notifications = [];
  save();
}

// ── Login / Session (Feature 8 - RBAC) ───────
export function setLoggedInUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function getLoggedInUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function logoutUser() {
  addAudit('LOGOUT', getLoggedInUser()?.name || '');
  sessionStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
  return !!getLoggedInUser();
}

export function hasRole(requiredRole) {
  const user = getLoggedInUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (requiredRole === 'manager') return user.role === 'manager';
  return true; // cashier can do basic ops
}

// ── Settings (Feature 9) ─────────────────────
export function getSettings() {
  return getState().settings || defaults().settings;
}

export function updateSettings(newSettings) {
  const s = getState();
  s.settings = { ...s.settings, ...newSettings };
  save();
  addAudit('UPDATE_SETTINGS', JSON.stringify(newSettings));
}

// ── Current shift ────────────────────────────
export function getCurrentShift() { return getState().currentShift; }

export function openShift({ cashierName, shiftNumber, date, startingCash }) {
  const s = getState();
  if (s.currentShift) throw new Error('Đã có ca đang mở');

  s.currentShift = {
    id: uid(), cashierName, shiftNumber, date,
    startTime: new Date().toISOString(), endTime: null,
    startingCash: Number(startingCash) || 0,
    transactions: [], otherTransactions: [],
    cashCount: {}, invoices: [],
    status: 'open', notes: '',
    cashToKeep: 0, cashToDeposit: 0
  };
  save();
  addAudit('OPEN_SHIFT', `Ca ${shiftNumber} - ${cashierName}`);
  addNotification(`Ca ${shiftNumber} đã được mở bởi ${cashierName}`, 'success');
  _syncCurrentShift();
  return s.currentShift;
}

export function closeShift({ notes, cashToKeep, cashToDeposit } = {}) {
  const s = getState();
  if (!s.currentShift) throw new Error('Không có ca nào đang mở');

  s.currentShift.endTime = new Date().toISOString();
  s.currentShift.status = 'closed';
  s.currentShift.notes = notes || '';
  s.currentShift.cashToKeep = Number(cashToKeep) || 0;
  s.currentShift.cashToDeposit = Number(cashToDeposit) || 0;

  const summary = getShiftSummary(s.currentShift);

  // Check discrepancy (Feature 5)
  if (summary.cashCountTotal > 0 && Math.abs(summary.discrepancy) > (s.settings?.discrepancyThreshold || 50000)) {
    addNotification(`⚠️ Chênh lệch tiền mặt: ${summary.discrepancy.toLocaleString('vi-VN')}đ`, 'warning');
  }

  s.shifts.unshift(JSON.parse(JSON.stringify(s.currentShift)));
  const closedShift = s.currentShift;
  s.currentShift = null;
  save();
  addAudit('CLOSE_SHIFT', `Ca ${closedShift.shiftNumber} - Doanh thu: ${summary.totalIncome.toLocaleString('vi-VN')}đ`);
  addNotification(`Ca ${closedShift.shiftNumber} đã đóng - DT: ${summary.totalIncome.toLocaleString('vi-VN')}đ`, 'info');
  closeShiftOnCloud(closedShift).catch(() => {});
}

// ── Transactions ─────────────────────────────
export function addTransaction({ type, category, amount, paymentMethod, note }) {
  const s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  const tx = { id: uid(), type, category, amount: Number(amount), paymentMethod: paymentMethod || 'cash', note: note || '', timestamp: new Date().toISOString() };
  s.currentShift.transactions.push(tx);
  save();
  addAudit('ADD_TX', `${type === 'income' ? '+' : '-'}${Number(amount).toLocaleString('vi-VN')}đ - ${category}`);
  _syncCurrentShift();
  return tx;
}

export function removeTransaction(id) {
  const s = getState();
  if (!s.currentShift) return;
  const tx = s.currentShift.transactions.find(t => t.id === id);
  s.currentShift.transactions = s.currentShift.transactions.filter(t => t.id !== id);
  save();
  if (tx) addAudit('REMOVE_TX', `${tx.category} - ${tx.amount.toLocaleString('vi-VN')}đ`);
  _syncCurrentShift();
}

export function addOtherTransaction({ type, category, amount, note }) {
  const s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  const tx = { id: uid(), type, category, amount: Number(amount), note: note || '', timestamp: new Date().toISOString() };
  s.currentShift.otherTransactions.push(tx);
  save();
  addAudit('ADD_OTHER_TX', `${type}: ${category} - ${Number(amount).toLocaleString('vi-VN')}đ`);
  _syncCurrentShift();
  return tx;
}

export function removeOtherTransaction(id) {
  const s = getState();
  if (!s.currentShift) return;
  s.currentShift.otherTransactions = s.currentShift.otherTransactions.filter(t => t.id !== id);
  save();
  _syncCurrentShift();
}

// ── Cash count ───────────────────────────────
export function updateCashCount(counts) {
  const s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  s.currentShift.cashCount = { ...counts };
  save();
  addAudit('UPDATE_CASH_COUNT', `Tổng: ${Object.entries(counts).reduce((sum, [d, q]) => sum + Number(d) * Number(q), 0).toLocaleString('vi-VN')}đ`);
  _syncCurrentShift();
}

// ── Invoices ─────────────────────────────────
export function addInvoice({ name, fileType, data, driveFileId, driveUrl, thumbnailUrl, linkedTransactionId, note }) {
  const s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  const inv = { id: uid(), name, fileType: fileType || 'image', data, driveFileId, driveUrl, thumbnailUrl, linkedTransactionId: linkedTransactionId || null, note: note || '', timestamp: new Date().toISOString() };
  s.currentShift.invoices.push(inv);
  save();
  addAudit('ADD_INVOICE', name);
  return inv;
}

export function removeInvoice(id) {
  const s = getState();
  if (!s.currentShift) return;
  s.currentShift.invoices = s.currentShift.invoices.filter(i => i.id !== id);
  save();
}

// ── Summary ──────────────────────────────────
export function getShiftSummary(shift) {
  if (!shift) shift = getState().currentShift;
  if (!shift) return null;
  const txs = shift.transactions || [];
  const otherTxs = shift.otherTransactions || [];
  const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cashIncome = txs.filter(t => t.paymentMethod === 'cash' && t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const cardIncome = txs.filter(t => t.paymentMethod === 'card' && t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const transferIncome = txs.filter(t => t.paymentMethod === 'transfer' && t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const cashExpense = txs.filter(t => t.paymentMethod === 'cash' && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const otherIncome = otherTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const otherExpense = otherTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cashCountTotal = Object.entries(shift.cashCount || {}).reduce((s, [d, q]) => s + Number(d) * Number(q), 0);
  const expectedCash = shift.startingCash + cashIncome - cashExpense + otherIncome - otherExpense;
  const discrepancy = cashCountTotal - expectedCash;
  return { totalIncome, totalExpense, cashIncome, cardIncome, transferIncome, cashExpense, otherIncome, otherExpense, cashCountTotal, expectedCash, discrepancy, revenue: totalIncome, billCount: txs.filter(t => t.type === 'income').length, netTotal: shift.startingCash + cashIncome - cashExpense + otherIncome - otherExpense };
}

// ── History ──────────────────────────────────
export function getShiftHistory() { return getState().shifts || []; }

export function deleteShiftFromHistory(id) {
  const s = getState();
  s.shifts = s.shifts.filter(sh => sh.id !== id);
  save();
  addAudit('DELETE_SHIFT_HISTORY', `ID: ${id}`);
}

export function getCategories() { return getState().categories; }

// ── Cloud Sync ───────────────────────────────
let _syncTimer = null;

function _syncCurrentShift() {
  if (!getState().settings?.autoSync) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    const shift = getCurrentShift();
    if (shift) {
      const cleanShift = { ...shift, invoices: (shift.invoices || []).map(i => ({ ...i, data: undefined })) };
      await syncShiftToCloud(cleanShift).catch(() => {});
    }
  }, 3000);
}

// ── Analytics Helpers (Feature 4) ────────────
export function getDailyReport(dateStr) {
  const shifts = getShiftHistory().filter(s => s.date === dateStr);
  let totalIncome = 0, totalExpense = 0, cashTotal = 0, cardTotal = 0, transferTotal = 0, billCount = 0;
  shifts.forEach(sh => {
    const sm = getShiftSummary(sh);
    totalIncome += sm.totalIncome;
    totalExpense += sm.totalExpense + sm.otherExpense;
    cashTotal += sm.cashIncome;
    cardTotal += sm.cardIncome;
    transferTotal += sm.transferIncome;
    billCount += sm.billCount;
  });
  return { date: dateStr, shifts: shifts.length, totalIncome, totalExpense, cashTotal, cardTotal, transferTotal, billCount, net: totalIncome - totalExpense };
}

export function getWeeklyReport() {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
  }
  return days;
}

export function getMonthlyReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = [];
  const d = new Date(firstDay);
  while (d <= today) {
    const dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
