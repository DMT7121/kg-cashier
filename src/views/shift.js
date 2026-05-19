import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, getState, setLoggedInUser, getCachedStaff, setCachedStaff, updateStartingCash } from '../store.js';
import { showToast, showModal, hideModal, showConfirm, formatCurrency, formatDuration, formatTime, formatDate, todayStr, moneyInput } from '../utils.js';
import { getStaffFromCloud, getConfigFromCloud } from '../api.js';

let _staffList = [];
let _selectedStaff = null;
let _timer = null;



function _autoShiftNumber() {
  var h = new Date().getHours();
  if (h < 14) return '1';
  if (h < 22) return '2';
  return '3';
}

function _avatarBg(role) {
  if (role === 'admin') return 'var(--primary-glow)';
  if (role === 'manager') return 'var(--info-bg)';
  return 'var(--success-bg)';
}

function _roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Quản lý';
  return 'Thu ngân';
}

function _roleIcon(role) {
  if (role === 'admin') return 'admin_panel_settings';
  if (role === 'manager') return 'supervisor_account';
  return 'person';
}

function _roleClass(role) {
  if (role === 'admin') return 'qo-role-admin';
  if (role === 'manager') return 'qo-role-manager';
  return 'qo-role-cashier';
}

function _buildStaffCards(list) {
  var active = list.filter(function(s) { return s.status === 'active'; });
  if (active.length === 0) return '<div class="empty-state" style="padding:30px;grid-column:1/-1;"><p>Chưa có nhân viên. Thêm tại mục <b>Nhân viên</b> hoặc dùng <b>Nhập tên thủ công</b>.</p></div>';
  return active.map(function(s) {
    return '<div class="qo-staff-card" data-staff-id="' + s.id + '">' +
      '<div class="qo-check"><span class="material-symbols-rounded" style="font-size:14px;">check</span></div>' +
      '<div class="qo-avatar" style="background:' + _avatarBg(s.role) + ';"><span class="material-symbols-rounded" style="color:inherit;">' + _roleIcon(s.role) + '</span></div>' +
      '<div class="qo-name">' + s.name + '</div>' +
      '<div class="qo-role ' + _roleClass(s.role) + '">' + _roleLabel(s.role) + '</div>' +
    '</div>';
  }).join('');
}

