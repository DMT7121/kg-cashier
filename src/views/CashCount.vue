<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { formatMoney, denominations, showToast, showConfirm } from '../utils';
import { ShiftSummary, CashCountDetail } from '../types/shift';

const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();

// Pin local storage keys
const PIN_KEY = 'kg_cashier_pinned_cash';

// Local reactive copies of denom counts
const pinned = ref<Record<number, number>>({});
const keep = ref<Record<number, number>>({});
const hand = ref<Record<number, number>>({});

// Discrepancy / summary state
const expectedCash = ref(0);

// Load persisted pins (carry forward)
function loadPersistentPins(): Record<number, number> {
  try {
    const saved = localStorage.getItem(PIN_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {};
}

function savePersistentPins(pins: Record<number, number>) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  } catch (e) {}
}

// Get ghim from last closed shift for carry forward
function getLastShiftGhim(): Record<number, number> {
  try {
    const history = shiftStore.shifts;
    if (history && history.length > 0) {
      return history[0].pinnedCash || {};
    }
  } catch (e) {}
  return {};
}

// Initialize denom states
async function initCounts() {
  const current = shiftStore.currentShift;
  if (!current) return;

  // Expected Cash calculation from summary
  const summary = await shiftStore.getShiftSummary(current);
  expectedCash.value = summary ? summary.expectedCash : 0;

  const lastGhim = getLastShiftGhim();
  const persistedPins = loadPersistentPins();

  let savedPins = current.pinnedCash || {};
  if (Object.keys(savedPins).length === 0) {
    savedPins = Object.keys(persistedPins).length > 0 ? persistedPins : lastGhim;
  }
  const savedKeep = current.keepCash || {};
  const savedHandover = current.handoverCash || {};
  const cc = current.cashCount || {};

  denominations.forEach(d => {
    const val = d.value;
    const pQty = Number(savedPins[val]) || 0;
    const kQty = Number(savedKeep[val]) || 0;
    
    let hQty = Number(savedHandover[val]) || 0;
    if (!current.handoverCash && cc[val] !== undefined && cc[val] > 0) {
      hQty = Math.max(0, (cc[val] || 0) - pQty - kQty);
    }

    pinned.value[val] = pQty;
    keep.value[val] = kQty;
    hand.value[val] = hQty;
  });
}

// Calculated values
const totalKet = computed(() => {
  let sum = 0;
  denominations.forEach(d => {
    const qty = (pinned.value[d.value] || 0) + (keep.value[d.value] || 0);
    sum += d.value * qty;
  });
  return sum;
});

const totalGiao = computed(() => {
  let sum = 0;
  denominations.forEach(d => {
    const qty = hand.value[d.value] || 0;
    sum += d.value * qty;
  });
  return sum;
});

const totalAll = computed(() => {
  return totalKet.value + totalGiao.value;
});

const discrepancy = computed(() => {
  return totalAll.value - expectedCash.value;
});

