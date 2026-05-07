/* ── Staff Management View (Feature 6) — Optimistic UI ── */
import { showToast, showModal, hideModal, showConfirm } from '../utils.js';
import { getStaffFromCloud, saveStaffToCloud, deleteStaffFromCloud } from '../api.js';
import { setCachedStaff } from '../store.js';

let staffList = [];
let isStaffAuthed = false;
let _refreshTimer = null;
let _isBusy = false; // Prevent double-clicks

// ── RENDER ────────────────────────────────────
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

// ── LOAD STAFF FROM CLOUD ─────────────────────
async function loadStaff(silent) {
  if (!silent) {
    var statusEl = document.getElementById('staffSyncStatus');
    if (statusEl) statusEl.textContent = '⏳ Đang tải từ Cloud...';
  }

  const result = await getStaffFromCloud();

  if (result.success) {
    staffList = result.staff || [];
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

// ── RENDER STAFF GRID ─────────────────────────
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
    grid.innerHTML = staffList.map(function(s) {
      var roleColor = s.role === 'admin' ? 'var(--primary)' : s.role === 'manager' ? 'var(--info)' : 'var(--success)';
      var roleBg = s.role === 'admin' ? 'var(--primary-glow)' : s.role === 'manager' ? 'var(--info-bg)' : 'var(--success-bg)';
      var roleIcon = s.role === 'admin' ? 'admin_panel_settings' : s.role === 'manager' ? 'supervisor_account' : 'person';
      var roleLabel = s.role === 'admin' ? 'Admin' : s.role === 'manager' ? 'Quản lý' : 'Thu ngân';
      var roleTag = s.role === 'admin' ? 'tag-transfer' : s.role === 'manager' ? 'tag-card' : 'tag-cash';

      return `
      <div class="staff-card" id="staff-card-${s.id}" style="transition:all .3s ease;">
        <div class="staff-avatar" style="background:${roleBg};">
          <span class="material-symbols-rounded" style="color:${roleColor};">${roleIcon}</span>
        </div>
        <div class="staff-info">
          <h4>${s.name}</h4>
          <span class="tag ${roleTag}">${roleLabel}</span>
          <span class="tag ${s.status === 'active' ? 'tag-income' : 'tag-expense'}">${s.status === 'active' ? 'Hoạt động' : 'Khóa'}</span>
        </div>
        <div class="staff-actions">
          <button class="btn-icon" data-edit-staff="${s.id}" title="Sửa"><span class="material-symbols-rounded">edit</span></button>
          <button class="btn-icon" data-delete-staff="${s.id}" data-staff-name="${s.name}" title="Xóa" style="color:var(--danger);"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>`;
    }).join('');
  }

  _bindStaffEvents();
}

// ── BIND EVENTS ───────────────────────────────
function _bindStaffEvents() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;

  // Edit
  grid.querySelectorAll('[data-edit-staff]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (_isBusy) return;
      const staff = staffList.find(function(s) { return s.id === btn.dataset.editStaff; });
      if (staff) _showStaffModal(staff);
    });
  });

  // Delete — Optimistic UI
  grid.querySelectorAll('[data-delete-staff]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (_isBusy) return;
      _handleDeleteStaff(btn.dataset.deleteStaff, btn.dataset.staffName);
    });
  });
}

// ── DELETE STAFF — Optimistic ─────────────────
async function _handleDeleteStaff(staffId, staffName) {
  var ok = await showConfirm(
    'Xóa nhân viên "' + (staffName || '') + '" khỏi hệ thống?',
    { title: 'Xóa nhân viên', confirmText: 'Xóa', type: 'danger' }
  );
  if (!ok) return;

  _isBusy = true;

  // ★ OPTIMISTIC: Remove from local list + UI immediately
  var removedStaff = null;
  var removedIndex = -1;
  for (var i = 0; i < staffList.length; i++) {
    if (staffList[i].id === staffId) {
      removedStaff = staffList[i];
      removedIndex = i;
      break;
    }
  }

  // Animate card out
  var card = document.getElementById('staff-card-' + staffId);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';
    card.style.maxHeight = card.offsetHeight + 'px';
    setTimeout(function() {
      if (card) { card.style.maxHeight = '0'; card.style.padding = '0'; card.style.margin = '0'; card.style.overflow = 'hidden'; }
    }, 200);
  }

  // Remove from local array
  if (removedIndex >= 0) {
    staffList.splice(removedIndex, 1);
    setCachedStaff(staffList);
  }

  // Update status bar count
  _updateSyncStatus('✅ ' + staffList.length + ' nhân viên — Đang đồng bộ...');

  showToast('✅ Đã xóa ' + (staffName || 'nhân viên'), 'success');

  // ★ SYNC: Push to cloud in background
  var result = await deleteStaffFromCloud(staffId);

  if (result.success) {
    _updateSyncStatus('✅ ' + staffList.length + ' nhân viên — Đã đồng bộ Sheets');
  } else {
    // ★ ROLLBACK: Cloud failed → restore staff
    if (removedStaff && removedIndex >= 0) {
      staffList.splice(removedIndex, 0, removedStaff);
      setCachedStaff(staffList);
    }
    _renderStaffGrid();
    showToast('❌ Lỗi xóa trên Cloud: ' + (result.message || 'Kiểm tra kết nối'), 'error');
    _updateSyncStatus('⚠️ Lỗi đồng bộ — Dữ liệu đã khôi phục');
  }

  _isBusy = false;

  // Re-render after animation completes (clean up DOM)
  setTimeout(function() { _renderStaffGrid(); }, 400);
}

