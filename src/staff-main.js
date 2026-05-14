/* ============================================
   KG-STAFF — Standalone Staff Order App
   Lightweight entry point — only loads POS module
   No sidebar, no shift management, no reports
   ============================================ */
import './style.css';
import './staff-style.css';
import { hideModal, showToast } from './utils.js';
import * as posView from './views/pos.js';

// ── Global flag: lets pos.js know we're in staff mode ──
window._staffMode = true;

// ── Error handler ──
window.onerror = function(msg, src, line) {
  console.error('[KG-STAFF ERROR]', msg, src, line);
};
window.addEventListener('unhandledrejection', function(event) {
  console.error('[KG-STAFF PROMISE ERROR]', event.reason);
});

// ── Clock ──
function updateClock() {
  var el = document.getElementById('staffClock');
  if (!el) return;
  var now = new Date();
  var date = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  var time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  el.textContent = date + ' — ' + time;
}

// ── Render POS view ──
function renderView() {
  var container = document.getElementById('viewContainer');
  if (!container) return;
  try {
    container.innerHTML = posView.render();
    container.style.animation = 'none';
    container.offsetHeight;
    container.style.animation = 'fadeIn .3s ease';
    posView.init();
  } catch (e) {
    console.error('[Staff Render Error]', e);
    container.innerHTML =
      '<div style="padding:40px;text-align:center;color:#71717a;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:12px;opacity:.4;">error</span>' +
      '<h3 style="color:#e2e2e6;">Lỗi hiển thị</h3>' +
      '<p style="margin-top:8px;">' + e.message + '</p>' +
      '<button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#e8a838;color:#111;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Tải lại</button>' +
      '</div>';
  }
}

// ── Globals required by pos.js ──
window.refreshView = renderView;
window.hideModal = hideModal;
window.navigateTo = function() {}; // no-op — staff has no navigation

// ── Modal close on backdrop click ──
var modalOverlay = document.getElementById('modalOverlay');
if (modalOverlay) {
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === e.currentTarget) hideModal();
  });
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') hideModal();
});

// ── Cross-tab sync: re-render when orders change from cashier tab ──
try {
  var syncChannel = new BroadcastChannel('kg-pos-sync');
  syncChannel.onmessage = function(e) {
    if (e.data && e.data.type === 'orders-updated') {
      console.log('[KG-STAFF] Orders updated from another tab, refreshing...');
      renderView();
    }
  };
} catch(e) { /* BroadcastChannel not supported — fallback to localStorage event */ }

// Fallback: listen for localStorage changes (cross-tab, different contexts)
window.addEventListener('storage', function(e) {
  if (e.key === 'kg-pos-orders') {
    console.log('[KG-STAFF] Orders updated via localStorage, refreshing...');
    renderView();
  }
});

// ── Initialize ──
function initStaffApp() {
  console.log('[KG-STAFF] Initializing standalone staff order app...');

  updateClock();
  setInterval(updateClock, 1000);

  // Render POS immediately
  renderView();

  // Onboarding toast (one-time)
  if (!localStorage.getItem('kg_staff_onboard')) {
    setTimeout(function() {
      showToast('📱 Chọn bàn → Gọi món → Nhấn Báo Bếp/Bar', 'info', 5000);
    }, 1500);
    localStorage.setItem('kg_staff_onboard', '1');
  }

  console.log('[KG-STAFF] Ready!');
}

// ── Start ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStaffApp);
} else {
  initStaffApp();
}
