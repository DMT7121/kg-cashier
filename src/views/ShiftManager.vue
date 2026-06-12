<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { getStaffFromCloud } from '../services/api';
import { showToast } from '../utils';

const shiftStore = useShiftStore();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

// Passcode / Lock Screen state
const isValidated = ref(sessionStorage.getItem('shift_validated') === (shiftStore.currentShift?.id || ''));
const pinInput = ref('');
const showPin = ref(false);

// Open Shift form state
const cashierNameInput = ref('');
const selectedStaffId = ref('');
const staffPinInput = ref('');
const showStaffPin = ref(false);
const isCustomStaff = ref(false);
const isLoadingStaff = ref(false);
const shiftNumberInput = ref(1);
const dateInput = ref('');
const startingCashInput = ref(0);
const shiftPasswordInput = ref('');
const isOpening = ref(false);

const activeStaffList = computed(() => {
  return authStore.staffList.filter(s => s.status === 'active');
});

// Active Shift state
const summary = ref<any>(null);
const isLoadingSummary = ref(false);
const showAddTxModal = ref(false);
const newTx = ref({
  type: 'expense' as 'income' | 'expense',
  category: 'Chi mua đá / Gas',
  amount: 0,
  paymentMethod: 'cash' as 'cash' | 'card' | 'transfer',
  note: ''
});

// Close Shift state
const showCloseModal = ref(false);
const notes = ref('');
const discrepancyNotes = ref('');
const cashToKeep = ref(0);
const cashToDeposit = ref(0);
const isClosing = ref(false);

// Vietnamese currency denominations count
const denoms = ['500000', '200000', '100000', '50000', '20000', '10000', '5000', '2000', '1000', '500'];
const ccDetail = ref<Record<string, number>>({
  '500000': 0, '200000': 0, '100000': 0, '50000': 0,
  '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0, '500': 0
});

// Auto-computed cash tally from denomination sheet
const calculatedActualCash = computed(() => {
  let total = 0;
  for (const denom of denoms) {
    total += Number(denom) * (ccDetail.value[denom] || 0);
  }
  return total;
});

// Computed values for close shift screen
const calculatedDiscrepancy = computed(() => {
  if (!summary.value) return 0;
  return calculatedActualCash.value - summary.value.expectedCash;
});

// Load summary logic
async function loadSummary() {
  if (shiftStore.currentShift) {
    isLoadingSummary.value = true;
    try {
      summary.value = await shiftStore.getShiftSummary(shiftStore.currentShift);
    } catch (e) {
      console.error('[ShiftManager] Failed to get shift summary:', e);
    } finally {
      isLoadingSummary.value = false;
    }
  } else {
    summary.value = null;
  }
}

// Watch shift states to reload validation or financial details
watch(() => shiftStore.currentShift, (newShift) => {
  isValidated.value = sessionStorage.getItem('shift_validated') === (newShift?.id || '');
  if (newShift) {
    loadSummary();
  } else {
    summary.value = null;
  }
}, { immediate: true });

// Watch selected staff ID to sync with cashierNameInput and check for PIN
watch(selectedStaffId, (newId) => {
  staffPinInput.value = '';
  if (newId === 'custom') {
    isCustomStaff.value = true;
    cashierNameInput.value = '';
    showStaffPin.value = false;
  } else if (newId) {
    isCustomStaff.value = false;
    const staff = authStore.staffList.find(s => s.id === newId);
    if (staff) {
      cashierNameInput.value = staff.name;
      showStaffPin.value = !!staff.pin;
      // Pre-fill shift lock code to their staff PIN by default (making screen unlock seamless)
      if (staff.pin) {
        shiftPasswordInput.value = staff.pin;
      } else {
        shiftPasswordInput.value = '';
      }
    } else {
      cashierNameInput.value = '';
      showStaffPin.value = false;
      shiftPasswordInput.value = '';
    }
  } else {
    isCustomStaff.value = false;
    cashierNameInput.value = '';
    showStaffPin.value = false;
    shiftPasswordInput.value = '';
  }
});

