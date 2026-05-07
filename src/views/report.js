/* ═══════════════════════════════════════════════
   BÁO CÁO DOANH THU — Tabs: Hôm nay / Tuần / Tháng / Quý + Phiếu bàn giao
   ═══════════════════════════════════════════════ */
import { getCurrentShift, getSettings, getShiftHistory, getShiftSummary } from '../store.js';
import { formatCurrency, formatDate, formatTime, denominations, showToast } from '../utils.js';

var _activeTab = 'day'; // day | week | month | quarter
var _refDate = null;    // null = today/now, or Date object for custom period

// ── RENDER ──
export function render() {
  var settings = getSettings();
  var storeName = settings.storeName || "KING's GRILL";

  return `
    <div class="section-header">
      <div>
        <h3>📊 Báo cáo doanh thu — ${storeName}</h3>
        <p>Dữ liệu từ hệ thống CUKCUK POS</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnSyncSheets" title="Đẩy dữ liệu lên Google Sheets">
          <span class="material-symbols-rounded">cloud_upload</span> Đẩy lên Sheets
        </button>
      </div>
    </div>

    <!-- TABS -->
    <div class="rpt-tabs">
      <button class="rpt-tab ${_activeTab === 'day' ? 'active' : ''}" data-rpt-tab="day">
        <span class="material-symbols-rounded" style="font-size:16px;">today</span> Hôm nay
      </button>
      <button class="rpt-tab ${_activeTab === 'week' ? 'active' : ''}" data-rpt-tab="week">
        <span class="material-symbols-rounded" style="font-size:16px;">date_range</span> Tuần
      </button>
      <button class="rpt-tab ${_activeTab === 'month' ? 'active' : ''}" data-rpt-tab="month">
        <span class="material-symbols-rounded" style="font-size:16px;">calendar_month</span> Tháng
      </button>
      <button class="rpt-tab ${_activeTab === 'quarter' ? 'active' : ''}" data-rpt-tab="quarter">
        <span class="material-symbols-rounded" style="font-size:16px;">event_note</span> Quý
      </button>
    </div>

    <!-- DATE PICKER -->
    <div id="rptDatePicker" style="margin-bottom:16px;"></div>

    <!-- TAB CONTENT -->
    <div id="rptContent">
      <div class="skeleton skeleton-card" style="min-height:200px;margin:16px 0;"></div>
    </div>
  `;
}

export function init() {
  // Tab click
  document.querySelectorAll('[data-rpt-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _activeTab = btn.dataset.rptTab;
      _refDate = null; // Reset to current period on tab switch
      document.querySelectorAll('.rpt-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _renderDatePicker();
      _renderTabContent();
    });
  });

  // Sync to sheets
  document.getElementById('btnSyncSheets')?.addEventListener('click', _handleSyncSheets);

  // Initial render
  _renderDatePicker();
  _renderTabContent();
}

