/* ══════════════════════════════════════════════════════════════
   CUKCUK Invoices View — Xem hóa đơn CUKCUK theo kỳ
   
   Hiển thị hóa đơn đã nạp từ CUKCUK, phân theo ngày/tuần/tháng/quý/năm.
   Tách biệt với giao dịch thủ công (shift.transactions).
   ══════════════════════════════════════════════════════════════ */
import { formatCurrency, formatDate, showToast, showConfirm } from '../utils.js';
import { getSettings, getCurrentShift } from '../store.js';

var _currentPeriod = 'day';

function _pad2(n) { return n < 10 ? '0' + n : String(n); }

export function render() {
  var settings = getSettings();
  var hasCukcuk = settings.cukcuk && settings.cukcuk.domain && settings.cukcuk.key;
  var shift = getCurrentShift();

  // Load invoices from store
  var summary = null;
  var dailyBreakdown = [];
  var invoices = [];
  try {
    var store = _getInvoiceStore();
    if (store) {
      summary = store.getRevenueSummary(_currentPeriod);
      dailyBreakdown = store.getDailyBreakdown(_currentPeriod);
      invoices = store.getInvoicesForPeriod(_currentPeriod);
    }
  } catch(e) { /* module not loaded yet */ }

  var totalRevenue = summary ? summary.totalRevenue : 0;
  var totalCash = summary ? summary.totalCash : 0;
  var totalCard = summary ? summary.totalCard : 0;
  var totalTransfer = summary ? summary.totalTransfer : 0;
  var totalBills = summary ? summary.totalBills : 0;
  var avgPerBill = summary ? summary.avgPerBill : 0;
  var avgDaily = summary ? summary.avgDaily : 0;

  var periodLabels = {
    day: 'Hôm nay',
    week: 'Tuần này',
    month: 'Tháng này',
    quarter: 'Quý này',
    year: 'Năm nay'
  };

  // Smart period label from bounds
  var boundsLabel = '';
  var boundsTimeInfo = '';
  try {
    var store = _getInvoiceStore();
    if (store && store.getPeriodBounds) {
      var b = store.getPeriodBounds(_currentPeriod);
      boundsLabel = b.label;
      var fmt = function(d) {
        return _pad2(d.getDate()) + '/' + _pad2(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
      };
      boundsTimeInfo = '⏰ ' + fmt(b.start) + ' → ' + fmt(b.end);
    }
  } catch(e) {}

  return `
    <div class="section-header">
      <div>
        <h3>🧾 Hóa đơn CUKCUK</h3>
        <p>Doanh thu từ hệ thống POS — ${boundsLabel || periodLabels[_currentPeriod]}</p>
      </div>
      <div class="btn-group">
        ${hasCukcuk && shift ? `
        <button class="btn btn-success btn-sm" id="btnSyncCukcukInv">
          <span class="material-symbols-rounded">sync</span> Đồng bộ ngay
        </button>` : ''}
        <button class="btn btn-outline btn-sm" id="btnExportCukcukCSV">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <!-- ═══ PERIOD SELECTOR ═══ -->
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;" id="periodSelector">
      <button class="rev-period-btn ${_currentPeriod === 'day' ? 'active' : ''}" data-period="day">📅 Hôm nay</button>
      <button class="rev-period-btn ${_currentPeriod === 'week' ? 'active' : ''}" data-period="week">📆 Tuần này</button>
      <button class="rev-period-btn ${_currentPeriod === 'month' ? 'active' : ''}" data-period="month">🗓️ Tháng</button>
      <button class="rev-period-btn ${_currentPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">📊 Quý</button>
      <button class="rev-period-btn ${_currentPeriod === 'year' ? 'active' : ''}" data-period="year">📈 Năm</button>
    </div>
    ${boundsTimeInfo ? `<div class="text-muted" style="font-size:11px;margin-bottom:16px;padding:6px 12px;background:var(--bg-secondary);border-radius:6px;display:inline-block;">${boundsTimeInfo}</div>` : ''}

    <!-- ═══ OVERVIEW STATS ═══ -->
    <div class="stats-grid">
      <div class="stat-card stat-success">
        <div class="stat-icon"><span class="material-symbols-rounded">payments</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng doanh thu</span>
          <span class="stat-value">${formatCurrency(totalRevenue)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${totalBills} hóa đơn</span>
        </div>
      </div>
      <div class="stat-card stat-primary">
        <div class="stat-icon"><span class="material-symbols-rounded">receipt_long</span></div>
        <div class="stat-info">
          <span class="stat-label">TB / hóa đơn</span>
          <span class="stat-value">${formatCurrency(avgPerBill)}</span>
        </div>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-icon"><span class="material-symbols-rounded">trending_up</span></div>
        <div class="stat-info">
          <span class="stat-label">TB / ngày</span>
          <span class="stat-value">${formatCurrency(avgDaily)}</span>
        </div>
      </div>
      <div class="stat-card" style="border-left-color:var(--warning);">
        <div class="stat-icon" style="background:var(--warning-bg);color:var(--warning);"><span class="material-symbols-rounded">calendar_today</span></div>
        <div class="stat-info">
          <span class="stat-label">Số ngày có dữ liệu</span>
          <span class="stat-value">${summary ? summary.daysWithData : 0}</span>
        </div>
      </div>
    </div>

    <!-- ═══ PAYMENT BREAKDOWN ═══ -->
    <div class="card mb-20">
      <div class="card-header">
        <h3 style="display:flex;align-items:center;gap:6px;">
          <span class="material-symbols-rounded" style="color:#10b981;font-size:18px;">credit_score</span>
          Hình thức thanh toán
        </h3>
        <span class="text-muted" style="font-size:11px;">${boundsLabel || periodLabels[_currentPeriod]}</span>
      </div>
      <div class="card-body">
        ${_renderPaymentBar('💵 Tiền mặt', totalCash, totalRevenue, 'var(--success)')}
        ${_renderPaymentBar('💳 Quẹt thẻ', totalCard, totalRevenue, 'var(--info)')}
        ${_renderPaymentBar('🏦 Chuyển khoản', totalTransfer, totalRevenue, 'var(--primary)')}
      </div>
    </div>

    <!-- ═══ DAILY BREAKDOWN ═══ -->
    ${_currentPeriod !== 'day' ? `
    <div class="card mb-20">
      <div class="card-header">
        <h3>📊 Doanh thu theo ngày</h3>
        <span class="text-muted" style="font-size:11px;">${dailyBreakdown.length} ngày</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Ngày</th><th class="text-right">Bills</th>
            <th class="text-right">💵 TM</th>
            <th class="text-right">💳 Thẻ</th>
            <th class="text-right">🏦 CK</th>
            <th class="text-right">Tổng</th>
          </tr></thead>
          <tbody>
            ${dailyBreakdown.map(function(d) { return `
              <tr>
                <td>${formatDate(d.date)}</td>
                <td class="text-right">${d.bills}</td>
                <td class="text-right" style="color:var(--success);font-size:12px;">${formatCurrency(d.cash)}</td>
                <td class="text-right" style="color:var(--info);font-size:12px;">${formatCurrency(d.card)}</td>
                <td class="text-right" style="color:var(--primary);font-size:12px;">${formatCurrency(d.transfer)}</td>
                <td class="text-right amount-in">${formatCurrency(d.total)}</td>
              </tr>
            `; }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- ═══ INVOICE LIST ═══ -->
    <div class="card">
      <div class="card-header">
        <h3>📋 Danh sách hóa đơn</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="text" id="invoiceSearch" class="form-input" placeholder="🔍 Tìm bill, bàn..." style="width:200px;padding:6px 12px;font-size:12px;">
          <span class="text-muted" style="font-size:11px;" id="invoiceCount">${totalBills} hóa đơn</span>
        </div>
      </div>
      <div id="invoiceTableWrap" class="table-wrap">
        ${_renderInvoiceTable(invoices)}
      </div>
    </div>

    ${!hasCukcuk ? `
    <div class="empty-state" style="padding:40px;">
      <span class="material-symbols-rounded empty-icon">link_off</span>
      <h3>Chưa cấu hình CUKCUK</h3>
      <p>Vào Cài đặt → CUKCUK để nhập Domain, App ID và Secret Key</p>
      <button class="btn btn-primary" onclick="window.navigateTo('settings')">⚙️ Mở cài đặt</button>
    </div>` : ''}
  `;
}

function _renderPaymentBar(label, value, total, color) {
  var pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `
    <div class="payment-row">
      <div class="payment-label" style="min-width:130px;">
        <span>${label}</span>
        <span class="text-muted" style="font-size:11px;margin-left:4px;">(${pct}%)</span>
      </div>
      <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .5s ease;min-width:${value > 0 ? '2' : '0'}px;"></div>
      </div>
      <span class="payment-amount">${formatCurrency(value)}</span>
    </div>
  `;
}

function _renderInvoiceTable(invoices) {
  if (!invoices || invoices.length === 0) {
    return '<p class="text-muted text-center" style="padding:30px;">Chưa có hóa đơn nào trong kỳ này</p>';
  }

  // Sort by refDate desc
  var sorted = invoices.slice().sort(function(a, b) {
    return (b.refDate || b.syncedAt || '') > (a.refDate || a.syncedAt || '') ? 1 : -1;
  });

  return `<table>
    <thead><tr>
      <th style="width:80px;">Bill</th>
      <th>Bàn</th>
      <th>NV</th>
      <th style="width:130px;">Thời gian</th>
      <th class="text-right">💵 TM</th>
      <th class="text-right">💳 Thẻ</th>
      <th class="text-right">🏦 CK</th>
      <th class="text-right">Tổng</th>
      <th style="width:40px;"></th>
    </tr></thead>
    <tbody>
      ${sorted.map(function(inv) {
        var cash = 0, card = 0, transfer = 0;
        var payments = inv.payments || [];
        for (var i = 0; i < payments.length; i++) {
          switch (payments[i].method) {
            case 'cash': cash += payments[i].amount; break;
            case 'card': card += payments[i].amount; break;
            case 'transfer': transfer += payments[i].amount; break;
          }
        }
        // Use sum of payments as total (ensures consistency)
        var rowTotal = (cash + card + transfer) > 0 ? (cash + card + transfer) : (inv.amount || 0);
        var timeStr = '';
        try {
          var d = new Date(inv.refDate);
          timeStr = d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch(e) { timeStr = inv.date || ''; }

        // Detect suspicious default-cash (likely unpaid/undetected)
        var isSuspect = payments.length === 1 && payments[0].method === 'cash' && payments[0].amount === (inv.amount || 0);

        return '<tr>' +
          '<td style="font-weight:600;font-size:12px;">' + (inv.refNo || '—') + '</td>' +
          '<td>' + (inv.tableName || '—') + '</td>' +
          '<td class="text-muted" style="font-size:12px;">' + (inv.employeeName || '—') + '</td>' +
          '<td class="text-muted" style="font-size:12px;">' + timeStr + '</td>' +
          '<td class="text-right" style="color:var(--success);font-size:12px;">' + (cash > 0 ? formatCurrency(cash) : '') + '</td>' +
          '<td class="text-right" style="color:var(--info);font-size:12px;">' + (card > 0 ? formatCurrency(card) : '') + '</td>' +
          '<td class="text-right" style="color:var(--primary);font-size:12px;">' + (transfer > 0 ? formatCurrency(transfer) : '') + '</td>' +
          '<td class="text-right amount-in">' + formatCurrency(rowTotal) + '</td>' +
          '<td class="text-center"><button class="btn-sync-inv" data-refid="' + inv.refId + '" title="Cập nhật hóa đơn này" style="background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;color:' + (isSuspect ? 'var(--warning)' : 'var(--text-secondary)') + ';transition:color .2s;"><span class="material-symbols-rounded" style="font-size:18px;">sync</span></button></td>' +
        '</tr>';
      }).join('')}
    </tbody>
  </table>`;
}

var _invoiceStoreModule = null;
function _getInvoiceStore() {
  return _invoiceStoreModule;
}

export function init() {
  // Load invoice store module
  import('../integration/invoiceStore.js').then(function(mod) {
    _invoiceStoreModule = mod;
    // Re-render now that module is loaded
    _refreshData();
  }).catch(function(e) {
    console.warn('[CukcukInvoices] Could not load invoice store:', e);
  });

  // Period selector
  document.querySelectorAll('[data-period]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _currentPeriod = btn.dataset.period;
      window.refreshView && window.refreshView();
    });
  });

  // Search
  document.getElementById('invoiceSearch')?.addEventListener('input', function(e) {
    var q = e.target.value.toLowerCase();
    _filterInvoices(q);
  });

  // Per-invoice sync — event delegation on table wrapper
  var tableWrap = document.getElementById('invoiceTableWrap');
  if (tableWrap) tableWrap.addEventListener('click', async function(e) {
    var btn = e.target.closest('.btn-sync-inv');
    if (!btn) return;
    var refId = btn.dataset.refid;
    if (!refId) return;

    // Visual feedback
    var icon = btn.querySelector('.material-symbols-rounded');
    if (icon) icon.classList.add('di-spin');
    btn.disabled = true;

    try {
      var cukcuk = await import('../integration/cukcuk.js');
      var result = await cukcuk.syncSingleInvoice(refId);
      if (result && result.success) {
        _refreshData();
      }
    } catch(err) {
      showToast('❌ ' + err.message, 'error');
    }

    btn.disabled = false;
    if (icon) icon.classList.remove('di-spin');
  });

  // Sync button
  document.getElementById('btnSyncCukcukInv')?.addEventListener('click', async function() {
    var btn = document.getElementById('btnSyncCukcukInv');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    }
    try {
      var cukcuk = await import('../integration/cukcuk.js');
      var result = await cukcuk.syncTransactions(true);
      if (result && result.success) {
        window.refreshView && window.refreshView();
      }
    } catch(e) {
      showToast('❌ Lỗi: ' + e.message, 'error');
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ ngay';
    }
  });

  // Resync button removed — "Đồng bộ ngay" with force=true handles everything

  // Export CSV
  document.getElementById('btnExportCukcukCSV')?.addEventListener('click', function() {
    var store = _getInvoiceStore();
    if (!store) { showToast('Chưa sẵn sàng', 'warning'); return; }
    var invoices = store.getInvoicesForPeriod(_currentPeriod);
    if (invoices.length === 0) { showToast('Không có dữ liệu', 'warning'); return; }

    var csv = 'RefId,Bill,Ngày,Bàn,Nhân viên,Tổng,Tiền mặt,Thẻ,Chuyển khoản\n';
    invoices.forEach(function(inv) {
      var cash = 0, card = 0, transfer = 0;
      (inv.payments || []).forEach(function(p) {
        if (p.method === 'cash') cash += p.amount;
        else if (p.method === 'card') card += p.amount;
        else if (p.method === 'transfer') transfer += p.amount;
      });
      csv += '"' + inv.refId + '","' + (inv.refNo || '') + '","' + inv.date + '","' + (inv.tableName || '') + '","' + (inv.employeeName || '') + '",' + inv.amount + ',' + cash + ',' + card + ',' + transfer + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cukcuk-invoices-' + _currentPeriod + '-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
  });
}

function _refreshData() {
  var store = _getInvoiceStore();
  if (!store) return;
  // Update stats
  var summary = store.getRevenueSummary(_currentPeriod);
  var invoices = store.getInvoicesForPeriod(_currentPeriod);
  var countEl = document.getElementById('invoiceCount');
  if (countEl) countEl.textContent = summary.totalBills + ' hóa đơn';
  var tableWrap = document.getElementById('invoiceTableWrap');
  if (tableWrap) tableWrap.innerHTML = _renderInvoiceTable(invoices);
}

function _filterInvoices(query) {
  var store = _getInvoiceStore();
  if (!store) return;
  var invoices = store.getInvoicesForPeriod(_currentPeriod);
  if (query) {
    invoices = invoices.filter(function(inv) {
      var searchable = (inv.refNo || '') + (inv.tableName || '') + (inv.employeeName || '') + (inv.date || '');
      return searchable.toLowerCase().indexOf(query) !== -1;
    });
  }
  var countEl = document.getElementById('invoiceCount');
  if (countEl) countEl.textContent = invoices.length + ' hóa đơn';
  var tableWrap = document.getElementById('invoiceTableWrap');
  if (tableWrap) tableWrap.innerHTML = _renderInvoiceTable(invoices);
}
