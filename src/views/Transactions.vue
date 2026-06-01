<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useCategoriesStore } from '../stores/categories';
import { useSettingsStore } from '../stores/settings';
import { uploadFileToCloud, deleteFileFromCloud } from '../services/api';
import { formatMoney, showToast, showConfirm } from '../utils';

// State & Stores
const shiftStore = useShiftStore();
const categoriesStore = useCategoriesStore();
const settingsStore = useSettingsStore();

const activeTab = ref<'transactions' | 'invoices'>('transactions');

// Filters
const filterSearch = ref('');
const filterType = ref<'all' | 'income' | 'expense'>('all');
const filterPayment = ref<'all' | 'cash' | 'card' | 'transfer'>('all');

// Modals state
const showTxModal = ref(false);
const txModalType = ref<'income' | 'expense'>('income');
const editingTxId = ref<string | null>(null);

const txCategory = ref('');
const showNewCategoryInput = ref(false);
const newCategoryName = ref('');
const txAmountInput = ref('');
const txPaymentMethod = ref<'cash' | 'card' | 'transfer'>('cash');
const txNote = ref('');

// Other Tx Modal State
const showOtherTxModal = ref(false);
const otherType = ref<'income' | 'expense'>('income');
const otherAmount = ref('');
const otherCategory = ref('');
const otherNote = ref('');

// Upload Progress
const isUploading = ref(false);
const uploadPercent = ref(0);
const uploadStatusText = ref('');
const uploadCategory = ref<'income' | 'expense' | 'debt'>('income');
const fileInputRef = ref<HTMLInputElement | null>(null);

// Preview Modal State
const showPreviewModal = ref(false);
const previewInvoice = ref<any>(null);

// Helper formats
function formatTime(isoString: string) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Math expression parser
const amountPlaceholder = computed(() => {
  return 'VD: 500000 hoặc 500k + 250k';
});

const parsedAmountPreview = computed(() => {
  if (!txAmountInput.value) return 0;
  return evaluateExpression(txAmountInput.value);
});

function evaluateExpression(val: string): number {
  if (!val) return 0;
  let cleaned = val.toLowerCase().replace(/k/g, '*1000');
  cleaned = cleaned.replace(/[^0-9+\-*/().\s]/g, '');
  try {
    const fn = new Function(`return ${cleaned}`);
    const res = fn();
    return typeof res === 'number' && !isNaN(res) && isFinite(res) ? Math.round(res) : 0;
  } catch (e) {
    return 0;
  }
}

// Computeds
const filteredTransactions = computed(() => {
  const current = shiftStore.currentShift;
  if (!current) return [];
  
  const txs = current.transactions || [];
  return txs.filter(tx => {
    if (filterType.value !== 'all' && tx.type !== filterType.value) return false;
    if (filterPayment.value !== 'all' && tx.paymentMethod !== filterPayment.value) return false;
    
    if (filterSearch.value) {
      const q = filterSearch.value.toLowerCase();
      const matchCat = (tx.category || '').toLowerCase().includes(q);
      const matchNote = (tx.note || '').toLowerCase().includes(q);
      const matchAmt = String(tx.amount).includes(q);
      return matchCat || matchNote || matchAmt;
    }
    return true;
  });
});

const totalFiltered = computed(() => {
  return filteredTransactions.value.reduce((sum, tx) => {
    return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
  }, 0);
});

const availableCategories = computed(() => {
  const cats = categoriesStore.categories;
  return txModalType.value === 'income' ? cats.income : cats.expense;
});

// Watch category selection
function onCategoryChange() {
  if (txCategory.value === '__new__') {
    showNewCategoryInput.value = true;
    newCategoryName.value = '';
  } else {
    showNewCategoryInput.value = false;
  }
}

// Actions
function triggerAddIncome() {
  txModalType.value = 'income';
  editingTxId.value = null;
  txCategory.value = availableCategories.value[0] || '';
  showNewCategoryInput.value = false;
  txAmountInput.value = '';
  txPaymentMethod.value = 'cash';
  txNote.value = '';
  showTxModal.value = true;
}

