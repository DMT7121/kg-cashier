<script setup lang="ts">
import { ref } from 'vue';
import SystemTab from './settings/SystemTab.vue';
import PrinterTab from './settings/PrinterTab.vue';
import StaffTab from './settings/StaffTab.vue';
import AuditLogTab from './settings/AuditLogTab.vue';
import PrintFormsTab from './settings/PrintFormsTab.vue';
import InventoryTab from './settings/InventoryTab.vue';
import CloudAdminTab from './settings/CloudAdminTab.vue';

const activeTab = ref('system');

const tabs = [
  { key: 'system',    icon: 'settings',          label: 'Hệ thống' },
  { key: 'printer',   icon: 'print',             label: 'Máy in POS' },
  { key: 'staff',     icon: 'group',             label: 'Nhân viên' },
  { key: 'audit',     icon: 'history_edu',       label: 'Nhật ký' },
  { key: 'print',     icon: 'description',       label: 'Biểu mẫu in' },
  { key: 'inventory', icon: 'inventory_2',       label: 'Kho & NCC' },
  { key: 'cloud',     icon: 'cloud_sync',        label: 'Quản trị Cloud' }
];
</script>

<template>
  <div class="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
    <div class="max-w-7xl mx-auto flex flex-col gap-6">
      
      <!-- Page Header -->
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2 tracking-tight">
          <span class="material-symbols-rounded text-indigo-600 text-3xl">tune</span>
          Trung tâm Cấu hình hệ thống
        </h2>
        <p class="text-sm text-slate-500">Cấu hình kết nối API, phần cứng máy in, nhân sự và quản trị dữ liệu.</p>
      </div>

      <!-- Main Layout -->
      <div class="flex flex-col lg:flex-row gap-6 items-start">
        
        <!-- Sidebar Navigation -->
        <aside class="w-full lg:w-64 bg-white rounded-2xl border border-slate-100 shadow-xs p-3 shrink-0">
          <!-- Mobile tab scroll, Desktop vertical list -->
          <nav class="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0 scrollbar-none">
            <button 
              v-for="tab in tabs" 
              :key="tab.key"
              @click="activeTab = tab.key"
              class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 select-none group"
              :class="activeTab === tab.key 
                ? 'bg-indigo-50 text-indigo-700' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
            >
              <span 
                class="material-symbols-rounded text-xl transition-transform duration-200 group-hover:scale-105"
                :class="activeTab === tab.key ? 'text-indigo-600' : 'text-slate-400'"
              >
                {{ tab.icon }}
              </span>
              <span>{{ tab.label }}</span>
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
