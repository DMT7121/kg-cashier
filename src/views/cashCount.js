/* ── Cash Count View — 3-column: Ghim + Giữ + Giao ────── */
import { getCurrentShift, updateCashCount } from '../store.js';
import { formatCurrency, denominations, showToast } from '../utils.js';

var PIN_KEY = 'kg_cashier_pinned_cash';

/** Load persistent pins from localStorage (carry forward across shifts) */
function _loadPersistentPins() {
  try {
    var saved = localStorage.getItem(PIN_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) { /* ignore */ }
  return {};
}

function _savePersistentPins(pins) {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch(e) { /* ignore */ }
}

/** Build a ± input group HTML */
function _inputGroup(prefix, denom, value, color) {
  var id = prefix + '_' + denom;
  return '<div class="cc-input-group">' +
    '<button class="btn-icon denom-btn" data-cc-btn="' + prefix + '" data-cc-denom="' + denom + '" data-cc-dir="-1"><span class="material-symbols-rounded">remove</span></button>' +
    '<input type="number" class="cc-num-input" id="' + id + '" data-cc-type="' + prefix + '" data-cc-denom="' + denom + '" value="' + value + '" min="0" style="border-color:' + (color || 'var(--border)') + ';">' +
    '<button class="btn-icon denom-btn" data-cc-btn="' + prefix + '" data-cc-denom="' + denom + '" data-cc-dir="1"><span class="material-symbols-rounded">add</span></button>' +
  '</div>';
}

export function render() {
  var shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">calculate</span><h2>Chưa mở ca</h2><p>Mở ca để kiểm kê tiền mặt</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  // Load data: from shift (if saved) or defaults
  var savedPins = shift.pinnedCash || _loadPersistentPins();
  var savedKeep = shift.keepCash || {};
  var savedHandover = shift.handoverCash || {};
  // Backward compat: if shift has cashCount but no handover, use cashCount as total
  var cc = shift.cashCount || {};

  // Calculate totals
  var totalKet = 0, totalGiao = 0, totalAll = 0;
  for (var i = 0; i < denominations.length; i++) {
    var dv = denominations[i].value;
    var pin = savedPins[dv] || 0;
    var keep = savedKeep[dv] || 0;
    var hand = savedHandover[dv] || 0;
    // If no split data, infer from cashCount
    if (!shift.handoverCash && cc[dv] > 0) {
      hand = Math.max(0, (cc[dv] || 0) - pin - keep);
    }
    totalKet += dv * (pin + keep);
    totalGiao += dv * hand;
  }
  totalAll = totalKet + totalGiao;

  var rows = denominations.map(function(d) {
    var pin = savedPins[d.value] || 0;
    var keep = savedKeep[d.value] || 0;
    var hand = savedHandover[d.value] || 0;
    if (!shift.handoverCash && cc[d.value] > 0) {
      hand = Math.max(0, (cc[d.value] || 0) - pin - keep);
    }
    var ket = pin + keep;
    var rowTotal = d.value * (ket + hand);

    return '<div class="cc-denom-row">' +
      '<div class="cc-denom-badge" style="background:' + d.color + ';">' + d.label + '</div>' +
      '<div class="cc-inputs">' +
        '<div class="cc-col"><span class="cc-label">📌 Ghim</span>' + _inputGroup('pin', d.value, pin, 'rgba(232,168,56,.5)') + '</div>' +
        '<div class="cc-col"><span class="cc-label">🔒 Giữ</span>' + _inputGroup('keep', d.value, keep, 'rgba(99,102,241,.5)') + '</div>' +
        '<div class="cc-col"><span class="cc-label">🤝 Giao</span>' + _inputGroup('hand', d.value, hand, 'rgba(34,197,94,.5)') + '</div>' +
      '</div>' +
      '<div class="cc-subtotals">' +
        '<span class="cc-sub-ket">Két: ' + formatCurrency(d.value * ket) + '</span>' +
        '<span class="cc-sub-giao">Giao: ' + formatCurrency(d.value * hand) + '</span>' +
        '<span class="cc-sub-total">Σ ' + formatCurrency(rowTotal) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="section-header">' +
    '<div><h3>💰 Kiểm kê tiền mặt</h3><p>Ghim (két cố định) + Giữ (thêm) = Tiền két. Giao = bàn giao.</p></div>' +
    '<button class="btn btn-outline btn-sm" id="btnResetCount"><span class="material-symbols-rounded">restart_alt</span> Đặt lại</button>' +
  '</div>' +
  '<div class="cc-denom-list">' + rows + '</div>' +
  '<div class="cc-summary-bar">' +
    '<div class="cc-summary-item cc-ket-bg"><span>📌🔒 Tiền két (giữ lại)</span><strong id="sumKet">' + formatCurrency(totalKet) + '</strong></div>' +
    '<div class="cc-summary-item cc-giao-bg"><span>🤝 Tiền bàn giao</span><strong id="sumGiao">' + formatCurrency(totalGiao) + '</strong></div>' +
    '<div class="cc-summary-item cc-total-bg"><span>💰 TỔNG KIỂM KÊ</span><strong id="sumAll">' + formatCurrency(totalAll) + '</strong></div>' +
  '</div>' +
  '<button class="btn btn-primary" style="width:100%;margin-top:16px;" id="btnSaveCashCount"><span class="material-symbols-rounded">save</span> Lưu kiểm kê</button>';
}

/** Recalculate all subtotals and totals */
function _recalc() {
  var totalKet = 0, totalGiao = 0;

  for (var i = 0; i < denominations.length; i++) {
    var dv = denominations[i].value;
    var pin = parseInt(document.getElementById('pin_' + dv)?.value) || 0;
    var keep = parseInt(document.getElementById('keep_' + dv)?.value) || 0;
    var hand = parseInt(document.getElementById('hand_' + dv)?.value) || 0;
    var ket = pin + keep;
    var ketAmt = dv * ket;
    var giaoAmt = dv * hand;
    var rowTotal = ketAmt + giaoAmt;
    totalKet += ketAmt;
    totalGiao += giaoAmt;

    // Update per-row subtotals
    var row = document.getElementById('pin_' + dv)?.closest('.cc-denom-row');
    if (row) {
      var subs = row.querySelector('.cc-subtotals');
      if (subs) {
        subs.querySelector('.cc-sub-ket').textContent = 'Két: ' + formatCurrency(ketAmt);
        subs.querySelector('.cc-sub-giao').textContent = 'Giao: ' + formatCurrency(giaoAmt);
        subs.querySelector('.cc-sub-total').textContent = 'Σ ' + formatCurrency(rowTotal);
      }
    }
  }

  var el;
  el = document.getElementById('sumKet'); if (el) el.textContent = formatCurrency(totalKet);
  el = document.getElementById('sumGiao'); if (el) el.textContent = formatCurrency(totalGiao);
  el = document.getElementById('sumAll'); if (el) el.textContent = formatCurrency(totalKet + totalGiao);
}

/** Collect all input values */
function _collectAll() {
  var pins = {}, keeps = {}, hands = {}, counts = {};
  for (var i = 0; i < denominations.length; i++) {
    var dv = denominations[i].value;
    var pin = parseInt(document.getElementById('pin_' + dv)?.value) || 0;
    var keep = parseInt(document.getElementById('keep_' + dv)?.value) || 0;
    var hand = parseInt(document.getElementById('hand_' + dv)?.value) || 0;
    if (pin > 0) pins[dv] = pin;
    if (keep > 0) keeps[dv] = keep;
    if (hand > 0) hands[dv] = hand;
    var total = pin + keep + hand;
    if (total > 0) counts[dv] = total;
  }
  return { pins: pins, keeps: keeps, hands: hands, counts: counts };
}

export function init() {
  // ± buttons
  document.querySelectorAll('[data-cc-btn]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var type = btn.dataset.ccBtn;
      var denom = btn.dataset.ccDenom;
      var dir = parseInt(btn.dataset.ccDir);
      var input = document.getElementById(type + '_' + denom);
      if (input) {
        input.value = Math.max(0, (parseInt(input.value) || 0) + dir);
        _recalc();
      }
    });
  });

  // Direct input change
  document.querySelectorAll('.cc-num-input').forEach(function(input) {
    input.addEventListener('input', _recalc);
  });

  // Reset
  document.getElementById('btnResetCount')?.addEventListener('click', function() {
    document.querySelectorAll('.cc-num-input').forEach(function(input) {
      // Don't reset pins — they're persistent
      if (input.dataset.ccType !== 'pin') input.value = 0;
    });
    _recalc();
    showToast('Đã đặt lại (ghim két giữ nguyên)', 'info');
  });

  // Save
  document.getElementById('btnSaveCashCount')?.addEventListener('click', function() {
    var data = _collectAll();
    // Save pins to localStorage for next-shift persistence
    _savePersistentPins(data.pins);
    try {
      updateCashCount(data.counts, data.pins, data.keeps, data.hands);
      showToast('✅ Đã lưu kiểm kê tiền mặt', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}
