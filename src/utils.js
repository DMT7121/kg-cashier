/* ============================================
   KG-CASHIER — Utility Functions
   ============================================ */

/** Escape HTML special chars to prevent XSS when using innerHTML */
export function escapeHtml(str) {
  if (!str) return '';
  var s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Currency & Date Formatting ───────────────
export function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + ' đ';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) { return dateStr; }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (e) { return dateStr; }
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return dateStr; }
}

export function formatDuration(startISO) {
  if (!startISO) return '—';
  const ms = Date.now() - new Date(startISO).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── Vietnamese denominations ─────────────────
export const denominations = [
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
let toastContainer = null;

export function showToast(message, type = 'info', duration = 3500) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:360px;';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="material-symbols-rounded">${icons[type] || 'info'}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  // Limit max visible toasts to prevent overflow
  while (toastContainer.children.length > 5) {
    toastContainer.firstChild.remove();
  }

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Custom Confirm Modal ─────────────────────
export function showConfirm(message, opts) {
  var title = (opts && opts.title) || 'Xác nhận';
  var confirmText = (opts && opts.confirmText) || 'Đồng ý';
  var cancelText = (opts && opts.cancelText) || 'Hủy';
  var type = (opts && opts.type) || 'warning';
  var icons = { warning: 'warning', danger: 'delete_forever', info: 'help' };
  var colors = { warning: 'var(--primary)', danger: 'var(--danger)', info: 'var(--info)' };

  return new Promise(function(resolve) {
    var html = '<div style="text-align:center;padding:10px 0;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:' + (colors[type] || colors.warning) + ';margin-bottom:12px;display:block;">' + (icons[type] || 'help') + '</span>' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">' + title + '</h3>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:24px;">' + message + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn btn-outline" id="confirmCancel">' + cancelText + '</button>' +
      '<button class="btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary') + '" id="confirmOk">' + confirmText + '</button>' +
      '</div></div>';
    showModal(html);
    setTimeout(function() {
      var okBtn = document.getElementById('confirmOk');
      var cancelBtn = document.getElementById('confirmCancel');
      if (okBtn) okBtn.addEventListener('click', function() { hideModal(); resolve(true); });
      if (cancelBtn) cancelBtn.addEventListener('click', function() { hideModal(); resolve(false); });
    }, 50);
  });
}

// ── Custom Password Prompt Modal ─────────────────
export function showPasswordPrompt(message, opts) {
  var title = (opts && opts.title) || 'Xác nhận Mật khẩu';
  var placeholder = (opts && opts.placeholder) || 'Nhập mật khẩu...';
  var type = (opts && opts.type) || 'info';
  var colors = { warning: 'var(--primary)', danger: 'var(--danger)', info: 'var(--info)' };

  return new Promise(function(resolve) {
    var html = '<div style="text-align:center;padding:10px 0;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:' + (colors[type] || colors.info) + ';margin-bottom:12px;display:block;">lock</span>' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">' + title + '</h3>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">' + message + '</p>' +
      '<div class="form-group" style="margin-bottom:24px;text-align:left;">' +
      '<input type="password" id="modalPromptPassword" class="form-input" placeholder="' + placeholder + '" style="text-align:center;">' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn btn-outline" id="promptCancel">Hủy</button>' +
      '<button class="btn btn-primary" id="promptOk">Xác nhận</button>' +
      '</div></div>';
    showModal(html);
    setTimeout(function() {
      var okBtn = document.getElementById('promptOk');
      var cancelBtn = document.getElementById('promptCancel');
      var input = document.getElementById('modalPromptPassword');
      if (input) input.focus();

      if (okBtn) {
        okBtn.addEventListener('click', function() {
          var val = input ? input.value : '';
          hideModal();
          resolve(val);
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          hideModal();
          resolve(null);
        });
      }
      if (input) {
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') okBtn?.click();
        });
      }
    }, 50);
  });
}

// ── Modal ────────────────────────────────────
export function showModal(contentHTML, size) {
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  if (overlay && body) {
    body.innerHTML = contentHTML;
    // Support 'large' size for editors
    if (size === 'large') {
      body.classList.add('modal-large');
    } else {
      body.classList.remove('modal-large');
    }
    overlay.classList.add('active');
  }
}

export function hideModal() {
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  if (overlay) overlay.classList.remove('active');
  if (body) body.classList.remove('modal-large');
}

// ── Download helpers ─────────────────────────
export function downloadCSV(filename, csv) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Money Input: auto-format + math expressions ──
function _fmtDots(n) { return n.toLocaleString('vi-VN'); }

