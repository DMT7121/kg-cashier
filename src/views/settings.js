/* ── Settings View — Consolidated Hub ──
   Tabs: Hệ thống | Nhân viên | Nhật ký | Biểu mẫu in
   ── */
import { getSettings, updateSettings, getCategories, addCategory, removeCategory, getPrintForms } from '../store.js';
import { showToast, showConfirm } from '../utils.js';
import { saveSettingsToCloud, pingAPI, isOnline, getQueueSize } from '../api.js';

// Sub-modules (lazy-rendered via tabs)
import * as staffModule from './staff.js';
import * as auditModule from './auditLog.js';
import * as printModule from './printForms.js';

let _activeTab = 'system';

const _tabs = [
  { key: 'system',  icon: 'settings',     label: 'Hệ thống' },
  { key: 'printer', icon: 'print',        label: 'Máy in POS' },
  { key: 'staff',   icon: 'group',        label: 'Nhân viên' },
  { key: 'audit',   icon: 'history_edu',  label: 'Nhật ký' },
  { key: 'print',   icon: 'description',  label: 'Biểu mẫu in' },
  { key: 'inventory', icon: 'inventory_2', label: 'Kho & NCC' },
];

function _renderTabs() {
  return `<div class="settings-tabs">
    ${_tabs.map(t => `
      <button class="settings-tab ${_activeTab === t.key ? 'active' : ''}" data-stab="${t.key}">
        <span class="material-symbols-rounded">${t.icon}</span>
        <span>${t.label}</span>
      </button>
    `).join('')}
  </div>`;
}