// ── Date Picker per tab ──
function _renderDatePicker() {
  var container = document.getElementById('rptDatePicker');
  if (!container) return;

  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var refStr = _refDate ? _refDate.getFullYear() + '-' + String(_refDate.getMonth()+1).padStart(2,'0') + '-' + String(_refDate.getDate()).padStart(2,'0') : todayStr;

  var html = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';

  if (_activeTab === 'day') {
    html += '<span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">calendar_today</span>';
    html += '<input type="date" id="rptDateInput" class="form-input" style="width:auto;padding:6px 12px;font-size:13px;" value="' + refStr + '">';
    html += '<button class="btn btn-outline btn-sm" id="rptToday">Hôm nay</button>';
  } else if (_activeTab === 'week') {
    html += '<span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">date_range</span>';
    html += '<input type="week" id="rptWeekInput" class="form-input" style="width:auto;padding:6px 12px;font-size:13px;">';
    html += '<button class="btn btn-outline btn-sm" id="rptPrevWeek" title="Tuần trước"><span class="material-symbols-rounded" style="font-size:16px;">chevron_left</span></button>';
    html += '<button class="btn btn-outline btn-sm" id="rptNextWeek" title="Tuần sau"><span class="material-symbols-rounded" style="font-size:16px;">chevron_right</span></button>';
    html += '<button class="btn btn-outline btn-sm" id="rptThisWeek">Tuần này</button>';
  } else if (_activeTab === 'month') {
    html += '<span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">calendar_month</span>';
    html += '<input type="month" id="rptMonthInput" class="form-input" style="width:auto;padding:6px 12px;font-size:13px;" value="' + refStr.substring(0,7) + '">';
    html += '<button class="btn btn-outline btn-sm" id="rptThisMonth">Tháng này</button>';
  } else if (_activeTab === 'quarter') {
    var qMonth = _refDate ? _refDate.getMonth() : today.getMonth();
    var qYear = _refDate ? _refDate.getFullYear() : today.getFullYear();
    var currentQ = Math.floor(qMonth / 3) + 1;
    html += '<span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">event_note</span>';
    html += '<select id="rptQuarterInput" class="form-input" style="width:auto;padding:6px 12px;font-size:13px;">';
    for (var q = 1; q <= 4; q++) {
      html += '<option value="' + q + '" ' + (q === currentQ ? 'selected' : '') + '>Quý ' + q + '</option>';
    }
    html += '</select>';
    html += '<input type="number" id="rptQuarterYear" class="form-input" style="width:80px;padding:6px 12px;font-size:13px;" value="' + qYear + '" min="2020" max="2030">';
    html += '<button class="btn btn-outline btn-sm" id="rptThisQuarter">Quý này</button>';
  }

  html += '</div>';
  container.innerHTML = html;
  _bindDatePickerEvents();
}

function _bindDatePickerEvents() {
  var el;
  // Day
  el = document.getElementById('rptDateInput');
  if (el) el.addEventListener('change', function() { _refDate = new Date(el.value + 'T12:00:00'); _renderTabContent(); });
  el = document.getElementById('rptToday');
  if (el) el.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Week
  el = document.getElementById('rptWeekInput');
  if (el) el.addEventListener('change', function() {
    var parts = el.value.split('-W');
    if (parts.length === 2) { _refDate = _weekToDate(parseInt(parts[0]), parseInt(parts[1])); _renderTabContent(); }
  });
  el = document.getElementById('rptPrevWeek');
  if (el) el.addEventListener('click', function() { _shiftWeek(-1); });
  el = document.getElementById('rptNextWeek');
  if (el) el.addEventListener('click', function() { _shiftWeek(1); });
  el = document.getElementById('rptThisWeek');
  if (el) el.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Month
  el = document.getElementById('rptMonthInput');
  if (el) el.addEventListener('change', function() { _refDate = new Date(el.value + '-15T12:00:00'); _renderTabContent(); });
  el = document.getElementById('rptThisMonth');
  if (el) el.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Quarter
  el = document.getElementById('rptQuarterInput');
  var yearEl = document.getElementById('rptQuarterYear');
  if (el) el.addEventListener('change', function() { _applyQuarter(); });
  if (yearEl) yearEl.addEventListener('change', function() { _applyQuarter(); });
  el = document.getElementById('rptThisQuarter');
  if (el) el.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
}

function _applyQuarter() {
  var qEl = document.getElementById('rptQuarterInput');
  var yEl = document.getElementById('rptQuarterYear');
  if (qEl && yEl) {
    var q = parseInt(qEl.value);
    var y = parseInt(yEl.value);
    _refDate = new Date(y, (q - 1) * 3, 15, 12, 0, 0);
    _renderTabContent();
  }
}

function _shiftWeek(delta) {
  var ref = _refDate || new Date();
  ref = new Date(ref);
  ref.setDate(ref.getDate() + delta * 7);
  _refDate = ref;
  _renderDatePicker();
  _renderTabContent();
}

function _weekToDate(year, week) {
  var jan1 = new Date(year, 0, 1);
  var days = (week - 1) * 7;
  jan1.setDate(jan1.getDate() + days);
  return jan1;
}

