<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { getTodayRevenue, getRevenueSummary, RevenueSummaryResult, TodayRevenueResult } from '../services/invoiceStore';
import { syncTransactions, getSyncStatus } from '../integration/cukcuk';
import { formatMoney, showToast } from '../utils';

// Stores
const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();

// Navigation emitter
const emit = defineEmits<{
  (e: 'navigate', view: string): void;
}>();

// State
const revenuePeriod = ref<'month' | 'quarter' | 'year'>('month');
const isSyncingCukcuk = ref(false);
const syncStatus = ref<any>(null);

// Period stats state
const periodStats = ref<RevenueSummaryResult | null>(null);
const isLoadingPeriod = ref(false);

// Today's CUKCUK revenue
const todayCukcukRev = ref<TodayRevenueResult>({
  date: '',
  total: 0,
  cash: 0,
  card: 0,
  transfer: 0,
  bills: 0,
  lastSync: ''
});

// Shift calculation
const currentShiftSummary = ref<any>(null);
const activeShiftTime = ref('');
let elapsedTimer: any = null;

// Formatter Helpers
function formatVN(dateStr: string) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function calculateElapsedTime() {
  if (!shiftStore.currentShift || !shiftStore.currentShift.startTime) return;
  const start = new Date(shiftStore.currentShift.startTime).getTime();
  const now = Date.now();
  const diff = now - start;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  activeShiftTime.value = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function loadShiftSummary() {
  if (shiftStore.currentShift) {
    currentShiftSummary.value = await shiftStore.getShiftSummary(shiftStore.currentShift);
  }
}

async function loadPeriodStats() {
  isLoadingPeriod.value = true;
  try {
    periodStats.value = await getRevenueSummary(revenuePeriod.value);
  } catch (e) {
    console.error('[Dashboard] Error loading period stats:', e);
  } finally {
    isLoadingPeriod.value = false;
  }
}

async function loadTodayCukcuk() {
  try {
    todayCukcukRev.value = await getTodayRevenue();
  } catch (e) {
    console.error('[Dashboard] Error loading today CUKCUK data:', e);
  }
}

function refreshSyncStatus() {
  try {
    syncStatus.value = getSyncStatus();
  } catch (e) {}
}

const syncTimeAgo = computed(() => {
  if (!syncStatus.value || !syncStatus.value.lastSyncTime) return '';
  const diff = Math.round((Date.now() - new Date(syncStatus.value.lastSyncTime).getTime()) / 1000);
  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  return `${Math.floor(diff / 3600)}h trước`;
});

// Sync triggers
async function handleSyncCukcuk() {
  isSyncingCukcuk.value = true;
  try {
    const res = await syncTransactions(true);
    if (res && res.success) {
      showToast(`Đã đồng bộ ${res.synced || 0} hóa đơn`, 'success');
      await loadTodayCukcuk();
      await loadShiftSummary();
      await loadPeriodStats();
    }
  } catch (e) {
    showToast('Lỗi đồng bộ CUKCUK', 'error');
  } finally {
    isSyncingCukcuk.value = false;
    refreshSyncStatus();
  }
}

// Payment method progress bar calculation
const maxPaymentMethod = computed(() => {
  if (!currentShiftSummary.value) return 1;
  const sum = currentShiftSummary.value;
  return Math.max(sum.cashIncome, sum.cardIncome, sum.transferIncome, 1);
});

// Watch shift state change
watch(() => shiftStore.currentShift, async (newVal) => {
  if (newVal) {
    await loadShiftSummary();
    calculateElapsedTime();
  } else {
    currentShiftSummary.value = null;
    activeShiftTime.value = '';
  }
}, { immediate: true, deep: true });

// Watch period filter change
watch(revenuePeriod, () => {
  loadPeriodStats();
});

async function handleInvoicesUpdated(event: Event) {
  const customEvent = event as CustomEvent;
  console.log('[Dashboard] Auto-sync CUKCUK invoices update detected:', customEvent.detail);
  await loadTodayCukcuk();
  await loadShiftSummary();
  await loadPeriodStats();
}

// Lifecycle
onMounted(async () => {
  await shiftStore.loadShifts();
  await loadShiftSummary();
  await loadPeriodStats();
  await loadTodayCukcuk();
  
  refreshSyncStatus();
  calculateElapsedTime();
  elapsedTimer = setInterval(() => {
    calculateElapsedTime();
    refreshSyncStatus();
  }, 1000);

  window.addEventListener('cukcuk-invoices-updated', handleInvoicesUpdated);
});

onUnmounted(() => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
  }
  window.removeEventListener('cukcuk-invoices-updated', handleInvoicesUpdated);
});
</script>

