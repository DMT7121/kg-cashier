import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, getState, setLoggedInUser } from '../store.js';
import { showToast, showModal, hideModal, formatCurrency, formatDuration, formatTime, formatDate, todayStr } from '../utils.js';
import { getStaffFromCloud } from '../api.js';

let _staffList = [];

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
            <select id="staffSelect" class="form-input" required autofocus>
              <option value="">-- Đang tải... --</option>
            </select>
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

        <div class="form-row">
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

    // Timer
    _timer = setInterval(() => {
      const el = document.getElementById('shiftTimer');
      if (el) el.textContent = formatDuration(shift.startTime);
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
    document.getElementById('btnForceReset')?.addEventListener('click', () => {
      if (confirm('⚠️ HỦY CA HIỆN TẠI?\n\nCa sẽ bị xóa hoàn toàn, KHÔNG lưu vào lịch sử.\nHành động này không thể hoàn tác!')) {
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
    // Load staff
    getStaffFromCloud().then(res => {
      if (res.success) {
        _staffList = res.staff || [];
        const select = document.getElementById('staffSelect');
        if (select) {
          select.innerHTML = '<option value="">-- Chọn nhân viên --</option>' + 
            _staffList.filter(s => s.status === 'active').map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
      }
    });

    const btnOpen = document.getElementById('btnOpenShift');
    if (!btnOpen) return;

    btnOpen.addEventListener('click', function handleOpenShift(e) {
      e.preventDefault();
      _clearFormError();

      const staffId = document.getElementById('staffSelect').value;
      const pin = document.getElementById('staffPin').value.trim();
      const shiftPass = document.getElementById('shiftPassword').value || '0000';
      const num = document.getElementById('shiftNumber').value;
      const date = document.getElementById('shiftDate').value;
      const cash = document.getElementById('startingCash').value;

      if (!staffId) { _showFormError('Vui lòng chọn nhân viên'); return; }
      
      const staff = _staffList.find(s => s.id === staffId);
      if (!staff || staff.pin !== pin) {
        _showFormError('Mã PIN không chính xác!');
        _highlightField('staffPin');
        return;
      }

      if (!date) { _showFormError('Vui lòng chọn ngày'); return; }

      try {
        const result = openShift({
          cashierName: staff.name,
          shiftNumber: num,
          date: date,
          startingCash: cash,
          shiftPassword: shiftPass
        });
        
        // Auto validate the session for the opener
        sessionStorage.setItem('shift_validated', result.id);
        setLoggedInUser(staff);

        showToast(`Ca ${num} đã mở thành công! 🎉`, 'success');
        if (window.navigateTo) window.navigateTo('dashboard');
        else window.refreshView?.();
      } catch (err) {
        _showFormError(err.message || 'Không thể mở ca.');
      }
    });
  }
}
