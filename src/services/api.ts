/* ============================================
   KG-CASHIER — Google Apps Script API Client (TypeScript)
   ============================================ */

import { safeJsonParse } from '../utils';
import { isCurrentHostCanonical } from '../config/env';
import { ENDPOINTS } from '../config/endpoints';

const GAS_URL = ENDPOINTS.gas || '';

let _online = true;
interface QueueItem {
  action: string;
  data: any;
  timestamp: number;
}
const _queue: QueueItem[] = [];

if (typeof window !== 'undefined') {
  try { _online = navigator.onLine; } catch (e) { /* ignore */ }
  try { window.addEventListener('online', () => { _online = true; _flushQueue(); }); } catch (e) { /* ignore */ }
  try { window.addEventListener('offline', () => { _online = false; }); } catch (e) { /* ignore */ }
}

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  let deviceId = localStorage.getItem('kg_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('kg_device_id', deviceId);
  }
  return deviceId;
}

export function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return 'server';
  let sessionId = sessionStorage.getItem('kg_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('kg_session_id', sessionId);
  }
  return sessionId;
}

export function createMutationId(): string {
  return 'mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

export function isLocalhostOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin || '';
  const host = window.location.hostname || '';
  return origin.indexOf('localhost') > -1 || 
         origin.indexOf('127.0.0.1') > -1 || 
         origin.indexOf('file://') > -1 ||
         host.indexOf('localhost') > -1 ||
         host.indexOf('127.0.0.1') > -1 ||
         !origin || !host;
}

export function isProductionOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin || '';
  return origin === 'https://kg-cashier.pages.dev';
}

export interface EnvironmentInfo {
  deviceId: string;
  sessionId: string;
  origin: string;
  host: string;
  environment: string;
  source: string;
}

export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    deviceId: getDeviceId(),
    sessionId: getSessionId(),
    origin: typeof window !== 'undefined' ? window.location.origin || '' : '',
    host: typeof window !== 'undefined' ? window.location.hostname || '' : '',
    environment: (import.meta.env.MODE as string) || 'production',
    source: isLocalhostOrigin() ? 'localhost' : (import.meta.env.DEV ? 'webapp-dev' : 'webapp-production')
  };
}

let _sandboxMode = typeof localStorage !== 'undefined' && localStorage.getItem('kg_sandbox_mode') !== 'false';

export function isSandboxMode(): boolean {
  return isLocalhostOrigin() && _sandboxMode;
}

export function setSandboxMode(enabled: boolean): void {
  _sandboxMode = !!enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('kg_sandbox_mode', String(_sandboxMode));
  }
}

export function validateProductionWrite(action: string): void {
  if (isSandboxMode()) return; // Sandbox writes are local mocks, safe to bypass validation
  if (!isCurrentHostCanonical()) {
    throw new Error('Cấu hình production không hợp lệ. Hệ thống phải chạy tại https://kg-cashier.pages.dev/ và không được dùng alias/preview URL để ghi dữ liệu thật.');
  }
}

export function getMetadata(): EnvironmentInfo {
  return getEnvironmentInfo();
}

// Sandbox Registry item structure
interface SandboxRegistryItem {
  shiftKey: string;
  shiftId: string;
  workDay: string;
  shiftNumber: string | number;
  status: 'open' | 'closed' | 'cancelled' | 'voided' | 'stale';
  cashierName: string;
  openedAt: string;
  closedAt: string;
  deviceId: string;
}

