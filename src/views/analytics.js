/* ── Analytics View — Bar Chart + Period Comparison + Enhanced ── */
import { getShiftHistory, getShiftSummary, getDailyReport, getWeeklyReport, getMonthlyReport, getSettings } from '../store.js';
import { formatCurrency, formatDate, showToast } from '../utils.js';

var _cukcukRevenue = null;

function _getCukcukDailySummary(period) {
  if (_cukcukRevenue && _cukcukRevenue.getRevenueSummary) {
    return _cukcukRevenue.getRevenueSummary(period);
  }
  return null;
}

function _getCukcukLastSync() {
  if (_cukcukRevenue && _cukcukRevenue.getLastSyncInfo) {
    return _cukcukRevenue.getLastSyncInfo();
  }
  return null;
}

/** Get previous period for comparison */
function _getPreviousPeriodRevenue(period) {
  if (!_cukcukRevenue || !_cukcukRevenue.getRevenueSummary) return null;
  // Calculate previous period refDate
  var now = new Date();
  var refDate = new Date(now);
  if (period === 'week') {
    refDate.setDate(refDate.getDate() - 7);
  } else if (period === 'month') {
    refDate.setMonth(refDate.getMonth() - 1);
  } else if (period === 'quarter') {
    refDate.setMonth(refDate.getMonth() - 3);
  }
  return _cukcukRevenue.getRevenueSummary(period, refDate);
}

/** Render percentage change badge */
function _changeBadge(current, previous) {
  if (!previous || previous === 0) return '';
  var pct = Math.round((current - previous) / previous * 100);
  var isUp = pct >= 0;
  var color = isUp ? 'var(--success)' : 'var(--danger)';
  var icon = isUp ? 'trending_up' : 'trending_down';
  return '<span style="display:inline-flex;align-items:center;gap:2px;font-size:11px;color:' + color + ';font-weight:600;margin-left:6px;">' +
    '<span class="material-symbols-rounded" style="font-size:14px;">' + icon + '</span>' +
    (isUp ? '+' : '') + pct + '%' +
  '</span>';
}

