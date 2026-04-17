/* ── Dashboard View ─────────────────────────── */
import { getCurrentShift, getShiftSummary, getShiftHistory, getSettings, getNotifications, getUnreadCount, markAllRead } from '../store.js';
import { formatCurrency, formatDate, formatTime, formatDuration } from '../utils.js';

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
                cukRev.total += inv.amount || 0;
                cukRev.bills++;
                (inv.payments || []).forEach(function(p) {
                  if (p.method === 'cash') cukRev.cash += p.amount || 0;
                  else if (p.method === 'card') cukRev.card += p.amount || 0;
                  else if (p.method === 'transfer') cukRev.transfer += p.amount || 0;
                });
              }
            }
          }
        }
      } catch(e) {}
      return `
    <div class="card" style="margin-bottom:16px;border:1px solid rgba(16,185,129,0.3);background:linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%);">
      <div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">
        <h3 style="color:#10b981;display:flex;align-items:center;gap:8px;margin:0;">
          <span class="material-symbols-rounded">point_of_sale</span> Doanh thu POS — ${new Date().toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'})}
        </h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="cukcukSyncStatus" class="text-muted" style="font-size:11px;"></span>
          <button class="btn btn-sm" id="btnDashResyncCukcuk" style="white-space:nowrap;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);" title="Xóa toàn bộ dữ liệu CUKCUK cũ và đồng bộ lại từ đầu">
            <span class="material-symbols-rounded">refresh</span> Sync lại
          </button>
          <button class="btn btn-success btn-sm" id="btnDashSyncCukcuk" style="white-space:nowrap;">
            <span class="material-symbols-rounded">sync</span> Đồng bộ
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:16px 20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border-radius:10px;">
            <div class="text-muted" style="font-size:11px;margin-bottom:6px;">💰 Doanh thu bán hàng (CUKCUK)</div>
            <div style="font-size:28px;font-weight:800;color:#10b981;">${formatCurrency(cukRev.total)}</div>
            <div style="font-size:12px;color:#10b981;margin-top:4px;">${cukRev.bills} bill thanh toán</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(59,130,246,0.08);border-radius:10px;">
            <div class="text-muted" style="font-size:11px;margin-bottom:6px;">✍️ Thu nhập thủ công khác</div>
            <div style="font-size:28px;font-weight:800;color:var(--info);">${formatCurrency(summary.manualIncome)}</div>
            <div style="font-size:12px;color:var(--info);margin-top:4px;">${summary.manualBills} khoản</div>
          </div>
        </div>
        <p class="text-muted" style="font-size:10px;margin:10px 0 0;text-align:center;opacity:0.6;">
          Ngày làm việc: 12:00 trưa → 06:00 sáng hôm sau · Tự động đồng bộ mỗi 2 phút
        </p>
      </div>
    </div>`;
    })() : ''}

    <!-- ═══ DOANH THU CUKCUK THEO KỲ ═══ -->
    ${hasCukcuk ? `
    <div class="card" style="margin-bottom:16px;border:1px solid rgba(99,102,241,0.25);background:linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(99,102,241,0.01) 100%);">
      <div class="card-header" style="border-bottom-color:rgba(99,102,241,0.15);">
        <h3 style="color:#6366f1;display:flex;align-items:center;gap:8px;margin:0;">
          <span class="material-symbols-rounded">bar_chart</span> Tổng doanh thu CUKCUK
        </h3>
        <div style="display:flex;gap:4px;" id="revenuePeriodBtns">
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'month' ? 'active' : ''}" data-period="month">Tháng</button>
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Quý</button>
          <button class="btn btn-sm rev-period-btn ${_revenuePeriod === 'year' ? 'active' : ''}" data-period="year">Năm</button>
        </div>
      </div>
      <div class="card-body" id="revenuePeriodContent" style="padding:16px 20px;">
        <div class="text-muted text-center" style="padding:20px;">⏳ Đang tải...</div>
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
        <div class="card-body" style="max-height:240px;overflow-y:auto;">
          ${(shift.transactions || []).slice(-8).reverse().map(tx => {
            const isCukcuk = tx.note && tx.note.indexOf('[CUKCUK]') !== -1;
            return `
              <div class="tx-row">
                <div class="tx-info">
                  <span class="tx-type ${tx.type === 'income' ? 'type-income' : 'type-expense'}">${tx.type === 'income' ? '↑' : '↓'}</span>
                  <div>
                    <span class="tx-cat">${isCukcuk ? '🔗 ' : ''}${tx.category}</span>
                    <span class="tx-note">${tx.note ? tx.note.substring(0, 50) : ''}</span>
                  </div>
                </div>
                <span class="tx-amount ${tx.type === 'income' ? 'amount-in' : 'amount-out'}">${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}</span>
              </div>
            `;
          }).join('') || '<div class="text-muted text-center" style="padding:20px;">Chưa có giao dịch</div>'}
        </div>
      </div>
    </div>

    <!-- ═══ RECENT SHIFTS ═══ -->
    <div class="card" style="margin-top:10px;">
      <div class="card-header"><h3>📋 Ca gần đây</h3></div>
      <div class="card-body" style="max-height:200px;overflow-y:auto;">
        ${(function() {
          const history = getShiftHistory().slice(0, 5);
          if (history.length === 0) return '<div class="text-muted text-center" style="padding:20px;">Chưa có lịch sử ca</div>';
          return history.map(function(sh) {
            const sm = getShiftSummary(sh);
            return '<div class="tx-row" style="cursor:pointer;" onclick="window.navigateTo(\'history\')">' +
              '<div class="tx-info">' +
                '<span class="tx-type type-income">Ca' + sh.shiftNumber + '</span>' +
                '<div>' +
                  '<span class="tx-cat">' + sh.cashierName + ' — ' + formatDate(sh.date) + '</span>' +
                  '<span class="tx-note">' + formatTime(sh.startTime) + ' → ' + formatTime(sh.endTime) + '</span>' +
                '</div>' +
              '</div>' +
              '<span class="tx-amount amount-in">' + formatCurrency(sm.totalIncome) + '</span>' +
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
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">📊 ${periodLabel}</div>
        <div style="font-size:36px;font-weight:900;color:#6366f1;letter-spacing:-1px;">${formatCurrency(rev.totalRevenue)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
          📅 ${dateRange} · ${rev.daysWithData} ngày có doanh thu
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.08);border-radius:8px;">
          <div style="font-size:10px;color:var(--text-muted);">💵 Tiền mặt</div>
          <div style="font-size:16px;font-weight:700;color:#10b981;margin-top:4px;">${formatCurrency(rev.totalCash)}</div>
        </div>
        <div style="text-align:center;padding:10px;background:rgba(59,130,246,0.08);border-radius:8px;">
          <div style="font-size:10px;color:var(--text-muted);">💳 Thẻ</div>
          <div style="font-size:16px;font-weight:700;color:#3b82f6;margin-top:4px;">${formatCurrency(rev.totalCard)}</div>
        </div>
        <div style="text-align:center;padding:10px;background:rgba(168,85,247,0.08);border-radius:8px;">
          <div style="font-size:10px;color:var(--text-muted);">🏦 Chuyển khoản</div>
          <div style="font-size:16px;font-weight:700;color:#a855f7;margin-top:4px;">${formatCurrency(rev.totalTransfer)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;font-size:11px;">
        <span>📋 ${rev.totalBills} bill tổng cộng</span>
        <span>📊 TB/ngày: <strong style="color:#6366f1;">${formatCurrency(rev.avgDaily)}</strong></span>
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

  // CUKCUK sync button on dashboard
  document.getElementById('btnDashSyncCukcuk')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnDashSyncCukcuk');
    const status = document.getElementById('cukcukSyncStatus');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    }
    if (status) status.textContent = '⏳';
    try {
      const { syncTransactions } = await import('../integration/cukcuk.js');
      const result = await syncTransactions();
      if (result && result.success) {
        if (status) status.textContent = '✅ ' + result.synced + ' mới / ' + result.total + ' tổng';
        if (result.synced > 0) window.refreshView?.();
        _renderRevenuePeriod(); // Update period revenue too
      } else {
        if (status) status.textContent = '❌ ' + (result?.message || 'Lỗi').substring(0, 30);
      }
    } catch(e) {
      if (status) status.textContent = '❌ Lỗi';
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ';
    }
  });

  // CUKCUK RE-SYNC button (clear old + refetch all)
  document.getElementById('btnDashResyncCukcuk')?.addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ dữ liệu CUKCUK cũ trong ca và đồng bộ lại từ đầu?\n\nThao tác này sẽ:\n• Xóa tất cả bill CUKCUK đã sync\n• Lấy lại từ đầu với đầy đủ chi tiết thanh toán\n\nTiếp tục?')) return;
    
    const btn = document.getElementById('btnDashResyncCukcuk');
    const status = document.getElementById('cukcukSyncStatus');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang xử lý...';
    }
    if (status) status.textContent = '🔄 Re-sync...';
    try {
      const { resyncAllTransactions } = await import('../integration/cukcuk.js');
      const result = await resyncAllTransactions();
      if (result && result.success) {
        var msg = '✅ ' + result.synced + ' bill';
        if (result.payments) {
          var p = result.payments;
          var parts = [];
          if (p.cash > 0) parts.push('TM: ' + p.cash.toLocaleString('vi-VN'));
          if (p.card > 0) parts.push('Thẻ: ' + p.card.toLocaleString('vi-VN'));
          if (p.transfer > 0) parts.push('CK: ' + p.transfer.toLocaleString('vi-VN'));
          if (parts.length > 0) msg += ' (' + parts.join(' | ') + ')';
        }
        if (status) status.textContent = msg;
        window.refreshView?.();
      } else {
        if (status) status.textContent = '❌ ' + (result?.message || 'Lỗi').substring(0, 40);
      }
    } catch(e) {
      if (status) status.textContent = '❌ ' + e.message;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">refresh</span> Sync lại';
    }
  });
}
