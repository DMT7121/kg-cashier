/* ── History View (Enhanced w/ Search & Cloud) ── */
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
    const sm = getShiftSummary(sh);
    return `
      <div class="history-card">
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
          <div><span class="text-muted">Bills</span><strong>${sm.billCount}</strong></div>
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
  const sm = getShiftSummary(sh);

  showModal(`
    <div class="modal-title" style="font-size:16px;">Ca ${sh.shiftNumber} — ${sh.cashierName} — ${formatDate(sh.date)}</div>
    <div style="max-height:60vh;overflow:auto;">
      <table class="report-table" style="margin-bottom:12px;">
        <tr><td>Thời gian</td><td>${formatTime(sh.startTime)} → ${formatTime(sh.endTime)}</td></tr>
        <tr><td>Tiền đầu ca</td><td>${formatCurrency(sh.startingCash)}</td></tr>
        <tr><td>Doanh thu</td><td class="amount-in">${formatCurrency(sm.totalIncome)}</td></tr>
        <tr><td>Chi phí</td><td class="amount-out">${formatCurrency(sm.totalExpense)}</td></tr>
        <tr><td>TM kỳ vọng</td><td>${formatCurrency(sm.expectedCash)}</td></tr>
        <tr><td>TM kiểm kê</td><td>${formatCurrency(sm.cashCountTotal)}</td></tr>
        <tr><td><strong>Chênh lệch</strong></td><td style="color:${sm.discrepancy === 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${formatCurrency(sm.discrepancy)}</strong></td></tr>
        ${(sh.cashToKeep || 0) > 0 ? '<tr><td>Tiền giữ lại</td><td>' + formatCurrency(sh.cashToKeep) + '</td></tr>' : ''}
        ${(sh.cashToDeposit || 0) > 0 ? '<tr><td>Tiền bàn giao</td><td>' + formatCurrency(sh.cashToDeposit) + '</td></tr>' : ''}
      </table>

      ${(sh.transactions || []).length > 0 ? `
        <h4 style="margin:12px 0 8px;">Giao dịch (${sh.transactions.length})</h4>
        <table class="report-table">
          ${sh.transactions.map(tx => `<tr><td>${formatTime(tx.timestamp)}</td><td>${tx.category}</td><td class="${tx.type === 'income' ? 'amount-in' : 'amount-out'}">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</td></tr>`).join('')}
        </table>` : ''}

      ${sh.notes ? `<p style="margin-top:12px;"><strong>Ghi chú:</strong> ${sh.notes}</p>` : ''}
    </div>
    <div class="modal-footer" style="margin-top:12px;">
      <button class="btn btn-outline" onclick="window.hideModal()">Đóng</button>
    </div>
  `);
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
