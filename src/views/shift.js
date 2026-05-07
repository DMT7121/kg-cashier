import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, getState, setLoggedInUser, getCachedStaff, setCachedStaff } from '../store.js';
import { showToast, showModal, hideModal, showConfirm, formatCurrency, formatDuration, formatTime, formatDate, todayStr } from '../utils.js';
import { getStaffFromCloud, getConfigFromCloud } from '../api.js';

let _staffList = [];

function _populateStaffSelect(staffList) {
  _staffList = staffList;
  var select = document.getElementById('staffSelect');
  if (!select) return;
  var activeStaff = staffList.filter(function(s) { return s.status === 'active'; });
  if (activeStaff.length === 0) {
    select.innerHTML = '<option value="">-- Chưa có nhân viên --</option>';
  } else {
    select.innerHTML = '<option value="">-- Chọn nhân viên --</option>' + 
      activeStaff.map(function(s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');
  }
}

export function render() {
  const shift = getCurrentShift();
  const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  // ── CASE 1: Shift is OPEN ──
  if (shift) {
    if (!isValidated) {
      return `
        <div class="empty-state" style="padding:80px 20px;">
          <span class="material-symbols-rounded" style="font-size:64px;color:var(--warning);margin-bottom:20px;">lock_open</span>
          <h2>Ca đang mở</h2>
          <p>Nhân viên <b>${shift.cashierName}</b> đang mở Ca ${shift.shiftNumber}</p>
          <p class="text-muted">Vui lòng nhập mật khẩu ca để tiếp tục hoặc để đóng ca</p>
          
          <div style="max-width:300px;margin:24px auto;">
            <div class="form-group">
              <label class="form-label">Mật khẩu ca (mặc định 0000)</label>
              <input type="password" id="shiftUnlockPass" class="form-input" style="text-align:center;font-size:24px;letter-spacing:4px;" placeholder="••••" autofocus>
            </div>
            <button class="btn btn-primary" id="btnUnlockShift" style="width:100%;margin-top:8px;">Xác nhận</button>
          </div>
        </div>
      `;
    }

    const sm = getShiftSummary(shift);
    return `
      <div class="section-header">
        <div>
          <h3>🟢 Ca đang mở</h3>
          <p>Ca ${shift.shiftNumber} — ${shift.cashierName}</p>
        </div>
      </div>

      <div class="card active-shift-card">
        <div class="card-body">
          <div class="shift-details-grid">
            <div><span class="text-muted">Thu ngân</span><strong>${shift.cashierName}</strong></div>
            <div><span class="text-muted">Số ca</span><strong>Ca ${shift.shiftNumber}</strong></div>
            <div><span class="text-muted">Ngày</span><strong>${formatDate(shift.date)}</strong></div>
            <div><span class="text-muted">Bắt đầu</span><strong>${formatTime(shift.startTime)}</strong></div>
            <div><span class="text-muted">Thời gian</span><strong id="shiftTimer">${formatDuration(shift.startTime)}</strong></div>
            <div><span class="text-muted">Tiền đầu ca</span><strong>${formatCurrency(shift.startingCash)}</strong></div>
          </div>

          <div class="shift-quick-stats">
            <div class="quick-stat">
              <span class="material-symbols-rounded" style="color:var(--success);">trending_up</span>
              <div><small>Doanh thu</small><strong class="amount-in">${formatCurrency(sm.totalIncome)}</strong></div>
            </div>
            <div class="quick-stat">
              <span class="material-symbols-rounded" style="color:var(--danger);">trending_down</span>
              <div><small>Chi phí</small><strong class="amount-out">${formatCurrency(sm.totalExpense)}</strong></div>
            </div>
            <div class="quick-stat">
              <span class="material-symbols-rounded" style="color:var(--info);">receipt</span>
              <div><small>Bills</small><strong>${sm.billCount}</strong></div>
            </div>
          </div>
        </div>
      </div>

      <button class="btn btn-danger" style="width:100%;margin-top:20px;" id="btnCloseShift">
        <span class="material-symbols-rounded">stop_circle</span> Đóng ca
      </button>

      <button class="btn btn-outline" style="width:100%;margin-top:10px;" id="btnForceReset">
        <span class="material-symbols-rounded">restart_alt</span> Hủy ca (không lưu lịch sử)
      </button>
    `;
  }

  // ── CASE 2: No shift open ──
  return `
    <div class="section-header">
      <div>
        <h3>🔓 Mở ca mới</h3>
        <p>Chọn tài khoản và nhập PIN để bắt đầu làm việc</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div id="shiftFormError" style="display:none;padding:10px 14px;margin-bottom:14px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#ef4444;font-size:13px;font-weight:600;"></div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">👤 Nhân viên <span style="color:var(--danger);">*</span></label>
            <div style="display:flex;gap:8px;align-items:flex-start;">
              <select id="staffSelect" class="form-input" required autofocus style="flex:1;">
                <option value="">-- Chọn nhân viên --</option>
              </select>
              <button class="btn btn-outline btn-sm" id="btnRefreshStaffList" type="button" title="Tải lại danh sách nhân viên từ Cloud" style="white-space:nowrap;height:42px;">
                <span class="material-symbols-rounded" style="font-size:18px;">refresh</span>
              </button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <p class="form-hint" id="staffLoadStatus" style="margin:0;flex:1;"></p>
              <button class="btn btn-sm" id="btnManualName" type="button" style="font-size:11px;padding:2px 8px;background:transparent;color:var(--text-muted);border:1px dashed var(--border);">✏️ Nhập tên thủ công</button>
            </div>
            <div id="manualNameBox" style="display:none;margin-top:8px;">
              <input type="text" id="manualStaffName" class="form-input" placeholder="Nhập tên nhân viên..." style="background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.3);">
              <p class="form-hint" style="color:var(--warning);margin-top:2px;">⚡ Mở ca nhanh — không cần PIN</p>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label"># Số ca</label>
            <select id="shiftNumber" class="form-input">
              <option value="1">Ca 1</option>
              <option value="2">Ca 2</option>
              <option value="3">Ca 3</option>
            </select>
          </div>
        </div>

        <div class="form-row" id="pinRow">
          <div class="form-group">
            <label class="form-label">🔑 Mã PIN cá nhân <span style="color:var(--danger);">*</span></label>
            <input type="password" id="staffPin" class="form-input" placeholder="••••" maxlength="6" inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label">🔒 Đặt mật khẩu cho ca này</label>
            <input type="password" id="shiftPassword" class="form-input" placeholder="Mặc định 0000" value="0000">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">📅 Ngày <span style="color:var(--danger);">*</span></label>
            <input type="date" id="shiftDate" class="form-input" value="${todayStr()}" required>
          </div>
          <div class="form-group">
            <label class="form-label">💰 Tiền đầu ca (VNĐ)</label>
            <input type="number" id="startingCash" class="form-input" placeholder="0" value="0" min="0">
          </div>
        </div>

        <button class="btn btn-primary" style="width:100%;margin-top:16px;padding:14px 18px;font-size:15px;" id="btnOpenShift">
          <span class="material-symbols-rounded">play_arrow</span> Mở ca
        </button>
      </div>
    </div>
  `;
}

let _timer = null;

function _showFormError(msg) {
  const el = document.getElementById('shiftFormError');
  if (el) {
    el.textContent = '⚠️ ' + msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Also show toast as backup
  try { showToast(msg, 'warning'); } catch (e) { /* ignore */ }
}

function _clearFormError() {
  const el = document.getElementById('shiftFormError');
  if (el) el.style.display = 'none';
}

function _highlightField(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.style.borderColor = 'var(--danger)';
    field.style.boxShadow = '0 0 0 3px rgba(239,68,68,.2)';
    field.focus();
    setTimeout(() => {
      field.style.borderColor = '';
      field.style.boxShadow = '';
    }, 3000);
  }
}

export function init() {
  const shift = getCurrentShift();
  const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  if (shift) {
    if (!isValidated) {
      const input = document.getElementById('shiftUnlockPass');
      const btn = document.getElementById('btnUnlockShift');
      const tryUnlock = () => {
        if (input.value === (shift.shiftPassword || '0000')) {
          sessionStorage.setItem('shift_validated', shift.id);
          showToast('Xác thực thành công!', 'success');
          window.refreshView?.();
        } else {
          showToast('Mật khẩu ca không đúng!', 'error');
          input.value = '';
          input.focus();
        }
      };
      btn?.addEventListener('click', tryUnlock);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
      return;
    }

    // Timer — clear any existing timer first to prevent accumulation
    if (_timer) clearInterval(_timer);
    _timer = setInterval(() => {
      const el = document.getElementById('shiftTimer');
      if (el) {
        el.textContent = formatDuration(shift.startTime);
      } else {
        // View no longer visible, stop timer
        clearInterval(_timer);
        _timer = null;
      }
    }, 30000);

    // Close shift
    document.getElementById('btnCloseShift')?.addEventListener('click', () => {
      showModal(`
        <div class="modal-title"><span class="material-symbols-rounded" style="color:var(--danger);">stop_circle</span> Đóng ca</div>
        <p>Xác nhận đóng Ca ${shift.shiftNumber}?</p>
        <div class="form-group">
          <label class="form-label">Ghi chú (tùy chọn)</label>
          <textarea id="closeNotes" class="form-input" rows="3" placeholder="Ghi chú bàn giao..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tiền giữ lại</label>
            <input type="number" id="cashToKeep" class="form-input" value="0">
          </div>
          <div class="form-group">
            <label class="form-label">Tiền nộp</label>
            <input type="number" id="cashToDeposit" class="form-input" value="0">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
          <button class="btn btn-danger" id="btnConfirmClose">
            <span class="material-symbols-rounded">check</span> Đóng ca
          </button>
        </div>
      `);

      setTimeout(() => {
        document.getElementById('btnConfirmClose')?.addEventListener('click', () => {
          try {
            closeShift({
              notes: document.getElementById('closeNotes')?.value || '',
              cashToKeep: Number(document.getElementById('cashToKeep')?.value) || 0,
              cashToDeposit: Number(document.getElementById('cashToDeposit')?.value) || 0
            });
            sessionStorage.removeItem('shift_validated');
            hideModal();
            clearInterval(_timer);
            showToast('Đã đóng ca thành công!', 'success');
            window.refreshView?.();
          } catch (e) {
            showToast(e.message, 'error');
            console.error('Close shift error:', e);
          }
        });
      }, 100);
    });

    // Force reset (emergency)
    document.getElementById('btnForceReset')?.addEventListener('click', async () => {
      var ok = await showConfirm('Ca sẽ bị xóa hoàn toàn, KHÔNG lưu vào lịch sử.\nHành động này không thể hoàn tác!', {
        title: '⚠️ HỦY CA HIỆN TẠI?',
        confirmText: 'Hủy ca',
        type: 'danger'
      });
      if (ok) {
        const s = getState();
        s.currentShift = null;
        try {
          localStorage.setItem('kg-cashier-data', JSON.stringify(s));
          sessionStorage.removeItem('shift_validated');
        } catch (e) { /* ignore */ }
        showToast('Đã hủy ca', 'info');
        window.refreshView?.();
      }
    });

  } else {
    // ── OPEN SHIFT ──
    var statusEl = document.getElementById('staffLoadStatus');
    var _isManualMode = false;

    // Toggle manual name input
    document.getElementById('btnManualName')?.addEventListener('click', function() {
      _isManualMode = !_isManualMode;
      var box = document.getElementById('manualNameBox');
      var pinRow = document.getElementById('pinRow');
      var select = document.getElementById('staffSelect');
      if (_isManualMode) {
        if (box) box.style.display = 'block';
        if (pinRow) pinRow.style.display = 'none';
        if (select) select.disabled = true;
        this.textContent = '📋 Chọn từ danh sách';
        document.getElementById('manualStaffName')?.focus();
      } else {
        if (box) box.style.display = 'none';
        if (pinRow) pinRow.style.display = '';
        if (select) select.disabled = false;
        this.textContent = '✏️ Nhập tên thủ công';
      }
    });

    // Reusable staff loading function
    function _loadStaffFromCloud(isManual) {
      if (isManual) {
        if (statusEl) {
          statusEl.textContent = '⏳ Đang tải lại từ Cloud...';
          statusEl.style.color = 'var(--info)';
        }
      }
      
      // Try fast config API first, then fallback to full staff API
      getConfigFromCloud().then(function(configRes) {
        if (configRes.success && configRes.config && configRes.config.staff) {
          var configStaff = configRes.config.staff;
          setCachedStaff(configStaff);
          _populateStaffSelect(configStaff);
          if (statusEl) {
            statusEl.textContent = '✅ ' + configStaff.length + ' nhân viên';
            statusEl.style.color = 'var(--success)';
          }
          return;
        }
        // Fallback to full staff API
        return getStaffFromCloud().then(function(res) {
          if (res.success && res.staff) {
            setCachedStaff(res.staff);
            _populateStaffSelect(res.staff);
            if (statusEl) {
              statusEl.textContent = '✅ ' + res.staff.length + ' nhân viên';
              statusEl.style.color = 'var(--success)';
            }
          } else if (isManual) {
            if (statusEl) {
              statusEl.textContent = '⚠️ Không tải được — dùng "Nhập tên thủ công"';
              statusEl.style.color = 'var(--warning)';
            }
          }
        });
      }).catch(function() {
        // Config failed, try direct staff API
        getStaffFromCloud().then(function(res) {
          if (res.success && res.staff) {
            setCachedStaff(res.staff);
            _populateStaffSelect(res.staff);
            if (statusEl) {
              statusEl.textContent = '✅ ' + res.staff.length + ' nhân viên';
              statusEl.style.color = 'var(--success)';
            }
          }
        }).catch(function() {
          if (statusEl && (!getCachedStaff() || getCachedStaff().length === 0)) {
            statusEl.textContent = '❌ Offline — dùng "Nhập tên thủ công"';
            statusEl.style.color = 'var(--danger)';
          }
        });
      });
    }

    // Step 1: Immediately show cached staff (instant, no network wait)
    var cached = getCachedStaff();
    if (cached && cached.length > 0) {
      _populateStaffSelect(cached);
      if (statusEl) {
        statusEl.textContent = '✅ ' + cached.length + ' nhân viên';
        statusEl.style.color = 'var(--success)';
      }
    } else {
      if (statusEl) {
        statusEl.textContent = '⏳ Đang tải...';
        statusEl.style.color = 'var(--text-muted)';
      }
    }

    // Step 2: Load fresh staff from cloud in background (silent update)
    _loadStaffFromCloud(false);

    // Manual refresh button
    document.getElementById('btnRefreshStaffList')?.addEventListener('click', function() {
      _loadStaffFromCloud(true);
      showToast('🔄 Tải lại danh sách nhân viên...', 'info');
    });

    const btnOpen = document.getElementById('btnOpenShift');
    if (!btnOpen) return;

    btnOpen.addEventListener('click', function handleOpenShift(e) {
      e.preventDefault();
      _clearFormError();

      var staffName = '';
      var staffId = '';

      if (_isManualMode) {
        // Manual mode — use typed name
        staffName = (document.getElementById('manualStaffName')?.value || '').trim();
        if (!staffName) { _showFormError('Vui lòng nhập tên nhân viên'); return; }
        staffId = 'manual-' + Date.now();
      } else {
        // Normal mode — use selected staff
        staffId = document.getElementById('staffSelect').value;
        if (!staffId) { _showFormError('Vui lòng chọn nhân viên'); return; }
        
        const staff = _staffList.find(function(s) { return s.id === staffId; });
        if (!staff) {
          _showFormError('Không tìm thấy nhân viên. Hãy thử tải lại trang.');
          return;
        }
        
        // PIN verification
        var pin = document.getElementById('staffPin').value.trim();
        var staffPin = String(staff.pin || '');
        if (staffPin && staffPin !== '****' && staffPin !== pin) {
          _showFormError('Mã PIN không chính xác!');
          _highlightField('staffPin');
          return;
        }
        staffName = staff.name;
      }

      const shiftPass = document.getElementById('shiftPassword').value || '0000';
      const num = document.getElementById('shiftNumber').value;
      const date = document.getElementById('shiftDate').value;
      const cash = document.getElementById('startingCash').value;

      if (!date) { _showFormError('Vui lòng chọn ngày'); return; }

      try {
        const result = openShift({
          cashierName: staffName,
          shiftNumber: num,
          date: date,
          startingCash: cash,
          shiftPassword: shiftPass
        });
        
        // Auto validate the session for the opener
        sessionStorage.setItem('shift_validated', result.id);
        if (!_isManualMode) {
          const staff = _staffList.find(function(s) { return s.id === staffId; });
          if (staff) setLoggedInUser(staff);
        }

        showToast('Ca ' + num + ' đã mở thành công! 🎉', 'success');
        if (window.navigateTo) window.navigateTo('dashboard');
        else window.refreshView?.();
      } catch (err) {
        _showFormError(err.message || 'Không thể mở ca.');
      }
    });
  }
}
