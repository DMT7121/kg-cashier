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
  <div class="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-6 lg:p-8">
    <div class="max-w-7xl mx-auto flex flex-col gap-6">
      
      <!-- Page Header -->
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
          <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400 text-3xl">tune</span>
          Trung tâm Cấu hình hệ thống
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">Cấu hình kết nối API, phần cứng máy in, nhân sự và quản trị dữ liệu.</p>
      </div>

      <!-- Main Layout -->
      <div class="flex flex-col lg:flex-row gap-6 items-start">
        
        <!-- Sidebar Navigation -->
        <aside class="w-full lg:w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs p-3 shrink-0">
          <div class="px-3 py-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden lg:block">
            Phân hệ cấu hình
          </div>
          <!-- Mobile tab scroll, Desktop vertical list -->
          <nav aria-label="Menu cài đặt hệ thống" class="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 lg:pb-0 scrollbar-none">
            <button 
              v-for="tab in tabs" 
              :key="tab.key"
              @click="switchTab(tab.key)"
              class="flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 select-none group w-full cursor-pointer"
              :class="activeTab === tab.key 
                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-l-4 border-emerald-500 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'"
            >
              <div 
                class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                :class="activeTab === tab.key ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200'"
              >
                <span class="material-symbols-rounded text-xl">{{ tab.icon }}</span>
              </div>
              <div class="min-w-0">
                <div class="text-xs md:text-sm font-bold truncate">{{ tab.label }}</div>
                <div class="text-[11px] text-slate-400 dark:text-slate-500 truncate hidden lg:block">{{ tab.sub }}</div>
              </div>
            </button>
          </nav>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 w-full min-w-0">
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
    </div>
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
