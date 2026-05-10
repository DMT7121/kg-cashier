/* ── Transactions View — Consolidated: Thu Chi + Chứng từ ──
   Tabs: [Thu Chi] [Chứng từ]
   ── */
import { getCurrentShift, addTransaction, removeTransaction, editTransaction, addOtherTransaction, removeOtherTransaction, getCategories, addCategory } from '../store.js';
import { formatCurrency, formatTime, showToast, showModal, hideModal, showConfirm } from '../utils.js';

// Sub-module
import * as invoicesModule from './invoices.js';

var _filter = { type: 'all', payment: 'all', search: '' };
var _activeTab = 'transactions';

function _renderTabBar() {
  return `<div class="settings-tabs" style="margin-bottom:16px;">
    <button class="settings-tab ${_activeTab === 'transactions' ? 'active' : ''}" data-txtab="transactions">
      <span class="material-symbols-rounded">receipt_long</span>
      <span>Thu Chi</span>
    </button>
    <button class="settings-tab ${_activeTab === 'invoices' ? 'active' : ''}" data-txtab="invoices">
      <span class="material-symbols-rounded">description</span>
      <span>Chứng từ</span>
    </button>
  </div>`;
}

function _renderTransactionsTab() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">receipt_long</span><h2>Chưa mở ca</h2><p>Mở ca để bắt đầu ghi nhận giao dịch</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const txs = shift.transactions || [];
  const otherTxs = shift.otherTransactions || [];

  // Apply filters
  var filtered = txs.filter(function(tx) {
    if (_filter.type !== 'all' && tx.type !== _filter.type) return false;
    if (_filter.payment !== 'all' && tx.paymentMethod !== _filter.payment) return false;
    if (_filter.search) {
      var q = _filter.search.toLowerCase();
      var text = (tx.category + ' ' + (tx.note || '') + ' ' + tx.amount).toLowerCase();
      if (text.indexOf(q) === -1) return false;
    }
    return true;
  });

  var totalFiltered = filtered.reduce(function(s, tx) { return s + (tx.type === 'income' ? tx.amount : -tx.amount); }, 0);

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

    <!-- ═══ ADVANCED FILTER BAR ═══ -->
    <div class="card" style="margin-bottom:16px;padding:12px 16px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <input type="text" id="txSearch" class="form-input" placeholder="🔍 Tìm kiếm..." value="${_filter.search}" style="flex:1;min-width:160px;max-width:250px;height:36px;">
        <select id="txFilterType" class="form-input" style="width:auto;height:36px;">
          <option value="all"${_filter.type === 'all' ? ' selected' : ''}>📋 Tất cả</option>
          <option value="income"${_filter.type === 'income' ? ' selected' : ''}>↑ Thu</option>
          <option value="expense"${_filter.type === 'expense' ? ' selected' : ''}>↓ Chi</option>
        </select>
        <select id="txFilterPayment" class="form-input" style="width:auto;height:36px;">
          <option value="all"${_filter.payment === 'all' ? ' selected' : ''}>💳 Tất cả PTTT</option>
          <option value="cash"${_filter.payment === 'cash' ? ' selected' : ''}>💵 Tiền mặt</option>
          <option value="card"${_filter.payment === 'card' ? ' selected' : ''}>💳 Quẹt thẻ</option>
          <option value="transfer"${_filter.payment === 'transfer' ? ' selected' : ''}>🔄 Chuyển khoản</option>
        </select>
        <span class="text-muted" style="font-size:12px;white-space:nowrap;">${filtered.length}/${txs.length} · <span style="color:${totalFiltered >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;">${totalFiltered >= 0 ? '+' : ''}${formatCurrency(totalFiltered)}</span></span>
      </div>
    </div>

    <!-- Main Transaction Table -->
    <div class="card">
      <div class="card-header"><h3>📋 Danh sách giao dịch (${filtered.length})</h3></div>
      ${filtered.length === 0 ? '<div class="card-body"><p class="text-muted text-center" style="padding:24px;">Không có giao dịch phù hợp</p></div>' : `
        <div class="table-wrap" id="txTableWrap">
          <table>
            <thead><tr>
              <th>Thời gian</th><th>Nguồn</th><th>Loại</th><th>Danh mục</th><th>Thanh toán</th><th>Ghi chú</th><th class="text-right">Số tiền</th><th></th>
            </tr></thead>
            <tbody>
              ${filtered.slice().reverse().map(function(tx) {
                var isCukcuk = tx.note && tx.note.indexOf('[CUKCUK]') !== -1;
                return '<tr data-tx-row>' +
                  '<td style="font-variant-numeric:tabular-nums;">' + formatTime(tx.timestamp) + '</td>' +
                  '<td>' + (isCukcuk ? '<span class="tag" style="background:rgba(16,185,129,0.15);color:#10b981;font-size:10px;padding:2px 6px;">🔗 POS</span>' : '<span class="tag" style="background:rgba(168,85,247,0.15);color:#a855f7;font-size:10px;padding:2px 6px;">✍️ Thủ công</span>') + '</td>' +
                  '<td><span class="tag ' + (tx.type === 'income' ? 'tag-income' : 'tag-expense') + '">' + (tx.type === 'income' ? 'Thu' : 'Chi') + '</span></td>' +
                  '<td>' + tx.category + '</td>' +
                  '<td><span class="tag ' + (tx.paymentMethod === 'cash' ? 'tag-cash' : tx.paymentMethod === 'card' ? 'tag-card' : 'tag-transfer') + '">' + (tx.paymentMethod === 'cash' ? '💵 Mặt' : tx.paymentMethod === 'card' ? '💳 Thẻ' : '🔄 CK') + '</span></td>' +
                  '<td class="text-muted">' + (tx.note ? tx.note.replace('[CUKCUK]', '').trim().substring(0, 40) : '—') + '</td>' +
                  '<td class="text-right ' + (tx.type === 'income' ? 'amount-in' : 'amount-out') + '">' + (tx.type === 'income' ? '+' : '−') + formatCurrency(tx.amount) + '</td>' +
                  '<td style="white-space:nowrap;">' +
                    (!isCukcuk ? '<button class="btn-icon" data-edit-tx="' + tx.id + '" title="Sửa"><span class="material-symbols-rounded" style="color:var(--primary);font-size:18px;">edit</span></button>' : '') +
                    '<button class="btn-icon" data-remove-tx="' + tx.id + '" title="Xóa"><span class="material-symbols-rounded" style="color:var(--danger);font-size:18px;">delete</span></button>' +
                  '</td>' +
                '</tr>';
              }).join('')}
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
              ${otherTxs.slice().reverse().map(function(tx) { return '<tr>' +
                '<td>' + formatTime(tx.timestamp) + '</td>' +
                '<td><span class="tag ' + (tx.type === 'income' ? 'tag-income' : 'tag-expense') + '">' + (tx.type === 'income' ? 'Thu' : 'Chi') + '</span></td>' +
                '<td>' + tx.category + '</td>' +
                '<td class="text-muted">' + (tx.note || '—') + '</td>' +
                '<td class="text-right ' + (tx.type === 'income' ? 'amount-in' : 'amount-out') + '">' + (tx.type === 'income' ? '+' : '−') + formatCurrency(tx.amount) + '</td>' +
                '<td><button class="btn-icon" data-remove-other="' + tx.id + '"><span class="material-symbols-rounded" style="color:var(--danger);">delete</span></button></td>' +
              '</tr>'; }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `;
}