// ── Core fetch wrapper (NEVER throws) ────────
async function apiCall(action: string, data: any = null, retries = 2): Promise<any> {
  const writeActions = [
    'openShift', 'syncShift', 'closeShift', 'reopenShift', 'cancelShift',
    'voidGhostShift', 'saveStaff', 'deleteStaff', 'saveSettings',
    'syncCukcukRevenue', 'addAudit', 'saveCukcukSyncState', 'repairShifts',
    'syncPosOrders'
  ];

  if (writeActions.indexOf(action) !== -1) {
    try {
      validateProductionWrite(action);
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // Sandbox mode interception for writes & simulated reads
  if (isSandboxMode()) {
    const readActions = ['getShiftRegistry', 'getCurrentShift', 'getPosOrders'];

    if (writeActions.indexOf(action) !== -1 || readActions.indexOf(action) !== -1) {
      console.log(`[API Sandbox Mock] Intercepted action: ${action}`, data);
      
      // Simulate slight network delay
      await new Promise(resolve => setTimeout(resolve, 200));

      if (action === 'openShift') {
        const shiftNumber = data.shiftNumber || '1';
        const workDay = data.date || new Date().toISOString().split('T')[0];
        const shiftKey = workDay + '_' + shiftNumber;
        const shiftId = 'shift_' + shiftKey;
        
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        
        const duplicate = mockRegistry.find(r => r.shiftKey === shiftKey && r.status !== 'cancelled' && r.status !== 'voided');
        if (duplicate) {
          return { success: false, message: `Xung đột: Ca ${shiftNumber} ngày ${workDay} đang được mở/đã đóng (Sandbox).` };
        }
        
        const newReg: SandboxRegistryItem = {
          shiftKey: shiftKey,
          shiftId: shiftId,
          workDay: workDay,
          shiftNumber: shiftNumber,
          status: 'open',
          cashierName: data.cashierName || 'Sandbox User',
          openedAt: new Date().toISOString(),
          closedAt: '',
          deviceId: getDeviceId()
        };
        mockRegistry.push(newReg);
        localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        return { success: true, message: 'Sandbox: Đã đăng ký ca làm việc thành công.', shiftId: shiftId };
      }

      if (action === 'getShiftRegistry') {
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        return { success: true, registry: mockRegistry };
      }

      if (action === 'getCurrentShift') {
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        const openReg = mockRegistry.find(r => r.status === 'open');
        if (!openReg) return { success: true, shift: null };
        return {
          success: true,
          shift: {
            id: openReg.shiftId,
            cashierName: openReg.cashierName,
            shiftNumber: openReg.shiftNumber,
            date: openReg.workDay,
            startTime: openReg.openedAt,
            endTime: '',
            startingCash: 0,
            status: 'open',
            notes: '',
            transactions: [],
            otherTransactions: [],
            cashCount: {},
            invoices: [],
            shiftPassword: ''
          }
        };
      }

      if (action === 'closeShift') {
        const shiftNumber = data.shiftNumber || '1';
        const workDay = data.date || new Date().toISOString().split('T')[0];
        const shiftKey = workDay + '_' + shiftNumber;
        
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        
        const entry = mockRegistry.find(r => r.shiftKey === shiftKey);
        if (entry) {
          entry.status = 'closed';
          entry.closedAt = new Date().toISOString();
          localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        }
        return { success: true, message: 'Sandbox: Đóng ca thành công.' };
      }

      if (action === 'reopenShift') {
        const shiftNumber = data.shiftNumber || '1';
        const workDay = data.date || new Date().toISOString().split('T')[0];
        const shiftKey = workDay + '_' + shiftNumber;
        
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        
        const entry = mockRegistry.find(r => r.shiftKey === shiftKey);
        if (entry) {
          entry.status = 'open';
          entry.closedAt = '';
          localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        }
        return { success: true, message: 'Sandbox: Mở lại ca thành công.' };
      }

      if (action === 'cancelShift') {
        const shiftNumber = data.shiftNumber || '1';
        const workDay = data.date || new Date().toISOString().split('T')[0];
        const shiftKey = workDay + '_' + shiftNumber;
        
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        
        const entry = mockRegistry.find(r => r.shiftKey === shiftKey);
        if (entry) {
          entry.status = 'cancelled';
          localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        }
        return { success: true, message: 'Sandbox: Hủy ca thành công.' };
      }

      if (action === 'voidGhostShift') {
        const shiftId = data.shiftId;
        
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        
        const entry = mockRegistry.find(r => r.shiftId === shiftId);
        if (entry) {
          entry.status = 'voided';
          localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        }
        return { success: true, message: 'Sandbox: Thu hồi ca ma thành công.' };
      }

      if (action === 'saveStaff') {
        return { success: true, message: 'Sandbox: Đã lưu nhân viên.', id: data.id || 'sb_' + Math.random().toString(36).substring(2, 6) };
      }

      if (action === 'deleteStaff') {
        return { success: true, message: 'Sandbox: Đã xóa nhân viên.' };
      }

      if (action === 'saveSettings') {
        return { success: true, message: 'Sandbox: Đã lưu cài đặt giả lập.' };
      }

      if (action === 'repairShifts') {
        let mockRegistry: SandboxRegistryItem[] = [];
        try {
          mockRegistry = JSON.parse(localStorage.getItem('kg_sandbox_registry') || '[]');
        } catch(e) {}
        mockRegistry.forEach(r => {
          if (r.status === 'open') r.status = 'stale';
        });
        localStorage.setItem('kg_sandbox_registry', JSON.stringify(mockRegistry));
        return { success: true, message: 'Sandbox: Sửa lỗi hoàn tất (giả lập).' };
      }

      if (action === 'getPosOrders') {
        let mockOrders = [];
        try { mockOrders = JSON.parse(localStorage.getItem('kg_sandbox_pos_orders') || '[]'); } catch(e) {}
        return { success: true, orders: mockOrders };
      }

      if (action === 'syncPosOrders') {
        const clientOrders = data.orders || [];
        localStorage.setItem('kg_sandbox_pos_orders', JSON.stringify(clientOrders));
        return { success: true, orders: clientOrders };
      }

      return { success: true, message: `Sandbox Action ${action} mock success` };
    }
  }

  try {
    const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;
    const opts: RequestInit = { redirect: 'follow', mode: 'cors' };

    if (data) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      // Inject metadata automatically if it is an object
      let payload = data;
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        payload = Object.assign({}, data, getMetadata());
      }
      opts.body = JSON.stringify(payload);
    }

    const response = await fetch(url, opts);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    return safeJsonParse(text, { success: false, message: 'Phản hồi từ máy chủ không hợp lệ' });
  } catch (error: any) {
    if (retries > 0) {
      await new Promise(function(r) { setTimeout(r, 1000); });
      return apiCall(action, data, retries - 1);
    }
    console.warn('[API] ' + action + ' failed:', error.message);
    return { success: false, message: error.message, offline: true };
  }
}

