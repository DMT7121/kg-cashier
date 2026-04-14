/* ── Report View (Enhanced w/ Print/Export) ── */
import { getCurrentShift, getShiftSummary, getSettings } from '../store.js';
import { formatCurrency, formatDate, formatTime, denominations } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">summarize</span><h2>Chưa mở ca</h2><p>Mở ca để xem báo cáo bàn giao</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const sm = getShiftSummary(shift);
  const settings = getSettings();
  const txs = shift.transactions || [];
  const otherTxs = shift.otherTransactions || [];
  const incomeTxs = txs.filter(t => t.type === 'income');
  const expenseTxs = txs.filter(t => t.type === 'expense');

  return `
    <div class="section-header no-print">
      <div>
        <h3>📄 Biên bản bàn giao ca</h3>
        <p>Xem trước và in/xuất báo cáo</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary btn-sm" id="btnPrintReport">
          <span class="material-symbols-rounded">print</span> In báo cáo
        </button>
      </div>
    </div>

    <div class="report-paper" id="reportContent">
      <div class="report-header">
        <h2>${settings.storeName || "KING's GRILL"}</h2>
        <p>${settings.storeAddress || ''}</p>
        <h3 style="margin-top:16px;">BIÊN BẢN BÀN GIAO CA</h3>
      </div>

      <div class="report-section">
        <table class="report-info-table">
          <tr><td><strong>Thu ngân:</strong></td><td>${shift.cashierName}</td><td><strong>Ngày:</strong></td><td>${formatDate(shift.date)}</td></tr>
          <tr><td><strong>Ca:</strong></td><td>Ca ${shift.shiftNumber}</td><td><strong>Bắt đầu:</strong></td><td>${formatTime(shift.startTime)}</td></tr>
          <tr><td><strong>Tiền đầu ca:</strong></td><td colspan="3">${formatCurrency(shift.startingCash)}</td></tr>
        </table>
      </div>

      <!-- I. DOANH THU -->
      <div class="report-section">
        <h4 class="report-section-title">I. DOANH THU BÁN HÀNG</h4>
        ${incomeTxs.length === 0 ? '<p class="text-muted">Không có doanh thu</p>' : `
          <table class="report-table">
            <thead><tr><th>Giờ</th><th>Danh mục</th><th>Thanh toán</th><th>Ghi chú</th><th class="text-right">Số tiền</th></tr></thead>
            <tbody>
              ${incomeTxs.map(tx => `<tr><td>${formatTime(tx.timestamp)}</td><td>${tx.category}</td><td>${tx.paymentMethod === 'cash' ? 'Mặt' : tx.paymentMethod === 'card' ? 'Thẻ' : 'CK'}</td><td>${tx.note || ''}</td><td class="text-right">${formatCurrency(tx.amount)}</td></tr>`).join('')}
              <tr class="report-total-row"><td colspan="4"><strong>Tổng doanh thu</strong></td><td class="text-right"><strong>${formatCurrency(sm.totalIncome)}</strong></td></tr>
            </tbody>
          </table>
          <table class="report-table" style="margin-top:8px;">
            <tr><td style="padding-left:20px;">├─ Tiền mặt</td><td class="text-right">${formatCurrency(sm.cashIncome)}</td></tr>
            <tr><td style="padding-left:20px;">├─ Quẹt thẻ</td><td class="text-right">${formatCurrency(sm.cardIncome)}</td></tr>
            <tr><td style="padding-left:20px;">└─ Chuyển khoản</td><td class="text-right">${formatCurrency(sm.transferIncome)}</td></tr>
          </table>
        `}
      </div>

      <!-- II. THU CHI KHÁC -->
      ${otherTxs.length > 0 ? `
        <div class="report-section">
          <h4 class="report-section-title">II. THU CHI KHÁC</h4>
          <table class="report-table">
            <thead><tr><th>Loại</th><th>Danh mục</th><th>Ghi chú</th><th class="text-right">Số tiền</th></tr></thead>
            <tbody>
              ${otherTxs.map(tx => `<tr><td>${tx.type === 'income' ? 'Thu' : 'Chi'}</td><td>${tx.category}</td><td>${tx.note || ''}</td><td class="text-right">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

      <!-- III. CHI PHÍ -->
      <div class="report-section">
        <h4 class="report-section-title">III. CHI PHÍ TRONG CA</h4>
        ${expenseTxs.length === 0 ? '<p class="text-muted">Không có chi phí</p>' : `
          <table class="report-table">
            <thead><tr><th>Danh mục</th><th>Ghi chú</th><th class="text-right">Số tiền</th></tr></thead>
            <tbody>
              ${expenseTxs.map(tx => `<tr><td>${tx.category}</td><td>${tx.note || ''}</td><td class="text-right">${formatCurrency(tx.amount)}</td></tr>`).join('')}
              <tr class="report-total-row"><td colspan="2"><strong>Tổng chi</strong></td><td class="text-right"><strong>${formatCurrency(sm.totalExpense)}</strong></td></tr>
            </tbody>
          </table>
        `}
      </div>

      <!-- IV. KIỂM KÊ TIỀN MẶT -->
      <div class="report-section">
        <h4 class="report-section-title">IV. KIỂM KÊ TIỀN MẶT (TỦ/KÉT)</h4>
        <table class="report-table">
          <thead><tr><th>Mệnh giá</th><th class="text-right">Số tờ</th><th class="text-right">Thành tiền</th></tr></thead>
          <tbody>
            ${denominations.filter(d => (shift.cashCount?.[d.value] || 0) > 0).map(d => {
              const qty = shift.cashCount[d.value] || 0;
              return `<tr><td>${d.label}đ</td><td class="text-right">${qty}</td><td class="text-right">${formatCurrency(d.value * qty)}</td></tr>`;
            }).join('') || '<tr><td colspan="3" class="text-muted text-center">Chưa kiểm kê</td></tr>'}
            <tr class="report-total-row"><td colspan="2"><strong>Tổng tiền mặt kiểm kê</strong></td><td class="text-right"><strong>${formatCurrency(sm.cashCountTotal)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <!-- V. TỔNG KẾT -->
      <div class="report-section report-summary">
        <h4 class="report-section-title">📊 TỔNG KẾT</h4>
        <table class="report-table">
          <tr><td><strong>Doanh thu (${sm.billCount} bill)</strong></td><td class="text-right"><strong>${formatCurrency(sm.totalIncome)}</strong></td></tr>
          <tr><td style="padding-left:20px">├─ Tiền mặt</td><td class="text-right">${formatCurrency(sm.cashIncome)}</td></tr>
          <tr><td style="padding-left:20px">├─ Quẹt thẻ</td><td class="text-right">${formatCurrency(sm.cardIncome)}</td></tr>
          <tr><td style="padding-left:20px">└─ Chuyển khoản</td><td class="text-right">${formatCurrency(sm.transferIncome)}</td></tr>
          <tr style="color:var(--danger);"><td>Tiền chi</td><td class="text-right">−${formatCurrency(sm.totalExpense)}</td></tr>
          ${sm.otherIncome > 0 ? `<tr><td>Thu khác</td><td class="text-right">+${formatCurrency(sm.otherIncome)}</td></tr>` : ''}
          ${sm.otherExpense > 0 ? `<tr><td>Chi khác</td><td class="text-right">−${formatCurrency(sm.otherExpense)}</td></tr>` : ''}
          <tr><td>Tiền đầu ca</td><td class="text-right">${formatCurrency(shift.startingCash)}</td></tr>
          <tr class="report-highlight-row"><td><strong>Tiền mặt kỳ vọng trong tủ</strong></td><td class="text-right"><strong>${formatCurrency(sm.expectedCash)}</strong></td></tr>
          <tr><td>Tiền mặt kiểm kê thực tế</td><td class="text-right">${formatCurrency(sm.cashCountTotal)}</td></tr>
          <tr class="${Math.abs(sm.discrepancy) > 0 ? 'report-warning-row' : ''}">
            <td><strong>Chênh lệch</strong></td>
            <td class="text-right" style="color:${sm.discrepancy === 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;">
              ${sm.discrepancy === 0 ? '✅ 0 đ' : (sm.discrepancy > 0 ? '+' : '') + formatCurrency(sm.discrepancy)}
            </td>
          </tr>
        </table>
      </div>

      <!-- Signatures -->
      <div class="report-signatures">
        <div class="sig-block">
          <strong>Người giao ca</strong>
          <div class="sig-line"></div>
          <p>${shift.cashierName}</p>
        </div>
        <div class="sig-block">
          <strong>Người nhận ca</strong>
          <div class="sig-line"></div>
          <p>&nbsp;</p>
        </div>
        <div class="sig-block">
          <strong>Quản lý</strong>
          <div class="sig-line"></div>
          <p>&nbsp;</p>
        </div>
      </div>
    </div>
  `;
}

export function init() {
  document.getElementById('btnPrintReport')?.addEventListener('click', () => {
    window.print();
  });
}
