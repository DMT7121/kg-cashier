<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { useCategoriesStore } from '../stores/categories';
import { useAppStore } from '../stores/app';
import { getShiftsFromCloud, getCukcukInvoicesFromCloud } from '../services/api';
import { getInvoicesByShiftTime, mergeCloudInvoices } from '../services/invoiceStore';
import { syncInvoicesForDate } from '../integration/cukcuk';
import { 
  formatCurrency, 
  formatDate, 
  formatTime, 
  showConfirm, 
  showPasswordPrompt, 
  showToast, 
  denominations 
} from '../utils';
import { Shift, ShiftSummary } from '../types/shift';

// Pinia Stores
const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();
const categoriesStore = useCategoriesStore();
const appStore = useAppStore();

// Search and Filter States
const searchQuery = ref('');
const filterShiftNumber = ref('');

// Details Modal States
const selectedShift = ref<Shift | null>(null);
const activeTab = ref<'sum' | 'tx' | 'pos' | 'cash' | 'drink'>('sum');
const activeInvoices = ref<any[]>([]);
const activeInvoicesFromLive = ref(false);
const isSyncingCukcuk = ref(false);

// Edit Modals Visibility and Local Form States
const showEditStartingCashModal = ref(false);
const newStartingCash = ref<number>(0);

const showEditNotesModal = ref(false);
const newNotes = ref<string>('');

const showEditTxModal = ref(false);
const editingTx = ref<any | null>(null);
const txType = ref<'income' | 'expense'>('income');
const txCategory = ref<string>('');
const txAmount = ref<number | string>('');
const txPaymentMethod = ref<'cash' | 'card' | 'transfer'>('cash');
const txNote = ref<string>('');

const showEditOtherTxModal = ref(false);
const otherTxType = ref<'income' | 'expense'>('income');
const otherTxCategory = ref<string>('');
const otherTxAmount = ref<number | string>('');
const otherTxNote = ref<string>('');

const showEditCashCountModal = ref(false);
const cashCountPins = ref<Record<string, number>>({});
const cashCountKeeps = ref<Record<string, number>>({});
const cashCountHands = ref<Record<string, number>>({});

const showEditDrinkModal = ref(false);
const drinkActualCounts = ref<Record<string, number>>({});

const showEditInvoicePaymentModal = ref(false);
const editingInvoice = ref<any | null>(null);
const invoicePayments = ref<{ method: 'cash' | 'card' | 'transfer'; amount: number }[]>([]);

// History Shift Summaries Cache
const summaries = ref<Record<string, ShiftSummary>>({});
const isSyncingCloud = ref(false);

// ── Lifecycle & Loading ──
onMounted(async () => {
  categoriesStore.loadCategories();
  await loadSummaries();
});

