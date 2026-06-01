/* ============================================
   KG-CASHIER — Utility Functions (TypeScript)
   ============================================ */

/** Escape HTML special chars to prevent XSS when using innerHTML */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
}

// ── Currency & Date Formatting ───────────────
export function formatCurrency(amount: number | string | null | undefined): string {
  const value = amount === null || amount === undefined ? 0 : Number(amount);
  return (isNaN(value) ? 0 : value).toLocaleString('vi-VN') + ' đ';
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (e) {
    return dateStr;
  }
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return dateStr;
  }
}

export function formatDuration(startISO: string | null | undefined): string {
  if (!startISO) return '—';
  const ms = Date.now() - new Date(startISO).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Vietnamese denominations ─────────────────
export interface Denomination {
  value: number;
  label: string;
  color: string;
}

export const denominations: Denomination[] = [
  { value: 500000, label: '500.000', color: '#ef4444' },
  { value: 200000, label: '200.000', color: '#f97316' },
  { value: 100000, label: '100.000', color: '#eab308' },
  { value: 50000,  label: '50.000',  color: '#22c55e' },
  { value: 20000,  label: '20.000',  color: '#3b82f6' },
  { value: 10000,  label: '10.000',  color: '#f59e0b' },
  { value: 5000,   label: '5.000',   color: '#10b981' },
  { value: 2000,   label: '2.000',   color: '#6366f1' },
  { value: 1000,   label: '1.000',   color: '#8b5cf6' },
  { value: 500,    label: '500',     color: '#ec4899' }
];

// ── Toast Notifications ──────────────────────
let toastContainer: HTMLDivElement | null = null;

export function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 3500): void {
  if (typeof document === 'undefined') return;
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:360px;';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="material-symbols-rounded">${icons[type] || 'info'}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  // Limit max visible toasts to prevent overflow
  while (toastContainer.children.length > 5) {
    toastContainer.firstChild?.remove();
  }

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Custom Confirm Modal ─────────────────────
export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

export function showConfirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const title = opts?.title || 'Xác nhận';
  const confirmText = opts?.confirmText || 'Đồng ý';
  const cancelText = opts?.cancelText || 'Hủy';
  const type = opts?.type || 'warning';
  const icons = { warning: 'warning', danger: 'delete_forever', info: 'help' };
  const colors = { warning: 'var(--primary)', danger: 'var(--danger)', info: 'var(--info)' };

  return new Promise<boolean>((resolve) => {
    const html = '<div style="text-align:center;padding:10px 0;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:' + (colors[type] || colors.warning) + ';margin-bottom:12px;display:block;">' + (icons[type] || 'help') + '</span>' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">' + escapeHtml(title) + '</h3>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:24px;">' + escapeHtml(message) + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn btn-outline" id="confirmCancel">' + escapeHtml(cancelText) + '</button>' +
      '<button class="btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary') + '" id="confirmOk">' + escapeHtml(confirmText) + '</button>' +
      '</div></div>';
    showModal(html);
    setTimeout(() => {
      const okBtn = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');
      if (okBtn) okBtn.addEventListener('click', () => { hideModal(); resolve(true); });
      if (cancelBtn) cancelBtn.addEventListener('click', () => { hideModal(); resolve(false); });
    }, 50);
  });
}

// ── Custom Password Prompt Modal ─────────────────
export interface PasswordPromptOptions {
  title?: string;
  placeholder?: string;
  type?: 'warning' | 'danger' | 'info';
}

