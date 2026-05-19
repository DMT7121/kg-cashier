/* ── Dashboard View ─────────────────────────── */
import { getCurrentShift, getShiftSummary, getHistorySummary, getShiftHistory, getSettings, getNotifications, getUnreadCount, markAllRead } from '../store.js';
import { formatCurrency, formatDate, formatTime, formatDuration, showConfirm } from '../utils.js';

let _revenuePeriod = 'month'; // default view

function _formatDateVN(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
  return dateStr;
}

function renderShiftDashboard(shift) {
  if (!shift) return '';
  const summary = getShiftSummary(shift);
  const settings = getSettings();
  const cukcuk = settings.cukcuk;
  const hasCukcuk = cukcuk && cukcuk.domain && cukcuk.key;

  const maxPayment = Math.max(summary.cashIncome, summary.cardIncome, summary.transferIncome, 1);

  return `
    <div class="shift-status-bar">
      <div class="shift-meta">
        <span>👤 ${shift.cashierName}</span>
        <span># Ca ${shift.shiftNumber}</span>
        <span>📅 ${formatDate(shift.date)}</span>
        <span>⏱ ${formatDuration(shift.startTime)}</span>
      </div>
    </div>

    <!-- ═══ CUKCUK POS REVENUE ═══ -->
    ${hasCukcuk ? (() => {
      // Read CUKCUK revenue from Invoice Store using working day boundaries
      // Working day: 12:00 PM today → 06:00 AM tomorrow
      var cukRev = { total: 0, cash: 0, card: 0, transfer: 0, bills: 0 };
      try {
        var storeData = localStorage.getItem('cukcuk_invoice_store');
        if (storeData) {
          var parsed = JSON.parse(storeData);
          if (parsed && parsed.invoices) {
            // Calculate working day bounds
            var now = new Date();
            var workDay = new Date(now);
            if (workDay.getHours() < 6) workDay.setDate(workDay.getDate() - 1);
            var dayStart = new Date(workDay.getFullYear(), workDay.getMonth(), workDay.getDate(), 12, 0, 0);
            var dayNext = new Date(workDay);
            dayNext.setDate(dayNext.getDate() + 1);
            var dayEnd = new Date(dayNext.getFullYear(), dayNext.getMonth(), dayNext.getDate(), 6, 0, 0);
            
            for (var k in parsed.invoices) {
              if (!parsed.invoices.hasOwnProperty(k)) continue;
              var inv = parsed.invoices[k];
              // Filter by refDate timestamp (working day boundaries)
              var inRange = false;
              if (inv.refDate) {
                var dt = new Date(inv.refDate);
                if (!isNaN(dt.getTime())) {
                  inRange = dt >= dayStart && dt < dayEnd;
                }
              }
              if (!inRange && inv.date) {
                // Fallback: match shift date
                inRange = inv.date === (shift.date || '');
              }
              if (inRange) {
                cukRev.bills++;
                var invPaymentTotal = 0;
                (inv.payments || []).forEach(function(p) {
                  if (p.method === 'cash') { cukRev.cash += p.amount || 0; invPaymentTotal += p.amount || 0; }
                  else if (p.method === 'card') { cukRev.card += p.amount || 0; invPaymentTotal += p.amount || 0; }
                  else if (p.method === 'transfer') { cukRev.transfer += p.amount || 0; invPaymentTotal += p.amount || 0; }
                });
                // Use sum of payments as total (ensures consistency)
                // Fallback to inv.amount only if no payments exist
                cukRev.total += invPaymentTotal > 0 ? invPaymentTotal : (inv.amount || 0);
              }
            }
          }
        }
      } catch(e) {}
      return `
    <div class="card mb-4 border-emerald-200 bg-emerald-50/30">
      <div class="card-header border-emerald-100">
        <h3 class="text-emerald-600 flex items-center gap-2 m-0 text-lg">
          <span class="material-symbols-rounded">point_of_sale</span> Doanh thu POS — ${new Date().toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'})}
        </h3>
        <div class="flex items-center gap-2">
          <button class="btn btn-success btn-sm whitespace-nowrap" id="btnDashSyncCukcuk">
            <span class="material-symbols-rounded">sync</span> Đồng bộ
          </button>
        </div>
      </div>
      <!-- Sync Status Bar -->
      <div id="syncStatusBar" class="sync-status-bar"></div>
      <div class="card-body p-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <div class="text-xs text-emerald-600/70 font-semibold uppercase tracking-wider mb-2">💰 Doanh thu bán hàng (CUKCUK)</div>
            <div class="text-3xl font-bold text-emerald-600">${formatCurrency(cukRev.total)}</div>
            <div class="text-xs text-emerald-600 mt-2">${cukRev.bills} bill thanh toán</div>
          </div>
          <div class="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <div class="text-xs text-blue-600/70 font-semibold uppercase tracking-wider mb-2">✍️ Thu nhập thủ công khác</div>
            <div class="text-3xl font-bold text-blue-600">${formatCurrency(summary.manualIncome)}</div>
            <div class="text-xs text-blue-600 mt-2">${summary.manualBills} khoản</div>
          </div>
        </div>
      </div>
    </div>`;
    })() : ''}

    <!-- ═══ DOANH THU CUKCUK THEO KỲ ═══ -->
    ${hasCukcuk ? `
    <div class="card mb-4 border-indigo-200 bg-indigo-50/30">
      <div class="card-header border-indigo-100">
        <h3 class="text-indigo-600 flex items-center gap-2 m-0 text-lg">
          <span class="material-symbols-rounded">bar_chart</span> Tổng doanh thu CUKCUK
        </h3>
        <div class="flex gap-1" id="revenuePeriodBtns">
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'month' ? 'active' : ''}" data-period="month">Tháng</button>
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Quý</button>
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'year' ? 'active' : ''}" data-period="year">Năm</button>
        </div>
      </div>
      <div class="card-body p-5" id="revenuePeriodContent">
        <div class="text-slate-500 text-center p-5">⏳ Đang tải...</div>
      </div>
    </div>
    ` : ''}

    <!-- ═══ TỔNG HỢP THU CHI (Webapp) ═══ -->
    <div class="stats-grid">
      <div class="stat-card stat-primary">
        <div class="stat-icon"><span class="material-symbols-rounded">account_balance_wallet</span></div>
        <div class="stat-info">
          <span class="stat-label">Tiền đầu ca</span>
          <span class="stat-value">${formatCurrency(shift.startingCash)}</span>
        </div>
      </div>
      <div class="stat-card stat-success">
        <div class="stat-icon"><span class="material-symbols-rounded">trending_up</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng THU trong ca</span>
          <span class="stat-value">${formatCurrency(summary.totalIncome)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">${hasCukcuk ? 'CUKCUK: ' + formatCurrency(summary.cukcukRevenue) + ' + Khác: ' + formatCurrency(summary.manualIncome) : summary.billCount + ' bill'}</span>
        </div>
      </div>
      <div class="stat-card stat-danger">
        <div class="stat-icon"><span class="material-symbols-rounded">trending_down</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng CHI trong ca</span>
          <span class="stat-value">${formatCurrency(summary.totalExpense)}</span>
        </div>
      </div>
      <div class="stat-card" style="border-left-color: var(--primary);">
        <div class="stat-icon"><span class="material-symbols-rounded">payments</span></div>
        <div class="stat-info">
          <span class="stat-label">Tiền mặt kỳ vọng</span>
          <span class="stat-value">${formatCurrency(summary.expectedCash)}</span>
          <span class="stat-sub text-muted" style="font-size:10px;">= Đầu ca + TM thu − TM chi ± Khác</span>
        </div>
      </div>
    </div>

    <!-- ═══ PAYMENT BREAKDOWN + RECENT ═══ -->
    <div class="dashboard-grid">
      <!-- Payment Breakdown -->
      <div class="card">
        <div class="card-header"><h3>💳 Phương thức thanh toán</h3></div>
        <div class="card-body">
          ${[
            { label: 'Tiền mặt', icon: 'payments', value: summary.cashIncome, color: 'var(--success)' },
            { label: 'Quẹt thẻ', icon: 'credit_card', value: summary.cardIncome, color: 'var(--info)' },
            { label: 'Chuyển khoản', icon: 'swap_horiz', value: summary.transferIncome, color: 'var(--primary)' }
          ].map(item => `
            <div class="payment-row">
              <div class="payment-label">
                <span class="material-symbols-rounded" style="color:${item.color};font-size:18px;">${item.icon}</span>
                <span>${item.label}</span>
              </div>
              <div class="payment-bar-wrap">
                <div class="payment-bar" style="width:${(item.value / maxPayment * 100)}%;background:${item.color};"></div>
              </div>
              <span class="payment-value">${formatCurrency(item.value)}</span>
            </div>
          `).join('')}
        </div>
      </div>

    <!-- Recent Transactions -->
      <div class="card">
        <div class="card-header"><h3>🕒 Giao dịch gần đây</h3></div>
        <div class="card-body max-h-[240px] overflow-y-auto pr-2">
          ${(shift.transactions || []).slice(-8).reverse().map(tx => {
            const isCukcuk = tx.note && tx.note.indexOf('[CUKCUK]') !== -1;
            return `
              <div class="flex items-center justify-between gap-3 p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-xl transition-colors">
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
                    <span class="material-symbols-rounded text-[18px]">${tx.type === 'income' ? 'arrow_downward' : 'arrow_upward'}</span>
                  </span>
                  <div>
                    <span class="block text-sm font-semibold text-slate-800">${isCukcuk ? '🔗 ' : ''}${tx.category}</span>
                    <span class="block text-xs text-slate-500">${tx.note ? tx.note.substring(0, 50) : ''}</span>
                  </div>
                </div>
                <span class="font-bold tabular-nums ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}</span>
              </div>
            `;
          }).join('') || '<div class="text-slate-500 text-center p-5">Chưa có giao dịch</div>'}
        </div>
      </div>
    </div>

    <!-- ═══ RECENT SHIFTS ═══ -->
    <div class="card mt-3">
      <div class="card-header"><h3>📋 Ca gần đây</h3></div>
      <div class="card-body max-h-[200px] overflow-y-auto">
        ${(function() {
          const history = getShiftHistory().slice(0, 5);
          if (history.length === 0) return '<div class="text-slate-500 text-center p-5">Chưa có lịch sử ca</div>';
          return history.map(function(sh) {
            const sm = getHistorySummary(sh);
            return '<div class="flex items-center justify-between gap-3 p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors" onclick="window.navigateTo(\'history\')">' +
              '<div class="flex items-center gap-3">' +
                '<span class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">Ca' + sh.shiftNumber + '</span>' +
                '<div>' +
                  '<span class="block text-sm font-semibold text-slate-800">' + sh.cashierName + ' — ' + formatDate(sh.date) + '</span>' +
                  '<span class="block text-xs text-slate-500">' + formatTime(sh.startTime) + ' → ' + formatTime(sh.endTime) + '</span>' +
                '</div>' +
              '</div>' +
              '<span class="font-bold text-emerald-600 tabular-nums">+' + formatCurrency(sm.totalIncome) + '</span>' +
            '</div>';
          }).join('');
        })()}
      </div>
    </div>
  `;
}

