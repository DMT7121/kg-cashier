<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAppStore } from './stores/app';
import { useShiftStore } from './stores/shift';
import { useSettingsStore } from './stores/settings';
import { useNotificationsStore } from './stores/notifications';
import { useAuthStore } from './stores/auth';

// Import View Components
import Dashboard from './views/Dashboard.vue';
import ShiftManager from './views/ShiftManager.vue';
import Transactions from './views/Transactions.vue';
import CashCount from './views/CashCount.vue';
import DrinkInventory from './views/DrinkInventory.vue';
import POS from './views/POS.vue';
import BarDashboard from './views/BarDashboard.vue';
import RevenueReport from './views/RevenueReport.vue';
import ShiftHistory from './views/ShiftHistory.vue';
import VATInvoice from './views/VATInvoice.vue';
import Extensions from './views/Extensions.vue';
import UserGuide from './views/UserGuide.vue';
import SettingsHub from './views/SettingsHub.vue';
import ChatbotAssistant from './components/ChatbotAssistant.vue';

// Pinia Stores
const appStore = useAppStore();
const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();
const notificationsStore = useNotificationsStore();
const authStore = useAuthStore();

// View Mapping Registry
const viewMap: Record<string, any> = {
  dashboard: Dashboard,
  shift: ShiftManager,
  transactions: Transactions,
  'cash-count': CashCount,
  'drink-inventory': DrinkInventory,
  pos: POS,
  bar: BarDashboard,
  revenue: RevenueReport,
  history: ShiftHistory,
  vat: VATInvoice,
  extension: Extensions,
  guide: UserGuide,
  settings: SettingsHub,
};

// Computed active view component
const activeComponent = computed(() => {
  return viewMap[appStore.currentView] || Dashboard;
});

// Computed page title corresponding to view
const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    dashboard: 'Tổng quan',
    shift: 'Quản lý ca',
    transactions: 'Giao dịch',
    'cash-count': 'Kiểm kê tiền',
    'drink-inventory': 'Kiểm kho đồ uống',
    pos: 'POS — Order',
    bar: 'Dashboard Bếp/Bar',
    revenue: 'Doanh thu & Phân tích',
    history: 'Lịch sử ca',
    vat: 'Hóa đơn VAT',
    extension: 'Tiện ích & Mở rộng',
    guide: 'Hướng dẫn sử dụng',
    settings: 'Cài đặt hệ thống',
  };
  return titles[appStore.currentView] || 'Thu ngân';
});

// UI states
const isMobileSidebarOpen = ref(false);
const isNotifDropdownOpen = ref(false);
const isQrCollapsed = ref(localStorage.getItem('kg_sidebar_qr_collapsed') === 'true');
const timeStr = ref('');
let clockTimer: any = null;

// Clock updates
function updateClock() {
  const now = new Date();
  const date = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('vi-VN');
  timeStr.value = `${date} - ${time}`;
}

// Collapsible sidebar VietQR widget helper
function toggleQrWidget() {
  isQrCollapsed.value = !isQrCollapsed.value;
  localStorage.setItem('kg_sidebar_qr_collapsed', String(isQrCollapsed.value));
}

// Dynamic VietQR generator logic
const activeQrConfig = computed(() => {
  const s = settingsStore.settings;
  const lastSelected = s.extension?.lastSelectedQr;
  const firstTpl = s.extension?.qrTemplates?.[0];
  return lastSelected || firstTpl || null;
});

const qrUrl = computed(() => {
  const cfg = activeQrConfig.value;
  if (cfg && cfg.bank && cfg.acc) {
    const amount = Number(cfg.amount) || 0;
    const content = cfg.content || 'Thanh toan';
    const name = cfg.name || '';
    return `https://img.vietqr.io/image/${cfg.bank}-${cfg.acc}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(name)}`;
  }
  return '';
});