// ── Render tab content ──
function _renderTabContent() {
  var container = document.getElementById('rptContent');
  if (!container) return;

  // Show skeleton
  container.innerHTML = '<div class="skeleton skeleton-card" style="min-height:200px;"></div>';

  import('../integration/invoiceStore.js').then(function(store) {
    var rev = store.getRevenueSummary(_activeTab, _refDate);
    var daily = store.getDailyBreakdown(_activeTab, _refDate);
    var unpushed = store.getUnpushedInvoices().length;

    var html = _buildRevenueReport(rev, daily, unpushed);

    // Tab "Ngày" → thêm Phiếu bàn giao ca (cho ngày được chọn)
    if (_activeTab === 'day') {
      html += '<div style="margin-top:24px;border-top:2px solid var(--border);padding-top:20px;"></div>';
      html += _buildHandoverHTML(rev);
    }

    container.innerHTML = html;
    _bindPrintButtons();
  }).catch(function() {
    container.innerHTML = '<div class="empty-state"><p>Không tải được dữ liệu</p></div>';
  });
}

// ── Build revenue report HTML ──
function _buildRevenueReport(rev, daily, unpushedCount) {
  var fc = formatCurrency;

  var periodLabels = { day: 'Báo cáo ngày', week: 'Báo cáo tuần', month: 'Báo cáo tháng', quarter: 'Báo cáo quý' };
  var title = periodLabels[_activeTab] || 'Báo cáo';

  return `
    <!-- HEADER + PRINT -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--text);">${title}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">📅 ${rev.periodLabel} ${rev.firstDate && rev.lastDate ? '(' + _fmtDateVN(rev.firstDate) + ' → ' + _fmtDateVN(rev.lastDate) + ')' : ''}
          ${unpushedCount > 0 ? '<span style="margin-left:8px;color:var(--warning);">⚠ ' + unpushedCount + ' chưa đẩy lên Sheets</span>' : ''}
        </div>
      </div>
      <button class="btn btn-outline btn-sm" id="btnPrintReport">
        <span class="material-symbols-rounded">print</span> In báo cáo
      </button>
    </div>

    <!-- STAT CARDS -->
    <div class="stats-grid" style="margin-bottom:16px;">
      <div class="stat-card stat-success">
        <div class="stat-icon"><span class="material-symbols-rounded">payments</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng doanh thu</span>
          <span class="stat-value">${fc(rev.totalRevenue)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${rev.totalBills} bill · TB/bill: ${fc(rev.avgPerBill)}</span>
        </div>
      </div>
      <div class="stat-card" style="border-left-color:#22c55e;">
        <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22c55e;"><span class="material-symbols-rounded">money</span></div>
        <div class="stat-info">
          <span class="stat-label">💵 Tiền mặt</span>
          <span class="stat-value">${fc(rev.totalCash)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${rev.totalRevenue > 0 ? Math.round(rev.totalCash / rev.totalRevenue * 100) : 0}%</span>
        </div>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-icon"><span class="material-symbols-rounded">credit_card</span></div>
        <div class="stat-info">
          <span class="stat-label">💳 Quẹt thẻ</span>
          <span class="stat-value">${fc(rev.totalCard)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${rev.totalRevenue > 0 ? Math.round(rev.totalCard / rev.totalRevenue * 100) : 0}%</span>
        </div>
      </div>
      <div class="stat-card" style="border-left-color:#a855f7;">
        <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#a855f7;"><span class="material-symbols-rounded">swap_horiz</span></div>
        <div class="stat-info">
          <span class="stat-label">🏦 Chuyển khoản</span>
          <span class="stat-value">${fc(rev.totalTransfer)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${rev.totalRevenue > 0 ? Math.round(rev.totalTransfer / rev.totalRevenue * 100) : 0}%</span>
        </div>
      </div>
    </div>

    <!-- AVG DAILY -->
    ${rev.daysWithData > 1 ? '<div style="text-align:center;padding:10px;background:var(--bg-secondary);border-radius:10px;margin-bottom:16px;font-size:13px;"><span class="text-muted">TB/ngày:</span> <strong style="color:var(--primary);font-size:16px;">' + fc(rev.avgDaily) + '</strong> <span class="text-muted">(' + rev.daysWithData + ' ngày có dữ liệu)</span></div>' : ''}

    <!-- DAILY BREAKDOWN TABLE -->
    <div class="card">
      <div class="card-header"><h3>📅 Chi tiết theo ngày</h3></div>
      <div class="card-body" style="padding:0;">
        <div style="overflow-x:auto;">
          <table class="rpt-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th class="r">Bill</th>
                <th class="r">💵 TM</th>
                <th class="r">💳 Thẻ</th>
                <th class="r">🏦 CK</th>
                <th class="r">Tổng</th>
              </tr>
            </thead>
            <tbody>
              ${daily.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">Chưa có dữ liệu CUKCUK cho kỳ này</td></tr>' :
                daily.map(function(d) {
                  return '<tr>' +
                    '<td><strong>' + _fmtDateVN(d.date) + '</strong></td>' +
                    '<td class="r">' + d.bills + '</td>' +
                    '<td class="r">' + fc(d.cash) + '</td>' +
                    '<td class="r">' + fc(d.card) + '</td>' +
                    '<td class="r">' + fc(d.transfer) + '</td>' +
                    '<td class="r"><strong style="color:var(--success);">' + fc(d.total) + '</strong></td>' +
                  '</tr>';
                }).join('')}
            </tbody>
            ${daily.length > 0 ? '<tfoot><tr style="border-top:2px solid var(--border);background:rgba(232,168,56,.05);"><td><strong>TỔNG</strong></td><td class="r"><strong>' + rev.totalBills + '</strong></td><td class="r"><strong>' + fc(rev.totalCash) + '</strong></td><td class="r"><strong>' + fc(rev.totalCard) + '</strong></td><td class="r"><strong>' + fc(rev.totalTransfer) + '</strong></td><td class="r"><strong style="color:var(--primary);font-size:15px;">' + fc(rev.totalRevenue) + '</strong></td></tr></tfoot>' : ''}
          </table>
        </div>
      </div>
    </div>
  `;
}

