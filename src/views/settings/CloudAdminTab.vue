<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useCategoriesStore } from '../../stores/categories';
import { usePrintFormsStore } from '../../stores/printForms';
import { useShiftStore } from '../../stores/shift';
import { 
  pingAPI, 
  isOnline, 
  getQueueSize, 
  getMetadata, 
  getShiftRegistryFromCloud,
  repairShiftsOnCloud, 
  voidGhostShiftOnCloud, 
  rebuildCukcukIndexOnCloud, 
  getCukcukSyncStateFromCloud 
} from '../../services/api';
import { showToast } from '../../utils';

const settingsStore = useSettingsStore();
const categoriesStore = useCategoriesStore();
const printFormsStore = usePrintFormsStore();
const shiftStore = useShiftStore();

// Manager security
const managerPassword = ref('');

// Health check states
const gasApiStatus = ref('Đang kiểm tra...');
const isGasOk = ref(false);
const onlineStatus = ref(isOnline());
const queueLength = ref(getQueueSize());
const metadata = ref<any>(null);

// Shift Registry states
const registryList = ref<any[]>([]);
const registryLoading = ref(false);
const registryError = ref('');

// Index rebuild states
const rebuildRunning = ref(false);
const rebuildProgressPercent = ref(0);
const rebuildTaskName = ref('');
const rebuildDetailText = ref('');
const rebuildStatusText = ref('Đang khởi tạo...');
const showRebuildProgress = ref(false);

const cukSyncTaskName = ref('');
const cukSyncStatus = ref('Chưa chạy');
const cukSyncProgress = ref('');
const cukSyncDetails = ref('');
const cukSyncTime = ref('');

let rebuildTimer: any = null;
let healthTimer: any = null;

onMounted(() => {
  metadata.value = getMetadata();
  onlineStatus.value = isOnline();
  queueLength.value = getQueueSize();
  
  checkHealth();
  loadRegistryAndSyncStates();

  // Polling for health check
  healthTimer = setInterval(() => {
    onlineStatus.value = isOnline();
    queueLength.value = getQueueSize();
    checkHealth();
  }, 15000);
});

onUnmounted(() => {
  if (rebuildTimer) clearInterval(rebuildTimer);
  if (healthTimer) clearInterval(healthTimer);
});

async function checkHealth() {
  try {
    const res = await pingAPI();
    if (res.success) {
      isGasOk.value = true;
      gasApiStatus.value = `Hoạt động tốt (${new Date(res.timestamp).toLocaleTimeString()})`;
    } else {
      isGasOk.value = false;
      gasApiStatus.value = 'Mất kết nối: ' + (res.message || 'Lỗi HTTP');
    }
  } catch (err: any) {
    isGasOk.value = false;
    gasApiStatus.value = 'Lỗi kết nối: ' + err.message;
  }
}

async function loadRegistryAndSyncStates() {
  registryLoading.value = true;
  registryError.value = '';
  try {
    const res = await getShiftRegistryFromCloud();
    if (res.success && res.registry) {
      registryList.value = res.registry;
    } else {
      registryError.value = res.message || 'Lỗi kết nối';
    }
  } catch (err: any) {
    registryError.value = err.message;
  } finally {
    registryLoading.value = false;
  }

  // Fetch index sync state
  await checkCukcukSyncState();
}