export function render() {
  const shift = getCurrentShift();
  const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  // ── CASE 1: Shift OPEN but not validated ──
  if (shift && !isValidated) {
    return `
      <div class="empty-state py-16 px-5">
        <span class="material-symbols-rounded text-[64px] text-orange-500 mb-5 block">lock</span>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Ca đang mở — Xác thực</h2>
        <p class="text-slate-600 mb-2">Nhân viên <b class="text-slate-900">${shift.cashierName}</b> đang mở Ca ${shift.shiftNumber}</p>
        <p class="text-slate-500 mb-6">Nhập mật khẩu ca để truy cập</p>
        <div class="max-w-[320px] mx-auto">
          <div class="form-group">
            <label class="form-label">🔒 Mật khẩu ca</label>
            <input type="password" id="shiftUnlockPass" class="form-input text-center text-2xl tracking-[4px]" placeholder="••••" autofocus>
          </div>
          <div id="unlockError" class="hidden p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm font-semibold"></div>
          <button class="btn btn-primary w-full mt-2" id="btnUnlockShift">Xác nhận</button>
          <p class="text-slate-500 text-[11px] mt-4 mb-5">Mật khẩu do người mở ca thiết lập khi bắt đầu ca. Hoặc dùng mật khẩu quản lý.</p>
          <button class="btn btn-outline btn-sm text-rose-600 border-rose-200 hover:bg-rose-50" id="btnForceCloseGhost">
            <span class="material-symbols-rounded text-[14px]">close</span> Đóng ca cưỡng chế
          </button>
        </div>
      </div>
    `;
  }

  // ── CASE 2: Shift OPEN and validated ──
  if (shift) {
    const sm = getShiftSummary(shift);
    return `
      <div class="section-header">
        <div><h3>🟢 Ca đang mở</h3><p>Ca ${shift.shiftNumber} — ${shift.cashierName}</p></div>
      </div>
      <div class="card active-shift-card border-emerald-200 bg-emerald-50/20">
        <div class="card-body">
          <div class="shift-details-grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div><span class="block text-[11px] text-slate-500 font-medium">Thu ngân</span><strong class="block text-[15px] text-slate-900">${shift.cashierName}</strong></div>
            <div><span class="block text-[11px] text-slate-500 font-medium">Số ca</span><strong class="block text-[15px] text-slate-900">Ca ${shift.shiftNumber}</strong></div>
            <div><span class="block text-[11px] text-slate-500 font-medium">Ngày</span><strong class="block text-[15px] text-slate-900">${formatDate(shift.date)}</strong></div>
            <div><span class="block text-[11px] text-slate-500 font-medium">Bắt đầu</span><strong class="block text-[15px] text-slate-900">${formatTime(shift.startTime)}</strong></div>
            <div><span class="block text-[11px] text-slate-500 font-medium">Thời gian</span><strong class="block text-[15px] text-emerald-600" id="shiftTimer">${formatDuration(shift.startTime)}</strong></div>
            <div><span class="block text-[11px] text-slate-500 font-medium">Tiền đầu ca</span><strong class="block text-[15px] text-slate-900 flex items-center gap-2">${formatCurrency(shift.startingCash)} <button class="btn-icon w-6 h-6 p-0 border border-dashed border-slate-300 flex items-center justify-center text-xs" id="btnEditStartingCash" title="Bổ sung tiền đầu ca">✏️</button></strong></div>
          </div>
          <div class="shift-quick-stats flex flex-wrap gap-6 pt-4 border-t border-slate-200">
            <div class="quick-stat flex items-center gap-3"><span class="material-symbols-rounded w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">trending_up</span><div><small class="block text-xs text-slate-500 font-medium">Doanh thu</small><strong class="block text-lg text-emerald-600 font-bold">${formatCurrency(sm.totalIncome)}</strong></div></div>
            <div class="quick-stat flex items-center gap-3"><span class="material-symbols-rounded w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">trending_down</span><div><small class="block text-xs text-slate-500 font-medium">Chi phí</small><strong class="block text-lg text-rose-600 font-bold">${formatCurrency(sm.totalExpense)}</strong></div></div>
            <div class="quick-stat flex items-center gap-3"><span class="material-symbols-rounded w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">receipt</span><div><small class="block text-xs text-slate-500 font-medium">Bills</small><strong class="block text-lg text-slate-900 font-bold">${sm.billCount}</strong></div></div>
          </div>
        </div>
      </div>
      <button class="btn btn-danger w-full mt-6 py-3.5 text-base" id="btnCloseShift"><span class="material-symbols-rounded">stop_circle</span> Đóng ca</button>
      <button class="btn btn-outline w-full mt-3 text-slate-500 border-slate-200" id="btnForceReset"><span class="material-symbols-rounded">restart_alt</span> Hủy ca (không lưu lịch sử)</button>
    `;
  }

  // ── CASE 3: No shift — Quick Open ──
  var cached = getCachedStaff() || [];
  _staffList = cached;
  var autoShift = _autoShiftNumber();

  return `
    <div class="section-header">
      <div>
        <h3>⚡ Mở ca nhanh</h3>
        <p>Chọn nhân viên để bắt đầu ca làm việc</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" id="btnRefreshStaffList" title="Tải lại danh sách"><span class="material-symbols-rounded text-[18px]">refresh</span> Tải lại</button>
        <button class="btn btn-outline btn-sm" id="btnManualName"><span class="material-symbols-rounded text-[18px]">edit</span> Thủ công</button>
      </div>
    </div>

    <div id="shiftFormError" class="hidden p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm font-semibold"></div>

    <p id="staffLoadStatus" class="text-xs text-slate-500 mb-3">${cached.length > 0 ? '✅ ' + cached.length + ' nhân viên (cache)' : '⏳ Đang tải...'}</p>

    <div class="qo-staff-grid" id="staffGrid">
      ${_buildStaffCards(cached)}
    </div>

    <!-- Manual name input (hidden by default) -->
    <div id="manualNameBox" class="hidden mb-4">
      <div class="card border-orange-200 bg-orange-50/30">
        <div class="card-body">
          <label class="form-label">✏️ Nhập tên nhân viên</label>
          <input type="text" id="manualStaffName" class="form-input text-base" placeholder="Nhập tên nhân viên...">
          <p class="form-hint text-orange-600 mt-1">⚡ Mở ca nhanh — không cần PIN</p>
        </div>
      </div>
    </div>

    <!-- PIN + settings panel (shown after selecting staff) -->
    <div id="pinPanel" class="hidden"></div>

    <!-- Quick settings always visible -->
    <div class="card mb-5">
      <div class="card-body">
        <div class="qo-settings-row">
          <div class="form-group mb-0">
            <label class="form-label"># Số ca</label>
            <select id="shiftNumber" class="form-input">
              <option value="1" ${autoShift === '1' ? 'selected' : ''}>Ca 1</option>
              <option value="2" ${autoShift === '2' ? 'selected' : ''}>Ca 2</option>
              <option value="3" ${autoShift === '3' ? 'selected' : ''}>Ca 3</option>
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">📅 Ngày</label>
            <input type="date" id="shiftDate" class="form-input" value="${todayStr()}" required>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">💰 Tiền đầu ca</label>
            <input type="text" id="startingCash" class="form-input" placeholder="0" value="0" autocomplete="off">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">🔒 Mật khẩu ca <span class="text-rose-500">*</span></label>
            <input type="password" id="shiftPassword" class="form-input" placeholder="Nhập mật khẩu..." minlength="4" required>
            <p class="form-hint text-[10px] mt-1">Tối thiểu 4 ký tự — dùng để xác thực trên mọi thiết bị</p>
          </div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary w-full py-4 text-base font-bold shadow-lg shadow-blue-500/30" id="btnOpenShift" disabled>
      <span class="material-symbols-rounded">play_arrow</span> Chọn nhân viên để mở ca
    </button>
  `;
}

