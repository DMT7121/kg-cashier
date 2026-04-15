/* ============================================
   KG-CASHIER — Google Apps Script API Client
   SAFE: All exports are safe - never throw
   ============================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y/exec';

let _online = true;
const _queue = [];

try { _online = navigator.onLine; } catch (e) { /* ignore */ }
try { window.addEventListener('online', () => { _online = true; _flushQueue(); }); } catch (e) { /* ignore */ }
try { window.addEventListener('offline', () => { _online = false; }); } catch (e) { /* ignore */ }

// ── Core fetch wrapper (NEVER throws) ────────
async function apiCall(action, data = null, retries = 2) {
  try {
    const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;
    const opts = { redirect: 'follow', mode: 'cors' };

    if (data) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(data);
    }

    const response = await fetch(url, opts);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    if (retries > 0) {
      await new Promise(function(r) { setTimeout(r, 1000); });
      return apiCall(action, data, retries - 1);
    }
    console.warn('[API] ' + action + ' failed:', error.message);
    return { success: false, message: error.message, offline: true };
  }
}

// ── Offline queue ────────────────────────────
function enqueue(action, data) {
  try {
    _queue.push({ action: action, data: data, timestamp: Date.now() });
    localStorage.setItem('kg_api_queue', JSON.stringify(_queue));
  } catch (e) { /* ignore */ }
}

async function _flushQueue() {
  try {
    var items = _queue.slice();
    _queue.length = 0;
    for (var i = 0; i < items.length; i++) {
      await apiCall(items[i].action, items[i].data, 1);
    }
    localStorage.removeItem('kg_api_queue');
  } catch (e) { /* ignore */ }
}

// Restore queue on load
try {
  var saved = localStorage.getItem('kg_api_queue');
  if (saved) {
    var parsed = JSON.parse(saved);
    for (var i = 0; i < parsed.length; i++) { _queue.push(parsed[i]); }
    if (_online) { _flushQueue(); }
  }
} catch (e) { /* ignore */ }

// ── Shift API ────────────────────────────────
export async function syncShiftToCloud(shiftData) {
  if (!_online) { enqueue('syncShift', shiftData); return { success: false, offline: true }; }
  return apiCall('syncShift', shiftData);
}

export async function closeShiftOnCloud(shiftData) {
  return apiCall('closeShift', shiftData);
}

export async function getShiftsFromCloud(limit) {
  return apiCall('getShifts', null);
}

export async function getCurrentShiftFromCloud() {
  return apiCall('getCurrentShift');
}

// ── Staff API ────────────────────────────────
export async function getStaffFromCloud() {
  return apiCall('getStaff');
}

export async function saveStaffToCloud(staffData) {
  return apiCall('saveStaff', staffData);
}

export async function deleteStaffFromCloud(id) {
  return apiCall('deleteStaff', { id: id });
}

export async function loginWithPin(pin) {
  return apiCall('login', { pin: pin });
}

// ── Audit API ────────────────────────────────
export async function addAuditLog(entry) {
  if (!_online) { enqueue('addAudit', entry); return { success: false, offline: true }; }
  return apiCall('addAudit', entry);
}

export async function getAuditLogFromCloud(limit) {
  return apiCall('getAudit', { limit: limit || 200 });
}

// ── File Upload API ──────────────────────────
export async function uploadFileToCloud(fileData) {
  return apiCall('uploadFile', fileData);
}

export async function deleteFileFromCloud(fileId) {
  return apiCall('deleteFile', { fileId: fileId });
}

// ── Settings API ─────────────────────────────
export async function getSettingsFromCloud() {
  return apiCall('getSettings');
}

export async function saveSettingsToCloud(settings) {
  return apiCall('saveSettings', { settings: settings });
}

// ── CUKCUK Revenue → Google Sheets ──────────
export async function syncCukcukRevenueToCloud(invoices, shiftId) {
  if (!_online) { enqueue('syncCukcukRevenue', { invoices: invoices, shiftId: shiftId }); return { success: false, offline: true }; }
  return apiCall('syncCukcukRevenue', { invoices: invoices, shiftId: shiftId });
}

// ── Health Check ─────────────────────────────
export async function pingAPI() {
  return apiCall('ping');
}

export function isOnline() {
  return _online;
}

export function getQueueSize() {
  return _queue.length;
}