async function checkCukcukSyncState() {
  try {
    const res = await getCukcukSyncStateFromCloud();
    if (res.success && res.syncState) {
      const state = res.syncState;
      cukSyncTaskName.value = state.task || 'Không có';
      cukSyncStatus.value = state.status || 'Chưa chạy';
      cukSyncProgress.value = `${state.currentRow || 0} / ${state.totalRows || 0} dòng`;
      cukSyncDetails.value = state.message || '';
      cukSyncTime.value = state.timestamp ? new Date(state.timestamp).toLocaleString('vi-VN') : 'chưa rõ';

      if (state.status === 'RUNNING') {
        showRebuildProgress.value = true;
        rebuildRunning.value = true;
        rebuildTaskName.value = state.task;
        rebuildStatusText.value = 'Đang tiến hành đồng bộ: ' + state.task;
        
        const percent = state.totalRows > 0 ? Math.round((state.currentRow / state.totalRows) * 100) : 0;
        rebuildProgressPercent.value = percent;
        rebuildDetailText.value = `${state.message || ''}\nĐang xử lý dòng ${state.currentRow} trên ${state.totalRows}...`;

        if (!rebuildTimer) {
          startRebuildPolling();
        }
      } else {
        rebuildRunning.value = false;
        if (state.status === 'COMPLETED') {
          rebuildProgressPercent.value = 100;
          rebuildStatusText.value = 'Đồng bộ/Tái tạo hoàn tất!';
          rebuildDetailText.value = state.message || '';
          setTimeout(() => {
            if (!rebuildRunning.value) {
              showRebuildProgress.value = false;
            }
          }, 6000);
        } else {
          showRebuildProgress.value = false;
        }
        stopRebuildPolling();
      }
    }
  } catch (e) {
    console.warn('[CukcukState] Error getting sync state:', e);
  }
}

function startRebuildPolling() {
  if (rebuildTimer) clearInterval(rebuildTimer);
  rebuildTimer = setInterval(async () => {
    await checkCukcukSyncState();
  }, 3000);
}

function stopRebuildPolling() {
  if (rebuildTimer) {
    clearInterval(rebuildTimer);
    rebuildTimer = null;
  }
}

