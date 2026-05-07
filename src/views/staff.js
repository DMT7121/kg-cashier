/* ── Staff Management View (Feature 6) — Realtime ── */
import { showToast, showModal, hideModal, showConfirm } from '../utils.js';
import { getStaffFromCloud, saveStaffToCloud, deleteStaffFromCloud } from '../api.js';
import { setCachedStaff } from '../store.js';

let staffList = [];
let isStaffAuthed = false;
let _refreshTimer = null;

export function render() {
  if (!isStaffAuthed) {
    return `
      <div class="empty-state" style="padding:100px 20px;">
        <span class="material-symbols-rounded" style="font-size:64px;color:var(--primary);margin-bottom:20px;">lock</span>
        <h2>Yêu cầu quyền Admin</h2>
        <p>Vui lòng nhập mật khẩu quản trị để truy cập trang này</p>
        <div style="max-width:300px;margin:24px auto;">
          <input type="password" id="adminPassInput" class="form-input" style="text-align:center;font-size:24px;letter-spacing:4px;" placeholder="••••••" autofocus autocomplete="off">
          <button class="btn btn-primary" id="btnAdminAuth" style="width:100%;margin-top:16px;">Xác nhận</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="section-header">
      <div>
        <h3>👥 Quản lý nhân viên thu ngân</h3>
        <p>Tạo tài khoản, phân quyền, và quản lý PIN đăng nhập</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnRefreshStaff">
          <span class="material-symbols-rounded">refresh</span> Tải lại
        </button>
        <button class="btn btn-primary btn-sm" id="btnAddStaff">
          <span class="material-symbols-rounded">person_add</span> Thêm nhân viên
        </button>
      </div>
    </div>

    <!-- Realtime status indicator -->
    <div id="staffSyncBar" style="display:flex;align-items:center;gap:8px;padding:8px 14px;margin-bottom:16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:8px;font-size:12px;color:var(--text-muted);">
      <span class="material-symbols-rounded" style="font-size:16px;color:#10b981;">cloud_sync</span>
      <span id="staffSyncStatus">Đang tải danh sách nhân viên...</span>
      <span style="margin-left:auto;font-size:10px;" id="staffSyncTime"></span>
    </div>

    <div id="staffGrid" class="staff-grid"></div>
  `;
}

async function loadStaff(silent) {
  if (!silent) {
    var statusEl = document.getElementById('staffSyncStatus');
    if (statusEl) statusEl.textContent = '⏳ Đang tải từ Cloud...';
  }

  const result = await getStaffFromCloud();

  if (result.success) {
    staffList = result.staff || [];
    // Always save staff to local cache so shift view can use them immediately
    setCachedStaff(staffList);
    _renderStaffGrid();

    var statusEl = document.getElementById('staffSyncStatus');
    var timeEl = document.getElementById('staffSyncTime');
    if (statusEl) statusEl.textContent = '✅ ' + staffList.length + ' nhân viên — Realtime từ Cloud';
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('vi-VN');
  } else {
    var statusEl = document.getElementById('staffSyncStatus');
    if (statusEl) {
      statusEl.textContent = '⚠️ Không tải được — ' + (result.message || 'Kiểm tra kết nối');
      statusEl.style.color = 'var(--warning)';
    }
  }
}

function _renderStaffGrid() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;

  if (staffList.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px;">
      <span class="material-symbols-rounded empty-icon" style="font-size:48px;">group</span>
      <h3>Chưa có nhân viên</h3>
      <p>Thêm nhân viên để quản lý ca và phân quyền</p>
    </div>`;
  } else {
    grid.innerHTML = staffList.map(s => `
      <div class="staff-card">
        <div class="staff-avatar" style="background: ${s.role === 'admin' ? 'var(--primary-glow)' : s.role === 'manager' ? 'var(--info-bg)' : 'var(--success-bg)'};">
          <span class="material-symbols-rounded" style="color: ${s.role === 'admin' ? 'var(--primary)' : s.role === 'manager' ? 'var(--info)' : 'var(--success)'};">${s.role === 'admin' ? 'admin_panel_settings' : s.role === 'manager' ? 'supervisor_account' : 'person'}</span>
        </div>
        <div class="staff-info">
          <h4>${s.name}</h4>
          <span class="tag ${s.role === 'admin' ? 'tag-transfer' : s.role === 'manager' ? 'tag-card' : 'tag-cash'}">${s.role === 'admin' ? 'Admin' : s.role === 'manager' ? 'Quản lý' : 'Thu ngân'}</span>
          <span class="tag ${s.status === 'active' ? 'tag-income' : 'tag-expense'}">${s.status === 'active' ? 'Hoạt động' : 'Khóa'}</span>
        </div>
        <div class="staff-actions">
          <button class="btn-icon" data-edit-staff="${s.id}" title="Sửa"><span class="material-symbols-rounded">edit</span></button>
          <button class="btn-icon" data-delete-staff="${s.id}" title="Xóa" style="color:var(--danger);"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>
    `).join('');
  }

  _bindStaffEvents();
}

function _bindStaffEvents() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;

  // Bind edit events
  grid.querySelectorAll('[data-edit-staff]').forEach(btn => {
    btn.addEventListener('click', () => {
      const staff = staffList.find(s => s.id === btn.dataset.editStaff);
      if (staff) showStaffModal(staff);
    });
  });

  // Bind delete events
  grid.querySelectorAll('[data-delete-staff]').forEach(btn => {
    btn.addEventListener('click', async () => {
      var ok = await showConfirm('Xóa nhân viên này?', { title: 'Xóa nhân viên', confirmText: 'Xóa', type: 'danger' });
      if (!ok) return;
      const result = await deleteStaffFromCloud(btn.dataset.deleteStaff);
      showToast(result.message, result.success ? 'success' : 'error');
      if (result.success) loadStaff(); // Reload also updates cache
    });
  });
}

function showStaffModal(existing) {
  if (!existing) existing = null;
  showModal(`
    <div class="modal-title">
      <span class="material-symbols-rounded">person_add</span>
      ${existing ? 'Sửa nhân viên' : 'Thêm nhân viên mới'}
    </div>
    <div class="form-group">
      <label class="form-label">Họ tên</label>
      <input type="text" id="staffName" class="form-input" value="${existing ? existing.name : ''}" placeholder="Nhập họ tên...">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Mã PIN (4+ số)</label>
        <input type="password" id="staffPin" class="form-input" placeholder="••••" maxlength="6" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Vai trò</label>
        <select id="staffRole" class="form-input">
          <option value="cashier" ${existing && existing.role === 'cashier' ? 'selected' : ''}>Thu ngân</option>
          <option value="manager" ${existing && existing.role === 'manager' ? 'selected' : ''}>Quản lý</option>
          <option value="admin" ${existing && existing.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
      <button class="btn btn-primary" id="btnSaveStaff">
        <span class="material-symbols-rounded">save</span> Lưu
      </button>
    </div>
  `);

  setTimeout(() => {
    document.getElementById('btnSaveStaff')?.addEventListener('click', async () => {
      const name = document.getElementById('staffName').value.trim();
      const pin = document.getElementById('staffPin').value.trim();
      const role = document.getElementById('staffRole').value;

      if (!name) { showToast('Nhập họ tên', 'warning'); return; }
      if (!pin || pin.length < 4) { showToast('PIN cần ít nhất 4 số', 'warning'); return; }

      const result = await saveStaffToCloud({ id: existing ? existing.id : undefined, name: name, pin: pin, role: role, status: 'active' });
      hideModal();
      showToast(result.message, result.success ? 'success' : 'error');
      if (result.success) loadStaff(); // Reload also updates cache + config
    });
  }, 100);
}

export function init() {
  // Clear any previous refresh timer
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }

  if (!isStaffAuthed) {
    const input = document.getElementById('adminPassInput');
    const btn = document.getElementById('btnAdminAuth');
    
    const tryAuth = () => {
      if (input.value === '712121') {
        isStaffAuthed = true;
        window.refreshView?.();
      } else {
        showToast('Mật khẩu không chính xác!', 'error');
        input.value = '';
        input.focus();
      }
    };

    btn?.addEventListener('click', tryAuth);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryAuth();
    });
    input?.focus();
    return;
  }

  // Initial load
  loadStaff();

  // Realtime auto-refresh every 10 seconds
  _refreshTimer = setInterval(function() {
    loadStaff(true); // silent refresh
  }, 10000);

  // Manual refresh button
  document.getElementById('btnRefreshStaff')?.addEventListener('click', () => {
    showToast('🔄 Đang tải lại...', 'info');
    loadStaff();
  });

  document.getElementById('btnAddStaff')?.addEventListener('click', () => showStaffModal());
}

export function destroy() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