// ── ADD/EDIT MODAL ────────────────────────────
function _showStaffModal(existing) {
  var isEdit = !!existing;
  var title = isEdit ? 'Sửa nhân viên' : 'Thêm nhân viên mới';
  var icon = isEdit ? 'edit' : 'person_add';

  showModal(`
    <div class="modal-title">
      <span class="material-symbols-rounded">${icon}</span>
      ${title}
    </div>
    <div class="form-group">
      <label class="form-label">Họ tên *</label>
      <input type="text" id="staffName" class="form-input" value="${isEdit ? existing.name : ''}" placeholder="Nhập họ tên..." autocomplete="off">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Mã PIN (4-6 số) ${isEdit ? '<span class="text-muted" style="font-weight:400;font-size:11px;">— để trống nếu không đổi</span>' : '*'}</label>
        <input type="password" id="staffPin" class="form-input" placeholder="${isEdit ? '(giữ nguyên)' : '••••'}" maxlength="6" inputmode="numeric" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Vai trò</label>
        <select id="staffRole" class="form-input">
          <option value="cashier" ${isEdit && existing.role === 'cashier' ? 'selected' : ''}>Thu ngân</option>
          <option value="manager" ${isEdit && existing.role === 'manager' ? 'selected' : ''}>Quản lý</option>
          <option value="admin" ${isEdit && existing.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    </div>
    ${isEdit ? `
    <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;">
      <label class="form-label" style="margin-bottom:0;flex:1;">Trạng thái hoạt động</label>
      <label class="toggle-switch">
        <input type="checkbox" id="staffActive" ${existing.status === 'active' ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>` : ''}
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
      <button class="btn btn-primary" id="btnSaveStaff">
        <span class="material-symbols-rounded">save</span> ${isEdit ? 'Cập nhật' : 'Thêm mới'}
      </button>
    </div>
  `);

  // Focus name input
  setTimeout(function() {
    var nameInput = document.getElementById('staffName');
    if (nameInput) nameInput.focus();

    // Save handler
    var saveBtn = document.getElementById('btnSaveStaff');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        _handleSaveStaff(existing);
      });
    }

    // Enter key submits
    var inputs = document.querySelectorAll('#staffName, #staffPin');
    inputs.forEach(function(input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          _handleSaveStaff(existing);
        }
      });
    });
  }, 50);
}

