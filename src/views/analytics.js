/* ── Analytics View (Feature 4) — Enhanced with CUKCUK Revenue Tracking ── */
import { getShiftHistory, getShiftSummary, getDailyReport, getWeeklyReport, getMonthlyReport, getSettings } from '../store.js';
import { formatCurrency, formatDate } from '../utils.js';

// Try to load CUKCUK revenue helpers
var _cukcukRevenue = null;
try {
  import('../integration/cukcuk.js').then(function(mod) {
    _cukcukRevenue = mod;
  }).catch(function() {});
} catch(e) { /* ignore */ }

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

export function render() {
  const weekly = getWeeklyReport();
  const allShifts = getShiftHistory();
  const settings = getSettings();
  const hasCukcuk = settings.cukcuk && settings.cukcuk.domain && settings.cukcuk.key;

  const weekTotal = weekly.reduce((s, d) => s + d.totalIncome, 0);
  const weekExpense = weekly.reduce((s, d) => s + d.totalExpense, 0);
  const weekBills = weekly.reduce((s, d) => s + d.billCount, 0);
  const maxIncome = Math.max(...weekly.map(d => d.totalIncome), 1);

  // Monthly stats
  const monthly = getMonthlyReport();
  const monthTotal = monthly.reduce((s, d) => s + d.totalIncome, 0);
  const monthExpense = monthly.reduce((s, d) => s + d.totalExpense, 0);

  // CUKCUK revenue summary
  const cukcukWeek = _getCukcukDailySummary('week');
  const cukcukMonth = _getCukcukDailySummary('month');
  const lastSync = _getCukcukLastSync();

  // Determine today's date for display
  const today = new Date();
  const todayLabel = today.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  return `
    <div class="section-header">
      <div>
        <h3>📊 Báo cáo & Phân tích</h3>
        <p>Tổng hợp doanh thu theo ngày/tuần/tháng${hasCukcuk ? ' — Đồng bộ từ CUKCUK' : ''}</p>
      </div>
      <div class="btn-group">
        ${hasCukcuk ? `
        <button class="btn btn-success btn-sm" id="btnSyncAnalytics">
          <span class="material-symbols-rounded">sync</span> Đồng bộ CUKCUK
        </button>` : ''}
        <button class="btn btn-outline btn-sm" id="btnExportCSV">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <!-- ═══ TODAY'S CUKCUK REVENUE ═══ -->
    ${hasCukcuk && lastSync ? `
    <div class="card" style="margin-bottom:16px;border:1px solid rgba(16,185,129,0.3);background:linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%);">
      <div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">
        <h3 style="color:#10b981;display:flex;align-items:center;gap:8px;margin:0;">
          <span class="material-symbols-rounded">today</span> Doanh thu CUKCUK hôm nay — ${todayLabel}
        </h3>
        <span class="text-muted" style="font-size:10px;">Cập nhật: ${lastSync.lastSync ? new Date(lastSync.lastSync).toLocaleTimeString('vi-VN') : '—'}</span>
      </div>
      <div class="card-body" style="padding:16px 20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
          <div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border-radius:10px;">
            <div class="text-muted" style="font-size:10px;margin-bottom:4px;">💰 Tổng doanh thu</div>
            <div style="font-size:22px;font-weight:800;color:#10b981;">${formatCurrency(lastSync.total)}</div>
            <div style="font-size:11px;color:#10b981;margin-top:2px;">${lastSync.bills} bill</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(34,197,94,0.06);border-radius:10px;">
            <div class="text-muted" style="font-size:10px;margin-bottom:4px;">💵 Tiền mặt</div>
            <div style="font-size:18px;font-weight:700;color:var(--success);">${formatCurrency(lastSync.cash)}</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(59,130,246,0.06);border-radius:10px;">
            <div class="text-muted" style="font-size:10px;margin-bottom:4px;">💳 Quẹt thẻ</div>
            <div style="font-size:18px;font-weight:700;color:var(--info);">${formatCurrency(lastSync.card)}</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(232,168,56,0.06);border-radius:10px;">
            <div class="text-muted" style="font-size:10px;margin-bottom:4px;">🏦 Chuyển khoản</div>
            <div style="font-size:18px;font-weight:700;color:var(--primary);">${formatCurrency(lastSync.transfer)}</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- ═══ OVERVIEW STATS ═══ -->
    <div class="stats-grid">
      <div class="stat-card stat-success">
        <div class="stat-icon"><span class="material-symbols-rounded">calendar_month</span></div>
        <div class="stat-info">
          <span class="stat-label">Doanh thu tháng này</span>
          <span class="stat-value">${formatCurrency(cukcukMonth ? Math.max(monthTotal, cukcukMonth.totalRevenue) : monthTotal)}</span>
          ${cukcukMonth && cukcukMonth.daysWithData > 0 ? `<span class="stat-sub text-muted" style="font-size:10px;">TB/ngày: ${formatCurrency(cukcukMonth.avgDaily)}</span>` : ''}
        </div>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-icon"><span class="material-symbols-rounded">date_range</span></div>
        <div class="stat-info">
          <span class="stat-label">Doanh thu 7 ngày</span>
          <span class="stat-value">${formatCurrency(cukcukWeek ? Math.max(weekTotal, cukcukWeek.totalRevenue) : weekTotal)}</span>
          ${cukcukWeek && cukcukWeek.daysWithData > 0 ? `<span class="stat-sub text-muted" style="font-size:10px;">TB/ngày: ${formatCurrency(cukcukWeek.avgDaily)}</span>` : ''}
        </div>
      </div>
      <div class="stat-card stat-danger">
        <div class="stat-icon"><span class="material-symbols-rounded">money_off</span></div>
        <div class="stat-info">
          <span class="stat-label">Chi phí tháng</span>
          <span class="stat-value">${formatCurrency(monthExpense)}</span>
        </div>
      </div>
      <div class="stat-card stat-primary">
        <div class="stat-icon"><span class="material-symbols-rounded">shopping_bag</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng bill tuần</span>
          <span class="stat-value">${cukcukWeek ? Math.max(weekBills, cukcukWeek.totalBills) : weekBills}</span>
        </div>
      </div>
    </div>

    <!-- ═══ CUKCUK PAYMENT BREAKDOWN (WEEK) ═══ -->
    ${hasCukcuk && cukcukWeek && cukcukWeek.totalRevenue > 0 ? `
    <div class="card mb-20">
      <div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">
        <h3 style="display:flex;align-items:center;gap:6px;">
          <span class="material-symbols-rounded" style="color:#10b981;font-size:18px;">credit_score</span>
          Tổng hợp hình thức thanh toán (7 ngày)
        </h3>
      </div>
      <div class="card-body">
        ${(() => {
          const maxPmt = Math.max(cukcukWeek.totalCash, cukcukWeek.totalCard, cukcukWeek.totalTransfer, 1);
          const total = cukcukWeek.totalRevenue || 1;
          return [
            { label: 'Tiền mặt', icon: 'payments', value: cukcukWeek.totalCash, color: 'var(--success)', pct: Math.round(cukcukWeek.totalCash / total * 100) },
            { label: 'Quẹt thẻ', icon: 'credit_card', value: cukcukWeek.totalCard, color: 'var(--info)', pct: Math.round(cukcukWeek.totalCard / total * 100) },
            { label: 'Chuyển khoản', icon: 'swap_horiz', value: cukcukWeek.totalTransfer, color: 'var(--primary)', pct: Math.round(cukcukWeek.totalTransfer / total * 100) }
          ].map(item => `
            <div class="payment-row">
              <div class="payment-label">
                <span class="material-symbols-rounded" style="color:${item.color};font-size:18px;">${item.icon}</span>
                <span>${item.label}</span>
                <span class="text-muted" style="font-size:11px;margin-left:4px;">(${item.pct}%)</span>
              </div>
              <div class="payment-bar-wrap" style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                <div style="width:${item.value / maxPmt * 100}%;height:100%;background:${item.color};border-radius:4px;transition:width .5s ease;min-width:2px;"></div>
              </div>
              <span class="payment-amount">${formatCurrency(item.value)}</span>
            </div>
          `).join('');
        })()}
      </div>
    </div>
    ` : ''}

    <!-- ═══ WEEKLY CHART ═══ -->
    <div class="card mb-20">
      <div class="card-header"><h3>📈 Doanh thu 7 ngày gần nhất</h3></div>
      <div class="card-body">
        <div class="chart-bars">
          ${(() => {
            // Merge weekly data with CUKCUK data if available
            var cukcukDays = cukcukWeek ? cukcukWeek.days : [];
            return weekly.map((day, idx) => {
              // Use CUKCUK data if available and greater
              var cukcukDay = cukcukDays[idx];
              var income = day.totalIncome;
              if (cukcukDay && cukcukDay.total > income) income = cukcukDay.total;
              var barMax = Math.max(...weekly.map(dd => dd.totalIncome), ...(cukcukDays.map(cd => cd ? cd.total : 0)), 1);
              var pct = barMax > 0 ? Math.round(income / barMax * 100) : 0;
              var d = new Date(day.date);
              var label = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
              var bills = cukcukDay && cukcukDay.bills > day.billCount ? cukcukDay.bills : day.billCount;
              return `
                <div class="chart-bar-col">
                  <div class="chart-bar-value">${income > 0 ? formatCurrency(income) : '—'}</div>
                  <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="height:${pct}%"></div>
                  </div>
                  <div class="chart-bar-label">${label}</div>
                  <div class="chart-bar-sub">${bills} bill</div>
                </div>`;
            }).join('');
          })()}
        </div>
      </div>
    </div>

    <!-- ═══ MONTHLY DETAIL ═══ -->
    <div class="card">
      <div class="card-header">
        <h3>📅 Chi tiết theo ngày (tháng này)</h3>
        ${cukcukMonth && cukcukMonth.daysWithData > 0 ? `<span class="tag tag-income" style="font-size:10px;">${cukcukMonth.daysWithData} ngày có doanh thu</span>` : ''}
      </div>
      ${(() => {
        // Merge monthly data with CUKCUK daily cache
        var cukcukDays = cukcukMonth ? cukcukMonth.days : [];
        var mergedMonthly = monthly.map((d, idx) => {
          var cd = cukcukDays.find(c => c && c.date === d.date);
          return {
            date: d.date,
            shifts: d.shifts,
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
        var hasData = mergedMonthly.filter(d => d.totalIncome > 0 || d.totalExpense > 0);
        if (hasData.length === 0) {
          return '<div class="card-body"><p class="text-muted text-center" style="padding:24px;">Chưa có dữ liệu tháng này</p></div>';
        }
        return `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Ngày</th><th>Ca</th><th>Bills</th>
                <th class="text-right">💵 TM</th>
                <th class="text-right">💳 Thẻ</th>
                <th class="text-right">🏦 CK</th>
                <th class="text-right">Doanh thu</th>
                <th class="text-right">Chi phí</th>
                <th class="text-right">Lợi nhuận</th>
              </tr></thead>
              <tbody>
                ${hasData.reverse().map(d => `
                  <tr${d.source === 'cukcuk' ? ' style="border-left:3px solid rgba(16,185,129,0.4);"' : ''}>
                    <td>${formatDate(d.date)}</td>
                    <td>${d.shifts}</td>
                    <td>${d.billCount}</td>
                    <td class="text-right" style="color:var(--success);font-size:12px;">${formatCurrency(d.cashTotal)}</td>
                    <td class="text-right" style="color:var(--info);font-size:12px;">${formatCurrency(d.cardTotal)}</td>
                    <td class="text-right" style="color:var(--primary);font-size:12px;">${formatCurrency(d.transferTotal)}</td>
                    <td class="text-right amount-in">${formatCurrency(d.totalIncome)}</td>
                    <td class="text-right amount-out">${formatCurrency(d.totalExpense)}</td>
                    <td class="text-right" style="color: ${d.net >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${formatCurrency(d.net)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      })()}
    </div>`;
}

export function init() {
  // Sync button
  document.getElementById('btnSyncAnalytics')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSyncAnalytics');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    }
    try {
      const { syncTransactions } = await import('../integration/cukcuk.js');
      const result = await syncTransactions();
      if (result && result.success) {
        window.refreshView?.();
      }
    } catch(e) {
      console.warn('[Analytics] CUKCUK sync error:', e);
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ CUKCUK';
    }
  });

  // Export CSV
  document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    const monthly = getMonthlyReport().filter(d => d.totalIncome > 0 || d.totalExpense > 0);
    if (monthly.length === 0) { alert('Không có dữ liệu để xuất'); return; }

    let csv = 'Ngày,Số ca,Số bill,Doanh thu,Chi phí,Lợi nhuận,Tiền mặt,Thẻ,Chuyển khoản\n';
    monthly.forEach(d => {
      csv += `${d.date},${d.shifts},${d.billCount},${d.totalIncome},${d.totalExpense},${d.net},${d.cashTotal},${d.cardTotal},${d.transferTotal}\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kg-cashier-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