// ── System tab content (original settings) ──
function _renderSystemTab() {
  const s = getSettings();
  const online = isOnline();
  const queueSize = getQueueSize();
  const hasCukcuk = s.cukcuk && s.cukcuk.domain && s.cukcuk.appId && s.cukcuk.key;
  const cukcukDomain = (s.cukcuk && s.cukcuk.domain) ? s.cukcuk.domain : '';
  const cukcukAppId = (s.cukcuk && s.cukcuk.appId) ? s.cukcuk.appId : 'CUKCUKOpenPlatform';
  const cukcukKey = (s.cukcuk && s.cukcuk.key) ? s.cukcuk.key : '';

  const vk = s.vatKeys || {};
  const _k = (arr) => (Array.isArray(arr) ? arr : []).join('\n');

  return `
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
            <label class="toggle-switch">
              <input type="checkbox" id="settAutoSync" ${s.autoSync !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;">
            <label class="form-label" style="margin-bottom:0;flex:1;">Yêu cầu đăng nhập PIN</label>
            <label class="toggle-switch">
              <input type="checkbox" id="settRequireLogin" ${s.requireLogin ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- CUKCUK Integration -->
    <div class="card mt-24" style="border:1px solid ${hasCukcuk ? '#10b981' : 'rgba(255,255,255,.15)'};">
      <div class="card-header" style="background:rgba(16,185,129,0.1);color:#059669;">
        <h3>🔌 Tích hợp MISA CUKCUK</h3>
        ${hasCukcuk ? '<span class="tag tag-income" style="font-size:11px;">Đã cấu hình</span>' : '<span class="tag tag-expense" style="font-size:11px;">Chưa cấu hình</span>'}
      </div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:15px;">
          Tự động đồng bộ hóa đơn thanh toán từ hệ thống CUKCUK POS vào mục <strong>Khoản thu</strong> (Doanh thu bán hàng).
          <br>Để lấy thông tin cấu hình: Đăng nhập CUKCUK → Ứng dụng → API → Tạo mã kết nối.
        </p>
        
        <div class="form-group">
          <label class="form-label">Tên miền CUKCUK</label>
          <input type="text" class="form-input" id="cuk_domain" value="${cukcukDomain}" placeholder="kinggrill hoặc kinggrill.cukcuk.vn">
          <p class="form-hint">Chỉ cần nhập phần tên, VD: kinggrill (không cần .cukcuk.vn)</p>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div class="form-group">
            <label class="form-label">App ID (Tên kết nối)</label>
            <input type="text" class="form-input" id="cuk_appId" value="${cukcukAppId}" placeholder="CUKCUKOpenPlatform">
          </div>
          <div class="form-group">
            <label class="form-label">Secret Key (Mã bảo mật)</label>
            <input type="password" class="form-input" id="cuk_key" value="${cukcukKey}" placeholder="Dán Secret Key từ CUKCUK">
          </div>
        </div>

        <!-- Auto-sync toggle -->
        <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);margin-top:10px;">
          <label class="form-label" style="margin-bottom:0;flex:1;">
            Tự động đồng bộ khi mở ca
            <span class="text-muted" style="font-size:11px;display:block;">Tự động lấy hóa đơn CUKCUK mỗi 5 phút khi ca đang mở</span>
          </label>
          <label class="toggle-switch">
            <input type="checkbox" id="cuk_autoSync" ${(s.cukcuk && s.cukcuk.autoSync) ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button class="btn btn-outline btn-sm" id="btnTestCukCuk">
            <span class="material-symbols-rounded">wifi_find</span> Kiểm tra kết nối
          </button>
          <button class="btn btn-success btn-sm" id="btnSyncCukCuk">
            <span class="material-symbols-rounded">sync</span> Đồng bộ hóa đơn ngay
          </button>
        </div>

        <!-- Connection result display -->
        <div id="cukcukResult" style="display:none;margin-top:12px;padding:12px 16px;border-radius:8px;font-size:13px;white-space:pre-wrap;"></div>
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
    </div>

    <!-- Cấu hình API Keys -->
    <div class="card mt-24">
      <div class="card-header" style="background:var(--bg-secondary);">
        <h3><span class="material-symbols-rounded" style="vertical-align:middle; margin-right:8px;">admin_panel_settings</span> Cấu Hình API Keys</h3>
      </div>
      <div class="card-body">
        <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2); border-radius:var(--radius); padding:16px; margin-bottom:20px;">
          <label class="form-label" style="color:#818cf8;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle;">key</span> Admin Access (Lấy key tự động)</label>
          <div style="display:flex; gap:8px; max-width:400px;">
            <input type="password" id="sett-vat-admin-password" class="form-input" placeholder="Nhập mã truy cập admin...">
            <button class="btn" style="background:#4f46e5; color:#fff;" id="sett-vat-btn-admin-login">Lấy Key</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px;">
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>Gemini</span> <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-gemini" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.gemini)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>DeepSeek</span> <a href="https://platform.deepseek.com/api_keys" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-deepseek" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.deepseek)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>Groq</span> <a href="https://console.groq.com/keys" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-groq" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.groq)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>SambaNova</span> <a href="https://cloud.sambanova.ai/" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-sambanova" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.sambanova)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>Cerebras</span> <a href="https://cloud.cerebras.ai/" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-cerebras" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.cerebras)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>HuggingFace</span> <a href="https://huggingface.co/settings/tokens" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-hf" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.hf)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>Mistral AI</span> <a href="https://console.mistral.ai/api-keys/" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-mistral" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.mistral)}</textarea></div>
          <div class="form-group"><label class="form-label" style="display:flex; justify-content:space-between;"><span>NVIDIA</span> <a href="https://build.nvidia.com/explore/discover" target="_blank" style="font-size:10px;">Lấy Key</a></label><textarea id="vat-key-nvidia" class="form-input" rows="2" style="font-size:11px; font-family:monospace;">${_k(vk.nvidia)}</textarea></div>
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

// ── Printer tab ────────────────────────────
function _getPrinterCfg() {
  var settings = getSettings();
  if (!settings.printer) {
    settings.printer = { kitchenIp:'', sashimiIp:'', barIp:'', useQzTray:false };
  }
  return settings.printer;
}
function _savePrinterCfg(cfg) { 
  var settings = getSettings();
  settings.printer = cfg;
  import('../store.js').then(store => store.updateSettings(settings));
}

function _renderPrinterTab() {
  var cfg = _getPrinterCfg();
  return `
    <div class="card" style="margin-bottom:20px;border:1px solid rgba(249,115,22,.3);">
      <div class="card-header" style="background:rgba(249,115,22,.08);color:#f97316;">
        <h3>🖨️ Cấu hình Máy in POS</h3>
        <span class="tag" style="background:rgba(249,115,22,.15);color:#f97316;font-size:11px;">Phase 2</span>
      </div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:16px;">
          Cấu hình máy in nhiệt K80 cho quầy thu ngân, bếp và bar.
          <br>Mặc định sử dụng <strong>window.print()</strong> qua popup trình duyệt.
          Nếu cài <a href="https://qz.io" target="_blank" style="color:var(--primary);">QZ Tray</a> trên máy thu ngân, bật chế độ QZ Tray để in tự động không cần popup.
        </p>
        <div class="form-group" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(249,115,22,.06);border-radius:8px;margin-bottom:16px;">
          <label class="form-label" style="margin:0;flex:1;">
            Sử dụng QZ Tray (in tự động qua LAN)
            <span class="text-muted" style="font-size:11px;display:block;">Cần cài QZ Tray trên máy thu ngân. WebSocket: localhost:8182</span>
          </label>
          <label class="toggle-switch">
            <input type="checkbox" id="prUseQz" ${cfg.useQzTray ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="form-group">
            <label class="form-label">🍳 IP / Tên Máy in Bếp</label>
            <input type="text" id="prKitchenIp" class="form-input" value="${cfg.kitchenIp}" placeholder="VD: 192.168.1.100">
            <p class="form-hint">Bếp chính (food)</p>
          </div>
          <div class="form-group">
            <label class="form-label">🐟 IP / Tên Máy in Sashimi</label>
            <input type="text" id="prSashimiIp" class="form-input" value="${cfg.sashimiIp || ''}" placeholder="VD: 192.168.1.102">
            <p class="form-hint">Sashimi, Gỏi, Salad, Nướng</p>
          </div>
          <div class="form-group">
            <label class="form-label">🍹 IP / Tên Máy in Bar</label>
            <input type="text" id="prBarIp" class="form-input" value="${cfg.barIp}" placeholder="VD: 192.168.1.101">
            <p class="form-hint">Đồ uống (drink)</p>
          </div>
        </div>
        
        <div id="qzPrinterSelector" style="display:none; margin-bottom:16px; padding:12px; background:rgba(14,165,233,.08); border:1px solid rgba(14,165,233,.3); border-radius:8px;">
          <label class="form-label" style="color:#0ea5e9;margin-bottom:8px;">Danh sách máy in tìm thấy trên máy tính:</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="qzPrintersList" class="form-input" style="flex:1;min-width:200px;background:var(--bg-dark);"></select>
            <button class="btn btn-outline btn-sm" id="btnAssignKitchen" style="border-color:#10b981;color:#10b981;">+ Gán Bếp</button>
            <button class="btn btn-outline btn-sm" id="btnAssignSashimi" style="border-color:#f97316;color:#f97316;">+ Gán Sashimi</button>
            <button class="btn btn-outline btn-sm" id="btnAssignBar" style="border-color:#6366f1;color:#6366f1;">+ Gán Bar</button>
          </div>
        </div>
        
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnPrSave">
            <span class="material-symbols-rounded">save</span> Lưu cấu hình
          </button>
          <button class="btn btn-outline btn-sm" id="btnPrTestQz" style="color:#f97316;border-color:rgba(249,115,22,.4);">
            <span class="material-symbols-rounded">wifi_find</span> Kiểm tra QZ
          </button>
          <button class="btn btn-outline btn-sm" id="btnPrScan" style="color:#0ea5e9;border-color:rgba(14,165,233,.4);">
            <span class="material-symbols-rounded">search</span> Dò máy in
          </button>
          <button class="btn btn-outline btn-sm" id="btnPrTestKitchen" style="color:#10b981;border-color:rgba(16,185,129,.4);">
            <span class="material-symbols-rounded">print</span> In thử Bếp
          </button>
          <button class="btn btn-outline btn-sm" id="btnPrTestSashimi" style="color:#f97316;border-color:rgba(249,115,22,.4);">
            <span class="material-symbols-rounded">print</span> In thử Sashimi
          </button>
          <button class="btn btn-outline btn-sm" id="btnPrTestBar" style="color:#6366f1;border-color:rgba(99,102,241,.4);">
            <span class="material-symbols-rounded">print</span> In thử Bar
          </button>
        </div>
        <div id="prResult" style="display:none;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>📲 Hướng dẫn cài QZ Tray</h3></div>
      <div class="card-body">
        <ol style="font-size:13px;line-height:2;color:var(--text-muted);padding-left:18px;">
          <li>Tải QZ Tray tại <a href="https://qz.io/download" target="_blank" style="color:var(--primary);">qz.io/download</a></li>
          <li>Cài đặt và chạy QZ Tray trên máy thu ngân (Windows/Mac)</li>
          <li>Bật toggle <strong>"Sử dụng QZ Tray"</strong> và nhập IP máy in</li>
          <li>Khi bấm <strong>"⚡ Báo Bếp/Bar"</strong> trong POS, lệnh in sẽ đi thẳng qua mạng LAN</li>
        </ol>
        <div style="margin-top:12px;padding:12px;background:rgba(99,102,241,.06);border-radius:8px;border:1px solid rgba(99,102,241,.2);font-size:12px;">
          <strong>💡 Phương án B — Local Proxy</strong><br>
          Nếu không muốn cài QZ Tray, có thể chạy một server NodeJS nhỏ trên máy thu ngân
          nhận lệnh qua <code>http://localhost:5000/print</code> và gửi ESC/POS qua socket TCP.
          Liên hệ quản trị viên để cấu hình.
        </div>
      </div>
    </div>
  `;
}

function _initPrinterTab() {
  document.getElementById('btnPrSave')?.addEventListener('click', function() {
    var cfg = {
      useQzTray: document.getElementById('prUseQz')?.checked || false,
      kitchenIp: document.getElementById('prKitchenIp')?.value.trim() || '',
      sashimiIp: document.getElementById('prSashimiIp')?.value.trim() || '',
      barIp: document.getElementById('prBarIp')?.value.trim() || ''
    };
    _savePrinterCfg(cfg);
    showToast('\u2705 Đã lưu cấu hình máy in', 'success');
  });
  document.getElementById('btnPrTestQz')?.addEventListener('click', async function() {
    var el = document.getElementById('prResult');
    try {
      if (!window.qz) {
        await new Promise((resolve, reject) => {
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js';
          script.onload = () => {
            qz.security.setCertificatePromise((resolve, reject) => resolve());
            qz.security.setSignaturePromise((toSign) => (resolve, reject) => resolve());
            resolve();
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 1 });
      }
      
      if (el) { el.style.display='block'; el.style.background='rgba(16,185,129,.1)'; el.style.border='1px solid rgba(16,185,129,.3)'; el.style.color='#34d399'; el.textContent='✅ Kết nối QZ Tray thành công!'; }
      showToast('✅ QZ Tray hoạt động!', 'success');
    } catch(e) { 
      if (el) { el.style.display='block'; el.style.background='rgba(239,68,68,.1)'; el.style.border='1px solid rgba(239,68,68,.3)'; el.style.color='#f87171'; el.textContent='❌ Lỗi kết nối QZ Tray: ' + e.message; }
      showToast('❌ Lỗi QZ Tray', 'error'); 
    }
  });

  document.getElementById('btnPrScan')?.addEventListener('click', async function() {
    var btn = document.getElementById('btnPrScan');
    var el = document.getElementById('prResult');
    var selector = document.getElementById('qzPrinterSelector');
    var list = document.getElementById('qzPrintersList');
    try {
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang dò...';
      
      if (!window.qz) {
        await new Promise((resolve, reject) => {
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js';
          script.onload = () => {
            qz.security.setCertificatePromise((resolve, reject) => resolve());
            qz.security.setSignaturePromise((toSign) => (resolve, reject) => resolve());
            resolve();
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 1 });
      }
      
      const printers = await qz.printers.find();
      if (printers && printers.length > 0) {
        list.innerHTML = printers.map(p => `<option value="${p}">${p}</option>`).join('');
        selector.style.display = 'block';
        if (el) el.style.display = 'none';
        showToast('✅ Tìm thấy ' + printers.length + ' máy in', 'success');
      } else {
        throw new Error('Không tìm thấy máy in nào được cài đặt trên máy này.');
      }
    } catch(e) {
      if (el) { el.style.display='block'; el.style.background='rgba(239,68,68,.1)'; el.style.border='1px solid rgba(239,68,68,.3)'; el.style.color='#f87171'; el.textContent='❌ Lỗi quét máy in: ' + e.message; }
      showToast('❌ Không tìm thấy máy in', 'error');
    } finally {
      btn.innerHTML = '<span class="material-symbols-rounded">search</span> Dò máy in';
    }
  });

  document.getElementById('btnAssignKitchen')?.addEventListener('click', function() {
    var sel = document.getElementById('qzPrintersList').value;
    if (sel) {
      document.getElementById('prKitchenIp').value = sel;
      showToast('Đã gán "' + sel + '" cho Bếp', 'success');
    }
  });
  
  document.getElementById('btnAssignSashimi')?.addEventListener('click', function() {
    var sel = document.getElementById('qzPrintersList').value;
    if (sel) {
      document.getElementById('prSashimiIp').value = sel;
      showToast('Đã gán "' + sel + '" cho Bếp Sashimi', 'success');
    }
  });
  
  document.getElementById('btnAssignBar')?.addEventListener('click', function() {
    var sel = document.getElementById('qzPrintersList').value;
    if (sel) {
      document.getElementById('prBarIp').value = sel;
      showToast('Đã gán "' + sel + '" cho Bar', 'success');
    }
  });

  function _testPrint(dest) {
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;}body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}@media print{@page{size:80mm auto;margin:0;}}h2{font-size:18px;text-align:center;margin-bottom:6px;}hr{border-top:1px dashed #000;margin:4px 0;}</style></head><body>' +
      '<h2>⚡ TEST ' + dest.toUpperCase() + '</h2><hr>' +
      '<div style="font-size:16px;font-weight:bold;padding:8px 0;">3 x Món kiểm tra</div>' +
      '<div style="font-size:16px;font-weight:bold;padding:8px 0;">1 x Phương án in OK</div><hr>' +
      '<div style="text-align:center;font-size:11px;">--- HẾT PHIẾU ---</div>' +
      '<script>window.onload=function(){window.print();window.close();}<\/script></body></html>';
    var w = window.open('', '_blank', 'width=380,height=400');
    if (w) { w.document.write(html); w.document.close(); }
    else showToast('Cho phép popup để in thử', 'warning');
  }
  document.getElementById('btnPrTestKitchen')?.addEventListener('click', function(){ _testPrint('Bếp'); });
  document.getElementById('btnPrTestSashimi')?.addEventListener('click', function(){ _testPrint('Bếp Sashimi'); });
  document.getElementById('btnPrTestBar')?.addEventListener('click', function(){ _testPrint('Bar'); });
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
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const catName = btn.dataset.removeCat;
      const catType = btn.dataset.catType;
      var ok = await showConfirm(`Xóa danh mục "${catName}"?`, { title: 'Xóa danh mục', confirmText: 'Xóa', type: 'danger' });
      if (ok) {
        removeCategory(catType, catName);
        showToast(`Đã xóa danh mục: ${catName}`, 'info');
        _refreshCatLists();
      }
    });
  });
}

function _showCukcukResult(message, isSuccess) {
  const el = document.getElementById('cukcukResult');
  if (!el) return;
  el.style.display = 'block';
  el.style.background = isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
  el.style.border = '1px solid ' + (isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)');
  el.style.color = isSuccess ? '#34d399' : '#f87171';
  el.textContent = message;
}

// ── MAIN RENDER ──
export function render() {
  return `
    <div class="section-header">
      <div>
        <h3>⚙️ Cài đặt hệ thống</h3>
        <p>Quản lý cấu hình, nhân viên, nhật ký và biểu mẫu in</p>
      </div>
    </div>

    ${_renderTabs()}

    <div id="settingsTabContent">
      ${_activeTab === 'system' ? _renderSystemTab() : ''}
    </div>
  `;
}

// ── Inventory tab ──
function _renderInventoryTab() {
  const store = getPrintForms();
  const invData = store.inventory || {};
  return `
    <div class="card" style="margin-bottom:20px;border:1px solid rgba(16,185,129,.3);">
      <div class="card-header" style="background:rgba(16,185,129,.08);color:#10b981;display:flex;justify-content:space-between;align-items:center;">
        <h3>📦 Dữ liệu Kho & Nhà Cung Cấp</h3>
        <button class="btn btn-primary btn-sm" id="btnSaveInventory">💾 Lưu thay đổi</button>
      </div>
      <div class="card-body">
        <p class="text-muted" style="font-size:12px;margin-bottom:16px;">
          Định dạng JSON. Dùng để thay đổi danh sách kiểm kê hiển thị trong mẫu in.
        </p>
        <textarea id="txtInventoryJson" style="width:100%;height:400px;font-family:monospace;font-size:12px;padding:12px;border:1px solid #ddd;border-radius:4px;resize:vertical;" spellcheck="false">${JSON.stringify(invData, null, 2)}</textarea>
      </div>
    </div>
  `;
}

function _initInventoryTab() {
  document.getElementById('btnSaveInventory')?.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(document.getElementById('txtInventoryJson').value);
      import('../store.js').then(store => {
        const pf = store.getPrintForms();
        pf.inventory = parsed;
        store.updatePrintForms(pf);
        showToast('Đã lưu dữ liệu Kho & NCC', 'success');
      });
    } catch (e) {
      showToast('Lỗi định dạng JSON!', 'error');
    }
  });
}

// ── SWITCH TAB ──
function _switchTab(tabKey) {
  // Destroy previous sub-module if needed
  _destroySubModule();

  _activeTab = tabKey;

  // Update tab buttons
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stab === tabKey);
  });

  // Render tab content
  const container = document.getElementById('settingsTabContent');
  if (!container) return;

  if (tabKey === 'system') {
    container.innerHTML = _renderSystemTab();
    _initSystemTab();
  } else if (tabKey === 'printer') {
    container.innerHTML = _renderPrinterTab();
    _initPrinterTab();
  } else if (tabKey === 'inventory') {
    container.innerHTML = _renderInventoryTab();
    _initInventoryTab();
  } else if (tabKey === 'staff') {
    container.innerHTML = staffModule.render();
    staffModule.init();
  } else if (tabKey === 'audit') {
    container.innerHTML = auditModule.render();
    auditModule.init();
  } else if (tabKey === 'print') {
    container.innerHTML = printModule.render();
    printModule.init();
  }
}

function _destroySubModule() {
  if (_activeTab === 'staff' && staffModule.destroy) {
    try { staffModule.destroy(); } catch(e) { /* ignore */ }
  }
}

// ── INIT SYSTEM TAB (extracted for reuse) ──
function _initSystemTab() {
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

  // Save settings
  const performSave = (silent) => {
    if (silent === undefined) silent = false;
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
        key: document.getElementById('cuk_key').value,
        autoSync: document.getElementById('cuk_autoSync').checked
      }
    };
    const parseKeys = (id) => { const v = document.getElementById(id).value; return !v ? [] : v.split('\\n').map(k=>k.trim()).filter(k=>k.length>5); };
    
    if (document.getElementById('vat-key-gemini')) {
      newSettings.vatKeys = {
        gemini: parseKeys('vat-key-gemini'),
        groq: parseKeys('vat-key-groq'),
        hf: parseKeys('vat-key-hf'),
        cerebras: parseKeys('vat-key-cerebras'),
        sambanova: parseKeys('vat-key-sambanova'),
        deepseek: parseKeys('vat-key-deepseek'),
        mistral: parseKeys('vat-key-mistral'),
        nvidia: parseKeys('vat-key-nvidia')
      };
    }
    
    updateSettings(newSettings);
    
    if (newSettings.vatKeys) {
        const VAT_API = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec";
        const payload = Object.assign({ action: 'save_system_keys' }, newSettings.vatKeys);
        fetch(VAT_API, {method:'POST',body:JSON.stringify(payload)}).catch(()=>{});
    }
    
    saveSettingsToCloud(getSettings()).catch(function() {});
    if (!silent) showToast('Đã lưu tất cả cài đặt', 'success');
  };

  document.getElementById('btnSaveSettings')?.addEventListener('click', () => performSave(false));

  // CUKCUK Actions
  document.getElementById('btnTestCukCuk')?.addEventListener('click', async () => {
    performSave(true);
    const btn = document.getElementById('btnTestCukCuk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang kiểm tra...';
    }
    
    showToast('Đang kiểm tra kết nối CUKCUK...', 'info');
    
    try {
      const { testConnection } = await import('../integration/cukcuk.js');
      const result = await testConnection();
      if (result.success) {
        showToast('✅ Kết nối CUKCUK thành công!', 'success');
        _showCukcukResult('✅ Kết nối thành công! Token đã được lưu cache.\nBạn có thể bấm "Đồng bộ hóa đơn ngay" để lấy dữ liệu.', true);
      } else {
        showToast('❌ ' + result.message, 'error');
        _showCukcukResult('❌ ' + result.message, false);
      }
    } catch(e) {
      showToast('❌ Lỗi: ' + e.message, 'error');
      _showCukcukResult('❌ Lỗi: ' + e.message, false);
    }
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">wifi_find</span> Kiểm tra kết nối';
    }
  });

  document.getElementById('btnSyncCukCuk')?.addEventListener('click', async () => {
    performSave(true);
    const btn = document.getElementById('btnSyncCukCuk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Đang đồng bộ...';
    }
    
    try {
      const { syncTransactions } = await import('../integration/cukcuk.js');
      const result = await syncTransactions(true);
      if (result && result.success) {
        var msg = '✅ Đồng bộ hoàn tất!\n';
        msg += '📊 Tổng hóa đơn: ' + result.total + '\n';
        msg += '✨ Mới thêm: ' + result.synced + ' (' + (result.amount || 0).toLocaleString('vi-VN') + 'đ)\n';
        if (result.payments) {
          var p = result.payments;
          if (p.cash > 0) msg += '💵 Tiền mặt: ' + p.cash.toLocaleString('vi-VN') + 'đ\n';
          if (p.card > 0) msg += '💳 Quẹt thẻ: ' + p.card.toLocaleString('vi-VN') + 'đ\n';
          if (p.transfer > 0) msg += '🏦 Chuyển khoản: ' + p.transfer.toLocaleString('vi-VN') + 'đ\n';
        }
        if (result.skipped > 0) msg += '⏭ Đã có từ trước: ' + result.skipped;
        _showCukcukResult(msg, true);
      } else if (result) {
        _showCukcukResult('❌ ' + (result.message || 'Lỗi không xác định'), false);
      }
    } catch(e) {
      _showCukcukResult('❌ Lỗi: ' + e.message, false);
    }
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ hóa đơn ngay';
    }
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

  document.getElementById('btnClearLocal')?.addEventListener('click', async () => {
    var ok = await showConfirm('Xóa TOÀN BỘ dữ liệu cục bộ? Hành động này không thể hoàn tác.', {
      title: 'Xóa dữ liệu',
      confirmText: 'Xóa tất cả',
      type: 'danger'
    });
    if (ok) {
      localStorage.clear();
      showToast('Đã xóa toàn bộ dữ liệu cục bộ', 'success');
      setTimeout(() => location.reload(), 1000);
    }
  });

  // VAT Admin Login
  document.getElementById('sett-vat-btn-admin-login')?.addEventListener('click', () => {
      const pass = document.getElementById('sett-vat-admin-password').value;
      if (!pass) return showToast('Vui lòng nhập mã truy cập!', 'warning');
      
      const btn = document.getElementById('sett-vat-btn-admin-login');
      const oldText = btn.innerText;
      btn.innerText = 'Đang tải...';
      const VAT_API = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec";
      
      fetch(VAT_API, {method:'POST',body:JSON.stringify({ action: 'get_system_keys', password: pass })})
        .then(r=>r.json()).then(res => {
          btn.innerText = oldText;
          if (res.status === 'success') {
              if(res.gemini) document.getElementById('vat-key-gemini').value = res.gemini.join('\\n');
              if(res.groq) document.getElementById('vat-key-groq').value = res.groq.join('\\n');
              if(res.hf) document.getElementById('vat-key-hf').value = res.hf.join('\\n');
              if(res.cerebras) document.getElementById('vat-key-cerebras').value = res.cerebras.join('\\n');
              if(res.sambanova) document.getElementById('vat-key-sambanova').value = res.sambanova.join('\\n');
              if(res.deepseek) document.getElementById('vat-key-deepseek').value = res.deepseek.join('\\n');
              if(res.mistral) document.getElementById('vat-key-mistral').value = res.mistral.join('\\n');
              if(res.nvidia) document.getElementById('vat-key-nvidia').value = res.nvidia.join('\\n');
              showToast('Đã mượn được hàng nóng từ kho Admin!', 'success');
              performSave(true);
          } else showToast(res.message || 'Mã không đúng!', 'error');
        }).catch(e => {
            btn.innerText = oldText;
            showToast('Lỗi mạng', 'error');
        });
  });
}

// ── MAIN INIT ──
export function init() {
  // Bind tab clicks
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _switchTab(btn.dataset.stab);
    });
  });

  // Init the active tab
  if (_activeTab === 'system') {
    _initSystemTab();
  } else {
    _switchTab(_activeTab);
  }
}

// ── DESTROY ──
export function destroy() {
  _destroySubModule();
}