export function showPasswordPrompt(message: string, opts?: PasswordPromptOptions): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const title = opts?.title || 'Xác nhận Mật khẩu';
  const placeholder = opts?.placeholder || 'Nhập mật khẩu...';
  const type = opts?.type || 'info';
  const colors = { warning: 'var(--primary)', danger: 'var(--danger)', info: 'var(--info)' };

  return new Promise<string | null>((resolve) => {
    const html = '<div style="text-align:center;padding:10px 0;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:' + (colors[type] || colors.info) + ';margin-bottom:12px;display:block;">lock</span>' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">' + escapeHtml(title) + '</h3>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">' + escapeHtml(message) + '</p>' +
      '<div class="form-group" style="margin-bottom:24px;text-align:left;">' +
      '<input type="password" id="modalPromptPassword" class="form-input" placeholder="' + escapeHtml(placeholder) + '" style="text-align:center;">' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn btn-outline" id="promptCancel">Hủy</button>' +
      '<button class="btn btn-primary" id="promptOk">Xác nhận</button>' +
      '</div></div>';
    showModal(html);
    setTimeout(() => {
      const okBtn = document.getElementById('promptOk');
      const cancelBtn = document.getElementById('promptCancel');
      const input = document.getElementById('modalPromptPassword') as HTMLInputElement | null;
      if (input) input.focus();

      if (okBtn) {
        okBtn.addEventListener('click', () => {
          const val = input ? input.value : '';
          hideModal();
          resolve(val);
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          hideModal();
          resolve(null);
        });
      }
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') okBtn?.click();
        });
      }
    }, 50);
  });
}

// ── Modal ────────────────────────────────────
export function showModal(contentHTML: string, size?: 'large' | string): void {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  if (overlay && body) {
    body.innerHTML = contentHTML;
    if (size === 'large') {
      body.classList.add('modal-large');
    } else {
      body.classList.remove('modal-large');
    }
    overlay.classList.add('active');
  }
}

export function hideModal(): void {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  if (overlay) overlay.classList.remove('active');
  if (body) body.classList.remove('modal-large');
}

// ── Download helpers ─────────────────────────
export function downloadCSV(filename: string, csv: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Money Input: auto-format + math expressions ──
function _fmtDots(n: number): string {
  return n.toLocaleString('vi-VN');
}

function _safeEval(expr: string): number | null {
  const clean = expr.replace(/\./g, '').replace(/,/g, '.').replace(/\s/g, '');
  if (!/^[\d.+\-*/]+$/.test(clean)) return null;
  try {
    const tokens = clean.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;
    
    // First pass: handle * and /
    const stack: number[] = [parseFloat(tokens[0])];
    if (isNaN(stack[0])) return null;
    const ops: string[] = [];
    
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = parseFloat(tokens[i + 1]);
      if (isNaN(next)) return null;
      if (op === '*') {
        stack[stack.length - 1] *= next;
      } else if (op === '/') {
        if (next === 0) return null;
        stack[stack.length - 1] /= next;
      } else {
        ops.push(op);
        stack.push(next);
      }
    }
    
    // Second pass: handle + and -
    let result = stack[0];
    for (let j = 0; j < ops.length; j++) {
      if (ops[j] === '+') result += stack[j + 1];
      else if (ops[j] === '-') result -= stack[j + 1];
    }
    return isFinite(result) ? result : null;
  } catch (e) {
    return null;
  }
}

export interface MoneyInputControl {
  getValue: () => number;
  getExpression: () => string | null;
  format: () => void;
}

/**
 * Bind auto-format + math expression support to an input element.
 */