const discrepancyStatus = computed(() => {
  const diff = discrepancy.value;
  if (diff === 0) return { label: 'Khớp hoàn toàn', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: 'check_circle' };
  if (Math.abs(diff) <= 50000) return { label: 'Chênh lệch nhẹ', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', icon: 'warning' };
  return { label: 'Chênh lệch nhiều', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-100', icon: 'cancel' };
});

// Mutate value helpers
function adjustValue(type: 'pin' | 'keep' | 'hand', denom: number, delta: number) {
  const target = type === 'pin' ? pinned : type === 'keep' ? keep : hand;
  const currentVal = target.value[denom] || 0;
  target.value[denom] = Math.max(0, currentVal + delta);
}

// Long-press implementation
let pressTimer: any = null;
let intervalTimer: any = null;

function startPress(type: 'pin' | 'keep' | 'hand', denom: number, delta: number) {
  adjustValue(type, denom, delta);
  pressTimer = setTimeout(() => {
    intervalTimer = setInterval(() => {
      adjustValue(type, denom, delta);
    }, 100);
  }, 400);
}

function stopPress() {
  if (pressTimer) clearTimeout(pressTimer);
  if (intervalTimer) clearInterval(intervalTimer);
}

// Actions
function handleReset() {
  denominations.forEach(d => {
    keep.value[d.value] = 0;
    hand.value[d.value] = 0;
  });
  showToast('Đã đặt lại (tiền ghim giữ nguyên)', 'info');
}

function handleSave() {
  const current = shiftStore.currentShift;
  if (!current) return;

  const pinsToSave: CashCountDetail = {};
  const keepsToSave: CashCountDetail = {};
  const handsToSave: CashCountDetail = {};
  const countsToSave: CashCountDetail = {};

  denominations.forEach(d => {
    const val = d.value;
    const pin = pinned.value[val] || 0;
    const k = keep.value[val] || 0;
    const h = hand.value[val] || 0;

    if (pin > 0) pinsToSave[val] = pin;
    if (k > 0) keepsToSave[val] = k;
    if (h > 0) handsToSave[val] = h;

    const total = pin + k + h;
    if (total > 0) countsToSave[val] = total;
  });

  try {
    savePersistentPins(pinsToSave as any);
    shiftStore.updateCashCount(countsToSave, pinsToSave, keepsToSave, handsToSave);
    showToast('Lưu kết quả kiểm kê tiền mặt thành công', 'success');
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

// Mount/Unmount
onMounted(() => {
  initCounts();
});

onUnmounted(() => {
  stopPress();
});
</script>

<template>
  <div class="view-content p-6">
    <!-- If no shift is open -->
    <div v-if="!shiftStore.currentShift" class="max-w-md mx-auto mt-12 text-center bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
      <div class="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/60 dark:border-amber-800/60">
        <span class="material-symbols-rounded text-3xl">lock</span>
      </div>
      <div>
        <h2 class="text-xl font-extrabold text-slate-800 dark:text-white">Chưa mở ca làm việc</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Bạn cần mở ca làm việc trước khi thực hiện kiểm kê tiền mặt.</p>
      </div>
      <button 
        class="btn-primary w-full py-3.5 text-xs uppercase tracking-wider font-extrabold shadow-sm cursor-pointer transition-all"
        @click="shiftStore.loadShifts()"
      >
        Quay lại trang chủ
      </button>
    </div>

    <!-- Active Cash Count screen -->
    <div v-else class="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 class="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-xl">💰</span> Kiểm kê tiền mặt
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">📌 Ghim (két cố định) + 🔒 Giữ (giữ lại két) + 🤝 Giao (bàn giao)</p>
        </div>
        <button 
          class="btn-secondary px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          @click="handleReset"
        >
          <span class="material-symbols-rounded text-base">restart_alt</span> Đặt lại
        </button>
      </div>

      <!-- Denominations Grid -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-3.5 transition-colors">
        <div 
          v-for="d in denominations" 
          :key="d.value"
          class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3.5 last:border-b-0 last:pb-0 flex-wrap gap-4"
        >
          <!-- Denomination Label Badge (Clean subtle pill) -->
          <div 
            class="w-24 text-center py-2 rounded-xl font-black text-xs select-none shadow-xs border bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200/70 dark:border-slate-700"
          >
            {{ d.label }}
          </div>

          <!-- Input Fields Column -->
          <div class="flex-1 min-w-[300px] grid grid-cols-3 gap-3">
            <!-- Pin Column -->
            <div class="space-y-1">
              <span class="block text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider text-center">📌 Ghim</span>
              <div class="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/60 dark:bg-slate-800/60 h-10">
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('pin', d.value, -1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('pin', d.value, -1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">remove</span>
                </button>
                <input 
                  type="number" 
                  v-model.number="pinned[d.value]"
                  class="w-full text-center bg-transparent border-0 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none p-0 focus:ring-0"
                  min="0"
                />
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('pin', d.value, 1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('pin', d.value, 1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">add</span>
                </button>
              </div>
            </div>

            <!-- Keep Column -->
            <div class="space-y-1">
              <span class="block text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-wider text-center">🔒 Giữ</span>
              <div class="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/60 dark:bg-slate-800/60 h-10">
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('keep', d.value, -1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('keep', d.value, -1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">remove</span>
                </button>
                <input 
                  type="number" 
                  v-model.number="keep[d.value]"
                  class="w-full text-center bg-transparent border-0 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none p-0 focus:ring-0"
                  min="0"
                />
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('keep', d.value, 1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('keep', d.value, 1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">add</span>
                </button>
              </div>
            </div>

            <!-- Handover Column -->
            <div class="space-y-1">
              <span class="block text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-center">🤝 Giao</span>
              <div class="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/60 dark:bg-slate-800/60 h-10">
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('hand', d.value, -1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('hand', d.value, -1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">remove</span>
                </button>
                <input 
                  type="number" 
                  v-model.number="hand[d.value]"
                  class="w-full text-center bg-transparent border-0 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none p-0 focus:ring-0"
                  min="0"
                />
                <button 
                  class="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700 border-0 bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer select-none active:scale-90 transition-transform"
                  @mousedown="startPress('hand', d.value, 1)"
                  @mouseup="stopPress"
                  @mouseleave="stopPress"
                  @touchstart.passive="startPress('hand', d.value, 1)"
                  @touchend="stopPress"
                >
                  <span class="material-symbols-rounded text-base">add</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Subtotal column -->
          <div class="text-right min-w-[120px] font-bold text-[11px] text-slate-500 dark:text-slate-400 flex flex-col justify-center">
            <span>Két: {{ formatMoney(d.value * ((pinned[d.value] || 0) + (keep[d.value] || 0))) }}</span>
            <span>Giao: {{ formatMoney(d.value * (hand[d.value] || 0)) }}</span>
            <span class="text-xs font-black text-slate-800 dark:text-slate-100">Σ {{ formatMoney(d.value * ((pinned[d.value] || 0) + (keep[d.value] || 0) + (hand[d.value] || 0))) }}</span>
          </div>

        </div>
      </div>

      <!-- Expected Discrepancy Bar Card -->
      <div 
        class="border p-5 rounded-3xl shadow-xs transition-all duration-300 dark:bg-slate-900 dark:border-slate-800"
        :class="discrepancyStatus.bg"
      >
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <div class="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">💵 Tiền mặt kỳ vọng</div>
            <div class="text-xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums">{{ formatMoney(expectedCash) }}</div>
            <div class="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-1">Đầu ca + TM thu − TM chi ± Khác</div>
          </div>
          <div>
            <div class="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">💰 Thực tế kiểm kê</div>
            <div class="text-xl font-black text-slate-800 dark:text-slate-100 tabular-nums">{{ formatMoney(totalAll) }}</div>
            <div class="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-1">Két ({{ formatMoney(totalKet) }}) + Giao ({{ formatMoney(totalGiao) }})</div>
          </div>
          <div>
            <div class="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              <span class="material-symbols-rounded text-sm" :class="discrepancyStatus.color">{{ discrepancyStatus.icon }}</span>
              Chênh lệch
            </div>
            <div class="text-xl font-black tabular-nums" :class="discrepancyStatus.color">
              {{ discrepancy >= 0 ? '+' : '' }}{{ formatMoney(discrepancy) }}
            </div>
            <div class="text-[9px] font-black mt-1" :class="discrepancyStatus.color">
              {{ discrepancyStatus.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- Quick totals visual list -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-2xl flex items-center justify-between shadow-xs">
          <div class="space-y-1">
            <span class="block text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">📌🔒 Tổng tiền két</span>
            <strong class="text-sm font-black text-amber-900 dark:text-amber-200 tabular-nums">{{ formatMoney(totalKet) }}</strong>
          </div>
          <span class="material-symbols-rounded text-amber-500 text-2xl">safe</span>
        </div>
        <div class="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl flex items-center justify-between shadow-xs">
          <div class="space-y-1">
            <span class="block text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">🤝 Tiền bàn giao</span>
            <strong class="text-sm font-black text-emerald-900 dark:text-emerald-200 tabular-nums">{{ formatMoney(totalGiao) }}</strong>
          </div>
          <span class="material-symbols-rounded text-emerald-500 text-2xl">handshake</span>
        </div>
        <div class="p-4 bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/50 rounded-2xl flex items-center justify-between shadow-xs">
          <div class="space-y-1">
            <span class="block text-[10px] font-black text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">💰 TỔNG KIỂM KÊ</span>
            <strong class="text-sm font-black text-cyan-900 dark:text-cyan-200 tabular-nums">{{ formatMoney(totalAll) }}</strong>
          </div>
          <span class="material-symbols-rounded text-cyan-500 text-2xl">monetization_on</span>
        </div>
      </div>

      <!-- Action Button Save -->
      <button 
        class="btn-primary w-full py-3.5 text-xs uppercase tracking-wider font-extrabold shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
        @click="handleSave"
      >
        <span class="material-symbols-rounded text-lg">save</span> Lưu kiểm kê
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* Hide spin buttons on number inputs */
input[type=number]::-webkit-inner-spin-button, 
input[type=number]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}
input[type=number] {
  -moz-appearance: textfield;
}
</style>