<template>
  <div class="view-content p-6">

    <!-- 1. EMPTY STATE (No active shift) -->
    <div v-if="!shiftStore.currentShift" class="relative max-w-md mx-auto mt-16 animate-fade-in">
      <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-6 text-center transition-colors">
        <!-- Logo / Icon Container -->
        <div class="w-16 h-16 mx-auto bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-2xl flex items-center justify-center border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
          <span class="material-symbols-rounded text-3xl text-emerald-600 dark:text-emerald-400">storefront</span>
        </div>

        <!-- Typography -->
        <div class="space-y-1.5">
          <h2 class="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Hệ thống Thu ngân KING's GRILL
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[280px] mx-auto font-medium">
            Chưa có ca làm việc nào đang mở. Bắt đầu ca mới để quản lý thu chi, bán hàng và đồng bộ hóa đơn.
          </p>
        </div>

        <!-- Feature Badges -->
        <div class="flex flex-wrap justify-center gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-800">
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <span class="material-symbols-rounded text-sm text-amber-500">point_of_sale</span> POS & Gọi món
          </span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <span class="material-symbols-rounded text-sm text-emerald-500">sync</span> Đồng bộ CUKCUK
          </span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <span class="material-symbols-rounded text-sm text-cyan-500">receipt</span> Hóa đơn VAT
          </span>
        </div>

        <!-- Action Button -->
        <button 
          class="btn-primary w-full py-3.5 text-xs uppercase tracking-wider font-extrabold shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
          @click="emit('navigate', 'shift')"
        >
          <span class="material-symbols-rounded text-base">play_arrow</span>
          Bắt đầu mở ca làm việc
        </button>
      </div>
    </div>

    <!-- 2. ACTIVE DASHBOARD INTERFACE -->
    <div v-else class="space-y-6 animate-fade-in">
      
      <!-- Meta Information Topbar -->
      <div class="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/60 dark:border-emerald-800/60 shadow-xs">
            <span class="material-symbols-rounded">person_play</span>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Ca {{ shiftStore.currentShift.shiftNumber }} đang hoạt động</h3>
            <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              <span>Thu ngân: <strong class="text-slate-700 dark:text-slate-200">{{ shiftStore.currentShift.cashierName }}</strong></span>
              <span>•</span>
              <span>Ngày: {{ formatVN(shiftStore.currentShift.date) }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="bg-slate-900 dark:bg-slate-800 text-amber-400 dark:text-amber-300 text-xs font-black px-3.5 py-1.5 rounded-xl border border-slate-800 dark:border-slate-700 shadow-xs flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Trực ca: {{ activeShiftTime }}
          </div>
        </div>
      </div>

      <!-- Sync Status Ticker Bar -->
      <div 
        v-if="settingsStore.settings?.cukcuk?.domain"
        class="flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400"
      >
        <div class="flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>CUKCUK: {{ todayCukcukRev.bills }} bill đã lưu</span>
          <span v-if="syncTimeAgo" class="text-slate-400 dark:text-slate-500 font-medium">({{ syncTimeAgo }})</span>
        </div>
        <div class="flex items-center gap-3">
          <span>☁️ Cloud: {{ shiftStore.isSyncDirty ? '🟡 Đang lưu...' : '🟢 Đã lưu' }}</span>
        </div>
      </div>

      <!-- Primary Financial Tally Figures Grid (Harmonized 4 cards) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <!-- Starting Cash -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 shadow-xs transition-colors">
          <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50">
            <span class="material-symbols-rounded">account_balance_wallet</span>
          </div>
          <div>
            <span class="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Tiền đầu ca</span>
            <span class="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {{ formatMoney(shiftStore.currentShift.startingCash) }}
            </span>
          </div>
        </div>

        <!-- Total Income -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/60 flex items-center gap-4 shadow-xs transition-colors">
          <div class="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-800/60">
            <span class="material-symbols-rounded">trending_up</span>
          </div>
          <div class="flex-1 min-w-0">
            <span class="text-[10px] font-black text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wider block">Tổng THU trong ca</span>
            <span class="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
              {{ currentShiftSummary ? formatMoney(currentShiftSummary.totalIncome) : 'đang tính...' }}
            </span>
            <span v-if="currentShiftSummary" class="text-[9px] text-slate-400 dark:text-slate-400 block mt-0.5 truncate">
              CUKCUK: {{ formatMoney(currentShiftSummary.cukcukRevenue) }}
            </span>
          </div>
        </div>

        <!-- Total Expense -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-rose-200/60 dark:border-rose-900/60 flex items-center gap-4 shadow-xs transition-colors">
          <div class="w-12 h-12 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center shrink-0 border border-rose-200/60 dark:border-rose-800/60">
            <span class="material-symbols-rounded">trending_down</span>
          </div>
          <div>
            <span class="text-[10px] font-black text-rose-500/80 dark:text-rose-400/80 uppercase tracking-wider block">Tổng CHI trong ca</span>
            <span class="text-lg font-black text-rose-600 dark:text-rose-400 mt-1 block">
              {{ currentShiftSummary ? formatMoney(currentShiftSummary.totalExpense) : 'đang tính...' }}
            </span>
          </div>
        </div>

        <!-- Expected cash in drawer (Harmonized, no longer jarring stark black) -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 flex items-center gap-4 shadow-xs transition-colors">
          <div class="w-12 h-12 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0 border border-amber-200/60 dark:border-amber-800/60">
            <span class="material-symbols-rounded">payments</span>
          </div>
          <div class="flex-1 min-w-0">
            <span class="text-[10px] font-black text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider block">Tiền mặt kỳ vọng két</span>
            <span class="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 block truncate">
              {{ currentShiftSummary ? formatMoney(currentShiftSummary.expectedCash) : 'đang tính...' }}
            </span>
          </div>
        </div>

      </div>

      <!-- CUKCUK LIVE REVENUE vs MANUAL CARD -->
      <div v-if="settingsStore.settings?.cukcuk?.domain" class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
        <div class="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 class="font-extrabold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span class="material-symbols-rounded text-emerald-500">point_of_sale</span>
            Doanh thu POS hôm nay
          </h4>
          <button 
            class="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            :disabled="isSyncingCukcuk"
            @click="handleSyncCukcuk"
          >
            <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': isSyncingCukcuk }">sync</span>
            Đồng bộ CUKCUK
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-5 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-100/80 dark:border-emerald-900/50 rounded-2xl text-center space-y-2">
            <span class="text-[10px] font-black text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider block">💰 Doanh thu CUKCUK hôm nay</span>
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">{{ formatMoney(todayCukcukRev.total) }}</span>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">{{ todayCukcukRev.bills }} bill bán hàng đã nạp</span>
          </div>

          <div class="p-5 bg-gradient-to-br from-cyan-50/60 to-sky-50/40 dark:from-cyan-950/30 dark:to-sky-950/20 border border-cyan-100/80 dark:border-cyan-900/50 rounded-2xl text-center space-y-2">
            <span class="text-[10px] font-black text-cyan-600/80 dark:text-cyan-400 uppercase tracking-wider block">✍️ Ghi nhận thủ công ngoài CUKCUK</span>
            <span class="text-2xl font-black text-cyan-600 dark:text-cyan-400 block">
              {{ currentShiftSummary ? formatMoney(currentShiftSummary.manualIncome) : '0 đ' }}
            </span>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">
              {{ currentShiftSummary ? currentShiftSummary.manualBills : 0 }} mục thu độc lập
            </span>
          </div>
        </div>
      </div>

      <!-- Historical CUKCUK analytics -->
      <div v-if="settingsStore.settings?.cukcuk?.domain" class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
        <div class="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 class="font-extrabold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span class="material-symbols-rounded text-cyan-500">bar_chart</span>
            Phân tích tổng doanh thu CUKCUK
          </h4>

          <div class="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <button 
              v-for="p in ['month', 'quarter', 'year']" 
              :key="p"
              class="px-3 py-1 text-[11px] font-bold rounded-lg transition-all border-0 bg-transparent cursor-pointer"
              :class="revenuePeriod === p ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-xs font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
              @click="revenuePeriod = p as any"
            >
              {{ p === 'month' ? 'Tháng' : p === 'quarter' ? 'Quý' : 'Năm' }}
            </button>
          </div>
        </div>

        <div v-if="isLoadingPeriod" class="py-8 text-center text-slate-400 text-xs font-semibold">
          ⏳ Đang tải báo cáo dữ liệu...
        </div>
        <div v-else-if="periodStats" class="space-y-5 animate-fade-in">
          <div class="text-center space-y-1">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Thời gian: {{ periodStats.periodLabel }}
            </span>
            <span class="text-2xl font-black text-slate-900 dark:text-white block">{{ formatMoney(periodStats.totalRevenue) }}</span>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">
              {{ periodStats.totalBills }} bills · trung bình {{ formatMoney(periodStats.avgDaily) }}/ngày làm việc
            </span>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100/60 dark:border-emerald-900/40 rounded-xl text-center">
              <span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase mb-1">Tiền mặt</span>
              <span class="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">{{ formatMoney(periodStats.totalCash) }}</span>
            </div>
            <div class="p-3 bg-sky-50/50 dark:bg-sky-950/30 border border-sky-100/60 dark:border-sky-900/40 rounded-xl text-center">
              <span class="text-[9px] font-bold text-sky-600 dark:text-sky-400 block uppercase mb-1">Cà thẻ</span>
              <span class="text-xs font-extrabold text-sky-700 dark:text-sky-300">{{ formatMoney(periodStats.totalCard) }}</span>
            </div>
            <div class="p-3 bg-cyan-50/50 dark:bg-cyan-950/30 border border-cyan-100/60 dark:border-cyan-900/40 rounded-xl text-center">
              <span class="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 block uppercase mb-1">Chuyển khoản</span>
              <span class="text-xs font-extrabold text-cyan-700 dark:text-cyan-300">{{ formatMoney(periodStats.totalTransfer) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Payment break down + Recent transaction feed -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Payment breakdown chart -->
        <div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
          <h4 class="font-extrabold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-emerald-500">payments</span>
            Phân bổ phương thức thanh toán
          </h4>

          <div class="space-y-4" v-if="currentShiftSummary">
            <div 
              v-for="item in [
                { label: 'Tiền mặt', icon: 'payments', value: currentShiftSummary.cashIncome, gradClass: 'from-emerald-400 to-teal-500', textClass: 'text-emerald-500' },
                { label: 'Quẹt thẻ', icon: 'credit_card', value: currentShiftSummary.cardIncome, gradClass: 'from-sky-400 to-cyan-500', textClass: 'text-sky-500' },
                { label: 'Chuyển khoản', icon: 'swap_horiz', value: currentShiftSummary.transferIncome, gradClass: 'from-amber-400 to-orange-500', textClass: 'text-amber-500' }
              ]"
              :key="item.label"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between text-xs font-bold">
                <span class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span class="material-symbols-rounded text-sm shrink-0" :class="item.textClass">{{ item.icon }}</span>
                  {{ item.label }}
                </span>
                <span class="text-slate-800 dark:text-slate-100 font-extrabold">{{ formatMoney(item.value) }}</span>
              </div>
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-200/40 dark:border-slate-700/40">
                <div 
                  class="h-full rounded-full transition-all duration-500 bg-gradient-to-r" 
                  :class="item.gradClass"
                  :style="{ width: `${(item.value / maxPaymentMethod) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-6 text-slate-400 text-xs font-semibold">
            ⏳ Đang tải dữ liệu...
          </div>
        </div>

        <!-- Recent Transactions feed -->
        <div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
          <h4 class="font-extrabold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-cyan-500">history</span>
            Giao dịch gần đây trong ca
          </h4>

          <div class="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            <div 
              v-for="tx in shiftStore.currentShift.transactions.slice(-6).reverse()"
              :key="tx.id"
              class="flex items-center justify-between gap-3 p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 rounded-2xl transition-all"
            >
              <div class="flex items-center gap-3">
                <span 
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  :class="tx.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'"
                >
                  <span class="material-symbols-rounded text-base">
                    {{ tx.type === 'income' ? 'arrow_downward' : 'arrow_upward' }}
                  </span>
                </span>
                <div>
                  <span class="block text-xs font-extrabold text-slate-800 dark:text-slate-100">{{ tx.category }}</span>
                  <span v-if="tx.note" class="block text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 truncate max-w-[180px] font-semibold">{{ tx.note }}</span>
                </div>
              </div>
              <span class="text-xs font-black tabular-nums" :class="tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
                {{ tx.type === 'income' ? '+' : '-' }}{{ formatMoney(tx.amount) }}
              </span>
            </div>
            <div v-if="!shiftStore.currentShift.transactions?.length" class="text-center py-8 text-slate-400 text-xs font-semibold">
              Chưa phát sinh giao dịch nào.
            </div>
          </div>
        </div>

      </div>

      <!-- Recent shifts list -->
      <div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4 shadow-xs transition-colors">
        <h4 class="font-extrabold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-1.5">
          <span class="material-symbols-rounded text-emerald-500">history_edu</span>
          Nhật ký các ca làm việc gần đây
        </h4>

        <div class="space-y-2.5">
          <div 
            v-for="sh in shiftStore.shifts.slice(0, 4)"
            :key="sh.id"
            class="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60"
            @click="emit('navigate', 'history')"
          >
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 flex items-center justify-center font-bold text-xs">
                Ca {{ sh.shiftNumber }}
              </span>
              <div>
                <span class="block text-xs font-extrabold text-slate-800 dark:text-slate-100">{{ sh.cashierName }} — {{ formatVN(sh.date) }}</span>
                <span class="block text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-semibold">
                  {{ new Date(sh.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }} 
                  → 
                  {{ sh.endTime ? new Date(sh.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'đang mở' }}
                </span>
              </div>
            </div>
            <span class="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              +{{ formatMoney(sh.summarySnapshot?.totalIncome || 0) }}
            </span>
          </div>
          <div v-if="!shiftStore.shifts?.length" class="text-center py-6 text-slate-400 text-xs font-semibold">
            Không tìm thấy lịch sử ca.
          </div>
        </div>
      </div>

    </div>

  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes shine {
  0% { left: -100%; }
  100% { left: 100%; }
}

.animate-fade-in {
  animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.25), transparent);
  transform: skewX(-25deg);
  transition: none;
}

.group:hover .animate-shine {
  animation: shine 0.75s ease-in-out;
}
</style>
