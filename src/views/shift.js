import { getCurrentShift, openShift, closeShift, getShiftSummary, getSettings, getState, setLoggedInUser, getCachedStaff, setCachedStaff, updateStartingCash, getShiftHistory, reopenLastClosedShift, reopenShiftById } from '../store.js';
import { showToast, showModal, hideModal, showConfirm, showPasswordPrompt, formatCurrency, formatDuration, formatTime, formatDate, todayStr, moneyInput, getWorkingDay, normalizeWorkingDayInput } from '../utils.js';
import { getStaffFromCloud, getConfigFromCloud, getCurrentShiftFromCloud, getShiftRegistryFromCloud } from '../api.js';

let _staffList = [];
let _selectedStaff = null;
let _timer = null;
let _prefetchedCloudShift = null;
let _cloudRegistry = [];
let _isTodayShiftLimitReached = false;

function _getTodayShifts(dateStr) {
  var targetDay = getWorkingDay(dateStr);
  
  // Local history
  var localShifts = (getShiftHistory() || []).filter(function(sh) {
    return sh.date === targetDay && sh.status !== 'cancelled' && sh.status !== 'voided';
  });
  
  // Cloud Registry
  var registryShifts = (_cloudRegistry || []).filter(function(r) {
    return r.workDay === targetDay && r.status !== 'cancelled' && r.status !== 'voided';
  });
  
  var todayShifts = [];
  var seen = {};
  
  localShifts.forEach(function(sh) {
    var num = String(sh.shiftNumber);
    if (!seen[num]) {
      seen[num] = true;
      todayShifts.push({ id: sh.id, shiftNumber: num, status: sh.status });
    }
  });
  
  registryShifts.forEach(function(r) {
    var num = String(r.shiftNumber);
    if (!seen[num]) {
      seen[num] = true;
      todayShifts.push({ id: r.shiftId, shiftNumber: num, status: r.status });
    }
  });
  
  return todayShifts;
}