/** Render pure CSS bar chart */
function _renderBarChart(days, maxVal) {
  if (!days || days.length === 0) return '<div class="text-muted text-center" style="padding:24px;">Chưa có dữ liệu</div>';
  var max = maxVal || Math.max.apply(null, days.map(function(d) { return d.total || d.totalIncome || 0; })) || 1;

  return '<div class="analytics-bar-chart">' +
    days.map(function(day) {
      var income = day.total || day.totalIncome || 0;
      var pct = Math.round(income / max * 100);
      var d = new Date(day.date);
      var isToday = day.date === _todayStr();
      var dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short' });
      var dateLabel = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      var bills = day.bills || day.billCount || 0;

      return '<div class="ab-col' + (isToday ? ' ab-col-today' : '') + '">' +
        '<div class="ab-value">' + (income > 0 ? _shortCurrency(income) : '—') + '</div>' +
        '<div class="ab-track">' +
          '<div class="ab-fill" style="height:' + Math.max(pct, 2) + '%;"></div>' +
        '</div>' +
        '<div class="ab-label">' + dayLabel + '</div>' +
        '<div class="ab-date">' + dateLabel + '</div>' +
        '<div class="ab-bills">' + bills + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _shortCurrency(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'tr';
  if (val >= 1000) return Math.round(val / 1000) + 'k';
  return String(val);
}

function _todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function render() {
  var weekly = getWeeklyReport();
  var settings = getSettings();
  var hasCukcuk = settings.cukcuk && settings.cukcuk.domain && settings.cukcuk.key;

  var weekTotal = weekly.reduce(function(s, d) { return s + d.totalIncome; }, 0);
  var weekExpense = weekly.reduce(function(s, d) { return s + d.totalExpense; }, 0);
  var weekBills = weekly.reduce(function(s, d) { return s + d.billCount; }, 0);

  var monthly = getMonthlyReport();
  var monthTotal = monthly.reduce(function(s, d) { return s + d.totalIncome; }, 0);
  var monthExpense = monthly.reduce(function(s, d) { return s + d.totalExpense; }, 0);

  // CUKCUK data
  var cukcukWeek = _getCukcukDailySummary('week');
  var cukcukMonth = _getCukcukDailySummary('month');
  var lastSync = _getCukcukLastSync();

  // Previous periods for comparison
  var prevWeek = _getPreviousPeriodRevenue('week');
  var prevMonth = _getPreviousPeriodRevenue('month');

  var effectiveWeek = cukcukWeek ? Math.max(weekTotal, cukcukWeek.totalRevenue) : weekTotal;
  var effectiveMonth = cukcukMonth ? Math.max(monthTotal, cukcukMonth.totalRevenue) : monthTotal;
  var prevWeekVal = prevWeek ? prevWeek.totalRevenue : 0;
  var prevMonthVal = prevMonth ? prevMonth.totalRevenue : 0;

  var today = new Date();
  var todayLabel = today.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  // Build daily bar data from CUKCUK + shift data
  var barDays = [];
  if (cukcukWeek && cukcukWeek.days && cukcukWeek.days.length > 0) {
    barDays = cukcukWeek.days;
  } else {
    barDays = weekly.map(function(d) { return { date: d.date, total: d.totalIncome, bills: d.billCount }; });
  }

  return '<div class="section-header">' +
    '<div>' +
      '<h3>📊 Báo cáo & Phân tích</h3>' +
      '<p>Tổng hợp doanh thu theo ngày/tuần/tháng' + (hasCukcuk ? ' — Đồng bộ từ CUKCUK' : '') + '</p>' +
    '</div>' +
    '<div class="btn-group">' +
      (hasCukcuk ? '<button class="btn btn-success btn-sm" id="btnSyncAnalytics"><span class="material-symbols-rounded">sync</span> Đồng bộ CUKCUK</button>' : '') +
      '<button class="btn btn-outline btn-sm" id="btnExportCSV"><span class="material-symbols-rounded">download</span> Xuất CSV</button>' +
    '</div>' +
  '</div>' +

  // ═══ TODAY'S CUKCUK REVENUE ═══
  (hasCukcuk && lastSync ? '<div class="card" style="margin-bottom:16px;border:1px solid rgba(16,185,129,0.3);background:linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%);">' +
    '<div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">' +
      '<h3 style="color:#10b981;display:flex;align-items:center;gap:8px;margin:0;">' +
        '<span class="material-symbols-rounded">today</span> Doanh thu CUKCUK hôm nay — ' + todayLabel +
      '</h3>' +
      '<span class="text-muted" style="font-size:10px;">Cập nhật: ' + (lastSync.lastSync ? new Date(lastSync.lastSync).toLocaleTimeString('vi-VN') : '—') + '</span>' +
    '</div>' +
    '<div class="card-body" style="padding:16px 20px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">' +
        '<div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border-radius:10px;">' +
          '<div class="text-muted" style="font-size:10px;margin-bottom:4px;">💰 Tổng doanh thu</div>' +
          '<div style="font-size:22px;font-weight:800;color:#10b981;">' + formatCurrency(lastSync.total) + '</div>' +
          '<div style="font-size:11px;color:#10b981;margin-top:2px;">' + lastSync.bills + ' bill</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px;background:rgba(34,197,94,0.06);border-radius:10px;">' +
          '<div class="text-muted" style="font-size:10px;margin-bottom:4px;">💵 Tiền mặt</div>' +
          '<div style="font-size:18px;font-weight:700;color:var(--success);">' + formatCurrency(lastSync.cash) + '</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px;background:rgba(59,130,246,0.06);border-radius:10px;">' +
          '<div class="text-muted" style="font-size:10px;margin-bottom:4px;">💳 Quẹt thẻ</div>' +
          '<div style="font-size:18px;font-weight:700;color:var(--info);">' + formatCurrency(lastSync.card) + '</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px;background:rgba(232,168,56,0.06);border-radius:10px;">' +
          '<div class="text-muted" style="font-size:10px;margin-bottom:4px;">🏦 Chuyển khoản</div>' +
          '<div style="font-size:18px;font-weight:700;color:var(--primary);">' + formatCurrency(lastSync.transfer) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>' : '') +

  // ═══ OVERVIEW STATS WITH COMPARISON ═══
  '<div class="stats-grid">' +
    '<div class="stat-card stat-success">' +
      '<div class="stat-icon"><span class="material-symbols-rounded">calendar_month</span></div>' +
      '<div class="stat-info">' +
        '<span class="stat-label">Doanh thu tháng này</span>' +
        '<span class="stat-value">' + formatCurrency(effectiveMonth) + _changeBadge(effectiveMonth, prevMonthVal) + '</span>' +
        (prevMonthVal > 0 ? '<span class="stat-sub text-muted" style="font-size:10px;">Tháng trước: ' + formatCurrency(prevMonthVal) + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="stat-card stat-info">' +
      '<div class="stat-icon"><span class="material-symbols-rounded">date_range</span></div>' +
      '<div class="stat-info">' +
        '<span class="stat-label">Doanh thu 7 ngày</span>' +
        '<span class="stat-value">' + formatCurrency(effectiveWeek) + _changeBadge(effectiveWeek, prevWeekVal) + '</span>' +
        (prevWeekVal > 0 ? '<span class="stat-sub text-muted" style="font-size:10px;">7 ngày trước: ' + formatCurrency(prevWeekVal) + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="stat-card stat-danger">' +
      '<div class="stat-icon"><span class="material-symbols-rounded">money_off</span></div>' +
      '<div class="stat-info">' +
        '<span class="stat-label">Chi phí tháng</span>' +
        '<span class="stat-value">' + formatCurrency(monthExpense) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="stat-card stat-primary">' +
      '<div class="stat-icon"><span class="material-symbols-rounded">shopping_bag</span></div>' +
      '<div class="stat-info">' +
        '<span class="stat-label">Tổng bill tuần</span>' +
        '<span class="stat-value">' + (cukcukWeek ? Math.max(weekBills, cukcukWeek.totalBills) : weekBills) + '</span>' +
      '</div>' +
    '</div>' +
  '</div>' +

  // ═══ CUKCUK PAYMENT BREAKDOWN (WEEK) ═══
  (hasCukcuk && cukcukWeek && cukcukWeek.totalRevenue > 0 ? (function() {
    var maxPmt = Math.max(cukcukWeek.totalCash, cukcukWeek.totalCard, cukcukWeek.totalTransfer, 1);
    var total = cukcukWeek.totalRevenue || 1;
    var items = [
      { label: 'Tiền mặt', icon: 'payments', value: cukcukWeek.totalCash, color: 'var(--success)', pct: Math.round(cukcukWeek.totalCash / total * 100) },
      { label: 'Quẹt thẻ', icon: 'credit_card', value: cukcukWeek.totalCard, color: 'var(--info)', pct: Math.round(cukcukWeek.totalCard / total * 100) },
      { label: 'Chuyển khoản', icon: 'swap_horiz', value: cukcukWeek.totalTransfer, color: 'var(--primary)', pct: Math.round(cukcukWeek.totalTransfer / total * 100) }
    ];
    return '<div class="card mb-20">' +
      '<div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">' +
        '<h3 style="display:flex;align-items:center;gap:6px;"><span class="material-symbols-rounded" style="color:#10b981;font-size:18px;">credit_score</span>Tổng hợp hình thức thanh toán (7 ngày)</h3>' +
      '</div>' +
      '<div class="card-body">' +
        items.map(function(item) {
          return '<div class="payment-row">' +
            '<div class="payment-label"><span class="material-symbols-rounded" style="color:' + item.color + ';font-size:18px;">' + item.icon + '</span><span>' + item.label + '</span><span class="text-muted" style="font-size:11px;margin-left:4px;">(' + item.pct + '%)</span></div>' +
            '<div class="payment-bar-wrap" style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">' +
              '<div style="width:' + (item.value / maxPmt * 100) + '%;height:100%;background:' + item.color + ';border-radius:4px;transition:width .5s ease;min-width:2px;"></div>' +
            '</div>' +
            '<span class="payment-amount">' + formatCurrency(item.value) + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  })() : '') +

  // ═══ BAR CHART — 7 NGÀY ═══
  '<div class="card mb-20">' +
    '<div class="card-header"><h3>📊 Biểu đồ doanh thu 7 ngày</h3></div>' +
    '<div class="card-body">' +
      _renderBarChart(barDays) +
    '</div>' +
  '</div>' +

  // ═══ MONTHLY DETAIL TABLE ═══
  '<div class="card">' +
    '<div class="card-header">' +
      '<h3>📅 Chi tiết theo ngày (tháng này)</h3>' +
      (cukcukMonth && cukcukMonth.daysWithData > 0 ? '<span class="tag tag-income" style="font-size:10px;">' + cukcukMonth.daysWithData + ' ngày có doanh thu</span>' : '') +
    '</div>' +
    (function() {
      var cukcukDays = cukcukMonth ? cukcukMonth.days : [];
      var mergedMonthly = monthly.map(function(d) {
        var cd = cukcukDays.find(function(c) { return c && c.date === d.date; });
        return {
          date: d.date, shifts: d.shifts,
          billCount: cd && cd.bills > d.billCount ? cd.bills : d.billCount,
          totalIncome: cd && cd.total > d.totalIncome ? cd.total : d.totalIncome,
          totalExpense: d.totalExpense,
          cashTotal: cd ? cd.cash : d.cashTotal,
          cardTotal: cd ? cd.card : d.cardTotal,
          transferTotal: cd ? cd.transfer : d.transferTotal,
          net: (cd && cd.total > d.totalIncome ? cd.total : d.totalIncome) - d.totalExpense,
          source: cd && cd.source === 'cukcuk' ? 'cukcuk' : 'local'
        };
      });
      var hasData = mergedMonthly.filter(function(d) { return d.totalIncome > 0 || d.totalExpense > 0; });
      if (hasData.length === 0) {
        return '<div class="card-body"><p class="text-muted text-center" style="padding:24px;">Chưa có dữ liệu tháng này</p></div>';
      }
      return '<div class="table-wrap"><table>' +
        '<thead><tr><th>Ngày</th><th>Ca</th><th>Bills</th><th class="text-right">💵 TM</th><th class="text-right">💳 Thẻ</th><th class="text-right">🏦 CK</th><th class="text-right">Doanh thu</th><th class="text-right">Chi phí</th><th class="text-right">Lợi nhuận</th></tr></thead>' +
        '<tbody>' +
          hasData.reverse().map(function(d) {
            return '<tr' + (d.source === 'cukcuk' ? ' style="border-left:3px solid rgba(16,185,129,0.4);"' : '') + '>' +
              '<td>' + formatDate(d.date) + '</td>' +
              '<td>' + d.shifts + '</td>' +
              '<td>' + d.billCount + '</td>' +
              '<td class="text-right" style="color:var(--success);font-size:12px;">' + formatCurrency(d.cashTotal) + '</td>' +
              '<td class="text-right" style="color:var(--info);font-size:12px;">' + formatCurrency(d.cardTotal) + '</td>' +
              '<td class="text-right" style="color:var(--primary);font-size:12px;">' + formatCurrency(d.transferTotal) + '</td>' +
              '<td class="text-right amount-in">' + formatCurrency(d.totalIncome) + '</td>' +
              '<td class="text-right amount-out">' + formatCurrency(d.totalExpense) + '</td>' +
              '<td class="text-right" style="color:' + (d.net >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-weight:700;">' + formatCurrency(d.net) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>';
    })() +
  '</div>';
}

export function init() {
  // Load CUKCUK module if not loaded yet, then re-render
  if (!_cukcukRevenue) {
    import('../integration/invoiceStore.js').then(function(mod) {
      _cukcukRevenue = mod;
      window.refreshView && window.refreshView();
    }).catch(function() {});
  }

  // Sync button
  var btnSync = document.getElementById('btnSyncAnalytics');
  if (btnSync) btnSync.addEventListener('click', async function() {
    btnSync.disabled = true;
    btnSync.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    try {
      var { syncTransactions } = await import('../integration/cukcuk.js');
      var result = await syncTransactions(true);
      if (result && result.success) {
        window.refreshView && window.refreshView();
      }
    } catch(e) {
      console.warn('[Analytics] CUKCUK sync error:', e);
    }
    btnSync.disabled = false;
    btnSync.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ CUKCUK';
  });

  // Export CSV
  var btnCSV = document.getElementById('btnExportCSV');
  if (btnCSV) btnCSV.addEventListener('click', function() {
    var monthly = getMonthlyReport().filter(function(d) { return d.totalIncome > 0 || d.totalExpense > 0; });
    if (monthly.length === 0) { showToast('Không có dữ liệu để xuất', 'warning'); return; }

    var csv = 'Ngày,Số ca,Số bill,Doanh thu,Chi phí,Lợi nhuận,Tiền mặt,Thẻ,Chuyển khoản\n';
    monthly.forEach(function(d) {
      csv += '"' + d.date + '",' + d.shifts + ',' + d.billCount + ',' + d.totalIncome + ',' + d.totalExpense + ',' + d.net + ',' + d.cashTotal + ',' + d.cardTotal + ',' + d.transferTotal + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'kg-cashier-report-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}
