/* ── Shift Management View ────────────────── */
import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, addAudit } from '../store.js';
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
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">👤 Tên thu ngân</label>
            <input type="text" id="cashierName" class="form-input" placeholder="Nhập tên..." value="">
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
            <label class="form-label">📅 Ngày</label>
            <input type="date" id="shiftDate" class="form-input" value="${todayStr()}">
          </div>
          <div class="form-group">
            <label class="form-label">💰 Tiền đầu ca (VNĐ)</label>
            <input type="number" id="startingCash" class="form-input" placeholder="0" value="0">
          </div>
        </div>

        <button class="btn btn-primary" style="width:100%;margin-top:16px;" id="btnOpenShift">
          <span class="material-symbols-rounded">play_arrow</span> Mở ca
        </button>
      </div>
    </div>
  `;
}

let _timer = null;

export function init() {
  const shift = getCurrentShift();

  if (shift) {
    _timer = setInterval(() => {
      const el = document.getElementById('shiftTimer');
      if (el) el.textContent = formatDuration(shift.startTime);
    }, 30000);

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
              notes: document.getElementById('closeNotes').value,
              cashToKeep: Number(document.getElementById('cashToKeep').value) || 0,
              cashToDeposit: Number(document.getElementById('cashToDeposit').value) || 0
            });
            hideModal();
            clearInterval(_timer);
            showToast('Đã đóng ca thành công!', 'success');
            window.refreshView?.();
          } catch (e) { showToast(e.message, 'error'); }
        });
      }, 100);
    });
  } else {
    document.getElementById('btnOpenShift')?.addEventListener('click', () => {
      const name = document.getElementById('cashierName').value.trim();
      const num = document.getElementById('shiftNumber').value;
      const date = document.getElementById('shiftDate').value;
      const cash = document.getElementById('startingCash').value;

      if (!name) { showToast('Vui lòng nhập tên thu ngân', 'warning'); return; }
      if (!date) { showToast('Vui lòng chọn ngày', 'warning'); return; }

      try {
        openShift({ cashierName: name, shiftNumber: num, date, startingCash: cash });
        showToast(`Ca ${num} đã mở thành công!`, 'success');
        window.refreshView?.();
      } catch (e) { showToast(e.message, 'error'); }
    });
  }
}
