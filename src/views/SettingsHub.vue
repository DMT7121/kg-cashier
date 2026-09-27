<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import SystemTab from './settings/SystemTab.vue';
import PrinterTab from './settings/PrinterTab.vue';
import StaffTab from './settings/StaffTab.vue';
import AuditLogTab from './settings/AuditLogTab.vue';
import PrintFormsTab from './settings/PrintFormsTab.vue';
import InventoryTab from './settings/InventoryTab.vue';
import CloudAdminTab from './settings/CloudAdminTab.vue';

const appStore = useAppStore();
const activeTab = ref('system');

watch(() => appStore.currentSubView, (sub) => {
  if (!sub) return;
  let target = sub;
  if (target === 'print-forms') target = 'print';
  if (target === 'cloud-admin') target = 'cloud';
  const validTabs = ['system', 'printer', 'staff', 'audit', 'print', 'inventory', 'cloud'];
  if (validTabs.includes(target)) {
    activeTab.value = target;
  }
}, { immediate: true });

function switchTab(key: string) {
  activeTab.value = key;
  appStore.currentSubView = key;
}

const tabs = [
  { key: 'system',    icon: 'settings',          label: 'Cấu hình chung',       sub: 'API & Định dạng tiền' },
  { key: 'printer',   icon: 'print',             label: 'Máy in bill POS',      sub: 'K80, XP-80C, Bill mẫu' },
  { key: 'staff',     icon: 'group',             label: 'Nhân viên & Ca',       sub: 'Danh sách & Phân quyền' },
  { key: 'audit',     icon: 'history_edu',       label: 'Nhật ký hệ thống',     sub: 'Audit log & Lịch sử' },
  { key: 'print',     icon: 'description',       label: 'Mẫu in ấn',            sub: 'Tùy biến phiếu thu chi' },
  { key: 'inventory', icon: 'inventory_2',       label: 'Danh mục đồ uống',     sub: 'Giá vốn & Tồn kho ban đầu' },
  { key: 'cloud',     icon: 'cloud_sync',        label: 'Quản trị Cloud',       sub: 'Google Sheets & Cache' }
];
</script>

<template>
  <div class="view-content p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
    <!-- Compact Sub-Module Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-400 dark:text-slate-500">Cài đặt hệ thống /</span>
          <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            {{ tabs.find(t => t.key === activeTab)?.label || 'Cấu hình' }}
          </span>
        </div>
        <h2 class="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2.5 mt-0.5">
          <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400">
            {{ tabs.find(t => t.key === activeTab)?.icon || 'tune' }}
          </span>
          <span>{{ tabs.find(t => t.key === activeTab)?.label }}</span>
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {{ tabs.find(t => t.key === activeTab)?.sub }}
        </p>
      </div>
    </div>

    <!-- Main Content Area: 100% Full Width -->
    <main class="w-full min-w-0">
      <div class="transition-all duration-300 transform">
        <SystemTab v-if="activeTab === 'system'" />
        <PrinterTab v-else-if="activeTab === 'printer'" />
        <StaffTab v-else-if="activeTab === 'staff'" />
        <AuditLogTab v-else-if="activeTab === 'audit'" />
        <PrintFormsTab v-else-if="activeTab === 'print'" />
        <InventoryTab v-else-if="activeTab === 'inventory'" />
        <CloudAdminTab v-else-if="activeTab === 'cloud'" />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Scrollbar removal helper for navigation bar on mobile screen widths */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