export function moneyInput(el: HTMLInputElement | null, opts?: { allowMath?: boolean }): MoneyInputControl {
  if (!el) {
    return {
      getValue: () => 0,
      getExpression: () => null,
      format: () => {}
    };
  }
  const allowMath = opts?.allowMath !== false;
  let previewEl: HTMLDivElement | null = null;

  if (allowMath && typeof document !== 'undefined') {
    previewEl = document.createElement('div');
    previewEl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px;min-height:16px;';
    if (el.parentElement) el.parentElement.appendChild(previewEl);
  }

  function formatDisplay(): void {
    if (!el) return;
    const raw = el.value;
    const clean = raw.replace(/[.,\s]/g, '');
    
    const formatted = clean.replace(/\d+/g, (match) => {
      return match.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });

    const oldCursor = el.selectionStart || 0;
    const oldLen = raw.length;
    el.value = formatted;
    const newLen = formatted.length;
    const newCursor = oldCursor + (newLen - oldLen);
    try {
      el.setSelectionRange(newCursor, newCursor);
    } catch (e) {}

    if (allowMath && /[+\-*/]/.test(clean)) {
      const result = _safeEval(clean);
      if (previewEl) {
        if (result !== null && !isNaN(result)) {
          previewEl.textContent = '= ' + _fmtDots(Math.round(result)) + ' đ';
          previewEl.style.color = 'var(--success)';
        } else {
          previewEl.textContent = '⚠ Biểu thức không hợp lệ';
          previewEl.style.color = 'var(--danger)';
        }
      }
    } else {
      if (previewEl) previewEl.textContent = '';
    }
  }

  function getValue(): number {
    if (!el) return 0;
    const raw = el.value.replace(/[.,\s]/g, '');
    if (allowMath && /[+\-*/]/.test(raw)) {
      const result = _safeEval(raw);
      return (result !== null && !isNaN(result)) ? Math.round(result) : 0;
    }
    return parseInt(raw, 10) || 0;
  }

  function getExpression(): string | null {
    if (!el) return null;
    const raw = el.value;
    if (/[+\-*/]/.test(raw)) return raw;
    return null;
  }

  el.addEventListener('input', formatDisplay);
  if (el.value && /^\d+$/.test(el.value.trim())) {
    const initNum = parseInt(el.value, 10);
    if (!isNaN(initNum) && initNum > 0) el.value = _fmtDots(initNum);
  }

  return { getValue, getExpression, format: formatDisplay };
}

/** Parse a money-formatted string (e.g. "2.495.000") to a number */
export function parseMoneyValue(str: string | number | null | undefined): number {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseInt(String(str).replace(/\./g, '').replace(/\D/g, ''), 10) || 0;
}

// ── Standardized VND Currency Utilities ──

export function toMoney(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : Math.round(val);
  }
  const str = String(val).trim().replace(/[.,\sđđ]/g, '');
  const num = parseFloat(str);
  return isNaN(num) || !isFinite(num) ? 0 : Math.round(num);
}

export function parseMoneyInput(str: string | number | null | undefined): number {
  if (typeof str === 'number') {
    return isNaN(str) || !isFinite(str) ? 0 : Math.round(str);
  }
  if (!str) return 0;
  const clean = String(str).replace(/[.,\sđdDđĐVNDvnd]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatMoney(val: any): string {
  return toMoney(val).toLocaleString('vi-VN') + ' đ';
}

export function addMoney(a: any, b: any): number {
  return toMoney(a) + toMoney(b);
}

export function subtractMoney(a: any, b: any): number {
  return toMoney(a) - toMoney(b);
}

export function multiplyMoney(a: any, factor: number | string): number {
  let f = Number(factor);
  if (isNaN(f) || !isFinite(f)) f = 0;
  return Math.round(toMoney(a) * f);
}

export function safeRoundMoney(val: any): number {
  return toMoney(val);
}

export function isValidMoney(val: any): boolean {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num);
}

// ── Centralized Working Day 12:00 - 06:00 ──

export function getWorkingDay(date?: Date | string | number): string {
  let d: Date;
  if (!date) {
    d = new Date();
  } else if (date instanceof Date) {
    d = new Date(date);
  } else {
    d = new Date(date);
    if (isNaN(d.getTime())) {
      const parts = String(date).match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
      } else {
        d = new Date();
      }
    }
  }

  if (isNaN(d.getTime())) d = new Date();

  // If the hour is before 06:00 AM, it belongs to the previous working day
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export interface WorkingDayRange {
  start: Date;
  end: Date;
}

export function getWorkingDayRange(workingDay: string): WorkingDayRange {
  const stdDateStr = normalizeWorkingDayInput(workingDay);
  const parts = stdDateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);

  const start = new Date(y, m, d, 12, 0, 0);
  const end = new Date(y, m, d + 1, 6, 0, 0);
  return { start, end };
}

export function isDateInWorkingDay(date: Date | string | number, workingDay: string): boolean {
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  const range = getWorkingDayRange(workingDay);
  return d >= range.start && d < range.end;
}