function _showFormError(msg) {
  const el = document.getElementById('shiftFormError');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  try { showToast(msg, 'warning'); } catch (e) { /* ignore */ }
}

function _clearFormError() {
  const el = document.getElementById('shiftFormError');
  if (el) el.style.display = 'none';
}

function _selectStaff(staffId) {
  _selectedStaff = null;
  for (var i = 0; i < _staffList.length; i++) {
    if (_staffList[i].id === staffId) { _selectedStaff = _staffList[i]; break; }
  }
  if (!_selectedStaff) return;

  // Update card selection
  var cards = document.querySelectorAll('.qo-staff-card');
  for (var j = 0; j < cards.length; j++) {
    if (cards[j].dataset.staffId === staffId) cards[j].classList.add('selected');
    else cards[j].classList.remove('selected');
  }

  // Show PIN panel
  var panel = document.getElementById('pinPanel');
  if (panel) {
    var hasPin = _selectedStaff.pin && _selectedStaff.pin !== '****' && _selectedStaff.pin !== '';
    panel.style.display = 'block';
    panel.innerHTML = '<div class="qo-pin-panel">' +
      '<div class="qo-pin-header"><span class="material-symbols-rounded" style="color:var(--primary);">person</span> <span class="qo-sel-name">' + _selectedStaff.name + '</span></div>' +
      (hasPin ? '<div class="form-group" style="margin-bottom:0;"><label class="form-label">🔑 Mã PIN cá nhân</label><input type="password" id="staffPin" class="form-input" placeholder="••••" maxlength="6" inputmode="numeric" autofocus style="font-size:20px;text-align:center;letter-spacing:4px;"></div>' : '<p style="font-size:12px;color:var(--success);"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">check_circle</span> Không yêu cầu PIN</p>') +
    '</div>';

    // Auto-focus PIN
    setTimeout(function() {
      var pinInput = document.getElementById('staffPin');
      if (pinInput) {
        pinInput.focus();
        pinInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('btnOpenShift').click(); });
      }
    }, 50);
  }

  // Enable open button
  var btn = document.getElementById('btnOpenShift');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Mở ca — ' + _selectedStaff.name;
  }
}

