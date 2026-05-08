/* ── History View (Enhanced w/ CUKCUK invoice data + Handover report) ── */
import { getShiftHistory, deleteShiftFromHistory, getShiftSummary, saveShiftToHistory } from '../store.js';
import { getShiftsFromCloud } from '../api.js';
import { formatCurrency, formatDate, formatTime, showToast, showModal, hideModal, showConfirm, denominations } from '../utils.js';

let allHistory = [];
let cloudHistory = [];

export function render() {
  const local = getShiftHistory();
  allHistory = local;

  return `
    <div class="section-header">
      <div>
        <h3>📚 Lịch sử ca</h3>
        <p>Xem lại và tìm kiếm ca đã đóng</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnSyncHistory">
          <span class="material-symbols-rounded">cloud_sync</span> Đồng bộ Cloud
        </button>
        <button class="btn btn-outline btn-sm" id="btnExportHistory">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group" style="flex:2;">
        <input type="text" id="historySearch" class="form-input" placeholder="🔍 Tìm theo tên thu ngân, ngày, ghi chú...">
      </div>
      <div class="form-group" style="flex:1;">
        <select id="historyFilter" class="form-input">
          <option value="">Tất cả</option>
          <option value="1">Ca 1</option>
          <option value="2">Ca 2</option>
          <option value="3">Ca 3</option>
        </select>
      </div>
    </div>

    <div id="historyList">
      ${_renderHistoryCards(local)}
    </div>
  `;
}

function _renderHistoryCards(shifts) {
  if (shifts.length === 0) {
    return '<div class="empty-state" style="padding:40px;"><span class="material-symbols-rounded empty-icon">history</span><h3>Chưa có lịch sử</h3><p>Các ca đã đóng sẽ hiện ở đây</p></div>';
  }

  return shifts.map(sh => {
    // getShiftSummary now includes CUKCUK invoices from invoiceStore
    const sm = getShiftSummary(sh);
    return `
      <div class="history-card" data-shift-id="${sh.id}">
        <div class="history-header">
          <div>
            <h4>Ca ${sh.shiftNumber} — ${sh.cashierName}</h4>
            <span class="text-muted">${formatDate(sh.date)} · ${formatTime(sh.startTime)} → ${formatTime(sh.endTime)}</span>
          </div>
          <div class="history-actions">
            <button class="btn btn-outline btn-sm" data-view-shift="${sh.id}" title="Xem chi tiết">
              <span class="material-symbols-rounded">visibility</span>
            </button>
            <button class="btn-icon" data-delete-shift="${sh.id}" title="Xóa" style="color:var(--danger);">
              <span class="material-symbols-rounded">delete</span>
            </button>
          </div>
        </div>
        <div class="history-stats">
          <div><span class="text-muted">Doanh thu</span><strong class="amount-in">${formatCurrency(sm.totalIncome)}</strong></div>
          <div><span class="text-muted">Chi phí</span><strong class="amount-out">${formatCurrency(sm.totalExpense)}</strong></div>
          <div><span class="text-muted">Bills</span><strong>${sm.billCount}${sm.cukcukBills > 0 ? ' <span style="font-size:10px;color:#10b981;">(' + sm.cukcukBills + ' POS)</span>' : ''}</strong></div>
          <div><span class="text-muted">Chênh lệch</span><strong style="color:${sm.discrepancy === 0 ? 'var(--success)' : 'var(--danger)'};">${sm.discrepancy === 0 ? '✅ 0' : formatCurrency(sm.discrepancy)}</strong></div>
        </div>
        ${sh.notes ? `<p class="text-muted" style="margin-top:8px;font-size:12px;">📝 ${sh.notes}</p>` : ''}
      </div>
    `;
  }).join('');
}

function _showShiftDetail(shiftId) {
  const sh = allHistory.find(s => s.id === shiftId) || cloudHistory.find(s => s.id === shiftId);
  if (!sh) return;
  // getShiftSummary now includes CUKCUK data from invoiceStore
  const sm = getShiftSummary(sh);
  _renderShiftDetailModal(sh, sm);
}

