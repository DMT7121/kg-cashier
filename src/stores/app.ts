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
        await shiftStore.syncCurrentShiftWithCloud();
        await shiftStore.syncShiftHistory();
      } catch (e) {
        console.warn('[SyncInterval] Auto-sync failed:', e);
      }
    }, 60000);
  }

  function stopSyncInterval() {
    if (syncIntervalId.value) {
      clearInterval(syncIntervalId.value);
      syncIntervalId.value = null;
    }
  }

  function navigateTo(viewName: string) {
    // ── Redirect legacy hashes to consolidated views ──
    if (viewName === 'staff' || viewName === 'audit' || viewName === 'print-forms') {
      viewName = 'settings';
    }
    if (viewName === 'invoices') {
      viewName = 'transactions';
    }
    if (viewName === 'report' || viewName === 'analytics' || viewName === 'cukcuk') {
      viewName = 'revenue';
    }

    // ── Shift Protection Logic ──
    const shift = shiftStore.currentShift;
    const isValidated = sessionStorage.getItem('shift_validated') === (shift ? shift.id : '');

    // If shift is open but not validated, force 'shift' view (Unlock screen)
    if (shift && !isValidated && viewName !== 'shift' && viewName !== 'settings' && viewName !== 'vat') {
      viewName = 'shift';
    }

    currentView.value = viewName;
    window.location.hash = viewName;
  }

  return {
    isInitialized,
    currentView,
    initializeApp,
    startSyncInterval,
    stopSyncInterval,
    navigateTo
  };
});
