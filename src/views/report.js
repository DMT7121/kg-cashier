/* ═══════════════════════════════════════════════
   BÁO CÁO DOANH THU — Tabs: Hôm nay / Tuần / Tháng / Quý + Phiếu bàn giao
   ═══════════════════════════════════════════════ */
import { getCurrentShift, getSettings, getShiftHistory, getShiftSummary } from '../store.js';
import { formatCurrency, formatDate, formatTime, denominations, showToast } from '../utils.js';

var _activeTab = 'day'; // day | week | month | quarter
var _refDate = null;    // null = today/now, or Date object for custom period
var _fromHistory = false; // true when _refDate was set by history navigation

// Global hook: allow other views (e.g. history) to set the report date before navigation.
// Registered at module level so it's available before init() runs.
window._setReportDate = function(dateStr) {
  if (dateStr) {
    _activeTab = 'day';
    _refDate = new Date(dateStr + 'T12:00:00');
    _fromHistory = true;
  }
};

// ── RENDER ──
export function render() {
  // If not navigating from history, reset to today (prevent stale date from previous history view)
  if (!_fromHistory) {
    _refDate = null;
  }
  _fromHistory = false; // consume the flag

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
  // Day — use getElementById inside closures to avoid shared variable bug
  var dayInput = document.getElementById('rptDateInput');
  if (dayInput) dayInput.addEventListener('change', function() {
    _refDate = new Date(dayInput.value + 'T12:00:00'); _renderTabContent();
  });
  var todayBtn = document.getElementById('rptToday');
  if (todayBtn) todayBtn.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Week
  var weekInput = document.getElementById('rptWeekInput');
  if (weekInput) weekInput.addEventListener('change', function() {
    var parts = weekInput.value.split('-W');
    if (parts.length === 2) { _refDate = _weekToDate(parseInt(parts[0]), parseInt(parts[1])); _renderTabContent(); }
  });
  var prevWeek = document.getElementById('rptPrevWeek');
  if (prevWeek) prevWeek.addEventListener('click', function() { _shiftWeek(-1); });
  var nextWeek = document.getElementById('rptNextWeek');
  if (nextWeek) nextWeek.addEventListener('click', function() { _shiftWeek(1); });
  var thisWeek = document.getElementById('rptThisWeek');
  if (thisWeek) thisWeek.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Month
  var monthInput = document.getElementById('rptMonthInput');
  if (monthInput) monthInput.addEventListener('change', function() { _refDate = new Date(monthInput.value + '-15T12:00:00'); _renderTabContent(); });
  var thisMonth = document.getElementById('rptThisMonth');
  if (thisMonth) thisMonth.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
  // Quarter
  var qInput = document.getElementById('rptQuarterInput');
  var qYear = document.getElementById('rptQuarterYear');
  if (qInput) qInput.addEventListener('change', function() { _applyQuarter(); });
  if (qYear) qYear.addEventListener('change', function() { _applyQuarter(); });
  var thisQ = document.getElementById('rptThisQuarter');
  if (thisQ) thisQ.addEventListener('click', function() { _refDate = null; _renderDatePicker(); _renderTabContent(); });
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

    var html = '<div class="rpt-revenue-section">' + _buildRevenueReport(rev, daily, unpushed) + '</div>';

    // Tab "Ngày" → thêm Phiếu bàn giao ca (cho ngày được chọn)
    if (_activeTab === 'day') {
      html += '<div class="rpt-handover-section">' + _buildHandoverHTML(rev, store) + '</div>';
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
function _buildHandoverHTML(revSummary, store) {
  var fc = formatCurrency;
  var now = new Date();
  var settings = getSettings();
  
  // Base CUKCUK rev from the day's selected date (for Day mode or fallback)
  var cukcukRev = {
    total: revSummary ? revSummary.totalRevenue : 0,
    cash: revSummary ? revSummary.totalCash : 0,
    card: revSummary ? revSummary.totalCard : 0,
    transfer: revSummary ? revSummary.totalTransfer : 0,
    bills: revSummary ? revSummary.totalBills : 0
  };

  var selectedDateStr = _refDate ? _refDate.getFullYear() + '-' + String(_refDate.getMonth()+1).padStart(2,'0') + '-' + String(_refDate.getDate()).padStart(2,'0') : null;
  if(!selectedDateStr) {
    var d = new Date();
    if (d.getHours() < 6) {
      d.setDate(d.getDate() - 1);
    }
    selectedDateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  var shiftIdToPrint = (typeof window._setReportShiftId === 'function') ? window._setReportShiftId() : null;
  // CRITICAL: consume the flag immediately so it doesn't persist across navigations
  window._setReportShiftId = null;

  var currentShift = getCurrentShift();
  var history = getShiftHistory();
  var target = null;
  var printTitle = "PHIẾU BÀN GIAO CA";
  var printSub = "";
  var isAutoPrint = false;
  var isSupplemental = false;

  if (shiftIdToPrint) {
    // SHIFT MODE
    if (currentShift && currentShift.id === shiftIdToPrint) target = currentShift;
    else target = history.find(function(s) { return s.id === shiftIdToPrint; });
    
    if (target) {
      printSub = 'Ngày: ' + formatDate(target.date) + ' — Ca ' + target.shiftNumber;
      
      // Calculate POS exact revenue for THIS shift
      var shiftInvoices = target.cukcukInvoicesSnapshot || store.getInvoicesByShiftTime(target.date, target.startTime, target.endTime);
      cukcukRev.total = 0; cukcukRev.cash = 0; cukcukRev.card = 0; cukcukRev.transfer = 0; cukcukRev.bills = 0;
      shiftInvoices.forEach(function(inv) {
        if (inv.unpaid) return;
        cukcukRev.bills++;
        var hasPay = false;
        (inv.payments || []).forEach(function(p) {
          hasPay = true;
          if (p.method === 'cash') cukcukRev.cash += p.amount;
          else if (p.method === 'card') cukcukRev.card += p.amount;
          else if (p.method === 'transfer') cukcukRev.transfer += p.amount;
          cukcukRev.total += p.amount;
        });
        if (!hasPay) {
          cukcukRev.total += inv.amount;
          cukcukRev.cash += inv.amount; // default
        }
      });

      isAutoPrint = !!target.endTime;
      isSupplemental = !!target.originalSummarySnapshot;
    }
  } else {
    // DAY MODE (Combined)
    var isHistoryMode = !!window._historyReportMode;
    window._historyReportMode = false; // consume the flag
    var dayShifts = history.filter(function(s) { return s.date === selectedDateStr; });
    if (currentShift && currentShift.date === selectedDateStr && !dayShifts.find(function(s){ return s.id === currentShift.id; })) {
      dayShifts.unshift(currentShift); // Include current shift if it matches selected date (even when viewing history)
    }
    
    printTitle = "BÁO CÁO TỔNG KẾT NGÀY";
    printSub = 'Ngày làm việc: ' + formatDate(selectedDateStr);

    if (dayShifts.length > 0) {
      // Sort ascending by time
      dayShifts.sort(function(a,b) { return a.startTime - b.startTime; });
      var firstShift = dayShifts[0];
      var lastShift = dayShifts[dayShifts.length - 1];

      var allTxs = [];
      var allOtherTxs = [];
      dayShifts.forEach(function(s) {
        if(s.transactions) allTxs = allTxs.concat(s.transactions);
        if(s.otherTransactions) allOtherTxs = allOtherTxs.concat(s.otherTransactions);
      });

      var cNames = dayShifts.map(function(s){ return s.cashierName; }).filter(function(v,i,a){ return a.indexOf(v)===i; }).join(', ');

      target = {
        date: selectedDateStr,
        cashierName: cNames,
        startTime: firstShift.startTime,
        endTime: lastShift.endTime, // might be undefined if currentShift is still open
        startingCash: firstShift.startingCash || 0, // start of day
        transactions: allTxs,
        otherTransactions: allOtherTxs,
        cashCount: lastShift.cashCount || {},
        pinnedCash: lastShift.pinnedCash || {},
        keepCash: lastShift.keepCash || {},
        handoverCash: lastShift.handoverCash || {},
        originalSummarySnapshot: null, // Day mode has no diff highlighting
        audit: [] // No audit trail needed for combined report
      };
      
      var dayInvoices = store.getInvoicesForPeriod('day', _refDate);
      cukcukRev.total = 0; cukcukRev.cash = 0; cukcukRev.card = 0; cukcukRev.transfer = 0; cukcukRev.bills = 0;
      dayInvoices.forEach(function(inv) {
        if (inv.unpaid) return;
        cukcukRev.bills++;
        var hasPay = false;
        (inv.payments || []).forEach(function(p) {
          hasPay = true;
          if (p.method === 'cash') cukcukRev.cash += p.amount;
          else if (p.method === 'card') cukcukRev.card += p.amount;
          else if (p.method === 'transfer') cukcukRev.transfer += p.amount;
          cukcukRev.total += p.amount;
        });
        if (!hasPay) {
          cukcukRev.total += inv.amount;
          cukcukRev.cash += inv.amount;
        }
      });
      
      isAutoPrint = !!lastShift.endTime;
    } else {
      // NO SHIFTS (POS ONLY)
      target = {
        date: selectedDateStr,
        cashierName: 'Hệ thống (Không có ca)',
        startTime: new Date(selectedDateStr + 'T12:00:00').getTime(),
        endTime: new Date(selectedDateStr + 'T23:59:59').getTime(),
        startingCash: 0,
        transactions: [],
        otherTransactions: [],
        cashCount: {},
        pinnedCash: {},
        keepCash: {},
        handoverCash: {},
        audit: []
      };
      isAutoPrint = true;
    }
  }

  if (!target) {
    return '<div class="empty-state" style="padding:30px;"><span class="material-symbols-rounded empty-icon">summarize</span><h2>Chưa có dữ liệu</h2><p>Không tìm thấy ca làm việc hoặc dữ liệu.</p></div>';
  }

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
  
  // NOTE: expectedCash calculation uses manualCash + cukcukRev.cash 
  // because cukcukRev.cash is strictly POS cash.
  var expectedCash = (target.startingCash || 0) + manualCash + cukcukRev.cash - totalExpenseAmt + otherIncomeAmt - otherExpenseAmt;
  var combinedIncome = cukcukRev.total + totalManualIncome;
  var billCount = cukcukRev.bills + manualIncomeTxs.length;
  var discrepancy = cashCountTotal - expectedCash;

  function _val(curVal, origField, isMoney) {
    if (!isSupplemental) return isMoney ? fc(curVal) : curVal;
    var orig = (target.originalSummarySnapshot || {})[origField];
    if (orig !== undefined && curVal !== orig) {
      return '<span style="color:#d97706;font-weight:700;" title="Gốc: ' + (isMoney ? fc(orig) : orig) + '">' + (isMoney ? fc(curVal) : curVal) + ' *</span>';
    }
    return isMoney ? fc(curVal) : curVal;
  }

  return `
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:16px;font-weight:700;color:var(--text);">📋 ${printTitle}</div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnConfigReport">
          <span class="material-symbols-rounded">tune</span> Cấu hình
        </button>
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
            <div class="a4-brand"><img src="/android-chrome-192x192.png" style="width:32px;height:32px;vertical-align:middle;margin-right:8px;" alt="Logo">${settings.storeName || "KING's GRILL"}</div>
            <div class="a4-address">${settings.storeAddress || ''}</div>
          </div>
          <div class="a4-header-right">
            <div class="a4-doc-title">${isSupplemental ? '<span style="font-size:12px;opacity:0.8;">(BẢN IN BỔ SUNG)</span>' : ''}</div>
            <div class="a4-doc-sub">${printSub}</div>
          </div>
        </div>
        <div class="a4-divider"></div>
        <div class="a4-info-grid">
          <div class="a4-info-row"><span class="a4-info-label">Thu ngân:</span><span class="a4-info-value">${target.cashierName}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Bắt đầu:</span><span class="a4-info-value">${formatTime(target.startTime)}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Kết thúc:</span><span class="a4-info-value">${target.endTime ? formatTime(target.endTime) : '(đang làm việc)'}</span></div>
          <div class="a4-info-row"><span class="a4-info-label">Tiền đầu:</span><span class="a4-info-value a4-bold">${fc(target.startingCash)}</span></div>
        </div>

        <div class="a4-two-col">
          ${(function() {
            var confStr = localStorage.getItem('kg-report-layout');
            var conf = confStr ? JSON.parse(confStr) : {
              order: ['cukcuk', 'expense', 'manual', 'summary', 'ket', 'handover', 'general'],
              visible: { cukcuk: true, expense: true, manual: true, summary: true, ket: true, handover: true, general: true }
            };
            
            var blocks = {};
            
            // 1. CUKCUK
            blocks['cukcuk'] = cukcukRev.bills > 0 ? '<div class="a4-section-wrap"><div class="a4-section-title a4-income-title">▌DOANH THU CUKCUK (' + cukcukRev.bills + ' bill)</div><table class="a4-table"><tbody><tr><td>Tiền mặt</td><td class="r">' + _val(cukcukRev.cash, 'cashIncome', true) + '</td></tr><tr><td>Quẹt thẻ</td><td class="r">' + _val(cukcukRev.card, 'cardIncome', true) + '</td></tr><tr><td>Chuyển khoản</td><td class="r">' + _val(cukcukRev.transfer, 'transferIncome', true) + '</td></tr></tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng CUKCUK (' + cukcukRev.bills + ' bill)</strong></td><td class="r"><strong>' + _val(cukcukRev.total, 'cukcukRevenue', true) + '</strong></td></tr></tfoot></table></div>' : '';
            
            // 2. Chi phí
            blocks['expense'] = expenseTxs.length > 0 ? '<div class="a4-section-wrap"><div class="a4-section-title" style="color:#dc2626;">▌CHI TRONG CA (' + expenseTxs.length + ')</div><table class="a4-table"><tbody>' + expenseTxs.map(function(t) { return '<tr><td style="color:#dc2626;">✗ ' + (t.note || 'Chi phí') + '</td><td class="r" style="color:#dc2626;">−' + fc(t.amount) + '</td></tr>'; }).join('') + '</tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng chi</strong></td><td class="r" style="color:#dc2626;"><strong>−' + _val(totalExpenseAmt, 'totalExpense', true) + '</strong></td></tr></tfoot></table></div>' : '';
            
            // 3. Thu ngoài
            blocks['manual'] = manualIncomeTxs.length > 0 ? '<div class="a4-section-wrap"><div class="a4-section-title" style="color:#16a34a;">▌THU NGOÀI POS (' + manualIncomeTxs.length + ')</div><table class="a4-table"><tbody>' + manualIncomeTxs.map(function(t) { return '<tr><td style="color:#16a34a;">✓ ' + (t.note || 'Thu nhập') + '</td><td class="r" style="color:#16a34a;">+' + fc(t.amount) + '</td></tr>'; }).join('') + '</tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng thu ngoài</strong></td><td class="r" style="color:#16a34a;"><strong>+' + fc(totalManualIncome) + '</strong></td></tr></tfoot></table></div>' : '';
            
            // 4. Tổng kết
            blocks['summary'] = '<div class="a4-section-wrap"><div class="a4-section-title a4-summary-title">▌TỔNG KẾT</div><table class="a4-table a4-summary-table"><tbody>' +
              (cukcukRev.bills > 0 ? '<tr><td>Tiền mặt CUKCUK (' + cukcukRev.bills + ' bill)</td><td class="r a4-income">' + _val(cukcukRev.cash, 'cashIncome', true) + '</td></tr>' : '') +
              (manualIncomeTxs.length > 0 ? '<tr><td>Thu ngoài POS</td><td class="r a4-income">+' + fc(totalManualIncome) + '</td></tr>' : '') +
              '<tr><td>Chi phí trong ca</td><td class="r a4-expense">−' + _val(totalExpenseAmt, 'totalExpense', true) + '</td></tr>' +
              '<tr><td>Tiền đầu ca</td><td class="r">' + fc(target.startingCash) + '</td></tr>' +
              '</tbody><tfoot><tr class="a4-highlight-row"><td><strong>TM kỳ vọng</strong></td><td class="r"><strong>' + _val(expectedCash, 'expectedCash', true) + '</strong></td></tr>' +
              '<tr><td>TM kiểm kê thực tế</td><td class="r">' + _val(cashCountTotal, 'cashCountTotal', true) + '</td></tr>' +
              '<tr class="a4-disc-row ' + (Math.abs(discrepancy) > 0 ? 'a4-disc-warn' : 'a4-disc-ok') + '"><td><strong>CHÊNH LỆCH</strong></td><td class="r"><strong>' + (discrepancy === 0 && !target.originalSummarySnapshot ? '✓ 0 đ' : (discrepancy > 0 ? '+' : '') + _val(discrepancy, 'discrepancy', true)) + '</strong></td></tr></tfoot></table></div>';

            // Cash denom logic
            var pc = target.pinnedCash || {};
            var kc = target.keepCash || {};
            var hc = target.handoverCash || {};
            var ccount = target.cashCount || {};
            var ketRows = '', handRows = '', ketTotal = 0, handTotal = 0;

            for (var di = 0; di < denominations.length; di++) {
              var dv = denominations[di].value, dl = denominations[di].label;
              var pinQty = pc[dv] || 0, keepQty = kc[dv] || 0, handQty = hc[dv] || 0;
              var ketQty = pinQty + keepQty;
              if (ketQty > 0) {
                var detail = pinQty > 0 && keepQty > 0 ? ' (' + pinQty + ' ghim + ' + keepQty + ' giữ)' : (pinQty > 0 ? ' (ghim)' : ' (giữ)');
                ketRows += '<tr><td>' + ketQty + ' x ' + dl + detail + '</td><td class="r">' + fc(dv * ketQty) + '</td></tr>';
                ketTotal += dv * ketQty;
              }
              if (handQty > 0) {
                handRows += '<tr><td>' + handQty + ' x ' + dl + '</td><td class="r">' + fc(dv * handQty) + '</td></tr>';
                handTotal += dv * handQty;
              }
            }

            blocks['ket'] = ketRows ? '<div class="a4-section-wrap"><div class="a4-section-title" style="color:#e8a838;">▌TIỀN GIỮ LẠI (KÉT)</div><table class="a4-table"><tbody>' + ketRows + '</tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng két</strong></td><td class="r"><strong>' + fc(ketTotal) + '</strong></td></tr></tfoot></table></div>' : '';
            blocks['handover'] = handRows ? '<div class="a4-section-wrap"><div class="a4-section-title" style="color:#22c55e;">▌TIỀN BÀN GIAO</div><table class="a4-table"><tbody>' + handRows + '</tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng bàn giao</strong></td><td class="r"><strong>' + fc(handTotal) + '</strong></td></tr></tfoot></table></div>' : '';
            
            blocks['general'] = '';
            if (!ketRows && !handRows && Object.keys(ccount).length > 0) {
              var generalRows = '', generalTotal = 0;
              for (var di2 = 0; di2 < denominations.length; di2++) {
                var dv2 = denominations[di2].value, dl2 = denominations[di2].label, qty2 = ccount[dv2] || 0;
                if (qty2 > 0) {
                  generalRows += '<tr><td>' + qty2 + ' x ' + dl2 + '</td><td class="r">' + fc(dv2 * qty2) + '</td></tr>';
                  generalTotal += dv2 * qty2;
                }
              }
              if (generalRows) {
                blocks['general'] = '<div class="a4-section-wrap"><div class="a4-section-title" style="color:#0284c7;">▌CHI TIẾT KIỂM KÊ TIỀN</div><table class="a4-table"><tbody>' + generalRows + '</tbody><tfoot><tr class="a4-total-row"><td><strong>Tổng kiểm kê</strong></td><td class="r"><strong>' + fc(generalTotal) + '</strong></td></tr></tfoot></table></div>';
              }
            }

            // Build HTML
            var html = '';
            conf.order.forEach(function(key) {
              if (conf.visible[key] && blocks[key]) {
                html += blocks[key];
              }
            });
            

            return html || '<div class="a4-empty-box" style="width:100%;grid-column:1/-1;">Không có dữ liệu báo cáo</div>';
          })()}
        </div>

        <div class="a4-signatures">
          <div class="a4-sig"><div class="a4-sig-title">Người giao ca</div><div class="a4-sig-line"></div><div class="a4-sig-name">${target.cashierName}</div></div>
          <div class="a4-sig"><div class="a4-sig-title">Người nhận ca</div><div class="a4-sig-line"></div><div class="a4-sig-name">&nbsp;</div></div>
          <div class="a4-sig"><div class="a4-sig-title">Quản lý xác nhận</div><div class="a4-sig-line"></div><div class="a4-sig-name">&nbsp;</div></div>
        </div>
        <div class="a4-footer">
          ${isSupplemental ? '<div style="text-align:center;font-size:11px;color:#d97706;margin-bottom:8px;padding-top:4px;border-top:1px dashed #ccc;">* BẢN IN NÀY CÓ CHỨA CÁC ĐIỀU CHỈNH SAU KHI ĐÓNG CA</div>' : ''}
          In lúc: ${now.toLocaleString('vi-VN')} — ${settings.storeName} — Báo cáo ${isAutoPrint ? (isSupplemental ? 'bổ sung' : 'tự động') : 'tạm tính'}
        </div>
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
  // Config
  document.getElementById('btnConfigReport')?.addEventListener('click', function() {
    _showReportConfigModal();
  });
}

function _showReportConfigModal() {
  var confStr = localStorage.getItem('kg-report-layout');
  var conf = confStr ? JSON.parse(confStr) : {
    order: ['cukcuk', 'expense', 'manual', 'summary', 'ket', 'handover', 'general'],
    visible: { cukcuk: true, expense: true, manual: true, summary: true, ket: true, handover: true, general: true }
  };
  
  var labels = {
    cukcuk: 'Doanh thu CUKCUK',
    expense: 'Chi trong ca',
    manual: 'Thu ngoài POS',
    summary: 'Bảng tổng kết',
    ket: 'Tiền giữ lại (Két)',
    handover: 'Tiền bàn giao',
    general: 'Chi tiết kiểm kê'
  };

  var m = document.createElement('div');
  m.className = 'modal-overlay active';
  // Allow clicking outside the modal content to close it quickly
  m.addEventListener('click', function(e) {
    if (e.target === m) {
      m.remove();
    }
  });
  
  var html = '<div class="modal-content" style="max-width:420px; display:flex; flex-direction:column; max-height:80vh; padding: 24px; border-radius: 24px;">';
  
  // Modal Header
  html += '<div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border);">';
  html += '<h3 style="font-size:16px; font-weight:700; color:var(--text); margin:0;">⚙️ Cấu hình Báo cáo</h3>';
  html += '<button class="modal-close" style="background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" onclick="this.closest(\'.modal-overlay\').remove()"><span class="material-symbols-rounded">close</span></button>';
  html += '</div>';
  
  // Modal Body
  html += '<div class="modal-body" style="overflow-y:auto; flex:1; padding-right:4px; margin-bottom:16px;">';
  html += '<p style="font-size:12px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">Bật/tắt hoặc kéo thả các thành phần dưới đây để sắp xếp thứ tự hiển thị trên phiếu bàn giao ca.</p>';
  html += '<style>.drag-over { border-top: 2px solid var(--primary) !important; background: var(--bg-secondary) !important; }</style>';
  html += '<div style="display:flex; flex-direction:column; gap:8px;" id="rptConfigList">';
  
  conf.order.forEach(function(key) {
    if (!labels[key]) return;
    var checked = conf.visible[key] ? 'checked' : '';
    html += '<label class="rpt-drag-item" draggable="true" data-key="' + key + '" style="display:flex; align-items:center; padding:12px; background:var(--bg-secondary); border-radius:12px; cursor:grab; border:1px solid var(--border); transition:all 0.2s;">';
    html += '<span class="material-symbols-rounded" style="color:var(--text-muted); cursor:grab; margin-right:8px; font-size:18px;">drag_indicator</span>';
    html += '<input type="checkbox" ' + checked + ' style="width:16px; height:16px; margin-right:12px; cursor:pointer; accent-color:var(--primary);">';
    html += '<span style="font-weight:600; font-size:13px; color:var(--text); flex:1; user-select:none;">' + labels[key] + '</span>';
    html += '</label>';
  });
  html += '</div>';
  html += '</div>';
  
  // Modal Footer
  html += '<div class="modal-footer" style="padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; margin-top:0;">';
  html += '<button class="btn btn-outline" style="border-radius:12px; padding:6px 16px; font-size:13px;" onclick="this.closest(\'.modal-overlay\').remove()">Đóng</button>';
  html += '<button class="btn btn-primary" id="btnSaveRptConfig" style="border-radius:12px; padding:6px 16px; font-size:13px;">Lưu cấu hình</button>';
  html += '</div></div>';
  
  m.innerHTML = html;
  document.body.appendChild(m);

  // Drag and Drop Logic
  var list = m.querySelector('#rptConfigList');
  var dragSrcEl = null;

  list.querySelectorAll('.rpt-drag-item').forEach(function(item) {
    item.addEventListener('dragstart', function(e) {
      dragSrcEl = this;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', this.innerHTML);
      this.style.opacity = '0.5';
    });
    item.addEventListener('dragover', function(e) {
      if (e.preventDefault) e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return false;
    });
    item.addEventListener('dragenter', function(e) {
      if (this !== dragSrcEl) this.classList.add('drag-over');
    });
    item.addEventListener('dragleave', function(e) {
      this.classList.remove('drag-over');
    });
    item.addEventListener('drop', function(e) {
      if (e.stopPropagation) e.stopPropagation();
      this.classList.remove('drag-over');
      if (dragSrcEl !== this) {
        var rect = this.getBoundingClientRect();
        var mid = rect.top + rect.height / 2;
        if (e.clientY > mid) {
          this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
        } else {
          this.parentNode.insertBefore(dragSrcEl, this);
        }
      }
      return false;
    });
    item.addEventListener('dragend', function(e) {
      this.style.opacity = '1';
      list.querySelectorAll('.rpt-drag-item').forEach(function(i) { i.classList.remove('drag-over'); });
    });
  });

  // Save Logic
  m.querySelector('#btnSaveRptConfig').addEventListener('click', function() {
    var newOrder = [];
    var newVisible = {};
    m.querySelectorAll('.rpt-drag-item').forEach(function(el) {
      var key = el.dataset.key;
      var isChecked = el.querySelector('input[type="checkbox"]').checked;
      newOrder.push(key);
      newVisible[key] = isChecked;
    });
    
    // Safety check - make sure all expected keys exist even if removed from DOM somehow
    Object.keys(labels).forEach(function(k) {
      if (newOrder.indexOf(k) === -1) {
        newOrder.push(k);
        newVisible[k] = false;
      }
    });

    conf.order = newOrder;
    conf.visible = newVisible;
    localStorage.setItem('kg-report-layout', JSON.stringify(conf));
    m.remove();
    _renderTabContent(); // Redraw
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

export function destroy() {}
