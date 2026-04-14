/* ============================================
   KG-CASHIER — Main Application Entry Point
   ============================================ */
import './style.css';
import { getCurrentShift, subscribe, getUnreadCount } from './store.js';
import { hideModal } from './utils.js';

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

// ── View Registry ────────────────────────────
const views = {
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
};

let currentView = 'dashboard';

// ── Navigation ───────────────────────────────
function navigateTo(viewName) {
  if (!views[viewName]) viewName = 'dashboard';
  currentView = viewName;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = views[viewName].title;

  renderCurrentView();
  document.getElementById('sidebar')?.classList.remove('open');
  location.hash = viewName;
}

function renderCurrentView() {
  const container = document.getElementById('viewContainer');
  if (!container) return;
  const view = views[currentView];
  if (!view) return;

  container.innerHTML = view.module.render();
  container.style.animation = 'none';
  container.offsetHeight;
  container.style.animation = 'fadeIn .3s ease';
  view.module.init();
  updateGlobalUI();
}

// ── Global UI Updates ────────────────────────
function updateGlobalUI() {
  const shift = getCurrentShift();

  // Shift indicator
  const indicator = document.getElementById('shiftIndicator');
  if (indicator) {
    if (shift) {
      indicator.classList.add('active');
      indicator.querySelector('span:last-child').textContent = `Ca ${shift.shiftNumber} đang mở`;
    } else {
      indicator.classList.remove('active');
      indicator.querySelector('span:last-child').textContent = 'Chưa mở ca';
    }
  }

  // Cashier badge
  const cashierName = document.getElementById('cashierName');
  if (cashierName) cashierName.textContent = shift ? shift.cashierName : '—';

  // Notification badge
  const unread = getUnreadCount();
  const badge = document.getElementById('notifCount');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
}

// ── Clock ────────────────────────────────────
function updateClock() {
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    const now = new Date();
    const date = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    clockEl.textContent = `${date} — ${time}`;
  }
}

// ── Initialize ───────────────────────────────
function initApp() {
  updateClock();
  setInterval(updateClock, 1000);

  // Nav clicks
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.view); });
  });

  // Sidebar toggle
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // Notification badge click
  document.getElementById('notifBadge')?.addEventListener('click', () => navigateTo('dashboard'));

  // Modal close
  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideModal(); });

  // Globals
  window.navigateTo = navigateTo;
  window.refreshView = renderCurrentView;
  window.hideModal = hideModal;

  // Subscribe
  subscribe(() => updateGlobalUI());

  // Route
  const hash = location.hash.replace('#', '');
  navigateTo(hash && views[hash] ? hash : 'dashboard');
}

// ── Start ────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
