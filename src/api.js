/* ============================================
   KG-CASHIER — Google Apps Script API Client
   SAFE: All exports are safe - never throw
   ============================================ */

import { safeJsonParse } from './utils.js';

const GAS_URL = import.meta.env.VITE_GAS_URL || '';

let _online = true;
const _queue = [];

try { _online = navigator.onLine; } catch (e) { /* ignore */ }
try { window.addEventListener('online', () => { _online = true; _flushQueue(); }); } catch (e) { /* ignore */ }
try { window.addEventListener('offline', () => { _online = false; }); } catch (e) { /* ignore */ }

export function getMetadata() {
  let deviceId = localStorage.getItem('kg_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('kg_device_id', deviceId);
  }

  let sessionId = sessionStorage.getItem('kg_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('kg_session_id', sessionId);
  }

  const origin = window.location.origin || '';
  const host = window.location.hostname || '';
  const environment = import.meta.env.MODE || 'production';
  
  let source = 'webapp-production';
  if (origin.indexOf('localhost') > -1 || origin.indexOf('127.0.0.1') > -1 || origin.indexOf('file://') > -1) {
    source = 'localhost';
  } else if (import.meta.env.DEV) {
    source = 'webapp-dev';
  }

  return {
    deviceId: deviceId,
    sessionId: sessionId,
    origin: origin,
    host: host,
    environment: environment,
    source: source
  };
}

// ── Core fetch wrapper (NEVER throws) ────────
async function apiCall(action, data = null, retries = 2) {
  try {
    const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;
    const opts = { redirect: 'follow', mode: 'cors' };

    if (data) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      // Inject metadata automatically if it is an object
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        data = Object.assign({}, data, getMetadata());
      }
      opts.body = JSON.stringify(data);
    }

    const response = await fetch(url, opts);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    return safeJsonParse(text, { success: false, message: 'Phản hồi từ máy chủ không hợp lệ' });
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
  if (_queue.length === 0) return;
  try {
    while (_queue.length > 0) {
      var item = _queue[0];
      var result = await apiCall(item.action, item.data, 1);
      if (result && result.success) {
        _queue.shift();
        if (_queue.length > 0) {
          localStorage.setItem('kg_api_queue', JSON.stringify(_queue));
        } else {
          localStorage.removeItem('kg_api_queue');
        }
      } else {
        break; // Stop on failure, retry later
      }
    }
  } catch (e) {
    // Save remaining items for next attempt
    if (_queue.length > 0) {
      try { localStorage.setItem('kg_api_queue', JSON.stringify(_queue)); } catch(e2) { /* ignore */ }
    }
  }
}

// Restore queue on load
try {
  var saved = localStorage.getItem('kg_api_queue');
  if (saved) {
    var parsed = safeJsonParse(saved, null);
    if (parsed && Array.isArray(parsed)) {
      for (var i = 0; i < parsed.length; i++) { _queue.push(parsed[i]); }
    }
    if (_online) { _flushQueue(); }
  }
} catch (e) { /* ignore */ }

// ── Shift API ────────────────────────────────
// ── Shift API ────────────────────────────────
export async function openShiftOnCloud(shiftData) {
  return apiCall('openShift', shiftData);
}

export async function syncShiftToCloud(shiftData) {
  if (!_online) { enqueue('syncShift', shiftData); return { success: false, offline: true }; }
  return apiCall('syncShift', shiftData);
}

export async function closeShiftOnCloud(shiftData) {
  return apiCall('closeShift', shiftData);
}

export async function reopenShiftOnCloud(shiftData, managerPassword) {
  return apiCall('reopenShift', { ...shiftData, managerPassword: managerPassword });
}

export async function cancelShiftOnCloud(shiftData) {
  return apiCall('cancelShift', shiftData);
}

export async function deleteShiftFromCloud(shiftId) {
  return apiCall('deleteShift', { id: shiftId });
}

export async function voidGhostShiftOnCloud(shiftId, managerPassword) {
  return apiCall('voidGhostShift', { shiftId: shiftId, managerPassword: managerPassword });
}

export async function getShiftRegistryFromCloud() {
  return apiCall('getShiftRegistry');
}

export async function repairShiftsOnCloud(managerPassword) {
  return apiCall('repairShifts', { managerPassword: managerPassword });
}

export async function rebuildCukcukIndexOnCloud() {
  return apiCall('rebuildCukcukIndex');
}

export async function getCukcukSyncStateFromCloud() {
  return apiCall('getCukcukSyncState');
}

export async function saveCukcukSyncStateToCloud(syncState) {
  return apiCall('saveCukcukSyncState', syncState);
}

export async function getShiftsFromCloud(limit) {
  return apiCall('getShifts', null);
}

export async function getCurrentShiftFromCloud() {
  return apiCall('getCurrentShift');
}

export async function getStaffFromCloud() {
  try {
    // ⚡ Try ultra-fast direct Spreadsheet read first (CORS-friendly via gviz/tq)
    const ssId = '1drWBOfgTZ1nqgl-W_gb24P-7r4WRoxHxAfk657tvLQQ';
    const url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=KG_STAFF`;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1800); // 1.8s timeout
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    
    if (response.ok) {
      const text = await response.text();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const json = safeJsonParse(text.substring(start, end + 1), null);
        if (json && json.status === 'ok' && json.table && json.table.rows) {
          const colMapping = ['id', 'name', 'pin', 'role', 'status', 'createdAt'];
          const headers = json.table.cols.map((c, idx) => c.label || colMapping[idx] || '');
          const staff = json.table.rows.map(r => {
            const obj = {};
            r.c.forEach((cell, idx) => {
              const header = headers[idx];
              if (header) {
                var val = cell ? (cell.v !== null ? cell.v : '') : '';
                obj[header] = String(val).trim();
              }
            });
            return obj;
          }).filter(s => s.id && s.name);
          
          if (staff.length > 0) {
            console.log('[API] Ultra-fast staff direct load success:', staff.length);
            return { success: true, staff: staff, direct: true };
          }
        }
      }
    }
  } catch (e) {
    console.warn('[API] Direct spreadsheet fetch failed/timeout, falling back to GAS:', e.message);
  }
  
  // Fallback to Apps Script if direct fetch fails
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

// ── Config API (fast staff loading) ─────────
export async function getConfigFromCloud() {
  return apiCall('getConfig');
}

export async function saveConfigToCloud(key, value) {
  return apiCall('saveConfig', { key: key, value: value });
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