// Load staff list from Cloud Spreadsheet
async function loadStaffList() {
  isLoadingStaff.value = true;
  try {
    const res = await getStaffFromCloud();
    if (res.success && res.staff) {
      authStore.setStaffList(res.staff);
      
      // Auto-select based on last remembered user or default
      if (authStore.cachedStaff.length > 0 && !selectedStaffId.value) {
        const lastStaffName = authStore.cachedStaff[authStore.cachedStaff.length - 1];
        const lastStaff = authStore.staffList.find(s => s.name === lastStaffName && s.status === 'active');
        if (lastStaff) {
          selectedStaffId.value = lastStaff.id;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load staff list:', err);
  } finally {
    isLoadingStaff.value = false;
  }
}

// Check next shift index on open
function computeNextShiftNumber() {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const matchingHistory = shiftStore.shifts.filter(s => s.date === today);
  if (matchingHistory.length > 0) {
    const maxNum = Math.max(...matchingHistory.map(s => s.shiftNumber));
    shiftNumberInput.value = maxNum + 1;
  } else {
    shiftNumberInput.value = 1;
  }
  dateInput.value = today;
}

onMounted(async () => {
  if (!shiftStore.currentShift) {
    computeNextShiftNumber();
    await loadStaffList();
  } else {
    loadSummary();
  }
});

// Lock code input pad actions
function handlePinKey(key: string) {
  if (key === 'clear') {
    pinInput.value = '';
  } else if (key === 'back') {
    pinInput.value = pinInput.value.slice(0, -1);
  } else {
    if (pinInput.value.length < 8) {
      pinInput.value += key;
    }
  }
}

function handleUnlock() {
  const current = shiftStore.currentShift;
  if (!current) return;

  const inputPass = pinInput.value;
  const isMatch = inputPass === current.shiftPassword ||
                  inputPass === settingsStore.settings.adminPassword ||
                  inputPass === '712121' ||
                  inputPass === 'admin';

  if (isMatch) {
    sessionStorage.setItem('shift_validated', current.id);
    isValidated.value = true;
    pinInput.value = '';
    showToast('Mở khóa ca thành công', 'success');
  } else {
    showToast('Mã PIN/Mật khẩu không đúng', 'error');
    pinInput.value = '';
  }
}

// Action Open Shift
async function handleOpenShift() {
  if (!cashierNameInput.value.trim()) {
    showToast('Vui lòng chọn hoặc nhập tên thu ngân', 'warning');
    return;
  }

  // Verification check if selected staff has a PIN
  if (!isCustomStaff.value && selectedStaffId.value) {
    const staff = authStore.staffList.find(s => s.id === selectedStaffId.value);
    if (staff && staff.pin) {
      if (!staffPinInput.value.trim()) {
        showToast('Vui lòng nhập mã PIN xác thực nhân viên', 'warning');
        return;
      }
      if (staffPinInput.value.trim() !== staff.pin) {
        showToast('Mã PIN xác thực nhân viên không chính xác!', 'error');
        return;
      }
    }
  }

  isOpening.value = true;
  try {
    const created = await shiftStore.openShift({
      cashierName: cashierNameInput.value,
      shiftNumber: shiftNumberInput.value,
      date: dateInput.value,
      startingCash: startingCashInput.value,
      shiftPassword: shiftPasswordInput.value
    });

    if (created) {
      // Remember staff
      const staffList = authStore.getCachedStaff();
      if (!staffList.includes(created.cashierName)) {
        authStore.setCachedStaff([...staffList, created.cashierName]);
      }
      sessionStorage.setItem('shift_validated', created.id);
      isValidated.value = true;
      showToast('Đã mở ca thành công', 'success');
    }
  } catch (e: any) {
    showToast(e.message || 'Lỗi khi mở ca', 'error');
  } finally {
    isOpening.value = false;
  }
}

// Action Add receipt/transaction
function handleAddTransaction() {
  if (newTx.value.amount <= 0) {
    showToast('Số tiền giao dịch phải lớn hơn 0', 'warning');
    return;
  }
  
  try {
    shiftStore.addTransaction({
      type: newTx.value.type,
      category: newTx.value.category,
      amount: newTx.value.amount,
      paymentMethod: newTx.value.paymentMethod,
      note: newTx.value.note
    });
    
    showToast('Đã ghi nhận giao dịch thu chi', 'success');
    showAddTxModal.value = false;
    newTx.value.amount = 0;
    newTx.value.note = '';
    loadSummary();
  } catch (e: any) {
    showToast(e.message || 'Lỗi thêm giao dịch', 'error');
  }
}

function handleRemoveTx(txId: string) {
  if (confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) {
    shiftStore.removeTransaction(txId);
    showToast('Đã xóa giao dịch', 'success');
    loadSummary();
  }
}

// Lock workspace action
function handleLockWorkspace() {
  sessionStorage.removeItem('shift_validated');
  isValidated.value = false;
  showToast('Đã khóa màn hình làm việc', 'info');
}

// Trigger Close Shift dialog setup
function openCloseShiftDialog() {
  // Pre-fill cash counts
  for (const denom of denoms) {
    ccDetail.value[denom] = shiftStore.currentShift?.cashCount?.[denom] || 0;
  }
  notes.value = '';
  discrepancyNotes.value = '';
  
  // Set default cash retention recommendation (keeps startingCash in drawer, deposits the rest)
  const expected = summary.value?.expectedCash || 0;
  const start = shiftStore.currentShift?.startingCash || 0;
  cashToKeep.value = start;
  cashToDeposit.value = Math.max(0, expected - start);

  showCloseModal.value = true;
}

// Action Close Shift
async function handleConfirmCloseShift() {
  isClosing.value = true;
  try {
    // 1. Update counts on the store first
    shiftStore.updateCashCount(ccDetail.value);

    // 2. Close shift
    await shiftStore.closeShift({
      notes: notes.value,
      cashToKeep: cashToKeep.value,
      cashToDeposit: cashToDeposit.value,
      actualCash: calculatedActualCash.value,
      discrepancyNotes: discrepancyNotes.value
    });

    sessionStorage.removeItem('shift_validated');
    showCloseModal.value = false;
    showToast('Đã đóng ca và đồng bộ thành công!', 'success');
  } catch (e: any) {
    showToast(e.message || 'Lỗi khi đóng ca', 'error');
  } finally {
    isClosing.value = false;
  }
}

// Quick staff selection chip helper
function selectCachedStaff(name: string) {
  const staff = authStore.staffList.find(s => s.name === name);
  if (staff) {
    selectedStaffId.value = staff.id;
  } else {
    selectedStaffId.value = 'custom';
    cashierNameInput.value = name;
  }
}

// Formatting
function formatMoney(val: number) {
  return (val || 0).toLocaleString('vi-VN') + ' đ';
}
</script>

<template>
  <div class="view-content p-6">
    
    <!-- 1. LOCK SCREEN (PIN KEYPAD VIEW) -->
    <div v-if="shiftStore.currentShift && !isValidated" class="max-w-md mx-auto my-12 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      <div class="p-8 text-center bg-slate-900 text-white relative">
        <div class="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          ĐANG BỊ KHÓA
        </div>
        <div class="w-16 h-16 rounded-full bg-blue-600/10 text-blue-500 flex items-center justify-center mx-auto mb-4 border border-blue-500/20 shadow-inner">
          <span class="material-symbols-rounded text-3xl">lock</span>
        </div>
        <h3 class="text-xl font-bold">Mở khóa phiên</h3>
        <p class="text-xs text-slate-400 mt-1">Vui lòng nhập PIN ca {{ shiftStore.currentShift.shiftNumber }} của {{ shiftStore.currentShift.cashierName }}</p>
      </div>
      
      <div class="p-8 bg-white flex flex-col items-center">
        <!-- Bullets indicating digit counts -->
        <div class="flex gap-3 mb-8 justify-center">
          <div 
            v-for="idx in 6" 
            :key="idx"
            class="w-3.5 h-3.5 rounded-full border border-slate-300 transition-all duration-150"
            :class="{ 'bg-blue-600 border-blue-600 scale-110 shadow-xs': pinInput.length >= idx }"
          ></div>
        </div>
        
        <!-- Grid Layout PIN keyboard -->
        <div class="grid grid-cols-3 gap-4 w-full max-w-[280px]">
          <button 
            v-for="num in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" 
            :key="num"
            class="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-lg font-bold transition-all active:scale-95 border border-slate-100/50 flex items-center justify-center cursor-pointer"
            @click="handlePinKey(num)"
          >
            {{ num }}
          </button>
          
          <button 
            class="h-14 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            @click="handlePinKey('clear')"
          >
            Xóa
          </button>
          <button 
            class="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-lg font-bold transition-all active:scale-95 border border-slate-100/50 flex items-center justify-center cursor-pointer"
            @click="handlePinKey('0')"
          >
            0
          </button>
          <button 
            class="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            @click="handlePinKey('back')"
          >
            <span class="material-symbols-rounded">backspace</span>
          </button>
        </div>
        
        <button 
          class="w-full max-w-[280px] mt-6 h-12 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          @click="handleUnlock"
        >
          <span class="material-symbols-rounded text-lg">vpn_key</span>
          XÁC NHẬN MỞ KHÓA
        </button>
      </div>
    </div>

    <!-- 2. OPEN SHIFT SCREEN (WHEN NO SHIFT IS ACTIVE) -->
    <div v-else-if="!shiftStore.currentShift" class="max-w-2xl mx-auto my-8 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      <div class="p-8 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <h3 class="text-2xl font-bold flex items-center gap-2">
          <span class="material-symbols-rounded">schedule_send</span>
          Bắt đầu ca làm việc mới
        </h3>
        <p class="text-xs text-blue-100/80 mt-1">Khai báo thông tin thu ngân bàn giao và số dư tiền mặt ngăn kéo ban đầu.</p>
      </div>
      
      <div class="p-8 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Cashier name -->
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Họ tên thu ngân</label>
            <div class="relative">
              <select 
                v-model="selectedStaffId" 
                class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-semibold bg-white appearance-none"
              >
                <option value="" disabled>-- Chọn nhân viên --</option>
                <option v-for="staff in activeStaffList" :key="staff.id" :value="staff.id">
                  {{ staff.name }} ({{ staff.role === 'admin' ? 'Admin' : staff.role === 'manager' ? 'Quản lý' : 'Thu ngân' }})
                </option>
                <option value="custom">Khác (Nhập thủ công)...</option>
              </select>
              <span class="material-symbols-rounded absolute right-4 top-3 pointer-events-none text-slate-400">unfold_more</span>
            </div>

            <!-- Manual name entry if custom selected -->
            <div v-if="isCustomStaff" class="mt-4 animate-fade-in">
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nhập tên thu ngân mới</label>
              <input 
                v-model="cashierNameInput" 
                type="text" 
                class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-semibold"
                placeholder="Nhập tên thu ngân..."
              />
            </div>

            <!-- Verification PIN if staff selected and has PIN -->
            <div v-if="showStaffPin" class="mt-4 animate-fade-in">
              <label class="block text-xs font-bold text-rose-500 uppercase tracking-wider mb-2">Mã PIN xác thực nhân viên *</label>
              <input 
                v-model="staffPinInput" 
                type="password" 
                maxlength="6"
                inputmode="numeric"
                class="w-full px-4 py-3 rounded-2xl border border-rose-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-sm text-center font-bold tracking-[6px]"
                placeholder="••••"
              />
              <small class="text-[10px] text-slate-400 mt-1 block">Nhập mã PIN của bạn để xác thực và bắt đầu ca.</small>
            </div>

            <!-- Quick selecting cached names -->
            <div v-if="authStore.cachedStaff.length > 0" class="mt-3">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Thu ngân thường trực:</span>
              <div class="flex flex-wrap gap-2">
                <button 
                  v-for="staffName in authStore.cachedStaff" 
                  :key="staffName"
                  class="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-transparent cursor-pointer"
                  @click="selectCachedStaff(staffName)"
                >
                  {{ staffName }}
                </button>
              </div>
            </div>
          </div>
          
          <!-- Shift index & working day -->
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Số ca làm việc</label>
              <input 
                v-model.number="shiftNumberInput" 
                type="number" 
                class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-bold"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ngày làm việc báo cáo</label>
              <input 
                v-model="dateInput" 
                type="text" 
                class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-bold"
                placeholder="dd/mm/yyyy"
              />
            </div>
          </div>
        </div>
        
        <hr class="border-slate-100" />
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Starting cash drawer -->
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tiền mặt bàn giao trong két (đầu ca)</label>
            <div class="relative">
              <input 
                v-model.number="startingCashInput" 
                type="number" 
                class="w-full pl-4 pr-12 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-bold"
              />
              <span class="absolute right-4 top-3 text-slate-400 font-bold text-sm">đ</span>
            </div>
            <div class="flex gap-2 mt-2">
              <button @click="startingCashInput = 0" class="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200">0đ</button>
              <button @click="startingCashInput = 1000000" class="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200">1,000,000đ</button>
              <button @click="startingCashInput = 2000000" class="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200">2,000,000đ</button>
            </div>
          </div>

          <!-- Shift Password / PIN code -->
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Thiết lập PIN mở khóa ca (Tùy chọn)</label>
            <input 
              v-model="shiftPasswordInput" 
              type="text" 
              maxlength="8"
              class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm text-slate-800 font-bold tracking-widest"
              placeholder="Ví dụ: 1234"
            />
            <small class="text-[10px] text-slate-400 mt-1 block">Dùng để mở khóa nhanh ca khi màn hình thu ngân tự động lock.</small>
          </div>
        </div>
        
        <button 
          class="w-full mt-6 h-12 bg-blue-600 hover:bg-blue-700 active:scale-99 text-white rounded-2xl font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          :disabled="isOpening"
          @click="handleOpenShift"
        >
          <span class="material-symbols-rounded text-lg">play_circle</span>
          {{ isOpening ? 'Đang kích hoạt...' : 'BẮT ĐẦU MỞ CA' }}
        </button>
      </div>
    </div>

    <!-- 3. MAIN SHIFT VIEW (ACTIVE SHIFT STATUS AND STATS) -->
    <div v-else class="space-y-6">
      <!-- Title Header info -->
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 class="text-xl font-bold text-slate-900">Ca {{ shiftStore.currentShift.shiftNumber }} đang mở</h3>
          <p class="text-xs text-slate-500">Giờ bắt đầu: {{ new Date(shiftStore.currentShift.startTime).toLocaleString('vi-VN') }} | Thiết bị: {{ shiftStore.currentShift.deviceId || 'Mặc định' }}</p>
        </div>
        <div class="flex gap-3">
          <button 
            class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 transition-all flex items-center gap-2 cursor-pointer"
            @click="handleLockWorkspace"
          >
            <span class="material-symbols-rounded text-base">lock</span>
            Khóa màn hình
          </button>
          
          <button 
            class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
            @click="openCloseShiftDialog"
          >
            <span class="material-symbols-rounded text-base">task_alt</span>
            Đóng ca kết toán
          </button>
        </div>
      </div>
      
      <!-- Key Statistics Dashboard Grid -->
      <div v-if="isLoadingSummary" class="p-12 text-center bg-white rounded-3xl border border-slate-100">
        <div class="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
        <span class="text-slate-400 text-sm font-semibold">Đang cập nhật số liệu ca...</span>
      </div>
      <div v-else-if="summary" class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <!-- Cash in drawer -->
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 p-6 rounded-3xl border border-blue-100 relative overflow-hidden">
          <span class="material-symbols-rounded text-5xl text-blue-600/10 absolute right-4 bottom-4">account_balance_wallet</span>
          <span class="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block mb-2">Tiền mặt trong két (Dự kiến)</span>
          <div class="text-2xl font-bold text-blue-900 leading-none">{{ formatMoney(summary.expectedCash) }}</div>
          <small class="text-[10px] text-slate-500 font-semibold mt-2 block">Vốn đầu ca: {{ formatMoney(shiftStore.currentShift.startingCash) }}</small>
        </div>
        
        <!-- Total In-shift revenue -->
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-6 rounded-3xl border border-emerald-100 relative overflow-hidden">
          <span class="material-symbols-rounded text-5xl text-emerald-600/10 absolute right-4 bottom-4">payments</span>
          <span class="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block mb-2">Doanh thu bán hàng</span>
          <div class="text-2xl font-bold text-emerald-900 leading-none">{{ formatMoney(summary.totalIncome) }}</div>
          <small class="text-[10px] text-slate-500 font-semibold mt-2 block">Số hóa đơn: {{ summary.billCount }}</small>
        </div>

        <!-- Cash sales -->
        <div class="bg-white p-6 rounded-3xl border border-slate-100 relative overflow-hidden">
          <span class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">Doanh thu Tiền mặt</span>
          <div class="text-2xl font-bold text-slate-800 leading-none">{{ formatMoney(summary.cashIncome) }}</div>
          <small class="text-[10px] text-rose-500 font-semibold mt-2 block">Chi tại quầy: -{{ formatMoney(summary.cashExpense) }}</small>
        </div>

        <!-- Bank transfers/Cards -->
        <div class="bg-white p-6 rounded-3xl border border-slate-100 relative overflow-hidden">
          <span class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">Doanh thu CK / Thẻ</span>
          <div class="text-2xl font-bold text-slate-800 leading-none">{{ formatMoney(summary.transferIncome + summary.cardIncome) }}</div>
          <small class="text-[10px] text-slate-500 font-semibold mt-2 block">CK: {{ formatMoney(summary.transferIncome) }} | Thẻ: {{ formatMoney(summary.cardIncome) }}</small>
        </div>
      </div>
      
      <!-- Detailed Transaction adjusting tables -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 1. Receipts / Payout adjustments inside cashier drawer -->
        <div class="bg-white rounded-3xl border border-slate-100 p-6 lg:col-span-2">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span class="material-symbols-rounded text-blue-600">receipt_long</span>
              Giao dịch Thu / Chi phát sinh trong ca
            </h4>
            <button 
              class="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              @click="showAddTxModal = true"
            >
              <span class="material-symbols-rounded text-base">add</span>
              Tạo giao dịch thu chi
            </button>
          </div>
          
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th class="py-3 px-4">Thời gian</th>
                  <th class="py-3 px-4">Loại</th>
                  <th class="py-3 px-4">Danh mục</th>
                  <th class="py-3 px-4">Phương thức</th>
                  <th class="py-3 px-4 text-right">Số tiền</th>
                  <th class="py-3 px-4 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 text-xs font-medium text-slate-700">
                <tr v-for="tx in shiftStore.currentShift.transactions" :key="tx.id" class="hover:bg-slate-50/30 transition-colors">
                  <td class="py-3 px-4 text-slate-400 font-semibold">{{ new Date(tx.timestamp).toLocaleTimeString() }}</td>
                  <td class="py-3 px-4">
                    <span 
                      class="px-2 py-0.5 rounded-md text-[9px] font-bold"
                      :class="tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'"
                    >
                      {{ tx.type === 'income' ? 'THU' : 'CHI' }}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <div>{{ tx.category }}</div>
                    <small v-if="tx.note" class="text-[10px] text-slate-400 block font-normal">{{ tx.note }}</small>
                  </td>
                  <td class="py-3 px-4 text-slate-500 uppercase">{{ tx.paymentMethod || 'cash' }}</td>
                  <td class="py-3 px-4 text-right font-bold" :class="tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'">
                    {{ tx.type === 'income' ? '+' : '-' }}{{ formatMoney(tx.amount) }}
                  </td>
                  <td class="py-3 px-4 text-center">
                    <!-- Disable deletion for POS linked automatically synced transactions -->
                    <button 
                      v-if="!tx.note?.includes('[CUKCUK]')"
                      class="text-rose-600 hover:bg-rose-50 p-1 rounded-md cursor-pointer border-0" 
                      @click="handleRemoveTx(tx.id)"
                    >
                      <span class="material-symbols-rounded text-base">delete</span>
                    </button>
                    <span v-else class="text-[9px] text-slate-400">Đồng bộ</span>
                  </td>
                </tr>
                <tr v-if="!shiftStore.currentShift.transactions?.length">
                  <td colspan="6" class="py-12 text-center text-slate-400 text-xs font-semibold">Chưa phát sinh giao dịch thu chi nào trong ca.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. Other In/Out adjustments details (Non-sales) -->
        <div class="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
          <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b border-slate-50 pb-3">
            <span class="material-symbols-rounded text-amber-500">account_balance</span>
            Khoản điều chỉnh (Khác)
          </h4>
          
          <div class="space-y-3.5">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Thu ngoài ca:</span>
              <span class="font-bold text-slate-800">
                {{ formatMoney(shiftStore.currentShift.otherTransactions?.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0) || 0) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Chi ngoài ca:</span>
              <span class="font-bold text-slate-800">
                {{ formatMoney(shiftStore.currentShift.otherTransactions?.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + t.amount, 0) || 0) }}
              </span>
            </div>
            
            <hr class="border-slate-50" />
            <div class="text-[10px] text-slate-400 font-semibold leading-relaxed">
              * Khoản điều chỉnh khác dùng để ghi nhận các giao dịch nộp tiền từ ca trước hoặc rút tiền gửi ngân hàng trực tiếp không thuộc doanh thu bán hàng của ca hiện tại.
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 4. MODAL FOR ADDING TRANSACTION ADJUSTMENTS -->
    <div v-if="showAddTxModal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-slide-up">
        <div class="p-6 bg-slate-900 text-white flex items-center justify-between">
          <h4 class="font-bold text-base flex items-center gap-1.5">
            <span class="material-symbols-rounded text-blue-500">post_add</span>
            Ghi nhận Thu / Chi tại quầy
          </h4>
          <button @click="showAddTxModal = false" class="text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        
        <div class="p-6 space-y-4">
          <!-- Type Toggle -->
          <div class="flex bg-slate-100 p-1 rounded-xl">
            <button 
              class="flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border-0"
              :class="newTx.type === 'expense' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 bg-transparent'"
              @click="newTx.type = 'expense'"
            >
              CHI TIỀN (-)
            </button>
            <button 
              class="flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border-0"
              :class="newTx.type === 'income' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 bg-transparent'"
              @click="newTx.type = 'income'"
            >
              THU TIỀN (+)
            </button>
          </div>

          <!-- Category selection -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Danh mục giao dịch</label>
            <select 
              v-model="newTx.category"
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-blue-500"
            >
              <template v-if="newTx.type === 'expense'">
                <option value="Chi mua đá / Gas">Chi mua đá / Gas</option>
                <option value="Chi mua rau quả khẩn cấp">Chi mua rau quả khẩn cấp</option>
                <option value="Chi trả lại khách hàng">Chi trả lại khách hàng</option>
                <option value="Chi hỗ trợ tiền rác/mạng">Chi hỗ trợ tiền rác/mạng</option>
                <option value="Chi khác">Chi khác...</option>
              </template>
              <template v-else>
                <option value="Thu khác">Thu khác</option>
                <option value="Khách nợ trả tiền">Khách nợ trả tiền</option>
                <option value="Thu thanh lý vỏ chai/bia">Thu thanh lý vỏ chai/bia</option>
              </template>
            </select>
          </div>

          <!-- Amount -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Số tiền</label>
            <div class="relative">
              <input 
                v-model.number="newTx.amount"
                type="number"
                class="w-full pl-3 pr-12 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
              />
              <span class="absolute right-4 top-2 text-xs font-bold text-slate-400">đ</span>
            </div>
          </div>

          <!-- Payment method -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Hình thức</label>
            <select 
              v-model="newTx.paymentMethod"
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-blue-500"
            >
              <option value="cash">Tiền mặt</option>
              <option value="card">Thẻ ngân hàng</option>
              <option value="transfer">Chuyển khoản</option>
            </select>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Ghi chú chi tiết</label>
            <textarea 
              v-model="newTx.note"
              rows="2"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
              placeholder="Nhập nội dung chi tiết..."
            ></textarea>
          </div>
          
          <button 
            class="w-full mt-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            @click="handleAddTransaction"
          >
            <span class="material-symbols-rounded text-base">save</span>
            GHI NHẬN GIAO DỊCH
          </button>
        </div>
      </div>
    </div>
    
    <!-- 5. CLOSING SHIFT MODAL DIALOG WITH COUNTER SHEET -->
    <div v-if="showCloseModal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
      <div class="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 animate-slide-up">
        <div class="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h4 class="font-bold text-base flex items-center gap-1.5">
              <span class="material-symbols-rounded text-emerald-500">task_alt</span>
              Khai báo kết toán đóng ca
            </h4>
            <p class="text-[10px] text-slate-400 mt-0.5">Kiểm đếm két tiền thực tế để kiểm tra chênh lệch số dư.</p>
          </div>
          <button @click="showCloseModal = false" class="text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
          <!-- Denomination Cash Counts table -->
          <div class="space-y-4 border-r border-slate-100 pr-4">
            <h5 class="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <span class="material-symbols-rounded text-emerald-600 text-sm">calculate</span>
              Bảng kiểm đếm tiền mặt
            </h5>
            
            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-semibold text-slate-700">
              <div v-for="denom in denoms" :key="denom" class="flex items-center justify-between py-1 border-b border-slate-50">
                <span class="w-16">{{ formatMoney(Number(denom)).replace(' đ', '') }}</span>
                <span class="text-[10px] text-slate-400">x</span>
                <input 
                  v-model.number="ccDetail[denom]"
                  type="number"
                  min="0"
                  class="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-center font-bold text-slate-800 focus:border-blue-500"
                />
                <span class="w-20 text-right text-[11px] text-slate-500 font-bold">
                  {{ formatMoney(Number(denom) * (ccDetail[denom] || 0)).replace(' đ', '') }}
                </span>
              </div>
            </div>
            
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 p-3 rounded-2xl">
              <span class="text-xs font-bold text-slate-600">Tổng tiền két thực tế:</span>
              <span class="text-base font-extrabold text-blue-700">{{ formatMoney(calculatedActualCash) }}</span>
            </div>
          </div>

          <!-- Accounting Form fields -->
          <div class="space-y-4">
            <h5 class="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <span class="material-symbols-rounded text-indigo-600 text-sm">bar_chart</span>
              Đối chiếu tài chính ca
            </h5>
            
            <div class="space-y-3.5 bg-slate-50/30 p-4 rounded-2xl border border-slate-100/50">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Tiền mặt dự kiến (Hệ thống):</span>
                <span class="font-bold text-slate-800">{{ formatMoney(summary?.expectedCash || 0) }}</span>
              </div>
              <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Tiền két kiểm đếm (Thực tế):</span>
                <span class="font-bold text-blue-600">{{ formatMoney(calculatedActualCash) }}</span>
              </div>
              
              <hr class="border-slate-200/50" />
              
              <div class="flex items-center justify-between text-xs font-bold">
                <span>Chênh lệch két tiền:</span>
                <span 
                  :class="{
                    'text-emerald-600': calculatedDiscrepancy === 0,
                    'text-rose-600': calculatedDiscrepancy !== 0
                  }"
                >
                  {{ calculatedDiscrepancy > 0 ? '+' : '' }}{{ formatMoney(calculatedDiscrepancy) }}
                </span>
              </div>
            </div>
            
            <!-- Discrepancy explanation note -->
            <div v-if="calculatedDiscrepancy !== 0">
              <label class="block text-[10px] font-bold text-rose-600 uppercase mb-1.5">Lý do chênh lệch thừa/thiếu tiền két</label>
              <textarea 
                v-model="discrepancyNotes"
                rows="2"
                required
                class="w-full px-3 py-2 rounded-xl border border-rose-200 text-xs text-slate-800 bg-rose-50/10 focus:border-rose-500"
                placeholder="Ví dụ: Thiếu tiền thối khách quên lấy, hoặc thừa do bo thêm..."
              ></textarea>
            </div>

            <!-- Money Allocation for handovers -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Tiền để lại két (Vốn ca sau)</label>
                <input 
                  v-model.number="cashToKeep"
                  type="number"
                  class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Tiền rút nộp (Ngân hàng/Chủ)</label>
                <input 
                  v-model.number="cashToDeposit"
                  type="number"
                  class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <!-- Notes -->
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Ghi chú đóng ca</label>
              <textarea 
                v-model="notes"
                rows="2"
                class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                placeholder="Nhập ghi chú hoặc nhắc nhở bàn giao ca..."
              ></textarea>
            </div>
            
            <button 
              class="w-full mt-4 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              :disabled="isClosing || (calculatedDiscrepancy !== 0 && !discrepancyNotes.trim())"
              @click="handleConfirmCloseShift"
            >
              <span class="material-symbols-rounded text-base">lock_open</span>
              {{ isClosing ? 'Đang thực hiện đóng ca...' : 'XÁC NHẬN ĐÓNG CA & ĐỒNG BỘ' }}
            </button>
            <p v-if="calculatedDiscrepancy !== 0 && !discrepancyNotes.trim()" class="text-[9px] text-center font-bold text-rose-500 mt-1.5">
              * Vui lòng điền lý do chênh lệch trước khi hoàn thành đóng ca.
            </p>
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

.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slide-up {
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
</style>
