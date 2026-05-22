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
