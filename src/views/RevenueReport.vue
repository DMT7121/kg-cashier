<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { 
  formatCurrency, 
  formatDate, 
  formatTime,
  formatDateTime,
  denominations, 
  showToast,
  todayStr
} from '../utils';
import { 
  getInvoicesForPeriod, 
  getInvoicesByShiftTime, 
  getRevenueSummary, 
  getDailyBreakdown,
  getPeriodBounds,
  editInvoicePayment,
  PeriodBounds
} from '../services/invoiceStore';
import { 
  syncTransactions, 
  syncSingleInvoice, 
  syncInvoicesForDate,
  pushManualEditToSheets 
} from '../integration/cukcuk';
import { SAInvoice, PaymentLine } from '../types/invoice';
import { Shift, ShiftSummary } from '../types/shift';
import { getCukcukInvoicesFromCloud } from '../services/api';

// ── Types ──────────────────────────────────
interface ItemSale {
  name: string;
  quantity: number;
  category: 'Đồ ăn' | 'Đồ uống';
}

const toLocalDateStr = (d: Date) => {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

const toLocalMonthStr = (d: Date) => {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};

// ── Stores ──────────────────────────────────
const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();

// ── Tab Management ──────────────────────────
const activeTab = ref<'report' | 'invoices' | 'analytics' | 'audit'>('report');

// ── Shared Date Range & Period (Reports) ────
const selectedPeriod = ref<'day' | 'week' | 'month' | 'quarter' | 'year'>('day');
const reportDate = ref<string>(todayStr());
const reportWeek = ref<string>(''); // YYYY-Www format
const reportMonth = ref<string>(toLocalMonthStr(new Date())); // YYYY-MM
const reportQuarter = ref<number>(Math.floor((new Date().getMonth() + 3) / 3));
const reportQuarterYear = ref<number>(new Date().getFullYear());

// Invoices Date Filter (defaults to today)
const invoicePeriod = ref<'day' | 'week' | 'month' | 'quarter' | 'year'>('day');
const invoiceDate = ref<string>(todayStr());

// ── Data State ──────────────────────────────
const invoices = ref<SAInvoice[]>([]);
const dailyBreakdown = ref<any[]>([]);
const periodBoundsLabel = ref<string>('');
const isSyncing = ref<boolean>(false);
const summaryData = ref({
  total: 0,
  cash: 0,
  card: 0,
  transfer: 0,
  bills: 0,
  avgPerBill: 0,
  unpaid: 0
});

// Analytics Comparison State
const analyticsSummary = ref({
  currentWeekTotal: 0,
  currentWeekBills: 0,
  currentWeekCash: 0,
  currentWeekCard: 0,
  currentWeekTransfer: 0,
  prevWeekTotal: 0,
  currentMonthTotal: 0,
  currentMonthExpense: 0,
  prevMonthTotal: 0
});
const analyticsChartDays = ref<any[]>([]);
const analyticsMonthlyDays = ref<any[]>([]);

// ── Shift Handover Report Selector ──────────
const selectedShiftId = ref<string>('all'); // 'all' or shift.id
const selectedShiftObj = ref<Shift | null>(null);
const selectedShiftSummary = ref<ShiftSummary | null>(null);
const shiftsForDay = ref<Shift[]>([]);

// ── Invoice Search & Filters ────────────────
const invoiceSearchQuery = ref<string>('');
const invoicePaymentFilter = ref<string>('all'); // all, cash, card, transfer, manually_edited

// ── Custom Layout Config ────────────────────
interface LayoutConfig {
  order: string[];
  visible: Record<string, boolean>;
}

const showConfigModal = ref<boolean>(false);
const layoutConfig = ref<LayoutConfig>({
  order: ['cukcuk', 'expense', 'manual', 'summary', 'ket', 'handover', 'general'],
  visible: { cukcuk: true, expense: true, manual: true, summary: true, ket: true, handover: true, general: true }
});

const sectionLabels: Record<string, string> = {
  cukcuk: 'Doanh thu CUKCUK (các bill POS)',
  expense: 'Chi trong ca (Phiếu chi mặt)',
  manual: 'Thu ngoài POS (Thu nhập thêm)',
  summary: 'Bảng tổng kết thực tế vs kì vọng',
  ket: 'Tiền két giữ lại',
  handover: 'Tiền bàn giao ca',
  general: 'Chi tiết kiểm kê tiền két'
};

// ── Printing & Preview State ────────────────
const isA4Preview = ref<boolean>(false);
const printingA4 = ref<boolean>(false);

// ── Edit Invoice Payment Modal ──────────────
const showEditPaymentModal = ref<boolean>(false);
const editingInvoice = ref<SAInvoice | null>(null);
const editCash = ref<number>(0);
const editCard = ref<number>(0);
const editTransfer = ref<number>(0);
const isSavingPayment = ref<boolean>(false);

// ── Load Report Layout Configurations ───────
function loadLayoutConfig() {
  const saved = localStorage.getItem('kg-report-layout');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.order && parsed.visible) {
        layoutConfig.value = parsed;
      }
    } catch (e) {
      console.warn('Failed to parse layout config', e);
    }
  }
}

function saveLayoutConfig() {
  localStorage.setItem('kg-report-layout', JSON.stringify(layoutConfig.value));
  showConfigModal.value = false;
  showToast('Đã lưu cấu hình hiển thị báo cáo', 'success');
}

// Drag & Drop Sorting in Modal
const draggedIndex = ref<number | null>(null);

function handleDragStart(index: number) {
  draggedIndex.value = index;
}

function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  
  // Reorder list array
  const list = [...layoutConfig.value.order];
  const item = list.splice(draggedIndex.value, 1)[0];
  list.splice(index, 0, item);
  layoutConfig.value.order = list;
  draggedIndex.value = index;
}

function handleDragEnd() {
  draggedIndex.value = null;
}

// ── Helper functions for date calculations ──
function getWeekRangeStr(weekStr: string) {
  if (!weekStr) return { start: new Date(), end: new Date() };
  const parts = weekStr.split('-W');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);
  
  // Get the first day of the year
  const firstDay = new Date(year, 0, 1);
  const dayOffset = firstDay.getDay() === 0 ? -6 : 1 - firstDay.getDay(); // Monday offset
  const firstMonday = new Date(year, 0, 1 + dayOffset);
  
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  return { start, end };
}

function getQuarterRange(quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0); // Last day of third month
  return { start, end };
}

// Determine active start/end Date object based on period parameters
const activeDateRange = computed(() => {
  let start = new Date();
  let end = new Date();
  
  if (selectedPeriod.value === 'day') {
    start = new Date(reportDate.value);
    end = new Date(reportDate.value);
  } else if (selectedPeriod.value === 'week') {
    if (reportWeek.value) {
      const range = getWeekRangeStr(reportWeek.value);
      start = range.start;
      end = range.end;
    } else {
      // Default to current week
      const today = new Date();
      const currentDay = today.getDay();
      const distance = currentDay === 0 ? 6 : currentDay - 1; // distance to Monday
      start = new Date(today);
      start.setDate(today.getDate() - distance);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    }
  } else if (selectedPeriod.value === 'month') {
    const parts = reportMonth.value.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
  } else if (selectedPeriod.value === 'quarter') {
    const range = getQuarterRange(reportQuarter.value, reportQuarterYear.value);
    start = range.start;
    end = range.end;
  } else if (selectedPeriod.value === 'year') {
    start = new Date(reportQuarterYear.value, 0, 1);
    end = new Date(reportQuarterYear.value, 11, 31);
  }
  
  // Set boundaries from 00:00:00.000 to 23:59:59.999
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
});