async function handleRebuildIndex() {
  const pass = managerPassword.value.trim();
  if (!pass) {
    showToast('Vui lòng nhập mật khẩu quản lý để thiết lập lại chỉ mục!', 'warning');
    return;
  }

  const ok = confirm('Bạn có chắc chắn muốn tái thiết lập toàn bộ chỉ mục CUKCUK? Thao tác này sẽ quét lại toàn bộ lịch sử hóa đơn trong ca.');
  if (!ok) return;

  showToast('Đang bắt đầu tái thiết lập chỉ mục...', 'info');
  try {
    const res = await rebuildCukcukIndexOnCloud(pass);
    if (res.success) {
      showToast('Đã kích hoạt tái xây dựng chỉ mục trên Cloud!', 'success');
      showRebuildProgress.value = true;
      rebuildStatusText.value = 'Bắt đầu gửi lệnh tái tạo...';
      rebuildProgressPercent.value = 0;
      startRebuildPolling();
    } else {
      showToast('Thất bại: ' + (res.message || 'Lỗi không xác định'), 'error');
    }
  } catch (err: any) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

async function handleRepairRegistry() {
  const pass = managerPassword.value.trim();
  if (!pass) {
    showToast('Vui lòng nhập mật khẩu quản lý để sửa registry!', 'warning');
    return;
  }

  const ok = confirm('Hệ thống sẽ quét và tự động đóng/xử lý các ca bị treo hoặc xung đột. Tiếp tục?');
  if (!ok) return;

  showToast('Đang gửi yêu cầu sửa registry...', 'info');
  try {
    const res = await repairShiftsOnCloud(pass);
    if (res.success) {
      showToast('Đã sửa lỗi registry ca thành công!', 'success');
      await loadRegistryAndSyncStates();
    } else {
      showToast('Thất bại: ' + (res.message || 'Mật khẩu sai'), 'error');
    }
  } catch (err: any) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

async function handleVoidShift(shiftId: string) {
  const pass = managerPassword.value.trim();
  if (!pass) {
    showToast('Vui lòng nhập mật khẩu quản lý ở thanh bên dưới!', 'warning');
    return;
  }

  const ok = confirm(`Xác nhận hủy (void) ca làm việc "${shiftId}" trên Registry Cloud? Mọi thiết bị sẽ có thể đăng ký lại ca mới.`);
  if (!ok) return;

  showToast('Đang gửi yêu cầu hủy ca...', 'info');
  try {
    const res = await voidGhostShiftOnCloud(shiftId, pass);
    if (res.success) {
      showToast('Hủy ca thành công!', 'success');
      await loadRegistryAndSyncStates();
    } else {
      showToast('Thất bại: ' + (res.message || 'Yêu cầu không được duyệt'), 'error');
    }
  } catch (err: any) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

// ── Database Backup & Restore ──
function handleExportBackup() {
  try {
    const backupData = {
      settings: settingsStore.settings,
      categories: categoriesStore.categories,
      printForms: printFormsStore.config,
      currentShift: shiftStore.currentShift,
      shifts: shiftStore.shifts,
      recentlyClosed: (shiftStore as any)._recentlyClosedIds || [],
      forceClosed: (shiftStore as any)._forceClosedIds || [],
      deletedShiftIds: (shiftStore as any)._deletedShiftIds || [],
      schemaVersion: 1,
      backupTime: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kg-cashier-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Đã tải xuống tệp sao lưu dữ liệu (.json)', 'success');
  } catch (e: any) {
    showToast('Lỗi kết xuất dữ liệu: ' + e.message, 'error');
  }
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const text = e.target?.result as string;
      const backup = JSON.parse(text);

      if (!backup || typeof backup !== 'object') {
        throw new Error('Dữ liệu không phải là một đối tượng JSON hợp lệ');
      }

      if (backup.schemaVersion === undefined) {
        throw new Error('Không tìm thấy phiên bản cấu trúc (schemaVersion)');
      }

      const ok = confirm('CẢNH BÁO: Thao tác này sẽ ghi đè toàn bộ cấu hình, lịch sử ca và danh mục hiện tại. Bạn có chắc chắn muốn khôi phục?');
      if (!ok) return;

      // 1. Restore settings
      if (backup.settings) {
        await settingsStore.updateSettings(backup.settings);
      }

      // 2. Restore categories
      if (backup.categories) {
        categoriesStore.categories = backup.categories;
        categoriesStore.saveCategories();
        categoriesStore.syncCategoriesToCloud();
      }

      // 3. Restore print forms
      if (backup.printForms) {
        await printFormsStore.updatePrintForms(backup.printForms);
      }

      // 4. Restore shifts states
      shiftStore.currentShift = backup.currentShift || null;
      shiftStore.shifts = backup.shifts || [];
      (shiftStore as any)._recentlyClosedIds = backup.recentlyClosed || [];
      (shiftStore as any)._forceClosedIds = backup.forceClosed || [];
      (shiftStore as any)._deletedShiftIds = backup.deletedShiftIds || [];
      await shiftStore.save();

      showToast('✅ Khôi phục toàn bộ cơ sở dữ liệu thành công!', 'success');
      
      // Force reload UI after short delay to apply settings cleanly
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      showToast('Khôi phục thất bại: ' + err.message, 'error');
    }
  };

  reader.readAsText(file);
}
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Left Column: Health Monitor & DB Backup -->
    <div class="flex flex-col gap-6 xl:col-span-1">
      <!-- Health check monitor card -->
      <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
        <div class="border-b border-slate-100 pb-3">
          <h4 class="text-md font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-emerald-500">health_and_safety</span>
            Trạng thái kết nối Hệ thống
          </h4>
        </div>

        <div class="flex flex-col gap-3 text-xs">
          <div class="flex justify-between items-center py-1.5 border-b border-slate-50">
            <span class="text-slate-500">Google Apps Script API:</span>
            <span class="font-bold flex items-center gap-1" :class="isGasOk ? 'text-emerald-600' : 'text-rose-500'">
              <span class="w-1.5 h-1.5 rounded-full" :class="isGasOk ? 'bg-emerald-600' : 'bg-rose-500'"></span>
              {{ gasApiStatus }}
            </span>
          </div>

          <div class="flex justify-between items-center py-1.5 border-b border-slate-50">
            <span class="text-slate-500">Môi trường ứng dụng:</span>
            <span class="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold uppercase">
              {{ metadata?.environment || 'webapp' }}
            </span>
          </div>

          <div class="flex justify-between items-center py-1.5 border-b border-slate-50">
            <span class="text-slate-500">Hàng đợi đồng bộ (offline queue):</span>
            <span class="font-bold font-mono" :class="queueLength > 0 ? 'text-amber-600' : 'text-slate-600'">
              {{ queueLength }} tác vụ
            </span>
          </div>

          <div class="flex justify-between items-center py-1.5 border-b border-slate-50">
            <span class="text-slate-500">Mạng LAN/Internet:</span>
            <span class="font-bold" :class="onlineStatus ? 'text-emerald-600' : 'text-rose-500'">
              {{ onlineStatus ? 'ONLINE' : 'OFFLINE' }}
            </span>
          </div>

          <div class="flex justify-between items-center py-1.5">
            <span class="text-slate-500">ID Thiết bị hiện tại:</span>
            <span class="font-mono text-slate-400 text-[10px] select-all">{{ metadata?.deviceId || 'server' }}</span>
          </div>
        </div>
      </div>

      <!-- Backup and Restore card -->
      <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
        <div class="border-b border-slate-100 pb-3">
          <h4 class="text-md font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-indigo-500">cloud_upload</span>
            Sao lưu & Khôi phục (JSON Database)
          </h4>
        </div>

        <p class="text-xs text-slate-500 leading-relaxed">
          Xuất toàn bộ cơ sở dữ liệu hiện tại bao gồm cấu hình, mẫu in, lịch sử ca và các giao dịch ra tệp JSON sao lưu cục bộ.
        </p>

        <div class="flex flex-col gap-2 mt-2">
          <!-- Export button -->
          <button @click="handleExportBackup" class="btn w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors">
            <span class="material-symbols-rounded text-sm">download</span>
            Xuất file sao lưu cấu hình (.json)
          </button>

          <!-- Import file selector wrapper -->
          <label class="btn w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors text-center">
            <span class="material-symbols-rounded text-sm text-indigo-500">upload_file</span>
            Khôi phục từ file sao lưu (.json)
            <input type="file" @change="handleImportFile" accept=".json" class="hidden">
          </label>
        </div>
      </div>
    </div>

    <!-- Right Column: Cloud Index Rebuild & Shift Registry Conflict solver -->
    <div class="flex flex-col gap-6 xl:col-span-2">
      <!-- CUKCUK index sync card -->
      <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
        <div class="border-b border-slate-100 pb-3">
          <h4 class="text-md font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-orange-500">speed</span>
            Tối ưu hóa & Tái tạo CUKCUK Sync Index
          </h4>
        </div>

        <p class="text-xs text-slate-500 leading-relaxed">
          Ứng dụng lưu trữ tệp chỉ mục hóa đơn <code>CUKCUK_INDEX</code> trên đám mây để kiểm tra đối soát ca tức thời trong O(1). Nếu chỉ mục hóa đơn bị sai lệch, thiếu sót, hoặc bị lệch số tiền bán, hãy chạy tái thiết lập chỉ mục để đồng bộ sạch từ máy chủ CUKCUK.
        </p>

        <!-- Progress bar when rebuilding is running -->
        <div v-if="showRebuildProgress" class="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-col gap-2 animate-scaleUp">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold text-indigo-900">{{ rebuildStatusText }}</span>
            <span class="font-mono font-bold text-indigo-700">{{ rebuildProgressPercent }}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div class="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" :style="{ width: rebuildProgressPercent + '%' }"></div>
          </div>
          <pre class="text-[10px] text-slate-500 font-mono whitespace-pre-wrap leading-tight mt-1">{{ rebuildDetailText }}</pre>
        </div>

        <!-- Trigger buttons -->
        <div class="flex flex-col sm:flex-row gap-3 items-end mt-2">
          <div class="form-group flex-1 w-full">
            <label class="text-[11px] font-bold text-slate-700 mb-1 block">🔐 Mật khẩu quản lý (Admin/Manager)</label>
            <input type="password" v-model="managerPassword" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" style="letter-spacing: 2px;" placeholder="Nhập mật khẩu quản lý...">
          </div>
          <button @click="handleRebuildIndex" :disabled="rebuildRunning" class="btn px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 h-9 shrink-0">
            <span class="material-symbols-rounded text-sm">build_circle</span>
            Tái thiết lập CUKCUK Index
          </button>
        </div>

        <!-- Sync state logs block -->
        <div class="mt-4 border border-slate-100 rounded-xl p-4 bg-slate-50">
          <h5 class="text-xs font-bold text-slate-700 mb-2">Trạng thái đồng bộ đám mây hiện tại:</h5>
          <div class="font-mono text-xs text-slate-600 flex flex-col gap-1.5 leading-relaxed">
            <div><strong class="text-slate-800">Tác vụ:</strong> {{ cukSyncTaskName }}</div>
            <div><strong class="text-slate-800">Trạng thái:</strong> <span class="px-2 py-0.5 rounded text-[10px] font-bold" :class="cukSyncStatus === 'RUNNING' ? 'bg-amber-50 text-amber-700 border border-amber-100' : cukSyncStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'">{{ cukSyncStatus }}</span></div>
            <div><strong class="text-slate-800">Tiến độ dòng:</strong> {{ cukSyncProgress }}</div>
            <div v-if="cukSyncDetails"><strong class="text-slate-800">Chi tiết:</strong> {{ cukSyncDetails }}</div>
            <div><strong class="text-slate-800">Cập nhật:</strong> {{ cukSyncTime }}</div>
          </div>
        </div>
      </div>

      <!-- Cloud Shift registry management card -->
      <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
        <div class="border-b border-slate-100 pb-3 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h4 class="text-md font-bold text-slate-800 flex items-center gap-2">
              <span class="material-symbols-rounded text-amber-500">dns</span>
              Đăng ký Ca & Kiểm soát đa thiết bị (Cloud Registry)
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">Registry giám sát các ca đang hoạt động thực tế trên đám mây.</p>
          </div>

          <div class="flex gap-2">
            <button @click="loadRegistryAndSyncStates" :disabled="registryLoading" class="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
              <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': registryLoading }">refresh</span>
              Quét lại
            </button>
            <button @click="handleRepairRegistry" class="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold transition-colors">
              <span class="material-symbols-rounded text-sm">healing</span>
              Tự sửa lỗi Treo Ca
            </button>
          </div>
        </div>

        <div v-if="registryError" class="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 text-center">
          Không thể tải Cloud Registry: {{ registryError }}
        </div>

        <!-- Shift registry tables -->
        <div v-else class="border border-slate-100 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                  <th class="p-3">ID Ca</th>
                  <th class="p-3">Ngày Làm Việc</th>
                  <th class="p-3">Số Ca</th>
                  <th class="p-3">Thu Ngân</th>
                  <th class="p-3">Trạng Thái</th>
                  <th class="p-3 text-center">Hành Động</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="registryList.length === 0" class="text-center text-slate-400">
                  <td colspan="6" class="p-6">Hiện không có ca nào được đăng ký trên Cloud.</td>
                </tr>
                <tr v-else v-for="item in registryList" :key="item.id" class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td class="p-3 font-mono font-bold text-slate-800">{{ item.id }}</td>
                  <td class="p-3">{{ item.date || item.workDay }}</td>
                  <td class="p-3 font-semibold">Ca {{ item.shiftNumber }}</td>
                  <td class="p-3">{{ item.cashierName }}</td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold border" :class="item.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : item.status === 'closed' ? 'bg-slate-50 text-slate-500 border-slate-100' : 'bg-rose-50 text-rose-700 border-rose-100'">
                      {{ item.status === 'open' ? 'Đang Mở' : item.status === 'closed' ? 'Đã Đóng' : 'Đã Hủy' }}
                    </span>
                  </td>
                  <td class="p-3 text-center">
                    <button v-if="item.status === 'open'" @click="handleVoidShift(item.id)" class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold transition-colors">
                      Hủy ca (Void)
                    </button>
                    <span v-else class="text-slate-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
