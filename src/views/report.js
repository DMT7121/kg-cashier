/* ═══════════════════════════════════════════════
   PHIẾU BÀN GIAO CA — Smart A4 Print Sheet
   Tự động co giãn nội dung vừa đúng 1 trang A4
   ═══════════════════════════════════════════════ */
import { getCurrentShift, getShiftSummary, getSettings, getShiftHistory } from '../store.js';
import { formatCurrency, formatDate, formatTime, denominations, showToast } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  // Cho phép xem report của ca mở hoặc ca cuối cùng trong lịch sử
  const lastClosed = getShiftHistory()?.[0];
  const target = shift || lastClosed;

  if (!target) {
    return `<div class="empty-state">
      <span class="material-symbols-rounded empty-icon">summarize</span>
      <h2>Chưa có dữ liệu ca</h2>
      <p>Mở ca hoặc đóng ca để tạo phiếu bàn giao</p>
      <button class="btn btn-primary" onclick="window.navigateTo('shift')">Mở ca</button>
    </div>`;
  }

  const sm = getShiftSummary(target);
  const settings = getSettings();
  const txs = target.transactions || [];
  const otherTxs = target.otherTransactions || [];
  const incomeTxs = txs.filter(t => t.type === 'income');
  const expenseTxs = txs.filter(t => t.type === 'expense');

  // Separate CUKCUK bills from manual transactions
  const cukcukTxs = incomeTxs.filter(t => t.note && t.note.indexOf('[CUKCUK]') !== -1);
  const manualIncomeTxs = incomeTxs.filter(t => !t.note || t.note.indexOf('[CUKCUK]') === -1);

  // Group CUKCUK income by category
  const cukcukByCategory = {};
  cukcukTxs.forEach(tx => {
    if (!cukcukByCategory[tx.category]) cukcukByCategory[tx.category] = { cash: 0, card: 0, transfer: 0, count: 0 };
    cukcukByCategory[tx.category][tx.paymentMethod || 'cash'] += tx.amount;
    cukcukByCategory[tx.category].count++;
  });

  // Group manual income by category
  const manualByCategory = {};
  manualIncomeTxs.forEach(tx => {
    if (!manualByCategory[tx.category]) manualByCategory[tx.category] = { cash: 0, card: 0, transfer: 0, count: 0 };
    manualByCategory[tx.category][tx.paymentMethod || 'cash'] += tx.amount;
    manualByCategory[tx.category].count++;
  });

  // Group ALL income by category (for backward compat)
  const incomeByCategory = {};
  incomeTxs.forEach(tx => {
    if (!incomeByCategory[tx.category]) incomeByCategory[tx.category] = { cash: 0, card: 0, transfer: 0, count: 0 };
    incomeByCategory[tx.category][tx.paymentMethod || 'cash'] += tx.amount;
    incomeByCategory[tx.category].count++;
  });

  // Group expense by category
  const expenseByCategory = {};
  expenseTxs.forEach(tx => {
    if (!expenseByCategory[tx.category]) expenseByCategory[tx.category] = 0;
    expenseByCategory[tx.category] += tx.amount;
  });

  // Cash count rows (only non-zero)
  const cashRows = denominations.filter(d => (target.cashCount?.[d.value] || 0) > 0);

  const isOpen = target.status === 'open';
  const now = new Date();

  return `
    <div class="section-header no-print">
      <div>
        <h3>🖨️ Phiếu bàn giao ca</h3>
        <p>${isOpen ? 'Ca đang mở — Dữ liệu cập nhật realtime' : 'Ca đã đóng — Sẵn sàng in'}</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnPreviewA4" title="Xem trước A4">
          <span class="material-symbols-rounded">preview</span> Xem A4
        </button>
        <button class="btn btn-primary btn-sm" id="btnPrintReport">
          <span class="material-symbols-rounded">print</span> In phiếu
        </button>
      </div>
    </div>

    <!-- ===== PHIẾU A4 ===== -->
    <div class="a4-sheet" id="a4Sheet">
      <div class="a4-inner">

        <!-- HEADER -->
        <div class="a4-header">
          <div class="a4-header-left">
            <div class="a4-brand">👑 ${settings.storeName || "KING's GRILL"}</div>
            <div class="a4-address">${settings.storeAddress || ''}</div>
          </div>
          <div class="a4-header-right">
            <div class="a4-doc-title">PHIẾU BÀN GIAO CA</div>
            <div class="a4-doc-sub">Ngày: ${formatDate(target.date)} — Ca ${target.shiftNumber}</div>
          </div>
        </div>

        <div class="a4-divider"></div>

        <!-- THÔNG TIN CA -->
        <div class="a4-info-grid">
          <div class="a4-info-row">
            <span class="a4-info-label">Thu ngân:</span>
            <span class="a4-info-value">${target.cashierName}</span>
          </div>
          <div class="a4-info-row">
            <span class="a4-info-label">Bắt đầu:</span>
            <span class="a4-info-value">${formatTime(target.startTime)}</span>
          </div>
          <div class="a4-info-row">
            <span class="a4-info-label">Kết thúc:</span>
            <span class="a4-info-value">${target.endTime ? formatTime(target.endTime) : '(đang mở)'}</span>
          </div>
          <div class="a4-info-row">
            <span class="a4-info-label">Tiền đầu ca:</span>
            <span class="a4-info-value a4-bold">${formatCurrency(target.startingCash)}</span>
          </div>
        </div>

        <!-- BẢNG 2 CỘT: DOANH THU + CHI PHÍ -->
        <div class="a4-two-col">
          <!-- CỘT TRÁI: DOANH THU -->
          <div class="a4-col">
            ${sm.cukcukBills > 0 ? `
            <div class="a4-section-title a4-income-title">▌DOANH THU BÁN HÀNG (CUKCUK POS)</div>
            <table class="a4-table">
              <thead>
                <tr><th>Danh mục</th><th>SL</th><th class="r">Mặt</th><th class="r">Thẻ</th><th class="r">CK</th><th class="r">Tổng</th></tr>
              </thead>
              <tbody>
                ${Object.entries(cukcukByCategory).map(([cat, v]) => {
                  const total = v.cash + v.card + v.transfer;
                  return '<tr>' +
                    '<td class="a4-cat-name">' + cat + '</td>' +
                    '<td>' + v.count + '</td>' +
                    '<td class="r">' + (v.cash > 0 ? formatCurrency(v.cash) : '—') + '</td>' +
                    '<td class="r">' + (v.card > 0 ? formatCurrency(v.card) : '—') + '</td>' +
                    '<td class="r">' + (v.transfer > 0 ? formatCurrency(v.transfer) : '—') + '</td>' +
                    '<td class="r a4-bold">' + formatCurrency(total) + '</td>' +
                  '</tr>';
                }).join('')}
              </tbody>
              <tfoot>
                <tr class="a4-total-row">
                  <td colspan="2"><strong>CUKCUK (${sm.cukcukBills} bill)</strong></td>
                  <td class="r" colspan="3"></td>
                  <td class="r"><strong>${formatCurrency(sm.cukcukRevenue)}</strong></td>
                </tr>
              </tfoot>
            </table>
            ` : ''}

            ${sm.manualBills > 0 ? `
            <div class="a4-section-title" style="margin-top:6px;color:#3b82f6;">▌THU NHẬP THỦ CÔNG</div>
            <table class="a4-table">
              <thead>
                <tr><th>Danh mục</th><th>SL</th><th class="r">Mặt</th><th class="r">Thẻ</th><th class="r">CK</th><th class="r">Tổng</th></tr>
              </thead>
              <tbody>
                ${Object.entries(manualByCategory).map(([cat, v]) => {
                  const total = v.cash + v.card + v.transfer;
                  return '<tr>' +
                    '<td class="a4-cat-name">' + cat + '</td>' +
                    '<td>' + v.count + '</td>' +
                    '<td class="r">' + (v.cash > 0 ? formatCurrency(v.cash) : '—') + '</td>' +
                    '<td class="r">' + (v.card > 0 ? formatCurrency(v.card) : '—') + '</td>' +
                    '<td class="r">' + (v.transfer > 0 ? formatCurrency(v.transfer) : '—') + '</td>' +
                    '<td class="r a4-bold">' + formatCurrency(total) + '</td>' +
                  '</tr>';
                }).join('')}
              </tbody>
              <tfoot>
                <tr class="a4-total-row">
                  <td colspan="2"><strong>Thủ công (${sm.manualBills})</strong></td>
                  <td class="r" colspan="3"></td>
                  <td class="r"><strong>${formatCurrency(sm.manualIncome)}</strong></td>
                </tr>
              </tfoot>
            </table>
            ` : ''}

            ${sm.billCount === 0 ? '<div class="a4-empty-box">Không có doanh thu</div>' : ''}

            <table class="a4-table" style="margin-top:4px;">
              <tfoot>
                <tr class="a4-highlight-row">
                  <td><strong>TỔNG DOANH THU (${sm.billCount} bill)</strong></td>
                  <td class="r"><strong>${formatCurrency(sm.totalIncome)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- CỘT PHẢI: CHI PHÍ + THU CHI KHÁC -->
          <div class="a4-col">
            <div class="a4-section-title a4-expense-title">▌CHI PHÍ</div>
            <table class="a4-table">
              <thead><tr><th>Danh mục</th><th class="r">Số tiền</th></tr></thead>
              <tbody>
                ${Object.entries(expenseByCategory).map(([cat, amt]) =>
                  `<tr><td>${cat}</td><td class="r">${formatCurrency(amt)}</td></tr>`
                ).join('') || '<tr><td colspan="2" class="a4-empty">Không có</td></tr>'}
              </tbody>
              <tfoot>
                <tr class="a4-total-row"><td><strong>TỔNG CHI</strong></td><td class="r"><strong>${formatCurrency(sm.totalExpense)}</strong></td></tr>
              </tfoot>
            </table>

            ${otherTxs.length > 0 ? `
              <div class="a4-section-title" style="margin-top:6px;">▌THU CHI KHÁC</div>
              <table class="a4-table">
                <tbody>
                  ${otherTxs.map(tx => `<tr><td>${tx.type === 'income' ? '＋' : '－'} ${tx.category}</td><td class="r">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</td></tr>`).join('')}
                </tbody>
                <tfoot>
                  <tr class="a4-total-row"><td>Thu khác / Chi khác</td><td class="r">+${formatCurrency(sm.otherIncome)} / −${formatCurrency(sm.otherExpense)}</td></tr>
                </tfoot>
              </table>
            ` : ''}
          </div>
        </div>

        <!-- BẢNG 2 CỘT: KIỂM KÊ + TỔNG KẾT -->
        <div class="a4-two-col">
          <!-- KIỂM KÊ TIỀN MẶT -->
          <div class="a4-col">
            <div class="a4-section-title">▌KIỂM KÊ TIỀN MẶT</div>
            ${cashRows.length > 0 ? `
              <table class="a4-table a4-denom-table">
                <thead><tr><th>Mệnh giá</th><th class="r">SL</th><th class="r">Thành tiền</th></tr></thead>
                <tbody>
                  ${cashRows.map(d => {
                    const qty = target.cashCount[d.value];
                    return `<tr><td>${d.label}đ</td><td class="r">${qty}</td><td class="r">${formatCurrency(d.value * qty)}</td></tr>`;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr class="a4-total-row"><td colspan="2"><strong>TỔNG KIỂM KÊ</strong></td><td class="r"><strong>${formatCurrency(sm.cashCountTotal)}</strong></td></tr>
                </tfoot>
              </table>
            ` : '<div class="a4-empty-box">Chưa kiểm kê</div>'}
          </div>

          <!-- TỔNG KẾT -->
          <div class="a4-col">
            <div class="a4-section-title a4-summary-title">▌TỔNG KẾT</div>
            <table class="a4-table a4-summary-table">
              <tbody>
                ${sm.cukcukBills > 0 ? '<tr><td>DT bán hàng CUKCUK (' + sm.cukcukBills + ' bill)</td><td class="r a4-income">' + formatCurrency(sm.cukcukRevenue) + '</td></tr>' : ''}
                ${sm.manualBills > 0 ? '<tr><td>Thu thủ công (' + sm.manualBills + ' khoản)</td><td class="r a4-income">' + formatCurrency(sm.manualIncome) + '</td></tr>' : ''}
                <tr class="a4-indent"><td>├ Tiền mặt</td><td class="r">${formatCurrency(sm.cashIncome)}</td></tr>
                <tr class="a4-indent"><td>├ Quẹt thẻ</td><td class="r">${formatCurrency(sm.cardIncome)}</td></tr>
                <tr class="a4-indent"><td>└ Chuyển khoản</td><td class="r">${formatCurrency(sm.transferIncome)}</td></tr>
                <tr style="border-top:1px solid rgba(255,255,255,0.1);"><td><strong>Tổng THU (${sm.billCount} bill)</strong></td><td class="r a4-income"><strong>${formatCurrency(sm.totalIncome)}</strong></td></tr>
                <tr><td>Chi phí trong ca</td><td class="r a4-expense">−${formatCurrency(sm.totalExpense)}</td></tr>
                ${sm.otherIncome > 0 ? '<tr><td>Thu khác</td><td class="r a4-income">+' + formatCurrency(sm.otherIncome) + '</td></tr>' : ''}
                ${sm.otherExpense > 0 ? '<tr><td>Chi khác</td><td class="r a4-expense">−' + formatCurrency(sm.otherExpense) + '</td></tr>' : ''}
                <tr><td>Tiền đầu ca</td><td class="r">${formatCurrency(target.startingCash)}</td></tr>
              </tbody>
              <tfoot>
                <tr class="a4-highlight-row"><td><strong>TM kỳ vọng</strong></td><td class="r"><strong>${formatCurrency(sm.expectedCash)}</strong></td></tr>
                <tr><td>TM kiểm kê thực tế</td><td class="r">${formatCurrency(sm.cashCountTotal)}</td></tr>
                <tr class="a4-disc-row ${Math.abs(sm.discrepancy) > 0 ? 'a4-disc-warn' : 'a4-disc-ok'}">
                  <td><strong>CHÊNH LỆCH</strong></td>
                  <td class="r"><strong>${sm.discrepancy === 0 ? '✓ 0 đ' : (sm.discrepancy > 0 ? '+' : '') + formatCurrency(sm.discrepancy)}</strong></td>
                </tr>
              </tfoot>
            </table>

            ${target.cashToKeep || target.cashToDeposit ? `
              <table class="a4-table" style="margin-top:4px;">
                <tr><td>Tiền giữ lại</td><td class="r a4-bold">${formatCurrency(target.cashToKeep || 0)}</td></tr>
                <tr><td>Tiền nộp</td><td class="r a4-bold">${formatCurrency(target.cashToDeposit || 0)}</td></tr>
              </table>` : ''}
          </div>
        </div>

        ${target.notes ? `<div class="a4-notes"><strong>Ghi chú:</strong> ${target.notes}</div>` : ''}

        <!-- CHỮ KÝ -->
        <div class="a4-signatures">
          <div class="a4-sig">
            <div class="a4-sig-title">Người giao ca</div>
            <div class="a4-sig-line"></div>
            <div class="a4-sig-name">${target.cashierName}</div>
          </div>
          <div class="a4-sig">
            <div class="a4-sig-title">Người nhận ca</div>
            <div class="a4-sig-line"></div>
            <div class="a4-sig-name">&nbsp;</div>
          </div>
          <div class="a4-sig">
            <div class="a4-sig-title">Quản lý xác nhận</div>
            <div class="a4-sig-line"></div>
            <div class="a4-sig-name">&nbsp;</div>
          </div>
        </div>

        <div class="a4-footer">
          In lúc: ${now.toLocaleString('vi-VN')} — ${settings.storeName} — Phiếu bàn giao tự động
        </div>

      </div>
    </div>
  `;
}

export function init() {
  document.getElementById('btnPrintReport')?.addEventListener('click', () => {
    document.body.classList.add('printing-a4');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-a4'), 1000);
  });

  document.getElementById('btnPreviewA4')?.addEventListener('click', () => {
    const sheet = document.getElementById('a4Sheet');
    if (sheet) sheet.classList.toggle('a4-preview-mode');
  });
}
