/* ============================================
   KG-CASHIER — Main Application Entry Point
   COMPATIBLE: No optional chaining, global error handling
   ============================================ */
import './style.css';
import { getCurrentShift, subscribe, getUnreadCount, syncCurrentShiftWithCloud, isShiftDirty, clearShiftDirty, syncShiftHistory, pullCategoriesFromCloud } from './store.js';
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
import * as revenueView from './views/revenue.js';
import * as historyView from './views/history.js';
import * as settingsView from './views/settings.js';
import * as drinkInventoryView from './views/drinkInventory.js';
import * as vatView from './views/vat.js';

// ── View Registry ────────────────────────────
var views = {
  'dashboard':    { module: dashboardView,    title: 'Tổng quan' },
  'shift':        { module: shiftView,        title: 'Quản lý ca' },
  'transactions': { module: transactionsView, title: 'Giao dịch' },
  'cash-count':   { module: cashCountView,    title: 'Kiểm kê tiền' },
  'revenue':      { module: revenueView,      title: 'Doanh thu & Phân tích' },
  'history':      { module: historyView,      title: 'Lịch sử ca' },
  'settings':     { module: settingsView,     title: 'Cài đặt' },
  'drink-inventory': { module: drinkInventoryView, title: 'Kiểm kho đồ uống' },
  'vat':          { module: vatView,          title: 'Hóa đơn VAT' },
};

var currentView = 'dashboard';
var _globalIntervals = [];