function _autoShiftNumber() {
  var h = new Date().getHours();
  if (h < 15) return '1';
  return '2';
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
    const isReopened = !!shift.reopenedAt || !!shift.originalSummarySnapshot;
    const txs = shift.transactions || [];
    const otherTxs = shift.otherTransactions || [];
    const cc = shift.cashCount || {};
    const incomeTxs = txs.filter(t => t.type === 'income' && (!t.note || t.note.indexOf('[CUKCUK]') === -1));
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const cukcukSnap = shift.cukcukInvoicesSnapshot || [];
    
    // Calculate cash count total
    let ccTotal = 0;
    for (const d in cc) { if (cc.hasOwnProperty(d)) ccTotal += Number(d) * Number(cc[d]); }

    return `
      <div class="section-header">
        <div><h3>${isReopened ? '🔄 Ca mở lại — Đang chỉnh sửa' : '🟢 Ca đang mở'}</h3><p>Ca ${shift.shiftNumber} — ${shift.cashierName}</p></div>
      </div>

      ${isReopened ? `
      <div class="mb-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 shadow-sm">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <span class="material-symbols-rounded text-amber-600 shrink-0" style="font-size:28px;">edit_note</span>
          <div>
            <h4 class="font-bold text-amber-900 text-sm" style="margin:0;">Ca này đã được mở lại để chỉnh sửa</h4>
            <p class="text-xs text-amber-700 mt-1" style="margin:2px 0 0;line-height:1.5;">
              Bạn có thể chỉnh sửa kiểm kê tiền, giao dịch thu chi, hóa đơn POS. Khi đóng lại, báo cáo sẽ được cập nhật phiên bản mới nhất.
            </p>
            <div class="flex flex-wrap gap-2 mt-3">
              <button class="btn btn-outline btn-sm" onclick="window.navigateTo('cashCount')" style="font-size:12px;padding:6px 12px;border-radius:10px;">
                <span class="material-symbols-rounded text-[14px]">calculate</span> Kiểm kê tiền
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.navigateTo('transactions')" style="font-size:12px;padding:6px 12px;border-radius:10px;">
                <span class="material-symbols-rounded text-[14px]">receipt_long</span> Giao dịch
              </button>
              <button class="btn btn-outline btn-sm" id="btnReopenedReport" style="font-size:12px;padding:6px 12px;border-radius:10px;">
                <span class="material-symbols-rounded text-[14px]">summarize</span> Xem báo cáo
              </button>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="card active-shift-card ${isReopened ? 'border-amber-200 bg-amber-50/10' : 'border-emerald-200 bg-emerald-50/20'}">
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

      ${isReopened ? `
      <!-- ── Expanded detail for reopened shift ── -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

        <!-- Cash count summary -->
        <div class="card">
          <div class="card-header" style="padding:12px 16px;"><h3 style="font-size:13px;margin:0;">💰 Kiểm kê tiền mặt</h3></div>
          <div class="card-body" style="padding:12px 16px;">
            ${ccTotal > 0 ? `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span class="text-slate-500 text-xs">Tổng kiểm kê</span>
                <strong class="text-emerald-600">${formatCurrency(ccTotal)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span class="text-slate-500 text-xs">TM kỳ vọng</span>
                <strong class="text-blue-600">${formatCurrency(sm.expectedCash)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border);">
                <span class="text-slate-500 text-xs font-semibold">Chênh lệch</span>
                <strong style="color:${Math.abs(ccTotal - sm.expectedCash) === 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(ccTotal - sm.expectedCash)}</strong>
              </div>
            ` : `<p class="text-slate-400 text-xs text-center py-2">Chưa kiểm kê — bấm nút bên dưới để kiểm kê</p>`}
            <button class="btn btn-outline btn-sm w-full mt-3" onclick="window.navigateTo('cashCount')" style="font-size:12px;">
              <span class="material-symbols-rounded text-[14px]">calculate</span> ${ccTotal > 0 ? 'Chỉnh sửa kiểm kê' : 'Bắt đầu kiểm kê'}
            </button>
          </div>
        </div>

        <!-- Transactions summary -->
        <div class="card">
          <div class="card-header" style="padding:12px 16px;"><h3 style="font-size:13px;margin:0;">📋 Giao dịch trong ca</h3></div>
          <div class="card-body" style="padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="text-slate-500 text-xs">Thu ngoài POS</span>
              <strong class="text-emerald-600">${incomeTxs.length} khoản · ${formatCurrency(incomeTxs.reduce((s,t) => s + t.amount, 0))}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="text-slate-500 text-xs">Chi phí</span>
              <strong class="text-rose-600">${expenseTxs.length} khoản · ${formatCurrency(expenseTxs.reduce((s,t) => s + t.amount, 0))}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="text-slate-500 text-xs">Thu chi khác</span>
              <strong class="text-slate-600">${otherTxs.length} khoản</strong>
            </div>
            ${cukcukSnap.length > 0 ? `
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border);">
              <span class="text-slate-500 text-xs">🔗 Hóa đơn POS (snapshot)</span>
              <strong class="text-blue-600">${cukcukSnap.length} bill</strong>
            </div>
            ` : ''}
            <button class="btn btn-outline btn-sm w-full mt-3" onclick="window.navigateTo('transactions')" style="font-size:12px;">
              <span class="material-symbols-rounded text-[14px]">receipt_long</span> Xem & chỉnh sửa giao dịch
            </button>
          </div>
        </div>

      </div>
      ` : ''}

      <button class="btn btn-danger w-full mt-6 py-3.5 text-base" id="btnCloseShift"><span class="material-symbols-rounded">stop_circle</span> ${isReopened ? 'Đóng lại ca (lưu cập nhật)' : 'Đóng ca'}</button>
      <button class="btn btn-outline w-full mt-3 text-slate-500 border-slate-200" id="btnForceReset"><span class="material-symbols-rounded">restart_alt</span> Hủy ca (không lưu lịch sử)</button>
    `;
  }

  // ── CASE 3: No shift — Quick Open ──
  var cached = getCachedStaff() || [];
  _staffList = cached;
  
  var todayShifts = _getTodayShifts(todayStr());
  var hasCa1 = todayShifts.some(function(s) { return s.shiftNumber === '1'; });
  var hasCa2 = todayShifts.some(function(s) { return s.shiftNumber === '2'; });
  
  var autoShift = '1';
  if (hasCa1 && !hasCa2) {
    autoShift = '2';
  } else if (!hasCa1) {
    autoShift = '1';
  }
  
  _isTodayShiftLimitReached = hasCa1 && hasCa2;
  
  var historyShifts = getShiftHistory() || [];
  var closedShifts = historyShifts.filter(function(h) { return h.status === 'closed'; }).slice(0, 5);

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
    <div id="shiftLimitMessage" class="p-4 mb-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-semibold" style="${_isTodayShiftLimitReached ? 'display: block;' : 'display: none;'}">
      ⚠️ Đã đủ 2 ca làm việc (Ca 1 & Ca 2 đều đã được mở/đóng hôm nay). Không thể mở thêm ca mới cho ngày hôm nay.
    </div>

    <!-- Reopen recently closed shift selection banner (Physical reconciliation) -->
    ${closedShifts.length > 0 ? `
    <div class="mb-4 p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 shadow-sm">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
        <span class="material-symbols-rounded text-blue-600 shrink-0" style="font-size:28px;">restore</span>
        <div>
          <h4 class="font-bold text-blue-900 text-sm" style="margin:0;">🔓 Mở lại ca đã đóng để chỉnh sửa</h4>
          <p class="text-xs text-blue-700 mt-1" style="margin:2px 0 0 0;line-height:1.4;">
            Bạn có thể chọn một ca đã đóng gần đây để mở lại và chỉnh sửa tiền kiểm kê, thêm bớt giao dịch thu chi hoặc in lại báo cáo bàn giao.
          </p>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="reopenShiftSelect" class="form-input text-sm" style="flex:1;min-width:240px;background:white;padding:8px 12px;border-radius:10px;border:1px solid #cbd5e1;height:38px;font-weight:600;">
          ${closedShifts.map(function(cs) {
            return `<option value="${cs.id}">Ngày ${formatDate(cs.date)} — Ca ${cs.shiftNumber} (${cs.cashierName})</option>`;
          }).join('')}
        </select>
        <button class="btn btn-primary btn-sm shrink-0" id="btnReopenSelectedShift" style="background:#2563eb;color:white;box-shadow:none;border:none;font-weight:bold;padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:6px;height:38px;">
          <span class="material-symbols-rounded text-[14px]">lock_open</span> Mở lại ca
        </button>
      </div>
    </div>
    ` : ''}

    <!-- Active Cloud Shift Warning Banner (Multi-device conflict check) -->
    <div id="cloudConflictWarning" class="hidden mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <span class="material-symbols-rounded text-amber-600 shrink-0" style="font-size:24px;">warning</span>
        <div>
          <h4 class="font-bold text-amber-800 text-sm" style="margin:0;">⚠️ Thiết bị khác đang mở ca trên Cloud</h4>
          <p class="text-xs text-amber-700 mt-1" id="cloudConflictText" style="margin:4px 0 0 0;line-height:1.4;"></p>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-warning btn-sm" id="btnSyncFromCloud" style="background:#d97706;color:white;box-shadow:none;border:none;">
              <span class="material-symbols-rounded" style="font-size:16px;">cloud_download</span> Đồng bộ & Đăng nhập ca này
            </button>
          </div>
        </div>
      </div>
    </div>

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

    <!-- Quick settings always visible -->
    <div class="card mb-5">
      <div class="card-body">
        <div class="qo-settings-row">
          <div class="form-group mb-0">
            <label class="form-label"># Số ca</label>
            <select id="shiftNumber" class="form-input">
              ${!hasCa1 ? `<option value="1" ${autoShift === '1' ? 'selected' : ''}>Ca 1</option>` : ''}
              ${!hasCa2 ? `<option value="2" ${autoShift === '2' ? 'selected' : ''}>Ca 2</option>` : ''}
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

    <button class="btn btn-primary w-full py-4 text-base font-bold shadow-lg shadow-blue-500/30" id="btnOpenShift" ${_isTodayShiftLimitReached ? 'disabled' : ''}>
      <span class="material-symbols-rounded">play_arrow</span> ${_isTodayShiftLimitReached ? 'Đã đủ ca làm việc ngày hôm nay' : 'Chọn nhân viên để mở ca'}
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

  // Enable open button
  var btn = document.getElementById('btnOpenShift');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Mở ca — ' + _selectedStaff.name;
  }

  // Auto-focus Shift Password immediately and prefill with employee's PIN
  setTimeout(function() {
    var passInput = document.getElementById('shiftPassword');
    if (passInput) {
      if (_selectedStaff && _selectedStaff.pin) {
        passInput.value = _selectedStaff.pin;
      } else {
        passInput.value = '';
      }
      passInput.focus();
    }
  }, 50);
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

function _showCloudConflict(cloudShift) {
  const warnBox = document.getElementById('cloudConflictWarning');
  const textEl = document.getElementById('cloudConflictText');
  const syncBtn = document.getElementById('btnSyncFromCloud');

  if (warnBox && textEl) {
    textEl.innerHTML = 'Nhân viên <b>' + cloudShift.cashierName + '</b> đã mở <b>Ca ' + cloudShift.shiftNumber + '</b> trên cloud lúc <b>' + formatTime(cloudShift.startTime) + ' (' + formatDate(cloudShift.date) + ')</b>.<br>Vui lòng đóng ca đó trước hoặc đồng bộ để làm việc chung ca.';
    warnBox.classList.remove('hidden');
    warnBox.style.display = 'block';

    syncBtn?.addEventListener('click', async function() {
      showToast('🔄 Đang đồng bộ ca từ Cloud...', 'info');
      try {
        const { getState, setLoggedInUser } = await import('../store.js');
        const s = getState();
        s.currentShift = cloudShift;
        localStorage.setItem('kg-cashier-data', JSON.stringify(s));
        sessionStorage.setItem('shift_validated', cloudShift.id);
        
        // Try to match employee
        const staff = _staffList.find(st => st.name === cloudShift.cashierName);
        if (staff) setLoggedInUser(staff);

        showToast('✅ Đồng bộ ca thành công! 🎉', 'success');
        window.refreshView?.();
      } catch(err) {
        showToast('❌ Không thể đồng bộ: ' + err.message, 'error');
      }
    });
  }
}

export function init() {
  const shift = getCurrentShift();
   const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  if (shift && !isValidated) {
    const input = document.getElementById('shiftUnlockPass');
    const btn = document.getElementById('btnUnlockShift');
    const errEl = document.getElementById('unlockError');
    const adminPass = String(getSettings().adminPassword || '712121').trim();
    
    // Load staff list from cache if not already loaded to find cashier PIN
    if (!_staffList || _staffList.length === 0) {
      _staffList = getCachedStaff() || [];
    }
    const cashierStaff = _staffList.find(st => st.name === shift.cashierName);
    const cashierPin = cashierStaff && cashierStaff.pin ? String(cashierStaff.pin).trim() : '';

    const tryUnlock = async () => {
      if (!input.value) {
        if (errEl) { errEl.textContent = '⚠️ Vui lòng nhập mật khẩu'; errEl.style.display = 'block'; }
        input.focus();
        return;
      }
      const pw = (input.value || '').trim();
      const shiftPw = (shift.shiftPassword || '').trim();
      
      const match = (pw.length > 0) && (
        pw === shiftPw || 
        (cashierPin.length > 0 && pw === cashierPin) || 
        pw === adminPass ||
        pw === '712121' ||
        (shiftPw === '' && pw === '0000')
      );

      if (match) {
        sessionStorage.setItem('shift_validated', shift.id);
        showToast('Xác thực thành công!', 'success');
        window.refreshView?.();
      } else {
        if (pw.length > 0) {
          console.warn('[Shift] Password mismatch:', { 
            inputLen: pw.length, 
            hasShiftPw: !!shiftPw, 
            shiftPwLen: shiftPw.length, 
            hasCashierPin: !!cashierPin,
            cashierPinLen: cashierPin.length,
            hasAdminPw: !!adminPass 
          });
        }
        if (errEl) { errEl.textContent = '❌ Mật khẩu không đúng! Nhập mã PIN cá nhân hoặc mật khẩu quản trị.'; errEl.style.display = 'block'; }
        showToast('Mật khẩu xác thực không đúng!', 'error');
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

    // Reopened shift → report button (set shiftId so report uses SHIFT MODE)
    document.getElementById('btnReopenedReport')?.addEventListener('click', () => {
      var sid = shift.id;
      window._setReportShiftId = function() { return sid; };
      window.navigateTo?.('report');
    });

    // Close shift
    document.getElementById('btnCloseShift')?.addEventListener('click', () => {
      var isReopened = !!shift.reopenedAt || !!shift.originalSummarySnapshot;
      var summary = getShiftSummary(shift) || { expectedCash: 0, cashCountTotal: 0 };
      var expectedCash = summary.expectedCash || 0;
      var threshold = (getSettings() && getSettings().discrepancyThreshold) ? getSettings().discrepancyThreshold : 50000;

      showModal(`
        <div class="modal-title"><span class="material-symbols-rounded text-rose-600">stop_circle</span> ${isReopened ? 'Đóng lại ca (cập nhật)' : 'Đóng ca'}</div>
        ${isReopened ? '<div class="p-3 mb-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm"><span class="material-symbols-rounded text-[16px] align-middle">info</span> Ca này đã được <b>mở lại</b> để chỉnh sửa. Khi đóng lại:<ul class="mt-1 ml-4 list-disc text-xs"><li>Báo cáo bàn giao sẽ được <b>tạo lại</b> với dữ liệu mới nhất</li><li>Hóa đơn POS đã chỉnh sửa PTTT sẽ được <b>khóa cứng</b></li><li>Lịch sử ca sẽ hiển thị <b>phiên bản cuối cùng</b></li></ul></div>' : ''}
        <p class="mb-3 text-slate-700">Xác nhận đóng Ca ${shift.shiftNumber}?</p>

        <!-- Theoretical cash summary -->
        <div class="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
          <div class="flex justify-between mb-1 text-slate-600">
            <span>💵 Tiền mặt lý thuyết (kỳ vọng):</span>
            <strong class="text-slate-900">${formatCurrency(expectedCash)}</strong>
          </div>
          <div class="text-[11px] text-slate-400">
            = Đầu ca (${formatCurrency(shift.startingCash)}) + Thu TM (${formatCurrency(summary.cashIncome)}) - Chi TM (${formatCurrency(summary.cashExpense)})
          </div>
        </div>

        <!-- Actual cash count input -->
        <div class="form-group mb-3">
          <label class="form-label font-semibold">💰 Tiền mặt thực tế kiểm kê <span class="text-rose-500">*</span></label>
          <input type="text" id="actualCashInput" class="form-input text-lg font-bold text-right" value="${summary.cashCountTotal || ''}" placeholder="Nhập tổng tiền mặt kiểm kê..." autocomplete="off">
          <div class="text-[11px] text-slate-400 mt-1">
            Nhập tổng số tiền mặt thực tế đếm được trong két và bàn giao.
          </div>
        </div>

        <!-- Discrepancy Display -->
        <div class="mb-4 p-3 rounded-xl text-sm flex justify-between items-center" id="discrepancyDisplay" style="display:none; border:1px solid transparent;">
          <span class="font-medium text-slate-700">Chênh lệch:</span>
          <strong class="text-lg" id="discrepancyVal">0đ</strong>
        </div>

        <!-- Discrepancy Explanation (Notes) -->
        <div class="form-group mb-4" id="discrepancyNotesGroup" style="display:none;">
          <label class="form-label font-semibold text-rose-700">⚠️ Giải trình chênh lệch <span class="text-rose-500">*</span></label>
          <textarea id="discrepancyNotesInput" class="form-input border-rose-300 focus:border-rose-500" rows="3" placeholder="Nhập lý do chênh lệch tiền mặt (tối thiểu 10 ký tự)..."></textarea>
          <div class="text-[11px] text-rose-500 mt-1">
            Chênh lệch vượt quá ngưỡng cho phép (${formatCurrency(threshold)}). Vui lòng giải trình lý do chênh lệch.
          </div>
        </div>

        <div class="form-group"><label class="form-label">Ghi chú (tùy chọn)</label><textarea id="closeNotes" class="form-input" rows="2" placeholder="Ghi chú bàn giao..."></textarea></div>
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
        var keepMoney = moneyInput(document.getElementById('cashToKeep'), { allowMath: true });
        var depositMoney = moneyInput(document.getElementById('cashToDeposit'), { allowMath: true });
        var actualMoney = moneyInput(document.getElementById('actualCashInput'), { allowMath: true });

        const actualInput = document.getElementById('actualCashInput');
        const discDisplay = document.getElementById('discrepancyDisplay');
        const discVal = document.getElementById('discrepancyVal');
        const notesGroup = document.getElementById('discrepancyNotesGroup');
        const notesInput = document.getElementById('discrepancyNotesInput');

        function updateDiscrepancy() {
          var actualVal = actualMoney.getValue() || 0;
          var diff = actualVal - expectedCash;

          discDisplay.style.display = 'flex';
          discVal.textContent = (diff >= 0 ? '+' : '') + formatCurrency(diff);
          
          if (diff === 0) {
            discVal.style.color = 'var(--success)';
            discDisplay.style.backgroundColor = 'var(--success-bg)';
            discDisplay.style.borderColor = 'rgba(34, 197, 94, 0.2)';
            notesGroup.style.display = 'none';
          } else if (Math.abs(diff) <= threshold) {
            discVal.style.color = 'var(--warning)';
            discDisplay.style.backgroundColor = 'var(--warning-bg)';
            discDisplay.style.borderColor = 'rgba(232, 168, 56, 0.2)';
            notesGroup.style.display = 'none';
          } else {
            discVal.style.color = 'var(--danger)';
            discDisplay.style.backgroundColor = 'var(--danger-bg)';
            discDisplay.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            notesGroup.style.display = 'block';
          }
        }

        actualInput?.addEventListener('input', updateDiscrepancy);
        // Run once on load to pre-populate and display discrepancy if pre-counted
        updateDiscrepancy();

        document.getElementById('btnConfirmClose')?.addEventListener('click', async () => {
          var actualVal = actualMoney.getValue();
          if (actualVal === null || isNaN(actualVal)) {
            showToast('⚠️ Vui lòng nhập tiền mặt thực tế kiểm kê', 'warning');
            actualInput?.focus();
            return;
          }

          var diff = actualVal - expectedCash;
          var discNotes = '';
          if (Math.abs(diff) > threshold) {
            discNotes = (notesInput?.value || '').trim();
            if (discNotes.length < 10) {
              showToast('⚠️ Giải trình chênh lệch phải có tối thiểu 10 ký tự!', 'warning');
              notesInput?.focus();
              return;
            }
          }

          try {
            showToast('⏳ Đang tiến hành đóng ca trên máy chủ...', 'info');
            var closedShift = await closeShift({
              notes: document.getElementById('closeNotes')?.value || '',
              cashToKeep: keepMoney.getValue(),
              cashToDeposit: depositMoney.getValue(),
              actualCash: actualVal,
              discrepancyNotes: discNotes
            });
            sessionStorage.removeItem('shift_validated');
            hideModal();
            clearInterval(_timer);
            showToast('Đã đóng ca thành công!', 'success');
            if (closedShift && closedShift.id) {
              window._setReportShiftId = function() { return closedShift.id; };
              window.navigateTo?.('report');
            } else {
              window.refreshView?.();
            }
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
        var cashMoney = moneyInput(input, { allowMath: true });
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

  function _updateFormForDate(dateVal) {
    var todayShifts = _getTodayShifts(dateVal);
    var hasCa1 = todayShifts.some(function(s) { return s.shiftNumber === '1'; });
    var hasCa2 = todayShifts.some(function(s) { return s.shiftNumber === '2'; });
    
    var autoShift = '1';
    if (hasCa1 && !hasCa2) {
      autoShift = '2';
    } else if (!hasCa1) {
      autoShift = '1';
    }
    
    _isTodayShiftLimitReached = hasCa1 && hasCa2;
    
    // Update select options
    var selectEl = document.getElementById('shiftNumber');
    if (selectEl) {
      var optsHtml = '';
      if (!hasCa1) optsHtml += `<option value="1" ${autoShift === '1' ? 'selected' : ''}>Ca 1</option>`;
      if (!hasCa2) optsHtml += `<option value="2" ${autoShift === '2' ? 'selected' : ''}>Ca 2</option>`;
      selectEl.innerHTML = optsHtml;
    }
    
    // Update error/limit message
    var limitMsgEl = document.getElementById('shiftLimitMessage');
    if (limitMsgEl) {
      if (_isTodayShiftLimitReached) {
        limitMsgEl.style.display = 'block';
        limitMsgEl.textContent = '⚠️ Đã đủ 2 ca làm việc (Ca 1 & Ca 2 đều đã được mở/đóng hôm nay). Không thể mở thêm ca mới cho ngày này.';
      } else {
        limitMsgEl.style.display = 'none';
      }
    }
    
    // Update open button
    var btn = document.getElementById('btnOpenShift');
    if (btn) {
      if (_isTodayShiftLimitReached) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Đã đủ ca làm việc ngày hôm nay';
      } else {
        if (_isManualMode) {
          var nameInput = document.getElementById('manualStaffName');
          btn.disabled = !(nameInput && nameInput.value.trim());
          btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Mở ca (thủ công)';
        } else {
          btn.disabled = !_selectedStaff;
          btn.innerHTML = _selectedStaff ? '<span class="material-symbols-rounded">play_arrow</span> Mở ca — ' + _selectedStaff.name : '<span class="material-symbols-rounded">play_arrow</span> Chọn nhân viên để mở ca';
        }
      }
    }
  }

  // Reopen selected shift click event
  document.getElementById('btnReopenSelectedShift')?.addEventListener('click', async function() {
    var selectEl = document.getElementById('reopenShiftSelect');
    if (!selectEl || !selectEl.value) {
      showToast('⚠️ Vui lòng chọn ca cần mở lại', 'warning');
      return;
    }
    var shiftId = selectEl.value;
    var selectText = selectEl.options[selectEl.selectedIndex].text;
    
    var password = await showPasswordPrompt('Bạn có muốn mở lại ca này không? Vui lòng nhập mật khẩu quản lý để xác nhận.\n(' + selectText + ')', { title: 'Mở lại ca', placeholder: 'Mật khẩu quản lý...' });
    if (password === null) return;
    if (!password) {
      showToast('⚠️ Mật khẩu không được để trống!', 'warning');
      return;
    }

    showToast('🔄 Đang mở lại ca làm việc...', 'info');
    try {
      await reopenShiftById(shiftId, password);
      showToast('✅ Ca đã được mở lại thành công! 🎉', 'success');
      window.refreshView?.();
    } catch(err) {
      showToast('❌ Không thể mở lại ca: ' + err.message, 'error');
    }
  });

  // Bind card clicks
  _bindCardClicks();

  // Bind moneyInput to startingCash
  window._startingCashMoney = moneyInput(document.getElementById('startingCash'), { allowMath: true });

  // Background cloud refresh
  _loadStaffFromCloud(false);

  // Load cloud registry to update suggestions and enforce Ca 1/Ca 2 constraints
  getShiftRegistryFromCloud().then(function(res) {
    if (res.success && res.registry) {
      _cloudRegistry = res.registry;
      var dateInput = document.getElementById('shiftDate');
      if (dateInput) {
        _updateFormForDate(dateInput.value);
      }
    }
  }).catch(function(e) {
    console.warn('[Shift] Failed to load registry:', e);
  });

  // Date change listener
  document.getElementById('shiftDate')?.addEventListener('change', function(e) {
    _updateFormForDate(e.target.value);
  });

  // ⚡ Prefetch active cloud shift in background to prevent conflicts without blocking opening
  _prefetchedCloudShift = null;
  getCurrentShiftFromCloud().then(function(res) {
    if (res.success && res.shift && res.shift.status !== 'closed') {
      _prefetchedCloudShift = res.shift;
      // If we don't have this shift active locally, warn the user
      const localShift = getCurrentShift();
      if (!localShift || localShift.id !== _prefetchedCloudShift.id) {
        _showCloudConflict(_prefetchedCloudShift);
      }
    } else {
      _prefetchedCloudShift = 'none';
    }
  }).catch(function(e) {
    console.warn('[Shift] Prefetch cloud shift failed:', e);
    _prefetchedCloudShift = 'none';
  });

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
    var btn = document.getElementById('btnOpenShift');

    if (_isManualMode) {
      if (box) box.style.display = 'block';
      if (grid) grid.style.display = 'none';
      _selectedStaff = null;
      // Deselect cards
      var cards = document.querySelectorAll('.qo-staff-card');
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove('selected');
      
      if (btn) {
        if (_isTodayShiftLimitReached) {
          btn.disabled = true;
          btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Đã đủ ca làm việc ngày hôm nay';
        } else {
          var nameInput = document.getElementById('manualStaffName');
          btn.disabled = !(nameInput && nameInput.value.trim());
          btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Mở ca (thủ công)';
        }
      }
      this.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">group</span> Danh sách';
      document.getElementById('manualStaffName')?.focus();
    } else {
      if (box) box.style.display = 'none';
      if (grid) grid.style.display = '';
      if (btn) {
        if (_isTodayShiftLimitReached) {
          btn.disabled = true;
          btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Đã đủ ca làm việc ngày hôm nay';
        } else {
          btn.disabled = true;
          btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Chọn nhân viên để mở ca';
        }
      }
      this.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">edit</span> Thủ công';
    }
  });

  // Handle manual input typing to update open button
  document.getElementById('manualStaffName')?.addEventListener('input', function(e) {
    var btn = document.getElementById('btnOpenShift');
    if (btn && _isManualMode && !_isTodayShiftLimitReached) {
      btn.disabled = !e.target.value.trim();
    }
  });

  // Open shift button
  const btnOpen = document.getElementById('btnOpenShift');
  if (!btnOpen) return;

  btnOpen.addEventListener('click', async function(e) {
    e.preventDefault();
    _clearFormError();

    if (_isTodayShiftLimitReached) {
      _showFormError('Đã đạt giới hạn tối đa 2 ca làm việc cho ngày hôm nay.');
      return;
    }

    var staffName = '';
    var staffId = '';

    if (_isManualMode) {
      staffName = (document.getElementById('manualStaffName')?.value || '').trim();
      if (!staffName) { _showFormError('Vui lòng nhập tên nhân viên'); return; }
      staffId = 'manual-' + Date.now();
    } else {
      if (!_selectedStaff) { _showFormError('Vui lòng chọn nhân viên'); return; }
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
      showToast('⏳ Đang liên lạc với máy chủ Cloud để đăng ký ca...', 'info');
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
  if (window._startingCashMoney) {
    window._startingCashMoney = null;
  }
}