function _loadStaffFromCloud(isManual) {
  var statusEl = document.getElementById('staffLoadStatus');
  if (isManual && statusEl) { statusEl.textContent = '⏳ Đang tải lại từ Cloud...'; statusEl.style.color = 'var(--info)'; }

  getConfigFromCloud().then(function(configRes) {
    if (configRes.success && configRes.config && configRes.config.staff) {
      _staffList = configRes.config.staff;
      setCachedStaff(_staffList);
      _refreshGrid();
      if (statusEl) { statusEl.textContent = '✅ ' + _staffList.length + ' nhân viên'; statusEl.style.color = 'var(--success)'; }
      return;
    }
    return getStaffFromCloud().then(function(res) {
      if (res.success && res.staff) {
        _staffList = res.staff;
        setCachedStaff(_staffList);
        _refreshGrid();
        if (statusEl) { statusEl.textContent = '✅ ' + _staffList.length + ' nhân viên'; statusEl.style.color = 'var(--success)'; }
      } else if (isManual && statusEl) {
        statusEl.textContent = '⚠️ Không tải được — dùng "Thủ công"';
        statusEl.style.color = 'var(--warning)';
      }
    });
  }).catch(function() {
    getStaffFromCloud().then(function(res) {
      if (res.success && res.staff) {
        _staffList = res.staff;
        setCachedStaff(_staffList);
        _refreshGrid();
        if (statusEl) { statusEl.textContent = '✅ ' + _staffList.length + ' nhân viên'; statusEl.style.color = 'var(--success)'; }
      }
    }).catch(function() {
      if (statusEl && _staffList.length === 0) {
        statusEl.textContent = '❌ Offline — dùng "Thủ công"';
        statusEl.style.color = 'var(--danger)';
      }
    });
  });
}

function _refreshGrid() {
  var grid = document.getElementById('staffGrid');
  if (grid) {
    grid.innerHTML = _buildStaffCards(_staffList);
    _bindCardClicks();
  }
}

function _bindCardClicks() {
  var cards = document.querySelectorAll('.qo-staff-card[data-staff-id]');
  for (var i = 0; i < cards.length; i++) {
    (function(card) {
      card.addEventListener('click', function() { _selectStaff(card.dataset.staffId); });
    })(cards[i]);
  }
}