function _safeEval(expr) {
  // Only allow digits, dots, commas, spaces, +, -, *, /
  var clean = expr.replace(/\./g, '').replace(/,/g, '.').replace(/\s/g, '');
  if (!/^[\d.+\-*/]+$/.test(clean)) return null;
  // Safe stack-based math parser — no Function()/eval()
  try {
    var tokens = clean.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;
    // First pass: handle * and /
    var stack = [parseFloat(tokens[0])];
    if (isNaN(stack[0])) return null;
    var ops = [];
    for (var i = 1; i < tokens.length; i += 2) {
      var op = tokens[i];
      var next = parseFloat(tokens[i + 1]);
      if (isNaN(next)) return null;
      if (op === '*') { stack[stack.length - 1] *= next; }
      else if (op === '/') {
        if (next === 0) return null;
        stack[stack.length - 1] /= next;
      } else {
        ops.push(op);
        stack.push(next);
      }
    }
    // Second pass: handle + and -
    var result = stack[0];
    for (var j = 0; j < ops.length; j++) {
      if (ops[j] === '+') result += stack[j + 1];
      else if (ops[j] === '-') result -= stack[j + 1];
    }
    return isFinite(result) ? result : null;
  } catch(e) { return null; }
}

/**
 * Bind auto-format + math expression support to an input element.
 * @param {HTMLInputElement} el - The input (should be type="text")
 * @param {object} opts - { allowMath: true/false }
 * Returns: { getValue: () => number }
 */
