<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuditsStore, AuditEntry } from '../../stores/audits';
import { getAuditLogFromCloud } from '../../services/api';
import { formatDateTime, showToast } from '../../utils';

const auditsStore = useAuditsStore();

const searchQuery = ref('');
const loading = ref(false);
const cloudLogs = ref<AuditEntry[]>([]);

onMounted(() => {
  auditsStore.loadAudits();
  loadLogs();
});

async function loadLogs() {
  loading.value = true;
  try {
    const res = await getAuditLogFromCloud(500);
    if (res.success && res.logs) {
      cloudLogs.value = res.logs;
    }
  } catch (e) {
    console.warn('[AuditTab] Cloud logs fetch failed:', e);
  } finally {
    loading.value = false;
  }
}

// Action icon mapping
const actionIcons: Record<string, string> = {
  'OPEN_SHIFT': '🟢', 'CLOSE_SHIFT': '🔴', 'ADD_TX': '💰', 'REMOVE_TX': '🗑️',
  'SYNC_SHIFT': '☁️', 'LOGIN': '🔑', 'LOGOUT': '🚪', 'ADD_INVOICE': '📎',
  'UPDATE_CASH_COUNT': '💵', 'SAVE_STAFF': '👤', 'DELETE_STAFF': '❌',
  'UPDATE_SETTINGS': '⚙️', 'ADD_OTHER_TX': '📋', 'UPLOAD_FILE': '📤',
  'DELETE_SHIFT_HISTORY': '🗑️'
};

const combinedLogs = computed(() => {
  const local = auditsStore.auditLog || [];
  const remote = cloudLogs.value || [];
  
  // Merge and deduplicate by key
  const all = [...local, ...remote];
  const seen = new Set<string>();
  const deduped: AuditEntry[] = [];
  
  for (const log of all) {
    const key = `${log.timestamp}_${log.action}_${log.user}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(log);
    }
  }
  
  // Sort descending by date
  return deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
});

const filteredLogs = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return combinedLogs.value;
  
  return combinedLogs.value.filter(log => 
    (log.action || '').toLowerCase().includes(query) ||
    (log.user || '').toLowerCase().includes(query) ||
    (log.details || '').toLowerCase().includes(query)
  );
});

function handleExportCsv() {
  const logs = filteredLogs.value;
  if (logs.length === 0) {
    showToast('Không có dữ liệu nhật ký để xuất', 'warning');
    return;
  }
  
  let csv = 'Thời gian,Người dùng,Hành động,Chi tiết\n';
  logs.forEach(l => {
    const detailEscaped = (l.details || '').replace(/"/g, '""');
    csv += `"${l.timestamp}","${l.user || ''}","${l.action || ''}","${detailEscaped}"\n`;
  });
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('Đã xuất file nhật ký CSV', 'success');
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
      <!-- Section Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-slate-600">assignment</span>
            Nhật ký hoạt động (Audit Logs)
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">Ghi lại toàn bộ lịch sử thao tác của các tài khoản thu ngân.</p>
        </div>
        
        <div class="flex gap-2">
          <button @click="loadLogs" :disabled="loading" class="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
            <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': loading }">refresh</span>
            Làm mới
          </button>
          <button @click="handleExportCsv" class="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm text-indigo-500">download</span>
            Xuất CSV
          </button>
        </div>
      </div>

      <!-- Search Filter -->
      <div class="form-group">
        <input 
          type="text" 
          v-model="searchQuery" 
          class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
          placeholder="🔍 Tìm kiếm nhanh theo hành động, người dùng, chi tiết..."
        >
      </div>

      <!-- Logs Table -->
      <div class="border border-slate-100 rounded-xl overflow-hidden">
        <div class="overflow-x-auto max-h-[500px]">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <th class="p-3 w-40">Thời gian</th>
                <th class="p-3 w-32">Người dùng</th>
                <th class="p-3 w-48">Hành động</th>
                <th class="p-3">Chi tiết nội dung</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredLogs.length === 0" class="text-center text-slate-400">
                <td colspan="4" class="p-8">Không tìm thấy dữ liệu nhật ký nào.</td>
              </tr>
              <tr 
                v-else 
                v-for="(log, idx) in filteredLogs.slice(0, 300)" 
                :key="idx" 
                class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
              >
                <td class="p-3 font-mono text-slate-500 whitespace-nowrap">{{ formatDateTime(log.timestamp) }}</td>
                <td class="p-3 font-semibold text-slate-700">{{ log.user || 'SYSTEM' }}</td>
                <td class="p-3 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5">
                    <span>{{ actionIcons[log.action] || '📌' }}</span>
                    <span class="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-bold">{{ log.action }}</span>
                  </span>
                </td>
                <td class="p-3 text-slate-500 whitespace-pre-wrap leading-relaxed">{{ log.details || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="text-xxs text-slate-400 text-right mt-1" v-if="filteredLogs.length > 0">
        Hiển thị tối đa 300 dòng nhật ký mới nhất.
      </div>
    </div>
  </div>
</template>