// ── Navigation ───────────────────────────────
function navigateTo(viewName) {
  // Destroy previous view if it has a cleanup function
  var prevView = views[currentView];
  if (prevView && prevView.module.destroy) {
    try { prevView.module.destroy(); } catch(e) { /* ignore */ }
  }

  // ── Redirect legacy hashes to consolidated views ──
  if (viewName === 'staff' || viewName === 'audit' || viewName === 'print-forms') {
    viewName = 'settings';
  }
  if (viewName === 'invoices') {
    viewName = 'transactions';
  }
  if (viewName === 'report' || viewName === 'analytics' || viewName === 'cukcuk') {
    viewName = 'revenue';
  }

  // Sync with cloud to ensure state is fresh (fire-and-forget, no re-navigation)
  syncCurrentShiftWithCloud().then(function(changed) {
    if (changed) {
      console.log('[Main] Shift state synchronized from cloud');
      // Only re-render the current view, do NOT re-call navigateTo to avoid infinite loop
      renderCurrentView();
    }
  });

  // ── Shift Protection Logic ──
  var shift = getCurrentShift();
  var isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

  // If shift is open but not validated, force 'shift' view (Unlock screen)
  if (shift && !isValidated && viewName !== 'shift' && viewName !== 'settings' && viewName !== 'vat') {
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
    // Keyboard shortcuts for cashier efficiency
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); navigateTo('transactions'); break;
        case 's': e.preventDefault(); syncCurrentShiftWithCloud(); break;
        case 'p': e.preventDefault(); navigateTo('report'); break;
      }
    }
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

  // ── MIGRATION: Move CUKCUK data from shift.transactions to Invoice Store ──
  try {
    var migrationDone = localStorage.getItem('cukcuk_migration_v2');
    if (!migrationDone) {
      import('./integration/invoiceStore.js').then(function(store) {
        var shift = getCurrentShift();
        var state = JSON.parse(localStorage.getItem('kg-cashier-data') || '{}');
        var history = state.shiftHistory || [];
        var migrated = store.migrateFromShifts(shift, history);
        
        if (migrated > 0) {
          console.log('[Migration] ✅ Migrated ' + migrated + ' CUKCUK invoices to Invoice Store');
          // Clean CUKCUK transactions from current shift
          if (shift) {
            var cleaned = store.removeCukcukFromTransactions(shift.transactions);
            shift.transactions = cleaned;
            state.currentShift = shift;
          }
          // Clean from history too
          for (var h = 0; h < history.length; h++) {
            history[h].transactions = store.removeCukcukFromTransactions(history[h].transactions);
          }
          state.shiftHistory = history;
          localStorage.setItem('kg-cashier-data', JSON.stringify(state));
          console.log('[Migration] ✅ Cleaned CUKCUK data from shift transactions');
        }
        localStorage.setItem('cukcuk_migration_v2', 'done');
      }).catch(function(e) {
        console.warn('[Migration] Error:', e);
      });
    }
  } catch(e) {
    console.warn('[Migration] Error:', e);
  }

  // ── Cross-device sync on startup ──
  // 1) Pull current shift from cloud (enables: open on localhost → see on production)
  // 2) Merge shift history from cloud into local
  syncCurrentShiftWithCloud().then(function(changed) {
    if (changed) {
      console.log('[Main] Startup: Applied cloud shift state');
      renderCurrentView();
    }
  });
  syncShiftHistory().then(function(changed) {
    if (changed) {
      console.log('[Main] Startup: Merged cloud shift history');
      if (window.location.hash === '#history') renderCurrentView();
    }
  });

  // 3) Pull categories from cloud (cross-device sync)
  pullCategoriesFromCloud().catch(function() {});

  // 4) Pull CUKCUK invoices from cloud (cross-device sync)
  try {
    var shift = getCurrentShift();
    if (shift) {
      var shiftDate = shift.date || new Date().toISOString().slice(0, 10);
      import('./integration/invoiceStore.js').then(function(store) {
        store.pullInvoicesFromCloud(shiftDate).then(function(added) {
          if (added > 0) {
            console.log('[Main] Startup: Pulled ' + added + ' invoices from cloud');
            renderCurrentView();
          }
        });
      });
    }
  } catch(e3) { console.warn('[Main] Invoice cloud pull error:', e3); }

  // Background polling for cloud sync
  // Only pull from cloud when local data is clean (not dirty).
  // Dirty changes push immediately via store.js _syncCurrentShift debounce.
  _globalIntervals.push(setInterval(function() {
    // Skip pull if we have local changes pending push
    var isDirty = false;
    try { isDirty = isShiftDirty(); } catch(e2) {}
    if (isDirty) return;
    syncCurrentShiftWithCloud().then(function(changed) {
      if (changed) {
        console.log('[Main] Auto-sync: Data refreshed from cloud');
        clearShiftDirty();
        renderCurrentView();
      }
    });
  }, 60000));

  // CUKCUK auto-sync: only fetch NEW bills to avoid rate limiting
  // Loads invoices for TODAY's date only, auto-detects payment methods
  // Immediate sync on page load, then every 5 minutes
  var _cukcukSyncInFlight = false;
  function _triggerCukcukSync(isInitial) {
    try {
      if (_cukcukSyncInFlight) return; // Prevent overlapping syncs
      var shift = getCurrentShift();
      if (!shift) return;
      var settings = JSON.parse(localStorage.getItem('kg-cashier-data') || '{}');
      var cukcuk = settings.settings && settings.settings.cukcuk;
      if (!cukcuk || !cukcuk.key) return;
      
      _cukcukSyncInFlight = true;
      import('./integration/cukcuk.js').then(function(mod) {
        mod.syncTransactions().then(function(result) {
          _cukcukSyncInFlight = false;
          if (result && result.success) {
            if (result.synced > 0) {
              console.log('[Main] CUKCUK auto-sync: Added ' + result.synced + ' invoices');
              renderCurrentView();
            }
          }
        }).catch(function() { _cukcukSyncInFlight = false; });
      }).catch(function() { _cukcukSyncInFlight = false; });
    } catch(e) {
      _cukcukSyncInFlight = false;
      console.warn('[Main] CUKCUK auto-sync error:', e);
    }
  }

  // Immediate sync on load (with 3s delay to let UI settle)
  setTimeout(function() { _triggerCukcukSync(true); }, 3000);

  // Then every 5 minutes — smart sync skips API call entirely when no new data expected
  _globalIntervals.push(setInterval(function() { _triggerCukcukSync(false); }, 300000));

  // Cleanup intervals on page unload
  window.addEventListener('beforeunload', function() {
    for (var gi = 0; gi < _globalIntervals.length; gi++) {
      clearInterval(_globalIntervals[gi]);
    }
    // Destroy current view
    var cv = views[currentView];
    if (cv && cv.module.destroy) {
      try { cv.module.destroy(); } catch(e) { /* ignore */ }
    }
  });

  console.log('[KG-CASHIER] Ready!');
}

// ── Start ────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