export function moneyInput(el, opts) {
  if (!el) return { getValue: function() { return 0; } };
  opts = opts || {};
  var allowMath = opts.allowMath !== false;
  var previewEl = null;

  // Create math preview element if math is allowed
  if (allowMath) {
    previewEl = document.createElement('div');
    previewEl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px;min-height:16px;';
    if (el.parentElement) el.parentElement.appendChild(previewEl);
  }

  function formatDisplay() {
    var raw = el.value;
    var clean = raw.replace(/[.,\s]/g, '');
    
    var formatted = clean.replace(/\d+/g, function(match) {
      return match.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });

    var oldCursor = el.selectionStart;
    var oldLen = raw.length;
    el.value = formatted;
    var newLen = formatted.length;
    var newCursor = oldCursor + (newLen - oldLen);
    try { el.setSelectionRange(newCursor, newCursor); } catch(e) {}

    if (allowMath && /[+\-*/]/.test(clean)) {
      var result = _safeEval(clean);
      if (previewEl) {
        if (result != null && !isNaN(result)) {
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

  function getValue() {
    var raw = el.value.replace(/[.,\s]/g, '');
    if (allowMath && /[+\-*/]/.test(raw)) {
      var result = _safeEval(raw);
      return (result != null && !isNaN(result)) ? Math.round(result) : 0;
    }
    return parseInt(raw, 10) || 0;
  }

  function getExpression() {
    var raw = el.value;
    if (/[+\-*/]/.test(raw)) return raw;
    return null;
  }

  el.addEventListener('input', formatDisplay);
  // Format initial value if present
  if (el.value && /^\d+$/.test(el.value.trim())) {
    var initNum = parseInt(el.value, 10);
    if (!isNaN(initNum) && initNum > 0) el.value = _fmtDots(initNum);
  }

  return { getValue: getValue, getExpression: getExpression, format: formatDisplay };
}

/** Parse a money-formatted string (e.g. "2.495.000") to a number */
export function parseMoneyValue(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseInt(String(str).replace(/\./g, '').replace(/\D/g, ''), 10) || 0;
}

// ── Standardized VND Currency Utilities (Yêu cầu 5) ──

export function toMoney(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : Math.round(val);
  }
  var str = String(val).trim().replace(/[.,\sđđ]/g, '');
  var num = parseFloat(str);
  return isNaN(num) || !isFinite(num) ? 0 : Math.round(num);
}

export function parseMoneyInput(str) {
  if (typeof str === 'number') {
    return isNaN(str) || !isFinite(str) ? 0 : Math.round(str);
  }
  if (!str) return 0;
  // Strip dots, commas, spaces, and typical currency indicators like 'đ', 'd', 'VND'
  var clean = String(str).replace(/[.,\sđdDđĐVNDvnd]/g, '');
  var parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatMoney(val) {
  return toMoney(val).toLocaleString('vi-VN') + ' đ';
}

export function addMoney(a, b) {
  return toMoney(a) + toMoney(b);
}

export function subtractMoney(a, b) {
  return toMoney(a) - toMoney(b);
}

export function multiplyMoney(a, factor) {
  var f = Number(factor);
  if (isNaN(f) || !isFinite(f)) f = 0;
  return Math.round(toMoney(a) * f);
}

export function safeRoundMoney(val) {
  return toMoney(val);
}

export function isValidMoney(val) {
  if (val === null || val === undefined) return false;
  var num = Number(val);
  return !isNaN(num) && isFinite(num);
}

// ── Centralized Working Day 12:00 - 06:00 (Yêu cầu 2) ──

export function getWorkingDay(date) {
  var d = null;
  if (!date) {
    d = new Date();
  } else if (date instanceof Date) {
    d = new Date(date);
  } else {
    d = new Date(date);
    if (isNaN(d.getTime())) {
      // Handle dd/mm/yyyy hh:mm format
      var parts = String(date).match(/(\d{2})\/(\d{2})\/(\d{4})/);
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

export function getWorkingDayRange(workingDay) {
  var stdDateStr = normalizeWorkingDayInput(workingDay);
  var parts = stdDateStr.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var d = parseInt(parts[2], 10);

  var start = new Date(y, m, d, 12, 0, 0);
  var end = new Date(y, m, d + 1, 6, 0, 0);
  return { start: start, end: end };
}

export function isDateInWorkingDay(date, workingDay) {
  var d = new Date(date);
  if (isNaN(d.getTime())) return false;
  var range = getWorkingDayRange(workingDay);
  return d >= range.start && d < range.end;
}

export function normalizeWorkingDayInput(input) {
  if (!input) {
    var today = new Date();
    if (today.getHours() < 6) today.setDate(today.getDate() - 1);
    return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  }
  if (input instanceof Date) {
    var d = new Date(input);
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var str = String(input).trim();
  // Match yyyy-mm-dd
  var partsYMD = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (partsYMD) {
    return partsYMD[1] + '-' + partsYMD[2] + '-' + partsYMD[3];
  }
  // Match dd/mm/yyyy
  var partsDMY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (partsDMY) {
    return partsDMY[3] + '-' + String(partsDMY[2]).padStart(2, '0') + '-' + String(partsDMY[1]).padStart(2, '0');
  }
  // Fallback to standard JS Date parsing
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    if (parsed.getHours() < 6) parsed.setDate(parsed.getDate() - 1);
    return parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0');
  }
  // Ultimate fallback is the current working day
  return getWorkingDay();
}

// ── Standardized JSON & GAS Responses Parsing (Yêu cầu 9) ──

export function safeJsonParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  if (typeof str === 'object') return str; // Already parsed
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[Utils] safeJsonParse failed. Raw value:', str, 'Error:', e.message);
    return fallback;
  }
}

export function normalizeGasResponse(response) {
  if (response === null || response === undefined) {
    return { success: false, message: 'Phản hồi trống' };
  }
  // If response is already an object, return it
  if (typeof response === 'object' && !Array.isArray(response)) {
    return response;
  }
  // If it's a primitive string, clean up hidden characters (like \r\n) and parse
  if (typeof response === 'string') {
    var cleaned = response.trim();
    // Sometimes GAS returns primitive strings inside java.lang responses.
    // If it looks like JSON, attempt to parse it
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      var parsed = safeJsonParse(cleaned, null);
      if (parsed) return parsed;
    }
    // If it is just a string that couldn't be parsed, return wrapped success structure
    return { success: true, data: cleaned };
  }
  return { success: false, message: 'Định dạng phản hồi không hợp lệ' };
}

export function normalizeSheetRow(row) {
  if (!row) return {};
  if (typeof row !== 'object') return {};
  // Standardize values, ensure strings are trimmed and values are typed correctly
  var normalized = {};
  for (var key in row) {
    if (row.hasOwnProperty(key)) {
      var val = row[key];
      if (typeof val === 'string') {
        normalized[key] = val.trim();
      } else {
        normalized[key] = val;
      }
    }
  }
  return normalized;
}

export function ensureObject(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  return {};
}

export function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

// ── SPA Temporary State Consumer (Yêu cầu 7) ──

export function consumeTempState(key) {
  if (typeof window === 'undefined') return null;
  var val = window[key];
  try {
    delete window[key];
  } catch (e) {
    window[key] = undefined;
  }
  return val;
}

// ── Masked Centralized Logging (Yêu cầu 12) ──

function maskSecrets(msg) {
  if (typeof msg !== 'string') return msg;
  // Mask typical api keys (Gemini API keys, CUKCUK secrets, passwords)
  return msg.replace(/(AIzaSy[A-Za-z0-9_-]{31})/g, 'AIzaSy...[MASKED]')
            .replace(/(cukcuk_token=[A-Za-z0-9_-]+)/gi, 'cukcuk_token=[MASKED]')
            .replace(/(api_key\s*:\s*["'])[A-Za-z0-9_-]+(["'])/gi, '$1[MASKED]$2')
            .replace(/(password\s*:\s*["'])[A-Za-z0-9_-]+(["'])/gi, '$1[MASKED]$2');
}

export function logInfo(message, details) {
  var formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.log('[INFO] ' + maskSecrets(message), formattedDetails);
}

export function logWarn(message, details) {
  var formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.warn('[WARN] ' + maskSecrets(message), formattedDetails);
}

export function logError(message, details) {
  var formattedDetails = details ? maskSecrets(typeof details === 'object' ? JSON.stringify(details) : String(details)) : '';
  console.error('[ERROR] ' + maskSecrets(message), formattedDetails);
}