// ── MAIN RENDER ──
export function render() {
  return `
    ${_renderTabBar()}
    <div id="txTabContent">
      ${_activeTab === 'transactions' ? _renderTransactionsTab() : invoicesModule.render()}
    </div>
  `;
}

// ── SWITCH TAB ──
function _switchTab(tabKey) {
  _activeTab = tabKey;

  // Update tab buttons
  document.querySelectorAll('[data-txtab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.txtab === tabKey);
  });

  // Render tab content
  const container = document.getElementById('txTabContent');
  if (!container) return;

  if (tabKey === 'transactions') {
    container.innerHTML = _renderTransactionsTab();
    _initTransactionsTab();
  } else if (tabKey === 'invoices') {
    container.innerHTML = invoicesModule.render();
    invoicesModule.init();
  }
}

// ── Transaction Modals (unchanged logic) ──
function _showTxModal(type, editTx) {
  var isEdit = !!editTx;
  const categories = getCategories();
  const cats = type === 'income' ? categories.income : categories.expense;

  showModal(`
    <div class="modal-title">
      <span class="material-symbols-rounded" style="color:${type === 'income' ? 'var(--success)' : 'var(--danger)'};">${isEdit ? 'edit' : (type === 'income' ? 'add_circle' : 'remove_circle')}</span>
      ${isEdit ? 'Sửa giao dịch' : (type === 'income' ? 'Thêm khoản thu' : 'Thêm khoản chi')}
    </div>
    <div class="form-group">
      <label class="form-label">Danh mục</label>
      <select id="txCategory" class="form-input">
        ${cats.map(function(c) { return '<option value="' + c + '"' + (isEdit && editTx.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('')}
        <option value="__new__" style="color:#e8a838;font-weight:600;">➕ Thêm danh mục mới...</option>
      </select>
      <div id="newCatWrap" style="display:none;margin-top:8px;">
        <div style="display:flex;gap:8px;">
          <input type="text" id="newCatName" class="form-input" placeholder="Nhập tên danh mục mới..." style="flex:1;">
          <button class="btn btn-primary btn-sm" id="btnAddCat" type="button"><span class="material-symbols-rounded">add</span></button>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Số tiền (VNĐ)</label>
        <input type="number" id="txAmount" class="form-input" placeholder="0" inputmode="numeric" value="${isEdit ? editTx.amount : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Phương thức${type === 'income' ? '' : ' TT'}</label>
        <select id="txPayment" class="form-input">
          <option value="cash"${isEdit && editTx.paymentMethod === 'cash' ? ' selected' : ''}>💵 Tiền mặt</option>
          <option value="card"${isEdit && editTx.paymentMethod === 'card' ? ' selected' : ''}>💳 Quẹt thẻ</option>
          <option value="transfer"${isEdit && editTx.paymentMethod === 'transfer' ? ' selected' : ''}>🔄 Chuyển khoản</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ghi chú</label>
      <input type="text" id="txNote" class="form-input" placeholder="VD: Bàn 5, khách VIP..." value="${isEdit ? (editTx.note || '') : ''}">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
      <button class="btn ${type === 'income' ? 'btn-success' : 'btn-danger'}" id="btnSaveTx">
        <span class="material-symbols-rounded">${isEdit ? 'check' : 'save'}</span> ${isEdit ? 'Cập nhật' : 'Lưu'}
      </button>
    </div>
  `);

  setTimeout(function() {
    var catSelect = document.getElementById('txCategory');
    var newCatWrap = document.getElementById('newCatWrap');
    var newCatInput = document.getElementById('newCatName');

    if (catSelect) catSelect.addEventListener('change', function() {
      if (catSelect.value === '__new__') {
        newCatWrap.style.display = 'block';
        if (newCatInput) newCatInput.focus();
      } else {
        newCatWrap.style.display = 'none';
      }
    });

    var btnAddCat = document.getElementById('btnAddCat');
    if (btnAddCat) btnAddCat.addEventListener('click', function() {
      var name = newCatInput ? newCatInput.value.trim() : '';
      if (!name) { showToast('Nhập tên danh mục', 'warning'); return; }
      var added = addCategory(type, name);
      if (!added) { showToast('Danh mục đã tồn tại', 'warning'); return; }
      var newOpt = document.createElement('option');
      newOpt.value = name; newOpt.textContent = name;
      var addOpt = catSelect.querySelector('option[value="__new__"]');
      catSelect.insertBefore(newOpt, addOpt);
      catSelect.value = name;
      newCatWrap.style.display = 'none';
      if (newCatInput) newCatInput.value = '';
      showToast('Đã thêm danh mục: ' + name, 'success');
    });

    if (newCatInput) newCatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); if (btnAddCat) btnAddCat.click(); }
    });

    var amtInput = document.getElementById('txAmount');
    if (amtInput && !isEdit) amtInput.focus();

    var btnSave = document.getElementById('btnSaveTx');
    if (btnSave) btnSave.addEventListener('click', function() {
      var catValue = catSelect ? catSelect.value : '';
      if (catValue === '__new__') { showToast('Chọn hoặc thêm danh mục', 'warning'); return; }
      var amount = Number(document.getElementById('txAmount').value);
      if (!amount || amount <= 0) { showToast('Nhập số tiền hợp lệ', 'warning'); return; }
      try {
        if (isEdit) {
          editTransaction(editTx.id, {
            category: catValue, amount: amount,
            paymentMethod: document.getElementById('txPayment').value,
            note: document.getElementById('txNote').value
          });
          hideModal();
          showToast('✅ Đã cập nhật giao dịch', 'success');
        } else {
          addTransaction({
            type: type, category: catValue, amount: amount,
            paymentMethod: document.getElementById('txPayment').value,
            note: document.getElementById('txNote').value
          });
          hideModal();
          showToast('Đã thêm ' + (type === 'income' ? 'thu' : 'chi') + ': ' + amount.toLocaleString('vi-VN') + 'đ', 'success');
        }
        window.refreshView && window.refreshView();
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

  setTimeout(function() {
    var btnSave = document.getElementById('btnSaveOther');
    if (btnSave) btnSave.addEventListener('click', function() {
      var amount = Number(document.getElementById('otherAmount').value);
      if (!amount || amount <= 0) { showToast('Nhập số tiền', 'warning'); return; }
      try {
        addOtherTransaction({
          type: document.getElementById('otherType').value,
          category: document.getElementById('otherCategory').value,
          amount: amount, note: document.getElementById('otherNote').value
        });
        hideModal();
        showToast('Đã thêm khoản thu/chi khác', 'success');
        window.refreshView && window.refreshView();
      } catch (e) { showToast(e.message, 'error'); }
    });
  }, 100);
}

// ── INIT TRANSACTIONS TAB ──
function _initTransactionsTab() {
  var btnIncome = document.getElementById('btnAddIncome');
  if (btnIncome) btnIncome.addEventListener('click', function() { _showTxModal('income'); });
  var btnExpense = document.getElementById('btnAddExpense');
  if (btnExpense) btnExpense.addEventListener('click', function() { _showTxModal('expense'); });
  var btnOther = document.getElementById('btnAddOther');
  if (btnOther) btnOther.addEventListener('click', _showOtherTxModal);

  // Edit transaction
  document.querySelectorAll('[data-edit-tx]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var shift = getCurrentShift();
      if (!shift) return;
      var txId = btn.dataset.editTx;
      var tx = null;
      for (var i = 0; i < shift.transactions.length; i++) {
        if (shift.transactions[i].id === txId) { tx = shift.transactions[i]; break; }
      }
      if (tx) _showTxModal(tx.type, tx);
    });
  });

  // Remove transaction
  document.querySelectorAll('[data-remove-tx]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var ok = await showConfirm('Xóa giao dịch này?', { title: 'Xóa giao dịch', confirmText: 'Xóa', type: 'danger' });
      if (ok) { removeTransaction(btn.dataset.removeTx); showToast('Đã xóa', 'info'); window.refreshView && window.refreshView(); }
    });
  });

  // Remove other
  document.querySelectorAll('[data-remove-other]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var ok = await showConfirm('Xóa giao dịch này?', { title: 'Xóa', confirmText: 'Xóa', type: 'danger' });
      if (ok) { removeOtherTransaction(btn.dataset.removeOther); showToast('Đã xóa', 'info'); window.refreshView && window.refreshView(); }
    });
  });

  // Filters — re-render on change
  var searchInput = document.getElementById('txSearch');
  if (searchInput) searchInput.addEventListener('input', function(e) {
    _filter.search = e.target.value;
    window.refreshView && window.refreshView();
  });
  var filterType = document.getElementById('txFilterType');
  if (filterType) filterType.addEventListener('change', function(e) {
    _filter.type = e.target.value;
    window.refreshView && window.refreshView();
  });
  var filterPayment = document.getElementById('txFilterPayment');
  if (filterPayment) filterPayment.addEventListener('change', function(e) {
    _filter.payment = e.target.value;
    window.refreshView && window.refreshView();
  });
}

// ── MAIN INIT ──
export function init() {
  // Bind tab clicks
  document.querySelectorAll('[data-txtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _switchTab(btn.dataset.txtab);
    });
  });

  // Init the active tab
  if (_activeTab === 'transactions') {
    _initTransactionsTab();
  } else {
    _switchTab(_activeTab);
  }
}
