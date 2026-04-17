/* ── Settings View (Feature 8+9+Categories+CUKCUK) ── */
import { getSettings, updateSettings, getCategories, addCategory, removeCategory } from '../store.js';
import { showToast } from '../utils.js';
import { saveSettingsToCloud, pingAPI, isOnline, getQueueSize } from '../api.js';

export function render() {
  const s = getSettings();
  const online = isOnline();
  const queueSize = getQueueSize();

  // CUKCUK status
  const hasCukcuk = s.cukcuk && s.cukcuk.domain && s.cukcuk.appId && s.cukcuk.key;
  const cukcukDomain = (s.cukcuk && s.cukcuk.domain) ? s.cukcuk.domain : '';
  const cukcukAppId = (s.cukcuk && s.cukcuk.appId) ? s.cukcuk.appId : '';
  const cukcukKey = (s.cukcuk && s.cukcuk.key) ? s.cukcuk.key : '';

  return `
    <div class="section-header">
      <div>
        <h3>⚙️ Cài đặt hệ thống</h3>
        <p>Tùy chỉnh ứng dụng thu ngân</p>
      </div>
    </div>

    <!-- Connection Status -->
    <div class="stat-card ${online ? 'stat-success' : 'stat-danger'}" style="margin-bottom:20px;">
      <div class="stat-icon"><span class="material-symbols-rounded">${online ? 'cloud_done' : 'cloud_off'}</span></div>
      <div class="stat-info">
        <span class="stat-label">Trạng thái kết nối</span>
        <span class="stat-value" style="font-size:16px;">${online ? '🟢 Đang kết nối Cloud' : '🔴 Đang offline'}${queueSize > 0 ? ` (${queueSize} chờ đồng bộ)` : ''}</span>
      </div>
      <button class="btn btn-outline btn-sm" id="btnPingAPI" style="margin-left:auto;">
        <span class="material-symbols-rounded">speed</span> Kiểm tra
      </button>
    </div>

    <div class="dashboard-grid">
      <!-- Store Info -->
      <div class="card">
        <div class="card-header"><h3>🏪 Thông tin cửa hàng</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Tên cửa hàng</label>
            <input type="text" id="settStoreName" class="form-input" value="${s.storeName || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Địa chỉ</label>
            <input type="text" id="settStoreAddress" class="form-input" value="${s.storeAddress || ''}">
          </div>
        </div>
      </div>

      <!-- Alerts & Automation -->
      <div class="card">
        <div class="card-header"><h3>🔔 Cảnh báo & Tự động</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Ngưỡng cảnh báo chênh lệch (VNĐ)</label>
            <input type="number" id="settDiscrepancy" class="form-input" value="${s.discrepancyThreshold || 50000}">
            <p class="form-hint">Cảnh báo khi chênh lệch tiền mặt vượt ngưỡng</p>
          </div>
          <div class="form-group">
            <label class="form-label">Cảnh báo ca quá giờ (giờ)</label>
            <input type="number" id="settShiftWarning" class="form-input" value="${s.shiftWarningHours || 10}">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;">
            <label class="form-label" style="margin-bottom:0;flex:1;">Tự động đồng bộ Cloud</label>
            <label class="toggle-switch">
              <input type="checkbox" id="settAutoSync" ${s.autoSync !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;">
            <label class="form-label" style="margin-bottom:0;flex:1;">Yêu cầu đăng nhập PIN</label>
            <label class="toggle-switch">
              <input type="checkbox" id="settRequireLogin" ${s.requireLogin ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- CUKCUK Integration -->
    <div class="card mt-24" style="border:1px solid ${hasCukcuk ? '#10b981' : 'rgba(255,255,255,.15)'};">
      <div class="card-header" style="background:rgba(16,185,129,0.1);color:#059669;">
        <h3>🔌 Tích hợp MISA CUKCUK</h3>
        ${hasCukcuk ? '<span class="tag tag-income" style="font-size:11px;">Đã cấu hình</span>' : '<span class="tag tag-expense" style="font-size:11px;">Chưa cấu hình</span>'}
      </div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:15px;">
          Tự động đồng bộ hóa đơn thanh toán từ hệ thống CUKCUK POS vào mục <strong>Khoản thu</strong> (Doanh thu bán hàng).
          <br>Để lấy thông tin cấu hình: Đăng nhập CUKCUK → Ứng dụng → API → Tạo mã kết nối.
        </p>
        
        <div class="form-group">
          <label class="form-label">Tên miền CUKCUK</label>
          <input type="text" class="form-input" id="cuk_domain" value="${cukcukDomain}" placeholder="kinggrill hoặc kinggrill.cukcuk.vn">
          <p class="form-hint">Chỉ cần nhập phần tên, VD: kinggrill (không cần .cukcuk.vn)</p>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div class="form-group">
            <label class="form-label">App ID (Tên kết nối)</label>
            <input type="text" class="form-input" id="cuk_appId" value="${cukcukAppId}" placeholder="CUKCUKOpenPlatform">
          </div>
          <div class="form-group">
            <label class="form-label">Secret Key (Mã bảo mật)</label>
            <input type="password" class="form-input" id="cuk_key" value="${cukcukKey}" placeholder="Dán Secret Key từ CUKCUK">
          </div>
        </div>

        <!-- Auto-sync toggle -->
        <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);margin-top:10px;">
          <label class="form-label" style="margin-bottom:0;flex:1;">
            Tự động đồng bộ khi mở ca
            <span class="text-muted" style="font-size:11px;display:block;">Tự động lấy hóa đơn CUKCUK mỗi 5 phút khi ca đang mở</span>
          </label>
          <label class="toggle-switch">
            <input type="checkbox" id="cuk_autoSync" ${(s.cukcuk && s.cukcuk.autoSync) ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="btn btn-outline btn-sm" id="btnTestCukCuk">
            <span class="material-symbols-rounded">wifi_find</span> Kiểm tra kết nối
          </button>
          <button class="btn btn-success btn-sm" id="btnSyncCukCuk">
            <span class="material-symbols-rounded">sync</span> Đồng bộ hóa đơn ngay
          </button>
        </div>

        <!-- Connection result display -->
        <div id="cukcukResult" style="display:none;margin-top:12px;padding:12px 16px;border-radius:8px;font-size:13px;white-space:pre-wrap;"></div>
      </div>
    </div>

    <!-- Category Management -->
    <div class="card mt-24">
      <div class="card-header"><h3>📂 Quản lý danh mục thu/chi</h3></div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:16px;">Thêm/xóa danh mục để phân loại giao dịch rõ ràng hơn trong báo cáo. Danh mục mặc định không thể xóa.</p>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" style="color:var(--success);">📈 Danh mục THU</label>
            <div id="incomeCatList" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
              ${_renderCatTags('income')}
            </div>
            <div style="display:flex;gap:8px;">
              <input type="text" id="newIncomeCat" class="form-input" placeholder="Tên danh mục thu mới..." style="flex:1;">
              <button class="btn btn-success btn-sm" id="btnAddIncomeCat"><span class="material-symbols-rounded">add</span></button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" style="color:var(--danger);">📉 Danh mục CHI</label>
            <div id="expenseCatList" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
              ${_renderCatTags('expense')}
            </div>
            <div style="display:flex;gap:8px;">
              <input type="text" id="newExpenseCat" class="form-input" placeholder="Tên danh mục chi mới..." style="flex:1;">
              <button class="btn btn-danger btn-sm" id="btnAddExpenseCat"><span class="material-symbols-rounded">add</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top:20px;text-align:right;">
      <button class="btn btn-primary" id="btnSaveSettings">
        <span class="material-symbols-rounded">save</span> Lưu cài đặt
      </button>
    </div>

    <!-- Danger Zone -->
    <div class="card mt-24" style="border-color: rgba(239,68,68,.3);">
      <div class="card-header" style="border-bottom-color: rgba(239,68,68,.15);"><h3 style="color:var(--danger);">⚠️ Vùng nguy hiểm</h3></div>
      <div class="card-body">
        <div class="flex-between" style="margin-bottom:12px;">
          <div>
            <strong>Xóa tất cả dữ liệu cục bộ</strong>
            <p class="text-muted" style="font-size:11px;">Xóa toàn bộ localStorage (dữ liệu Cloud vẫn an toàn)</p>
          </div>
          <button class="btn btn-danger btn-sm" id="btnClearLocal">Xóa dữ liệu local</button>
        </div>
      </div>
    </div>
  `;
}

