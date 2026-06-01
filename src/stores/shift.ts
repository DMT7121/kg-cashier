import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { 
  toMoney, 
  addMoney, 
  subtractMoney, 
  multiplyMoney, 
  getWorkingDayRange, 
  normalizeWorkingDayInput, 
  getWorkingDay,
  todayStr,
  safeJsonParse
} from '../utils';
import { shiftsDb } from '../services/db';
import { getInvoicesByShiftTime } from '../services/invoiceStore';
import { 
  openShiftOnCloud, 
  syncShiftToCloud, 
  closeShiftOnCloud, 
  reopenShiftOnCloud, 
  deleteShiftFromCloud, 
  getShiftsFromCloud, 
  getCurrentShiftFromCloud, 
  getShiftRegistryFromCloud,
  saveConfigToCloud,
  getConfigFromCloud,
  getDeviceId
} from '../services/api';
import { useSettingsStore } from './settings';
import { useAuditsStore } from './audits';
import { useNotificationsStore } from './notifications';
import { Shift, ShiftSummary, CashCountDetail } from '../types/shift';
import { Transaction } from '../types/transaction';

function uid(): string {
  return 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

function _normalizeDateStr(dStr: string): string {
  if (!dStr) return '';
  if (dStr.indexOf('/') > -1) {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  return dStr;
}

export const useShiftStore = defineStore('shift', () => {
  const currentShift = ref<Shift | null>(null);
  const shifts = ref<Shift[]>([]);
  const _recentlyClosedIds = ref<string[]>([]);
  const _forceClosedIds = ref<string[]>([]);
  const _deletedShiftIds = ref<string[]>([]);
  
  const isSyncDirty = ref(false);
  const lastCloudPushTime = ref(0);
  const isSyncTimerActive = ref(false);

  let syncTimer: any = null;
  let closeInProgress = false;
  let historySyncInFlight = false;

  const settingsStore = useSettingsStore();
  const auditsStore = useAuditsStore();
  const notificationsStore = useNotificationsStore();

  async function loadShifts() {
    try {
      const localCurrent = await shiftsDb.getItem<Shift>('kg-current-shift');
      const localHistory = await shiftsDb.getItem<Shift[]>('kg-shifts');
      const recentlyClosed = await shiftsDb.getItem<string[]>('kg-recently-closed');
      const forceClosed = await shiftsDb.getItem<string[]>('kg-force-closed');
      const deletedIds = await shiftsDb.getItem<string[]>('kg-deleted-ids');

      if (localCurrent) currentShift.value = localCurrent;
      if (localHistory) shifts.value = localHistory;
      if (recentlyClosed) _recentlyClosedIds.value = recentlyClosed;
      if (forceClosed) _forceClosedIds.value = forceClosed;
      if (deletedIds) _deletedShiftIds.value = deletedIds;
    } catch (e) {
      console.error('[ShiftStore] Load failed:', e);
    }
  }

  async function save() {
    try {
      await shiftsDb.setItem('kg-current-shift', currentShift.value ? JSON.parse(JSON.stringify(currentShift.value)) : null);
      await shiftsDb.setItem('kg-shifts', JSON.parse(JSON.stringify(shifts.value)));
      await shiftsDb.setItem('kg-recently-closed', JSON.parse(JSON.stringify(_recentlyClosedIds.value)));
      await shiftsDb.setItem('kg-force-closed', JSON.parse(JSON.stringify(_forceClosedIds.value)));
      await shiftsDb.setItem('kg-deleted-ids', JSON.parse(JSON.stringify(_deletedShiftIds.value)));

      // Auto-backup Local Storage
      const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
      const backupObj = {
        currentShift: currentShift.value,
        shifts: shifts.value,
        schemaVersion: 1
      };
      localStorage.setItem('kg-backup-shifts-' + nowStr, JSON.stringify(backupObj));

      // Keep max 5 backups
      const backupKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('kg-backup-shifts-')) {
          backupKeys.push(k);
        }
      }
      if (backupKeys.length > 5) {
        backupKeys.sort();
        for (let j = 0; j < backupKeys.length - 5; j++) {
          localStorage.removeItem(backupKeys[j]);
        }
      }
    } catch (e) {
      console.warn('[ShiftStore] Save failed:', e);
    }
  }

  // ── Shift Summary Calculation ──────────────────────────────────────
  async function getShiftSummary(shift: Shift | null): Promise<ShiftSummary | null> {
    if (!shift) return null;

    let totalIncome = 0;
    let totalExpense = 0;
    let cashIncome = 0;
    let cardIncome = 0;
    let transferIncome = 0;
    let cashExpense = 0;
    let otherIncome = 0;
    let otherExpense = 0;
    let billCount = 0;
    let cukcukRevenue = 0;
    let cukcukBills = 0;
    let manualIncome = 0;
    let manualBills = 0;

    let hasInvoiceStoreData = false;

    // Step 1: Invoices
    if (shift.status === 'closed' && shift.cukcukInvoicesSnapshot && shift.cukcukInvoicesSnapshot.length > 0) {
      const snapInvs = shift.cukcukInvoicesSnapshot;
      cukcukBills = snapInvs.length;
      billCount += cukcukBills;
      for (let k = 0; k < snapInvs.length; k++) {
        const inv = snapInvs[k];
        hasInvoiceStoreData = true;
        let invTotal = 0;
        const payments = inv.payments || [];
        for (let p = 0; p < payments.length; p++) {
          const amt = toMoney(payments[p].amount);
          invTotal = addMoney(invTotal, amt);
          if (payments[p].method === 'cash') cashIncome = addMoney(cashIncome, amt);
          else if (payments[p].method === 'card') cardIncome = addMoney(cardIncome, amt);
          else if (payments[p].method === 'transfer') transferIncome = addMoney(transferIncome, amt);
        }
        const effectiveAmt = invTotal > 0 ? invTotal : toMoney(inv.amount);
        cukcukRevenue = addMoney(cukcukRevenue, effectiveAmt);
        totalIncome = addMoney(totalIncome, effectiveAmt);
      }
    } else if (shift.status === 'closed' && shift.summarySnapshot && shift.summarySnapshot.cukcukRevenue !== undefined) {
      const snap = shift.summarySnapshot;
      cukcukRevenue = toMoney(snap.cukcukRevenue);
      cukcukBills = Number(snap.cukcukBills) || 0;
      totalIncome = addMoney(totalIncome, cukcukRevenue);
      billCount += cukcukBills;
      cashIncome = addMoney(cashIncome, toMoney(snap.cashIncome));
      cardIncome = addMoney(cardIncome, toMoney(snap.cardIncome));
      transferIncome = addMoney(transferIncome, toMoney(snap.transferIncome));
      hasInvoiceStoreData = true;
    } else if (shift.date) {
      try {
        const invoices = await getInvoicesByShiftTime(shift.date, shift.startTime, shift.endTime || undefined);
        for (let k = 0; k < invoices.length; k++) {
          const inv = invoices[k];
          hasInvoiceStoreData = true;
          cukcukBills++;
          billCount++;
          let invTotal = 0;
          const payments = inv.payments || [];
          for (let p = 0; p < payments.length; p++) {
            const amt = toMoney(payments[p].amount);
            invTotal = addMoney(invTotal, amt);
            if (payments[p].method === 'cash') cashIncome = addMoney(cashIncome, amt);
            else if (payments[p].method === 'card') cardIncome = addMoney(cardIncome, amt);
            else if (payments[p].method === 'transfer') transferIncome = addMoney(transferIncome, amt);
          }
          const effectiveAmt = invTotal > 0 ? invTotal : toMoney(inv.amount);
          cukcukRevenue = addMoney(cukcukRevenue, effectiveAmt);
          totalIncome = addMoney(totalIncome, effectiveAmt);
        }
      } catch (e: any) {
        console.error('[ShiftStore] getShiftSummary matching exception:', e.message);
      }
    }

    // Step 2: Transactions
    const txs = shift.transactions || [];
    for (let i = 0; i < txs.length; i++) {
      const t = txs[i];
      const isCukcuk = t.note && t.note.indexOf('[CUKCUK]') !== -1;

      if (t.type === 'income') {
        if (isCukcuk && hasInvoiceStoreData) continue;
        const tAmt = toMoney(t.amount);
        totalIncome = addMoney(totalIncome, tAmt);
        billCount++;
        if (t.paymentMethod === 'cash') cashIncome = addMoney(cashIncome, tAmt);
        else if (t.paymentMethod === 'card') cardIncome = addMoney(cardIncome, tAmt);
        else if (t.paymentMethod === 'transfer') transferIncome = addMoney(transferIncome, tAmt);
        if (isCukcuk) {
          cukcukRevenue = addMoney(cukcukRevenue, tAmt);
          cukcukBills++;
        } else {
          manualIncome = addMoney(manualIncome, tAmt);
          manualBills++;
        }
      } else {
        const tAmt = toMoney(t.amount);
        totalExpense = addMoney(totalExpense, tAmt);
        if (t.paymentMethod === 'cash') cashExpense = addMoney(cashExpense, tAmt);
      }
    }

    // Step 3: Other Transactions
    const otherTxs = shift.otherTransactions || [];
    for (let j = 0; j < otherTxs.length; j++) {
      const otAmt = toMoney(otherTxs[j].amount);
      if (otherTxs[j].type === 'income') otherIncome = addMoney(otherIncome, otAmt);
      else otherExpense = addMoney(otherExpense, otAmt);
    }

    // Step 4: Cash Breakdown
    let cashCountTotal = 0;
    const cc = shift.cashCount || {};
    for (const denom in cc) {
      if (Object.prototype.hasOwnProperty.call(cc, denom)) {
        const dVal = toMoney(denom);
        const dCount = Number(cc[denom]) || 0;
        cashCountTotal = addMoney(cashCountTotal, multiplyMoney(dVal, dCount));
      }
    }

    if (shift.cashCountTotal !== undefined && shift.cashCountTotal !== null) {
      cashCountTotal = Number(shift.cashCountTotal) || 0;
    }

    const startingCash = toMoney(shift.startingCash);
    const expectedCash = addMoney(
      subtractMoney(
        addMoney(startingCash, cashIncome),
        cashExpense
      ),
      subtractMoney(otherIncome, otherExpense)
    );
    const discrepancy = subtractMoney(cashCountTotal, expectedCash);

    return {
      totalIncome,
      totalExpense,
      cashIncome,
      cardIncome,
      transferIncome,
      cashExpense,
      otherIncome,
      otherExpense,
      cashCountTotal,
      expectedCash,
      discrepancy,
      revenue: totalIncome,
      billCount,
      netTotal: expectedCash,
      cukcukRevenue,
      cukcukBills,
      manualIncome,
      manualBills
    };
  }

  // ── History Shift Summary Calculation ──────────────────────────────
  async function getHistorySummary(shift: Shift | null): Promise<ShiftSummary | null> {
    if (!shift) return null;

    if (currentShift.value && currentShift.value.id === shift.id) {
      return getShiftSummary(currentShift.value);
    }

    if (shift.summarySnapshot && shift.status === 'closed') {
      const result = { ...shift.summarySnapshot };
      // Fallback if cashCountTotal is missing but shift has cashCount
      if ((!result.cashCountTotal || result.cashCountTotal === 0) && shift.cashCount) {
        const cc = shift.cashCount;
        let recalcTotal = 0;
        for (const d in cc) {
          if (Object.prototype.hasOwnProperty.call(cc, d)) {
            recalcTotal += Number(d) * (cc[d] || 0);
          }
        }
        if (recalcTotal > 0) {
          result.cashCountTotal = recalcTotal;
          result.discrepancy = recalcTotal - (result.expectedCash || 0);
        }
      }
      return result;
    }

    return getShiftSummary(shift);
  }

  // ── Open Shift ─────────────────────────────────────────────────────
  async function openShift(opts: { cashierName: string; shiftNumber: number; date?: string; startingCash: number; shiftPassword?: string }) {
    if (currentShift.value) {
      throw new Error('Đang có ca làm việc mở. Vui lòng đóng ca hiện tại trước.');
    }

    const cashierName = opts.cashierName.trim();
    if (!cashierName) throw new Error('Tên thu ngân không được để trống.');

    const shiftNumber = Number(opts.shiftNumber);
    if (!shiftNumber || shiftNumber <= 0) throw new Error('Số ca làm việc phải lớn hơn 0.');

    const date = opts.date ? _normalizeDateStr(opts.date) : getWorkingDay();
    const startingCash = Number(opts.startingCash) || 0;

    // Check Cloud Active Shift registry
    try {
      const cloudRegRes = await getShiftRegistryFromCloud();
      if (cloudRegRes && cloudRegRes.success && cloudRegRes.registry) {
        const activeCloud = (cloudRegRes.registry as any[]).find(r => r.status === 'open');
        if (activeCloud && activeCloud.deviceId !== getDeviceId()) {
          throw new Error(`Xung đột: Ca ${activeCloud.shiftNumber} ngày ${activeCloud.workDay} đang được mở bởi thiết bị khác (${activeCloud.cashierName}). Vui lòng đóng ca đó trước.`);
        }
        
        const duplicate = (cloudRegRes.registry as any[]).find(
          r => r.workDay === date && r.shiftNumber === shiftNumber && r.status !== 'cancelled' && r.status !== 'voided'
        );
        if (duplicate) {
          throw new Error(`Xung đột: Ca ${shiftNumber} ngày ${date} đã tồn tại hoặc đã đóng trên Cloud.`);
        }
      }
    } catch (e: any) {
      console.warn('[ShiftStore] openShift registry validation skipped:', e.message);
    }

    const shiftId = 'shift_' + date + '_' + shiftNumber;

    const newShift: Shift = {
      id: shiftId,
      cashierName,
      shiftNumber,
      date,
      startTime: new Date().toISOString(),
      endTime: null,
      startingCash,
      transactions: [],
      otherTransactions: [],
      cashCount: {},
      status: 'open',
      notes: '',
      shiftPassword: opts.shiftPassword || '',
      cashToKeep: 0,
      cashToDeposit: 0,
      updatedAt: new Date().toISOString(),
      version: 1,
      deviceId: getDeviceId(),
      invoices: []
    };

    // Cloud Open Sync
    const res = await openShiftOnCloud(newShift);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Không thể đồng bộ mở ca lên cloud.');
    }

    currentShift.value = newShift;
    await save();

    auditsStore.addAudit('OPEN_SHIFT', `Ca ${shiftNumber} - Bắt đầu: ${startingCash.toLocaleString('vi-VN')}đ`);
    notificationsStore.addNotification(`Ca ${shiftNumber} ngày ${date} bắt đầu hoạt động`, 'success');
    return newShift;
  }

  // ── Close Shift ────────────────────────────────────────────────────
  async function closeShift(opts: { notes?: string; cashToKeep?: number; cashToDeposit?: number; actualCash?: number; discrepancyNotes?: string }) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');

    closeInProgress = true;
    try {
      const shift = currentShift.value;
      const wasReopened = !!shift.reopenedAt || !!shift.originalSummarySnapshot;

      shift.endTime = new Date().toISOString();
      shift.status = 'closed';
      shift.notes = opts.notes || '';
      shift.cashToKeep = Number(opts.cashToKeep) || 0;
      shift.cashToDeposit = Number(opts.cashToDeposit) || 0;
      shift.updatedAt = new Date().toISOString();

      if (opts.actualCash !== undefined && opts.actualCash !== null) {
        shift.cashCountTotal = Number(opts.actualCash) || 0;
      }
      if (opts.discrepancyNotes !== undefined) {
        shift.discrepancyNotes = opts.discrepancyNotes || '';
      }

      const summary = await getShiftSummary(shift);
      if (!summary) throw new Error('Không thể tính toán báo cáo tài chính của ca.');

      // Snapshot drink inventory
      try {
        const invData = localStorage.getItem('kg-drink-inventory');
        if (invData) {
          const parsed = JSON.parse(invData);
          const sessionKey = shift.date + '_Ca ' + shift.shiftNumber;
          if (parsed.sessions && parsed.sessions[sessionKey]) {
            shift.drinkInventorySnapshot = parsed.sessions[sessionKey];
          }
        }
      } catch (e) {}

      // Snapshot CUKCUK invoices
      try {
        const range = getWorkingDayRange(shift.date);
        const invoices = await getInvoicesByShiftTime(shift.date, shift.startTime, shift.endTime);
        if (invoices.length > 0) {
          shift.cukcukInvoicesSnapshot = invoices.map(inv => ({
            refId: inv.refId,
            refNo: inv.refNo,
            refDate: inv.refDate,
            tableName: inv.tableName,
            amount: inv.amount,
            payments: inv.payments
          }));
        }
      } catch (e) {}

      // Save summary snapshot frozen at close time
      if (wasReopened && !shift.originalSummarySnapshot && shift.summarySnapshot) {
        shift.originalSummarySnapshot = { ...shift.summarySnapshot };
      }

      shift.summarySnapshot = {
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        cashIncome: summary.cashIncome,
        cardIncome: summary.cardIncome,
        transferIncome: summary.transferIncome,
        cukcukRevenue: summary.cukcukRevenue,
        cukcukBills: summary.cukcukBills,
        billCount: summary.billCount,
        expectedCash: summary.expectedCash,
        cashCountTotal: summary.cashCountTotal,
        cashExpense: summary.cashExpense,
        discrepancy: summary.discrepancy,
        manualIncome: summary.manualIncome,
        manualBills: summary.manualBills,
        otherIncome: summary.otherIncome,
        otherExpense: summary.otherExpense,
        revenue: summary.revenue,
        netTotal: summary.netTotal
      };

      // Discrepancy warning toast
      const threshold = settingsStore.settings?.discrepancyThreshold || 50000;
      if (summary.cashCountTotal > 0 && Math.abs(summary.discrepancy) > threshold) {
        notificationsStore.addNotification(`⚠️ Chênh lệch tiền mặt: ${summary.discrepancy.toLocaleString('vi-VN')}đ`, 'warning');
      }

      // Cloud Close Sync with retries
      let closedConfirmed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await closeShiftOnCloud(shift);
          if (res && res.success) {
            closedConfirmed = true;
            break;
          }
        } catch (e: any) {
          console.warn('[ShiftStore] Cloud close attempt', attempt, 'failed:', e.message);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      if (!closedConfirmed) {
        throw new Error('Đóng ca thất bại: Không thể đồng bộ trạng thái đóng ca lên đám mây. Vui lòng kiểm tra mạng và thử lại.');
      }

      shifts.value.unshift(JSON.parse(JSON.stringify(shift)));
      
      // Enforce history quota (180 entries)
      if (shifts.value.length > 180) {
        shifts.value = shifts.value.slice(0, 180);
      }

      // Track recently closed IDs
      _recentlyClosedIds.value.push(shift.id);
      if (_recentlyClosedIds.value.length > 20) {
        _recentlyClosedIds.value.shift();
      }

      currentShift.value = null;
      await save();

      auditsStore.addAudit('CLOSE_SHIFT', `Ca ${shift.shiftNumber} - Doanh thu: ${summary.totalIncome.toLocaleString('vi-VN')}đ`);
      notificationsStore.addNotification(`Ca ${shift.shiftNumber} đã đóng - DT: ${summary.totalIncome.toLocaleString('vi-VN')}đ`, 'info');
      
      return shift;
    } finally {
      closeInProgress = false;
    }
  }

  // ── Reopen Shift ───────────────────────────────────────────────────
  async function reopenShiftById(shiftId: string, managerPassword?: string) {
    if (currentShift.value) {
      throw new Error('Đang có ca mở. Hãy đóng ca hiện tại trước khi mở lại ca khác.');
    }
    if (shifts.value.length === 0) {
      throw new Error('Không có ca đã đóng nào trong lịch sử.');
    }

    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const targetShift = JSON.parse(JSON.stringify(shifts.value[idx])) as Shift;

    // Cloud Reopen
    const res = await reopenShiftOnCloud(targetShift, managerPassword);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Mở lại ca trên cloud thất bại.');
    }

    targetShift.status = 'open';
    targetShift.endTime = null;
    targetShift.reopenedAt = new Date().toISOString();
    targetShift.lastReopenedAt = new Date().toISOString();
    targetShift.updatedAt = new Date().toISOString();

    if (!targetShift.originalSummarySnapshot && targetShift.summarySnapshot) {
      targetShift.originalSummarySnapshot = { ...targetShift.summarySnapshot };
    }

    shifts.value.splice(idx, 1);
    currentShift.value = targetShift;
    await save();

    auditsStore.addAudit('REOPEN_SHIFT', `Mở lại ca ${targetShift.shiftNumber} ngày ${targetShift.date}`);
    notificationsStore.addNotification(`Mở lại ca ${targetShift.shiftNumber} ngày ${targetShift.date} thành công.`, 'info');
    
    return targetShift;
  }

  async function reopenLastClosedShift(managerPassword?: string) {
    if (shifts.value.length === 0) throw new Error('Không có ca đã đóng nào trong lịch sử.');
    return reopenShiftById(shifts.value[0].id, managerPassword);
  }

  // ── Transaction Mutations (Current Shift) ──────────────────────────
  function addTransaction(txData: { type: 'income' | 'expense'; category: string; amount: number; paymentMethod?: 'cash' | 'card' | 'transfer'; note?: string }) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');

    const tx: Transaction = {
      id: uid(),
      type: txData.type,
      category: txData.category,
      amount: Number(txData.amount) || 0,
      paymentMethod: txData.paymentMethod || 'cash',
      note: txData.note || '',
      timestamp: new Date().toISOString()
    };

    currentShift.value.transactions.push(tx);
    currentShift.value.updatedAt = new Date().toISOString();
    save();

    auditsStore.addAudit(
      'ADD_TX', 
      `${tx.category}: ${tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString('vi-VN')}đ`
    );
    _syncCurrentShift();
    return tx;
  }

  function removeTransaction(txId: string) {
    if (!currentShift.value) return;
    const originalLength = currentShift.value.transactions.length;
    
    currentShift.value.transactions = currentShift.value.transactions.filter(t => t.id !== txId);
    if (currentShift.value.transactions.length !== originalLength) {
      currentShift.value.updatedAt = new Date().toISOString();
      save();
      auditsStore.addAudit('DEL_TX', `Xóa giao dịch ID: ${txId}`);
      _syncCurrentShift();
    }
  }

  function editTransaction(txId: string, updates: Partial<Transaction>) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');
    const tx = currentShift.value.transactions.find(t => t.id === txId);
    if (!tx) throw new Error('Không tìm thấy giao dịch.');

    const oldAmt = tx.amount;
    if (updates.category !== undefined) tx.category = updates.category;
    if (updates.amount !== undefined) tx.amount = Number(updates.amount) || 0;
    if (updates.paymentMethod !== undefined) tx.paymentMethod = updates.paymentMethod;
    if (updates.note !== undefined) tx.note = updates.note;
    if (updates.type !== undefined) tx.type = updates.type;

    currentShift.value.updatedAt = new Date().toISOString();
    save();

    auditsStore.addAudit(
      'EDIT_TX', 
      `${tx.category} ${oldAmt.toLocaleString('vi-VN')} → ${tx.amount.toLocaleString('vi-VN')}đ`
    );
    _syncCurrentShift();
    return tx;
  }

  function addOtherTransaction(txData: { type: 'income' | 'expense'; category: string; amount: number; note?: string }) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');

    const tx: Transaction = {
      id: uid(),
      type: txData.type,
      category: txData.category,
      amount: Number(txData.amount) || 0,
      note: txData.note || '',
      timestamp: new Date().toISOString()
    };

    if (!currentShift.value.otherTransactions) {
      currentShift.value.otherTransactions = [];
    }

    currentShift.value.otherTransactions.push(tx);
    currentShift.value.updatedAt = new Date().toISOString();
    save();

    auditsStore.addAudit(
      'ADD_OTHER_TX', 
      `${txData.type}: ${txData.category} - ${tx.amount.toLocaleString('vi-VN')}đ`
    );
    _syncCurrentShift();
    return tx;
  }

  function removeOtherTransaction(txId: string) {
    if (!currentShift.value) return;
    const originalLength = currentShift.value.otherTransactions?.length || 0;
    
    currentShift.value.otherTransactions = (currentShift.value.otherTransactions || []).filter(t => t.id !== txId);
    if ((currentShift.value.otherTransactions.length) !== originalLength) {
      currentShift.value.updatedAt = new Date().toISOString();
      save();
      auditsStore.addAudit('DEL_OTHER_TX', `Xóa giao dịch khác ID: ${txId}`);
      _syncCurrentShift();
    }
  }

  function addInvoice(opts: { name: string; fileType?: string; data?: any; driveFileId?: string | null; driveUrl?: string | null; thumbnailUrl?: string | null; linkedTransactionId?: string | null; note?: string }) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');
    const inv = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      name: opts.name,
      fileType: opts.fileType || 'image',
      data: opts.data || null,
      driveFileId: opts.driveFileId || null,
      driveUrl: opts.driveUrl || null,
      thumbnailUrl: opts.thumbnailUrl || null,
      linkedTransactionId: opts.linkedTransactionId || null,
      note: opts.note || '',
      timestamp: new Date().toISOString()
    };
    if (!currentShift.value.invoices) {
      currentShift.value.invoices = [];
    }
    currentShift.value.invoices.push(inv);
    currentShift.value.updatedAt = new Date().toISOString();
    save();
    auditsStore.addAudit('ADD_INVOICE', opts.name);
    _syncCurrentShift();
    return inv;
  }

  function removeInvoice(id: string) {
    if (!currentShift.value) return;
    const originalLength = currentShift.value.invoices?.length || 0;
    currentShift.value.invoices = (currentShift.value.invoices || []).filter(i => i.id !== id);
    if ((currentShift.value.invoices.length) !== originalLength) {
      currentShift.value.updatedAt = new Date().toISOString();
      save();
      auditsStore.addAudit('REMOVE_INVOICE', `Xóa chứng từ ID: ${id}`);
      _syncCurrentShift();
    }
  }

  // ── Cash Count ─────────────────────────────────────────────────────
  function updateCashCount(counts: CashCountDetail, pinnedCash?: CashCountDetail, keepCash?: CashCountDetail, handoverCash?: CashCountDetail) {
    if (!currentShift.value) throw new Error('Không có ca nào đang mở.');

    currentShift.value.cashCount = { ...counts };

    if (pinnedCash) {
      const cleanPins: CashCountDetail = {};
      for (const pk in pinnedCash) {
        if (pinnedCash[pk] > 0) cleanPins[pk] = pinnedCash[pk];
      }
      currentShift.value.pinnedCash = cleanPins;
    }
    if (keepCash) {
      const cleanKeep: CashCountDetail = {};
      for (const kk in keepCash) {
        if (keepCash[kk] > 0) cleanKeep[kk] = keepCash[kk];
      }
      currentShift.value.keepCash = cleanKeep;
    }
    if (handoverCash) {
      const cleanHand: CashCountDetail = {};
      for (const hk in handoverCash) {
        if (handoverCash[hk] > 0) cleanHand[hk] = handoverCash[hk];
      }
      currentShift.value.handoverCash = cleanHand;
    }

    // Auto-calculate cashToKeep & cashToDeposit
    let totalKet = 0;
    let totalGiao = 0;
    const pc = currentShift.value.pinnedCash || {};
    const kc = currentShift.value.keepCash || {};
    const hc = currentShift.value.handoverCash || {};

    for (const d in currentShift.value.cashCount) {
      const denomination = Number(d);
      totalKet += denomination * ((pc[d] || 0) + (kc[d] || 0));
      totalGiao += denomination * (hc[d] || 0);
    }

    currentShift.value.cashToKeep = totalKet;
    currentShift.value.cashToDeposit = totalGiao;
    currentShift.value.cashCountTotal = totalKet + totalGiao;
    currentShift.value.updatedAt = new Date().toISOString();
    save();

    const total = totalKet + totalGiao;
    auditsStore.addAudit(
      'UPDATE_CASH_COUNT', 
      `Két: ${totalKet.toLocaleString('vi-VN')} | Giao: ${totalGiao.toLocaleString('vi-VN')} | Tổng: ${total.toLocaleString('vi-VN')}đ`
    );
    _syncCurrentShift();
  }

  // ── Sync Actions ───────────────────────────────────────────────────
  function _syncCurrentShift() {
    if (!settingsStore.settings?.autoSync) return;
    if (closeInProgress) return;

    isSyncDirty.value = true;
    isSyncTimerActive.value = true;

    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (currentShift.value) {
        const cleanShift = JSON.parse(JSON.stringify(currentShift.value)) as Shift;
        try {
          await syncShiftToCloud(cleanShift);
          isSyncDirty.value = false;
          lastCloudPushTime.value = Date.now();
        } catch (e) {}
      }
      isSyncTimerActive.value = false;
    }, 1500);
  }

  async function syncCurrentShiftImmediate() {
    clearTimeout(syncTimer);
    isSyncTimerActive.value = false;

    if (currentShift.value) {
      const cleanShift = JSON.parse(JSON.stringify(currentShift.value)) as Shift;
      isSyncDirty.value = true;
      try {
        await syncShiftToCloud(cleanShift);
        isSyncDirty.value = false;
        lastCloudPushTime.value = Date.now();
        console.log('[ShiftStore] Immediate cloud sync success');
      } catch (e) {}
    }
  }

  async function syncCurrentShiftWithCloud(): Promise<boolean> {
    if (closeInProgress) return false;
    if (isSyncTimerActive.value) return false;

    try {
      const res = await getCurrentShiftFromCloud();
      if (res && res.success) {
        const cloudShift = res.shift as Shift | null;

        // Case 1: Cloud empty, Local has shift -> Sync local to cloud
        if (!cloudShift && currentShift.value) {
          _syncCurrentShift();
          return false;
        }

        // Case 2: Matching shift ID
        if (cloudShift && currentShift.value && currentShift.value.id === cloudShift.id) {
          if (currentShift.value.status === 'open' && cloudShift.status === 'closed') {
            console.log('[ShiftStore] Reopen conflict: local is open, cloud is closed. Keeping local open state and syncing immediately.');
            cloudShift.status = 'open';
            cloudShift.endTime = null;
            syncCurrentShiftImmediate();
          }

          // Merge transactions (union)
          const mergedTxs = _mergeTransactions(currentShift.value.transactions, cloudShift.transactions);
          const mergedOtherTxs = _mergeTransactions(currentShift.value.otherTransactions, cloudShift.otherTransactions);

          let hasChanges = false;
          if (mergedTxs.length !== (currentShift.value.transactions || []).length) hasChanges = true;
          if ((mergedOtherTxs.length) !== (currentShift.value.otherTransactions || []).length) hasChanges = true;
          if (cloudShift.startingCash !== currentShift.value.startingCash) hasChanges = true;
          if (cloudShift.status !== currentShift.value.status) hasChanges = true;
          if (cloudShift.notes !== currentShift.value.notes) hasChanges = true;
          if (JSON.stringify(cloudShift.cashCount || {}) !== JSON.stringify(currentShift.value.cashCount || {})) hasChanges = true;

          if (hasChanges) {
            cloudShift.transactions = mergedTxs;
            cloudShift.otherTransactions = mergedOtherTxs;
            
            // Preserve local manual override priority on cash counts
            const localCC = currentShift.value.cashCount || {};
            if (Object.keys(localCC).length > 0) {
              cloudShift.cashCount = localCC;
              cloudShift.pinnedCash = currentShift.value.pinnedCash || cloudShift.pinnedCash;
              cloudShift.keepCash = currentShift.value.keepCash || cloudShift.keepCash;
              cloudShift.handoverCash = currentShift.value.handoverCash || cloudShift.handoverCash;
            }
            cloudShift.shiftPassword = cloudShift.shiftPassword || currentShift.value.shiftPassword;
            currentShift.value = cloudShift;
            await save();
            return true;
          }
          return false;
        }

        // Case 3: Different ID (Cloud is established master)
        if (cloudShift && currentShift.value && currentShift.value.id !== cloudShift.id) {
          const cloudInHistory = shifts.value.some(h => h.id === cloudShift.id);
          if (cloudInHistory) {
            console.log('[ShiftStore] Cloud shift already in history, keeping local');
            _syncCurrentShift();
            return false;
          }
          console.log('[ShiftStore] Cloud shift is the established master, adopting cloud shift:', cloudShift.id);
          currentShift.value = cloudShift;
          await save();
          return true;
        }

        // Case 4: Cloud open shift, Local has no shift
        if (cloudShift && !currentShift.value) {
          const localClosedIdx = shifts.value.findIndex(h => h.id === cloudShift.id);
          const isRecentlyClosed = _recentlyClosedIds.value.includes(cloudShift.id);

          if (cloudShift.status === 'open') {
            if (localClosedIdx !== -1) {
              console.log('[ShiftStore] Cloud shift reopened on another device. Adopting as current open shift:', cloudShift.id);
              shifts.value.splice(localClosedIdx, 1);
              currentShift.value = cloudShift;
              await save();
              return true;
            } else if (isRecentlyClosed) {
              console.log('[ShiftStore] Cloud shift reopened after recent close. Adopting:', cloudShift.id);
              _recentlyClosedIds.value = _recentlyClosedIds.value.filter(id => id !== cloudShift.id);
              currentShift.value = cloudShift;
              await save();
              return true;
            }
          } else {
            if (localClosedIdx !== -1) return false;
            if (isRecentlyClosed) {
              try { closeShiftOnCloud(cloudShift); } catch (e) {}
              return false;
            }
          }

          if (_forceClosedIds.value.includes(cloudShift.id)) {
            try { closeShiftOnCloud(cloudShift); } catch (e) {}
            return false;
          }

          if (cloudShift.status === 'closed') return false;

          console.log('[ShiftStore] Cloud shift applied locally:', cloudShift.id);
          currentShift.value = cloudShift;
          await save();
          return true;
        }
      }
    } catch (e) {
      console.warn('[ShiftStore] Cloud pull error:', e);
    }
    return false;
  }

  // ── Sync Shift History ─────────────────────────────────────────────
  async function syncShiftHistory(): Promise<boolean> {
    if (historySyncInFlight) return false;
    historySyncInFlight = true;

    try {
      const res = await getShiftsFromCloud();
      if (!res || !res.success || !res.shifts || !Array.isArray(res.shifts)) {
        historySyncInFlight = false;
        return false;
      }

      const cloudShifts = res.shifts as Shift[];
      const localIds: Record<string, number> = {};
      shifts.value.forEach((s, i) => { localIds[s.id] = i; });

      // Pull tombstoned deleted shifts from Cloud config
      try {
        const configRes = await getConfigFromCloud();
        if (configRes && configRes.success && configRes.config) {
          const cloudTombStr = configRes.config.deleted_shift_ids;
          if (cloudTombStr) {
            const cloudTombs = typeof cloudTombStr === 'string' ? JSON.parse(cloudTombStr) : cloudTombStr;
            if (Array.isArray(cloudTombs)) {
              cloudTombs.forEach(tid => {
                if (!_deletedShiftIds.value.includes(tid)) _deletedShiftIds.value.push(tid);
              });
            }
          }
        }
      } catch (tombErr) {}

      const currentId = currentShift.value ? currentShift.value.id : null;
      let added = 0;

      for (let j = 0; j < cloudShifts.length; j++) {
        const cs = cloudShifts[j];
        if (!cs || !cs.id) continue;
        if (_deletedShiftIds.value.includes(cs.id)) continue;
        if (cs.id === currentId) continue;

        if (localIds[cs.id] === undefined) {
          shifts.value.push(cs);
          added++;
        } else {
          // Merge logic based on updatedAt timestamps
          const localShift = shifts.value[localIds[cs.id]];
          const localStr = JSON.stringify({
            startingCash: localShift.startingCash,
            notes: localShift.notes || '',
            transactions: localShift.transactions || [],
            otherTransactions: localShift.otherTransactions || [],
            cashCount: localShift.cashCount || {},
            summarySnapshot: localShift.summarySnapshot || {}
          });
          const cloudStr = JSON.stringify({
            startingCash: cs.startingCash,
            notes: cs.notes || '',
            transactions: cs.transactions || [],
            otherTransactions: cs.otherTransactions || [],
            cashCount: cs.cashCount || {},
            summarySnapshot: cs.summarySnapshot || {}
          });

          if (localStr !== cloudStr) {
            const localTime = localShift.updatedAt ? new Date(localShift.updatedAt).getTime() : 0;
            const cloudTime = cs.updatedAt ? new Date(cs.updatedAt).getTime() : 0;

            if (localTime > cloudTime) {
              console.log('[ShiftStore] Local shift newer, syncing to cloud:', cs.id);
              _syncHistoryShiftToCloud(localShift);
            } else {
              console.log('[ShiftStore] Cloud shift newer, updating local:', cs.id);
              cs.cukcukInvoicesSnapshot = localShift.cukcukInvoicesSnapshot || cs.cukcukInvoicesSnapshot || [];
              shifts.value[localIds[cs.id]] = cs;
              added++;
            }
          }
        }
      }

      // Cleanup stale history copies of current open shift
      if (currentId) {
        const beforeLen = shifts.value.length;
        shifts.value = shifts.value.filter(sh => sh.id !== currentId);
        if (shifts.value.length < beforeLen) {
          console.log('[ShiftStore] Removed ' + (beforeLen - shifts.value.length) + ' stale history copy of current shift');
          added++;
        }
      }

      // Aggressive duplicate cleanup (date + shiftNumber + cashierName)
      const seenKey: Record<string, Shift> = {};
      const deduped: Shift[] = [];
      shifts.value.forEach(ds => {
        const dkey = (ds.date || '') + '_' + (ds.shiftNumber || '') + '_' + (ds.cashierName || '');
        const prev = seenKey[dkey];
        if (prev) {
          const prevScore = (prev.status === 'closed' ? 1000 : 0) + (prev.transactions || []).length;
          const dsScore = (ds.status === 'closed' ? 1000 : 0) + (ds.transactions || []).length;
          if (dsScore > prevScore) {
            const idx = deduped.findIndex(x => x === prev);
            if (idx !== -1) deduped.splice(idx, 1);
            deduped.push(ds);
            seenKey[dkey] = ds;
          }
        } else {
          seenKey[dkey] = ds;
          deduped.push(ds);
        }
      });

      if (deduped.length < shifts.value.length) {
        const removed = shifts.value.length - deduped.length;
        shifts.value = deduped;
        added += removed;
        console.log('[ShiftStore] Dedup: removed ' + removed + ' duplicate shifts');
      }

      if (added > 0) {
        shifts.value.sort((a, b) => {
          const da = (a.date || '') + (a.startTime || '');
          const db = (b.date || '') + (b.startTime || '');
          return da > db ? -1 : (da < db ? 1 : 0);
        });
        await save();
        console.log('[ShiftStore] History synced successfully: +' + added + ' shifts');
      }

      historySyncInFlight = false;
      return added > 0;
    } catch (e) {
      console.warn('[ShiftStore] History sync failed:', e);
      historySyncInFlight = false;
      return false;
    }
  }

  async function _syncHistoryShiftToCloud(shift: Shift) {
    shift.updatedAt = new Date().toISOString();
    await save();
    try {
      const cleanShift = JSON.parse(JSON.stringify(shift)) as Shift;
      // Do not upload raw image blobs or large files to sheet registry
      if (cleanShift.cukcukInvoicesSnapshot) {
        // Skip details
      }
      await closeShiftOnCloud(cleanShift);
    } catch (e) {}
  }

  function _mergeTransactions(local: Transaction[] = [], cloud: Transaction[] = []): Transaction[] {
    const byId: Record<string, boolean> = {};
    const merged: Transaction[] = [];

    local.forEach(tx => { byId[tx.id] = true; merged.push(tx); });
    cloud.forEach(tx => {
      if (!byId[tx.id]) merged.push(tx);
    });

    return merged.sort((a, b) => (a.timestamp || '') > (b.timestamp || '') ? 1 : -1);
  }

  // ── History Shift Editing (Add/Edit/Remove/Cash update) ─────────────
  async function addHistoryTransaction(shiftId: string, txData: { type: 'income' | 'expense'; category: string; amount: number; paymentMethod?: 'cash' | 'card' | 'transfer'; note?: string }) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    const tx: Transaction = {
      id: uid(),
      type: txData.type,
      category: txData.category,
      amount: Number(txData.amount) || 0,
      paymentMethod: txData.paymentMethod || 'cash',
      note: txData.note || '',
      timestamp: new Date().toISOString()
    };

    if (!shift.transactions) shift.transactions = [];
    shift.transactions.push(tx);

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('EDIT_HISTORY_ADD_TX', `Ca ${shift.date} #${shift.shiftNumber}: ${txData.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString('vi-VN')}đ`);
    return tx;
  }

  async function editHistoryTransaction(shiftId: string, txId: string, updates: Partial<Transaction>) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    const txs = shift.transactions || [];
    const tx = txs.find(t => t.id === txId);
    if (!tx) throw new Error('Không tìm thấy giao dịch.');

    const oldAmt = tx.amount;
    if (updates.category !== undefined) tx.category = updates.category;
    if (updates.amount !== undefined) tx.amount = Number(updates.amount) || 0;
    if (updates.paymentMethod !== undefined) tx.paymentMethod = updates.paymentMethod;
    if (updates.note !== undefined) tx.note = updates.note;
    if (updates.type !== undefined) tx.type = updates.type;

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('EDIT_HISTORY_TX', `Ca ${shift.date}: ${tx.category} ${oldAmt.toLocaleString('vi-VN')} → ${tx.amount.toLocaleString('vi-VN')}đ`);
    return tx;
  }

  async function removeHistoryTransaction(shiftId: string, txId: string) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    const tx = shift.transactions.find(t => t.id === txId);
    
    shift.transactions = shift.transactions.filter(t => t.id !== txId);
    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    if (tx) {
      auditsStore.addAudit('EDIT_HISTORY_DEL_TX', `Ca ${shift.date}: xóa ${tx.category} ${tx.amount.toLocaleString('vi-VN')}đ`);
    }
  }

  async function addHistoryOtherTransaction(shiftId: string, txData: { type: 'income' | 'expense'; category: string; amount: number; note?: string }) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    const tx: Transaction = {
      id: uid(),
      type: txData.type,
      category: txData.category,
      amount: Number(txData.amount) || 0,
      note: txData.note || '',
      timestamp: new Date().toISOString()
    };

    if (!shift.otherTransactions) shift.otherTransactions = [];
    shift.otherTransactions.push(tx);

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('EDIT_HISTORY_ADD_OTHER', `Ca ${shift.date}: ${txData.type} ${txData.category} ${tx.amount.toLocaleString('vi-VN')}đ`);
    return tx;
  }

  async function removeHistoryOtherTransaction(shiftId: string, txId: string) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    shift.otherTransactions = (shift.otherTransactions || []).filter(t => t.id !== txId);

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('EDIT_HISTORY_DEL_OTHER', `Ca ${shift.date}: xóa giao dịch khác`);
  }

  async function updateHistoryCashCount(shiftId: string, counts: CashCountDetail, pinnedCash?: CashCountDetail, keepCash?: CashCountDetail, handoverCash?: CashCountDetail) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    shift.cashCount = { ...counts };

    if (pinnedCash) {
      const cleanPins: CashCountDetail = {};
      for (const pk in pinnedCash) if (pinnedCash[pk] > 0) cleanPins[pk] = pinnedCash[pk];
      shift.pinnedCash = cleanPins;
    }
    if (keepCash) {
      const cleanKeep: CashCountDetail = {};
      for (const kk in keepCash) if (keepCash[kk] > 0) cleanKeep[kk] = keepCash[kk];
      shift.keepCash = cleanKeep;
    }
    if (handoverCash) {
      const cleanHand: CashCountDetail = {};
      for (const hk in handoverCash) if (handoverCash[hk] > 0) cleanHand[hk] = handoverCash[hk];
      shift.handoverCash = cleanHand;
    }

    let totalKet = 0;
    let totalGiao = 0;
    const pc = shift.pinnedCash || {};
    const kc = shift.keepCash || {};

    for (const d in shift.cashCount) {
      const denom = Number(d);
      totalKet += denom * ((pc[d] || 0) + (kc[d] || 0));
      totalGiao += denom * (shift.handoverCash?.[d] || 0);
    }

    shift.cashToKeep = totalKet;
    shift.cashToDeposit = totalGiao;
    shift.cashCountTotal = totalKet + totalGiao;

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    const total = totalKet + totalGiao;
    auditsStore.addAudit('EDIT_HISTORY_CASH', `Ca ${shift.date}: Két ${totalKet.toLocaleString('vi-VN')} | Giao ${totalGiao.toLocaleString('vi-VN')} | Tổng ${total.toLocaleString('vi-VN')}đ`);
  }

  async function updateHistoryShiftField(shiftId: string, field: 'notes' | 'startingCash' | 'cashierName', value: any) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    
    if (field === 'startingCash') {
      shift.startingCash = Number(value) || 0;
      await rebuildShiftSnapshot(shift);
    } else {
      shift[field] = String(value);
    }

    await save();
    _syncHistoryShiftToCloud(shift);
    auditsStore.addAudit('EDIT_HISTORY_FIELD', `Ca ${shift.date}: thay đổi ${field}`);
  }

  async function updateHistoryDrinkInventory(shiftId: string, items: any) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    if (!shift.drinkInventorySnapshot) {
      shift.drinkInventorySnapshot = { items: {} };
    }
    shift.drinkInventorySnapshot.items = items;

    await save();
    _syncHistoryShiftToCloud(shift);
    auditsStore.addAudit('EDIT_HISTORY_DRINK_INV', `Ca ${shift.date}: sửa kiểm kho`);
  }

  async function editHistoryInvoicePayment(shiftId: string, refId: string, newPayments: any[]) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    const invoices = shift.cukcukInvoicesSnapshot || [];
    const inv = invoices.find((i: any) => i.refId === refId);
    if (!inv) throw new Error('Không tìm thấy hóa đơn trong ca.');

    inv.payments = newPayments;
    let total = 0;
    for (let p = 0; p < newPayments.length; p++) {
      total += newPayments[p].amount || 0;
    }
    if (total > 0) inv.amount = total;

    // Direct indexedDB lock logic inside invoiceStore is handled separately when matching
    // But we also flag manualOverride to avoid CUKCUK overwrite
    inv.manualOverride = true;
    inv.unpaid = false;

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('EDIT_HISTORY_INV_PAY', `Ca ${shift.date}: sửa PTTT bill ${inv.refNo || refId}`);
    return inv;
  }

  async function backfillHistoryInvoiceSnapshot(shiftId: string, invoicesArray: any[]) {
    const idx = shifts.value.findIndex(s => s.id === shiftId);
    if (idx === -1) throw new Error('Không tìm thấy ca trong lịch sử.');

    const shift = shifts.value[idx];
    shift.cukcukInvoicesSnapshot = invoicesArray.map(inv => ({
      refId: inv.refId,
      refNo: inv.refNo,
      refDate: inv.refDate,
      tableName: inv.tableName,
      amount: inv.amount,
      payments: inv.payments
    }));

    await rebuildShiftSnapshot(shift);
    await save();
    _syncHistoryShiftToCloud(shift);

    auditsStore.addAudit('BACKFILL_INV_SNAPSHOT', `Ca ${shift.date}: lưu ${invoicesArray.length} hóa đơn POS`);
    return invoicesArray.length;
  }

  async function rebuildShiftSnapshot(shift: Shift) {
    const savedCashCountTotal = shift.summarySnapshot?.cashCountTotal;

    const copy = { ...shift };
    delete copy.summarySnapshot;
    if (!shift.originalSummarySnapshot && shift.summarySnapshot) {
      shift.originalSummarySnapshot = { ...shift.summarySnapshot };
    }

    // Force open status calculation internally so live counts are aggregated
    copy.status = 'open';

    const fresh = await getShiftSummary(copy);
    if (!fresh) return;

    let actualCashCount = 0;
    const cc = shift.cashCount || {};
    for (const d in cc) {
      if (Object.prototype.hasOwnProperty.call(cc, d)) {
        actualCashCount += Number(d) * (cc[d] || 0);
      }
    }
    const cashCountTotal = actualCashCount > 0 ? actualCashCount : (savedCashCountTotal || 0);

    shift.summarySnapshot = {
      totalIncome: fresh.totalIncome,
      totalExpense: fresh.totalExpense,
      cashIncome: fresh.cashIncome,
      cardIncome: fresh.cardIncome,
      transferIncome: fresh.transferIncome,
      cukcukRevenue: fresh.cukcukRevenue,
      cukcukBills: fresh.cukcukBills,
      billCount: fresh.billCount,
      expectedCash: fresh.expectedCash,
      cashCountTotal: cashCountTotal,
      cashExpense: fresh.cashExpense,
      discrepancy: cashCountTotal - fresh.expectedCash,
      manualIncome: fresh.manualIncome,
      manualBills: fresh.manualBills,
      otherIncome: fresh.otherIncome,
      otherExpense: fresh.otherExpense,
      revenue: fresh.revenue,
      netTotal: fresh.netTotal
    };
  }

  async function rebuildHistorySnapshots() {
    let rebuilt = 0;
    for (let i = 0; i < shifts.value.length; i++) {
      const shift = shifts.value[i];
      if (shift.status !== 'closed') continue;

      const shiftCopy = { ...shift };
      delete shiftCopy.summarySnapshot;

      try {
        const fresh = await getShiftSummary(shiftCopy);
        if (fresh) {
          const oldSnap: any = shift.summarySnapshot || {};
          const cashCountTotal = oldSnap.cashCountTotal !== undefined ? oldSnap.cashCountTotal : fresh.cashCountTotal;

          shifts.value[i].summarySnapshot = {
            totalIncome: fresh.totalIncome,
            totalExpense: fresh.totalExpense,
            cashIncome: fresh.cashIncome,
            cardIncome: fresh.cardIncome,
            transferIncome: fresh.transferIncome,
            cukcukRevenue: fresh.cukcukRevenue,
            cukcukBills: fresh.cukcukBills,
            billCount: fresh.billCount,
            expectedCash: fresh.expectedCash,
            cashCountTotal,
            cashExpense: fresh.cashExpense,
            discrepancy: cashCountTotal - fresh.expectedCash,
            manualIncome: fresh.manualIncome,
            manualBills: fresh.manualBills,
            otherIncome: fresh.otherIncome,
            otherExpense: fresh.otherExpense,
            revenue: fresh.revenue,
            netTotal: fresh.netTotal
          };
          rebuilt++;
        }
      } catch (e) {
        console.warn('[ShiftStore] rebuildHistorySnapshots error for shift', shift.id, e);
      }
    }

    if (rebuilt > 0) {
      await save();
    }
    return rebuilt;
  }

  async function deleteShiftFromHistory(id: string) {
    shifts.value = shifts.value.filter(sh => sh.id !== id);
    if (!_deletedShiftIds.value.includes(id)) {
      _deletedShiftIds.value.push(id);
    }
    if (_deletedShiftIds.value.length > 200) {
      _deletedShiftIds.value = _deletedShiftIds.value.slice(-200);
    }
    await save();

    auditsStore.addAudit('DELETE_SHIFT_HISTORY', 'ID: ' + id);

    // Sync tombstone to cloud config
    try {
      deleteShiftFromCloud(id).catch(() => {});
      saveConfigToCloud('deleted_shift_ids', JSON.stringify(_deletedShiftIds.value)).catch(() => {});
    } catch (e) {}
  }

  // ── Healing Routine ────────────────────────────────────────────────
  async function healPastShiftsData() {
    if (shifts.value.length === 0) return 0;
    
    console.log('[ShiftStore] healPastShiftsData: starting auto-healing for ' + shifts.value.length + ' shifts');
    let healedCount = 0;

    // Step 1: Normalize date & ID formats
    for (let i = 0; i < shifts.value.length; i++) {
      const sh = shifts.value[i];
      if (sh.date) {
        sh.date = _normalizeDateStr(sh.date);
      } else {
        sh.date = new Date(sh.startTime || Date.now()).toISOString().split('T')[0];
      }
      const detId = 'shift_' + sh.date + '_' + sh.shiftNumber;
      if (sh.id !== detId) {
        console.log('[ShiftStore] healPastShiftsData: updating ID ' + sh.id + ' → ' + detId);
        sh.id = detId;
        healedCount++;
      }
    }

    // Step 2: Deduplication
    const bestById: Record<string, Shift> = {};
    for (let i = 0; i < shifts.value.length; i++) {
      const sh = shifts.value[i];
      const existing = bestById[sh.id];
      if (!existing) {
        bestById[sh.id] = sh;
      } else {
        const eScore = (existing.status === 'closed' ? 10000 : 0) + (existing.summarySnapshot ? 1000 : 0) + (existing.endTime ? 100 : 0) + ((existing.transactions || []).length);
        const nScore = (sh.status === 'closed' ? 10000 : 0) + (sh.summarySnapshot ? 1000 : 0) + (sh.endTime ? 100 : 0) + ((sh.transactions || []).length);
        if (nScore > eScore) {
          bestById[sh.id] = sh;
        }
        healedCount++;
      }
    }

    const dedupedShifts = Object.values(bestById);
    dedupedShifts.sort((a, b) => {
      const da = (a.date || '') + (a.startTime || '');
      const db = (b.date || '') + (b.startTime || '');
      return da > db ? -1 : (da < db ? 1 : 0);
    });

    // Step 3: Recalculate summarySnapshot statically
    for (let i = 0; i < dedupedShifts.length; i++) {
      const sh = dedupedShifts[i];
      if (sh.status !== 'closed') continue;

      const oldSummary: any = sh.summarySnapshot || {};
      const savedCashCountTotal = oldSummary.cashCountTotal;

      const copy = { ...sh };
      delete copy.summarySnapshot;
      copy.status = 'open'; // calculate using open logic

      const fresh = await getShiftSummary(copy);
      if (fresh) {
        let actualCashCount = 0;
        const cc = sh.cashCount || {};
        for (const d in cc) {
          if (Object.prototype.hasOwnProperty.call(cc, d)) {
            actualCashCount += Number(d) * (cc[d] || 0);
          }
        }
        const cashCountTotal = actualCashCount > 0 ? actualCashCount : (savedCashCountTotal || 0);

        sh.summarySnapshot = {
          totalIncome: fresh.totalIncome,
          totalExpense: fresh.totalExpense,
          cashIncome: fresh.cashIncome,
          cardIncome: fresh.cardIncome,
          transferIncome: fresh.transferIncome,
          cukcukRevenue: fresh.cukcukRevenue,
          cukcukBills: fresh.cukcukBills,
          billCount: fresh.billCount,
          expectedCash: fresh.expectedCash,
          cashCountTotal,
          cashExpense: fresh.cashExpense,
          discrepancy: cashCountTotal - fresh.expectedCash,
          manualIncome: fresh.manualIncome,
          manualBills: fresh.manualBills,
          otherIncome: fresh.otherIncome,
          otherExpense: fresh.otherExpense,
          revenue: fresh.revenue,
          netTotal: fresh.netTotal
        };
        healedCount++;
      }
    }

    shifts.value = dedupedShifts;
    await save();

    console.log('[ShiftStore] healPastShiftsData: complete. Healed ' + healedCount + ' entities.');

    // Sync healed shifts in background
    try {
      const syncNext = (idx: number) => {
        if (idx >= dedupedShifts.length) {
          console.log('[ShiftStore] healPastShiftsData: cloud database sync complete.');
          return;
        }
        const cleanShift = JSON.parse(JSON.stringify(dedupedShifts[idx])) as Shift;
        closeShiftOnCloud(cleanShift).then(() => {
          setTimeout(() => syncNext(idx + 1), 150);
        }).catch(() => {
          setTimeout(() => syncNext(idx + 1), 150);
        });
      };
      syncNext(0);
    } catch (e) {}

    return healedCount;
  }

  // ── Reporting Helpers ──────────────────────────────────────────────
  async function getDailyReport(dateStr: string) {
    const dayShifts = shifts.value.filter(s => s.date === dateStr);
    let totalIncome = 0;
    let totalExpense = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let transferTotal = 0;
    let billCount = 0;

    for (let i = 0; i < dayShifts.length; i++) {
      const sm = await getHistorySummary(dayShifts[i]);
      if (sm) {
        totalIncome += sm.totalIncome;
        totalExpense += sm.totalExpense + sm.otherExpense;
        cashTotal += sm.cashIncome;
        cardTotal += sm.cardIncome;
        transferTotal += sm.transferIncome;
        billCount += sm.billCount;
      }
    }

    return {
      date: dateStr,
      shifts: dayShifts.length,
      totalIncome,
      totalExpense,
      cashTotal,
      cardTotal,
      transferTotal,
      billCount,
      net: totalIncome - totalExpense
    };
  }

  async function getWeeklyReport() {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push(await getDailyReport(dateStr));
    }
    return days;
  }

  async function getMonthlyReport() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const days = [];
    const d = new Date(firstDay);
    while (d <= today) {
      const dateStr = d.toISOString().split('T')[0];
      days.push(await getDailyReport(dateStr));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  return {
    currentShift,
    shifts,
    isSyncDirty,
    lastCloudPushTime,
    isSyncTimerActive,

    loadShifts,
    save,
    getShiftSummary,
    getHistorySummary,
    openShift,
    closeShift,
    reopenShiftById,
    reopenLastClosedShift,
    addTransaction,
    removeTransaction,
    editTransaction,
    addOtherTransaction,
    removeOtherTransaction,
    updateCashCount,
    syncCurrentShiftImmediate,
    syncCurrentShiftWithCloud,
    syncShiftHistory,
    addHistoryTransaction,
    editHistoryTransaction,
    removeHistoryTransaction,
    addHistoryOtherTransaction,
    removeHistoryOtherTransaction,
    updateHistoryCashCount,
    updateHistoryShiftField,
    updateHistoryDrinkInventory,
    editHistoryInvoicePayment,
    backfillHistoryInvoiceSnapshot,
    rebuildHistorySnapshots,
    deleteShiftFromHistory,
    healPastShiftsData,
    addInvoice,
    removeInvoice,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport
  };
});