// Helper: Normalize dates like 'dd/mm/yyyy' or ISO
const normalizeDate = (dStr: string | null | undefined): string => {
  if (!dStr) return '';
  if (dStr.includes('/')) {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return dStr;
};

// Deduplicate shifts using compound key (normDate + shiftNumber + cashierName)
const dedupedShifts = computed(() => {
  const seen: Record<string, boolean> = {};
  return shiftStore.shifts.filter(sh => {
    const normDate = normalizeDate(sh.date);
    const key = `${normDate}_${sh.shiftNumber || ''}_${sh.cashierName || ''}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
});

// Filter list based on search term & shift number
const filteredShifts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const shiftNum = filterShiftNumber.value;
  
  let list = dedupedShifts.value;
  
  if (q) {
    list = list.filter(sh => 
      (sh.cashierName || '').toLowerCase().includes(q) ||
      (sh.date || '').toLowerCase().includes(q) ||
      (sh.notes || '').toLowerCase().includes(q)
    );
  }
  
  if (shiftNum) {
    list = list.filter(sh => String(sh.shiftNumber) === shiftNum);
  }
  
  return list;
});

// Fetch/recalculate summaries asynchronously
async function loadSummaries() {
  for (const sh of filteredShifts.value) {
    if (!summaries.value[sh.id]) {
      const sm = await shiftStore.getHistorySummary(sh);
      if (sm) {
        summaries.value[sh.id] = sm;
      }
    }
  }
}

watch(filteredShifts, async () => {
  await loadSummaries();
}, { immediate: true, deep: true });

// Refetches dynamic details (e.g. invoices) when active shift or tab changes
watch([selectedShift, activeTab], async () => {
  if (selectedShift.value && activeTab.value === 'pos') {
    await loadActiveInvoices();
  }
});

// ── Invoices Tab Logic ──
async function loadActiveInvoices() {
  const sh = selectedShift.value;
  if (!sh) {
    activeInvoices.value = [];
    activeInvoicesFromLive.value = false;
    return;
  }
  
  if (sh.cukcukInvoicesSnapshot && sh.cukcukInvoicesSnapshot.length > 0) {
    activeInvoices.value = sh.cukcukInvoicesSnapshot;
    activeInvoicesFromLive.value = false;
  } else if (sh.date) {
    try {
      // Automatically pull invoices from cloud to ensure local DB has the latest data
      try {
        const cloudRes = await getCukcukInvoicesFromCloud({ workDate: sh.date });
        if (cloudRes && cloudRes.success && Array.isArray(cloudRes.invoices)) {
          await mergeCloudInvoices(cloudRes.invoices);
        }
      } catch (cloudErr) {
        console.warn('[ShiftHistory] Failed to pull invoices from cloud:', cloudErr);
      }

      const liveInvs = await getInvoicesByShiftTime(sh.date, sh.startTime, sh.endTime || undefined);
      if (liveInvs && liveInvs.length > 0) {
        activeInvoices.value = liveInvs;
        activeInvoicesFromLive.value = true;
      } else {
        activeInvoices.value = [];
        activeInvoicesFromLive.value = false;
      }
    } catch (e) {
      activeInvoices.value = [];
      activeInvoicesFromLive.value = false;
    }
  } else {
    activeInvoices.value = [];
    activeInvoicesFromLive.value = false;
  }
}

// Compute invoice diff for supplemental reports
const invoiceDiff = computed(() => {
  const diff = { added: [] as string[], removed: [] as any[], modified: [] as string[] };
  const sh = selectedShift.value;
  if (!sh) return diff;
  const invoices = activeInvoices.value;
  const isSupplemental = !!sh.originalSummarySnapshot;
  
  if (isSupplemental && sh.originalCukcukInvoicesSnapshot) {
    const origMap: Record<string, any> = {};
    sh.originalCukcukInvoicesSnapshot.forEach((inv) => {
      origMap[inv.refId] = inv;
    });
    
    const curMap: Record<string, any> = {};
    invoices.forEach((inv) => {
      curMap[inv.refId] = inv;
    });
    
    invoices.forEach((inv) => {
      const orig = origMap[inv.refId];
      if (!orig) {
        diff.added.push(inv.refId);
      } else {
        const amtDiff = inv.amount !== orig.amount;
        const payDiff = JSON.stringify(inv.payments) !== JSON.stringify(orig.payments);
        if (amtDiff || payDiff) {
          diff.modified.push(inv.refId);
        }
      }
    });
    
    sh.originalCukcukInvoicesSnapshot.forEach((inv) => {
      if (!curMap[inv.refId]) {
        diff.removed.push(inv);
      }
    });
  }
  return diff;
});

// Total of active list invoices
const activeInvoicesTotal = computed(() => {
  let total = 0;
  activeInvoices.value.forEach(inv => {
    let amt = 0;
    (inv.payments || []).forEach((p: any) => { amt += p.amount || 0; });
    if (!amt) amt = inv.amount || 0;
    total += amt;
  });
  return total;
});

// ── Detail Helper Values & Diff Display ──
const isSupplemental = computed(() => !!selectedShift.value?.originalSummarySnapshot);

const activeSummary = computed<ShiftSummary | null>(() => {
  if (!selectedShift.value) return null;
  return summaries.value[selectedShift.value.id] || null;
});

function getFieldDiffClass(fieldName: keyof ShiftSummary) {
  if (!isSupplemental.value || !selectedShift.value || !activeSummary.value) return '';
  const sm = activeSummary.value;
  const orig = selectedShift.value.originalSummarySnapshot;
  if (!sm || !orig) return '';
  return sm[fieldName] !== orig[fieldName] ? 'text-emerald-500 font-bold' : '';
}

// ── Shift Management Actions ──
async function viewShiftDetail(shift: Shift) {
  selectedShift.value = shift;
  activeTab.value = 'sum';
  await loadActiveInvoices();
}

async function deleteShift(shiftId: string) {
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa ca này khỏi lịch sử không?', {
    title: 'Xóa ca làm việc',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (ok) {
    try {
      await shiftStore.deleteShiftFromHistory(shiftId);
      showToast('Đã xóa ca thành công', 'success');
      delete summaries.value[shiftId];
      if (selectedShift.value?.id === shiftId) {
        selectedShift.value = null;
      }
      await loadSummaries();
    } catch (e: any) {
      showToast('Lỗi khi xóa ca: ' + e.message, 'error');
    }
  }
}

async function rebuildSnapshots() {
  showToast('Đang quét tự phục hồi và tối ưu hóa số liệu lịch sử...', 'info');
  try {
    const count = await shiftStore.healPastShiftsData();
    if (count > 0) {
      showToast(`✅ Đã tự động phục hồi và tối ưu hóa số liệu ${count} ca thành công!`, 'success');
      summaries.value = {};
      await loadSummaries();
    } else {
      showToast('Số liệu lịch sử đã ở trạng thái tối ưu, không cần phục hồi.', 'info');
    }
  } catch (e: any) {
    showToast('Lỗi phục hồi dữ liệu: ' + e.message, 'error');
  }
}

async function syncWithCloud() {
  showToast('Đang đồng bộ...', 'info');
  isSyncingCloud.value = true;
  try {
    const result = await getShiftsFromCloud();
    if (result.success && result.shifts) {
      const cloudShifts = result.shifts;
      let newCount = 0;
      for (const sh of cloudShifts) {
        const exists = shiftStore.shifts.some(s => s.id === sh.id);
        if (!exists) {
          try {
            shiftStore.shifts.push(sh);
            newCount++;
          } catch (e) {}
        }
      }
      if (newCount > 0) {
        await shiftStore.save();
      }
      showToast(`Đã đồng bộ ${cloudShifts.length} ca từ Cloud. Thêm mới ${newCount} ca.`, 'success');
      summaries.value = {};
      await loadSummaries();
    } else {
      showToast('Không thể đồng bộ: ' + (result.message || 'Lỗi'), 'error');
    }
  } catch (e: any) {
    showToast('Lỗi đồng bộ: ' + e.message, 'error');
  } finally {
    isSyncingCloud.value = false;
  }
}

function exportHistoryCSV() {
  const list = filteredShifts.value;
  if (list.length === 0) {
    showToast('Không có dữ liệu', 'warning');
    return;
  }
  let csv = 'Ngày,Ca,Thu ngân,Doanh thu,Chi phí,Bills,Chênh lệch,Ghi chú\n';
  list.forEach(sh => {
    const sm = summaries.value[sh.id] || { totalIncome: 0, totalExpense: 0, billCount: 0, discrepancy: 0 };
    csv += `"${sh.date}","${sh.shiftNumber}","${(sh.cashierName || '').replace(/"/g, '""')}",${sm.totalIncome},${sm.totalExpense},${sm.billCount},${sm.discrepancy},"${(sh.notes || '').replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  const blobUrl = URL.createObjectURL(blob);
  a.href = blobUrl;
  a.download = `shift-history-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

async function reopenShift(sh: Shift) {
  const password = await showPasswordPrompt(
    'Bạn có muốn mở lại ca này không? Vui lòng nhập mật khẩu quản lý để xác nhận.',
    { title: 'Mở lại ca', placeholder: 'Mật khẩu quản lý...' }
  );
  if (password === null) return;
  if (!password) {
    showToast('⚠️ Mật khẩu không được để trống!', 'warning');
    return;
  }
  try {
    await shiftStore.reopenShiftById(sh.id, password);
    showToast('Đã mở lại ca thành công!', 'success');
    selectedShift.value = null;
    appStore.navigateTo('dashboard');
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

function printHandoverReport(sh: Shift) {
  selectedShift.value = null;
  (window as any)._reportDate = sh.date;
  (window as any)._setReportShiftId = () => sh.id;
  (window as any)._historyReportMode = true;
  appStore.navigateTo('revenue');
}

// ── Edit Modals Actions ──

// Starting Cash
function openEditStartingCash() {
  if (!selectedShift.value) return;
  newStartingCash.value = selectedShift.value.startingCash;
  showEditStartingCashModal.value = true;
}
async function saveStartingCash() {
  if (!selectedShift.value) return;
  try {
    await shiftStore.updateHistoryShiftField(selectedShift.value.id, 'startingCash', newStartingCash.value);
    showEditStartingCashModal.value = false;
    showToast('Đã cập nhật tiền đầu ca', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) summaries.value[updated.id] = sm;
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

// Notes
function openEditNotes() {
  if (!selectedShift.value) return;
  newNotes.value = selectedShift.value.notes || '';
  showEditNotesModal.value = true;
}
async function saveNotes() {
  if (!selectedShift.value) return;
  try {
    await shiftStore.updateHistoryShiftField(selectedShift.value.id, 'notes', newNotes.value);
    showEditNotesModal.value = false;
    showToast('Đã cập nhật ghi chú', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) selectedShift.value = updated;
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

// Transactions (Add/Edit)
const categoryList = computed(() => {
  return txType.value === 'income' ? categoriesStore.categories.income : categoriesStore.categories.expense;
});

function openAddTx(type: 'income' | 'expense') {
  if (!selectedShift.value) return;
  editingTx.value = null;
  txType.value = type;
  txCategory.value = categoryList.value[0] || '';
  txAmount.value = '';
  txPaymentMethod.value = 'cash';
  txNote.value = '';
  showEditTxModal.value = true;
}
function openEditTx(tx: any) {
  if (!selectedShift.value) return;
  editingTx.value = tx;
  txType.value = tx.type;
  txCategory.value = tx.category;
  txAmount.value = tx.amount;
  txPaymentMethod.value = tx.paymentMethod || 'cash';
  txNote.value = tx.note || '';
  showEditTxModal.value = true;
}
async function saveTx() {
  if (!selectedShift.value) return;
  const amt = Number(txAmount.value);
  if (!amt || amt <= 0) {
    showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
    return;
  }
  try {
    if (editingTx.value) {
      await shiftStore.editHistoryTransaction(selectedShift.value.id, editingTx.value.id, {
        category: txCategory.value,
        amount: amt,
        paymentMethod: txPaymentMethod.value,
        note: txNote.value
      });
    } else {
      await shiftStore.addHistoryTransaction(selectedShift.value.id, {
        type: txType.value,
        category: txCategory.value,
        amount: amt,
        paymentMethod: txPaymentMethod.value,
        note: txNote.value
      });
    }
    showEditTxModal.value = false;
    showToast('Đã lưu giao dịch', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) summaries.value[updated.id] = sm;
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}
async function deleteTx(txId: string) {
  if (!selectedShift.value) return;
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa giao dịch này?', {
    title: 'Xóa giao dịch',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (ok) {
    try {
      await shiftStore.removeHistoryTransaction(selectedShift.value.id, txId);
      showToast('Đã xóa giao dịch', 'success');
      const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
      if (updated) {
        selectedShift.value = updated;
        const sm = await shiftStore.getHistorySummary(updated);
        if (sm) summaries.value[updated.id] = sm;
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }
}

// Other Transactions
function openAddOtherTx() {
  if (!selectedShift.value) return;
  otherTxType.value = 'income';
  otherTxCategory.value = '';
  otherTxAmount.value = '';
  otherTxNote.value = '';
  showEditOtherTxModal.value = true;
}
async function saveOtherTx() {
  if (!selectedShift.value) return;
  const amt = Number(otherTxAmount.value);
  if (!amt || amt <= 0) {
    showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
    return;
  }
  try {
    await shiftStore.addHistoryOtherTransaction(selectedShift.value.id, {
      type: otherTxType.value,
      category: otherTxCategory.value || 'Khác',
      amount: amt,
      note: otherTxNote.value
    });
    showEditOtherTxModal.value = false;
    showToast('Đã lưu giao dịch khác', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) summaries.value[updated.id] = sm;
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}
async function deleteOtherTx(txId: string) {
  if (!selectedShift.value) return;
  const ok = await showConfirm('Bạn có chắc chắn muốn xóa giao dịch khác này?', {
    title: 'Xóa giao dịch',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (ok) {
    try {
      await shiftStore.removeHistoryOtherTransaction(selectedShift.value.id, txId);
      showToast('Đã xóa giao dịch', 'success');
      const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
      if (updated) {
        selectedShift.value = updated;
        const sm = await shiftStore.getHistorySummary(updated);
        if (sm) summaries.value[updated.id] = sm;
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }
}

// Cash Count Edit
function openEditCashCount() {
  if (!selectedShift.value) return;
  const sh = selectedShift.value;
  const cc = sh.cashCount || {};
  const pc = sh.pinnedCash || {};
  const kc = sh.keepCash || {};
  const hc = sh.handoverCash || {};
  
  denominations.forEach(d => {
    const val = String(d.value);
    cashCountPins.value[val] = pc[val] || 0;
    cashCountKeeps.value[val] = kc[val] || 0;
    
    let handVal = hc[val] || 0;
    if (!sh.handoverCash && cc[val] > 0) {
      handVal = Math.max(0, (cc[val] || 0) - (pc[val] || 0) - (kc[val] || 0));
    }
    cashCountHands.value[val] = handVal;
  });
  
  showEditCashCountModal.value = true;
}
async function saveCashCount() {
  if (!selectedShift.value) return;
  const pins: Record<string, number> = {};
  const keeps: Record<string, number> = {};
  const hands: Record<string, number> = {};
  const counts: Record<string, number> = {};
  
  denominations.forEach(d => {
    const val = String(d.value);
    const p = cashCountPins.value[val] || 0;
    const k = cashCountKeeps.value[val] || 0;
    const h = cashCountHands.value[val] || 0;
    
    if (p > 0) pins[val] = p;
    if (k > 0) keeps[val] = k;
    if (h > 0) hands[val] = h;
    
    const total = p + k + h;
    if (total > 0) counts[val] = total;
  });
  
  try {
    await shiftStore.updateHistoryCashCount(selectedShift.value.id, counts, pins, keeps, hands);
    showEditCashCountModal.value = false;
    showToast('Đã cập nhật kiểm kê tiền', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) summaries.value[updated.id] = sm;
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

// Drink Inventory
function openEditDrinks() {
  if (!selectedShift.value) return;
  const sh = selectedShift.value;
  const snap = sh.drinkInventorySnapshot || { items: {} };
  const items = snap.items || {};
  
  drinkActualCounts.value = {};
  
  const catalog = settingsStore.settings?.posCatalog || [];
  catalog.forEach((cat: any) => {
    cat.items.forEach((item: any) => {
      if (item.isDrink) {
        const existing = items[item.id];
        drinkActualCounts.value[item.id] = existing ? (existing.end ?? 0) : 0;
      }
    });
  });
  
  showEditDrinkModal.value = true;
}
async function saveDrinks() {
  if (!selectedShift.value) return;
  const sh = selectedShift.value;
  const snap = sh.drinkInventorySnapshot || { items: {} };
  const items = { ...snap.items };
  
  const catalog = settingsStore.settings?.posCatalog || [];
  catalog.forEach((cat: any) => {
    cat.items.forEach((item: any) => {
      if (item.isDrink) {
        const id = item.id;
        const actualVal = drinkActualCounts.value[id] || 0;
        if (items[id]) {
          items[id] = {
            ...items[id],
            end: actualVal
          };
        } else {
          items[id] = {
            name: item.name,
            start: 0,
            import: 0,
            sold: 0,
            expected: 0,
            end: actualVal
          };
        }
      }
    });
  });
  
  try {
    await shiftStore.updateHistoryDrinkInventory(sh.id, items);
    showEditDrinkModal.value = false;
    showToast('Đã cập nhật kiểm kho', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) selectedShift.value = updated;
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

// Invoice Payment Methods
function openEditInvoicePayment(inv: any) {
  if (!selectedShift.value) return;
  editingInvoice.value = inv;
  const payments = inv.payments || [];
  invoicePayments.value = payments.length > 0
    ? payments.map((p: any) => ({ method: p.method, amount: p.amount }))
    : [{ method: 'cash', amount: inv.amount || 0 }];
  
  showEditInvoicePaymentModal.value = true;
}
function addInvoicePaymentLine() {
  invoicePayments.value.push({ method: 'cash', amount: 0 });
}
function removeInvoicePaymentLine(index: number) {
  invoicePayments.value.splice(index, 1);
}
async function saveInvoicePayments() {
  if (!selectedShift.value || !editingInvoice.value) return;
  const cleanPayments = invoicePayments.value.filter(p => p.amount > 0);
  if (cleanPayments.length === 0) {
    showToast('Cần ít nhất một dòng thanh toán', 'warning');
    return;
  }
  try {
    await shiftStore.editHistoryInvoicePayment(selectedShift.value.id, editingInvoice.value.refId, cleanPayments);
    showEditInvoicePaymentModal.value = false;
    showToast('Đã cập nhật thanh toán hóa đơn', 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) {
        summaries.value[updated.id] = sm;
      }
      await loadActiveInvoices();
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}

async function syncCukcukInvoices() {
  if (!selectedShift.value) return;
  const sh = selectedShift.value;
  if (!sh.date) {
    showToast('Không xác định được ngày ca', 'warning');
    return;
  }
  isSyncingCukcuk.value = true;
  try {
    const result = await syncInvoicesForDate(sh.date);
    if (result.success) {
      const live = await getInvoicesByShiftTime(sh.date, sh.startTime, sh.endTime || undefined);
      if (live.length > 0) {
        await shiftStore.backfillHistoryInvoiceSnapshot(sh.id, live);
      }
      showToast(`Đã đồng bộ thành công ${result.synced || 0} hóa đơn`, 'success');
      const updated = shiftStore.shifts.find(s => s.id === sh.id);
      if (updated) {
        selectedShift.value = updated;
        const sm = await shiftStore.getHistorySummary(updated);
        if (sm) {
          summaries.value[updated.id] = sm;
        }
        await loadActiveInvoices();
      }
    } else {
      showToast(result.message || 'Lỗi đồng bộ CUKCUK', 'error');
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  } finally {
    isSyncingCukcuk.value = false;
  }
}

async function saveInvoiceSnapshot(invoices: any[]) {
  if (!selectedShift.value) return;
  try {
    await shiftStore.backfillHistoryInvoiceSnapshot(selectedShift.value.id, invoices);
    showToast(`Đã lưu snapshot ${invoices.length} hóa đơn`, 'success');
    const updated = shiftStore.shifts.find(s => s.id === selectedShift.value?.id);
    if (updated) {
      selectedShift.value = updated;
      const sm = await shiftStore.getHistorySummary(updated);
      if (sm) {
        summaries.value[updated.id] = sm;
      }
      await loadActiveInvoices();
    }
  } catch (e: any) {
    showToast(e.message, 'error');
  }
}
</script>

<template>
  <div class="view-content p-6">
    <!-- Header Dashboard Section -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <span class="material-symbols-rounded text-indigo-600 text-3xl">auto_stories</span>
          Lịch sử ca làm việc
        </h3>
        <p class="text-slate-500 mt-1">Quản lý, tìm kiếm và điều chỉnh các ca làm việc đã đóng.</p>
      </div>
      <div class="flex flex-wrap gap-2.5">
        <button class="btn btn-outline btn-sm flex items-center gap-1.5" @click="rebuildSnapshots" title="Cập nhật lại số liệu lịch sử từ dữ liệu CUKCUK mới nhất">
          <span class="material-symbols-rounded text-lg">refresh</span> Làm mới số liệu
        </button>
        <button class="btn btn-outline btn-sm flex items-center gap-1.5" @click="syncWithCloud" :disabled="isSyncingCloud">
          <span class="material-symbols-rounded text-lg" :class="{ 'spin': isSyncingCloud }">cloud_sync</span> Đồng bộ Cloud
        </button>
        <button class="btn btn-outline btn-sm flex items-center gap-1.5" @click="exportHistoryCSV">
          <span class="material-symbols-rounded text-lg">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <!-- Filter Fields -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50/55 p-4 rounded-2xl border border-slate-100 backdrop-blur-md">
      <div class="md:col-span-2 relative">
        <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <span class="material-symbols-rounded text-xl">search</span>
        </span>
        <input 
          type="text" 
          v-model="searchQuery" 
          class="form-input w-full pl-11" 
          placeholder="Tìm theo tên thu ngân, ngày ca, ghi chú..."
        >
      </div>
      <div>
        <select v-model="filterShiftNumber" class="form-input w-full">
          <option value="">Tất cả các ca</option>
          <option value="1">Ca 1</option>
          <option value="2">Ca 2</option>
        </select>
      </div>
    </div>

    <!-- Cards Layout Grid -->
    <div v-if="filteredShifts.length === 0" class="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-3xl border border-dashed border-slate-200">
      <span class="material-symbols-rounded text-slate-300 text-6xl mb-3">history</span>
      <h4 class="text-lg font-semibold text-slate-700">Chưa có lịch sử</h4>
      <p class="text-slate-400 text-sm mt-1">Các ca làm việc đã đóng sẽ xuất hiện ở đây.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div 
        v-for="sh in filteredShifts" 
        :key="sh.id" 
        class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
      >
        <div>
          <!-- Card Title & Actions -->
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <h4 class="font-bold text-slate-800 flex items-center gap-1.5">
                Ca {{ sh.shiftNumber }} — {{ sh.cashierName }}
                <span 
                  v-if="sh.reclosedAt || sh.originalSummarySnapshot" 
                  class="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100"
                >
                  Đã cập nhật
                </span>
              </h4>
              <p class="text-xs text-slate-400 mt-0.5">
                {{ formatDate(sh.date) }} · {{ formatTime(sh.startTime) }} → {{ sh.endTime ? formatTime(sh.endTime) : '(Đang mở)' }}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <button 
                class="btn-icon p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                @click="viewShiftDetail(sh)"
                title="Xem chi tiết"
              >
                <span class="material-symbols-rounded">visibility</span>
              </button>
              <button 
                class="btn-icon p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                @click="deleteShift(sh.id)"
                title="Xóa ca"
              >
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <!-- Quick Stats Panel -->
          <div class="grid grid-cols-2 gap-3.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-xs">
            <div>
              <span class="text-slate-400 block mb-0.5">Doanh thu</span>
              <strong class="text-emerald-600 text-sm font-semibold">
                {{ formatCurrency(summaries[sh.id]?.totalIncome ?? 0) }}
              </strong>
            </div>
            <div>
              <span class="text-slate-400 block mb-0.5">Chi phí</span>
              <strong class="text-rose-500 text-sm font-semibold">
                {{ formatCurrency(summaries[sh.id]?.totalExpense ?? 0) }}
              </strong>
            </div>
            <div>
              <span class="text-slate-400 block mb-0.5">Hóa đơn</span>
              <strong class="text-slate-700 text-sm font-semibold">
                {{ summaries[sh.id]?.billCount ?? 0 }}
                <span v-if="summaries[sh.id]?.cukcukBills" class="text-[10px] text-emerald-600 font-normal">
                  ({{ summaries[sh.id]?.cukcukBills }} POS)
                </span>
              </strong>
            </div>
            <div>
              <span class="text-slate-400 block mb-0.5">Chênh lệch</span>
              <strong 
                class="text-sm font-semibold"
                :class="(summaries[sh.id]?.discrepancy ?? 0) === 0 ? 'text-emerald-600' : 'text-rose-500'"
              >
                {{ (summaries[sh.id]?.discrepancy ?? 0) === 0 ? '✓ 0' : formatCurrency(summaries[sh.id]?.discrepancy ?? 0) }}
              </strong>
            </div>
          </div>
        </div>

        <!-- Note snippet -->
        <p v-if="sh.notes" class="text-slate-500 text-xs mt-3 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
          📝 {{ sh.notes }}
        </p>
      </div>
    </div>

    <!-- ────────────────── DETAILS MODAL ────────────────── -->
    <div v-if="selectedShift" class="modal-overlay active z-50">
      <div class="modal-content max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white rounded-3xl shadow-xl">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 class="text-lg font-bold text-slate-800">
              Ca {{ selectedShift.shiftNumber }} — {{ selectedShift.cashierName }}
            </h4>
            <p class="text-xs text-slate-400 mt-0.5">
              Ngày làm việc: {{ formatDate(selectedShift.date) }} · Bắt đầu: {{ formatTime(selectedShift.startTime) }}
            </p>
          </div>
          <button @click="selectedShift = null" class="btn-icon p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <!-- Tabs Navigation -->
        <div class="px-6 border-b border-slate-100 bg-slate-50/50 flex gap-2 overflow-x-auto">
          <button 
            v-for="t in [
              { id: 'sum', icon: 'summarize', label: 'Tổng kết' },
              { id: 'tx', icon: 'receipt_long', label: 'Giao dịch' },
              { id: 'pos', icon: 'point_of_sale', label: 'Hóa đơn POS' },
              { id: 'cash', icon: 'calculate', label: 'Kiểm kê tiền' },
              { id: 'drink', icon: 'local_bar', label: 'Kiểm kho' }
            ]" 
            :key="t.id"
            @click="activeTab = t.id as any"
            class="py-3 px-3 border-b-2 flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
            :class="activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'"
          >
            <span class="material-symbols-rounded text-lg">{{ t.icon }}</span>
            {{ t.label }}
          </button>
        </div>

        <!-- Tab Body Scrollable Container -->
        <div class="p-6 overflow-y-auto flex-1 max-h-[50vh]">
          <!-- ── TỔNG KẾT TAB ── -->
          <div v-if="activeTab === 'sum'" class="space-y-5">
            <table class="report-table text-sm">
              <tbody>
                <tr>
                  <td class="font-medium text-slate-500">Thời gian ca</td>
                  <td class="text-slate-800">
                    {{ formatTime(selectedShift.startTime) }} → {{ selectedShift.endTime ? formatTime(selectedShift.endTime) : '(Đang mở ca)' }}
                  </td>
                </tr>
                <tr>
                  <td class="font-medium text-slate-500 flex items-center gap-1.5">
                    Tiền mặt đầu ca
                    <button class="text-indigo-600 hover:text-indigo-800 p-0.5 hover:bg-indigo-50 rounded" @click="openEditStartingCash" title="Sửa đầu ca">
                      <span class="material-symbols-rounded text-xs block">edit</span>
                    </button>
                  </td>
                  <td class="font-semibold text-slate-800">{{ formatCurrency(selectedShift.startingCash) }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Revenue Breakdown CUKCUK -->
            <div v-if="activeSummary?.cukcukBills" class="space-y-2">
              <h5 class="font-bold text-emerald-600 flex items-center justify-between text-sm">
                <span>🏪 DOANH THU CUKCUK ({{ activeSummary.cukcukBills }} hóa đơn)</span>
                <span :class="getFieldDiffClass('cukcukRevenue')">
                  {{ formatCurrency(activeSummary.cukcukRevenue) }}
                </span>
              </h5>
              <table class="report-table text-xs text-slate-600">
                <tbody>
                  <tr>
                    <td>Tiền mặt (TM)</td>
                    <td class="text-right font-medium" :class="getFieldDiffClass('cashIncome')">
                      {{ formatCurrency(activeSummary.cashIncome) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Thẻ tín dụng/ATM</td>
                    <td class="text-right font-medium" :class="getFieldDiffClass('cardIncome')">
                      {{ formatCurrency(activeSummary.cardIncome) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Chuyển khoản (CK)</td>
                    <td class="text-right font-medium" :class="getFieldDiffClass('transferIncome')">
                      {{ formatCurrency(activeSummary.transferIncome) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Total stats comparison -->
            <div class="space-y-2">
              <h5 class="font-bold text-indigo-600 text-sm">📊 CHI TIẾT TỔNG KẾT</h5>
              <table class="report-table text-xs text-slate-700 bg-indigo-50/20 rounded-xl overflow-hidden">
                <tbody>
                  <tr v-if="activeSummary?.cukcukBills">
                    <td>Tiền mặt CUKCUK</td>
                    <td class="text-right font-medium" :class="getFieldDiffClass('cashIncome')">
                      {{ formatCurrency(activeSummary.cashIncome) }}
                    </td>
                  </tr>
                  <tr v-if="(activeSummary?.totalIncome ?? 0) - (activeSummary?.cukcukRevenue ?? 0) > 0">
                    <td>Thu ngoài POS (Thu ngoài)</td>
                    <td class="text-right font-medium text-emerald-600">
                      +{{ formatCurrency((activeSummary?.totalIncome ?? 0) - (activeSummary?.cukcukRevenue ?? 0)) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Tổng chi phí trong ca</td>
                    <td class="text-right text-rose-500 font-medium" :class="getFieldDiffClass('totalExpense')">
                      −{{ formatCurrency(activeSummary?.totalExpense ?? 0) }}
                    </td>
                  </tr>
                  <tr class="border-t border-slate-100 bg-slate-50/50">
                    <td class="font-semibold">Tiền mặt kỳ vọng trong két</td>
                    <td class="text-right font-bold text-slate-800" :class="getFieldDiffClass('expectedCash')">
                      {{ formatCurrency(activeSummary?.expectedCash ?? 0) }}
                    </td>
                  </tr>
                  <tr>
                    <td class="font-semibold">Tiền mặt thực tế kiểm kê</td>
                    <td class="text-right font-semibold text-slate-800" :class="getFieldDiffClass('cashCountTotal')">
                      {{ formatCurrency(activeSummary?.cashCountTotal ?? 0) }}
                    </td>
                  </tr>
                  <tr class="border-t-2 border-slate-200" :class="(activeSummary?.discrepancy ?? 0) === 0 ? 'bg-emerald-50/40' : 'bg-rose-50/45'">
                    <td class="font-bold">CHÊNH LỆCH KÉT TIỀN</td>
                    <td class="text-right font-bold" :class="(activeSummary?.discrepancy ?? 0) === 0 ? 'text-emerald-600' : 'text-rose-600'">
                      {{ (activeSummary?.discrepancy ?? 0) === 0 && !selectedShift.originalSummarySnapshot ? '✓ 0 đ' : formatCurrency(activeSummary?.discrepancy ?? 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Notes area -->
            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-start justify-between gap-4 text-xs">
              <div class="flex-1">
                <span class="font-bold text-slate-600 block mb-1">Ghi chú ca:</span>
                <p class="text-slate-500 leading-relaxed">{{ selectedShift.notes || 'Không có ghi chú.' }}</p>
              </div>
              <button class="btn btn-outline btn-xs flex items-center gap-1" @click="openEditNotes">
                <span class="material-symbols-rounded text-xs">edit</span> Sửa
              </button>
            </div>
          </div>

          <!-- ── GIAO DỊCH TAB ── -->
          <div v-if="activeTab === 'tx'" class="space-y-5">
            <div class="flex gap-2">
              <button class="btn btn-success btn-xs flex items-center gap-1" @click="openAddTx('income')">
                <span class="material-symbols-rounded text-xs">add</span> Thêm Thu
              </button>
              <button class="btn btn-danger btn-xs flex items-center gap-1" @click="openAddTx('expense')">
                <span class="material-symbols-rounded text-xs">remove</span> Thêm Chi
              </button>
              <button class="btn btn-outline btn-xs flex items-center gap-1" @click="openAddOtherTx">
                <span class="material-symbols-rounded text-xs">add</span> Thêm Khác
              </button>
            </div>

            <!-- Income Table -->
            <div v-if="selectedShift.transactions?.filter(t => t.type === 'income').length" class="space-y-1.5">
              <h5 class="font-bold text-emerald-600 text-xs">✍️ DANH SÁCH THU</h5>
              <table class="report-table text-xs text-slate-700">
                <thead>
                  <tr class="bg-slate-50">
                    <th>Danh mục</th>
                    <th>Ghi chú</th>
                    <th class="text-right">Số tiền</th>
                    <th class="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in selectedShift.transactions.filter(t => t.type === 'income')" :key="t.id">
                    <td>{{ t.category }}</td>
                    <td>{{ t.note || '—' }}</td>
                    <td class="text-right font-medium text-emerald-600">+{{ formatCurrency(t.amount) }}</td>
                    <td class="flex items-center justify-end gap-1.5">
                      <button class="btn-icon p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600" @click="openEditTx(t)">
                        <span class="material-symbols-rounded text-sm">edit</span>
                      </button>
                      <button class="btn-icon p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600" @click="deleteTx(t.id)">
                        <span class="material-symbols-rounded text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Expense Table -->
            <div v-if="selectedShift.transactions?.filter(t => t.type === 'expense').length" class="space-y-1.5">
              <h5 class="font-bold text-rose-500 text-xs">💸 DANH SÁCH CHI</h5>
              <table class="report-table text-xs text-slate-700">
                <thead>
                  <tr class="bg-slate-50">
                    <th>Danh mục</th>
                    <th>Ghi chú</th>
                    <th class="text-right">Số tiền</th>
                    <th class="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in selectedShift.transactions.filter(t => t.type === 'expense')" :key="t.id">
                    <td>{{ t.category }}</td>
                    <td>{{ t.note || '—' }}</td>
                    <td class="text-right font-medium text-rose-500">−{{ formatCurrency(t.amount) }}</td>
                    <td class="flex items-center justify-end gap-1.5">
                      <button class="btn-icon p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600" @click="openEditTx(t)">
                        <span class="material-symbols-rounded text-sm">edit</span>
                      </button>
                      <button class="btn-icon p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600" @click="deleteTx(t.id)">
                        <span class="material-symbols-rounded text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Other Transactions Table -->
            <div v-if="selectedShift.otherTransactions?.length" class="space-y-1.5">
              <h5 class="font-bold text-orange-500 text-xs">📝 GIAO DỊCH KHÁC</h5>
              <table class="report-table text-xs text-slate-700">
                <thead>
                  <tr class="bg-slate-50">
                    <th>Loại</th>
                    <th>Danh mục</th>
                    <th>Ghi chú</th>
                    <th class="text-right">Số tiền</th>
                    <th class="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in selectedShift.otherTransactions" :key="t.id">
                    <td>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" :class="t.type === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'">
                        {{ t.type === 'income' ? 'Thu' : 'Chi' }}
                      </span>
                    </td>
                    <td>{{ t.category }}</td>
                    <td>{{ t.note || '—' }}</td>
                    <td class="text-right font-medium" :class="t.type === 'income' ? 'text-emerald-600' : 'text-rose-500'">
                      {{ t.type === 'income' ? '+' : '−' }}{{ formatCurrency(t.amount) }}
                    </td>
                    <td class="flex justify-end">
                      <button class="btn-icon p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600" @click="deleteOtherTx(t.id)">
                        <span class="material-symbols-rounded text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="!selectedShift.transactions?.length && !selectedShift.otherTransactions?.length" class="text-center py-6 text-slate-400 text-xs">
              Chưa có giao dịch thu/chi ngoài POS nào phát sinh trong ca.
            </div>
          </div>

          <!-- ── HÓA ĐƠN POS TAB ── -->
          <div v-if="activeTab === 'pos'" class="space-y-4">
            <div class="flex items-center justify-between gap-3 text-xs">
              <div>
                <strong>{{ activeInvoices.length }}</strong> hóa đơn — Tổng tiền: 
                <strong class="text-emerald-600 text-sm ml-1">{{ formatCurrency(activeInvoicesTotal) }}</strong>
                <span v-if="activeInvoicesFromLive" class="ml-2 bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                  Live
                </span>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-outline btn-xs flex items-center gap-1" @click="syncCukcukInvoices" :disabled="isSyncingCukcuk">
                  <span class="material-symbols-rounded text-xs" :class="{ 'spin': isSyncingCukcuk }">sync</span> Đồng bộ từ CUKCUK
                </button>
                <button v-if="activeInvoicesFromLive" class="btn btn-primary btn-xs flex items-center gap-1" @click="saveInvoiceSnapshot(activeInvoices)">
                  <span class="material-symbols-rounded text-xs">save</span> Lưu snapshot
                </button>
              </div>
            </div>

            <!-- Invoices List Table -->
            <div v-if="activeInvoices.length === 0" class="text-center py-10 bg-slate-50/50 rounded-2xl text-slate-400 text-xs">
              <p>Chưa có dữ liệu snapshot hóa đơn.</p>
              <button class="btn btn-primary btn-xs mt-3 flex items-center gap-1 mx-auto" @click="syncCukcukInvoices" :disabled="isSyncingCukcuk">
                <span class="material-symbols-rounded text-xs">sync</span> Đồng bộ CUKCUK
              </button>
            </div>

            <table v-else class="report-table text-xs text-slate-700">
              <thead>
                <tr class="bg-slate-50">
                  <th>Số Bill</th>
                  <th>Bàn</th>
                  <th>PTTT</th>
                  <th class="text-right">Thực thu</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody>
                <!-- Current Invoices -->
                <tr 
                  v-for="inv in activeInvoices" 
                  :key="inv.refId"
                  :style="invoiceDiff.added.includes(inv.refId) 
                    ? { backgroundColor: '#f0fdf4' } 
                    : invoiceDiff.modified.includes(inv.refId) 
                      ? { backgroundColor: '#fffbeb' } 
                      : {}"
                >
                  <td class="font-medium">
                    {{ inv.refNo || '—' }}
                    <span v-if="invoiceDiff.added.includes(inv.refId)" class="ml-1 bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1 rounded">Mới</span>
                    <span v-if="invoiceDiff.modified.includes(inv.refId)" class="ml-1 bg-amber-100 text-amber-800 text-[8px] font-bold px-1 rounded">Sửa</span>
                  </td>
                  <td>{{ inv.tableName || '—' }}</td>
                  <td class="text-base leading-none">
                    <span v-for="p in inv.payments || []" :key="p.method" class="mr-0.5" :title="p.method === 'cash' ? 'Tiền mặt' : p.method === 'card' ? 'Thẻ' : 'Chuyển khoản'">
                      {{ p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦' }}
                    </span>
                  </td>
                  <td class="text-right font-medium text-slate-800">
                    {{ formatCurrency(inv.amount) }}
                  </td>
                  <td>
                    <button class="btn-icon p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600" @click="openEditInvoicePayment(inv)">
                      <span class="material-symbols-rounded text-sm">edit</span>
                    </button>
                  </td>
                </tr>

                <!-- Removed/Deleted Invoices -->
                <tr 
                  v-for="inv in invoiceDiff.removed" 
                  :key="'rem_' + inv.refId"
                  style="background-color: #fef2f2; text-decoration: line-through; opacity: 0.65;"
                >
                  <td class="font-medium">
                    {{ inv.refNo || '—' }}
                    <span class="ml-1 bg-rose-100 text-rose-800 text-[8px] font-bold px-1 rounded">Hủy/Xóa</span>
                  </td>
                  <td>{{ inv.tableName || '—' }}</td>
                  <td class="text-base leading-none">
                    <span v-for="p in inv.payments || []" :key="p.method" class="mr-0.5">
                      {{ p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦' }}
                    </span>
                  </td>
                  <td class="text-right font-medium">
                    {{ formatCurrency(inv.amount) }}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ── KIỂM KÊ TIỀN TAB ── -->
          <div v-if="activeTab === 'cash'" class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <button class="btn btn-outline btn-xs flex items-center gap-1" @click="openEditCashCount">
                <span class="material-symbols-rounded text-xs">edit</span> Chỉnh sửa kiểm kê
              </button>
            </div>

            <!-- Empty State -->
            <div v-if="!selectedShift?.cashCount || Object.keys(selectedShift.cashCount).filter(k => (selectedShift?.cashCount?.[k] ?? 0) > 0).length === 0" class="text-center py-8 text-slate-400 text-xs">
              Chưa có thông tin kiểm kê tiền mặt chi tiết cho ca này.
            </div>

            <!-- Counts Table -->
            <div v-else class="space-y-4">
              <table class="report-table text-xs text-slate-700">
                <thead>
                  <tr class="bg-slate-50">
                    <th>Mệnh giá tiền mặt</th>
                    <th class="text-right font-semibold">Số lượng tờ</th>
                    <th class="text-right font-semibold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in denominations.filter(d => (selectedShift?.cashCount?.[String(d.value)] ?? 0) > 0)" :key="d.value">
                    <td>{{ d.label }}</td>
                    <td class="text-right font-medium text-slate-700">
                      {{ selectedShift?.cashCount?.[String(d.value)] }}
                    </td>
                    <td class="text-right font-medium text-slate-800">
                      {{ formatCurrency(d.value * (selectedShift?.cashCount?.[String(d.value)] ?? 0)) }}
                    </td>
                  </tr>
                  <tr class="border-t-2 border-slate-200 bg-slate-50/50">
                    <td colspan="2" class="font-bold">Tổng tiền mặt kiểm đếm</td>
                    <td class="text-right font-bold text-slate-900">
                      {{ formatCurrency(selectedShift?.cashCountTotal ?? 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Detailed Breakdown (Két / Giao) -->
              <div v-if="selectedShift?.pinnedCash || selectedShift?.keepCash || selectedShift?.handoverCash" class="bg-indigo-50/20 p-4 rounded-2xl border border-indigo-50/50 text-xs space-y-2">
                <h6 class="font-bold text-indigo-600 text-xs uppercase tracking-wider mb-2">📌 Chi tiết phân chia két tiền</h6>
                <div class="grid grid-cols-2 gap-4">
                  <div class="p-3 bg-white rounded-xl border border-slate-100">
                    <span class="text-slate-400 block mb-0.5">Để lại trong két (Ghim + Giữ)</span>
                    <strong class="text-slate-800 text-sm font-semibold">
                      {{ formatCurrency(
                        denominations.reduce((acc, d) => acc + d.value * ((selectedShift?.pinnedCash?.[String(d.value)] ?? 0) + (selectedShift?.keepCash?.[String(d.value)] ?? 0)), 0)
                      ) }}
                    </strong>
                  </div>
                  <div class="p-3 bg-white rounded-xl border border-slate-100">
                    <span class="text-slate-400 block mb-0.5">🤝 Bàn giao (Giao nộp)</span>
                    <strong class="text-indigo-600 text-sm font-semibold">
                      {{ formatCurrency(
                        denominations.reduce((acc, d) => acc + d.value * (selectedShift?.handoverCash?.[String(d.value)] ?? 0), 0)
                      ) }}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── KIỂM KHO TAB ── -->
          <div v-if="activeTab === 'drink'" class="space-y-4">
            <div class="flex justify-between items-center">
              <button class="btn btn-outline btn-xs flex items-center gap-1" @click="openEditDrinks">
                <span class="material-symbols-rounded text-xs">edit</span> Sửa kiểm kho
              </button>
            </div>

            <!-- Empty state -->
            <div v-if="!selectedShift.drinkInventorySnapshot || !selectedShift.drinkInventorySnapshot.items" class="text-center py-8 text-slate-400 text-xs">
              Không có dữ liệu kiểm kho đồ uống.
            </div>

            <!-- Drink items table -->
            <table v-else class="report-table text-xs text-slate-700">
              <thead>
                <tr class="bg-slate-50">
                  <th>Tên sản phẩm</th>
                  <th class="text-right">Đầu ca</th>
                  <th class="text-right">Cuối ca (Đếm)</th>
                  <th class="text-right">Lượng bán</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(it, id) in selectedShift.drinkInventorySnapshot.items" :key="id">
                  <td class="font-medium text-slate-800">{{ it.name || id }}</td>
                  <td class="text-right text-slate-500">{{ it.start != null ? it.start : '—' }}</td>
                  <td class="text-right font-semibold text-slate-800">{{ it.end != null ? it.end : '—' }}</td>
                  <td class="text-right font-medium text-indigo-600">{{ it.sold != null ? it.sold : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/50">
          <div class="flex gap-2">
            <button class="btn btn-outline flex items-center gap-1" @click="selectedShift = null">
              Đóng
            </button>
            <button class="btn btn-outline text-indigo-600 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1.5" @click="reopenShift(selectedShift)">
              <span class="material-symbols-rounded text-lg">lock_open</span> Mở lại ca
            </button>
          </div>
          <button class="btn btn-primary flex items-center gap-1.5" @click="printHandoverReport(selectedShift)">
            <span class="material-symbols-rounded">print</span> Phiếu bàn giao
          </button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: EDIT STARTING CASH ────────────────── -->
    <div v-if="showEditStartingCashModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-md w-[90vw] p-5">
        <div class="modal-title">
          <span class="material-symbols-rounded text-amber-500">account_balance_wallet</span>
          Sửa tiền mặt đầu ca
        </div>
        
        <div class="form-group mt-4">
          <label class="form-label">Số tiền đầu ca (đ)</label>
          <input 
            type="number" 
            v-model.number="newStartingCash" 
            class="form-input w-full font-bold text-lg text-right text-indigo-600" 
            placeholder="Nhập số tiền..."
          >
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="showEditStartingCashModal = false">Hủy</button>
          <button class="btn btn-primary" @click="saveStartingCash">Cập nhật</button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: EDIT NOTES ────────────────── -->
    <div v-if="showEditNotesModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-md w-[90vw] p-5">
        <div class="modal-title">
          <span class="material-symbols-rounded">edit_note</span>
          Sửa ghi chú ca làm việc
        </div>
        
        <div class="form-group mt-4">
          <label class="form-label">Nội dung ghi chú</label>
          <textarea 
            v-model="newNotes" 
            class="form-input w-full" 
            rows="4" 
            placeholder="Nhập ghi chú ca..."
          ></textarea>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="showEditNotesModal = false">Hủy</button>
          <button class="btn btn-primary" @click="saveNotes">Lưu</button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: ADD/EDIT TRANSACTION ────────────────── -->
    <div v-if="showEditTxModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-lg w-[90vw] p-5">
        <div class="modal-title">
          <span class="material-symbols-rounded" :class="txType === 'income' ? 'text-emerald-500' : 'text-rose-500'">
            {{ editingTx ? 'edit' : 'add_circle' }}
          </span>
          {{ editingTx ? 'Chỉnh sửa' : 'Thêm mới' }} giao dịch
        </div>

        <div class="space-y-4 mt-4">
          <div class="form-group">
            <label class="form-label">Loại giao dịch</label>
            <select v-model="txType" class="form-input w-full" :disabled="!!editingTx">
              <option value="income">Thu</option>
              <option value="expense">Chi</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Danh mục</label>
            <select v-model="txCategory" class="form-input w-full">
              <option v-for="cat in categoryList" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="form-group">
              <label class="form-label">Số tiền</label>
              <input type="number" v-model.number="txAmount" class="form-input w-full font-semibold" placeholder="Nhập số tiền...">
            </div>
            <div class="form-group">
              <label class="form-label">PT Thanh toán</label>
              <select v-model="txPaymentMethod" class="form-input w-full">
                <option value="cash">💵 Tiền mặt</option>
                <option value="card">💳 Thẻ</option>
                <option value="transfer">🏦 CK</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Ghi chú</label>
            <input type="text" v-model="txNote" class="form-input w-full" placeholder="Nội dung/mô tả...">
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="showEditTxModal = false">Hủy</button>
          <button class="btn" :class="txType === 'income' ? 'btn-success' : 'btn-danger'" @click="saveTx">Lưu</button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: ADD OTHER TRANSACTION ────────────────── -->
    <div v-if="showEditOtherTxModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-lg w-[90vw] p-5">
        <div class="modal-title">
          <span class="material-symbols-rounded text-orange-500">note_add</span>
          Thêm giao dịch thu chi khác
        </div>

        <div class="space-y-4 mt-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="form-group">
              <label class="form-label">Loại</label>
              <select v-model="otherTxType" class="form-input w-full">
                <option value="income">Thu</option>
                <option value="expense">Chi</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Số tiền</label>
              <input type="number" v-model.number="otherTxAmount" class="form-input w-full font-semibold" placeholder="0">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Danh mục</label>
            <input type="text" v-model="otherTxCategory" class="form-input w-full" placeholder="Ví dụ: Tip, Tiền thối thừa...">
          </div>

          <div class="form-group">
            <label class="form-label">Ghi chú</label>
            <input type="text" v-model="otherTxNote" class="form-input w-full" placeholder="Ghi chú chi tiết...">
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="showEditOtherTxModal = false">Hủy</button>
          <button class="btn btn-primary" @click="saveOtherTx">Lưu</button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: EDIT CASH COUNT ────────────────── -->
    <div v-if="showEditCashCountModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-lg w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h5 class="modal-title m-0">
            <span class="material-symbols-rounded text-amber-500">calculate</span>
            Chỉnh sửa kiểm kê tiền mặt (lịch sử)
          </h5>
        </div>

        <div class="p-5 overflow-y-auto flex-1">
          <table class="report-table text-xs text-center">
            <thead>
              <tr class="bg-slate-50">
                <th class="text-left font-bold">Mệnh giá</th>
                <th class="font-bold">📌 Ghim</th>
                <th class="font-bold">🔒 Giữ</th>
                <th class="font-bold">🤝 Giao</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in denominations" :key="d.value">
                <td class="text-left font-semibold">{{ d.label }}</td>
                <td>
                  <input type="number" v-model.number="cashCountPins[String(d.value)]" min="0" class="form-input py-1 px-1.5 text-center w-14 mx-auto">
                </td>
                <td>
                  <input type="number" v-model.number="cashCountKeeps[String(d.value)]" min="0" class="form-input py-1 px-1.5 text-center w-14 mx-auto">
                </td>
                <td>
                  <input type="number" v-model.number="cashCountHands[String(d.value)]" min="0" class="form-input py-1 px-1.5 text-center w-14 mx-auto">
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <button class="btn btn-outline btn-sm" @click="showEditCashCountModal = false">Hủy</button>
          <button class="btn btn-primary btn-sm flex items-center gap-1" @click="saveCashCount">
            <span class="material-symbols-rounded text-sm">save</span> Lưu kiểm kê
          </button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: EDIT DRINK INVENTORY ────────────────── -->
    <div v-if="showEditDrinkModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-lg w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden bg-white">
        <div class="px-5 py-4 border-b border-slate-100">
          <h5 class="modal-title m-0">
            <span class="material-symbols-rounded text-indigo-600">inventory_2</span>
            Sửa kiểm kho đồ uống
          </h5>
        </div>

        <div class="p-5 overflow-y-auto flex-1">
          <table class="report-table text-xs text-center">
            <thead>
              <tr class="bg-slate-50">
                <th class="text-left font-bold">Tên món đồ uống</th>
                <th class="font-bold w-24">Cuối ca (Đếm thực tế)</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="cat in settingsStore.settings?.posCatalog || []" :key="cat.name">
                <template v-if="cat.items.some((i: any) => i.isDrink)">
                  <tr class="bg-slate-100/50 font-bold text-left">
                    <td colspan="2" class="text-slate-700 px-3 py-1.5">{{ cat.name }}</td>
                  </tr>
                  <tr v-for="item in cat.items.filter((i: any) => i.isDrink)" :key="item.id">
                    <td class="text-left px-3">{{ item.name }}</td>
                    <td>
                      <input 
                        type="number" 
                        v-model.number="drinkActualCounts[item.id]" 
                        min="0" 
                        class="form-input py-1 px-1.5 text-center w-20 mx-auto"
                      >
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>

        <div class="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <button class="btn btn-outline btn-sm" @click="showEditDrinkModal = false">Hủy</button>
          <button class="btn btn-primary btn-sm flex items-center gap-1" @click="saveDrinks">
            <span class="material-symbols-rounded text-sm">save</span> Lưu kiểm kho
          </button>
        </div>
      </div>
    </div>

    <!-- ────────────────── SUB-MODAL: EDIT INVOICE PAYMENTS ────────────────── -->
    <div v-if="showEditInvoicePaymentModal" class="modal-overlay active z-50">
      <div class="modal-content max-w-lg w-[95vw] p-5">
        <div class="modal-title">
          <span class="material-symbols-rounded text-indigo-600">credit_card</span>
          Sửa PTTT — Bill {{ editingInvoice?.refNo || '?' }}
        </div>
        <p class="text-xs text-slate-500 mb-4">
          <strong>Bàn:</strong> {{ editingInvoice?.tableName || '—' }} — 
          <strong>Tổng bill:</strong> {{ formatCurrency(editingInvoice?.amount) }}
        </p>

        <div class="space-y-3">
          <table class="report-table text-xs text-slate-700">
            <thead>
              <tr class="bg-slate-50">
                <th>Phương thức thanh toán</th>
                <th class="text-right">Số tiền</th>
                <th class="w-8"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, idx) in invoicePayments" :key="idx">
                <td>
                  <select v-model="p.method" class="form-input py-1 px-2 w-full text-xs">
                    <option value="cash">💵 Tiền mặt (TM)</option>
                    <option value="card">💳 Thẻ tín dụng/ATM</option>
                    <option value="transfer">🏦 Chuyển khoản (CK)</option>
                  </select>
                </td>
                <td>
                  <input type="number" v-model.number="p.amount" class="form-input py-1 px-2 text-right w-full text-xs font-semibold">
                </td>
                <td class="text-center">
                  <button 
                    v-if="invoicePayments.length > 1" 
                    class="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                    @click="removeInvoicePaymentLine(idx)"
                  >
                    <span class="material-symbols-rounded text-sm">delete</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <button class="btn btn-outline btn-xs flex items-center gap-1" @click="addInvoicePaymentLine">
            <span class="material-symbols-rounded text-xs">add</span> Thêm dòng
          </button>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" @click="showEditInvoicePaymentModal = false">Hủy</button>
          <button class="btn btn-primary btn-sm flex items-center gap-1" @click="saveInvoicePayments">
            <span class="material-symbols-rounded text-sm">save</span> Lưu thanh toán
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.report-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
  text-align: left;
}
.report-table th, .report-table td {
  padding: 0.625rem;
  border-bottom: 1px solid #f1f5f9;
}
.report-table th {
  color: #64748b;
  font-weight: 600;
}
.btn-xs {
  padding: 0.25rem 0.625rem;
  font-size: 11px;
  font-weight: 600;
  border-radius: 0.5rem;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