export function normalizeWorkingDayInput(input?: Date | string | number | null): string {
  if (!input) {
    const today = new Date();
    if (today.getHours() < 6) today.setDate(today.getDate() - 1);
    return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  }
  if (input instanceof Date) {
    const d = new Date(input);
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const str = String(input).trim();
  const partsYMD = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (partsYMD) {
    return partsYMD[1] + '-' + partsYMD[2] + '-' + partsYMD[3];
  }
  const partsDMY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (partsDMY) {
    return partsDMY[3] + '-' + String(partsDMY[2]).padStart(2, '0') + '-' + String(partsDMY[1]).padStart(2, '0');
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    if (parsed.getHours() < 6) parsed.setDate(parsed.getDate() - 1);
    return parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0');
  }
  return getWorkingDay();
}

// ── Standardized JSON & GAS Responses Parsing ──

export function safeJsonParse<T>(str: any, fallback: T): T {
  if (str === null || str === undefined) return fallback;
  if (typeof str === 'object') return str as T;
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    console.warn('[Utils] safeJsonParse failed. Raw value:', str, 'Error:', errMsg);
    return fallback;
  }
}

export interface GasResponse {
  success: boolean;
  message?: string;
  data?: any;
  [key: string]: any;
}

export function normalizeGasResponse(response: any): GasResponse {
  if (response === null || response === undefined) {
    return { success: false, message: 'Phản hồi trống' };
  }
  if (typeof response === 'object' && !Array.isArray(response)) {
    return response as GasResponse;
  }
  if (typeof response === 'string') {
    const cleaned = response.trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      const parsed = safeJsonParse<GasResponse | null>(cleaned, null);
      if (parsed) return parsed;
    }
    return { success: true, data: cleaned };
  }
  return { success: false, message: 'Định dạng phản hồi không hợp lệ' };
}

export function normalizeSheetRow(row: any): Record<string, any> {
  if (!row || typeof row !== 'object') return {};
  const normalized: Record<string, any> = {};
  for (const key in row) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const val = row[key];
      if (typeof val === 'string') {
        normalized[key] = val.trim();
      } else {
        normalized[key] = val;
      }
    }
  }
  return normalized;
}

export function ensureObject(val: any): Record<string, any> {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  return {};
}

export function ensureArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val) as T[];
  return [];
}

// ── SPA Temporary State Consumer ──

export function consumeTempState(key: string): any {
  if (typeof window === 'undefined') return null;
  const val = (window as any)[key];
  try {
    delete (window as any)[key];
  } catch (e) {
    (window as any)[key] = undefined;
  }
  return val;
}

// ── Masked Centralized Logging ──

function maskSecrets(msg: string): string {
  if (typeof msg !== 'string') return msg;
  return msg.replace(/(AIzaSy[A-Za-z0-9_-]{31})/g, 'AIzaSy...[MASKED]')
            .replace(/(cukcuk_token=[A-Za-z0-9_-]+)/gi, 'cukcuk_token=[MASKED]')
            .replace(/(api_key\s*:\s*["'])[A-Za-z0-9_-]+(["'])/gi, '$1[MASKED]$2')
            .replace(/(password\s*:\s*["'])[A-Za-z0-9_-]+(["'])/gi, '$1[MASKED]$2');
}

export function logInfo(message: string, details?: any): void {
  const formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.log('[INFO] ' + maskSecrets(message), formattedDetails);
}

export function logWarn(message: string, details?: any): void {
  const formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.warn('[WARN] ' + maskSecrets(message), formattedDetails);
}

export function logError(message: string, details?: any): void {
  const formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.error('[ERROR] ' + maskSecrets(message), formattedDetails);
}

export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';
  
  const words: number[] = [];
  const asciiLength = ascii.length;
  
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // ASCII only
    words[i >> 2] |= j << (24 - (i % 4) * 8);
  }
  
  words[words.length] = ((asciiLength / maxWord) | 0);
  words[words.length] = (asciiLength << 3);
  
  for (j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);
    
    for (i = 0; i < 64; i++) {
      let wItem = w[i];
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ((hash[4] & hash[5]) ^ (~hash[4] & hash[6])) + k[i] + wItem) | 0;
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        ((hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.length = 8;
    }
    
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    let val = hash[i];
    if (val < 0) val += maxWord;
    let str = val.toString(16);
    while (str.length < 8) str = '0' + str;
    result += str;
  }
  return result;
}
