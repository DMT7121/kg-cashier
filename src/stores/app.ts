import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSettingsStore } from './settings';
import { useAuthStore } from './auth';
import { usePrintFormsStore } from './printForms';
import { useCategoriesStore } from './categories';
import { useShiftStore } from './shift';
import { useNotificationsStore } from './notifications';
import { showToast } from '../utils';

export const useAppStore = defineStore('app', () => {
  const isInitialized = ref(false);
  const currentView = ref('dashboard');
  const currentSubView = ref('');
  const syncIntervalId = ref<number | null>(null);

  const settingsStore = useSettingsStore();
  const authStore = useAuthStore();
  const printFormsStore = usePrintFormsStore();
  const categoriesStore = useCategoriesStore();
  const shiftStore = useShiftStore();
  const notificationsStore = useNotificationsStore();

  async function initializeApp() {
    if (isInitialized.value) return;

    try {
      // 1. Load settings & system configs
      await settingsStore.loadSettings();

      // 2. Load auth & user info
      authStore.loadAuth();

      // 3. Load print forms
      await printFormsStore.loadConfig();

      // 4. Load transaction categories
      categoriesStore.loadCategories();

      // 5. Load active shift from local DB
      await shiftStore.loadShifts();

      // 6. Check for unread alerts
      await notificationsStore.loadNotifications();

      // 7. Verify and pull categories/shifts from cloud if online
      if (settingsStore.settings.autoSync) {
        categoriesStore.pullCategoriesFromCloud().catch(() => {});
        shiftStore.syncCurrentShiftWithCloud().catch(() => {});
      }

      // Start background cloud sync loop (every 60s)
      startSyncInterval();

      isInitialized.value = true;
    } catch (e: any) {
      console.error('[AppInit Error]', e);
      showToast('Khởi động ứng dụng thất bại: ' + e.message, 'error');
    }
  }

  function startSyncInterval() {
    if (syncIntervalId.value) return;

    syncIntervalId.value = window.setInterval(async () => {
      if (!settingsStore.settings.autoSync) return;

      try {
        if (shiftStore.isSyncDirty) {
          await shiftStore.syncCurrentShiftImmediate();
        } else {
          await shiftStore.syncCurrentShiftWithCloud();
        }
        await shiftStore.syncShiftHistory();
      } catch (e) {
        console.warn('[SyncInterval] Auto-sync failed:', e);
      }

      // CUKCUK Auto Pull & Merge (Only if configured and autoSync is enabled)
      if (settingsStore.settings.cukcuk?.autoSync) {
        try {
          const shiftDate = shiftStore.currentShift?.date || new Date().toISOString().split('T')[0];
          const { pullAndMergeCukcukInvoices } = await import('../integration/cukcuk');
          const mergedCount = await pullAndMergeCukcukInvoices(shiftDate);
          if (mergedCount > 0) {
            window.dispatchEvent(new CustomEvent('cukcuk-invoices-updated', { detail: { mergedCount, date: shiftDate } }));
          }
        } catch (cukErr) {
          console.warn('[SyncInterval] CUKCUK auto-pull failed:', cukErr);
        }
      }
    }, 60000);
  }

  function stopSyncInterval() {
    if (syncIntervalId.value) {
      clearInterval(syncIntervalId.value);
      syncIntervalId.value = null;
    }
  }

  function navigateTo(target: string, subView?: string) {
    let viewName = target;
    let explicitSub = subView || '';

    // Handle hash paths like "revenue/hourly" or "settings/printer"
    if (viewName.includes('/')) {
      const parts = viewName.split('/');
      viewName = parts[0];
      explicitSub = parts[1];
    }

    // ── Redirect legacy hashes to consolidated views and sub-views ──
    if (viewName === 'staff') {
      viewName = 'settings';
      explicitSub = 'staff';
    } else if (viewName === 'audit') {
      viewName = 'settings';
      explicitSub = 'audit';
    } else if (viewName === 'print-forms') {
      viewName = 'settings';
      explicitSub = 'print-forms';
    } else if (viewName === 'invoices') {
      viewName = 'transactions';
    } else if (viewName === 'report' || viewName === 'analytics') {
      viewName = 'revenue';
    } else if (viewName === 'vat-invoices') {
      viewName = 'vat';
    } else if (viewName === 'extensions') {
      viewName = 'extension';
    } else if (viewName === 'cukcuk') {
      viewName = 'revenue';
      explicitSub = 'cukcuk';
    }

    // ── Shift Protection Logic ──
    const shift = shiftStore.currentShift;
    const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

    // If shift is open but not validated, force 'shift' view (Unlock screen)
    if (shift && !isValidated && viewName !== 'shift' && viewName !== 'settings' && viewName !== 'vat') {
      viewName = 'shift';
      explicitSub = '';
    }

    currentView.value = viewName;
    currentSubView.value = explicitSub;
    window.location.hash = explicitSub ? `${viewName}/${explicitSub}` : viewName;
  }

  return {
    isInitialized,
    currentView,
    currentSubView,
    initializeApp,
    startSyncInterval,
    stopSyncInterval,
    navigateTo
  };
});