const _defaultIncome = ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'];
const _defaultExpense = ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác'];

function _renderCatTags(type) {
  const cats = getCategories();
  const list = (type === 'income' ? cats.income : cats.expense) || [];
  const defaults = type === 'income' ? _defaultIncome : _defaultExpense;
  return list.map(c => {
    const isDefault = defaults.indexOf(c) !== -1;
    return `<span class="tag ${type === 'income' ? 'tag-income' : 'tag-expense'}" style="padding:5px 10px;font-size:12px;gap:6px;">
      ${c}
      ${isDefault ? '' : `<button class="btn-icon" data-remove-cat="${c}" data-cat-type="${type}" style="padding:0;margin:-2px -4px -2px 0;" title="Xóa danh mục"><span class="material-symbols-rounded" style="font-size:14px;color:inherit;">close</span></button>`}
    </span>`;
  }).join('');
}

function _refreshCatLists() {
  const incEl = document.getElementById('incomeCatList');
  const expEl = document.getElementById('expenseCatList');
  if (incEl) incEl.innerHTML = _renderCatTags('income');
  if (expEl) expEl.innerHTML = _renderCatTags('expense');
  _bindCatRemoveEvents();
}

function _bindCatRemoveEvents() {
  document.querySelectorAll('[data-remove-cat]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const catName = btn.dataset.removeCat;
      const catType = btn.dataset.catType;
      if (confirm(`Xóa danh mục "${catName}"?`)) {
        removeCategory(catType, catName);
        showToast(`Đã xóa danh mục: ${catName}`, 'info');
        _refreshCatLists();
      }
    });
  });
}

