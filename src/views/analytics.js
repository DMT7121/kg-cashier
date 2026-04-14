/* ── Analytics View (Feature 4) ─────────────── */
import { getShiftHistory, getShiftSummary, getDailyReport, getWeeklyReport, getMonthlyReport } from '../store.js';
import { formatCurrency, formatDate } from '../utils.js';

export function render() {
  const weekly = getWeeklyReport();
  const allShifts = getShiftHistory();

  const weekTotal = weekly.reduce((s, d) => s + d.totalIncome, 0);
  const weekExpense = weekly.reduce((s, d) => s + d.totalExpense, 0);
  const weekBills = weekly.reduce((s, d) => s + d.billCount, 0);
  const maxIncome = Math.max(...weekly.map(d => d.totalIncome), 1);

  // Monthly stats
  const monthly = getMonthlyReport();
  const monthTotal = monthly.reduce((s, d) => s + d.totalIncome, 0);
  const monthExpense = monthly.reduce((s, d) => s + d.totalExpense, 0);

  return `
    <div class="section-header">
      <div>
        <h3>📊 Báo cáo & Phân tích</h3>
        <p>Tổng hợp doanh thu theo ngày/tuần/tháng</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnExportCSV">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card stat-success">
        <div class="stat-icon"><span class="material-symbols-rounded">calendar_month</span></div>
        <div class="stat-info">
          <span class="stat-label">Doanh thu tháng này</span>
          <span class="stat-value">${formatCurrency(monthTotal)}</span>
        </div>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-icon"><span class="material-symbols-rounded">date_range</span></div>
        <div class="stat-info">
          <span class="stat-label">Doanh thu 7 ngày</span>
          <span class="stat-value">${formatCurrency(weekTotal)}</span>
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
          <span class="stat-value">${weekBills}</span>
        </div>
      </div>
    </div>

    <!-- Weekly chart -->
    <div class="card mb-20">
      <div class="card-header"><h3>📈 Doanh thu 7 ngày gần nhất</h3></div>
      <div class="card-body">
        <div class="chart-bars">
          ${weekly.map(day => {
            const pct = maxIncome > 0 ? Math.round(day.totalIncome / maxIncome * 100) : 0;
            const d = new Date(day.date);
            const label = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
            return `
              <div class="chart-bar-col">
                <div class="chart-bar-value">${day.totalIncome > 0 ? formatCurrency(day.totalIncome) : '—'}</div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="height:${pct}%"></div>
                </div>
                <div class="chart-bar-label">${label}</div>
                <div class="chart-bar-sub">${day.billCount} bill</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Monthly detail -->
    <div class="card">
      <div class="card-header"><h3>📅 Chi tiết theo ngày (tháng này)</h3></div>
      ${monthly.filter(d => d.totalIncome > 0 || d.totalExpense > 0).length === 0 ? `
        <div class="card-body"><p class="text-muted text-center" style="padding:24px;">Chưa có dữ liệu tháng này</p></div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ngày</th><th>Ca</th><th>Bills</th><th class="text-right">Doanh thu</th><th class="text-right">Chi phí</th><th class="text-right">Lợi nhuận</th></tr></thead>
            <tbody>
              ${monthly.filter(d => d.totalIncome > 0 || d.totalExpense > 0).reverse().map(d => `
                <tr>
                  <td>${formatDate(d.date)}</td>
                  <td>${d.shifts}</td>
                  <td>${d.billCount}</td>
                  <td class="text-right amount-in">${formatCurrency(d.totalIncome)}</td>
                  <td class="text-right amount-out">${formatCurrency(d.totalExpense)}</td>
                  <td class="text-right" style="color: ${d.net >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${formatCurrency(d.net)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
    </div>`;
}

export function init() {
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
