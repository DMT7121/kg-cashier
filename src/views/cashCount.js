/* ── Cash Count View ──────────────────────── */
import { getCurrentShift, updateCashCount } from '../store.js';
import { formatCurrency, denominations, showToast } from '../utils.js';

var PIN_KEY = 'kg_cashier_pinned_cash';

function _loadPins() {
  try {
    var saved = localStorage.getItem(PIN_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore */ }
  return {};
}

function _savePins(pins) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  } catch(e) { /* ignore */ }
}

export function render() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">calculate</span><h2>Chưa mở ca</h2><p>Mở ca để kiểm kê tiền mặt</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const counts = shift.cashCount || {};
  const pins = _loadPins();
  const total = Object.entries(counts).reduce((s, [d, q]) => s + Number(d) * Number(q), 0);

  return `
    <div class="section-header">
      <div>
        <h3>💰 Kiểm kê tiền mặt</h3>
        <p>Đếm tiền trong két/tủ theo từng mệnh giá</p>
      </div>
      <button class="btn btn-outline btn-sm" id="btnResetCount">
        <span class="material-symbols-rounded">restart_alt</span> Đặt lại
      </button>
    </div>

    <div class="denomination-grid">
      ${denominations.map(d => {
        const qty = counts[d.value] || 0;
        const pinQty = pins[d.value] || 0;
        const subtotal = d.value * qty;
        return `
          <div class="denomination-card">
            <div style="display:flex;flex-direction:column;align-items:center;min-width:70px;">
              <span class="denom-badge" style="background:${d.color};">${d.label}</span>
              <div class="denom-pin-row">
                <span class="pin-icon" title="Ghim két: ${pinQty} tờ" data-pin-toggle="${d.value}">📌</span>
                <input type="number" class="pin-input" data-pin-denom="${d.value}" value="${pinQty}" min="0" title="Số tờ ghim két">
              </div>
            </div>
            <div class="denom-controls">
              <button class="btn-icon denom-btn" data-denom="${d.value}" data-dir="-1">
                <span class="material-symbols-rounded">remove</span>
              </button>
              <input type="number" class="denom-input" id="denom_${d.value}" value="${qty}" min="0" data-denom-input="${d.value}">
              <button class="btn-icon denom-btn" data-denom="${d.value}" data-dir="1">
                <span class="material-symbols-rounded">add</span>
              </button>
            </div>
            <span class="denom-subtotal">${formatCurrency(subtotal)}</span>
          </div>`;
      }).join('')}
    </div>

    <div class="cash-total-bar">
      <span>💰 TỔNG CỘNG TIỀN MẶT:</span>
      <span id="cashTotal" class="cash-total-value">${formatCurrency(total)}</span>
    </div>

    <button class="btn btn-primary" style="width:100%;margin-top:16px;" id="btnSaveCashCount">
      <span class="material-symbols-rounded">save</span> Lưu kiểm kê
    </button>
  `;
}

function _recalculate() {
  let total = 0;
  const counts = {};
  document.querySelectorAll('[data-denom-input]').forEach(input => {
    const denom = Number(input.dataset.denomInput);
    const qty = parseInt(input.value) || 0;
    counts[denom] = qty;
    total += denom * qty;
    const card = input.closest('.denomination-card');
    if (card) card.querySelector('.denom-subtotal').textContent = formatCurrency(denom * qty);
  });
  const el = document.getElementById('cashTotal');
  if (el) el.textContent = formatCurrency(total);
  return counts;
}

export function init() {
  // +/- buttons
  document.querySelectorAll('[data-denom][data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      const denom = btn.dataset.denom;
      const dir = parseInt(btn.dataset.dir);
      const input = document.getElementById('denom_' + denom);
      if (input) {
        input.value = Math.max(0, (parseInt(input.value) || 0) + dir);
        _recalculate();
      }
    });
  });

  // Input change
  document.querySelectorAll('[data-denom-input]').forEach(input => {
    input.addEventListener('input', _recalculate);
  });

  // Pin icon click — apply pinned value to count input
  document.querySelectorAll('[data-pin-toggle]').forEach(icon => {
    icon.addEventListener('click', () => {
      const denom = icon.dataset.pinToggle;
      const pinInput = document.querySelector('[data-pin-denom="' + denom + '"]');
      const countInput = document.getElementById('denom_' + denom);
      if (pinInput && countInput) {
        const pinVal = parseInt(pinInput.value) || 0;
        countInput.value = pinVal;
        _recalculate();
        showToast('📌 Áp dụng ' + pinVal + ' tờ ghim két', 'info');
      }
    });
  });

  // Pin input change — save to localStorage
  document.querySelectorAll('[data-pin-denom]').forEach(input => {
    input.addEventListener('change', () => {
      var pins = _loadPins();
      var denom = Number(input.dataset.pinDenom);
      var val = parseInt(input.value) || 0;
      if (val > 0) {
        pins[denom] = val;
      } else {
        delete pins[denom];
      }
      _savePins(pins);
      showToast('📌 Ghim két ' + denominations.find(d => d.value === denom)?.label + ': ' + val + ' tờ', 'info');
    });
  });

  // Reset
  document.getElementById('btnResetCount')?.addEventListener('click', () => {
    document.querySelectorAll('[data-denom-input]').forEach(input => { input.value = 0; });
    _recalculate();
    showToast('Đã đặt lại', 'info');
  });

  // Save
  document.getElementById('btnSaveCashCount')?.addEventListener('click', () => {
    const counts = _recalculate();
    // Also save any changed pins
    var pins = _loadPins();
    document.querySelectorAll('[data-pin-denom]').forEach(input => {
      var denom = Number(input.dataset.pinDenom);
      var val = parseInt(input.value) || 0;
      if (val > 0) pins[denom] = val;
      else delete pins[denom];
    });
    _savePins(pins);
    try {
      updateCashCount(counts);
      showToast('Đã lưu kiểm kê tiền mặt', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}
