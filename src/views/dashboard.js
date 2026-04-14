/* ── Dashboard View (Enhanced w/ Charts) ──── */
import { getCurrentShift, getShiftSummary, getShiftHistory, getSettings, getNotifications, getUnreadCount, markAllRead } from '../store.js';
import { formatCurrency, formatDuration, formatTime, formatDate, todayStr } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  const summary = getShiftSummary(shift);
  const settings = getSettings();
  const notifs = getNotifications().slice(0, 5);
  const unread = getUnreadCount();

  if (!shift) {
    return `
      <div class="empty-state">
        <span class="material-symbols-rounded empty-icon">restaurant</span>
        <h2>${settings.storeName || "KING's GRILL"}</h2>
        <p>Chưa có ca nào đang mở.</p>
        <button class="btn btn-primary" onclick="window.navigateTo('shift')">
          <span class="material-symbols-rounded">play_arrow</span> Mở ca mới
        </button>
      </div>
      ${_renderRecentShifts()}
      ${notifs.length ? _renderNotifications(notifs, unread) : ''}
    `;
  }

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
          <span class="stat-label">Tổng doanh thu</span>
          <span class="stat-value">${formatCurrency(summary.totalIncome)}</span>
        </div>
      </div>
      <div class="stat-card stat-danger">
        <div class="stat-icon"><span class="material-symbols-rounded">trending_down</span></div>
        <div class="stat-info">
          <span class="stat-label">Tổng chi</span>
          <span class="stat-value">${formatCurrency(summary.totalExpense)}</span>
        </div>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-icon"><span class="material-symbols-rounded">receipt_long</span></div>
        <div class="stat-info">
          <span class="stat-label">Số bill</span>
          <span class="stat-value">${summary.billCount}</span>
        </div>
      </div>
      <div class="stat-card" style="border-left-color: var(--primary);">
        <div class="stat-icon"><span class="material-symbols-rounded">payments</span></div>
        <div class="stat-info">
          <span class="stat-label">Tiền mặt kỳ vọng</span>
          <span class="stat-value">${formatCurrency(summary.expectedCash)}</span>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Payment Breakdown -->
      <div class="card">
        <div class="card-header"><h3>💳 Phương thức thanh toán</h3></div>
        <div class="card-body">
          ${[
            { label: 'Tiền mặt', icon: 'payments', value: summary.cashIncome, color: 'var(--success)' },
            { label: 'Quẹt thẻ', icon: 'credit_card', value: summary.cardIncome, color: 'var(--info)' },
            { label: 'Chuyển khoản', icon: 'swap_horiz', value: summary.transferIncome, color: 'var(--primary)' }
          ].map(pm => `
            <div class="payment-row">
              <div class="payment-label"><span class="material-symbols-rounded" style="font-size:18px;color:${pm.color};">${pm.icon}</span> ${pm.label}</div>
              <div class="payment-bar-track"><div class="payment-bar-fill" style="width:${Math.round(pm.value / maxPayment * 100)}%;background:${pm.color};"></div></div>
              <div class="payment-amount">${formatCurrency(pm.value)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Transactions -->
      <div class="card">
        <div class="card-header">
          <h3>📋 Giao dịch gần đây</h3>
          <button class="btn btn-outline btn-sm" onclick="window.navigateTo('transactions')">Xem tất cả →</button>
        </div>
        <div class="card-body" style="max-height:250px;overflow:auto;">
          ${(shift.transactions || []).slice(-5).reverse().map(tx => `
            <div class="tx-preview-item">
              <span class="material-symbols-rounded" style="color:${tx.type === 'income' ? 'var(--success)' : 'var(--danger)'};">${tx.type === 'income' ? 'south_west' : 'north_east'}</span>
              <div class="tx-preview-info">
                <strong>${tx.category}</strong>
                <small>${formatTime(tx.timestamp)} · ${tx.paymentMethod === 'cash' ? 'Tiền mặt' : tx.paymentMethod === 'card' ? 'Thẻ' : 'CK'}</small>
              </div>
              <span class="${tx.type === 'income' ? 'amount-in' : 'amount-out'}">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</span>
            </div>
          `).join('') || '<p class="text-muted text-center" style="padding:20px;">Chưa có giao dịch</p>'}
        </div>
      </div>
    </div>

    ${notifs.length ? _renderNotifications(notifs, unread) : ''}
  `;
}

function _renderRecentShifts() {
  const history = getShiftHistory().slice(0, 3);
  if (!history.length) return '';
  return `
    <div class="card" style="margin-top:20px;">
      <div class="card-header"><h3>📊 Ca gần nhất</h3></div>
      <div class="card-body">
        ${history.map(sh => {
          const sm = getShiftSummary(sh);
          return `<div class="tx-preview-item">
            <span class="material-symbols-rounded" style="color:var(--primary);">work_history</span>
            <div class="tx-preview-info">
              <strong>Ca ${sh.shiftNumber} — ${sh.cashierName}</strong>
              <small>${formatDate(sh.date)}</small>
            </div>
            <span class="amount-in">${formatCurrency(sm.totalIncome)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _renderNotifications(notifs, unread) {
  return `
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <h3>🔔 Thông báo ${unread > 0 ? `<span class="notif-badge">${unread}</span>` : ''}</h3>
        ${unread > 0 ? '<button class="btn btn-outline btn-sm" id="btnMarkAllRead">Đánh dấu đã đọc</button>' : ''}
      </div>
      <div class="card-body">
        ${notifs.map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <span class="material-symbols-rounded" style="color:${n.type === 'success' ? 'var(--success)' : n.type === 'warning' ? 'var(--warning)' : 'var(--info)'};">
              ${n.type === 'success' ? 'check_circle' : n.type === 'warning' ? 'warning' : 'info'}
            </span>
            <div style="flex:1;">
              <p style="margin:0;">${n.message}</p>
              <small class="text-muted">${formatTime(n.timestamp)}</small>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

export function init() {
  document.getElementById('btnMarkAllRead')?.addEventListener('click', () => {
    markAllRead();
    window.refreshView?.();
  });
}
