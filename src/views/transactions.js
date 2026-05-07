/* ── Transactions View (Enhanced w/ Search) ── */
import { getCurrentShift, addTransaction, removeTransaction, addOtherTransaction, removeOtherTransaction, getCategories, addCategory } from '../store.js';
import { formatCurrency, formatTime, showToast, showModal, hideModal, showConfirm } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">receipt_long</span><h2>Chưa mở ca</h2><p>Mở ca để bắt đầu ghi nhận giao dịch</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const txs = shift.transactions || [];
  const otherTxs = shift.otherTransactions || [];
  const categories = getCategories();

  return `
    <div class="section-header">
      <div>
        <h3>Giao dịch trong ca</h3>
        <p>Ghi nhận doanh thu và chi phí</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-success btn-sm" id="btnAddIncome"><span class="material-symbols-rounded">add</span> Thêm thu</button>
        <button class="btn btn-danger btn-sm" id="btnAddExpense"><span class="material-symbols-rounded">remove</span> Thêm chi</button>
      </div>
    </div>

    <!-- Search -->
    <div class="form-group" style="margin-bottom:16px;">
      <input type="text" id="txSearch" class="form-input" placeholder="🔍 Tìm kiếm giao dịch...">
    </div>

    <!-- Main Transaction Table -->
    <div class="card">
      <div class="card-header"><h3>📋 Danh sách giao dịch (${txs.length})</h3></div>
      ${txs.length === 0 ? '<div class="card-body"><p class="text-muted text-center" style="padding:24px;">Chưa có giao dịch nào</p></div>' : `
        <div class="table-wrap" id="txTableWrap">
          <table>
            <thead><tr>
              <th>Thời gian</th><th>Loại</th><th>Danh mục</th><th>Thanh toán</th><th>Ghi chú</th><th class="text-right">Số tiền</th><th></th>
            </tr></thead>
            <tbody>
              ${txs.slice().reverse().map(tx => `
                <tr data-tx-row>
                  <td style="font-variant-numeric:tabular-nums;">${formatTime(tx.timestamp)}</td>
                  <td><span class="tag ${tx.type === 'income' ? 'tag-income' : 'tag-expense'}">${tx.type === 'income' ? 'Thu' : 'Chi'}</span></td>
                  <td>${tx.category}</td>
                  <td><span class="tag ${tx.paymentMethod === 'cash' ? 'tag-cash' : tx.paymentMethod === 'card' ? 'tag-card' : 'tag-transfer'}">${tx.paymentMethod === 'cash' ? '💵 Mặt' : tx.paymentMethod === 'card' ? '💳 Thẻ' : '🔄 CK'}</span></td>
                  <td class="text-muted">${tx.note || '—'}</td>
                  <td class="text-right ${tx.type === 'income' ? 'amount-in' : 'amount-out'}">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</td>
                  <td><button class="btn-icon" data-remove-tx="${tx.id}" title="Xóa"><span class="material-symbols-rounded" style="color:var(--danger);">delete</span></button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Other Transactions -->
    <div class="section-header" style="margin-top:24px;">
      <div>
        <h3>Thu chi khác</h3>
        <p>Các khoản thu/chi phát sinh ngoài doanh thu</p>
      </div>
      <button class="btn btn-outline btn-sm" id="btnAddOther"><span class="material-symbols-rounded">add</span> Thêm</button>
    </div>

    <div class="card">
      <div class="card-header"><h3>📝 Danh mục thu chi khác (${otherTxs.length})</h3></div>
      ${otherTxs.length === 0 ? '<div class="card-body"><p class="text-muted text-center" style="padding:16px;">Chưa có khoản thu/chi khác</p></div>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Thời gian</th><th>Loại</th><th>Danh mục</th><th>Ghi chú</th><th class="text-right">Số tiền</th><th></th></tr></thead>
            <tbody>
              ${otherTxs.slice().reverse().map(tx => `
                <tr>
                  <td>${formatTime(tx.timestamp)}</td>
                  <td><span class="tag ${tx.type === 'income' ? 'tag-income' : 'tag-expense'}">${tx.type === 'income' ? 'Thu' : 'Chi'}</span></td>
                  <td>${tx.category}</td>
                  <td class="text-muted">${tx.note || '—'}</td>
                  <td class="text-right ${tx.type === 'income' ? 'amount-in' : 'amount-out'}">${tx.type === 'income' ? '+' : '−'}${formatCurrency(tx.amount)}</td>
                  <td><button class="btn-icon" data-remove-other="${tx.id}"><span class="material-symbols-rounded" style="color:var(--danger);">delete</span></button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `;
}

function _showTxModal(type) {
  const categories = getCategories();
  const cats = type === 'income' ? categories.income : categories.expense;

  showModal(`
    <div class="modal-title">
      <span class="material-symbols-rounded" style="color:${type === 'income' ? 'var(--success)' : 'var(--danger)'};">${type === 'income' ? 'add_circle' : 'remove_circle'}</span>
      ${type === 'income' ? 'Thêm khoản thu' : 'Thêm khoản chi'}
    </div>
    <div class="form-group">
      <label class="form-label">Danh mục</label>
      <select id="txCategory" class="form-input">
        ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        <option value="__new__" style="color:#e8a838;font-weight:600;">➕ Thêm danh mục mới...</option>
      </select>
      <div id="newCatWrap" style="display:none;margin-top:8px;">
        <div style="display:flex;gap:8px;">
          <input type="text" id="newCatName" class="form-input" placeholder="Nhập tên danh mục mới..." style="flex:1;">
          <button class="btn btn-primary btn-sm" id="btnAddCat" type="button">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
        <p class="form-hint">VD: Doanh thu bar, Mua đá, Phí giao hàng...</p>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Số tiền (VNĐ)</label>
        <input type="number" id="txAmount" class="form-input" placeholder="0" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Phương thức${type === 'income' ? '' : ' TT'}</label>
        <select id="txPayment" class="form-input">
          <option value="cash">💵 Tiền mặt</option>
          <option value="card">💳 Quẹt thẻ</option>
          <option value="transfer">🔄 Chuyển khoản</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ghi chú</label>
      <input type="text" id="txNote" class="form-input" placeholder="VD: Bàn 5, khách VIP...">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
      <button class="btn ${type === 'income' ? 'btn-success' : 'btn-danger'}" id="btnSaveTx">
        <span class="material-symbols-rounded">save</span> Lưu
      </button>
    </div>
  `);

  setTimeout(() => {
    const catSelect = document.getElementById('txCategory');
    const newCatWrap = document.getElementById('newCatWrap');
    const newCatInput = document.getElementById('newCatName');

    // Toggle custom category input
    catSelect?.addEventListener('change', () => {
      if (catSelect.value === '__new__') {
        newCatWrap.style.display = 'block';
        newCatInput?.focus();
      } else {
        newCatWrap.style.display = 'none';
      }
    });

    // Add new category button
    document.getElementById('btnAddCat')?.addEventListener('click', () => {
      const name = newCatInput?.value?.trim();
      if (!name) { showToast('Nhập tên danh mục', 'warning'); return; }
      const added = addCategory(type, name);
      if (!added) { showToast('Danh mục đã tồn tại', 'warning'); return; }
      // Add new option to select and select it
      const newOpt = document.createElement('option');
      newOpt.value = name;
      newOpt.textContent = name;
      // Insert before the "Thêm mới" option
      const addOpt = catSelect.querySelector('option[value="__new__"]');
      catSelect.insertBefore(newOpt, addOpt);
      catSelect.value = name;
      newCatWrap.style.display = 'none';
      newCatInput.value = '';
      showToast(`Đã thêm danh mục: ${name}`, 'success');
    });

    // Enter key on new category input
    newCatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnAddCat')?.click();
      }
    });

    document.getElementById('txAmount')?.focus();
    document.getElementById('btnSaveTx')?.addEventListener('click', () => {
      const catValue = catSelect.value;
      if (catValue === '__new__') { showToast('Hãy thêm danh mục mới hoặc chọn danh mục có sẵn', 'warning'); return; }
      const amount = Number(document.getElementById('txAmount').value);
      if (!amount || amount <= 0) { showToast('Nhập số tiền hợp lệ', 'warning'); return; }
      try {
        addTransaction({
          type, category: catValue,
          amount, paymentMethod: document.getElementById('txPayment').value,
          note: document.getElementById('txNote').value
        });
        hideModal();
        showToast(`Đã thêm ${type === 'income' ? 'thu' : 'chi'}: ${amount.toLocaleString('vi-VN')}đ`, 'success');
        window.refreshView?.();
      } catch (e) { showToast(e.message, 'error'); }
    });
  }, 100);
}

function _showOtherTxModal() {
  showModal(`
    <div class="modal-title"><span class="material-symbols-rounded">note_add</span> Thu chi khác</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Loại</label>
        <select id="otherType" class="form-input"><option value="income">Thu</option><option value="expense">Chi</option></select>
      </div>
      <div class="form-group">
        <label class="form-label">Số tiền</label>
        <input type="number" id="otherAmount" class="form-input" placeholder="0">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Danh mục</label>
      <input type="text" id="otherCategory" class="form-input" placeholder="VD: Tiền tip, Đền bù...">
    </div>
    <div class="form-group">
      <label class="form-label">Ghi chú</label>
      <input type="text" id="otherNote" class="form-input" placeholder="Chi tiết...">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
      <button class="btn btn-primary" id="btnSaveOther"><span class="material-symbols-rounded">save</span> Lưu</button>
    </div>
  `);

  setTimeout(() => {
    document.getElementById('btnSaveOther')?.addEventListener('click', () => {
      const amount = Number(document.getElementById('otherAmount').value);
      if (!amount || amount <= 0) { showToast('Nhập số tiền', 'warning'); return; }
      try {
        addOtherTransaction({
          type: document.getElementById('otherType').value,
          category: document.getElementById('otherCategory').value,
          amount, note: document.getElementById('otherNote').value
        });
        hideModal();
        showToast('Đã thêm khoản thu/chi khác', 'success');
        window.refreshView?.();
      } catch (e) { showToast(e.message, 'error'); }
    });
  }, 100);
}

export function init() {
  document.getElementById('btnAddIncome')?.addEventListener('click', () => _showTxModal('income'));
  document.getElementById('btnAddExpense')?.addEventListener('click', () => _showTxModal('expense'));
  document.getElementById('btnAddOther')?.addEventListener('click', _showOtherTxModal);

  document.querySelectorAll('[data-remove-tx]').forEach(btn =>
    btn.addEventListener('click', async () => {
      var ok = await showConfirm('Xóa giao dịch này?', { title: 'Xóa giao dịch', confirmText: 'Xóa', type: 'danger' });
      if (ok) { removeTransaction(btn.dataset.removeTx); showToast('Đã xóa', 'info'); window.refreshView?.(); }
    })
  );

  document.querySelectorAll('[data-remove-other]').forEach(btn =>
    btn.addEventListener('click', async () => {
      var ok = await showConfirm('Xóa giao dịch này?', { title: 'Xóa', confirmText: 'Xóa', type: 'danger' });
      if (ok) { removeOtherTransaction(btn.dataset.removeOther); showToast('Đã xóa', 'info'); window.refreshView?.(); }
    })
  );

  // Search filter (Feature 7)
  document.getElementById('txSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('[data-tx-row]').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}