// Format currency display on QR
function formatCurrency(val: number) {
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Mobile sidebar helper
function toggleSidebar() {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
}

function handleNav(view: string) {
  appStore.navigateTo(view);
  isMobileSidebarOpen.value = false;
}

// Initialize on mount
onMounted(async () => {
  await appStore.initializeApp();
  updateClock();
  clockTimer = setInterval(updateClock, 1000);

  // Parse initial route/hash
  const hash = window.location.hash.replace('#', '');
  if (hash && viewMap[hash]) {
    appStore.navigateTo(hash);
  } else {
    appStore.navigateTo('dashboard');
  }

  // Monitor hash change
  window.addEventListener('hashchange', () => {
    const nextHash = window.location.hash.replace('#', '');
    if (nextHash && nextHash !== appStore.currentView && viewMap[nextHash]) {
      appStore.navigateTo(nextHash);
    }
  });
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
  appStore.stopSyncInterval();
});
</script>

<template>
  <div class="app-shell" :class="{ 'mobile-sidebar-open': isMobileSidebarOpen }">
    <!-- Sidebar Panel -->
    <aside class="sidebar" :class="{ 'sidebar-visible': isMobileSidebarOpen }">
      <div class="sidebar-brand">
        <div class="brand-logo-container">
          <img src="/android-chrome-192x192.png" alt="KG" class="brand-logo" />
        </div>
        <div>
          <h1>KING's GRILL</h1>
          <small>Hệ thống thu ngân</small>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-label">TỔNG QUAN</div>
        <a 
          href="#dashboard" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'dashboard' }" 
          @click.prevent="handleNav('dashboard')"
        >
          <span class="material-symbols-rounded">dashboard</span>
          <span>Tổng quan</span>
          <span class="nav-hint">1</span>
        </a>
        <a 
          href="#shift" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'shift' }" 
          @click.prevent="handleNav('shift')"
        >
          <span class="material-symbols-rounded">schedule</span>
          <span>Quản lý ca</span>
          <span class="nav-hint">2</span>
        </a>

        <div class="nav-section-label">NGHIỆP VỤ</div>
        <a 
          href="#transactions" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'transactions' }" 
          @click.prevent="handleNav('transactions')"
        >
          <span class="material-symbols-rounded">receipt_long</span>
          <span>Giao dịch</span>
          <span class="nav-hint">3</span>
        </a>
        <a 
          href="#cash-count" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'cash-count' }" 
          @click.prevent="handleNav('cash-count')"
        >
          <span class="material-symbols-rounded">calculate</span>
          <span>Kiểm kê tiền</span>
          <span class="nav-hint">4</span>
        </a>
        <a 
          href="#drink-inventory" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'drink-inventory' }" 
          @click.prevent="handleNav('drink-inventory')"
        >
          <span class="material-symbols-rounded">local_bar</span>
          <span>Kiểm kho đồ uống</span>
          <span class="nav-hint">5</span>
        </a>
        <a 
          href="#pos" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'pos' }" 
          @click.prevent="handleNav('pos')"
        >
          <span class="material-symbols-rounded">point_of_sale</span>
          <span>POS — Order</span>
        </a>
        <a 
          href="#bar" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'bar' }" 
          @click.prevent="handleNav('bar')"
        >
          <span class="material-symbols-rounded">monitor_heart</span>
          <span>Dashboard Bếp/Bar</span>
        </a>

        <div class="nav-section-label">BÁO CÁO & THUẾ</div>
        <a 
          href="#revenue" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'revenue' }" 
          @click.prevent="handleNav('revenue')"
        >
          <span class="material-symbols-rounded">bar_chart</span>
          <span>Doanh thu & Phân tích</span>
          <span class="nav-hint">6</span>
        </a>
        <a 
          href="#history" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'history' }" 
          @click.prevent="handleNav('history')"
        >
          <span class="material-symbols-rounded">history</span>
          <span>Lịch sử ca</span>
          <span class="nav-hint">7</span>
        </a>
        <a 
          href="#vat" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'vat' }" 
          @click.prevent="handleNav('vat')"
        >
          <span class="material-symbols-rounded">receipt</span>
          <span>Hóa đơn VAT</span>
          <span class="nav-hint">8</span>
        </a>

        <div class="nav-section-label">HỆ THỐNG</div>
        <a 
          href="#extension" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'extension' }" 
          @click.prevent="handleNav('extension')"
        >
          <span class="material-symbols-rounded">extension</span>
          <span>Tiện ích & Mở rộng</span>
        </a>
        <a 
          href="#guide" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'guide' }" 
          @click.prevent="handleNav('guide')"
        >
          <span class="material-symbols-rounded">menu_book</span>
          <span>Hướng dẫn sử dụng</span>
        </a>
        <a 
          href="#settings" 
          class="nav-item" 
          :class="{ active: appStore.currentView === 'settings' }" 
          @click.prevent="handleNav('settings')"
        >
          <span class="material-symbols-rounded">settings</span>
          <span>Cài đặt</span>
          <span class="nav-hint">9</span>
        </a>
      </nav>

      <div class="sidebar-footer flex flex-col gap-2">
        <div 
          class="shift-indicator" 
          :class="{ active: shiftStore.currentShift }"
        >
          <span class="shift-dot"></span>
          <span>{{ shiftStore.currentShift ? `Ca ${shiftStore.currentShift.shiftNumber} đang mở` : 'Chưa mở ca' }}</span>
        </div>

        <!-- Quick VietQR Sidebar Widget -->
        <div v-if="activeQrConfig" class="w-full border-t border-slate-100 pt-2 mt-1">
          <div 
            class="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-emerald-50/70 border border-emerald-100/50 hover:bg-emerald-50 transition-all"
            @click="toggleQrWidget"
          >
            <span class="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5 tracking-wider uppercase">
              <span class="material-symbols-rounded text-base text-emerald-600">qr_code_2</span>
              VIETQR NHANH
            </span>
            <span class="material-symbols-rounded text-sm text-emerald-700 transition-transform duration-200" :style="{ transform: isQrCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }">
              expand_less
            </span>
          </div>

          <div 
            v-show="!isQrCollapsed" 
            class="mt-2 text-center overflow-hidden flex flex-col items-center gap-1.5 p-2 bg-white rounded-xl border border-slate-100 shadow-sm transition-all duration-300"
          >
            <div class="bg-white p-1 rounded-xl shadow-xs border border-slate-100">
              <img :src="qrUrl" alt="VietQR" class="w-28 h-28 object-cover rounded-lg" />
            </div>
            <div class="text-[11px] font-bold text-slate-800 uppercase tracking-tight">{{ activeQrConfig.bank }} - {{ activeQrConfig.acc }}</div>
            <div class="text-[10px] text-slate-500 font-semibold uppercase max-w-[170px] truncate">{{ activeQrConfig.name }}</div>
            <div v-if="Number(activeQrConfig.amount) > 0" class="text-[10px] font-bold text-emerald-700 bg-emerald-50/70 px-2 py-0.5 rounded-full border border-emerald-100/40">
              {{ formatCurrency(Number(activeQrConfig.amount)) }} đ
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
      <header class="topbar">
        <button class="sidebar-toggle !inline-flex md:!hidden bg-transparent border-0 text-slate-700 cursor-pointer p-2 hover:bg-slate-100 rounded-xl" @click="toggleSidebar">
          <span class="material-symbols-rounded">menu</span>
        </button>
        
        <h2 class="page-title">{{ pageTitle }}</h2>
        
        <div class="topbar-right">
          <span class="clock">{{ timeStr }}</span>
          
          <!-- Notifications dropdown -->
          <div class="relative">
            <div 
              class="topbar-badge p-2 bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200 rounded-xl transition-all flex items-center justify-center cursor-pointer"
              title="Thông báo"
              @click="isNotifDropdownOpen = !isNotifDropdownOpen"
            >
              <span class="material-symbols-rounded text-slate-600 text-xl">notifications</span>
              <span 
                v-if="notificationsStore.unreadCount > 0" 
                class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white animate-bounce"
              >
                {{ notificationsStore.unreadCount }}
              </span>
            </div>
            
            <!-- Notifications Overlay List -->
            <div 
              v-if="isNotifDropdownOpen" 
              class="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 overflow-hidden"
            >
              <div class="flex items-center justify-between p-4 border-b border-slate-50 bg-slate-50/50">
                <span class="font-bold text-slate-900 text-sm">Thông báo</span>
                <div class="flex gap-2">
                  <button 
                    v-if="notificationsStore.unreadCount > 0"
                    class="text-[11px] font-bold text-blue-600 hover:underline bg-transparent border-0 cursor-pointer"
                    @click="notificationsStore.markAllRead"
                  >
                    Đọc tất cả
                  </button>
                  <button 
                    class="text-[11px] font-bold text-rose-600 hover:underline bg-transparent border-0 cursor-pointer"
                    @click="notificationsStore.clearNotifications"
                  >
                    Xóa hết
                  </button>
                </div>
              </div>
              
              <div class="max-h-72 overflow-y-auto divide-y divide-slate-50">
                <div 
                  v-for="notif in notificationsStore.notifications" 
                  :key="notif.id"
                  class="p-3.5 flex gap-3 hover:bg-slate-50/50 transition-colors"
                  :class="{ 'bg-blue-50/20': !notif.read }"
                  @click="notif.read = true"
                >
                  <span 
                    class="material-symbols-rounded text-lg mt-0.5"
                    :class="{
                      'text-blue-500': notif.type === 'info',
                      'text-emerald-500': notif.type === 'success',
                      'text-amber-500': notif.type === 'warning',
                      'text-rose-500': notif.type === 'error'
                    }"
                  >
                    {{ 
                      notif.type === 'info' ? 'info' : 
                      notif.type === 'success' ? 'check_circle' : 
                      notif.type === 'warning' ? 'warning' : 'error' 
                    }}
                  </span>
                  <div class="flex-1">
                    <p class="text-xs text-slate-700 font-medium leading-relaxed">{{ notif.message }}</p>
                    <span class="text-[9px] text-slate-400 font-medium mt-1 block">
                      {{ new Date(notif.timestamp).toLocaleTimeString() }}
                    </span>
                  </div>
                </div>
                
                <div v-if="notificationsStore.notifications.length === 0" class="p-6 text-center text-slate-400 text-xs font-medium">
                  Không có thông báo nào.
                </div>
              </div>
            </div>
          </div>
          
          <div class="topbar-user bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full flex items-center gap-2">
            <span class="material-symbols-rounded text-slate-500 text-lg">person</span>
            <span class="text-sm font-semibold text-slate-700">
              {{ shiftStore.currentShift?.cashierName || authStore.currentUser?.name || '—' }}
            </span>
          </div>
        </div>
      </header>

      <div class="view-container flex-1 overflow-y-auto">
        <keep-alive>
          <component :is="activeComponent" />
        </keep-alive>
      </div>
    </main>

    <!-- Mobile Drawer Overlay -->
    <div 
      v-if="isMobileSidebarOpen" 
      class="fixed inset-0 bg-slate-900/40 z-30 md:hidden transition-opacity" 
      @click="isMobileSidebarOpen = false"
    ></div>

    <!-- AI Chatbot Assistant -->
    <ChatbotAssistant />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.view-container {
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: -260px;
    top: 0;
    bottom: 0;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 40;
  }
  .sidebar.sidebar-visible {
    left: 0;
  }
}
</style>
