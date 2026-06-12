<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { getStaffFromCloud, saveStaffToCloud, deleteStaffFromCloud } from '../../services/api';
import { showToast } from '../../utils';

const authStore = useAuthStore();

// Security Auth state
const isStaffAuthed = ref(false);
const adminPassword = ref('');

// Staff states
interface Staff {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'manager' | 'cashier';
  status: 'active' | 'inactive';
  createdAt?: string;
}

const staffList = ref<Staff[]>([]);
const syncStatus = ref('Đang tải danh sách nhân viên...');
const syncTime = ref('');
const isBusy = ref(false);

// Modal states
const showModal = ref(false);
const modalTitle = ref('Thêm nhân viên mới');
const modalName = ref('');
const modalPin = ref('');
const modalRole = ref<'admin' | 'manager' | 'cashier'>('cashier');
const modalActive = ref(true);
const editingStaff = ref<Staff | null>(null);

let refreshTimer: any = null;

onMounted(() => {
  // Auto-authenticate if current logged-in user is admin
  if (authStore.currentUser?.role === 'admin') {
    isStaffAuthed.value = true;
  }
});

onUnmounted(() => {
  clearRefreshTimer();
});

watch(isStaffAuthed, (newVal) => {
  if (newVal) {
    loadStaff();
    startRefreshTimer();
  } else {
    clearRefreshTimer();
  }
});