function triggerAddExpense() {
  txModalType.value = 'expense';
  editingTxId.value = null;
  txCategory.value = availableCategories.value[0] || '';
  showNewCategoryInput.value = false;
  txAmountInput.value = '';
  txPaymentMethod.value = 'cash';
  txNote.value = '';
  showTxModal.value = true;
}

function triggerEditTx(tx: any) {
  txModalType.value = tx.type;
  editingTxId.value = tx.id;
  txCategory.value = tx.category;
  showNewCategoryInput.value = false;
  txAmountInput.value = String(tx.amount);
  txPaymentMethod.value = tx.paymentMethod || 'cash';
  
  // Extract math comment
  const noteMatch = (tx.note || '').match(/\[(.*)\]$/);
  if (noteMatch) {
    txNote.value = tx.note.replace(noteMatch[0], '').trim();
  } else {
    txNote.value = tx.note || '';
  }
  showTxModal.value = true;
}

function handleAddCategory() {
  const name = newCategoryName.value.trim();
  if (!name) {
    showToast('Vui lòng nhập tên danh mục', 'warning');
    return;
  }
  
  const success = categoriesStore.addCategory(txModalType.value, name);
  if (success) {
    txCategory.value = name;
    showNewCategoryInput.value = false;
    showToast(`Đã thêm danh mục: ${name}`, 'success');
  } else {
    showToast('Danh mục đã tồn tại', 'warning');
  }
}