function _renderRevenuePeriod() {
  var container = document.getElementById('revenuePeriodContent');
  if (!container) return;
  
  // Show skeleton loading while data loads
  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <div class="skeleton skeleton-card min-h-[70px]"></div>
      <div class="skeleton skeleton-card min-h-[70px]"></div>
      <div class="skeleton skeleton-card min-h-[70px]"></div>
    </div>
    <div class="skeleton skeleton-text w-[70%] mx-auto"></div>
  `;
  
  import('../integration/invoiceStore.js').then(function(store) {
    var rev = store.getRevenueSummary(_revenuePeriod);
    var periodLabel = rev.periodLabel || _revenuePeriod;
    
    var dateRange = '';
    if (rev.firstDate && rev.lastDate) {
      dateRange = _formatDateVN(rev.firstDate) + ' → ' + _formatDateVN(rev.lastDate);
    } else {
      dateRange = 'Chưa có dữ liệu';
    }
    
    container.innerHTML = `
      <div class="text-center mb-4">
        <div class="text-[11px] text-slate-500 mb-1">📊 ${periodLabel}</div>
        <div class="text-4xl font-extrabold text-indigo-600 tracking-tight">${formatCurrency(rev.totalRevenue)}</div>
        <div class="text-xs text-slate-500 mt-1.5">
          📅 ${dateRange} · <span class="font-semibold text-slate-700">${rev.daysWithData}</span> ngày có doanh thu
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div class="text-[10px] font-semibold uppercase text-emerald-600/70 mb-1">💵 Tiền mặt</div>
          <div class="text-base font-bold text-emerald-600">${formatCurrency(rev.totalCash)}</div>
        </div>
        <div class="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div class="text-[10px] font-semibold uppercase text-blue-600/70 mb-1">💳 Thẻ</div>
          <div class="text-base font-bold text-blue-600">${formatCurrency(rev.totalCard)}</div>
        </div>
        <div class="text-center p-3 bg-purple-50 rounded-xl border border-purple-100">
          <div class="text-[10px] font-semibold uppercase text-purple-600/70 mb-1">🏦 Chuyển khoản</div>
          <div class="text-base font-bold text-purple-600">${formatCurrency(rev.totalTransfer)}</div>
        </div>
      </div>
      <div class="flex justify-between items-center mt-3 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
        <span>📋 <strong>${rev.totalBills}</strong> bill tổng cộng</span>
        <span>📊 TB/ngày: <strong class="text-indigo-600 text-sm">${formatCurrency(rev.avgDaily)}</strong></span>
      </div>
    `;
  }).catch(function() {
    container.innerHTML = '<div class="text-muted text-center">Không tải được dữ liệu</div>';
  });
}

export function render() {
  const shift = getCurrentShift();
  if (!shift) {
    return `
      <div class="empty-state">
        <span class="material-symbols-rounded empty-icon">storefront</span>
        <h2>Chào mừng đến KING's GRILL</h2>
        <p>Mở ca để bắt đầu quản lý thu chi</p>
        <button class="btn btn-primary" onclick="window.navigateTo('shift')">
          <span class="material-symbols-rounded">play_arrow</span> Mở ca
        </button>
      </div>
    `;
  }
  return renderShiftDashboard(shift);
}

export function init() {
  // Revenue period selector buttons
  document.querySelectorAll('.rev-period-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _revenuePeriod = btn.dataset.period;
      document.querySelectorAll('.rev-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _renderRevenuePeriod();
    });
  });
  
  // Initial revenue render
  _renderRevenuePeriod();

  // Populate sync status bar on load
  _refreshSyncStatusBar();

  // CUKCUK sync button on dashboard
  document.getElementById('btnDashSyncCukcuk')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnDashSyncCukcuk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded spin-icon">hourglass_top</span> Đang đồng bộ...';
    }
    try {
      const { syncTransactions } = await import('../integration/cukcuk.js');
      const result = await syncTransactions(true);
      if (result && result.success) {
        if (result.synced > 0) window.refreshView?.();
        _renderRevenuePeriod();
      }
    } catch(e) {
      // error handled by syncTransactions internally
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ';
    }
    _refreshSyncStatusBar();
  });

  // Retry failed Sheets push button
  document.getElementById('btnRetrySheets')?.addEventListener('click', async () => {
    try {
      const { retryFailed } = await import('../integration/retryQueue.js');
      retryFailed();
      _refreshSyncStatusBar();
    } catch(e) {}
  });
}

// ── Sync Status Bar Helper ──
async function _refreshSyncStatusBar() {
  var bar = document.getElementById('syncStatusBar');
  if (!bar) return;

  try {
    var { getSyncStatus } = await import('../integration/cukcuk.js');
    var { getCloudSyncMeta } = await import('../store.js');
    var sync = getSyncStatus();
    var cloud = getCloudSyncMeta();

    var timeAgo = '';
    if (sync.lastSyncTime) {
      var diff = Math.round((Date.now() - new Date(sync.lastSyncTime).getTime()) / 1000);
      if (diff < 60) timeAgo = diff + 's trước';
      else if (diff < 3600) timeAgo = Math.floor(diff / 60) + ' phút trước';
      else timeAgo = Math.floor(diff / 3600) + 'h trước';
    }

    var cukcukDot = sync.connected ? '🟢' : (sync.configured ? '🟡' : '⚪');
    var cloudDot = cloud.dirty ? '🟡' : '🟢';

    var sheetsInfo = '';
    if (sync.sheetsQueue.failed > 0) {
      sheetsInfo = '<span style="color:var(--danger);font-weight:600;">' + sync.sheetsQueue.failed + ' lỗi</span> · <button class="btn-link" id="btnRetrySheets" style="font-size:11px;color:var(--primary);cursor:pointer;background:none;border:none;text-decoration:underline;padding:0;">Thử lại</button>';
    } else if (sync.sheetsQueue.pending > 0) {
      sheetsInfo = '<span style="color:var(--warning);">' + sync.sheetsQueue.pending + ' đang chờ</span>';
    } else {
      sheetsInfo = '<span style="color:var(--text-muted);">OK</span>';
    }

    var cooldownInfo = '';
    if (sync.cooldownSeconds > 0) {
      var mins = Math.floor(sync.cooldownSeconds / 60);
      var secs = sync.cooldownSeconds % 60;
      cooldownInfo = ' · <span style="color:var(--text-muted);font-style:italic;">Chờ ' + (mins > 0 ? mins + ':' : '') + String(secs).padStart(2, '0') + '</span>';
    }

    bar.innerHTML = '<div class="sync-status-row">' +
      '<span>' + cukcukDot + ' CUKCUK: <strong>' + sync.billCount + '</strong> bill' + (timeAgo ? ' · ' + timeAgo : '') + cooldownInfo + '</span>' +
      '<span>' + cloudDot + ' Cloud: ' + (cloud.dirty ? 'Đang đẩy...' : 'OK') + ' · ☁️ Sheets: ' + sheetsInfo + '</span>' +
    '</div>';
  } catch(e) {
    bar.innerHTML = '';
  }
}

export function destroy() {
  // Cleanup — no persistent timers in dashboard currently
}