// ── Offline queue ────────────────────────────
function enqueue(action: string, data: any): void {
  try {
    _queue.push({ action: action, data: data, timestamp: Date.now() });
    localStorage.setItem('kg_api_queue', JSON.stringify(_queue));
  } catch (e) { /* ignore */ }
}

async function _flushQueue(): Promise<void> {
  if (_queue.length === 0) return;
  try {
    while (_queue.length > 0) {
      const item = _queue[0];
      const result = await apiCall(item.action, item.data, 1);
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
if (typeof localStorage !== 'undefined') {
  try {
    const saved = localStorage.getItem('kg_api_queue');
    if (saved) {
      const parsed = safeJsonParse<QueueItem[] | null>(saved, null);
      if (parsed && Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i++) { _queue.push(parsed[i]); }
      }
      if (_online) { _flushQueue(); }
    }
  } catch (e) { /* ignore */ }
}

// ── Shift API ────────────────────────────────
export async function openShiftOnCloud(shiftData: any): Promise<any> {
  return apiCall('openShift', shiftData);
}

export async function syncShiftToCloud(shiftData: any): Promise<any> {
  if (!_online) { enqueue('syncShift', shiftData); return { success: false, offline: true }; }
  return apiCall('syncShift', shiftData);
}

export async function closeShiftOnCloud(shiftData: any): Promise<any> {
  return apiCall('closeShift', shiftData);
}

export async function reopenShiftOnCloud(shiftData: any, managerPassword?: string): Promise<any> {
  return apiCall('reopenShift', { ...shiftData, managerPassword: managerPassword });
}

export async function cancelShiftOnCloud(shiftData: any): Promise<any> {
  return apiCall('cancelShift', shiftData);
}

export async function deleteShiftFromCloud(shiftId: string): Promise<any> {
  return apiCall('deleteShift', { id: shiftId });
}

export async function voidGhostShiftOnCloud(shiftId: string, managerPassword?: string): Promise<any> {
  return apiCall('voidGhostShift', { shiftId: shiftId, managerPassword: managerPassword });
}

export async function getShiftRegistryFromCloud(): Promise<any> {
  return apiCall('getShiftRegistry');
}

export async function repairShiftsOnCloud(managerPassword?: string): Promise<any> {
  return apiCall('repairShifts', { managerPassword: managerPassword });
}

export async function rebuildCukcukIndexOnCloud(managerPassword?: string): Promise<any> {
  return apiCall('rebuildCukcukIndex', { managerPassword: managerPassword });
}

export async function getCukcukSyncStateFromCloud(): Promise<any> {
  return apiCall('getCukcukSyncState');
}

export async function saveCukcukSyncStateToCloud(syncState: any): Promise<any> {
  return apiCall('saveCukcukSyncState', syncState);
}

export async function getShiftsFromCloud(limit?: number): Promise<any> {
  return apiCall('getShifts', null);
}

export async function getCurrentShiftFromCloud(): Promise<any> {
  return apiCall('getCurrentShift');
}

interface GVizCell {
  v: any;
  f?: string;
}
interface GVizRow {
  c: (GVizCell | null)[];
}
interface GVizTable {
  cols: { id: string; label: string; type: string }[];
  rows: { c: (GVizCell | null)[] }[];
}
interface GVizResponse {
  status: string;
  table?: GVizTable;
}

export async function getStaffFromCloud(): Promise<any> {
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
        const json = safeJsonParse<GVizResponse | null>(text.substring(start, end + 1), null);
        if (json && json.status === 'ok' && json.table && json.table.rows) {
          const colMapping = ['id', 'name', 'pin', 'role', 'status', 'createdAt'];
          const headers = json.table.cols.map((c, idx) => c.label || colMapping[idx] || '');
          const staff = json.table.rows.map(r => {
            const obj: Record<string, string> = {};
            if (r.c) {
              r.c.forEach((cell, idx) => {
                const header = headers[idx];
                if (header) {
                  const val = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : '') : '';
                  obj[header] = String(val).trim();
                }
              });
            }
            return obj;
          }).filter(s => s.id && s.name);
          
          if (staff.length > 0) {
            console.log('[API] Ultra-fast staff direct load success:', staff.length);
            return { success: true, staff: staff, direct: true };
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[API] Direct spreadsheet fetch failed/timeout, falling back to GAS:', e.message);
  }
  
  // Fallback to Apps Script if direct fetch fails
  return apiCall('getStaff');
}

export async function saveStaffToCloud(staffData: any): Promise<any> {
  return apiCall('saveStaff', staffData);
}

export async function deleteStaffFromCloud(id: string): Promise<any> {
  return apiCall('deleteStaff', { id: id });
}

export async function loginWithPin(pin: string): Promise<any> {
  return apiCall('login', { pin: pin });
}

// ── Audit API ────────────────────────────────
export async function addAuditLog(entry: any): Promise<any> {
  if (!_online) { enqueue('addAudit', entry); return { success: false, offline: true }; }
  return apiCall('addAudit', entry);
}

export async function getAuditLogFromCloud(limit?: number): Promise<any> {
  return apiCall('getAudit', { limit: limit || 200 });
}

// ── File Upload API ──────────────────────────
export async function uploadFileToCloud(fileData: any): Promise<any> {
  return apiCall('uploadFile', fileData);
}

export async function deleteFileFromCloud(fileId: string): Promise<any> {
  return apiCall('deleteFile', { fileId: fileId });
}

// ── Settings API ─────────────────────────────
export async function getSettingsFromCloud(): Promise<any> {
  return apiCall('getSettings');
}

export async function saveSettingsToCloud(settings: any): Promise<any> {
  return apiCall('saveSettings', { settings: settings });
}

// ── CUKCUK Revenue → Google Sheets ──────────
export async function syncCukcukRevenueToCloud(invoices: any[], shiftId: string): Promise<any> {
  if (!_online) {
    enqueue('syncCukcukRevenue', { invoices: invoices, shiftId: shiftId });
    return { success: false, offline: true };
  }
  return apiCall('syncCukcukRevenue', { invoices: invoices, shiftId: shiftId });
}

// ── Config API (fast staff loading) ─────────
export async function getConfigFromCloud(): Promise<any> {
  return apiCall('getConfig');
}

export async function saveConfigToCloud(key: string, value: any): Promise<any> {
  return apiCall('saveConfig', { key: key, value: value });
}

// ── Health Check ─────────────────────────────
export async function pingAPI(): Promise<any> {
  return apiCall('ping');
}

export function isOnline(): boolean {
  return _online;
}

export function getQueueSize(): number {
  return _queue.length;
}

export async function getPosOrdersFromCloud(): Promise<any> {
  return apiCall('getPosOrders');
}

export async function syncPosOrdersWithCloud(ordersData: any[]): Promise<any> {
  return apiCall('syncPosOrders', { orders: ordersData });
}

// ── CUKCUK New Flow Cloud APIs ────────────────

export async function syncCukcukToSheetsOnCloud(params: {
  workDate?: string;
  fromDate?: string;
  toDate?: string;
  forceDetail?: boolean;
  mode?: string;
}): Promise<any> {
  return apiCall('syncCukcukToSheets', params);
}

export async function saveCukcukOverrideOnCloud(overrideData: {
  refId: string;
  overrideType?: string;
  oldValueJson?: string;
  newValueJson?: string;
  reason?: string;
  editedBy?: string;
  editedAt?: string;
}): Promise<any> {
  return apiCall('saveCukcukOverride', overrideData);
}

export async function getCukcukInvoicesFromCloud(params: {
  workDate?: string;
  fromDate?: string;
  toDate?: string;
  since?: string;
  page?: number;
  limit?: number;
}): Promise<any> {
  const ssId = '1drWBOfgTZ1nqgl-W_gb24P-7r4WRoxHxAfk657tvLQQ';
  let url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=KG_CUKCUK_INVOICES`;
  
  if (params.workDate) {
    url += `&tq=${encodeURIComponent(`select * where D = '${params.workDate}'`)}`;
  } else if (params.fromDate && params.toDate) {
    url += `&tq=${encodeURIComponent(`select * where C >= '${params.fromDate}' and C <= '${params.toDate}'`)}`;
  } else if (params.fromDate) {
    url += `&tq=${encodeURIComponent(`select * where C >= '${params.fromDate}'`)}`;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2500); // 2.5s timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);

    if (response.ok) {
      const text = await response.text();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const json = safeJsonParse<GVizResponse | null>(text.substring(start, end + 1), null);
        if (json && json.status === 'ok' && json.table && json.table.rows) {
          const INVOICES_HEADERS = [
            'RefId', 'RefNo', 'RefDate', 'WorkDate', 'ShiftId', 'ShiftNumber', 'TableName', 'EmployeeName', 'CustomerName',
            'Amount', 'CashAmount', 'CardAmount', 'TransferAmount', 'OtherAmount', 'PaymentInfo', 'PaymentJson',
            'Status', 'IsPaid', 'IsCancelled', 'IsDeleted', 'SourceUpdatedAt', 'LastFetchedAt', 'RowHash', 'DetailHash',
            'ItemsCount', 'ManualOverrideJson', 'ManualEditedAt', 'ManualEditedBy', 'ManualLock', 'SyncBatchId',
            'CreatedAt', 'UpdatedAt'
          ];
          const headers = json.table.cols.map((c, idx) => c.label || INVOICES_HEADERS[idx] || '');
          const invoices = json.table.rows.map(r => {
            const obj: Record<string, any> = {};
            if (r.c) {
              r.c.forEach((cell, idx) => {
                const header = headers[idx] || INVOICES_HEADERS[idx];
                if (header) {
                  let val = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : '') : '';
                  // Handle cell formatting/numbers
                  if (typeof val === 'string' && val.startsWith('Date(')) {
                    try {
                      const match = val.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
                      if (match) {
                        const y = parseInt(match[1]);
                        const m = parseInt(match[2]);
                        const d = parseInt(match[3]);
                        const hr = match[4] ? parseInt(match[4]) : 0;
                        const min = match[5] ? parseInt(match[5]) : 0;
                        const sec = match[6] ? parseInt(match[6]) : 0;
                        val = new Date(y, m, d, hr, min, sec).toISOString();
                      }
                    } catch(e) {}
                  }
                  obj[header] = val;
                }
              });
            }
            return obj;
          });
          
          console.log('[API] Ultra-fast invoices direct load success:', invoices.length);
          return { success: true, invoices: invoices, direct: true };
        }
      }
    }
  } catch (e: any) {
    console.warn('[API] Direct spreadsheet invoices fetch failed/timeout, falling back to GAS:', e.message);
  }

  // Fallback to Apps Script
  return apiCall('getCukcukInvoices', params);
}
