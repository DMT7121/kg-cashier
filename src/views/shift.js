/* ── Shift Management View — FIXED ────────── */
import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, getState } from '../store.js';
import { showToast, showModal, hideModal, formatCurrency, formatDuration, formatTime, formatDate, todayStr } from '../utils.js';

export function render() {
  const shift = getCurrentShift();
  const settings = getSettings();

  if (shift) {
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

  return `
    <div class="section-header">
      <div>
        <h3>🔓 Mở ca mới</h3>
        <p>Nhập thông tin để bắt đầu ca làm việc</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div id="shiftFormError" style="display:none;padding:10px 14px;margin-bottom:14px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#ef4444;font-size:13px;font-weight:600;"></div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">👤 Tên thu ngân <span style="color:var(--danger);">*</span></label>
            <input type="text" id="cashierName" class="form-input" placeholder="Nhập tên thu ngân..." required autofocus>
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

  if (shift) {
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
        } catch (e) { /* ignore */ }
        showToast('Đã hủy ca', 'info');
        window.refreshView?.();
      }
    });

  } else {
    // ── OPEN SHIFT ──
    const btnOpen = document.getElementById('btnOpenShift');
    if (!btnOpen) {
      console.error('btnOpenShift not found in DOM!');
      return;
    }

    btnOpen.addEventListener('click', function handleOpenShift(e) {
      e.preventDefault();
      _clearFormError();

      console.log('[Shift] Open button clicked');

      // Get values
      const nameEl = document.getElementById('cashierName');
      const numEl = document.getElementById('shiftNumber');
      const dateEl = document.getElementById('shiftDate');
      const cashEl = document.getElementById('startingCash');

      if (!nameEl || !numEl || !dateEl || !cashEl) {
        console.error('[Shift] Form elements not found:', { nameEl, numEl, dateEl, cashEl });
        alert('Lỗi: Không tìm thấy form. Vui lòng tải lại trang.');
        return;
      }

      const name = nameEl.value.trim();
      const num = numEl.value;
      const date = dateEl.value;
      const cash = cashEl.value;

      console.log('[Shift] Values:', { name, num, date, cash });

      // Validate
      if (!name) {
        _showFormError('Vui lòng nhập tên thu ngân');
        _highlightField('cashierName');
        return;
      }

      if (!date) {
        _showFormError('Vui lòng chọn ngày');
        _highlightField('shiftDate');
        return;
      }

      // Check existing shift
      const existing = getCurrentShift();
      if (existing) {
        _showFormError(`Đã có Ca ${existing.shiftNumber} đang mở bởi ${existing.cashierName}. Hãy đóng ca trước.`);
        return;
      }

      // Attempt to open
      try {
        const result = openShift({
          cashierName: name,
          shiftNumber: num,
          date: date,
          startingCash: cash
        });
        console.log('[Shift] Opened successfully:', result);
        showToast(`Ca ${num} đã mở thành công! 🎉`, 'success');
        // Navigate to dashboard
        if (window.navigateTo) {
          window.navigateTo('dashboard');
        } else {
          window.refreshView?.();
        }
      } catch (err) {
        console.error('[Shift] Open error:', err);
        _showFormError(err.message || 'Không thể mở ca. Vui lòng thử lại.');
      }
    });

    // Also support Enter key to submit
    const nameInput = document.getElementById('cashierName');
    const cashInput = document.getElementById('startingCash');

    [nameInput, cashInput].forEach(input => {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnOpen.click();
        }
      });
    });

    // Clear error on input
    [nameInput, cashInput, document.getElementById('shiftDate')].forEach(input => {
      input?.addEventListener('input', _clearFormError);
    });

    // Auto-focus name field
    setTimeout(() => nameInput?.focus(), 200);
  }
}