function _showCukcukResult(message, isSuccess) {
  const el = document.getElementById('cukcukResult');
  if (!el) return;
  el.style.display = 'block';
  el.style.background = isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
  el.style.border = '1px solid ' + (isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)');
  el.style.color = isSuccess ? '#34d399' : '#f87171';
  el.textContent = message;
}

export function init() {
  // Category management
  _bindCatRemoveEvents();

  document.getElementById('btnAddIncomeCat')?.addEventListener('click', () => {
    const input = document.getElementById('newIncomeCat');
    const name = input?.value?.trim();
    if (!name) { showToast('Nhập tên danh mục', 'warning'); return; }
    const added = addCategory('income', name);
    if (!added) { showToast('Danh mục đã tồn tại', 'warning'); return; }
    input.value = '';
    showToast(`Đã thêm danh mục thu: ${name}`, 'success');
    _refreshCatLists();
  });

  document.getElementById('btnAddExpenseCat')?.addEventListener('click', () => {
    const input = document.getElementById('newExpenseCat');
    const name = input?.value?.trim();
    if (!name) { showToast('Nhập tên danh mục', 'warning'); return; }
    const added = addCategory('expense', name);
    if (!added) { showToast('Danh mục đã tồn tại', 'warning'); return; }
    input.value = '';
    showToast(`Đã thêm danh mục chi: ${name}`, 'success');
    _refreshCatLists();
  });

  // Enter key support for category inputs
  document.getElementById('newIncomeCat')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnAddIncomeCat')?.click(); }
  });
  document.getElementById('newExpenseCat')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnAddExpenseCat')?.click(); }
  });

  // Save settings (extracted for reuse)
  const performSave = (silent) => {
    if (silent === undefined) silent = false;
    const newSettings = {
      storeName: document.getElementById('settStoreName').value,
      storeAddress: document.getElementById('settStoreAddress').value,
      discrepancyThreshold: Number(document.getElementById('settDiscrepancy').value) || 50000,
      shiftWarningHours: Number(document.getElementById('settShiftWarning').value) || 10,
      autoSync: document.getElementById('settAutoSync').checked,
      requireLogin: document.getElementById('settRequireLogin').checked,
      cukcuk: {
        domain: document.getElementById('cuk_domain').value,
        appId: document.getElementById('cuk_appId').value,
        key: document.getElementById('cuk_key').value,
        autoSync: document.getElementById('cuk_autoSync').checked
      }
    };
    updateSettings(newSettings);
    saveSettingsToCloud(newSettings).catch(function() {});
    if (!silent) showToast('Đã lưu tất cả cài đặt', 'success');
  };

  document.getElementById('btnSaveSettings')?.addEventListener('click', () => performSave(false));

  // CUKCUK Actions
  document.getElementById('btnTestCukCuk')?.addEventListener('click', async () => {
    performSave(true); // Silent save
    const btn = document.getElementById('btnTestCukCuk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang kiểm tra...';
    }
    
    showToast('Đang kiểm tra kết nối CUKCUK...', 'info');
    
    try {
      const { testConnection } = await import('../integration/cukcuk.js');
      const result = await testConnection();
      if (result.success) {
        showToast('✅ Kết nối CUKCUK thành công!', 'success');
        _showCukcukResult('✅ Kết nối thành công! Token đã được lưu cache.\nBạn có thể bấm "Đồng bộ hóa đơn ngay" để lấy dữ liệu.', true);
      } else {
        showToast('❌ ' + result.message, 'error');
        _showCukcukResult('❌ ' + result.message, false);
      }
    } catch(e) {
      showToast('❌ Lỗi: ' + e.message, 'error');
      _showCukcukResult('❌ Lỗi: ' + e.message, false);
    }
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">wifi_find</span> Kiểm tra kết nối';
    }
  });

  document.getElementById('btnSyncCukCuk')?.addEventListener('click', async () => {
    performSave(true); // Silent save
    const btn = document.getElementById('btnSyncCukCuk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    }
    
    try {
      const { syncTransactions } = await import('../integration/cukcuk.js');
      const result = await syncTransactions();
      if (result && result.success) {
        var msg = '✅ Đồng bộ hoàn tất!\n';
        msg += '📊 Tổng hóa đơn: ' + result.total + '\n';
        msg += '✨ Mới thêm: ' + result.synced + ' (' + (result.amount || 0).toLocaleString('vi-VN') + 'đ)\n';
        if (result.payments) {
          var p = result.payments;
          if (p.cash > 0) msg += '💵 Tiền mặt: ' + p.cash.toLocaleString('vi-VN') + 'đ\n';
          if (p.card > 0) msg += '💳 Quẹt thẻ: ' + p.card.toLocaleString('vi-VN') + 'đ\n';
          if (p.transfer > 0) msg += '🏦 Chuyển khoản: ' + p.transfer.toLocaleString('vi-VN') + 'đ\n';
        }
        if (result.skipped > 0) msg += '⏭ Đã có từ trước: ' + result.skipped;
        _showCukcukResult(msg, true);
      } else if (result) {
        _showCukcukResult('❌ ' + (result.message || 'Lỗi không xác định'), false);
      }
    } catch(e) {
      _showCukcukResult('❌ Lỗi: ' + e.message, false);
    }
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ hóa đơn ngay';
    }
  });

  document.getElementById('btnPingAPI')?.addEventListener('click', async () => {
    showToast('Đang kiểm tra kết nối...', 'info');
    const result = await pingAPI();
    if (result.success) {
      showToast('✅ Kết nối Cloud OK! (' + result.timestamp + ')', 'success');
    } else {
      showToast('❌ Không thể kết nối Cloud: ' + result.message, 'error');
    }
  });

  document.getElementById('btnClearLocal')?.addEventListener('click', () => {
    if (confirm('Xóa TOÀN BỘ dữ liệu cục bộ? Hành động này không thể hoàn tác.')) {
      localStorage.removeItem('kg-cashier-data');
      showToast('Đã xóa dữ liệu cục bộ', 'success');
      setTimeout(() => location.reload(), 1000);
    }
  });
}
