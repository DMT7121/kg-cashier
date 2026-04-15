/* ── Dashboard View ─────────────────────────── */
import { getCurrentShift, getShiftSummary, getShiftHistory, getSettings, getNotifications, getUnreadCount, markAllRead } from '../store.js';
import { formatCurrency, formatDate, formatTime, formatDuration } from '../utils.js';

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
    ${hasCukcuk ? `
    <div class="card" style="margin-bottom:16px;border:1px solid rgba(16,185,129,0.3);background:linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%);">
      <div class="card-header" style="border-bottom-color:rgba(16,185,129,0.15);">
        <h3 style="color:#10b981;display:flex;align-items:center;gap:8px;margin:0;">
          <span class="material-symbols-rounded">point_of_sale</span> Doanh thu POS (CUKCUK)
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
            <div style="font-size:28px;font-weight:800;color:#10b981;">${formatCurrency(summary.cukcukRevenue)}</div>
            <div style="font-size:12px;color:#10b981;margin-top:4px;">${summary.cukcukBills} bill thanh toán</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(59,130,246,0.08);border-radius:10px;">
            <div class="text-muted" style="font-size:11px;margin-bottom:6px;">✍️ Thu nhập thủ công khác</div>
            <div style="font-size:28px;font-weight:800;color:var(--info);">${formatCurrency(summary.manualIncome)}</div>
            <div style="font-size:12px;color:var(--info);margin-top:4px;">${summary.manualBills} khoản</div>
          </div>
        </div>
        <p class="text-muted" style="font-size:10px;margin:10px 0 0;text-align:center;opacity:0.6;">
          CUKCUK = bill từ POS, tự động đồng bộ mỗi 2 phút · Thu thủ công = giao dịch nhập tay trên webapp
        </p>
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