// Setup Initial Week Value (e.g. "2026-W22")
function initDefaultDates() {
  const d = new Date();
  const year = d.getFullYear();
  // Get week number
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  reportWeek.value = `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function applyQuickFilter(period: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year') {
  const today = new Date();
  if (period === 'today') {
    selectedPeriod.value = 'day';
    reportDate.value = toLocalDateStr(today);
  } else if (period === 'yesterday') {
    selectedPeriod.value = 'day';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    reportDate.value = toLocalDateStr(yesterday);
  } else if (period === 'week') {
    selectedPeriod.value = 'week';
    initDefaultDates();
  } else if (period === 'month') {
    selectedPeriod.value = 'month';
    reportMonth.value = toLocalMonthStr(today);
  } else if (period === 'lastMonth') {
    selectedPeriod.value = 'month';
    const lastM = new Date(today);
    lastM.setMonth(today.getMonth() - 1);
    reportMonth.value = toLocalMonthStr(lastM);
  } else if (period === 'quarter') {
    selectedPeriod.value = 'quarter';
    reportQuarter.value = Math.floor((today.getMonth() + 3) / 3);
    reportQuarterYear.value = today.getFullYear();
  } else if (period === 'year') {
    selectedPeriod.value = 'year';
    reportQuarterYear.value = today.getFullYear();
  }
}

function getOriginalPayments(inv: SAInvoice): PaymentLine[] {
  try {
    const auditStr = (inv as any).auditJson || '';
    if (auditStr) {
      const trail = JSON.parse(auditStr);
      if (Array.isArray(trail) && trail.length > 0 && trail[0].before) {
        if (typeof trail[0].before === 'string') {
          return JSON.parse(trail[0].before);
        }
        return trail[0].before;
      }
    }
  } catch (e) {}
  return [];
}

// ── Refresh / Fetch Reports Data ────────────
async function refreshReportData() {
  const { start, end } = activeDateRange.value;
  
  // Format boundaries for text matching
  const startStr = toLocalDateStr(start);
  const endStr = toLocalDateStr(end);
  
  const labelStart = formatDate(startStr);
  const labelEnd = formatDate(endStr);
  periodBoundsLabel.value = selectedPeriod.value === 'day' ? labelStart : `${labelStart} đến ${labelEnd}`;
  
  // 1. Fetch Invoices from Cloud and merge to local IndexedDB for the date range
  try {
    const cloudRes = await getCukcukInvoicesFromCloud({ fromDate: startStr, toDate: endStr });
    if (cloudRes && cloudRes.success && Array.isArray(cloudRes.invoices)) {
      const { mergeCloudInvoices } = await import('../services/invoiceStore');
      await mergeCloudInvoices(cloudRes.invoices);
    }
  } catch (err) {
    console.warn('[RevenueReport] Failed to fetch and merge cloud invoices:', err);
  }
  
  // 1b. Fetch Invoices for this date range
  const dbInvoices = await getInvoicesForPeriod(selectedPeriod.value, start);
  invoices.value = dbInvoices;
  
  // 2. Fetch daily breakdown for the table
  const breakdown = await getDailyBreakdown(selectedPeriod.value, start);
  dailyBreakdown.value = breakdown;
  
  // 3. Compute Summary Card Stats
  let total = 0;
  let cash = 0;
  let card = 0;
  let transfer = 0;
  let unpaid = 0;
  let paidBills = 0;
  
  dbInvoices.forEach(inv => {
    if ((inv as any).unpaid) {
      unpaid += inv.amount;
    } else {
      total += inv.amount;
      paidBills++;
      (inv.payments || []).forEach(p => {
        if (p.method === 'cash') cash += p.amount;
        else if (p.method === 'card') card += p.amount;
        else if (p.method === 'transfer') transfer += p.amount;
      });
    }
  });
  
  summaryData.value = {
    total,
    cash,
    card,
    transfer,
    bills: dbInvoices.length,
    avgPerBill: paidBills > 0 ? Math.round(total / paidBills) : 0,
    unpaid
  };
  
  // 4. Update list of shifts if period is 'day'
  if (selectedPeriod.value === 'day') {
    const dateStr = startStr;
    const dayShifts = [...shiftStore.shifts];
    if (shiftStore.currentShift && shiftStore.currentShift.date === dateStr) {
      if (!dayShifts.some(s => s.id === shiftStore.currentShift.id)) {
        dayShifts.unshift(shiftStore.currentShift);
      }
    }
    const filteredShifts = dayShifts.filter(s => s.date === dateStr);
    shiftsForDay.value = filteredShifts;
    
    // Auto-select shift or default to 'all'
    if (dayShifts.length > 0) {
      // If we already have a selected shift that is still available in dayShifts, keep it.
      // Otherwise default to the first shift
      const exists = dayShifts.some(s => s.id === selectedShiftId.value);
      if (!exists && selectedShiftId.value !== 'all') {
        selectedShiftId.value = dayShifts[0].id;
      }
    } else {
      selectedShiftId.value = 'all';
    }
    
    await updateShiftHandoverReport();
  }
}

// ── Update Shift Handover ────────────────────
async function updateShiftHandoverReport() {
  if (selectedShiftId.value === 'all') {
    selectedShiftObj.value = null;
    selectedShiftSummary.value = null;
    return;
  }
  
  const found = shiftsForDay.value.find(s => s.id === selectedShiftId.value);
  if (found) {
    selectedShiftObj.value = found;
    selectedShiftSummary.value = await shiftStore.getHistorySummary(found);
  } else {
    selectedShiftObj.value = null;
    selectedShiftSummary.value = null;
  }
}

// ── Invoices Tab - Filtering & Fetching ─────
const filteredInvoices = computed(() => {
  let list = invoices.value;
  
  // Apply payment method filter
  if (invoicePaymentFilter.value !== 'all') {
    if (invoicePaymentFilter.value === 'manually_edited') {
      list = list.filter(inv => inv.manualOverride || (inv as any).isManuallyEdited);
    } else {
      list = list.filter(inv => (inv.payments || []).some(p => p.method === invoicePaymentFilter.value && p.amount > 0));
    }
  }
  
  // Apply text search
  if (invoiceSearchQuery.value.trim() !== '') {
    const q = invoiceSearchQuery.value.toLowerCase().trim();
    list = list.filter(inv => 
      (inv.refNo && inv.refNo.toLowerCase().includes(q)) ||
      (inv.tableName && inv.tableName.toLowerCase().includes(q)) ||
      (inv.employeeName && inv.employeeName.toLowerCase().includes(q)) ||
      (inv.refId && inv.refId.toLowerCase().includes(q))
    );
  }
  
  return list;
});

// Watch changes on invoice filters and update
watch([invoicePeriod, invoiceDate], async () => {
  const start = new Date(invoiceDate.value);
  invoices.value = await getInvoicesForPeriod(invoicePeriod.value, start);
});

// ── Analytics Tab - Computations ────────────
async function fetchAnalyticsData() {
  // Fetch current week/month reports and compare with previous period
  const today = new Date();
  
  // 1. Current Week
  const curWeek = await getRevenueSummary('week', today);
  analyticsSummary.value.currentWeekTotal = curWeek.totalRevenue;
  analyticsSummary.value.currentWeekBills = curWeek.totalBills;
  analyticsSummary.value.currentWeekCash = curWeek.totalCash;
  analyticsSummary.value.currentWeekCard = curWeek.totalCard;
  analyticsSummary.value.currentWeekTransfer = curWeek.totalTransfer;
  
  // Previous Week (7 days before today)
  const prevWeekRef = new Date(today);
  prevWeekRef.setDate(prevWeekRef.getDate() - 7);
  const prevWeek = await getRevenueSummary('week', prevWeekRef);
  analyticsSummary.value.prevWeekTotal = prevWeek.totalRevenue;
  
  // 2. Current Month
  const curMonth = await getRevenueSummary('month', today);
  analyticsSummary.value.currentMonthTotal = curMonth.totalRevenue;
  
  // Previous Month
  const prevMonthRef = new Date(today);
  prevMonthRef.setMonth(prevMonthRef.getMonth() - 1);
  const prevMonth = await getRevenueSummary('month', prevMonthRef);
  analyticsSummary.value.prevMonthTotal = prevMonth.totalRevenue;
  
  // Month Expenses (pull from shift records for this month)
  const monthlyReport = await shiftStore.getMonthlyReport();
  analyticsMonthlyDays.value = monthlyReport;
  analyticsSummary.value.currentMonthExpense = monthlyReport.reduce((sum, day) => sum + day.totalExpense, 0);
  
  // 3. Chart Days (last 7 days breakdown)
  const weeklyBreakdown = await getDailyBreakdown('week', today);
  analyticsChartDays.value = weeklyBreakdown;
}

// Percentage change calculation helper
function getPercentageChange(current: number, previous: number) {
  if (!previous || previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Short currency string for charts (e.g. 1.2M, 500k)
function shortCurrency(val: number): string {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return Math.round(val / 1000) + 'k';
  return String(val);
}

// ── Invoices Tab Actions ────────────────────
async function triggerCukcukSync() {
  if (isSyncing.value) return;
  isSyncing.value = true;
  const targetDate = invoiceDate.value || reportDate.value || todayStr();
  showToast(`🔄 Đang đồng bộ hóa hóa đơn từ CUKCUK ngày ${targetDate}...`, 'info');
  try {
    const result = await syncInvoicesForDate(targetDate);
    if (result && result.success) {
      await refreshReportData();
    } else {
      showToast('⚠️ Không có hóa đơn mới hoặc đồng bộ lỗi: ' + (result.message || ''), 'warning');
    }
  } catch (e: any) {
    console.error('CUKCUK sync failed:', e);
    showToast('❌ Lỗi đồng bộ: ' + (e.message || e), 'error');
  } finally {
    isSyncing.value = false;
  }
}

async function triggerSingleInvoiceSync(refId: string) {
  showToast(`🔄 Đang cập nhật hóa đơn ${refId}...`, 'info');
  try {
    const result = await syncSingleInvoice(refId);
    if (result && result.success) {
      await refreshReportData();
    } else {
      showToast(`⚠️ Không thể đồng bộ bill: ${result.message || 'Lỗi'}`, 'warning');
    }
  } catch (e: any) {
    showToast(`❌ Lỗi: ${e.message || e}`, 'error');
  }
}

// ── Edit Payments Logic ──────────────────────
function openEditPaymentModal(invoice: SAInvoice) {
  editingInvoice.value = invoice;
  
  // Initialize input fields from invoice payments
  let cashAmt = 0;
  let cardAmt = 0;
  let transAmt = 0;
  
  (invoice.payments || []).forEach(p => {
    if (p.method === 'cash') cashAmt = p.amount;
    else if (p.method === 'card') cardAmt = p.amount;
    else if (p.method === 'transfer') transAmt = p.amount;
  });
  
  editCash.value = cashAmt;
  editCard.value = cardAmt;
  editTransfer.value = transAmt;
  
  showEditPaymentModal.value = true;
}

const editPaymentTotal = computed(() => {
  return editCash.value + editCard.value + editTransfer.value;
});

const isEditPaymentValid = computed(() => {
  if (!editingInvoice.value) return false;
  return editPaymentTotal.value === editingInvoice.value.amount;
});

async function savePaymentOverride() {
  if (!editingInvoice.value || !isEditPaymentValid.value) return;
  isSavingPayment.value = true;
  
  try {
    const newPayments: PaymentLine[] = [
      { method: 'cash' as const, amount: editCash.value },
      { method: 'card' as const, amount: editCard.value },
      { method: 'transfer' as const, amount: editTransfer.value }
    ].filter(p => p.amount > 0);
    
    // Save to IndexedDB
    const { oldPayments, newPayments: savedNewPayments } = await editInvoicePayment(editingInvoice.value.refId, newPayments);
    
    // Push manual edit to Google Sheets
    const pushResult = await pushManualEditToSheets(editingInvoice.value.refId, oldPayments, savedNewPayments);
    if (pushResult && pushResult.success) {
      showToast('✅ Đã ghi nhận thay đổi và đẩy lên Sheets thành công!', 'success');
    } else {
      showToast('⚠️ Đã lưu thay đổi cục bộ. Đồng bộ Sheets gặp trục trặc!', 'warning');
    }
    
    showEditPaymentModal.value = false;
    await refreshReportData();
  } catch (e: any) {
    showToast('❌ Lỗi lưu dữ liệu: ' + (e.message || e), 'error');
  } finally {
    isSavingPayment.value = false;
  }
}

// ── Item Sold Detailed Breakdown ────────────
const detailedItemSales = computed<ItemSale[]>(() => {
  const itemMap: Record<string, { name: string; quantity: number; category: 'Đồ ăn' | 'Đồ uống' }> = {};
  
  invoices.value.forEach(inv => {
    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach((item: any) => {
        const name = item.name || item.itemName;
        const qty = Number(item.quantity) || 0;
        if (!name) return;
        
        let category: 'Đồ ăn' | 'Đồ uống' = 'Đồ ăn';
        const lowercaseName = name.toLowerCase();
        
        // Match drink products
        const isDrink = DEFAULT_PRODUCTS_LIST.some(dp => {
          if (dp.name.toLowerCase() === lowercaseName) return true;
          if (dp.aliases?.some(alias => alias.toLowerCase() === lowercaseName)) return true;
          return false;
        }) || ['bia', 'soju', 'coke', 'coca', 'pepsi', 'sting', '7up', 'redbull', 'nước suối', 'lavie', 'nước ngọt', 'nước tăng lực', 'trà', 'cafe'].some(keyword => lowercaseName.includes(keyword));
        
        if (isDrink) {
          category = 'Đồ uống';
        }
        
        if (!itemMap[name]) {
          itemMap[name] = { name, quantity: 0, category };
        }
        itemMap[name].quantity += qty;
      });
    }
  });
  
  return Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);
});

// Max Item Sales Count for progress bars
const maxItemQty = computed(() => {
  if (detailedItemSales.value.length === 0) return 1;
  return Math.max(...detailedItemSales.value.map(i => i.quantity), 1);
});

// Default Drink Products List for categorizing
const DEFAULT_PRODUCTS_LIST = [
  { name: 'Corona', aliases: ['corona'] },
  { name: 'Heineken 330ml', aliases: ['heineken 330ml'] },
  { name: 'Heineken Silver 330ml', aliases: ['heineken silver 330ml'] },
  { name: 'Heineken Silver 250ml', aliases: ['heineken silver 250ml'] },
  { name: 'Tiger Nâu 330ml', aliases: ['tiger nâu 330ml', 'tiger nâu'] },
  { name: 'Tiger Bạc 330ml', aliases: ['tiger bạc 330ml'] },
  { name: 'Tiger Bạc 250ml', aliases: ['tiger bạc 250ml'] },
  { name: 'Soju', aliases: ['soju'] },
  { name: 'Coca Cola', aliases: ['coca cola'] },
  { name: 'Pepsi', aliases: ['pepsi'] },
  { name: 'Sting', aliases: ['sting'] },
  { name: '7up', aliases: ['7up'] },
  { name: 'Redbull', aliases: ['redbull', 'red bull'] },
  { name: 'Nước suối', aliases: ['nước suối'] }
];

// ── Handover Value Calculation & Supplemental Details ────
const handoverDetails = computed(() => {
  if (!selectedShiftObj.value || !selectedShiftSummary.value) return null;
  
  const target = selectedShiftObj.value;
  const sm = selectedShiftSummary.value;
  
  const txs = target.transactions || [];
  const otherTxs = target.otherTransactions || [];
  
  const manualIncomeTxs = txs.filter(t => t.type === 'income' && (!t.note || !t.note.includes('[CUKCUK]')));
  const expenseTxs = txs.filter(t => t.type === 'expense');
  
  const totalManualIncome = manualIncomeTxs.reduce((sum, t) => sum + t.amount, 0);
  const totalExpenseAmt = expenseTxs.reduce((sum, t) => sum + t.amount, 0);
  const manualCash = manualIncomeTxs.filter(t => (t.paymentMethod || 'cash') === 'cash').reduce((sum, t) => sum + t.amount, 0);
  const otherIncomeAmt = otherTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const otherExpenseAmt = otherTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  
  const cc = target.cashCount || {};
  const cashCountTotal = denominations.reduce((sum, d) => sum + (d.value * (cc[d.value] || 0)), 0);
  
  const expectedCash = (target.startingCash || 0) + manualCash + sm.cashIncome - totalExpenseAmt + otherIncomeAmt - otherExpenseAmt;
  const discrepancy = cashCountTotal - expectedCash;
  
  // Calculate Pinned, Keep, Handover Cash
  const pc = target.pinnedCash || {};
  const kc = target.keepCash || {};
  const hc = target.handoverCash || {};
  
  let ketTotal = 0;
  let handTotal = 0;
  const ketRows: { label: string; value: number }[] = [];
  const handRows: { label: string; value: number }[] = [];
  
  denominations.forEach(d => {
    const v = d.value;
    const pinQty = pc[v] || 0;
    const keepQty = kc[v] || 0;
    const handQty = hc[v] || 0;
    const ketQty = pinQty + keepQty;
    
    if (ketQty > 0) {
      const details = pinQty > 0 && keepQty > 0 ? ' (ghim + giữ)' : (pinQty > 0 ? ' (ghim)' : ' (giữ)');
      ketRows.push({
        label: `${ketQty} x ${d.label}${details}`,
        value: v * ketQty
      });
      ketTotal += v * ketQty;
    }
    
    if (handQty > 0) {
      handRows.push({
        label: `${handQty} x ${d.label}`,
        value: v * handQty
      });
      handTotal += v * handQty;
    }
  });
  
  // Fallback cash counting table
  const generalRows: { label: string; value: number }[] = [];
  let generalTotal = 0;
  if (ketRows.length === 0 && handRows.length === 0 && Object.keys(cc).length > 0) {
    denominations.forEach(d => {
      const qty = cc[d.value] || 0;
      if (qty > 0) {
        generalRows.push({
          label: `${qty} x ${d.label}`,
          value: d.value * qty
        });
        generalTotal += d.value * qty;
      }
    });
  }
  
  // Check if supplemental (reopened) shift changes
  const isSupplemental = !!target.lastReopenedAt;
  const diffInvoices = isSupplemental ? compareInvoices(target.cukcukInvoicesSnapshot, target.originalCukcukInvoicesSnapshot) : null;
  
  return {
    target,
    sm,
    manualIncomeTxs,
    expenseTxs,
    totalManualIncome,
    totalExpenseAmt,
    cashCountTotal,
    expectedCash,
    discrepancy,
    ketTotal,
    handTotal,
    ketRows,
    handRows,
    generalTotal,
    generalRows,
    isSupplemental,
    diffInvoices
  };
});

// Compare Cukcuk invoices to show in supplemental/reopened shift diff view
function compareInvoices(current: any[] = [], original: any[] = []) {
  const origMap: Record<string, any> = {};
  original.forEach(inv => { origMap[inv.refId] = inv; });
  
  const curMap: Record<string, any> = {};
  current.forEach(inv => { curMap[inv.refId] = inv; });
  
  const added: any[] = [];
  const removed: any[] = [];
  const modified: any[] = [];
  
  current.forEach(inv => {
    const orig = origMap[inv.refId];
    if (!orig) {
      added.push(inv);
    } else {
      const amtDiff = inv.amount !== orig.amount;
      const payDiff = JSON.stringify(inv.payments) !== JSON.stringify(orig.payments);
      if (amtDiff || payDiff) {
        modified.push({ current: inv, original: orig });
      }
    }
  });
  
  original.forEach(inv => {
    if (!curMap[inv.refId]) {
      removed.push(inv);
    }
  });
  
  return { added, removed, modified, hasDiff: added.length > 0 || removed.length > 0 || modified.length > 0 };
}

// Print Handler
function printHandover() {
  printingA4.value = true;
  nextTick(() => {
    document.body.classList.add('printing-a4');
    window.print();
    // Restore layout
    setTimeout(() => {
      document.body.classList.remove('printing-a4');
      printingA4.value = false;
    }, 1000);
  });
}

// Watchers for period inputs
watch([selectedPeriod, reportDate, reportWeek, reportMonth, reportQuarter, reportQuarterYear], async () => {
  await refreshReportData();
});

watch(selectedShiftId, async () => {
  await updateShiftHandoverReport();
});

watch(activeTab, async (newTab) => {
  if (newTab === 'analytics') {
    await fetchAnalyticsData();
  } else {
    await refreshReportData();
  }
});

// Navigation functions for DatePicker
function navigatePeriod(direction: 'prev' | 'next') {
  if (selectedPeriod.value === 'day') {
    const parts = reportDate.value.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    d.setDate(d.getDate() + (direction === 'next' ? 1 : -1));
    reportDate.value = toLocalDateStr(d);
  } else if (selectedPeriod.value === 'week') {
    const parts = reportWeek.value.split('-W');
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    let newWeek = week + (direction === 'next' ? 1 : -1);
    let newYear = year;
    
    if (newWeek < 1) {
      newYear--;
      newWeek = 52;
    } else if (newWeek > 52) {
      newYear++;
      newWeek = 1;
    }
    reportWeek.value = `${newYear}-W${String(newWeek).padStart(2, '0')}`;
  } else if (selectedPeriod.value === 'month') {
    const parts = reportMonth.value.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    const d = new Date(year, month + (direction === 'next' ? 1 : -1), 1, 12, 0, 0);
    reportMonth.value = toLocalMonthStr(d);
  } else if (selectedPeriod.value === 'quarter') {
    let q = reportQuarter.value + (direction === 'next' ? 1 : -1);
    let y = reportQuarterYear.value;
    if (q < 1) {
      y--;
      q = 4;
    } else if (q > 4) {
      y++;
      q = 1;
    }
    reportQuarter.value = q;
    reportQuarterYear.value = y;
  }
}

function selectToday() {
  reportDate.value = todayStr();
  selectedPeriod.value = 'day';
}

// Export CSV for daily breakdown
function exportCSV() {
  const data = dailyBreakdown.value;
  if (data.length === 0) {
    showToast('Không có dữ liệu để xuất', 'warning');
    return;
  }
  
  let csv = 'Ngay,So ca,So bill,Doanh thu,Chi phi,Loi nhuan,Tien mat,The,Chuyen khoan\n';
  data.forEach((d: any) => {
    csv += `"${d.date}",${d.shifts},${d.bills},${d.total},${d.totalExpense || 0},${d.total - (d.totalExpense || 0)},${d.cash || 0},${d.card || 0},${d.transfer || 0}\n`;
  });
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kg-report-revenue-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất báo cáo CSV thành công!', 'success');
}

onMounted(async () => {
  initDefaultDates();
  loadLayoutConfig();
  await refreshReportData();
  
  // Watch settings config changes to dynamically reload layout
  watch(() => settingsStore.settings, () => {
    loadLayoutConfig();
  }, { deep: true });
});
</script>

<template>
  <div class="view-content p-4 md:p-6" :class="{ 'printing-active': printingA4 }">
    <!-- Header with tab pills -->
    <div class="no-print flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight">📊 Doanh thu & Báo cáo</h3>
        <p class="text-xs md:text-sm text-slate-500 font-medium">Theo dõi kết quả bán hàng, hóa đơn POS CUKCUK và kết ca bàn giao.</p>
      </div>
      
      <div class="flex bg-slate-100 p-1 rounded-xl shadow-inner max-w-max border border-slate-200 flex-wrap gap-1">
        <button 
          @click="activeTab = 'report'"
          class="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200"
          :class="activeTab === 'report' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'"
        >
          <span class="material-symbols-rounded text-lg">summarize</span>
          Báo cáo ca
        </button>
        <button 
          @click="activeTab = 'invoices'"
          class="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200"
          :class="activeTab === 'invoices' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'"
        >
          <span class="material-symbols-rounded text-lg">receipt_long</span>
          Hóa đơn POS
        </button>
        <button 
          @click="activeTab = 'analytics'"
          class="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200"
          :class="activeTab === 'analytics' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'"
        >
          <span class="material-symbols-rounded text-lg">bar_chart</span>
          Phân tích doanh thu
        </button>
        <button 
          @click="activeTab = 'audit'"
          class="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200"
          :class="activeTab === 'audit' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'"
        >
          <span class="material-symbols-rounded text-lg">history_toggle_off</span>
          Đối soát & Sửa tay
        </button>
      </div>
    </div>

    <!-- TAB 1: BÁO CÁO DOANH THU & PHIẾU BÀN GIAO CA -->
    <div v-if="activeTab === 'report'" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      <!-- Left sidebar controls -->
      <div class="no-print lg:col-span-4 space-y-6">
        <!-- Quick Filters -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-3 no-print">
          <h4 class="font-bold text-slate-800 text-sm tracking-wide uppercase">Lọc nhanh</h4>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="f in [
                { label: 'Hôm nay', value: 'today' },
                { label: 'Hôm qua', value: 'yesterday' },
                { label: '7 ngày qua', value: 'week' },
                { label: 'Tháng này', value: 'month' },
                { label: 'Tháng trước', value: 'lastMonth' },
                { label: 'Quý này', value: 'quarter' },
                { label: 'Năm nay', value: 'year' }
              ]"
              :key="f.value"
              @click="applyQuickFilter(f.value as any)"
              class="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <!-- Date Selector Card -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-800 text-sm tracking-wide uppercase">Chọn kỳ báo cáo</h4>
            <button @click="selectToday" class="text-xs text-primary font-bold hover:underline">Hôm nay</button>
          </div>
          
          <div class="grid grid-cols-5 gap-1 p-1 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-semibold">
            <button 
              v-for="p in (['day', 'week', 'month', 'quarter', 'year'] as const)" 
              :key="p"
              @click="selectedPeriod = p"
              class="py-1.5 rounded-lg transition-all duration-150"
              :class="selectedPeriod === p ? 'bg-white text-slate-900 shadow-sm border border-slate-200/40' : 'text-slate-500 hover:text-slate-900'"
            >
              {{ p === 'day' ? 'Ngày' : p === 'week' ? 'Tuần' : p === 'month' ? 'Tháng' : p === 'quarter' ? 'Quý' : 'Năm' }}
            </button>
          </div>
          
          <!-- Period picker inputs -->
          <div class="flex items-center gap-2">
            <button @click="navigatePeriod('prev')" class="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
              <span class="material-symbols-rounded text-base flex">chevron_left</span>
            </button>
            
            <div class="flex-1">
              <input 
                v-if="selectedPeriod === 'day'"
                type="date" 
                v-model="reportDate" 
                class="form-input w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2"
              />
              <input 
                v-else-if="selectedPeriod === 'week'"
                type="week" 
                v-model="reportWeek"
                class="form-input w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2"
              />
              <input 
                v-else-if="selectedPeriod === 'month'"
                type="month" 
                v-model="reportMonth"
                class="form-input w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2"
              />
              <div v-else-if="selectedPeriod === 'quarter'" class="flex gap-2">
                <select 
                  v-model="reportQuarter" 
                  class="form-select flex-1 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2"
                >
                  <option :value="1">Quý I</option>
                  <option :value="2">Quý II</option>
                  <option :value="3">Quý III</option>
                  <option :value="4">Quý IV</option>
                </select>
                <input 
                  type="number" 
                  v-model="reportQuarterYear" 
                  class="form-input w-20 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2 text-center"
                />
              </div>
              <div v-else-if="selectedPeriod === 'year'" class="flex gap-2">
                <input 
                  type="number" 
                  v-model="reportQuarterYear" 
                  class="form-input w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2 text-center"
                  placeholder="Năm"
                />
              </div>
            </div>
            
            <button @click="navigatePeriod('next')" class="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
              <span class="material-symbols-rounded text-base flex">chevron_right</span>
            </button>
          </div>
        </div>

        <!-- Shift Selector (only for Day period) -->
        <div v-if="selectedPeriod === 'day'" class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-3">
          <h4 class="font-bold text-slate-800 text-sm tracking-wide uppercase">Chọn ca bàn giao</h4>
          
          <div v-if="shiftsForDay.length === 0" class="text-xs text-slate-500 italic p-3 bg-slate-50 border border-slate-100 rounded-xl">
            Không có ca làm việc nào được mở trong ngày này.
          </div>
          
          <select 
            v-else
            v-model="selectedShiftId" 
            class="form-select w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3 py-2"
          >
            <option value="all">Tổng hợp cả ngày ({{ shiftsForDay.length }} ca)</option>
            <option v-for="s in shiftsForDay" :key="s.id" :value="s.id">
              Ca {{ s.shiftNumber }} ({{ s.cashierName }})
            </option>
          </select>
        </div>

        <!-- Card Stats summary -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
          <h4 class="font-bold text-slate-800 text-sm tracking-wide uppercase">Doanh thu tổng hợp</h4>
          <div class="space-y-3">
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Tổng doanh thu</span>
              <span class="font-extrabold text-emerald-600 text-base md:text-lg">{{ formatCurrency(summaryData.total) }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Tiền mặt</span>
              <span class="font-bold text-slate-700 text-sm">{{ formatCurrency(summaryData.cash) }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Quẹt thẻ</span>
              <span class="font-bold text-slate-700 text-sm">{{ formatCurrency(summaryData.card) }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Chuyển khoản</span>
              <span class="font-bold text-slate-700 text-sm">{{ formatCurrency(summaryData.transfer) }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Trung bình / Bill</span>
              <span class="font-bold text-slate-700 text-sm">{{ formatCurrency(summaryData.avgPerBill) }}</span>
            </div>
            <div class="flex justify-between items-center py-2">
              <span class="text-slate-500 font-medium text-xs md:text-sm">Chưa thanh toán</span>
              <span class="font-bold text-rose-600 text-sm">{{ formatCurrency(summaryData.unpaid) }}</span>
            </div>
          </div>
        </div>

        <!-- CSV Export & Details -->
        <div class="flex gap-2">
          <button @click="exportCSV" class="btn btn-outline flex-1 flex justify-center items-center gap-2 border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl hover:bg-slate-50 text-sm">
            <span class="material-symbols-rounded text-lg">download</span>
            Xuất CSV
          </button>
        </div>
      </div>

      <!-- Right Handover Report Sheet / Item Sales Table -->
      <div class="lg:col-span-8 space-y-6">
        
        <!-- Overview Aggregate Cards (when showing summary for the whole period) -->
        <div v-if="selectedPeriod !== 'day' || selectedShiftId === 'all'" class="grid grid-cols-2 md:grid-cols-4 gap-4 no-print animate-fade-in">
          <!-- Total Revenue Card -->
          <div class="bg-gradient-to-tr from-emerald-50 to-teal-50 border border-emerald-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-emerald-600 uppercase tracking-wide">Tổng doanh thu</span>
              <span class="material-symbols-rounded text-emerald-600 text-lg">trending_up</span>
            </div>
            <div>
              <span class="text-lg font-black text-emerald-700 block">{{ formatCurrency(summaryData.total) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Thực tế đã thu</span>
            </div>
          </div>

          <!-- Cash Card -->
          <div class="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Tiền mặt</span>
              <span class="material-symbols-rounded text-slate-500 text-lg">payments</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-slate-800 block">{{ formatCurrency(summaryData.cash) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Doanh số mặt két</span>
            </div>
          </div>

          <!-- Card Payment -->
          <div class="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Quẹt thẻ</span>
              <span class="material-symbols-rounded text-slate-500 text-lg">credit_card</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-slate-800 block">{{ formatCurrency(summaryData.card) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Qua cổng quẹt POS</span>
            </div>
          </div>

          <!-- Transfer Payment -->
          <div class="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Chuyển khoản</span>
              <span class="material-symbols-rounded text-slate-500 text-lg">swap_horiz</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-slate-800 block">{{ formatCurrency(summaryData.transfer) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Chuyển khoản bank</span>
            </div>
          </div>

          <!-- Bill Count Card -->
          <div class="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Số bill</span>
              <span class="material-symbols-rounded text-slate-500 text-lg">receipt_long</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-slate-800 block">{{ summaryData.bills }} bill</span>
              <span class="text-[9px] text-slate-400 font-medium">Tổng số hóa đơn</span>
            </div>
          </div>

          <!-- Avg per Bill Card -->
          <div class="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Trung bình / Bill</span>
              <span class="material-symbols-rounded text-slate-500 text-lg">analytics</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-slate-800 block">{{ formatCurrency(summaryData.avgPerBill) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Doanh thu / bill</span>
            </div>
          </div>

          <!-- Unpaid Invoices Card -->
          <div class="bg-gradient-to-tr from-rose-50 to-red-50 border border-rose-100 p-4 rounded-2xl shadow-xs flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-rose-600 uppercase tracking-wide">Chưa trả</span>
              <span class="material-symbols-rounded text-rose-600 text-lg">money_off</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-rose-700 block">{{ formatCurrency(summaryData.unpaid) }}</span>
              <span class="text-[9px] text-slate-400 font-medium">Hóa đơn công nợ</span>
            </div>
          </div>
        </div>

        <!-- Daily breakdown bar chart -->
        <div v-if="dailyBreakdown && dailyBreakdown.length > 0 && (selectedPeriod !== 'day' || selectedShiftId === 'all')" class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4 no-print animate-fade-in">
          <div class="flex items-center justify-between border-b border-slate-50 pb-3">
            <h4 class="font-extrabold text-slate-800 text-base">📊 Biểu đồ xu hướng doanh thu</h4>
            <span class="text-xs text-slate-400 font-medium">Doanh thu theo ngày làm việc</span>
          </div>
          
          <div class="overflow-x-auto w-full pt-6">
            <div class="flex items-end min-w-[600px] h-48 border-b border-slate-200 gap-2 px-4 pb-1">
              <div 
                v-for="day in [...dailyBreakdown].reverse()" 
                :key="day.date"
                class="flex flex-col items-center flex-1 group relative cursor-pointer"
              >
                <!-- Hover Card Details -->
                <div class="absolute bottom-full mb-2 bg-slate-900 text-white rounded-lg text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-28 text-center space-y-1 shadow-md">
                  <div class="font-bold border-b border-slate-800 pb-1 mb-1">{{ formatDate(day.date) }}</div>
                  <div>Doanh thu: {{ formatCurrency(day.total) }}</div>
                  <div>Tiền mặt: {{ formatCurrency(day.cash) }}</div>
                  <div>Chuyển khoản: {{ formatCurrency(day.transfer) }}</div>
                  <div>Quẹt thẻ: {{ formatCurrency(day.card) }}</div>
                  <div>Số bill: {{ day.bills }} bill</div>
                </div>

                <!-- Value above bar -->
                <span class="text-[9px] font-bold text-slate-500 mb-1 group-hover:text-slate-900">{{ shortCurrency(day.total) }}</span>
                
                <!-- Stacked Bar Fill for payment methods -->
                <div class="w-full max-w-[24px] bg-slate-100 rounded-t-lg h-32 flex flex-col justify-end overflow-hidden border border-slate-200/50">
                  <!-- Card amount segment (blue) -->
                  <div 
                    v-if="day.card > 0"
                    class="w-full bg-blue-500 transition-all duration-500 ease-out" 
                    :style="{ height: ((day.card / Math.max(...dailyBreakdown.map(d => d.total), 1)) * 100) + '%' }"
                    title="Quẹt thẻ"
                  ></div>
                  <!-- Transfer amount segment (indigo) -->
                  <div 
                    v-if="day.transfer > 0"
                    class="w-full bg-indigo-500 transition-all duration-500 ease-out" 
                    :style="{ height: ((day.transfer / Math.max(...dailyBreakdown.map(d => d.total), 1)) * 100) + '%' }"
                    title="Chuyển khoản"
                  ></div>
                  <!-- Cash amount segment (emerald) -->
                  <div 
                    v-if="day.cash > 0"
                    class="w-full bg-emerald-500 transition-all duration-500 ease-out" 
                    :style="{ height: ((day.cash / Math.max(...dailyBreakdown.map(d => d.total), 1)) * 100) + '%' }"
                    title="Tiền mặt"
                  ></div>
                </div>
                
                <!-- Label below bar -->
                <span class="text-[9px] font-bold text-slate-600 mt-2 truncate w-full text-center">
                  {{ day.date.substring(8, 10) }}/{{ day.date.substring(5, 7) }}
                </span>
              </div>
            </div>
          </div>
          <!-- Legend -->
          <div class="flex items-center gap-4 justify-center text-[10px] font-bold text-slate-500 pt-2">
            <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-emerald-500 rounded-xs"></span> Tiền mặt</span>
            <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-indigo-500 rounded-xs"></span> Chuyển khoản</span>
            <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-blue-500 rounded-xs"></span> Quẹt thẻ</span>
          </div>
        </div>

        <!-- Shift Handover Report preview widget -->
        <div v-if="selectedPeriod === 'day' && selectedShiftId !== 'all'" class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
          <div class="no-print flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <h4 class="font-bold text-slate-800 text-sm">Xem trước phiếu bàn giao</h4>
            </div>
            
            <div class="flex gap-2">
              <button 
                @click="showConfigModal = true" 
                class="btn btn-outline btn-sm text-xs border border-slate-200 text-slate-600 font-bold py-1.5 px-3 rounded-lg hover:bg-slate-50"
              >
                <span class="material-symbols-rounded text-sm align-middle mr-1">tune</span>Cấu hình
              </button>
              <button 
                @click="isA4Preview = !isA4Preview" 
                class="btn btn-outline btn-sm text-xs border border-slate-200 text-slate-600 font-bold py-1.5 px-3 rounded-lg hover:bg-slate-50"
              >
                <span class="material-symbols-rounded text-sm align-middle mr-1">preview</span>Xem A4
              </button>
              <button 
                @click="printHandover" 
                class="btn btn-primary btn-sm text-xs bg-slate-900 text-white font-bold py-1.5 px-3 rounded-lg hover:bg-slate-800"
              >
                <span class="material-symbols-rounded text-sm align-middle mr-1">print</span>In phiếu
              </button>
            </div>
          </div>

          <!-- Printable handover sheet -->
          <div :class="{ 'a4-preview-mode': isA4Preview, 'a4-sheet': true, 'bg-slate-50/50': isA4Preview }">
            <div class="a4-inner text-slate-800 text-[12px] leading-relaxed p-6" id="a4Handover">
              
              <!-- Header -->
              <div class="flex justify-between items-start mb-4">
                <div>
                  <div class="font-extrabold text-sm flex items-center gap-2">
                    <img src="/android-chrome-192x192.png" class="w-6 h-6 object-contain" alt="Logo" />
                    <span>{{ settingsStore.settings.storeName || "KING's GRILL" }}</span>
                  </div>
                  <div class="text-[10px] text-slate-500 font-medium max-w-xs">{{ settingsStore.settings.storeAddress }}</div>
                </div>
                <div class="text-right">
                  <div class="font-bold text-slate-900 text-base uppercase">Phiếu Bàn Giao Ca</div>
                  <div v-if="handoverDetails?.isSupplemental" class="text-[10px] text-amber-600 font-extrabold tracking-wide">
                    (PHIÊN BẢN CẬP NHẬT {{ handoverDetails.target.reclosedAt ? '— ' + formatDateTime(handoverDetails.target.reclosedAt) : '' }})
                  </div>
                  <div v-else class="text-[10px] text-slate-400 font-medium">Báo cáo tạm tính</div>
                </div>
              </div>
              
              <div class="h-px bg-slate-200 my-3"></div>
              
              <!-- Info Grid -->
              <div class="grid grid-cols-2 gap-y-1 text-slate-600 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div><span class="font-medium text-slate-500">Thu ngân:</span> <strong class="text-slate-800 font-semibold">{{ selectedShiftObj?.cashierName }}</strong></div>
                <div><span class="font-medium text-slate-500">Bắt đầu:</span> <span class="text-slate-800 font-semibold">{{ formatDateTime(selectedShiftObj?.startTime) }}</span></div>
                <div><span class="font-medium text-slate-500">Tiền đầu ca:</span> <strong class="text-emerald-700 font-bold">{{ formatCurrency(selectedShiftObj?.startingCash) }}</strong></div>
                <div><span class="font-medium text-slate-500">Kết thúc:</span> <span class="text-slate-800 font-semibold">{{ selectedShiftObj?.endTime ? formatDateTime(selectedShiftObj.endTime) : '(Đang làm việc)' }}</span></div>
              </div>

              <!-- Reopened shift invoice changes diff table -->
              <div v-if="handoverDetails?.isSupplemental && handoverDetails?.diffInvoices?.hasDiff" class="mb-4 bg-amber-50/60 border border-amber-200/60 rounded-xl p-3.5 space-y-2">
                <div class="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                  <span class="material-symbols-rounded text-base">warning</span>
                  BIẾN ĐỘNG HÓA ĐƠN (lệch {{ (handoverDetails.diffInvoices.added.length + handoverDetails.diffInvoices.removed.length + handoverDetails.diffInvoices.modified.length) }} bill)
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-[11px]">
                    <thead>
                      <tr class="bg-amber-100/60 text-amber-800 font-bold border-b border-amber-200/40">
                        <th class="px-2 py-1">Số hóa đơn</th>
                        <th class="px-2 py-1">Bàn</th>
                        <th class="px-2 py-1 text-right">Trạng thái cũ</th>
                        <th class="px-2 py-1 text-right">Trạng thái mới</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-amber-200/20">
                      <tr v-for="inv in handoverDetails.diffInvoices.added" :key="'add-' + inv.refId" class="bg-emerald-50/30">
                        <td class="px-2 py-1.5 text-emerald-700 font-bold">✓ {{ inv.refNo || inv.refId }}</td>
                        <td class="px-2 py-1.5 text-slate-700">{{ inv.tableName || '-' }}</td>
                        <td class="px-2 py-1.5 text-right text-slate-400">Không có</td>
                        <td class="px-2 py-1.5 text-right text-emerald-700 font-bold">+{{ formatCurrency(inv.amount) }}</td>
                      </tr>
                      <tr v-for="inv in handoverDetails.diffInvoices.removed" :key="'rem-' + inv.refId" class="bg-rose-50/30">
                        <td class="px-2 py-1.5 text-rose-700 font-bold text-decoration-line-through">✗ {{ inv.refNo || inv.refId }}</td>
                        <td class="px-2 py-1.5 text-slate-700">{{ inv.tableName || '-' }}</td>
                        <td class="px-2 py-1.5 text-right text-rose-600">{{ formatCurrency(inv.amount) }}</td>
                        <td class="px-2 py-1.5 text-right text-rose-700 font-bold">Đã hủy/xóa</td>
                      </tr>
                      <tr v-for="item in handoverDetails.diffInvoices.modified" :key="'mod-' + item.current.refId" class="bg-amber-50/30">
                        <td class="px-2 py-1.5 text-amber-700 font-bold">✎ {{ item.current.refNo || item.current.refId }}</td>
                        <td class="px-2 py-1.5 text-slate-700">{{ item.current.tableName || '-' }}</td>
                        <td class="px-2 py-1.5 text-right text-slate-500 line-through">
                          {{ item.original.payments?.map((p: any) => (p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦') + formatCurrency(p.amount)).join(', ') || formatCurrency(item.original.amount) }}
                        </td>
                        <td class="px-2 py-1.5 text-right text-amber-700 font-bold">
                          {{ item.current.payments?.map((p: any) => (p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦') + formatCurrency(p.amount)).join(', ') || formatCurrency(item.current.amount) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Main Sections Ordered by config -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <template v-for="key in layoutConfig.order" :key="key">
                  <div v-if="layoutConfig.visible[key]" class="w-full">
                    
                    <!-- 1. CUKCUK REVENUE -->
                    <div v-if="key === 'cukcuk' && handoverDetails && handoverDetails.sm.billCount > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-primary pl-2 uppercase text-[11px] tracking-wide">▌ Doanh thu CUKCUK ({{ handoverDetails.sm.billCount }} bill)</div>
                      <table class="w-full text-xs">
                        <tbody>
                          <tr class="border-b border-slate-50 py-1 flex justify-between">
                            <td class="text-slate-500 font-medium">Tiền mặt</td>
                            <td class="font-bold text-slate-800">{{ formatCurrency(handoverDetails.sm.cashIncome) }}</td>
                          </tr>
                          <tr class="border-b border-slate-50 py-1 flex justify-between">
                            <td class="text-slate-500 font-medium">Quẹt thẻ</td>
                            <td class="font-bold text-slate-800">{{ formatCurrency(handoverDetails.sm.cardIncome) }}</td>
                          </tr>
                          <tr class="py-1 flex justify-between">
                            <td class="text-slate-500 font-medium">Chuyển khoản</td>
                            <td class="font-bold text-slate-800">{{ formatCurrency(handoverDetails.sm.transferIncome) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-slate-900 bg-slate-50/50 px-1">
                            <td>Tổng cộng</td>
                            <td class="text-primary">{{ formatCurrency(handoverDetails.sm.totalIncome) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 2. EXPENSES -->
                    <div v-if="key === 'expense' && handoverDetails && handoverDetails.expenseTxs.length > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-rose-500 pl-2 uppercase text-[11px] tracking-wide">▌ Chi trong ca ({{ handoverDetails.expenseTxs.length }})</div>
                      <table class="w-full text-xs">
                        <tbody>
                          <tr v-for="t in handoverDetails.expenseTxs" :key="t.id" class="border-b border-slate-50 py-1 flex justify-between text-rose-600">
                            <td class="text-slate-500 font-medium overflow-hidden text-ellipsis truncate max-w-[120px]">✗ {{ t.note || 'Chi phí' }}</td>
                            <td class="font-semibold">-{{ formatCurrency(t.amount) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-rose-600 bg-slate-50/50 px-1">
                            <td>Tổng chi</td>
                            <td>-{{ formatCurrency(handoverDetails.totalExpenseAmt) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 3. MANUAL INCOMES -->
                    <div v-if="key === 'manual' && handoverDetails && handoverDetails.manualIncomeTxs.length > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-emerald-500 pl-2 uppercase text-[11px] tracking-wide">▌ Thu ngoài POS ({{ handoverDetails.manualIncomeTxs.length }})</div>
                      <table class="w-full text-xs">
                        <tbody>
                          <tr v-for="t in handoverDetails.manualIncomeTxs" :key="t.id" class="border-b border-slate-50 py-1 flex justify-between text-emerald-600">
                            <td class="text-slate-500 font-medium overflow-hidden text-ellipsis truncate max-w-[120px]">✓ {{ t.note || 'Thu nhập' }}</td>
                            <td class="font-semibold">+{{ formatCurrency(t.amount) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-emerald-600 bg-slate-50/50 px-1">
                            <td>Tổng thu ngoài</td>
                            <td>+{{ formatCurrency(handoverDetails.totalManualIncome) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 4. SUMMARY (REAL VS EXPECTED) -->
                    <div v-if="key === 'summary' && handoverDetails" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2 col-span-1 md:col-span-2">
                      <div class="font-bold text-slate-700 border-l-4 border-indigo-500 pl-2 uppercase text-[11px] tracking-wide">▌ Bảng Tổng Kết</div>
                      <table class="w-full text-xs">
                        <tbody class="space-y-1 flex flex-col">
                          <tr v-if="handoverDetails.sm.cashIncome > 0" class="flex justify-between">
                            <td class="text-slate-500 font-medium">Tiền mặt CUKCUK ({{ handoverDetails.sm.billCount }} bill)</td>
                            <td class="font-bold text-slate-800">{{ formatCurrency(handoverDetails.sm.cashIncome) }}</td>
                          </tr>
                          <tr v-if="handoverDetails.totalManualIncome > 0" class="flex justify-between">
                            <td class="text-slate-500 font-medium">Thu ngoài POS</td>
                            <td class="font-bold text-slate-800">+{{ formatCurrency(handoverDetails.totalManualIncome) }}</td>
                          </tr>
                          <tr v-if="handoverDetails.totalExpenseAmt > 0" class="flex justify-between text-rose-600">
                            <td class="text-slate-500 font-medium">Chi phí trong ca</td>
                            <td class="font-bold">-{{ formatCurrency(handoverDetails.totalExpenseAmt) }}</td>
                          </tr>
                          <tr class="flex justify-between">
                            <td class="text-slate-500 font-medium">Tiền mặt đầu ca</td>
                            <td class="font-bold text-slate-800">{{ formatCurrency(selectedShiftObj?.startingCash) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-150 pt-1.5 flex justify-between font-extrabold text-slate-900 text-xs px-1 bg-slate-50">
                            <td>Tiền mặt kỳ vọng</td>
                            <td class="text-slate-900">{{ formatCurrency(handoverDetails.expectedCash) }}</td>
                          </tr>
                          <tr class="flex justify-between font-bold text-slate-800 text-xs px-1">
                            <td>Tiền mặt kiểm thực tế</td>
                            <td>{{ formatCurrency(handoverDetails.cashCountTotal) }}</td>
                          </tr>
                          <tr 
                            class="border-t border-dashed border-slate-200 mt-1 pt-1 flex justify-between font-extrabold text-xs px-1"
                            :class="Math.abs(handoverDetails.discrepancy) > 0 ? 'text-rose-600 bg-rose-50/50' : 'text-emerald-600 bg-emerald-50/50'"
                          >
                            <td>CHÊNH LỆCH KÉT</td>
                            <td>{{ handoverDetails.discrepancy === 0 ? '✓ Khớp 0 đ' : (handoverDetails.discrepancy > 0 ? '+' : '') + formatCurrency(handoverDetails.discrepancy) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 5. RETENTION MONEY (KET) -->
                    <div v-if="key === 'ket' && handoverDetails && handoverDetails.ketRows.length > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-amber-500 pl-2 uppercase text-[11px] tracking-wide">▌ Tiền giữ lại (Két)</div>
                      <table class="w-full text-xs">
                        <tbody class="space-y-0.5">
                          <tr v-for="(row, idx) in handoverDetails.ketRows" :key="'ket-'+idx" class="flex justify-between py-0.5">
                            <td class="text-slate-500 font-medium">{{ row.label }}</td>
                            <td class="font-semibold text-slate-800">{{ formatCurrency(row.value) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-amber-700 bg-slate-50/50 px-1">
                            <td>Tổng két</td>
                            <td>{{ formatCurrency(handoverDetails.ketTotal) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 6. HANDOVER CASH -->
                    <div v-if="key === 'handover' && handoverDetails && handoverDetails.handRows.length > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-emerald-500 pl-2 uppercase text-[11px] tracking-wide">▌ Tiền bàn giao ca</div>
                      <table class="w-full text-xs">
                        <tbody class="space-y-0.5">
                          <tr v-for="(row, idx) in handoverDetails.handRows" :key="'hand-'+idx" class="flex justify-between py-0.5">
                            <td class="text-slate-500 font-medium">{{ row.label }}</td>
                            <td class="font-semibold text-slate-800">{{ formatCurrency(row.value) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-emerald-700 bg-slate-50/50 px-1">
                            <td>Tổng bàn giao</td>
                            <td>{{ formatCurrency(handoverDetails.handTotal) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <!-- 7. GENERAL DETAILS (CASH COUNT DETAILS) -->
                    <div v-if="key === 'general' && handoverDetails && handoverDetails.generalRows.length > 0" class="border border-slate-100 rounded-xl p-3 bg-white space-y-2">
                      <div class="font-bold text-slate-700 border-l-4 border-indigo-500 pl-2 uppercase text-[11px] tracking-wide">▌ Chi tiết kiểm kê tiền</div>
                      <table class="w-full text-xs">
                        <tbody class="space-y-0.5">
                          <tr v-for="(row, idx) in handoverDetails.generalRows" :key="'gen-'+idx" class="flex justify-between py-0.5">
                            <td class="text-slate-500 font-medium">{{ row.label }}</td>
                            <td class="font-semibold text-slate-800">{{ formatCurrency(row.value) }}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr class="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-indigo-700 bg-slate-50/50 px-1">
                            <td>Tổng kiểm kê</td>
                            <td>{{ formatCurrency(handoverDetails.generalTotal) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                  </div>
                </template>
              </div>

              <!-- Signatures Section -->
              <div class="grid grid-cols-3 gap-4 text-center mt-6 text-[10px] text-slate-600 font-semibold pt-4">
                <div class="space-y-12">
                  <div>Người giao ca</div>
                  <div class="text-slate-900 font-bold border-t border-slate-100 pt-1">{{ selectedShiftObj?.cashierName }}</div>
                </div>
                <div class="space-y-12">
                  <div>Người nhận ca</div>
                  <div class="text-slate-300 border-t border-slate-100 pt-1">(Ký tên)</div>
                </div>
                <div class="space-y-12">
                  <div>Quản lý xác nhận</div>
                  <div class="text-slate-300 border-t border-slate-100 pt-1">(Ký tên)</div>
                </div>
              </div>

              <div class="h-px bg-dashed bg-slate-300 my-4"></div>

              <!-- Footer -->
              <div class="text-[9px] text-slate-400 font-medium flex justify-between items-center">
                <span>In lúc: {{ new Date().toLocaleString('vi-VN') }}</span>
                <span>{{ settingsStore.settings.storeName }} - Báo cáo bàn giao ca</span>
              </div>

            </div>
          </div>
        </div>

        <!-- Detailed Item Sales Card breakdown -->
        <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h4 class="font-extrabold text-slate-800 text-base">🍽️ Doanh số bán món chi tiết</h4>
              <p class="text-xs text-slate-500 font-medium">Danh sách các món ăn & đồ uống bán ra trong kỳ.</p>
            </div>
            <span class="text-xs bg-indigo-50 text-indigo-600 font-bold px-2.5 py-1 rounded-full border border-indigo-100 self-start">
              {{ detailedItemSales.length }} món đã bán
            </span>
          </div>

          <div v-if="detailedItemSales.length === 0" class="text-center py-8 text-slate-400 text-xs italic">
            Không tìm thấy thông tin món ăn nào bán ra trong kỳ báo cáo này.
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Food List -->
            <div class="space-y-3">
              <div class="font-bold text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 tracking-wide uppercase">🍔 Đồ ăn</div>
              <div class="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                <div v-for="item in detailedItemSales.filter(i => i.category === 'Đồ ăn')" :key="item.name" class="space-y-1">
                  <div class="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{{ item.name }}</span>
                    <span>{{ item.quantity }} suất</span>
                  </div>
                  <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div class="bg-orange-500 h-full rounded-full transition-all duration-300" :style="{ width: (item.quantity / maxItemQty) * 100 + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Drinks List -->
            <div class="space-y-3">
              <div class="font-bold text-xs text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1.5 tracking-wide uppercase">🍻 Đồ uống</div>
              <div class="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                <div v-for="item in detailedItemSales.filter(i => i.category === 'Đồ uống')" :key="item.name" class="space-y-1">
                  <div class="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{{ item.name }}</span>
                    <span>{{ item.quantity }} ly/lon</span>
                  </div>
                  <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div class="bg-teal-500 h-full rounded-full transition-all duration-300" :style="{ width: (item.quantity / maxItemQty) * 100 + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Table displaying revenue daily details -->
        <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
          <h4 class="font-extrabold text-slate-800 text-base">📅 Chi tiết doanh thu theo ngày</h4>
          <div class="overflow-x-auto border border-slate-150 rounded-xl">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-150">
                <tr>
                  <th class="px-4 py-3">Ngày</th>
                  <th class="px-4 py-3 text-center">Ca bán</th>
                  <th class="px-4 py-3 text-center">Tổng bill</th>
                  <th class="px-4 py-3 text-right">Tiền mặt</th>
                  <th class="px-4 py-3 text-right">Quẹt thẻ</th>
                  <th class="px-4 py-3 text-right">Chuyển khoản</th>
                  <th class="px-4 py-3 text-right font-bold">Doanh thu</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
                <tr v-for="row in dailyBreakdown" :key="row.date" class="hover:bg-slate-50/60 transition-all duration-150">
                  <td class="px-4 py-3.5 font-bold text-slate-900">{{ formatDate(row.date) }}</td>
                  <td class="px-4 py-3.5 text-center">{{ row.shifts }}</td>
                  <td class="px-4 py-3.5 text-center text-slate-500">{{ row.bills }}</td>
                  <td class="px-4 py-3.5 text-right text-emerald-600">{{ formatCurrency(row.cash) }}</td>
                  <td class="px-4 py-3.5 text-right text-blue-600">{{ formatCurrency(row.card) }}</td>
                  <td class="px-4 py-3.5 text-right text-indigo-600">{{ formatCurrency(row.transfer) }}</td>
                  <td class="px-4 py-3.5 text-right font-bold text-slate-900 bg-slate-50/20">{{ formatCurrency(row.total) }}</td>
                </tr>
                <tr v-if="dailyBreakdown.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-slate-400 italic">Không tìm thấy dữ liệu doanh thu trong kỳ này.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>

    <!-- TAB 2: DANH SÁCH HÓA ĐƠN POS CUKCUK -->
    <div v-else-if="activeTab === 'invoices'" class="space-y-6">
      
      <!-- Top actions & filter bar -->
      <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <h4 class="font-extrabold text-slate-800 text-base">Hóa đơn POS CUKCUK</h4>
            <button 
              @click="triggerCukcukSync"
              :disabled="isSyncing"
              class="btn btn-outline flex items-center gap-1.5 border border-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-lg hover:bg-slate-50 text-xs disabled:opacity-50"
            >
              <span class="material-symbols-rounded text-sm flex" :class="{ 'animate-spin': isSyncing }">sync</span>
              Đồng bộ CUKCUK
            </button>
          </div>
          
          <div class="flex flex-wrap items-center gap-2">
            <!-- Period Selector -->
            <select 
              v-model="invoicePeriod"
              class="form-select text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary px-3 py-1.5"
            >
              <option value="day">Hôm nay</option>
              <option value="week">7 ngày qua</option>
              <option value="month">Tháng này</option>
              <option value="quarter">Quý này</option>
              <option value="year">Năm nay</option>
            </select>
            
            <input 
              type="date"
              v-model="invoiceDate"
              class="form-input text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary px-3 py-1.5"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <!-- Text search -->
          <div class="md:col-span-7 relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <span class="material-symbols-rounded text-lg">search</span>
            </span>
            <input 
              type="text" 
              v-model="invoiceSearchQuery" 
              placeholder="Tìm theo mã bill, tên bàn, thu ngân..."
              class="form-input pl-10 pr-4 py-2 w-full text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:ring-primary-500"
            />
          </div>
          
          <!-- Payment method filter -->
          <div class="md:col-span-5 select-wrapper">
            <select 
              v-model="invoicePaymentFilter" 
              class="form-select w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-primary focus:ring-primary px-3 py-2"
            >
              <option value="all">Hình thức: Tất cả</option>
              <option value="cash">Tiền mặt</option>
              <option value="card">Quẹt thẻ</option>
              <option value="transfer">Chuyển khoản</option>
              <option value="manually_edited">Hóa đơn sửa tay ✎</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Payment percentage distribution bars -->
      <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <h5 class="font-extrabold text-slate-800 text-sm">Hình thức thanh toán của kỳ đang chọn</h5>
        <div class="space-y-3">
          <!-- Cash bar -->
          <div class="flex justify-between items-center text-xs font-semibold text-slate-600 gap-4">
            <span class="w-24 text-emerald-600 flex items-center gap-1"><span class="material-symbols-rounded text-base">payments</span> Tiền mặt</span>
            <div class="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                class="bg-emerald-500 h-full rounded-full transition-all duration-300"
                :style="{ width: (summaryData.total > 0 ? (summaryData.cash / summaryData.total) * 100 : 0) + '%' }"
              ></div>
            </div>
            <span class="w-32 text-right font-bold">{{ formatCurrency(summaryData.cash) }} ({{ summaryData.total > 0 ? Math.round((summaryData.cash / summaryData.total) * 100) : 0 }}%)</span>
          </div>

          <!-- Card bar -->
          <div class="flex justify-between items-center text-xs font-semibold text-slate-600 gap-4">
            <span class="w-24 text-blue-600 flex items-center gap-1"><span class="material-symbols-rounded text-base">credit_card</span> Quẹt thẻ</span>
            <div class="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                class="bg-blue-500 h-full rounded-full transition-all duration-300"
                :style="{ width: (summaryData.total > 0 ? (summaryData.card / summaryData.total) * 100 : 0) + '%' }"
              ></div>
            </div>
            <span class="w-32 text-right font-bold">{{ formatCurrency(summaryData.card) }} ({{ summaryData.total > 0 ? Math.round((summaryData.card / summaryData.total) * 100) : 0 }}%)</span>
          </div>

          <!-- Transfer bar -->
          <div class="flex justify-between items-center text-xs font-semibold text-slate-600 gap-4">
            <span class="w-24 text-indigo-600 flex items-center gap-1"><span class="material-symbols-rounded text-base">swap_horiz</span> Chuyển khoản</span>
            <div class="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                class="bg-indigo-500 h-full rounded-full transition-all duration-300"
                :style="{ width: (summaryData.total > 0 ? (summaryData.transfer / summaryData.total) * 100 : 0) + '%' }"
              ></div>
            </div>
            <span class="w-32 text-right font-bold">{{ formatCurrency(summaryData.transfer) }} ({{ summaryData.total > 0 ? Math.round((summaryData.transfer / summaryData.total) * 100) : 0 }}%)</span>
          </div>
        </div>
      </div>

      <!-- Invoices List Table -->
      <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <div class="flex justify-between items-center">
          <h4 class="font-extrabold text-slate-800 text-base">Danh sách hóa đơn</h4>
          <span class="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
            Hiển thị {{ filteredInvoices.length }} / {{ invoices.length }} bill
          </span>
        </div>

        <div class="overflow-x-auto border border-slate-150 rounded-xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-150">
              <tr>
                <th class="px-4 py-3">Mã Bill</th>
                <th class="px-4 py-3">Bàn</th>
                <th class="px-4 py-3">Thu ngân</th>
                <th class="px-4 py-3 text-center">Thời gian</th>
                <th class="px-4 py-3 text-right">Tiền mặt</th>
                <th class="px-4 py-3 text-right">Quẹt thẻ</th>
                <th class="px-4 py-3 text-right">Chuyển khoản</th>
                <th class="px-4 py-3 text-right font-bold">Tổng thanh toán</th>
                <th class="px-4 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              <tr 
                v-for="inv in filteredInvoices" 
                :key="inv.refId"
                class="hover:bg-slate-50/60 transition-all duration-150"
                :class="{ 'bg-amber-50/40 border-l-4 border-l-amber-500': inv.manualOverride || (inv as any).isManuallyEdited }"
              >
                <td class="px-4 py-3.5 font-bold text-slate-900 flex items-center gap-1">
                  <span>{{ inv.refNo || inv.refId.substring(0, 8) }}</span>
                  <span v-if="inv.manualOverride || (inv as any).isManuallyEdited" class="text-amber-600 text-xs flex" title="Hóa đơn sửa tay"><span class="material-symbols-rounded text-sm">edit_note</span></span>
                </td>
                <td class="px-4 py-3.5">{{ inv.tableName || '-' }}</td>
                <td class="px-4 py-3.5 text-slate-500">{{ inv.employeeName }}</td>
                <td class="px-4 py-3.5 text-center">{{ formatDateTime(inv.refDate) }}</td>
                
                <!-- Computed payment columns -->
                <td class="px-4 py-3.5 text-right font-semibold text-emerald-600">
                  {{ formatCurrency(inv.payments?.find(p => p.method === 'cash')?.amount || 0) }}
                </td>
                <td class="px-4 py-3.5 text-right font-semibold text-blue-600">
                  {{ formatCurrency(inv.payments?.find(p => p.method === 'card')?.amount || 0) }}
                </td>
                <td class="px-4 py-3.5 text-right font-semibold text-indigo-600">
                  {{ formatCurrency(inv.payments?.find(p => p.method === 'transfer')?.amount || 0) }}
                </td>
                
                <td class="px-4 py-3.5 text-right font-bold text-slate-900 bg-slate-50/20">{{ formatCurrency(inv.amount) }}</td>
                <td class="px-4 py-3.5 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button 
                      @click="triggerSingleInvoiceSync(inv.refId)"
                      class="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-all duration-150"
                      title="Đồng bộ lại bill này"
                    >
                      <span class="material-symbols-rounded text-base flex">sync</span>
                    </button>
                    <button 
                      @click="openEditPaymentModal(inv)"
                      class="p-1 hover:bg-slate-100 rounded text-amber-600 hover:text-amber-700 transition-all duration-150"
                      title="Sửa hình thức thanh toán"
                    >
                      <span class="material-symbols-rounded text-base flex">edit</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredInvoices.length === 0">
                <td colspan="9" class="px-4 py-8 text-center text-slate-400 italic">Không có hóa đơn nào khớp với bộ lọc tìm kiếm.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- TAB 3: PHÂN TÍCH DOANH THU & BIỂU ĐỒ 7 NGÀY -->
    <div v-else-if="activeTab === 'analytics'" class="space-y-6">
      
      <!-- Summary stats with percentage comparison indicators -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Monthly Revenue -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center gap-4">
          <div class="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <span class="material-symbols-rounded text-2xl flex">calendar_month</span>
          </div>
          <div>
            <div class="text-xs text-slate-500 font-semibold">Doanh thu tháng này</div>
            <div class="font-black text-slate-800 text-lg md:text-xl flex items-center gap-2">
              {{ formatCurrency(analyticsSummary.currentMonthTotal) }}
              <span 
                class="text-xs font-bold flex items-center"
                :class="getPercentageChange(analyticsSummary.currentMonthTotal, analyticsSummary.prevMonthTotal) >= 0 ? 'text-emerald-600' : 'text-rose-600'"
              >
                <span class="material-symbols-rounded text-sm flex">
                  {{ getPercentageChange(analyticsSummary.currentMonthTotal, analyticsSummary.prevMonthTotal) >= 0 ? 'trending_up' : 'trending_down' }}
                </span>
                {{ getPercentageChange(analyticsSummary.currentMonthTotal, analyticsSummary.prevMonthTotal) }}%
              </span>
            </div>
            <div class="text-[10px] text-slate-400 font-medium">Tháng trước: {{ formatCurrency(analyticsSummary.prevMonthTotal) }}</div>
          </div>
        </div>

        <!-- Weekly Revenue -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center gap-4">
          <div class="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <span class="material-symbols-rounded text-2xl flex">date_range</span>
          </div>
          <div>
            <div class="text-xs text-slate-500 font-semibold">Doanh thu 7 ngày qua</div>
            <div class="font-black text-slate-800 text-lg md:text-xl flex items-center gap-2">
              {{ formatCurrency(analyticsSummary.currentWeekTotal) }}
              <span 
                class="text-xs font-bold flex items-center"
                :class="getPercentageChange(analyticsSummary.currentWeekTotal, analyticsSummary.prevWeekTotal) >= 0 ? 'text-emerald-600' : 'text-rose-600'"
              >
                <span class="material-symbols-rounded text-sm flex">
                  {{ getPercentageChange(analyticsSummary.currentWeekTotal, analyticsSummary.prevWeekTotal) >= 0 ? 'trending_up' : 'trending_down' }}
                </span>
                {{ getPercentageChange(analyticsSummary.currentWeekTotal, analyticsSummary.prevWeekTotal) }}%
              </span>
            </div>
            <div class="text-[10px] text-slate-400 font-medium">7 ngày trước: {{ formatCurrency(analyticsSummary.prevWeekTotal) }}</div>
          </div>
        </div>

        <!-- Monthly Expenses -->
        <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center gap-4">
          <div class="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
            <span class="material-symbols-rounded text-2xl flex">money_off</span>
          </div>
          <div>
            <div class="text-xs text-slate-500 font-semibold">Chi phí tháng này</div>
            <div class="font-black text-slate-800 text-lg md:text-xl">
              {{ formatCurrency(analyticsSummary.currentMonthExpense) }}
            </div>
            <div class="text-[10px] text-slate-400 font-medium">Chi tiêu mặt và thanh toán nhà cung cấp</div>
          </div>
        </div>
      </div>

      <!-- Pure CSS/HTML bar chart of 7 days -->
      <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <h4 class="font-extrabold text-slate-800 text-base">📊 Biểu đồ doanh thu 7 ngày qua</h4>
        
        <div class="flex items-end justify-between h-48 pt-6 border-b border-slate-200 gap-1.5 md:gap-4 px-2 md:px-6">
          <div 
            v-for="day in analyticsChartDays" 
            :key="day.date"
            class="flex flex-col items-center flex-1 group relative cursor-pointer"
          >
            <!-- Hover Card Details -->
            <div class="absolute bottom-full mb-2 bg-slate-900 text-white rounded-lg text-[10px] p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-28 text-center space-y-1 shadow-md">
              <div class="font-bold border-b border-slate-800 pb-1 mb-1">{{ formatDate(day.date) }}</div>
              <div>Doanh thu: {{ formatCurrency(day.total) }}</div>
              <div>Số bill: {{ day.bills }} bill</div>
            </div>

            <!-- Value above bar -->
            <span class="text-[9px] font-bold text-slate-500 mb-1 group-hover:text-slate-900">{{ shortCurrency(day.total) }}</span>
            
            <!-- Bar Fill -->
            <div class="w-full max-w-[32px] bg-slate-100 rounded-t-lg h-36 flex items-end overflow-hidden border border-slate-200/50">
              <div 
                class="w-full bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t-lg transition-all duration-500 ease-out"
                :style="{ height: Math.max(2, (day.total / (Math.max(...analyticsChartDays.map(d => d.total), 1))) * 100) + '%' }"
              ></div>
            </div>
            
            <!-- Label below bar -->
            <span class="text-[9px] font-bold text-slate-600 mt-2 truncate w-full text-center">
              {{ new Date(day.date).toLocaleDateString('vi-VN', { weekday: 'short' }) }}
            </span>
            <span class="text-[8px] text-slate-400 mt-0.5">{{ day.date.substring(8, 10) }}/{{ day.date.substring(5, 7) }}</span>
          </div>
          
          <div v-if="analyticsChartDays.length === 0" class="w-full h-full flex justify-center items-center text-slate-400 text-xs italic">
            Không có dữ liệu 7 ngày qua.
          </div>
        </div>
      </div>

      <!-- Month Detailed Shifts Table -->
      <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <h4 class="font-extrabold text-slate-800 text-base">📅 Chi tiết hoạt động ca làm việc (Tháng này)</h4>
        
        <div class="overflow-x-auto border border-slate-150 rounded-xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-150">
              <tr>
                <th class="px-4 py-3">Ngày</th>
                <th class="px-4 py-3 text-center">Số ca hoạt động</th>
                <th class="px-4 py-3 text-center">Tổng bill</th>
                <th class="px-4 py-3 text-right">Tổng thu (POS + Khác)</th>
                <th class="px-4 py-3 text-right">Tổng chi (Két)</th>
                <th class="px-4 py-3 text-right font-bold">Lợi nhuận ròng</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              <tr 
                v-for="row in [...analyticsMonthlyDays].reverse()" 
                :key="row.date"
                class="hover:bg-slate-50/60 transition-all duration-150"
                v-show="row.totalIncome > 0 || row.totalExpense > 0"
              >
                <td class="px-4 py-3.5 font-bold text-slate-900">{{ formatDate(row.date) }}</td>
                <td class="px-4 py-3.5 text-center text-slate-500">{{ row.shifts }} ca</td>
                <td class="px-4 py-3.5 text-center text-slate-500">{{ row.billCount }} bill</td>
                <td class="px-4 py-3.5 text-right text-emerald-600 font-semibold">{{ formatCurrency(row.totalIncome) }}</td>
                <td class="px-4 py-3.5 text-right text-rose-600 font-semibold">-{{ formatCurrency(row.totalExpense) }}</td>
                <td 
                  class="px-4 py-3.5 text-right font-bold bg-slate-50/20"
                  :class="row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'"
                >
                  {{ formatCurrency(row.net) }}
                </td>
              </tr>
              <tr v-if="analyticsMonthlyDays.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">Chưa ghi nhận ca làm việc nào trong tháng này.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- TAB 4: ĐỐI SOÁT & SỬA TAY (AUDIT) -->
    <div v-else-if="activeTab === 'audit'" class="space-y-6 animate-fade-in">
      <div class="card p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <h3 class="font-extrabold text-slate-800 text-base">🔍 Nhật ký sửa tay và đối soát thanh toán</h3>
        <p class="text-xs text-slate-500 font-semibold mt-1">Danh sách hóa đơn CUKCUK được sửa thủ công phương thức thanh toán.</p>
      </div>

      <div class="card p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <div class="flex justify-between items-center pb-2">
          <h4 class="font-extrabold text-slate-800 text-sm">Hóa đơn đã sửa</h4>
          <span class="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
            {{ invoices.filter(i => i.manualOverride || (i as any).isManuallyEdited).length }} bill sửa đổi
          </span>
        </div>

        <div class="overflow-x-auto w-full border border-slate-150 rounded-xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-150">
              <tr>
                <th class="px-4 py-3">Mã Bill</th>
                <th class="px-4 py-3">Bàn</th>
                <th class="px-4 py-3">Người sửa</th>
                <th class="px-4 py-3">Thời gian sửa</th>
                <th class="px-4 py-3">Lý do sửa</th>
                <th class="px-4 py-3 text-right">Phân bổ gốc (CUKCUK)</th>
                <th class="px-4 py-3 text-right">Phân bổ mới</th>
                <th class="px-4 py-3 text-right font-bold">Tổng tiền</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              <tr 
                v-for="inv in invoices.filter(i => i.manualOverride || (i as any).isManuallyEdited)" 
                :key="'audit-' + inv.refId"
                class="hover:bg-slate-50/60 transition-all duration-150"
              >
                <td class="px-4 py-3.5 font-bold text-slate-900">
                  {{ inv.refNo || inv.refId.substring(0, 8) }}
                </td>
                <td class="px-4 py-3.5">{{ inv.tableName || '-' }}</td>
                <td class="px-4 py-3.5 text-slate-600">
                  {{ (inv as any).overrideBy || 'THU NGÂN' }}
                </td>
                <td class="px-4 py-3.5 text-slate-400">
                  {{ (inv as any).overrideAt ? formatDateTime((inv as any).overrideAt) : '-' }}
                </td>
                <td class="px-4 py-3.5 text-amber-700 max-w-[200px] truncate" :title="(inv as any).overrideReason">
                  {{ (inv as any).overrideReason || 'Sửa thủ công' }}
                </td>
                
                <!-- Original Payments representation -->
                <td class="px-4 py-3.5 text-right font-medium text-slate-400">
                  <div v-for="p in getOriginalPayments(inv)" :key="p.method" class="text-[10px]">
                    {{ p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦' }} {{ formatCurrency(p.amount) }}
                  </div>
                  <div v-if="getOriginalPayments(inv).length === 0" class="text-[10px] italic text-slate-300">Chưa ghi log</div>
                </td>
                
                <!-- Current (Edited) Payments representation -->
                <td class="px-4 py-3.5 text-right font-semibold text-slate-800">
                  <div v-for="p in inv.payments" :key="p.method" class="text-[10px]">
                    {{ p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦' }} {{ formatCurrency(p.amount) }}
                  </div>
                </td>
                
                <td class="px-4 py-3.5 text-right font-bold text-slate-900 bg-slate-50/20">
                  {{ formatCurrency(inv.amount) }}
                </td>
              </tr>
              <tr v-if="invoices.filter(i => i.manualOverride || (i as any).isManuallyEdited).length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-slate-400 italic">Không tìm thấy hóa đơn sửa tay nào trong kỳ này.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- CONFIG REPORT SECTIONS MODAL -->
    <div v-if="showConfigModal" class="no-print fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h4 class="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Cấu hình hiển thị báo cáo</h4>
          <button @click="showConfigModal = false" class="text-slate-400 hover:text-slate-600">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>
        
        <!-- Body -->
        <div class="p-6 overflow-y-auto space-y-4 flex-1">
          <p class="text-xs text-slate-500 font-medium leading-relaxed">
            Kéo thả để sắp xếp thứ tự hiển thị của các phần trên phiếu bàn giao ca. Tick chọn để ẩn/hiện phần tương ứng.
          </p>
          
          <div class="space-y-2">
            <div 
              v-for="(key, index) in layoutConfig.order" 
              :key="key"
              draggable="true"
              @dragstart="handleDragStart(index)"
              @dragover="handleDragOver($event, index)"
              @dragend="handleDragEnd"
              class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-grab hover:bg-slate-100/50 transition-all duration-150"
              :class="{ 'opacity-40': draggedIndex === index }"
            >
              <span class="material-symbols-rounded text-slate-400 text-lg">drag_indicator</span>
              <input 
                type="checkbox" 
                v-model="layoutConfig.visible[key]"
                class="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <span class="text-xs font-bold text-slate-700 flex-1 select-none">{{ sectionLabels[key] }}</span>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-2">
          <button @click="showConfigModal = false" class="btn btn-outline text-xs border border-slate-200 text-slate-600 font-bold py-2 px-4 rounded-xl hover:bg-slate-100">
            Hủy
          </button>
          <button @click="saveLayoutConfig" class="btn btn-primary text-xs bg-slate-900 text-white font-bold py-2 px-4 rounded-xl hover:bg-slate-800">
            Lưu cấu hình
          </button>
        </div>
      </div>
    </div>

    <!-- EDIT INVOICE PAYMENT MODAL -->
    <div v-if="showEditPaymentModal" class="no-print fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-150 overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 class="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Thay đổi thanh toán</h4>
            <span class="text-xs text-slate-400 font-semibold">Hóa đơn: {{ editingInvoice?.refNo || editingInvoice?.refId.substring(0, 12) }}</span>
          </div>
          <button @click="showEditPaymentModal = false" class="text-slate-400 hover:text-slate-600">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>
        
        <!-- Body -->
        <div class="p-6 space-y-4">
          <div class="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-xs flex justify-between items-center">
            <span class="font-semibold text-slate-600">Tổng tiền hóa đơn:</span>
            <strong class="font-black text-slate-900 text-sm">{{ formatCurrency(editingInvoice?.amount) }}</strong>
          </div>
          
          <div class="space-y-3.5">
            <!-- Cash Input -->
            <div class="space-y-1">
              <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><span class="material-symbols-rounded text-sm text-emerald-600">payments</span> Tiền mặt</label>
              <input 
                type="number" 
                v-model.number="editCash"
                class="form-input w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3.5 py-2"
              />
            </div>

            <!-- Card Input -->
            <div class="space-y-1">
              <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><span class="material-symbols-rounded text-sm text-blue-600">credit_card</span> Quẹt thẻ</label>
              <input 
                type="number" 
                v-model.number="editCard"
                class="form-input w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3.5 py-2"
              />
            </div>

            <!-- Transfer Input -->
            <div class="space-y-1">
              <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><span class="material-symbols-rounded text-sm text-indigo-600">swap_horiz</span> Chuyển khoản</label>
              <input 
                type="number" 
                v-model.number="editTransfer"
                class="form-input w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl focus:ring-primary focus:border-primary px-3.5 py-2"
              />
            </div>
          </div>
          
          <!-- Sum Validation Warning -->
          <div 
            class="p-3.5 rounded-xl text-xs font-bold flex items-center justify-between border"
            :class="isEditPaymentValid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'"
          >
            <span>Tổng nhập vào: {{ formatCurrency(editPaymentTotal) }}</span>
            <span v-if="isEditPaymentValid" class="flex items-center gap-1"><span class="material-symbols-rounded text-sm">check_circle</span> Khớp</span>
            <span v-else class="flex items-center gap-1">Lệch: {{ formatCurrency(Math.abs(editPaymentTotal - (editingInvoice?.amount || 0))) }}</span>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-2">
          <button @click="showEditPaymentModal = false" class="btn btn-outline text-xs border border-slate-200 text-slate-600 font-bold py-2 px-4 rounded-xl hover:bg-slate-100">
            Hủy
          </button>
          <button 
            @click="savePaymentOverride" 
            :disabled="!isEditPaymentValid || isSavingPayment"
            class="btn btn-primary text-xs bg-slate-900 text-white font-bold py-2 px-4 rounded-xl hover:bg-slate-800 disabled:opacity-50"
          >
            {{ isSavingPayment ? 'Đang lưu...' : 'Xác nhận sửa' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.form-input, .form-select {
  outline: none;
  transition: all 0.2s ease-in-out;
}
.form-input:focus, .form-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

/* Printing styles wrapper */
@media print {
  body.printing-a4 .no-print {
    display: none !important;
  }
  body.printing-a4 .view-content {
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
  }
  body.printing-a4 .printing-active {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99999;
    background: white;
  }
}
</style>
