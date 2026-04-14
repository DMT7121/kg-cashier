/* ── Settings View (Feature 8+9+Categories) ── */
import { getSettings, updateSettings, getCategories, addCategory, removeCategory } from '../store.js';
import { showToast } from '../utils.js';
import { saveSettingsToCloud, pingAPI, isOnline, getQueueSize } from '../api.js';

export function render() {
  const s = getSettings();
  const online = isOnline();
  const queueSize = getQueueSize();

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
            <label style="position:relative;display:inline-block;width:44px;height:24px;">
              <input type="checkbox" id="settAutoSync" ${s.autoSync !== false ? 'checked' : ''} style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;inset:0;background:${s.autoSync !== false ? 'var(--success)' : 'rgba(255,255,255,.1)'};border-radius:12px;transition:.3s;"></span>
            </label>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;">
            <label class="form-label" style="margin-bottom:0;flex:1;">Yêu cầu đăng nhập PIN</label>
            <label style="position:relative;display:inline-block;width:44px;height:24px;">
              <input type="checkbox" id="settRequireLogin" ${s.requireLogin ? 'checked' : ''} style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;inset:0;background:${s.requireLogin ? 'var(--success)' : 'rgba(255,255,255,.1)'};border-radius:12px;transition:.3s;"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- CUKCUK Integration -->
    <div class="card mt-24" style="border:1px solid #10b981;">
      <div class="card-header" style="background:rgba(16,185,129,0.1);color:#059669;"><h3>🔌 Tích hợp MISA CUKCUK (Beta)</h3></div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:15px;">Tự động đồng bộ doanh thu và phiếu thu/chi từ hệ thống CUKCUK Pos.</p>
        
        <div class="form-group">
          <label class="form-label">Tên miền CUKCUK (Ví dụ: kingsgrill.cukcuk.vn)</label>
          <input type="text" class="form-input" id="cuk_domain" value="${s.cukcuk?.domain || ''}" placeholder="domain.cukcuk.vn">
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div class="form-group">
            <label class="form-label">App ID (Client ID)</label>
            <input type="text" class="form-input" id="cuk_appId" value="${s.cukcuk?.appId || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Access Token / Key</label>
            <input type="password" class="form-input" id="cuk_key" value="${s.cukcuk?.key || ''}">
          </div>
        </div>
        
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="btn btn-outline btn-sm" id="btnTestCukCuk">Kiểm tra kết nối</button>
          <button class="btn btn-success btn-sm" id="btnSyncCukCuk">🔄 Đồng bộ ngay</button>
        </div>
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
  const performSave = (silent = false) => {
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
        key: document.getElementById('cuk_key').value
      }
    };
    updateSettings(newSettings);
    saveSettingsToCloud(newSettings).catch(() => {});
    if (!silent) showToast('Đã lưu tất cả cài đặt', 'success');
  };

  document.getElementById('btnSaveSettings')?.addEventListener('click', () => performSave(false));

  // CUKCUK Actions
  document.getElementById('btnTestCukCuk')?.addEventListener('click', async () => {
    performSave(true); // Silent save
    showToast('Đang kiểm tra kết nối...', 'info');
    const { testConnection } = await import('../integration/cukcuk.js');
    const result = await testConnection();
    if (result.success) {
      showToast('✅ Kết nối CUKCUK thành công!', 'success');
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  });

  document.getElementById('btnSyncCukCuk')?.addEventListener('click', async () => {
    performSave(true); // Silent save
    const { syncTransactions } = await import('../integration/cukcuk.js');
    await syncTransactions();
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