function _renderShiftDetailModal(sh, sm) {
  var fc = formatCurrency;

  // Extract detailed transaction lists from shift.transactions
  var manualIncomeTxs = (sh.transactions || []).filter(function(t) {
    return t.type === 'income' && (!t.note || t.note.indexOf('[CUKCUK]') === -1);
  });
  var expenseTxs = (sh.transactions || []).filter(function(t) { return t.type === 'expense'; });
  var otherTxs = sh.otherTransactions || [];

  var totalManualIncome = manualIncomeTxs.reduce(function(s, t) { return s + t.amount; }, 0);
  var totalExpenseAmt = expenseTxs.reduce(function(s, t) { return s + t.amount; }, 0);

  showModal(`
    <div class="modal-title" style="font-size:16px;">
      <span class="material-symbols-rounded" style="color:var(--primary);">summarize</span>
      Ca ${sh.shiftNumber} — ${sh.cashierName} — ${formatDate(sh.date)}
    </div>
    <div style="max-height:65vh;overflow:auto;padding:4px 0;">

      <!-- SHIFT INFO -->
      <table class="report-table" style="margin-bottom:12px;">
        <tr><td>Thời gian</td><td>${formatTime(sh.startTime)} → ${sh.endTime ? formatTime(sh.endTime) : '(đang mở)'}</td></tr>
        <tr><td>Tiền đầu ca</td><td>${fc(sh.startingCash)}</td></tr>
      </table>

      <!-- CUKCUK REVENUE -->
      ${sm.cukcukBills > 0 ? `
      <h4 style="margin:12px 0 4px;color:#10b981;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-rounded" style="font-size:16px;">point_of_sale</span>
        Doanh thu CUKCUK (${sm.cukcukBills} bill) — ${fc(sm.cukcukRevenue)}
      </h4>
      <table class="report-table">
        <tr><td>💵 Tiền mặt (POS)</td><td class="text-right" style="color:var(--success);">${fc(sm.cashIncome - manualIncomeTxs.filter(function(t) { return (t.paymentMethod || 'cash') === 'cash'; }).reduce(function(s, t) { return s + t.amount; }, 0))}</td></tr>
        <tr><td>💳 Quẹt thẻ (POS)</td><td class="text-right" style="color:var(--info);">${fc(sm.cardIncome - manualIncomeTxs.filter(function(t) { return t.paymentMethod === 'card'; }).reduce(function(s, t) { return s + t.amount; }, 0))}</td></tr>
        <tr><td>🏦 Chuyển khoản (POS)</td><td class="text-right" style="color:var(--primary);">${fc(sm.transferIncome - manualIncomeTxs.filter(function(t) { return t.paymentMethod === 'transfer'; }).reduce(function(s, t) { return s + t.amount; }, 0))}</td></tr>
      </table>
      ` : ''}

      <!-- MANUAL INCOME -->
      ${manualIncomeTxs.length > 0 ? `
      <h4 style="margin:12px 0 4px;color:#16a34a;">✍️ Thu ngoài POS (${manualIncomeTxs.length})</h4>
      <table class="report-table">
        ${manualIncomeTxs.map(t => `<tr><td>${t.category}${t.note ? ' — ' + t.note : ''}</td><td class="text-right" style="color:#16a34a;">+${fc(t.amount)}</td></tr>`).join('')}
        <tr style="border-top:2px solid var(--border);"><td><strong>Tổng thu ngoài</strong></td><td class="text-right"><strong>+${fc(totalManualIncome)}</strong></td></tr>
      </table>
      ` : ''}

      <!-- EXPENSES -->
      ${expenseTxs.length > 0 ? `
      <h4 style="margin:12px 0 4px;color:#dc2626;">💸 Chi phí trong ca (${expenseTxs.length})</h4>
      <table class="report-table">
        ${expenseTxs.map(t => `<tr><td>${t.category}${t.note ? ' — ' + t.note : ''}</td><td class="text-right" style="color:#dc2626;">−${fc(t.amount)}</td></tr>`).join('')}
        <tr style="border-top:2px solid var(--border);"><td><strong>Tổng chi</strong></td><td class="text-right"><strong style="color:#dc2626;">−${fc(totalExpenseAmt)}</strong></td></tr>
      </table>
      ` : ''}

      <!-- OTHER TRANSACTIONS -->
      ${otherTxs.length > 0 ? `
      <h4 style="margin:12px 0 4px;color:var(--warning);">📝 Thu chi khác (${otherTxs.length})</h4>
      <table class="report-table">
        ${otherTxs.map(t => `<tr><td>${t.category}${t.note ? ' — ' + t.note : ''}</td><td class="text-right" style="color:${t.type === 'income' ? '#16a34a' : '#dc2626'};">${t.type === 'income' ? '+' : '−'}${fc(t.amount)}</td></tr>`).join('')}
      </table>
      ` : ''}

      <!-- SUMMARY -->
      <h4 style="margin:16px 0 4px;color:var(--primary);">📊 Tổng kết</h4>
      <table class="report-table" style="background:rgba(99,102,241,.04);border-radius:8px;">
        <tr><td><strong>TỔNG DOANH THU (${sm.billCount} bill)</strong></td><td class="text-right"><strong style="color:var(--success);font-size:15px;">${fc(sm.totalIncome)}</strong></td></tr>
        <tr><td>Chi phí trong ca</td><td class="text-right" style="color:#dc2626;">−${fc(sm.totalExpense)}</td></tr>
        <tr><td>Tiền đầu ca</td><td class="text-right">${fc(sh.startingCash)}</td></tr>
        <tr style="border-top:2px solid var(--border);"><td><strong>TM kỳ vọng</strong></td><td class="text-right"><strong>${fc(sm.expectedCash)}</strong></td></tr>
        <tr><td>TM kiểm kê thực tế</td><td class="text-right">${fc(sm.cashCountTotal)}</td></tr>
        <tr style="background:${Math.abs(sm.discrepancy) > 0 ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)'};"><td><strong>CHÊNH LỆCH</strong></td><td class="text-right"><strong style="color:${sm.discrepancy === 0 ? 'var(--success)' : 'var(--danger)'};">${sm.discrepancy === 0 ? '✓ 0 đ' : (sm.discrepancy > 0 ? '+' : '') + fc(sm.discrepancy)}</strong></td></tr>
      </table>

      <!-- CASH BREAKDOWN (Ghim/Giữ/Giao) -->
      ${(function() {
        var pc = sh.pinnedCash || {};
        var kc = sh.keepCash || {};
        var hc = sh.handoverCash || {};
        var hasData = Object.keys(pc).length > 0 || Object.keys(kc).length > 0 || Object.keys(hc).length > 0;
        if (!hasData) return '';
        var ketHtml = '', handHtml = '';
        var ketTotal = 0, handTotal = 0;
        for (var i = 0; i < denominations.length; i++) {
          var dv = denominations[i].value;
          var dl = denominations[i].label;
          var pq = pc[dv] || 0;
          var kq = kc[dv] || 0;
          var hq = hc[dv] || 0;
          var ketQ = pq + kq;
          if (ketQ > 0) {
            var det = (pq > 0 && kq > 0) ? ' (' + pq + ' ghim + ' + kq + ' giữ)' : (pq > 0 ? ' (ghim)' : ' (giữ)');
            ketHtml += '<tr><td>' + ketQ + ' x ' + dl + det + '</td><td class="text-right">' + fc(dv * ketQ) + '</td></tr>';
            ketTotal += dv * ketQ;
          }
          if (hq > 0) { handHtml += '<tr><td>' + hq + ' x ' + dl + '</td><td class="text-right">' + fc(dv * hq) + '</td></tr>'; handTotal += dv * hq; }
        }
        var out = '';
        if (ketHtml) out += '<h4 style="margin:12px 0 4px;color:var(--primary);">📌 Tiền két (giữ lại)</h4><table class="report-table">' + ketHtml + '<tr style="border-top:2px solid var(--border);"><td><strong>Tổng két</strong></td><td class="text-right"><strong>' + fc(ketTotal) + '</strong></td></tr></table>';
        if (handHtml) out += '<h4 style="margin:12px 0 4px;color:var(--success);">🤝 Tiền bàn giao</h4><table class="report-table">' + handHtml + '<tr style="border-top:2px solid var(--border);"><td><strong>Tổng bàn giao</strong></td><td class="text-right"><strong>' + fc(handTotal) + '</strong></td></tr></table>';
        return out;
      })()}

      ${sh.notes ? `<p style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;"><strong>📝 Ghi chú:</strong> ${sh.notes}</p>` : ''}
    </div>
    <div class="modal-footer" style="margin-top:12px;">
      <button class="btn btn-outline" onclick="window.hideModal()">Đóng</button>
      <button class="btn btn-primary btn-sm" id="btnOpenHandoverReport" data-shift-date="${sh.date}">
        <span class="material-symbols-rounded">print</span> Mở phiếu bàn giao
      </button>
    </div>
  `);

  // Bind "Mở phiếu bàn giao" button
  setTimeout(function() {
    var btn = document.getElementById('btnOpenHandoverReport');
    if (btn) {
      btn.addEventListener('click', function() {
        var shiftDate = btn.dataset.shiftDate;
        hideModal();
        // Navigate to report view with the shift's date pre-selected
        if (window._setReportDate) {
          window._setReportDate(shiftDate);
        }
        window.navigateTo('report');
      });
    }
  }, 100);
}

function _filterHistory() {
  const q = document.getElementById('historySearch')?.value.toLowerCase() || '';
  const shift = document.getElementById('historyFilter')?.value || '';
  let filtered = allHistory;
  if (q) filtered = filtered.filter(sh => (sh.cashierName + sh.date + sh.notes).toLowerCase().includes(q));
  if (shift) filtered = filtered.filter(sh => String(sh.shiftNumber) === shift);
  const el = document.getElementById('historyList');
  if (el) el.innerHTML = _renderHistoryCards(filtered);
  _bindHistoryEvents();
}

function _bindHistoryEvents() {
  document.querySelectorAll('[data-view-shift]').forEach(btn =>
    btn.addEventListener('click', () => _showShiftDetail(btn.dataset.viewShift))
  );
  document.querySelectorAll('[data-delete-shift]').forEach(btn =>
    btn.addEventListener('click', async () => {
      var ok = await showConfirm('Xóa ca này khỏi lịch sử?', { title: 'Xóa ca', confirmText: 'Xóa', type: 'danger' });
      if (ok) {
        deleteShiftFromHistory(btn.dataset.deleteShift);
        showToast('Đã xóa', 'info');
        allHistory = getShiftHistory();
        _filterHistory();
      }
    })
  );
}

export function init() {
  _bindHistoryEvents();
  document.getElementById('historySearch')?.addEventListener('input', _filterHistory);
  document.getElementById('historyFilter')?.addEventListener('change', _filterHistory);

  document.getElementById('btnSyncHistory')?.addEventListener('click', async () => {
    showToast('Đang đồng bộ...', 'info');
    const result = await getShiftsFromCloud();
    if (result.success && result.shifts) {
      cloudHistory = result.shifts;
      // Merge unique — persist new cloud shifts to local store
      const localIds = new Set(allHistory.map(s => s.id));
      const newFromCloud = result.shifts.filter(s => !localIds.has(s.id));
      newFromCloud.forEach(s => {
        try { saveShiftToHistory(s); } catch(e) { /* ignore if not available */ }
      });
      allHistory = [...allHistory, ...newFromCloud];
      _filterHistory();
      showToast(`Đã đồng bộ ${result.shifts.length} ca từ Cloud`, 'success');
    } else {
      showToast('Không thể đồng bộ: ' + (result.message || 'Lỗi'), 'error');
    }
  });

  document.getElementById('btnExportHistory')?.addEventListener('click', () => {
    if (allHistory.length === 0) { showToast('Không có dữ liệu', 'warning'); return; }
    let csv = 'Ngày,Ca,Thu ngân,Doanh thu,Chi phí,Bills,Chênh lệch,Ghi chú\n';
    allHistory.forEach(sh => {
      const sm = getShiftSummary(sh);
      csv += `"${sh.date}","${sh.shiftNumber}","${(sh.cashierName || '').replace(/"/g, '""')}",${sm.totalIncome},${sm.totalExpense},${sm.billCount},${sm.discrepancy},"${(sh.notes || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    a.href = blobUrl;
    a.download = `shift-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  });
}
