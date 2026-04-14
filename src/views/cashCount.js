/* ── Cash Count View ──────────────────────── */
import { getCurrentShift, updateCashCount } from '../store.js';
import { formatCurrency, denominations, showToast } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">calculate</span><h2>Chưa mở ca</h2><p>Mở ca để kiểm kê tiền mặt</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const counts = shift.cashCount || {};
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
        const subtotal = d.value * qty;
        return `
          <div class="denomination-card">
            <span class="denom-badge" style="background:${d.color};">${d.label}</span>
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

  // Reset
  document.getElementById('btnResetCount')?.addEventListener('click', () => {
    document.querySelectorAll('[data-denom-input]').forEach(input => { input.value = 0; });
    _recalculate();
    showToast('Đã đặt lại', 'info');
  });

  // Save
  document.getElementById('btnSaveCashCount')?.addEventListener('click', () => {
    const counts = _recalculate();
    try {
      updateCashCount(counts);
      showToast('Đã lưu kiểm kê tiền mặt', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}
