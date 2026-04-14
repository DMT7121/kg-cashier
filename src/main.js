/* ============================================
   KG-CASHIER — Main Application Entry Point
   COMPATIBLE: No optional chaining, global error handling
   ============================================ */
import './style.css';
import { getCurrentShift, subscribe, getUnreadCount, syncCurrentShiftWithCloud } from './store.js';
import { hideModal } from './utils.js';

// ── Global Error Handler — Show on screen ────
window.onerror = function(msg, src, line, col, err) {
  console.error('[KG-CASHIER ERROR]', msg, src, line);
  var errDiv = document.getElementById('globalError');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = 'globalError';
    errDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#dc2626;color:white;padding:10px 16px;font-size:13px;font-family:monospace;cursor:pointer;';
    errDiv.onclick = function() { errDiv.style.display = 'none'; };
    document.body.appendChild(errDiv);
  }
  errDiv.textContent = '[ERROR] ' + msg + ' (line ' + line + ')';
  errDiv.style.display = 'block';
};

window.addEventListener('unhandledrejection', function(event) {
  console.error('[KG-CASHIER PROMISE ERROR]', event.reason);
});

// ── Import Views ─────────────────────────────
import * as dashboardView from './views/dashboard.js';
import * as shiftView from './views/shift.js';
import * as transactionsView from './views/transactions.js';
import * as cashCountView from './views/cashCount.js';
import * as invoicesView from './views/invoices.js';
import * as reportView from './views/report.js';
import * as historyView from './views/history.js';
import * as analyticsView from './views/analytics.js';
import * as staffView from './views/staff.js';
import * as auditLogView from './views/auditLog.js';
import * as settingsView from './views/settings.js';
import * as printFormsView from './views/printForms.js';

// ── View Registry ────────────────────────────
var views = {
  'dashboard':    { module: dashboardView,    title: 'Tổng quan' },
  'shift':        { module: shiftView,        title: 'Quản lý ca' },
  'transactions': { module: transactionsView, title: 'Giao dịch' },
  'cash-count':   { module: cashCountView,    title: 'Kiểm kê tiền' },
  'invoices':     { module: invoicesView,     title: 'Hóa đơn / Chứng từ' },
  'report':       { module: reportView,       title: 'Báo cáo bàn giao' },
  'analytics':    { module: analyticsView,    title: 'Phân tích' },
  'history':      { module: historyView,      title: 'Lịch sử ca' },
  'staff':        { module: staffView,        title: 'Nhân viên' },
  'audit':        { module: auditLogView,     title: 'Nhật ký' },
  'settings':     { module: settingsView,     title: 'Cài đặt' },
  'print-forms':  { module: printFormsView,   title: 'Biểu mẫu in' },
};

var currentView = 'dashboard';

// ── Navigation ───────────────────────────────
function navigateTo(viewName) {
  // Sync with cloud to ensure state is fresh
  syncCurrentShiftWithCloud().then(function(changed) {
    if (changed) {
      console.log('[Main] Shift state synchronized from cloud');
      // Re-run navigation logic if shift presence changed
      navigateTo(currentView);
    }
  });

  // ── Shift Protection Logic ──
  var shift = getCurrentShift();
  var isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  // If shift is open but not validated, force 'shift' view (Unlock screen)
  if (shift && !isValidated && viewName !== 'shift' && viewName !== 'settings') {
    viewName = 'shift';
  }

  if (!views[viewName]) viewName = 'dashboard';
  currentView = viewName;

  var navItems = document.querySelectorAll('.nav-item');
  for (var i = 0; i < navItems.length; i++) {
    var el = navItems[i];
    if (el.dataset.view === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  var titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = views[viewName].title;

  renderCurrentView();
  var sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  location.hash = viewName;
}

function renderCurrentView() {
  var container = document.getElementById('viewContainer');
  if (!container) return;
  var view = views[currentView];
  if (!view) return;

  try {
    container.innerHTML = view.module.render();
    container.style.animation = 'none';
    container.offsetHeight; // trigger reflow
    container.style.animation = 'fadeIn .3s ease';
    view.module.init();
    updateGlobalUI();
  } catch (e) {
    console.error('[Render Error]', currentView, e);
    container.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded empty-icon">error</span><h2>Lỗi hiển thị</h2><p>' + e.message + '</p><button class="btn btn-primary" onclick="window.navigateTo(\'dashboard\')">Về trang chủ</button></div>';
  }
}

// ── Global UI Updates ────────────────────────
function updateGlobalUI() {
  try {
    var shift = getCurrentShift();

    // Shift indicator
    var indicator = document.getElementById('shiftIndicator');
    if (indicator) {
      var nameSpan = indicator.querySelector('span:last-child');
      if (shift) {
        indicator.classList.add('active');
        if (nameSpan) nameSpan.textContent = 'Ca ' + shift.shiftNumber + ' đang mở';
      } else {
        indicator.classList.remove('active');
        if (nameSpan) nameSpan.textContent = 'Chưa mở ca';
      }
    }

    // Cashier badge
    var cashierEl = document.getElementById('topbarCashierName');
    if (cashierEl) cashierEl.textContent = shift ? shift.cashierName : '—';

    // Notification badge
    var unread = getUnreadCount();
    var badge = document.getElementById('notifCount');
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }
  } catch (e) {
    console.error('[UI Update Error]', e);
  }
}

// ── Clock ────────────────────────────────────
function updateClock() {
  var clockEl = document.getElementById('clock');
  if (clockEl) {
    var now = new Date();
    var date = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    var time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    clockEl.textContent = date + ' — ' + time;
  }
}

// ── Initialize ───────────────────────────────
function initApp() {
  console.log('[KG-CASHIER] Initializing...');

  updateClock();
  setInterval(updateClock, 1000);

  // Nav clicks
  var navItems = document.querySelectorAll('.nav-item[data-view]');
  for (var i = 0; i < navItems.length; i++) {
    (function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo(el.dataset.view);
      });
    })(navItems[i]);
  }

  // Sidebar toggle
  var sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
  }

  // Notification badge click
  var notifBadge = document.getElementById('notifBadge');
  if (notifBadge) {
    notifBadge.addEventListener('click', function() { navigateTo('dashboard'); });
  }

  // Modal close
  var modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === e.currentTarget) hideModal();
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideModal();
  });

  // Globals
  window.navigateTo = navigateTo;
  window.refreshView = renderCurrentView;
  window.hideModal = hideModal;

  // Subscribe
  subscribe(function() { updateGlobalUI(); });

  // Route
  var hash = location.hash.replace('#', '');
  navigateTo(hash && views[hash] ? hash : 'dashboard');

  // Background polling for cloud sync (Feature: Multi-device real-time sync)
  setInterval(function() {
    syncCurrentShiftWithCloud().then(function(changed) {
      if (changed) {
        console.log('[Main] Auto-sync: Data refreshed from cloud');
        renderCurrentView();
      }
    });
  }, 10000); // Check every 10 seconds

  console.log('[KG-CASHIER] Ready!');
}

// ── Start ────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
