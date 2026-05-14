/* ── Cash Count View — Ghim + Giữ + Giao + Discrepancy + Long-press ── */
import { getCurrentShift, getShiftSummary, updateCashCount, getShiftHistory } from '../store.js';
import { formatCurrency, denominations, showToast } from '../utils.js';

var PIN_KEY = 'kg_cashier_pinned_cash';
var _longPressTimers = [];

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

/** Get ghim from last closed shift for auto carry-forward */
function _getLastShiftGhim() {
  try {
    var history = getShiftHistory();
    if (history.length > 0) {
      var last = history[0];
      return last.pinnedCash || {};
    }
  } catch(e) { /* ignore */ }
  return {};
}

/** Build a ± input group HTML — bigger buttons */
function _inputGroup(prefix, denom, value, color) {
  var id = prefix + '_' + denom;
  return '<div class="cc-input-group cc-input-group-wide">' +
    '<button class="btn-icon denom-btn denom-btn-lg" data-cc-btn="' + prefix + '" data-cc-denom="' + denom + '" data-cc-dir="-1"><span class="material-symbols-rounded">remove</span></button>' +
    '<input type="number" class="cc-num-input cc-num-wide" id="' + id + '" data-cc-type="' + prefix + '" data-cc-denom="' + denom + '" value="' + value + '" min="0" style="border-color:' + (color || 'var(--border)') + ';">' +
    '<button class="btn-icon denom-btn denom-btn-lg" data-cc-btn="' + prefix + '" data-cc-denom="' + denom + '" data-cc-dir="1"><span class="material-symbols-rounded">add</span></button>' +
  '</div>';
}

export function render() {
  var shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">calculate</span><h2>Chưa mở ca</h2><p>Mở ca để kiểm kê tiền mặt</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  // Load data: from shift (if saved) or defaults; auto carry-forward ghim
  var lastGhim = _getLastShiftGhim();
  var persistedPins = _loadPersistentPins();
  // Merge: shift > persisted > lastShift
  var savedPins = shift.pinnedCash || {};
  if (Object.keys(savedPins).length === 0) {
    savedPins = Object.keys(persistedPins).length > 0 ? persistedPins : lastGhim;
  }
  var savedKeep = shift.keepCash || {};
  var savedHandover = shift.handoverCash || {};
  var cc = shift.cashCount || {};

  // Calculate totals
  var totalKet = 0, totalGiao = 0, totalAll = 0;
  for (var i = 0; i < denominations.length; i++) {
    var dv = denominations[i].value;
    var pin = savedPins[dv] || 0;
    var keep = savedKeep[dv] || 0;
    var hand = savedHandover[dv] || 0;
    if (!shift.handoverCash && cc[dv] > 0) {
      hand = Math.max(0, (cc[dv] || 0) - pin - keep);
    }
    totalKet += dv * (pin + keep);
    totalGiao += dv * hand;
  }
  totalAll = totalKet + totalGiao;

  // Calculate expected cash for discrepancy
  var summary = getShiftSummary(shift);
  var expectedCash = summary ? summary.expectedCash : 0;
  var discrepancy = totalAll - expectedCash;

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

  var discColor = discrepancy === 0 ? 'var(--success)' : (Math.abs(discrepancy) <= 50000 ? 'var(--warning)' : 'var(--danger)');
  var discIcon = discrepancy === 0 ? 'check_circle' : (discrepancy > 0 ? 'arrow_upward' : 'arrow_downward');

  return '<div class="section-header">' +
    '<div><h3>💰 Kiểm kê tiền mặt</h3><p>Ghim (két cố định) + Giữ (thêm) = Tiền két. Giao = bàn giao.</p></div>' +
    '<button class="btn btn-outline btn-sm" id="btnResetCount"><span class="material-symbols-rounded">restart_alt</span> Đặt lại</button>' +
  '</div>' +
  '<div class="cc-denom-list">' + rows + '</div>' +

  // ═══ DISCREPANCY BAR (hiện TRƯỚC khi lưu) ═══
  '<div class="card" style="margin-top:16px;border:1px solid ' + discColor + ';background:linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.02) 100%);">' +
    '<div class="card-body" style="padding:12px 20px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;">' +
        '<div>' +
          '<div class="text-muted" style="font-size:11px;margin-bottom:4px;">💵 Tiền mặt kỳ vọng</div>' +
          '<div style="font-size:20px;font-weight:700;color:var(--info);" id="discExpected">' + formatCurrency(expectedCash) + '</div>' +
          '<div class="text-muted" style="font-size:10px;">= Đầu ca + TM thu − TM chi ± Khác</div>' +
        '</div>' +
        '<div>' +
          '<div class="text-muted" style="font-size:11px;margin-bottom:4px;">💰 Thực tế kiểm kê</div>' +
          '<div style="font-size:20px;font-weight:700;color:var(--text);" id="discActual">' + formatCurrency(totalAll) + '</div>' +
          '<div class="text-muted" style="font-size:10px;">Két + Giao</div>' +
        '</div>' +
        '<div>' +
          '<div class="text-muted" style="font-size:11px;margin-bottom:4px;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;color:' + discColor + ';">' + discIcon + '</span> Chênh lệch</div>' +
          '<div style="font-size:20px;font-weight:700;color:' + discColor + ';" id="discDiff">' + (discrepancy >= 0 ? '+' : '') + formatCurrency(discrepancy) + '</div>' +
          '<div class="text-muted" style="font-size:10px;">' + (discrepancy === 0 ? '✅ Khớp hoàn toàn' : (Math.abs(discrepancy) <= 50000 ? '⚠️ Chênh nhẹ' : '❌ Chênh nhiều')) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>' +

  '<div class="cc-summary-bar">' +
    '<div class="cc-summary-item cc-ket-bg"><span>📌🔒 Tiền két (giữ lại)</span><strong id="sumKet">' + formatCurrency(totalKet) + '</strong></div>' +
    '<div class="cc-summary-item cc-giao-bg"><span>🤝 Tiền bàn giao</span><strong id="sumGiao">' + formatCurrency(totalGiao) + '</strong></div>' +
    '<div class="cc-summary-item cc-total-bg"><span>💰 TỔNG KIỂM KÊ</span><strong id="sumAll">' + formatCurrency(totalAll) + '</strong></div>' +
  '</div>' +
  '<button class="btn btn-primary" style="width:100%;margin-top:16px;" id="btnSaveCashCount"><span class="material-symbols-rounded">save</span> Lưu kiểm kê</button>';
}

