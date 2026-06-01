<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useAppStore } from './stores/app';
import POS from './views/POS.vue';

// Initialize the central app state
const appStore = useAppStore();
const timeStr = ref('');
let timer: any = null;

function updateClock() {
  const now = new Date();
  const date = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  timeStr.value = `${date} — ${time}`;
}

onMounted(async () => {
  // Set global staff mode flag for compatibility
  (window as any)._staffMode = true;

  // Initialize storage and settings
  await appStore.initializeApp();
  updateClock();
  timer = setInterval(updateClock, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="staff-app min-h-screen bg-[#111318] text-[#e2e2e6] flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="staff-header shrink-0 flex items-center justify-between p-4 bg-[#181a20] border-b border-[#252830]">
      <div class="staff-header-left flex items-center gap-3">
        <img src="/android-chrome-192x192.png" alt="KG" class="staff-logo w-9 h-9 rounded-xl object-contain">
        <div>
          <div class="staff-brand text-sm font-bold tracking-wide">KING's GRILL</div>
          <div class="staff-role text-[10px] text-slate-400 font-semibold uppercase">📱 Nhân viên phục vụ</div>
        </div>
      </div>
      <div class="staff-header-right">
        <span class="staff-clock text-xs font-semibold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
          {{ timeStr }}
        </span>
      </div>
    </header>

    <!-- POS main view -->
    <div class="staff-view flex-1 overflow-y-auto">
      <POS />
    </div>
  </div>
</template>

<style>
/* CSS styles specific to staff application environment */
.staff-app {
  font-family: 'Be Vietnam Pro', system-ui, sans-serif;
}
</style>