function startRefreshTimer() {
  clearRefreshTimer();
  refreshTimer = setInterval(() => {
    if (!isBusy.value) {
      loadStaff(true);
    }
  }, 10000);
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function verifyAdminPassword() {
  if (adminPassword.value === '712121') {
    isStaffAuthed.value = true;
    showToast('Xác thực quản trị viên thành công', 'success');
  } else {
    showToast('Mật khẩu quản trị không chính xác!', 'error');
    adminPassword.value = '';
  }
}

async function loadStaff(silent = false) {
  if (!silent) {
    syncStatus.value = '⏳ Đang tải từ Cloud...';
  }

  try {
    const result = await getStaffFromCloud();
    if (result.success) {
      staffList.value = result.staff || [];
      // Update store cache as well
      authStore.setStaffList(staffList.value);
      syncStatus.value = `✅ ${staffList.value.length} nhân viên — Realtime từ Cloud`;
      syncTime.value = new Date().toLocaleTimeString('vi-VN');
    } else {
      syncStatus.value = '⚠️ Không tải được — ' + (result.message || 'Kiểm tra kết nối');
    }
  } catch (err: any) {
    syncStatus.value = '⚠️ Lỗi kết nối Cloud';
  }
}

function triggerAddStaff() {
  editingStaff.value = null;
  modalTitle.value = 'Thêm nhân viên mới';
  modalName.value = '';
  modalPin.value = '';
  modalRole.value = 'cashier';
  modalActive.value = true;
  showModal.value = true;
}

function triggerEditStaff(staff: Staff) {
  editingStaff.value = staff;
  modalTitle.value = 'Sửa nhân viên';
  modalName.value = staff.name;
  modalPin.value = ''; // Don't pre-fill password for security
  modalRole.value = staff.role;
  modalActive.value = staff.status === 'active';
  showModal.value = true;
}

async function handleSaveStaff() {
  if (isBusy.value) return;

  const name = modalName.value.trim();
  const pin = modalPin.value.trim();
  const role = modalRole.value;
  const status = modalActive.value ? 'active' : 'inactive';
  const isEdit = !!editingStaff.value;

  if (!name) {
    showToast('Vui lòng nhập họ tên nhân viên', 'warning');
    return;
  }

  if (!isEdit) {
    if (!pin) {
      showToast('Vui lòng nhập mã PIN', 'warning');
      return;
    }
    if (pin.length < 4) {
      showToast('Mã PIN cần ít nhất 4 ký số', 'warning');
      return;
    }
  } else {
    if (pin && pin.length < 4) {
      showToast('Mã PIN mới cần ít nhất 4 ký số', 'warning');
      return;
    }
  }

  // Duplicate name check
  const duplicate = staffList.value.some(s => s.name.toLowerCase() === name.toLowerCase() && (!isEdit || s.id !== editingStaff.value?.id));
  if (duplicate) {
    showToast('Tên nhân viên đã tồn tại trên hệ thống', 'warning');
    return;
  }

  isBusy.value = true;
  showModal.value = false;

  // Build payload
  const staffData: any = {
    name,
    role,
    status
  };
  if (isEdit && editingStaff.value) {
    staffData.id = editingStaff.value.id;
  }
  if (pin) {
    staffData.pin = pin;
  }

  // OPTIMISTIC UPDATE
  const backupList = [...staffList.value];
  const tempId = 'temp_' + Date.now();

  if (isEdit && editingStaff.value) {
    staffList.value = staffList.value.map(s => {
      if (s.id === editingStaff.value?.id) {
        return { ...s, name, role, status };
      }
      return s;
    });
  } else {
    staffList.value.push({
      id: tempId,
      name,
      pin,
      role,
      status: 'active'
    });
  }

  authStore.setStaffList(staffList.value);
  showToast(isEdit ? `✅ Đã sửa nhân viên ${name}` : `✅ Đã thêm nhân viên ${name}`, 'success');
  syncStatus.value = `✅ ${staffList.value.length} nhân viên — Đang đồng bộ Sheets...`;

  // CLOUD SYNC
  try {
    const result = await saveStaffToCloud(staffData);
    if (result.success) {
      if (!isEdit && result.id) {
        // Swap temp ID with real DB ID
        staffList.value = staffList.value.map(s => {
          if (s.id === tempId) {
            return { ...s, id: result.id };
          }
          return s;
        });
        authStore.setStaffList(staffList.value);
      }
      syncStatus.value = `✅ ${staffList.value.length} nhân viên — Đã đồng bộ Sheets`;
      syncTime.value = new Date().toLocaleTimeString('vi-VN');
    } else {
      // Rollback
      staffList.value = backupList;
      authStore.setStaffList(staffList.value);
      showToast('❌ Lỗi đồng bộ Cloud: ' + (result.message || 'Thử lại sau'), 'error');
      syncStatus.value = '⚠️ Lỗi đồng bộ — Đã khôi phục dữ liệu';
    }
  } catch (err: any) {
    staffList.value = backupList;
    authStore.setStaffList(staffList.value);
    showToast('❌ Lỗi kết nối đồng bộ', 'error');
    syncStatus.value = '⚠️ Lỗi kết nối Cloud — Đã khôi phục dữ liệu';
  } finally {
    isBusy.value = false;
  }
}

async function handleDeleteStaff(staff: Staff) {
  if (isBusy.value) return;

  const ok = confirm(`Bạn có chắc chắn muốn xóa nhân viên "${staff.name}" khỏi hệ thống?`);
  if (!ok) return;

  isBusy.value = true;

  // OPTIMISTIC REMOVAL
  const backupList = [...staffList.value];
  staffList.value = staffList.value.filter(s => s.id !== staff.id);
  authStore.setStaffList(staffList.value);

  showToast(`✅ Đã xóa nhân viên ${staff.name}`, 'success');
  syncStatus.value = `✅ ${staffList.value.length} nhân viên — Đang xóa trên Sheets...`;

  try {
    const result = await deleteStaffFromCloud(staff.id);
    if (result.success) {
      syncStatus.value = `✅ ${staffList.value.length} nhân viên — Đã đồng bộ Sheets`;
      syncTime.value = new Date().toLocaleTimeString('vi-VN');
    } else {
      // Rollback
      staffList.value = backupList;
      authStore.setStaffList(staffList.value);
      showToast('❌ Không thể xóa trên Cloud: ' + (result.message || 'Thử lại sau'), 'error');
      syncStatus.value = '⚠️ Lỗi xóa — Đã hoàn tác';
    }
  } catch (err) {
    staffList.value = backupList;
    authStore.setStaffList(staffList.value);
    showToast('❌ Lỗi kết nối khi xóa nhân viên', 'error');
    syncStatus.value = '⚠️ Lỗi kết nối — Đã hoàn tác';
  } finally {
    isBusy.value = false;
  }
}

function getRoleLabel(role: string) {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Quản lý';
  return 'Thu ngân';
}

function getRoleBadgeClass(role: string) {
  if (role === 'admin') return 'bg-indigo-50 text-indigo-700 border-indigo-100';
  if (role === 'manager') return 'bg-sky-50 text-sky-700 border-sky-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
}
</script>

<template>
  <div>
    <!-- AUTHENTICATION PASS GATE -->
    <div v-if="!isStaffAuthed" class="flex flex-col items-center justify-center text-center max-w-md mx-auto py-16 px-4">
      <span class="material-symbols-rounded text-indigo-600 text-6xl mb-4">lock</span>
      <h3 class="text-xl font-bold text-slate-800">Yêu cầu quyền Admin</h3>
      <p class="text-sm text-slate-500 mt-2">Vui lòng nhập mật khẩu quản trị để truy cập trang quản lý tài khoản nhân viên.</p>
      
      <div class="mt-6 w-full flex flex-col gap-3">
        <input 
          type="password" 
          v-model="adminPassword" 
          @keydown.enter="verifyAdminPassword" 
          class="form-input text-center text-2xl tracking-[8px] py-3 border border-slate-200 rounded-xl" 
          placeholder="••••••" 
          maxlength="8"
          autofocus
        >
        <button @click="verifyAdminPassword" class="btn btn-primary w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors">
          Xác nhận truy cập
        </button>
      </div>
    </div>

    <!-- STAFF MANAGEMENT AREA -->
    <div v-else class="flex flex-col gap-6">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-indigo-500">group</span>
            Quản lý nhân viên thu ngân
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">Tạo tài khoản, phân quyền, và quản lý mã PIN đăng nhập nhanh.</p>
        </div>
        <div class="flex gap-2">
          <button @click="loadStaff()" class="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">refresh</span> Làm mới
          </button>
          <button @click="triggerAddStaff" class="btn btn-primary flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">person_add</span> Thêm nhân viên
          </button>
        </div>
      </div>

      <!-- Realtime status indicator -->
      <div class="flex items-center gap-2 px-4 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-slate-600">
        <span class="material-symbols-rounded text-base text-emerald-600 animate-pulse">cloud_sync</span>
        <span>{{ syncStatus }}</span>
        <span v-if="syncTime" class="ml-auto text-xxs text-slate-400">Đồng bộ lúc: {{ syncTime }}</span>
      </div>

      <!-- Staff Grid -->
      <div v-if="staffList.length === 0" class="flex flex-col items-center justify-center text-center py-16 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <span class="material-symbols-rounded text-slate-400 text-5xl mb-3">group_off</span>
        <h4 class="font-bold text-slate-700">Chưa có nhân viên</h4>
        <p class="text-xs text-slate-400 mt-1">Bấm "Thêm nhân viên" ở góc trên bên phải để tạo tài khoản đầu tiên.</p>
      </div>

      <div v-else class="staff-grid">
        <div v-for="staff in staffList" :key="staff.id" class="staff-card">
          <div class="staff-avatar" :class="staff.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : staff.role === 'manager' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'">
            <span class="material-symbols-rounded text-xl">
              {{ staff.role === 'admin' ? 'admin_panel_settings' : staff.role === 'manager' ? 'supervisor_account' : 'person' }}
            </span>
          </div>

          <div class="staff-info">
            <h4>{{ staff.name }}</h4>
            <div class="flex gap-1.5 items-center mt-1">
              <span class="px-2 py-0.5 text-xxs font-semibold border rounded-full" :class="getRoleBadgeClass(staff.role)">
                {{ getRoleLabel(staff.role) }}
              </span>
              <span class="px-2 py-0.5 text-xxs font-semibold rounded-full border" :class="staff.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'">
                {{ staff.status === 'active' ? 'Hoạt động' : 'Đã khóa' }}
              </span>
            </div>
          </div>

          <div class="staff-actions">
            <button @click="triggerEditStaff(staff)" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors" title="Sửa">
              <span class="material-symbols-rounded text-lg">edit</span>
            </button>
            <button @click="handleDeleteStaff(staff)" class="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-500 transition-colors" title="Xóa">
              <span class="material-symbols-rounded text-lg">delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DIALOG (ADD/EDIT STAFF) -->
    <div v-if="showModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 flex flex-col gap-4 animate-scaleUp">
        <h3 class="text-md font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
          <span class="material-symbols-rounded text-indigo-500">{{ editingStaff ? 'edit' : 'person_add' }}</span>
          {{ modalTitle }}
        </h3>

        <div class="flex flex-col gap-4">
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">Họ và tên nhân viên *</label>
            <input type="text" v-model="modalName" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Nhập họ tên...">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label class="form-label font-semibold text-slate-700 mb-1 block">Mã PIN đăng nhập *</label>
              <input type="password" v-model="modalPin" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-center tracking-[4px]" placeholder="••••" maxlength="6" inputmode="numeric">
              <span class="text-[10px] text-slate-400 mt-1 block" v-if="editingStaff">Để trống nếu không đổi PIN</span>
            </div>

            <div class="form-group">
              <label class="form-label font-semibold text-slate-700 mb-1 block">Vai trò hệ thống</label>
              <select v-model="modalRole" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                <option value="cashier">Thu ngân</option>
                <option value="manager">Quản lý</option>
                <option value="admin">Admin hệ thống</option>
              </select>
            </div>
          </div>

          <div v-if="editingStaff" class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span class="text-sm font-semibold text-slate-700">Trạng thái hoạt động</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="modalActive" class="sr-only peer">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
          <button @click="showModal = false" class="btn px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">Hủy</button>
          <button @click="handleSaveStaff" class="btn px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5">
            <span class="material-symbols-rounded text-sm">save</span>
            Lưu nhân viên
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