function saveTxModal() {
  if (txCategory.value === '__new__' && !newCategoryName.value.trim()) {
    showToast('Vui lòng chọn hoặc thêm danh mục mới', 'warning');
    return;
  }
  
  const amount = evaluateExpression(txAmountInput.value);
  if (!amount || amount <= 0) {
    showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
    return;
  }

  const categoryName = txCategory.value === '__new__' ? newCategoryName.value.trim() : txCategory.value;
  
  // Add math comments if expression evaluates
  let finalNote = txNote.value.trim();
  if (txAmountInput.value.includes('+') || txAmountInput.value.includes('-') || txAmountInput.value.includes('*') || txAmountInput.value.toLowerCase().includes('k')) {
    finalNote = (finalNote ? finalNote + ' ' : '') + `[${txAmountInput.value}]`;
  }

  try {
    if (editingTxId.value) {
      shiftStore.editTransaction(editingTxId.value, {
        category: categoryName,
        amount: amount,
        paymentMethod: txPaymentMethod.value,
        note: finalNote
      });
      showToast('Đã cập nhật giao dịch', 'success');
    } else {
      shiftStore.addTransaction({
        type: txModalType.value,
        category: categoryName,
        amount: amount,
        paymentMethod: txPaymentMethod.value,
        note: finalNote
      });
      showToast(`Đã thêm khoản ${txModalType.value === 'income' ? 'thu' : 'chi'}: ${formatMoney(amount)}`, 'success');
    }
    showTxModal.value = false;
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

async function handleDeleteTx(txId: string) {
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa giao dịch này không?', {
    title: 'Xóa giao dịch',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (ok) {
    shiftStore.removeTransaction(txId);
    showToast('Đã xóa giao dịch', 'info');
  }
}

// Other transactions actions
function triggerAddOtherTx() {
  otherType.value = 'income';
  otherAmount.value = '';
  otherCategory.value = '';
  otherNote.value = '';
  showOtherTxModal.value = true;
}

function saveOtherTxModal() {
  const amount = Number(otherAmount.value);
  const cat = otherCategory.value.trim();
  if (!amount || amount <= 0) {
    showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
    return;
  }
  if (!cat) {
    showToast('Vui lòng nhập danh mục', 'warning');
    return;
  }

  try {
    shiftStore.addOtherTransaction({
      type: otherType.value,
      amount: amount,
      category: cat,
      note: otherNote.value.trim()
    });
    showToast('Đã thêm giao dịch khác', 'success');
    showOtherTxModal.value = false;
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

async function handleDeleteOtherTx(txId: string) {
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa giao dịch này không?', {
    title: 'Xóa giao dịch khác',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (ok) {
    shiftStore.removeOtherTransaction(txId);
    showToast('Đã xóa giao dịch khác', 'info');
  }
}

// Invoices / Documents zone
function triggerFileSelect() {
  fileInputRef.value?.click();
}

async function handleFilesSelected(files: FileList | null) {
  if (!files || files.length === 0) return;
  const current = shiftStore.currentShift;
  if (!current) {
    showToast('Vui lòng mở ca trước khi lưu chứng từ', 'warning');
    return;
  }

  isUploading.value = true;
  uploadPercent.value = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 5 * 1024 * 1024) {
      showToast(`${file.name} quá lớn (>5MB)`, 'warning');
      continue;
    }

    uploadPercent.value = Math.round(((i + 0.1) / files.length) * 100);
    uploadStatusText.value = `Đang upload ${file.name}... (${i + 1}/${files.length})`;

    try {
      const fileData = await readFileAsBase64(file);
      const isImage = file.type.startsWith('image/');
      
      const result = await uploadFileToCloud({
        fileName: file.name,
        fileData: fileData,
        mimeType: file.type,
        category: uploadCategory.value,
        user: current.cashierName
      });

      shiftStore.addInvoice({
        name: file.name,
        fileType: isImage ? 'image' : 'pdf',
        data: isImage ? fileData : null,
        driveFileId: result.success ? result.fileId : null,
        driveUrl: result.success ? result.fileUrl : null,
        thumbnailUrl: result.success ? result.thumbnailUrl : null,
        note: uploadCategory.value
      });

      if (result.success) {
        showToast(`Đã tải lên cloud thành công: ${file.name}`, 'success');
      } else {
        showToast(`${file.name} được lưu cục bộ (Offline)`, 'warning');
      }
    } catch (e: any) {
      showToast(`Lỗi upload ${file.name}: ${e.message}`, 'error');
    }
  }

  uploadPercent.value = 100;
  uploadStatusText.value = 'Tải lên hoàn tất!';
  setTimeout(() => {
    isUploading.value = false;
  }, 1000);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Drag & drop handlers
const isDragging = ref(false);
function onDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}
function onDragLeave() {
  isDragging.value = false;
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  if (e.dataTransfer?.files) {
    handleFilesSelected(e.dataTransfer.files);
  }
}

async function handleDeleteInvoice(inv: any) {
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa chứng từ này không?', {
    title: 'Xóa chứng từ',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (!ok) return;

  if (inv.driveFileId) {
    await deleteFileFromCloud(inv.driveFileId).catch(() => {});
  }
  shiftStore.removeInvoice(inv.id);
  showToast('Đã xóa chứng từ', 'info');
}

function viewPreview(inv: any) {
  previewInvoice.value = inv;
  showPreviewModal.value = true;
}

onMounted(() => {
  categoriesStore.loadCategories();
});
</script>

<template>
  <div class="view-content p-6">
    
    <!-- Tab Controls -->
    <div class="flex border-b border-slate-100 mb-6 gap-2 bg-slate-50/50 p-1.5 rounded-2xl max-w-xs">
      <button 
        class="flex-1 py-2 text-xs font-black rounded-xl cursor-pointer border-0 transition-all flex items-center justify-center gap-1.5"
        :class="activeTab === 'transactions' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'"
        @click="activeTab = 'transactions'"
      >
        <span class="material-symbols-rounded text-base">receipt_long</span>
        Thu Chi
      </button>
      <button 
        class="flex-1 py-2 text-xs font-black rounded-xl cursor-pointer border-0 transition-all flex items-center justify-center gap-1.5"
        :class="activeTab === 'invoices' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'"
        @click="activeTab = 'invoices'"
      >
        <span class="material-symbols-rounded text-base">description</span>
        Chứng từ
      </button>
    </div>

    <!-- If no shift is open -->
    <div v-if="!shiftStore.currentShift" class="max-w-md mx-auto mt-12 text-center bg-white p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
      <div class="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
        <span class="material-symbols-rounded text-3xl">lock</span>
      </div>
      <div>
        <h2 class="text-xl font-bold text-slate-800">Chưa mở ca làm việc</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">Bạn cần mở ca làm việc trước khi thực hiện thu chi hay quản lý chứng từ.</p>
      </div>
      <button 
        class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all cursor-pointer shadow-md shadow-blue-500/15"
        @click="shiftStore.loadShifts()"
      >
        Kiểm tra trạng thái ca
      </button>
    </div>

    <!-- ACTIVE TAB: TRANSACTIONS (THU CHI) -->
    <div v-else-if="activeTab === 'transactions'" class="space-y-6 animate-fade-in">
      
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 class="text-lg font-black text-slate-800">Quản lý Thu Chi</h3>
          <p class="text-xs text-slate-400 font-semibold mt-0.5">Ghi nhận các luồng tiền thu chi phát sinh thủ công</p>
        </div>
        <div class="flex gap-2">
          <button 
            class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl border border-emerald-500 transition-all flex items-center gap-1.5 cursor-pointer"
            @click="triggerAddIncome"
          >
            <span class="material-symbols-rounded text-sm">add</span> Thêm khoản Thu
          </button>
          <button 
            class="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl border border-rose-500 transition-all flex items-center gap-1.5 cursor-pointer"
            @click="triggerAddExpense"
          >
            <span class="material-symbols-rounded text-sm">remove</span> Thêm khoản Chi
          </button>
        </div>
      </div>

      <!-- Filters Ribbon -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between flex-wrap gap-4 shadow-xs">
        <div class="flex items-center gap-3 flex-wrap flex-1">
          <input 
            type="text" 
            v-model="filterSearch" 
            class="px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:max-w-xs"
            placeholder="🔍 Tìm danh mục, ghi chú, số tiền..."
          />
          <select 
            v-model="filterType" 
            class="px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
          >
            <option value="all">📋 Tất cả luồng</option>
            <option value="income">↑ Khoản Thu</option>
            <option value="expense">↓ Khoản Chi</option>
          </select>
          <select 
            v-model="filterPayment" 
            class="px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
          >
            <option value="all">💳 Tất cả PTTT</option>
            <option value="cash">💵 Tiền mặt</option>
            <option value="card">💳 Cà thẻ</option>
            <option value="transfer">🔄 Chuyển khoản</option>
          </select>
        </div>
        <div class="text-xs font-black text-slate-500 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100">
          Lọc: <span class="text-slate-800">{{ filteredTransactions.length }} mục</span> · Tổng: 
          <span :class="totalFiltered >= 0 ? 'text-emerald-600' : 'text-rose-600'">
            {{ totalFiltered >= 0 ? '+' : '' }}{{ formatMoney(totalFiltered) }}
          </span>
        </div>
      </div>

      <!-- Transaction List Table Card -->
      <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-xs">
        <div class="p-4 border-b border-slate-50 flex items-center justify-between">
          <h4 class="font-extrabold text-xs text-slate-400 uppercase tracking-wider">Danh sách giao dịch</h4>
        </div>

        <div v-if="filteredTransactions.length === 0" class="p-12 text-center text-slate-400 text-xs font-semibold">
          Không tìm thấy giao dịch nào phù hợp với bộ lọc.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50 text-slate-400 font-bold border-b border-slate-50">
                <th class="p-4">Thời gian</th>
                <th class="p-4">Nguồn</th>
                <th class="p-4">Loại</th>
                <th class="p-4">Danh mục</th>
                <th class="p-4">Thanh toán</th>
                <th class="p-4">Ghi chú</th>
                <th class="p-4 text-right">Số tiền</th>
                <th class="p-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 font-semibold text-slate-700">
              <tr 
                v-for="tx in filteredTransactions.slice().reverse()" 
                :key="tx.id"
                class="hover:bg-slate-50/50 transition-all"
              >
                <td class="p-4 font-mono text-[11px]">{{ formatTime(tx.timestamp) }}</td>
                <td class="p-4">
                  <span 
                    v-if="tx.note && tx.note.includes('[CUKCUK]')"
                    class="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100/40"
                  >
                    🔗 POS
                  </span>
                  <span 
                    v-else 
                    class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100/40"
                  >
                    ✍️ Thủ công
                  </span>
                </td>
                <td class="p-4">
                  <span 
                    class="px-2 py-0.5 rounded-md text-[10px] font-black"
                    :class="tx.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                  >
                    {{ tx.type === 'income' ? 'Thu' : 'Chi' }}
                  </span>
                </td>
                <td class="p-4 font-bold text-slate-800">{{ tx.category }}</td>
                <td class="p-4">
                  <span 
                    class="px-2 py-0.5 rounded-md text-[10px] font-black"
                    :class="{
                      'bg-emerald-50 text-emerald-700 border border-emerald-100/40': tx.paymentMethod === 'cash',
                      'bg-blue-50 text-blue-700 border border-blue-100/40': tx.paymentMethod === 'card',
                      'bg-indigo-50 text-indigo-700 border border-indigo-100/40': tx.paymentMethod === 'transfer'
                    }"
                  >
                    {{ tx.paymentMethod === 'cash' ? '💵 Tiền mặt' : tx.paymentMethod === 'card' ? '💳 Cà thẻ' : '🔄 CK' }}
                  </span>
                </td>
                <td class="p-4 text-slate-400 font-medium">
                  {{ tx.note ? tx.note.replace('[CUKCUK]', '').trim() : '—' }}
                </td>
                <td 
                  class="p-4 text-right font-black tabular-nums"
                  :class="tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'"
                >
                  {{ tx.type === 'income' ? '+' : '−' }}{{ formatMoney(tx.amount) }}
                </td>
                <td class="p-4 text-center">
                  <div class="inline-flex gap-1.5">
                    <button 
                      v-if="!(tx.note && tx.note.includes('[CUKCUK]'))"
                      class="p-1 hover:bg-slate-100 text-indigo-600 rounded-lg transition-all border-0 bg-transparent cursor-pointer"
                      title="Sửa"
                      @click="triggerEditTx(tx)"
                    >
                      <span class="material-symbols-rounded text-lg">edit</span>
                    </button>
                    <button 
                      class="p-1 hover:bg-slate-100 text-rose-600 rounded-lg transition-all border-0 bg-transparent cursor-pointer"
                      title="Xóa"
                      @click="handleDeleteTx(tx.id)"
                    >
                      <span class="material-symbols-rounded text-lg">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Other Transactions (Thu chi khác) -->
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 class="text-sm font-extrabold text-slate-800">Các Khoản Thu Chi Khác</h4>
            <p class="text-[11px] text-slate-400 font-semibold">Thu chi không tính vào doanh thu bán hàng trực tiếp</p>
          </div>
          <button 
            class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-200/30 transition-all flex items-center gap-1.5 cursor-pointer"
            @click="triggerAddOtherTx"
          >
            <span class="material-symbols-rounded text-sm">add</span> Thêm mới
          </button>
        </div>

        <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-xs">
          <div v-if="!shiftStore.currentShift.otherTransactions?.length" class="p-8 text-center text-slate-400 text-xs font-semibold">
            Chưa có khoản thu chi khác nào trong ca hiện tại.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-50 text-slate-400 font-bold border-b border-slate-50">
                  <th class="p-4">Thời gian</th>
                  <th class="p-4">Loại</th>
                  <th class="p-4">Danh mục</th>
                  <th class="p-4">Ghi chú</th>
                  <th class="p-4 text-right">Số tiền</th>
                  <th class="p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 font-semibold text-slate-700">
                <tr 
                  v-for="ot in shiftStore.currentShift.otherTransactions.slice().reverse()" 
                  :key="ot.id"
                  class="hover:bg-slate-50/50 transition-all"
                >
                  <td class="p-4 font-mono text-[11px]">{{ formatTime(ot.timestamp) }}</td>
                  <td class="p-4">
                    <span 
                      class="px-2 py-0.5 rounded-md text-[10px] font-black"
                      :class="ot.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                    >
                      {{ ot.type === 'income' ? 'Thu khác' : 'Chi khác' }}
                    </span>
                  </td>
                  <td class="p-4 font-bold text-slate-800">{{ ot.category }}</td>
                  <td class="p-4 text-slate-400 font-medium">{{ ot.note || '—' }}</td>
                  <td 
                    class="p-4 text-right font-black tabular-nums"
                    :class="ot.type === 'income' ? 'text-emerald-600' : 'text-rose-600'"
                  >
                    {{ ot.type === 'income' ? '+' : '−' }}{{ formatMoney(ot.amount) }}
                  </td>
                  <td class="p-4 text-center">
                    <button 
                      class="p-1 hover:bg-slate-100 text-rose-600 rounded-lg transition-all border-0 bg-transparent cursor-pointer"
                      @click="handleDeleteOtherTx(ot.id)"
                    >
                      <span class="material-symbols-rounded text-lg">delete</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- ACTIVE TAB: INVOICES (CHỨNG TỪ) -->
    <div v-else-if="activeTab === 'invoices'" class="space-y-6 animate-fade-in">
      
      <div>
        <h3 class="text-lg font-black text-slate-800">📑 Chứng từ / Hóa đơn đính kèm</h3>
        <p class="text-xs text-slate-400 font-semibold mt-0.5">Lưu trữ ảnh hóa đơn mua hàng, biên lai lên Google Drive</p>
      </div>

      <!-- Drag and drop zone -->
      <div 
        class="border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3"
        :class="isDragging ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200 bg-white hover:border-indigo-400'"
        @click="triggerFileSelect"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <span class="material-symbols-rounded text-4xl text-indigo-500">cloud_upload</span>
        <div>
          <h4 class="font-bold text-sm text-slate-800">Kéo thả file hình ảnh hoặc PDF vào đây</h4>
          <p class="text-[11px] text-slate-400 mt-1">Hoặc nhấp chuột để chọn tệp từ thiết bị (Tối đa 5MB)</p>
        </div>
        <input 
          type="file" 
          ref="fileInputRef" 
          accept="image/*,application/pdf" 
          multiple 
          class="hidden"
          @change="handleFilesSelected(($event.target as HTMLInputElement).files)"
        />
      </div>

      <!-- Settings zone selection -->
      <div class="max-w-xs">
        <label class="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wide">📂 Danh mục lưu trữ trên Cloud</label>
        <select 
          v-model="uploadCategory" 
          class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
        >
          <option value="income">📂 KHOẢN THU (Income Receipt)</option>
          <option value="expense">📂 KHOẢN CHI (Expense Receipt)</option>
          <option value="debt">📂 HÓA ĐƠN NỢ (Debt Bill)</option>
        </select>
      </div>

      <!-- Uploading progress indicator -->
      <div v-if="isUploading" class="bg-white p-4 rounded-2xl border border-slate-100 space-y-2.5 animate-pulse">
        <div class="flex items-center justify-between text-xs font-bold text-slate-600">
          <span>{{ uploadStatusText }}</span>
          <span>{{ uploadPercent }}%</span>
        </div>
        <div class="w-full bg-slate-50 h-2 rounded-full overflow-hidden border border-slate-100/50">
          <div class="h-full bg-indigo-600 transition-all duration-300" :style="{ width: `${uploadPercent}%` }"></div>
        </div>
      </div>

      <!-- Stored file Grid -->
      <div class="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
        <h4 class="font-extrabold text-xs text-slate-400 uppercase tracking-wider">
          Chứng từ đã lưu ({{ shiftStore.currentShift.invoices?.length || 0 }})
        </h4>

        <div v-if="!shiftStore.currentShift.invoices?.length" class="p-8 text-center text-slate-400 text-xs font-semibold">
          Chưa đính kèm chứng từ nào trong ca hiện tại.
        </div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div 
            v-for="inv in shiftStore.currentShift.invoices" 
            :key="inv.id"
            class="group border border-slate-100 rounded-2xl overflow-hidden hover:shadow-md transition-all flex flex-col bg-slate-50/20"
          >
            <!-- Preview Box -->
            <div 
              class="aspect-square bg-slate-50 border-b border-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center group-hover:opacity-90"
              @click="viewPreview(inv)"
            >
              <img 
                v-if="inv.thumbnailUrl || (inv.data && inv.fileType !== 'pdf')" 
                :src="inv.thumbnailUrl || inv.data" 
                :alt="inv.name" 
                class="w-full h-full object-cover"
                loading="lazy"
              />
              <span v-else class="material-symbols-rounded text-3xl text-indigo-500">
                {{ inv.fileType === 'pdf' ? 'picture_as_pdf' : 'description' }}
              </span>

              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span class="text-white text-xs font-black bg-black/60 px-3 py-1 rounded-full">Xem trước</span>
              </div>
            </div>

            <!-- Card Info -->
            <div class="p-3 flex-1 flex flex-col justify-between gap-2.5">
              <div>
                <span class="block text-[11px] font-black text-slate-800 truncate" :title="inv.name">{{ inv.name }}</span>
                <div class="flex items-center justify-between text-[9px] text-slate-400 font-bold mt-1">
                  <span>{{ formatTime(inv.timestamp) }}</span>
                  <span class="uppercase tracking-wider px-1 bg-slate-100 text-slate-500 rounded">{{ inv.note || 'khác' }}</span>
                </div>
              </div>
              
              <!-- Action Button Row -->
              <div class="flex items-center justify-between border-t border-slate-100/60 pt-2 shrink-0">
                <span class="text-[10px]">{{ inv.driveUrl ? '☁️ Cloud' : '💾 Local' }}</span>
                <div class="flex gap-1">
                  <a 
                    v-if="inv.driveUrl" 
                    :href="inv.driveUrl" 
                    target="_blank" 
                    class="p-1 hover:bg-slate-100 text-indigo-600 rounded-lg transition-all"
                    title="Mở Google Drive"
                  >
                    <span class="material-symbols-rounded text-base">open_in_new</span>
                  </a>
                  <button 
                    class="p-1 hover:bg-slate-100 text-rose-600 rounded-lg transition-all border-0 bg-transparent cursor-pointer"
                    title="Xóa"
                    @click="handleDeleteInvoice(inv)"
                  >
                    <span class="material-symbols-rounded text-base">delete</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>

    <!-- MODAL 1: ADD/EDIT TRANSACTION -->
    <div v-if="showTxModal" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-fade-in p-6 space-y-4">
        
        <div class="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div 
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            :class="txModalType === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'"
          >
            <span class="material-symbols-rounded text-xl">
              {{ editingTxId ? 'edit' : (txModalType === 'income' ? 'add_circle' : 'remove_circle') }}
            </span>
          </div>
          <div>
            <h4 class="font-extrabold text-sm text-slate-800">
              {{ editingTxId ? 'Sửa giao dịch' : (txModalType === 'income' ? 'Thêm khoản Thu' : 'Thêm khoản Chi') }}
            </h4>
            <p class="text-[10px] text-slate-400 font-semibold">Nhập các chi tiết liên quan đến lượng tiền mặt</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Category -->
          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Danh mục</label>
            <select 
              v-model="txCategory" 
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
              @change="onCategoryChange"
            >
              <option 
                v-for="cat in availableCategories" 
                :key="cat" 
                :value="cat"
              >
                {{ cat }}
              </option>
              <option value="__new__" class="text-amber-600 font-bold">➕ Thêm danh mục mới...</option>
            </select>
          </div>

          <!-- New Category Inline Input -->
          <div v-if="showNewCategoryInput" class="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex gap-2">
            <input 
              type="text" 
              v-model="newCategoryName" 
              class="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              placeholder="Tên danh mục mới..."
              @keydown.enter.prevent="handleAddCategory"
            />
            <button 
              class="px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl border border-indigo-600 transition-all cursor-pointer"
              @click="handleAddCategory"
            >
              Thêm
            </button>
          </div>

          <!-- Input Amount -->
          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Số tiền (VNĐ)</label>
            <input 
              type="text" 
              v-model="txAmountInput" 
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
              :placeholder="amountPlaceholder"
              autofocus
            />
            <!-- Math parse preview indicator -->
            <div 
              v-if="parsedAmountPreview > 0" 
              class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50 inline-block mt-1"
            >
              = {{ formatMoney(parsedAmountPreview) }}
            </div>
          </div>

          <!-- Payment Method -->
          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Phương thức thanh toán</label>
            <div class="grid grid-cols-3 gap-2">
              <button 
                v-for="pm in ['cash', 'card', 'transfer'] as const"
                :key="pm"
                class="py-2 text-xs font-bold rounded-xl transition-all border cursor-pointer"
                :class="txPaymentMethod === pm ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100'"
                @click="txPaymentMethod = pm"
              >
                {{ pm === 'cash' ? '💵 Mặt' : pm === 'card' ? '💳 Thẻ' : '🔄 CK' }}
              </button>
            </div>
          </div>

          <!-- Note -->
          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Ghi chú</label>
            <input 
              type="text" 
              v-model="txNote" 
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              placeholder="VD: Bàn số 5, mua nước ngọt lẻ..."
            />
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button 
            class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-transparent cursor-pointer"
            @click="showTxModal = false"
          >
            Hủy
          </button>
          <button 
            class="flex-1 py-2.5 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
            :class="txModalType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'"
            @click="saveTxModal"
          >
            {{ editingTxId ? 'Cập nhật' : 'Lưu giao dịch' }}
          </button>
        </div>

      </div>
    </div>

    <!-- MODAL 2: ADD OTHER TRANSACTION -->
    <div v-if="showOtherTxModal" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-fade-in p-6 space-y-4">
        
        <div class="flex items-center gap-3 border-b border-slate-50 pb-3">
          <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <span class="material-symbols-rounded text-xl">note_add</span>
          </div>
          <div>
            <h4 class="font-extrabold text-sm text-slate-800">Thêm khoản Thu/Chi Khác</h4>
            <p class="text-[10px] text-slate-400 font-semibold">Thu chi nằm ngoài nguồn doanh thu dịch vụ trực tiếp</p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500">Loại luồng</label>
              <select 
                v-model="otherType" 
                class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="income">↑ Thu khác</option>
                <option value="expense">↓ Chi khác</option>
              </select>
            </div>
            
            <div class="space-y-1">
              <label class="block text-xs font-bold text-slate-500">Số tiền</label>
              <input 
                type="number" 
                v-model="otherAmount" 
                class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                placeholder="0"
              />
            </div>
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Danh mục</label>
            <input 
              type="text" 
              v-model="otherCategory" 
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
              placeholder="VD: Tiền tip, Thu hồi nợ cũ, Đền bù..."
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-500">Ghi chú chi tiết</label>
            <input 
              type="text" 
              v-model="otherNote" 
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              placeholder="Nhập chi tiết..."
            />
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button 
            class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-transparent cursor-pointer"
            @click="showOtherTxModal = false"
          >
            Hủy
          </button>
          <button 
            class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
            @click="saveOtherTxModal"
          >
            Lưu giao dịch
          </button>
        </div>

      </div>
    </div>

    <!-- MODAL 3: PREVIEW DOCUMENT OVERLAY -->
    <div v-if="showPreviewModal && previewInvoice" class="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in p-6 space-y-4">
        
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 class="font-extrabold text-sm text-slate-800">{{ previewInvoice.name }}</h4>
            <p class="text-[10px] text-slate-400 font-semibold">Tải lên lúc: {{ new Date(previewInvoice.timestamp).toLocaleString('vi-VN') }}</p>
          </div>
          <button 
            class="p-1 hover:bg-slate-100 text-slate-500 rounded-lg border-0 bg-transparent cursor-pointer"
            @click="showPreviewModal = false"
          >
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="flex items-center justify-center bg-slate-50 p-2 rounded-2xl border border-slate-100/60 min-h-[300px]">
          <iframe 
            v-if="previewInvoice.fileType === 'pdf'" 
            :src="previewInvoice.driveUrl || previewInvoice.data" 
            class="w-full h-[55vh] border-0 rounded-xl"
          ></iframe>
          <img 
            v-else 
            :src="previewInvoice.driveUrl || previewInvoice.data" 
            :alt="previewInvoice.name" 
            class="max-w-full max-h-[55vh] object-contain rounded-xl shadow-xs"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-50">
          <a 
            v-if="previewInvoice.driveUrl"
            :href="previewInvoice.driveUrl" 
            target="_blank" 
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all text-decoration-none"
          >
            <span class="material-symbols-rounded text-sm">open_in_new</span> Mở trên Drive
          </a>
          <button 
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-transparent cursor-pointer"
            @click="showPreviewModal = false"
          >
            Đóng
          </button>
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
</style>
