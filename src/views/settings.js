/* ── Settings View (Feature 8+9) ────────────── */
import { getSettings, updateSettings } from '../store.js';
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

export function init() {
  document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
    const newSettings = {
      storeName: document.getElementById('settStoreName').value,
      storeAddress: document.getElementById('settStoreAddress').value,
      discrepancyThreshold: Number(document.getElementById('settDiscrepancy').value) || 50000,
      shiftWarningHours: Number(document.getElementById('settShiftWarning').value) || 10,
      autoSync: document.getElementById('settAutoSync').checked,
      requireLogin: document.getElementById('settRequireLogin').checked
    };
    updateSettings(newSettings);
    saveSettingsToCloud(newSettings).catch(() => {});
    showToast('Đã lưu cài đặt', 'success');
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
