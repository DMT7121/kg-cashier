import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuditsStore } from './audits';

export interface User {
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  pin?: string;
  [key: string]: any;
}

export interface Staff {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'manager' | 'cashier';
  status: 'active' | 'inactive';
  createdAt?: string;
}

const SESSION_KEY = 'kg_logged_in_user';
const STAFF_CACHE_KEY = 'kg_cached_staff';

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null);
  const cachedStaff = ref<string[]>([]);
  const staffList = ref<Staff[]>([]);
  const auditsStore = useAuditsStore();

  function loadAuth() {
    try {
      const savedUser = sessionStorage.getItem(SESSION_KEY);
      if (savedUser) {
        currentUser.value = JSON.parse(savedUser);
      }
    } catch (e) {
      currentUser.value = null;
    }

    try {
      const savedStaff = localStorage.getItem(STAFF_CACHE_KEY);
      if (savedStaff) {
        cachedStaff.value = JSON.parse(savedStaff);
      } else {
        cachedStaff.value = [];
      }
    } catch (e) {
      cachedStaff.value = [];
    }

    try {
      const savedStaffList = localStorage.getItem('kg_cached_staff_list');
      if (savedStaffList) {
        staffList.value = JSON.parse(savedStaffList);
      } else {
        staffList.value = [];
      }
    } catch (e) {
      staffList.value = [];
    }
  }

  function setLoggedInUser(user: User) {
    currentUser.value = user;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function logoutUser() {
    const userName = currentUser.value?.name || '';
    auditsStore.addAudit('LOGOUT', userName);
    currentUser.value = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  const isLoggedIn = computed(() => !!currentUser.value);

  function hasRole(requiredRole: 'admin' | 'manager' | 'cashier'): boolean {
    if (!currentUser.value) return false;
    if (currentUser.value.role === 'admin') return true;
    if (requiredRole === 'manager') return currentUser.value.role === 'manager';
    return true;
  }

  // Cached staff management for shift opening quick selection
  function getCachedStaff(): string[] {
    return cachedStaff.value;
  }

  function setCachedStaff(staffList: string[]) {
    cachedStaff.value = [...staffList];
    try {
      localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(staffList));
    } catch (e) {
      console.warn('[AuthStore] Staff cache write error:', e);
    }
  }

  function setStaffList(list: Staff[]) {
    staffList.value = [...list];
    try {
      localStorage.setItem('kg_cached_staff_list', JSON.stringify(list));
    } catch (e) {
      console.warn('[AuthStore] Staff list cache write error:', e);
    }
    // Sync to name list for backward compatibility
    setCachedStaff(list.map(s => s.name));
  }

  function clearCachedStaff() {
    cachedStaff.value = [];
    staffList.value = [];
    try {
      localStorage.removeItem(STAFF_CACHE_KEY);
      localStorage.removeItem('kg_cached_staff_list');
    } catch (e) {}
  }

  return {
    currentUser,
    cachedStaff,
    staffList,
    isLoggedIn,
    loadAuth,
    setLoggedInUser,
    logoutUser,
    hasRole,
    getCachedStaff,
    setCachedStaff,
    setStaffList,
    clearCachedStaff
  };
});