// ── SAVE STAFF — Optimistic ───────────────────
async function _handleSaveStaff(existing) {
  if (_isBusy) return;

  var nameInput = document.getElementById('staffName');
  var pinInput = document.getElementById('staffPin');
  var roleInput = document.getElementById('staffRole');
  var activeInput = document.getElementById('staffActive');

  var name = nameInput ? nameInput.value.trim() : '';
  var pin = pinInput ? pinInput.value.trim() : '';
  var role = roleInput ? roleInput.value : 'cashier';
  var status = activeInput ? (activeInput.checked ? 'active' : 'inactive') : 'active';
  var isEdit = !!existing;

  // ── Validation ──
  if (!name) { showToast('Vui lòng nhập họ tên', 'warning'); nameInput && nameInput.focus(); return; }

  if (!isEdit) {
    // New staff: PIN required
    if (!pin) { showToast('Vui lòng nhập mã PIN', 'warning'); pinInput && pinInput.focus(); return; }
    if (pin.length < 4) { showToast('PIN cần ít nhất 4 ký tự', 'warning'); pinInput && pinInput.focus(); return; }
  } else {
    // Edit: PIN optional (only validate if entered)
    if (pin && pin.length < 4) { showToast('PIN cần ít nhất 4 ký tự', 'warning'); pinInput && pinInput.focus(); return; }
  }

  // Check duplicate name
  var isDuplicate = staffList.some(function(s) {
    return s.name.toLowerCase() === name.toLowerCase() && (!isEdit || s.id !== existing.id);
  });
  if (isDuplicate) { showToast('Tên nhân viên đã tồn tại', 'warning'); nameInput && nameInput.focus(); return; }

  _isBusy = true;

  // Show loading on button
  var saveBtn = document.getElementById('btnSaveStaff');
  var saveBtnOriginal = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="material-symbols-rounded di-spin">sync</span> Đang lưu...';
  }

  // Build staff data
  var staffData = {
    name: name,
    role: role,
    status: status
  };
  if (isEdit) staffData.id = existing.id;
  if (pin) staffData.pin = pin;

  // ★ OPTIMISTIC: Update local list immediately
  if (isEdit) {
    for (var i = 0; i < staffList.length; i++) {
      if (staffList[i].id === existing.id) {
        staffList[i].name = name;
        staffList[i].role = role;
        staffList[i].status = status;
        break;
      }
    }
  } else {
    // Generate temporary ID for new staff
    var tempId = 'temp_' + Date.now();
    staffData.id = tempId;
    staffList.push({
      id: tempId,
      name: name,
      role: role,
      status: 'active',
      pin: pin
    });
  }

  setCachedStaff(staffList);
  hideModal();
  showToast(isEdit ? '✅ Đã cập nhật ' + name : '✅ Đã thêm ' + name, 'success');
  _renderStaffGrid();
  _updateSyncStatus('✅ ' + staffList.length + ' nhân viên — Đang đồng bộ Sheets...');

  // ★ SYNC: Push to cloud
  var result = await saveStaffToCloud(staffData);

  if (result.success) {
    // Replace temp ID with real ID from server
    if (!isEdit && result.id) {
      for (var j = 0; j < staffList.length; j++) {
        if (staffList[j].id === tempId) {
          staffList[j].id = result.id;
          break;
        }
      }
      setCachedStaff(staffList);
      _renderStaffGrid(); // Re-render with real IDs
    }
    _updateSyncStatus('✅ ' + staffList.length + ' nhân viên — Đã đồng bộ Sheets');
    showToast('☁️ Đã đồng bộ lên Spreadsheet', 'success');
  } else {
    // ★ ROLLBACK on failure
    if (isEdit) {
      // Restore original values
      for (var k = 0; k < staffList.length; k++) {
        if (staffList[k].id === existing.id) {
          staffList[k].name = existing.name;
          staffList[k].role = existing.role;
          staffList[k].status = existing.status;
          break;
        }
      }
    } else {
      // Remove the optimistically-added item
      staffList = staffList.filter(function(s) { return s.id !== tempId; });
    }
    setCachedStaff(staffList);
    _renderStaffGrid();
    showToast('❌ Lỗi đồng bộ: ' + (result.message || 'Kiểm tra kết nối'), 'error');
    _updateSyncStatus('⚠️ Lỗi đồng bộ Cloud — Thử lại sau');
  }

  _isBusy = false;
}

// ── HELPERS ───────────────────────────────────
function _updateSyncStatus(text) {
  var el = document.getElementById('staffSyncStatus');
  if (el) el.textContent = text;
  var timeEl = document.getElementById('staffSyncTime');
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('vi-VN');
}

// ── INIT ──────────────────────────────────────
export function init() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }

  if (!isStaffAuthed) {
    const input = document.getElementById('adminPassInput');
    const btn = document.getElementById('btnAdminAuth');

    const tryAuth = function() {
      if (input.value === '712121') {
        isStaffAuthed = true;
        window.refreshView && window.refreshView();
      } else {
        showToast('Mật khẩu không chính xác!', 'error');
        input.value = '';
        input.focus();
      }
    };

    if (btn) btn.addEventListener('click', tryAuth);
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') tryAuth();
      });
      input.focus();
    }
    return;
  }

  // Initial load
  loadStaff();

  // Realtime auto-refresh every 10 seconds (silent)
  _refreshTimer = setInterval(function() {
    if (!_isBusy) loadStaff(true);
  }, 10000);

  // Manual refresh
  document.getElementById('btnRefreshStaff')?.addEventListener('click', function() {
    showToast('🔄 Đang tải lại...', 'info');
    loadStaff();
  });

  // Add staff
  document.getElementById('btnAddStaff')?.addEventListener('click', function() {
    _showStaffModal(null);
  });
}

export function destroy() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