/** Recalculate all subtotals, totals, and discrepancy */
function _recalc() {
  var shift = getCurrentShift();
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

  var totalAll = totalKet + totalGiao;
  var el;
  el = document.getElementById('sumKet'); if (el) el.textContent = formatCurrency(totalKet);
  el = document.getElementById('sumGiao'); if (el) el.textContent = formatCurrency(totalGiao);
  el = document.getElementById('sumAll'); if (el) el.textContent = formatCurrency(totalAll);

  // Update discrepancy
  var summary = shift ? getShiftSummary(shift) : null;
  var expectedCash = summary ? summary.expectedCash : 0;
  var disc = totalAll - expectedCash;
  el = document.getElementById('discExpected'); if (el) el.textContent = formatCurrency(expectedCash);
  el = document.getElementById('discActual'); if (el) el.textContent = formatCurrency(totalAll);
  el = document.getElementById('discDiff');
  if (el) {
    var color = disc === 0 ? 'var(--success)' : (Math.abs(disc) <= 50000 ? 'var(--warning)' : 'var(--danger)');
    el.textContent = (disc >= 0 ? '+' : '') + formatCurrency(disc);
    el.style.color = color;
  }
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

/** Clear long-press timers */
function _clearLongPress() {
  for (var i = 0; i < _longPressTimers.length; i++) {
    clearTimeout(_longPressTimers[i]);
    clearInterval(_longPressTimers[i]);
  }
  _longPressTimers = [];
}

export function init() {
  // Signal to main.js that user is now on cash-count (not yet dirty)
  window._cashCountDirty = false;

  // ± buttons with LONG-PRESS support
  document.querySelectorAll('[data-cc-btn]').forEach(function(btn) {
    var handleClick = function() {
      var type = btn.dataset.ccBtn;
      var denom = btn.dataset.ccDenom;
      var dir = parseInt(btn.dataset.ccDir);
      var input = document.getElementById(type + '_' + denom);
      if (input) {
        input.value = Math.max(0, (parseInt(input.value) || 0) + dir);
        _recalc();
      }
    };

    // Mark dirty as soon as user interacts (before they save)
    btn.addEventListener('mousedown', function() { window._cashCountDirty = true; });
    btn.addEventListener('touchstart', function() { window._cashCountDirty = true; }, { passive: true });
    btn.addEventListener('click', handleClick);

    // Long-press: hold for 400ms → auto-increment every 120ms
    btn.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      var t1 = setTimeout(function() {
        var t2 = setInterval(handleClick, 120);
        _longPressTimers.push(t2);
      }, 400);
      _longPressTimers.push(t1);
    });
    btn.addEventListener('touchstart', function(e) {
      e.preventDefault();
      handleClick();
      var t1 = setTimeout(function() {
        var t2 = setInterval(handleClick, 120);
        _longPressTimers.push(t2);
      }, 400);
      _longPressTimers.push(t1);
    });
  });

  // Stop long-press on mouseup/touchend (global)
  var stopLongPress = function() { _clearLongPress(); };
  document.addEventListener('mouseup', stopLongPress);
  document.addEventListener('touchend', stopLongPress);
  document.addEventListener('touchcancel', stopLongPress);

  // Direct input change
  document.querySelectorAll('.cc-num-input').forEach(function(input) {
    input.addEventListener('input', function() {
      window._cashCountDirty = true;
      _recalc();
    });
  });

  // Reset
  var btnReset = document.getElementById('btnResetCount');
  if (btnReset) btnReset.addEventListener('click', function() {
    document.querySelectorAll('.cc-num-input').forEach(function(input) {
      if (input.dataset.ccType !== 'pin') input.value = 0;
    });
    _recalc();
    showToast('Đã đặt lại (ghim két giữ nguyên)', 'info');
  });

  // Save
  var btnSave = document.getElementById('btnSaveCashCount');
  if (btnSave) btnSave.addEventListener('click', function() {
    var data = _collectAll();
    _savePersistentPins(data.pins);
    try {
      updateCashCount(data.counts, data.pins, data.keeps, data.hands);
      window._cashCountDirty = false; // Saved — safe to auto-refresh now
      showToast('✅ Đã lưu kiểm kê tiền mặt', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}

export function destroy() {
  _clearLongPress();
  window._cashCountDirty = false; // Clear flag when leaving the view
}
