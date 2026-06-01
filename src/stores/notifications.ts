import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface AppNotification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<AppNotification[]>([]);

  const unreadCount = computed(() => {
    return notifications.value.filter(n => !n.read).length;
  });

  function addNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const id = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    notifications.value.unshift({
      id,
      message,
      type,
      timestamp: new Date().toISOString(),
      read: false
    });
    if (notifications.value.length > 50) {
      notifications.value.length = 50;
    }
    saveNotifications();
  }

  function markAllRead() {
    notifications.value.forEach(n => n.read = true);
    saveNotifications();
  }

  function clearNotifications() {
    notifications.value = [];
    saveNotifications();
  }

  function saveNotifications() {
    try {
      localStorage.setItem('kg-notifications', JSON.stringify(notifications.value));
    } catch (e) {
      console.warn('[Notifications] Save failed:', e);
    }
  }

  function loadNotifications() {
    try {
      const data = localStorage.getItem('kg-notifications');
      if (data) {
        notifications.value = JSON.parse(data);
      }
    } catch (e) {
      console.warn('[Notifications] Load failed:', e);
    }
  }

  return {
    notifications,
    unreadCount,
    addNotification,
    markAllRead,
    clearNotifications,
    loadNotifications
  };
});