// ── Build handover HTML (returns string) ──
function _buildHandoverHTML(revSummary) {
  // Use revSummary from invoiceStore (already filtered by selected date)
  var cukcukRev = {
    total: revSummary ? revSummary.totalRevenue : 0,
    cash: revSummary ? revSummary.totalCash : 0,
    card: revSummary ? revSummary.totalCard : 0,
    transfer: revSummary ? revSummary.totalTransfer : 0,
    bills: revSummary ? revSummary.totalBills : 0
  };

  // Try to find shift for the selected date
  var selectedDateStr = _refDate ? _refDate.getFullYear() + '-' + String(_refDate.getMonth()+1).padStart(2,'0') + '-' + String(_refDate.getDate()).padStart(2,'0') : null;
  var shift = getCurrentShift();
  var history = getShiftHistory();
  var target = null;

  if (!selectedDateStr || (shift && shift.date === selectedDateStr)) {
    // Today or current shift matches
    target = shift || (history.length > 0 ? history[0] : null);
  } else {
    // Find shift for selected date in history
    for (var hi = 0; hi < history.length; hi++) {
      if (history[hi].date === selectedDateStr) { target = history[hi]; break; }
    }
    if (!target) target = shift; // fallback
  }

  if (!target) {
    return '<div class="empty-state" style="padding:30px;"><span class="material-symbols-rounded empty-icon">summarize</span><h2>Chưa có dữ liệu ca</h2><p>Mở ca hoặc đóng ca để tạo phiếu bàn giao</p></div>';
  }

  var settings = getSettings();
  var txs = target.transactions || [];
  var otherTxs = target.otherTransactions || [];
  var manualIncomeTxs = txs.filter(function(t) { return t.type === 'income' && (!t.note || t.note.indexOf('[CUKCUK]') === -1); });
  var expenseTxs = txs.filter(function(t) { return t.type === 'expense'; });

  var totalManualIncome = manualIncomeTxs.reduce(function(s, t) { return s + t.amount; }, 0);
  var totalExpenseAmt = expenseTxs.reduce(function(s, t) { return s + t.amount; }, 0);
  var manualCash = manualIncomeTxs.filter(function(t) { return (t.paymentMethod || 'cash') === 'cash'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var otherIncomeAmt = otherTxs.filter(function(t) { return t.type === 'income'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var otherExpenseAmt = otherTxs.filter(function(t) { return t.type === 'expense'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var cc = target.cashCount || {};
  var cashCountTotal = denominations.reduce(function(s, d) { return s + (d.value * (cc[d.value] || 0)); }, 0);
  var expectedCash = (target.startingCash || 0) + manualCash + cukcukRev.cash - totalExpenseAmt + otherIncomeAmt - otherExpenseAmt;
  var combinedIncome = cukcukRev.total + totalManualIncome;
  var billCount = cukcukRev.bills + manualIncomeTxs.length;
  var discrepancy = cashCountTotal - expectedCash;
  var fc = formatCurrency;
  var now = new Date();

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:16px;font-weight:700;color:var(--text);">📋 Phiếu bàn giao ca</div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnPreviewA4">
          <span class="material-symbols-rounded">preview</span> Xem A4
        </button>
        <button class="btn btn-primary btn-sm" id="btnPrintHandover">
          <span class="material-symbols-rounded">print</span> In phiếu
        </button>
      </div>
    </div>

    <div class="a4-sheet" id="a4Sheet">
      <div class="a4-inner">
        <div class="a4-header">
          <div class="a4-header-left">
            <div class="a4-brand">👑 ${settings.storeName || "KING's GRILL"}</div>
            <div class="a4-address">${settings.storeAddress || ''}</div>
          </div>
          <div class="a4-header-right">
            <div class="a4-doc-title">PHIẾU BÀN GIAO CA</div>
            <div class="a4-doc-sub">Ngày: ${formatDate(target.date)} — Ca ${target.shiftNumber}</div>
          </div>
        </div>
        <div class="a4-divider"></div>
        <div class="a4-info-grid">
          <div class="a4-info-row"><span class="a4-info-label">Thu ngân:</span><span class="a4-info-value">${target.cashierName}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Bắt đầu:</span><span class="a4-info-value">${formatTime(target.startTime)}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Kết thúc:</span><span class="a4-info-value">${target.endTime ? formatTime(target.endTime) : '(đang mở)'}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Tiền đầu ca:</span><span class="a4-info-value a4-bold">${fc(target.startingCash)}</span></div>
        </div>

        <div class="a4-two-col">
          <div class="a4-col">
            ${cukcukRev.bills > 0 ? '<div class="a4-section-title a4-income-title">▌DOANH THU CUKCUK (' + cukcukRev.bills + ' bill)</div><table class="a4-table"><tbody><tr><td>Tiền mặt</td><td class="r">' + fc(cukcukRev.cash) + '</td></tr><tr><td>Quẹt thẻ</td><td class="r">' + fc(cukcukRev.card) + '</td></tr><tr><td>Chuyển khoản</td><td class="r">' + fc(cukcukRev.transfer) + '</td></tr></tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng CUKCUK</strong></td><td class="r"><strong>' + fc(cukcukRev.total) + '</strong></td></tr></tfoot></table>' : ''}
            ${billCount === 0 ? '<div class="a4-empty-box">Không có doanh thu</div>' : ''}
            <table class="a4-table" style="margin-top:4px;"><tfoot><tr class="a4-highlight-row"><td><strong>TỔNG DOANH THU (${billCount} bill)</strong></td><td class="r"><strong>${fc(combinedIncome)}</strong></td></tr></tfoot></table>
          </div>
          <div class="a4-col">
            <div class="a4-section-title a4-summary-title">▌TỔNG KẾT</div>
            <table class="a4-table a4-summary-table"><tbody>
              ${cukcukRev.bills > 0 ? '<tr><td>DT CUKCUK (' + cukcukRev.bills + ' bill)</td><td class="r a4-income">' + fc(cukcukRev.total) + '</td></tr>' : ''}
              <tr><td>Chi phí trong ca</td><td class="r a4-expense">−${fc(totalExpenseAmt)}</td></tr>
              <tr><td>Tiền đầu ca</td><td class="r">${fc(target.startingCash)}</td></tr>
            </tbody><tfoot>
              <tr class="a4-highlight-row"><td><strong>TM kỳ vọng</strong></td><td class="r"><strong>${fc(expectedCash)}</strong></td></tr>
              <tr><td>TM kiểm kê thực tế</td><td class="r">${fc(cashCountTotal)}</td></tr>
              <tr class="a4-disc-row ${Math.abs(discrepancy) > 0 ? 'a4-disc-warn' : 'a4-disc-ok'}"><td><strong>CHÊNH LỆCH</strong></td><td class="r"><strong>${discrepancy === 0 ? '✓ 0 đ' : (discrepancy > 0 ? '+' : '') + fc(discrepancy)}</strong></td></tr>
            </tfoot></table>
          </div>
        </div>

        <div class="a4-signatures">
          <div class="a4-sig"><div class="a4-sig-title">Người giao ca</div><div class="a4-sig-line"></div><div class="a4-sig-name">${target.cashierName}</div></div>
          <div class="a4-sig"><div class="a4-sig-title">Người nhận ca</div><div class="a4-sig-line"></div><div class="a4-sig-name">&nbsp;</div></div>
          <div class="a4-sig"><div class="a4-sig-title">Quản lý xác nhận</div><div class="a4-sig-line"></div><div class="a4-sig-name">&nbsp;</div></div>
        </div>
        <div class="a4-footer">In lúc: ${now.toLocaleString('vi-VN')} — ${settings.storeName} — Phiếu bàn giao tự động</div>
      </div>
    </div>
  `;
}

// ── Bind print/preview buttons ──
function _bindPrintButtons() {
  // Revenue report print
  document.getElementById('btnPrintReport')?.addEventListener('click', function() {
    window.print();
  });
  // Handover A4 print
  document.getElementById('btnPrintHandover')?.addEventListener('click', function() {
    document.body.classList.add('printing-a4');
    window.print();
    setTimeout(function() { document.body.classList.remove('printing-a4'); }, 1000);
  });
  // A4 preview
  document.getElementById('btnPreviewA4')?.addEventListener('click', function() {
    var sheet = document.getElementById('a4Sheet');
    if (sheet) sheet.classList.toggle('a4-preview-mode');
  });
}

// ── Sync to Google Sheets ──
async function _handleSyncSheets() {
  var btn = document.getElementById('btnSyncSheets');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded di-spin">sync</span> Đang đẩy...'; }

  try {
    var store = await import('../integration/invoiceStore.js');
    var unpushed = store.getUnpushedInvoices();

    if (unpushed.length === 0) {
      showToast('✅ Tất cả dữ liệu đã được đẩy lên Sheets', 'success');
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Đẩy lên Sheets'; }
      return;
    }

    // Prepare data for GAS
    var sheetData = unpushed.map(function(inv) {
      var cash = 0, card = 0, transfer = 0;
      (inv.payments || []).forEach(function(p) {
        switch (p.method) { case 'cash': cash += p.amount || 0; break; case 'card': card += p.amount || 0; break; case 'transfer': transfer += p.amount || 0; break; }
      });
      return {
        refId: inv.refId, refNo: inv.refNo || '', refDate: inv.refDate || '',
        date: inv.date || '', tableName: inv.tableName || '',
        employeeName: inv.employeeName || '', amount: inv.amount || 0,
        cashAmount: cash, cardAmount: card, transferAmount: transfer
      };
    });

    // Send in batches of 50
    var batchSize = 50;
    var totalAdded = 0, totalSkipped = 0;
    var allRefIds = [];

    for (var i = 0; i < sheetData.length; i += batchSize) {
      var batch = sheetData.slice(i, i + batchSize);
      var batchRefIds = batch.map(function(d) { return d.refId; });

      var { syncCukcukRevenueToCloud } = await import('../api.js');
      var result = await syncCukcukRevenueToCloud(batch, 'manual-sync');

      if (result && result.success) {
        allRefIds = allRefIds.concat(batchRefIds);
        totalAdded += result.inserted || batch.length;
        totalSkipped += result.updated || 0;
      }

      if (i + batchSize < sheetData.length) {
        showToast('📤 Đẩy ' + (i + batchSize) + '/' + sheetData.length + '...', 'info');
      }
    }

    // Mark as pushed
    if (allRefIds.length > 0) {
      store.markPushedToSheets(allRefIds);
    }

    showToast('✅ Đã đẩy ' + totalAdded + ' hóa đơn lên Sheets' + (totalSkipped > 0 ? ' (cập nhật ' + totalSkipped + ' trùng)' : ''), 'success');
    _renderTabContent(); // Refresh to update unpushed count

  } catch (e) {
    showToast('❌ Lỗi đẩy Sheets: ' + e.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Đẩy lên Sheets'; }
}

// ── Helpers ──
function _fmtDateVN(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1];
  return dateStr;
}