export function init() {
  const shift = getCurrentShift();
   const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  if (shift && !isValidated) {
    const input = document.getElementById('shiftUnlockPass');
    const btn = document.getElementById('btnUnlockShift');
    const errEl = document.getElementById('unlockError');
    const adminPass = getSettings().adminPassword || '';
    const tryUnlock = async () => {
      if (!input.value) {
        if (errEl) { errEl.textContent = '⚠️ Vui lòng nhập mật khẩu'; errEl.style.display = 'block'; }
        input.focus();
        return;
      }
      const pw = (input.value || '').trim();
      const shiftPw = (shift.shiftPassword || '').trim();
      const match = (pw.length > 0) && (pw === shiftPw || (adminPass.length > 0 && pw === adminPass));
      if (match) {
        sessionStorage.setItem('shift_validated', shift.id);
        showToast('Xác thực thành công!', 'success');
        window.refreshView?.();
      } else {
        if (pw.length > 0) console.warn('[Shift] Password mismatch:', { inputLen: pw.length, hasShiftPw: !!shiftPw, shiftPwLen: shiftPw.length, hasAdminPw: !!adminPass });
        if (errEl) { errEl.textContent = '❌ Mật khẩu ca không đúng! (Thử mật khẩu quản lý)'; errEl.style.display = 'block'; }
        showToast('Mật khẩu ca không đúng!', 'error');
        input.value = '';
        input.focus();
      }
    };
    btn?.addEventListener('click', tryUnlock);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

    // Force-close ghost shift
    document.getElementById('btnForceCloseGhost')?.addEventListener('click', async () => {
      const ok = await showConfirm(
        'Đóng ca cưỡng chế sẽ xóa ca hiện tại khỏi hệ thống mà KHÔNG lưu lịch sử. Bạn cần nhập mật khẩu quản lý để xác nhận.',
        { title: 'Đóng ca cưỡng chế', confirmText: 'Xóa ca', type: 'danger' }
      );
      if (ok) {
        const adminPass = getSettings().adminPassword || '';
        if (!adminPass) { showToast('⚠️ Chưa đặt mật khẩu quản lý! Vào Cài đặt → Hệ thống để thiết lập.', 'error', 5000); hideModal(); return; }
        showModal(`
          <div class="modal-title text-rose-600"><span class="material-symbols-rounded">warning</span> Xác nhận quản lý</div>
          <div class="form-group"><label class="form-label">Mật khẩu quản lý</label><input type="password" id="forceClosePass" class="form-input" autofocus></div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
            <button class="btn btn-danger" id="btnConfirmForceClose">Xóa ca</button>
          </div>
        `);
        setTimeout(() => {
          document.getElementById('btnConfirmForceClose')?.addEventListener('click', async () => {
            const passVal = document.getElementById('forceClosePass')?.value || '';
            if (passVal !== adminPass) { showToast('Mật khẩu quản lý không đúng!', 'error'); return; }
            // Clear current shift locally + on cloud
            var s = getState();
            var closedId = s.currentShift ? s.currentShift.id : null;
            // Mark this shift as force-closed so cloud sync won't restore it
            if (closedId) {
              if (!s._forceClosedIds) s._forceClosedIds = [];
              s._forceClosedIds.push(closedId);
            }
            // Close on cloud
            if (s.currentShift) {
              try {
                const { closeShiftOnCloud } = await import('../api.js');
                closeShiftOnCloud(s.currentShift).catch(function(){});
              } catch(e) { /* */ }
            }
            s.currentShift = null;
            try { localStorage.setItem('kg-cashier-data', JSON.stringify(s)); } catch(e) { /* */ }
            sessionStorage.removeItem('shift_validated');
            hideModal();
            showToast('Đã xóa ca cưỡng chế (local + cloud)', 'success');
            window.refreshView?.();
          });
          document.getElementById('forceClosePass')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btnConfirmForceClose')?.click();
          });
        }, 100);
      }
    });
    return;
  }

  if (shift) {
    // Timer
    if (_timer) clearInterval(_timer);
    _timer = setInterval(() => {
      const el = document.getElementById('shiftTimer');
      if (el) el.textContent = formatDuration(shift.startTime);
      else { clearInterval(_timer); _timer = null; }
    }, 30000);

    // Close shift
    document.getElementById('btnCloseShift')?.addEventListener('click', () => {
      showModal(`
        <div class="modal-title"><span class="material-symbols-rounded text-rose-600">stop_circle</span> Đóng ca</div>
        <p class="mb-4 text-slate-700">Xác nhận đóng Ca ${shift.shiftNumber}?</p>
        <div class="form-group"><label class="form-label">Ghi chú (tùy chọn)</label><textarea id="closeNotes" class="form-input" rows="3" placeholder="Ghi chú bàn giao..."></textarea></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Tiền giữ lại</label><input type="text" id="cashToKeep" class="form-input text-right font-bold" value="${shift.cashToKeep || 0}" autocomplete="off"></div>
          <div class="form-group"><label class="form-label">Tiền nộp</label><input type="text" id="cashToDeposit" class="form-input text-right font-bold" value="${shift.cashToDeposit || 0}" autocomplete="off"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
          <button class="btn btn-danger" id="btnConfirmClose"><span class="material-symbols-rounded">check</span> Đóng ca</button>
        </div>
      `);
      setTimeout(() => {
        var keepMoney = moneyInput(document.getElementById('cashToKeep'), { allowMath: false });
        var depositMoney = moneyInput(document.getElementById('cashToDeposit'), { allowMath: false });
        document.getElementById('btnConfirmClose')?.addEventListener('click', async () => {
          try {
            await closeShift({
              notes: document.getElementById('closeNotes')?.value || '',
              cashToKeep: keepMoney.getValue(),
              cashToDeposit: depositMoney.getValue()
            });
            sessionStorage.removeItem('shift_validated');
            hideModal();
            clearInterval(_timer);
            showToast('Đã đóng ca thành công!', 'success');
            window.refreshView?.();
          } catch (e) { showToast(e.message, 'error'); }
        });
      }, 100);
    });

    // Force reset
    document.getElementById('btnForceReset')?.addEventListener('click', async () => {
      var ok = await showConfirm('Ca sẽ bị xóa hoàn toàn, KHÔNG lưu vào lịch sử.\nHành động này không thể hoàn tác!', { title: '⚠️ HỦY CA HIỆN TẠI?', confirmText: 'Hủy ca', type: 'danger' });
      if (ok) {
        const s = getState();
        s.currentShift = null;
        try { localStorage.setItem('kg-cashier-data', JSON.stringify(s)); sessionStorage.removeItem('shift_validated'); } catch (e) { /* ignore */ }
        showToast('Đã hủy ca', 'info');
        window.refreshView?.();
      }
    });

    // Edit starting cash
    document.getElementById('btnEditStartingCash')?.addEventListener('click', () => {
      showModal(`
        <div class="modal-title"><span class="material-symbols-rounded text-orange-500">account_balance_wallet</span> Bổ sung tiền đầu ca</div>
        <p class="mb-3 text-slate-500 text-sm">Hiện tại: <strong class="text-slate-900">${formatCurrency(shift.startingCash)}</strong></p>
        <div class="form-group"><label class="form-label">Số tiền mới (tổng tiền đầu ca)</label><input type="text" id="newStartingCash" class="form-input text-lg font-bold text-right" value="${shift.startingCash}" autocomplete="off"></div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
          <button class="btn btn-primary" id="btnConfirmStartingCash"><span class="material-symbols-rounded">check</span> Cập nhật</button>
        </div>
      `);
      setTimeout(() => {
        const input = document.getElementById('newStartingCash');
        var cashMoney = moneyInput(input, { allowMath: false });
        input?.focus(); input?.select();
        document.getElementById('btnConfirmStartingCash')?.addEventListener('click', () => {
          try {
            const val = cashMoney.getValue();
            updateStartingCash(val);
            hideModal();
            showToast('✅ Tiền đầu ca: ' + formatCurrency(val), 'success');
            window.refreshView?.();
          } catch (e) { showToast(e.message, 'error'); }
        });
        input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('btnConfirmStartingCash')?.click(); });
      }, 100);
    });

    return;
  }

  // ── OPEN SHIFT FLOW ──
  _selectedStaff = null;
  var _isManualMode = false;

  // Bind card clicks
  _bindCardClicks();

  // Bind moneyInput to startingCash
  window._startingCashMoney = moneyInput(document.getElementById('startingCash'), { allowMath: false });

  // Background cloud refresh
  _loadStaffFromCloud(false);

  // Manual refresh
  document.getElementById('btnRefreshStaffList')?.addEventListener('click', function() {
    _loadStaffFromCloud(true);
    showToast('🔄 Tải lại danh sách nhân viên...', 'info');
  });

  // Toggle manual mode
  document.getElementById('btnManualName')?.addEventListener('click', function() {
    _isManualMode = !_isManualMode;
    var box = document.getElementById('manualNameBox');
    var grid = document.getElementById('staffGrid');
    var panel = document.getElementById('pinPanel');
    var btn = document.getElementById('btnOpenShift');

    if (_isManualMode) {
      if (box) box.style.display = 'block';
      if (grid) grid.style.display = 'none';
      if (panel) panel.style.display = 'none';
      _selectedStaff = null;
      // Deselect cards
      var cards = document.querySelectorAll('.qo-staff-card');
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove('selected');
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Mở ca (thủ công)'; }
      this.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">group</span> Danh sách';
      document.getElementById('manualStaffName')?.focus();
    } else {
      if (box) box.style.display = 'none';
      if (grid) grid.style.display = '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Chọn nhân viên để mở ca'; }
      this.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">edit</span> Thủ công';
    }
  });

  // Open shift button
  const btnOpen = document.getElementById('btnOpenShift');
  if (!btnOpen) return;

  btnOpen.addEventListener('click', async function(e) {
    e.preventDefault();
    _clearFormError();

    var staffName = '';
    var staffId = '';

    if (_isManualMode) {
      staffName = (document.getElementById('manualStaffName')?.value || '').trim();
      if (!staffName) { _showFormError('Vui lòng nhập tên nhân viên'); return; }
      staffId = 'manual-' + Date.now();
    } else {
      if (!_selectedStaff) { _showFormError('Vui lòng chọn nhân viên'); return; }
      // PIN verification
      var pin = (document.getElementById('staffPin')?.value || '').trim();
      var staffPin = String(_selectedStaff.pin || '');
      if (staffPin && staffPin !== '****' && staffPin !== pin) {
        _showFormError('Mã PIN không chính xác!');
        var pinEl = document.getElementById('staffPin');
        if (pinEl) { pinEl.style.borderColor = 'var(--danger)'; pinEl.style.boxShadow = '0 0 0 3px rgba(239,68,68,.2)'; pinEl.focus(); pinEl.value = ''; setTimeout(function() { pinEl.style.borderColor = ''; pinEl.style.boxShadow = ''; }, 3000); }
        return;
      }
      staffName = _selectedStaff.name;
      staffId = _selectedStaff.id;
    }

    const shiftPass = (document.getElementById('shiftPassword')?.value || '').trim();
    const num = document.getElementById('shiftNumber').value;
    const date = document.getElementById('shiftDate').value;
    const cash = window._startingCashMoney ? window._startingCashMoney.getValue() : parseInt(String(document.getElementById('startingCash').value).replace(/\./g, ''), 10) || 0;

    if (!date) { _showFormError('Vui lòng chọn ngày'); return; }
    if (!shiftPass || shiftPass.length < 4) {
      _showFormError('Mật khẩu ca phải có tối thiểu 4 ký tự');
      var passEl = document.getElementById('shiftPassword');
      if (passEl) { passEl.style.borderColor = 'var(--danger)'; passEl.focus(); setTimeout(function() { passEl.style.borderColor = ''; }, 3000); }
      return;
    }

    try {
      const result = await openShift({ cashierName: staffName, shiftNumber: num, date: date, startingCash: cash, shiftPassword: shiftPass });
      sessionStorage.setItem('shift_validated', result.id);
      if (!_isManualMode && _selectedStaff) setLoggedInUser(_selectedStaff);
      showToast('Ca ' + num + ' đã mở thành công! 🎉', 'success');
      if (window.navigateTo) window.navigateTo('dashboard');
      else window.refreshView?.();
    } catch (err) {
      _showFormError(err.message || 'Không thể mở ca.');
    }
  });
}

export function destroy() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
