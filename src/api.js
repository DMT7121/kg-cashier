/* ============================================
   KG-CASHIER — Google Apps Script API Client
   ============================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyStvCPpvjlBVIUa4eLE5uZghbqT8Vfwrz9wk1GqLN94tHeI3K3TgITl1JBhTLV5o8Y/exec';

let _online = navigator.onLine;
const _queue = []; // Offline queue

window.addEventListener('online', () => { _online = true; _flushQueue(); });
window.addEventListener('offline', () => { _online = false; });

// ── Core fetch wrapper ───────────────────────
async function apiCall(action, data = null, retries = 2) {
  const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

  try {
    const opts = { redirect: 'follow' };
    if (data) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(data);
    }

    const response = await fetch(url, opts);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return apiCall(action, data, retries - 1);
    }
    console.warn(`API [${action}] failed:`, error.message);
    return { success: false, message: error.message, offline: true };
  }
}

// ── Offline queue ────────────────────────────
function enqueue(action, data) {
  _queue.push({ action, data, timestamp: Date.now() });
  try {
    localStorage.setItem('kg_api_queue', JSON.stringify(_queue));
  } catch(e) {}
}

async function _flushQueue() {
  const items = [..._queue];
  _queue.length = 0;
  for (const item of items) {
    await apiCall(item.action, item.data, 1);
  }
  try { localStorage.removeItem('kg_api_queue'); } catch(e) {}
}

// Restore queue on load
try {
  const saved = localStorage.getItem('kg_api_queue');
  if (saved) { _queue.push(...JSON.parse(saved)); if (_online) _flushQueue(); }
} catch(e) {}

// ── Shift API ────────────────────────────────
export async function syncShiftToCloud(shiftData) {
  if (!_online) { enqueue('syncShift', shiftData); return { success: false, offline: true }; }
  return apiCall('syncShift', shiftData);
}

export async function closeShiftOnCloud(shiftData) {
  return apiCall('closeShift', shiftData);
}

export async function getShiftsFromCloud(limit = 100) {
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
  return apiCall('deleteStaff', { id });
}

export async function loginWithPin(pin) {
  return apiCall('login', { pin });
}

// ── Audit API ────────────────────────────────
export async function addAuditLog(entry) {
  if (!_online) { enqueue('addAudit', entry); return; }
  return apiCall('addAudit', entry);
}

export async function getAuditLogFromCloud(limit = 200) {
  return apiCall('getAudit', { limit });
}

// ── File Upload API ──────────────────────────
export async function uploadFileToCloud(fileData) {
  return apiCall('uploadFile', fileData);
}

export async function deleteFileFromCloud(fileId) {
  return apiCall('deleteFile', { fileId });
}

// ── Settings API ─────────────────────────────
export async function getSettingsFromCloud() {
  return apiCall('getSettings');
}

export async function saveSettingsToCloud(settings) {
  return apiCall('saveSettings', { settings });
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
