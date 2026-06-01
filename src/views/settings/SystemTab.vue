<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useCategoriesStore } from '../../stores/categories';
import { useAppStore } from '../../stores/app';
import { pingAPI } from '../../services/api';
import { showToast } from '../../utils';

const settingsStore = useSettingsStore();
const categoriesStore = useCategoriesStore();
const appStore = useAppStore();

// Form states
const storeName = ref('');
const storeAddress = ref('');
const discrepancyThreshold = ref(50000);
const shiftWarningHours = ref(10);
const autoSync = ref(true);
const requireLogin = ref(true);
const allowDevWrite = ref(false);

// CUKCUK states
const cukDomain = ref('');
const cukAppId = ref('');
const cukKey = ref('');
const cukAutoSync = ref(false);
const cukTestLoading = ref(false);
const cukSyncLoading = ref(false);
const cukResultMsg = ref('');
const cukResultSuccess = ref(true);

// Category states
const newIncomeCat = ref('');
const newExpenseCat = ref('');

// VAT Keys states
const adminPass = ref('');
const showVatKeys = ref(false);
const vatLoading = ref(false);
const geminiKeys = ref('');
const groqKeys = ref('');
const hfKeys = ref('');
const cerebrasKeys = ref('');
const sambanovaKeys = ref('');
const deepseekKeys = ref('');
const mistralKeys = ref('');
const nvidiaKeys = ref('');

onMounted(() => {
  loadFormValues();
});

function loadFormValues() {
  const s = settingsStore.settings;
  storeName.value = s.storeName;
  storeAddress.value = s.storeAddress;
  discrepancyThreshold.value = s.discrepancyThreshold;
  shiftWarningHours.value = s.shiftWarningHours;
  autoSync.value = s.autoSync;
  requireLogin.value = s.requireLogin;
  allowDevWrite.value = s.allowDevWrite || false;

  if (s.cukcuk) {
    cukDomain.value = s.cukcuk.domain;
    cukAppId.value = s.cukcuk.appId;
    cukKey.value = s.cukcuk.key ? '••••••••••••••••' : '';
    cukAutoSync.value = s.cukcuk.autoSync;
  }

  // Load VAT keys display
  if (s.vatKeys) {
    geminiKeys.value = (s.vatKeys.gemini || []).join('\n');
    groqKeys.value = (s.vatKeys.groq || []).join('\n');
    hfKeys.value = (s.vatKeys.hf || []).join('\n');
    cerebrasKeys.value = (s.vatKeys.cerebras || []).join('\n');
    sambanovaKeys.value = (s.vatKeys.sambanova || []).join('\n');
    deepseekKeys.value = (s.vatKeys.deepseek || []).join('\n');
    mistralKeys.value = (s.vatKeys.mistral || []).join('\n');
    nvidiaKeys.value = (s.vatKeys.nvidia || []).join('\n');
  }
}

// Check if CUKCUK Key is masked
const isKeyMasked = computed(() => {
  return cukKey.value === '••••••••••••••••' || cukKey.value.indexOf('•') !== -1;
});

async function saveSettings(silent = false) {
  const finalKey = isKeyMasked.value ? '***MASKED***' : cukKey.value;

  const parseKeys = (text: string) => {
    return text.split('\n').map(k => k.trim()).filter(k => k.length > 5);
  };

  const newSettings: any = {
    storeName: storeName.value,
    storeAddress: storeAddress.value,
    discrepancyThreshold: Number(discrepancyThreshold.value) || 50000,
    shiftWarningHours: Number(shiftWarningHours.value) || 10,
    autoSync: autoSync.value,
    requireLogin: requireLogin.value,
    allowDevWrite: allowDevWrite.value,
    cukcuk: {
      domain: cukDomain.value,
      appId: cukAppId.value,
      key: finalKey,
      autoSync: cukAutoSync.value
    }
  };

  if (showVatKeys.value) {
    newSettings.vatKeys = {
      gemini: parseKeys(geminiKeys.value),
      groq: parseKeys(groqKeys.value),
      hf: parseKeys(hfKeys.value),
      cerebras: parseKeys(cerebrasKeys.value),
      sambanova: parseKeys(sambanovaKeys.value),
      deepseek: parseKeys(deepseekKeys.value),
      mistral: parseKeys(mistralKeys.value),
      nvidia: parseKeys(nvidiaKeys.value)
    };
  }

  await settingsStore.updateSettings(newSettings);

  // Sync keys back to cloud sheet securely if password is provided
  if (newSettings.vatKeys && adminPass.value) {
    const VAT_API = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec";
    const payload = Object.assign({ action: 'save_system_keys', password: adminPass.value }, newSettings.vatKeys);
    fetch(VAT_API, { method: 'POST', body: JSON.stringify(payload) }).catch(() => {});
  }

  if (!silent) {
    showToast('Đã lưu tất cả cài đặt hệ thống', 'success');
  }
}

async function handleTestConnection() {
  await saveSettings(true);
  cukTestLoading.value = true;
  cukResultMsg.value = '';
  showToast('Đang kiểm tra kết nối CUKCUK...', 'info');

  try {
    const { testConnection } = await import('../../integration/cukcuk.js');
    const result = await testConnection();
    cukResultSuccess.value = result.success;
    if (result.success) {
      showToast('✅ Kết nối CUKCUK thành công!', 'success');
      cukResultMsg.value = '✅ Kết nối thành công! Token đã được lưu cache.\nBạn có thể bấm "Đồng bộ hóa đơn ngay" để lấy dữ liệu.';
    } else {
      showToast('❌ ' + result.message, 'error');
      cukResultMsg.value = '❌ ' + result.message;
    }
  } catch (e: any) {
    showToast('❌ Lỗi: ' + e.message, 'error');
    cukResultMsg.value = '❌ Lỗi: ' + e.message;
  } finally {
    cukTestLoading.value = false;
  }
}

async function handleSyncInvoices() {
  await saveSettings(true);
  cukSyncLoading.value = true;
  cukResultMsg.value = '';
  showToast('Đang đồng bộ hóa đơn CUKCUK...', 'info');

  try {
    const { syncTransactions } = await import('../../integration/cukcuk.js');
    const result = await syncTransactions(true);
    if (result && result.success) {
      let msg = '✅ Đồng bộ hoàn tất!\n';
      msg += `📊 Tổng hóa đơn: ${result.total}\n`;
      msg += `✨ Mới thêm: ${result.synced} (${(result.amount || 0).toLocaleString('vi-VN')}đ)\n`;
      if (result.payments) {
        const p = result.payments;
        if (p.cash > 0) msg += `💵 Tiền mặt: ${p.cash.toLocaleString('vi-VN')}đ\n`;
        if (p.card > 0) msg += `💳 Quẹt thẻ: ${p.card.toLocaleString('vi-VN')}đ\n`;
        if (p.transfer > 0) msg += `🏦 Chuyển khoản: ${p.transfer.toLocaleString('vi-VN')}đ\n`;
      }
      if (result.skipped > 0) msg += `⏭ Đã có từ trước: ${result.skipped}`;
      cukResultSuccess.value = true;
      cukResultMsg.value = msg;
      showToast('✅ Đồng bộ CUKCUK hoàn tất!', 'success');
    } else {
      cukResultSuccess.value = false;
      cukResultMsg.value = '❌ ' + (result?.message || 'Lỗi không xác định');
      showToast('❌ Đồng bộ thất bại', 'error');
    }
  } catch (e: any) {
    cukResultSuccess.value = false;
    cukResultMsg.value = '❌ Lỗi: ' + e.message;
    showToast('❌ Lỗi: ' + e.message, 'error');
  } finally {
    cukSyncLoading.value = false;
  }
}

async function handlePingApi() {
  showToast('Đang kiểm tra kết nối Cloud...', 'info');
  const result = await pingAPI();
  if (result.success) {
    showToast(`✅ Kết nối Cloud OK! (${result.timestamp})`, 'success');
  } else {
    showToast(`❌ Không thể kết nối Cloud: ${result.message}`, 'error');
  }
}

function handleAddIncomeCat() {
  const name = newIncomeCat.value.trim();
  if (!name) {
    showToast('Vui lòng nhập tên danh mục', 'warning');
    return;
  }
  const added = categoriesStore.addCategory('income', name);
  if (!added) {
    showToast('Danh mục đã tồn tại', 'warning');
    return;
  }
  newIncomeCat.value = '';
  showToast(`Đã thêm danh mục thu: ${name}`, 'success');
}

function handleAddExpenseCat() {
  const name = newExpenseCat.value.trim();
  if (!name) {
    showToast('Vui lòng nhập tên danh mục', 'warning');
    return;
  }
  const added = categoriesStore.addCategory('expense', name);
  if (!added) {
    showToast('Danh mục đã tồn tại', 'warning');
    return;
  }
  newExpenseCat.value = '';
  showToast(`Đã thêm danh mục chi: ${name}`, 'success');
}

function handleRemoveCat(type: 'income' | 'expense', name: string) {
  if (confirm(`Xóa danh mục "${name}"?`)) {
    categoriesStore.removeCategory(type, name);
    showToast(`Đã xóa danh mục: ${name}`, 'info');
  }
}

async function handleVatAdminLogin() {
  const pass = adminPass.value.trim();
  if (!pass) {
    showToast('Vui lòng nhập mã truy cập!', 'warning');
    return;
  }

  vatLoading.value = true;
  const VAT_API = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec";

  try {
    const res = await fetch(VAT_API, {
      method: 'POST',
      body: JSON.stringify({ action: 'get_system_keys', password: pass })
    }).then(r => r.json());

    if (res.status === 'success') {
      if (res.gemini) geminiKeys.value = res.gemini.join('\n');
      if (res.groq) groqKeys.value = res.groq.join('\n');
      if (res.hf) hfKeys.value = res.hf.join('\n');
      if (res.cerebras) cerebrasKeys.value = res.cerebras.join('\n');
      if (res.sambanova) sambanovaKeys.value = res.sambanova.join('\n');
      if (res.deepseek) deepseekKeys.value = res.deepseek.join('\n');
      if (res.mistral) mistralKeys.value = res.mistral.join('\n');
      if (res.nvidia) nvidiaKeys.value = res.nvidia.join('\n');

      showVatKeys.value = true;
      showToast('Đã mượn được hàng nóng từ kho Admin!', 'success');
      await saveSettings(true);
    } else {
      showToast(res.message || 'Mã không đúng!', 'error');
    }
  } catch (e) {
    showToast('Lỗi mạng không thể tải khóa API', 'error');
  } finally {
    vatLoading.value = false;
  }
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Store Info & General Settings -->
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-6">
      <div class="border-b border-slate-100 pb-4">
        <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span class="material-symbols-rounded text-indigo-500">store</span>
          Thông tin cửa hàng & Cấu hình chung
        </h4>
      </div>

      <div class="flex flex-col gap-4">
        <div class="form-group">
          <label class="form-label font-semibold text-slate-700 mb-1 block">Tên nhà hàng/quán</label>
          <input type="text" v-model="storeName" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Tên cửa hàng...">
        </div>

        <div class="form-group">
          <label class="form-label font-semibold text-slate-700 mb-1 block">Địa chỉ hiển thị</label>
          <input type="text" v-model="storeAddress" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Địa chỉ...">
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">Mức chênh lệch tiền tối đa (đ)</label>
            <input type="number" v-model.number="discrepancyThreshold" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">Số giờ cảnh báo ca quá giờ</label>
            <input type="number" v-model.number="shiftWarningHours" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
          </div>
        </div>

        <!-- Automation Switch & Checkboxes -->
        <div class="bg-slate-50 p-4 rounded-xl flex flex-col gap-3">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="autoSync" class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
            <span class="text-sm text-slate-700 font-medium">Tự động đồng bộ hóa lên Cloud (mỗi 60 giây)</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="requireLogin" class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
            <span class="text-sm text-slate-700 font-medium">Yêu cầu đăng nhập PIN thu ngân khi mở ca</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="allowDevWrite" class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
            <span class="text-sm text-slate-700 font-medium">Cho phép ghi dữ liệu thật từ thiết bị Local/LAN</span>
          </label>
        </div>

        <div class="flex gap-3 mt-2">
          <button @click="saveSettings()" class="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">save</span>
            Lưu cấu hình
          </button>
          <button @click="handlePingApi" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">wifi_tethering</span>
            Kiểm tra Cloud Connection
          </button>
        </div>
      </div>
    </div>

    <!-- MISA CUKCUK API Integration -->
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-6">
      <div class="border-b border-slate-100 pb-4">
        <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span class="material-symbols-rounded text-emerald-500">sync_alt</span>
          Tích hợp MISA CUKCUK API
        </h4>
      </div>

      <div class="flex flex-col gap-4">
        <div class="form-group">
          <label class="form-label font-semibold text-slate-700 mb-1 block">Tên miền CUKCUK (Domain)</label>
          <input type="text" v-model="cukDomain" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="https://example.cukcuk.vn">
        </div>

        <div class="form-group">
          <label class="form-label font-semibold text-slate-700 mb-1 block">App ID (Tên kết nối)</label>
          <input type="text" v-model="cukAppId" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Nhập App ID...">
        </div>

        <div class="form-group">
          <label class="form-label font-semibold text-slate-700 mb-1 block">Secret Key (Mã bảo mật)</label>
          <input type="password" v-model="cukKey" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="••••••••••••••••">
        </div>

        <label class="flex items-center gap-3 cursor-pointer mt-1">
          <input type="checkbox" v-model="cukAutoSync" class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
          <span class="text-sm text-slate-700 font-medium">Tự động đồng bộ khi thu ngân mở ca</span>
        </label>

        <div class="flex gap-3 mt-2">
          <button @click="handleTestConnection" :disabled="cukTestLoading" class="btn btn-outline flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': cukTestLoading }">{{ cukTestLoading ? 'sync' : 'wifi_find' }}</span>
            Kiểm tra kết nối
          </button>
          <button @click="handleSyncInvoices" :disabled="cukSyncLoading" class="btn btn-primary flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': cukSyncLoading }">{{ cukSyncLoading ? 'sync' : 'sync' }}</span>
            Đồng bộ hóa đơn ngay
          </button>
        </div>

        <!-- CUKCUK result messages -->
        <div v-if="cukResultMsg" class="p-4 rounded-xl border text-sm font-mono whitespace-pre-wrap" :class="cukResultSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'">
          {{ cukResultMsg }}
        </div>
      </div>
    </div>

    <!-- Category Management (Income / Expense tags) -->
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-6 lg:col-span-2">
      <div class="border-b border-slate-100 pb-4">
        <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span class="material-symbols-rounded text-amber-500">sell</span>
          Quản lý danh mục thu chi thu ngân
        </h4>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Income Categories -->
        <div class="flex flex-col gap-4">
          <h5 class="font-bold text-slate-700 text-sm flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            DANH MỤC THU
          </h5>

          <!-- Add income -->
          <div class="flex gap-2">
            <input type="text" v-model="newIncomeCat" @keydown.enter="handleAddIncomeCat" class="form-input flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Tên danh mục thu mới...">
            <button @click="handleAddIncomeCat" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition-colors">Thêm</button>
          </div>

          <!-- Tags list -->
          <div class="flex flex-wrap gap-2 mt-2">
            <div v-for="cat in categoriesStore.categories.income" :key="cat" class="flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold">
              {{ cat }}
              <button @click="handleRemoveCat('income', cat)" class="text-slate-400 hover:text-rose-500 font-bold transition-colors">
                <span class="material-symbols-rounded text-xs block">close</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Expense Categories -->
        <div class="flex flex-col gap-4">
          <h5 class="font-bold text-slate-700 text-sm flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            DANH MỤC CHI
          </h5>

          <!-- Add expense -->
          <div class="flex gap-2">
            <input type="text" v-model="newExpenseCat" @keydown.enter="handleAddExpenseCat" class="form-input flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Tên danh mục chi mới...">
            <button @click="handleAddExpenseCat" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition-colors">Thêm</button>
          </div>

          <!-- Tags list -->
          <div class="flex flex-wrap gap-2 mt-2">
            <div v-for="cat in categoriesStore.categories.expense" :key="cat" class="flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold">
              {{ cat }}
              <button @click="handleRemoveCat('expense', cat)" class="text-slate-400 hover:text-rose-500 font-bold transition-colors">
                <span class="material-symbols-rounded text-xs block">close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- API Keys (Encrypted Cloud Admin Storage) -->
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-6 lg:col-span-2">
      <div class="border-b border-slate-100 pb-4 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-indigo-600">vpn_key</span>
            Cấu hình API Keys (Hệ thống AI & Trợ lý ảo)
          </h4>
          <p class="text-xs text-slate-500 mt-1">Các khóa API được mã hóa và lưu trữ tập trung trên Cloud Sheet của Admin</p>
        </div>

        <div class="flex gap-2 items-center">
          <input type="password" v-model="adminPass" class="form-input px-3 py-1.5 border border-slate-200 rounded-lg text-xs" style="width:160px; letter-spacing: 2px;" placeholder="Mã truy cập...">
          <button @click="handleVatAdminLogin" :disabled="vatLoading" class="btn btn-outline flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
            <span class="material-symbols-rounded text-xs" :class="{ 'animate-spin': vatLoading }">sync</span>
            Lấy Keys
          </button>
        </div>
      </div>

      <!-- Keys Container -->
      <div v-if="showVatKeys" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>Gemini Keys</span>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-indigo-600 hover:underline">Lấy Key</a>
          </label>
          <textarea v-model="geminiKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>DeepSeek Keys</span>
            <a href="https://platform.deepseek.com/" target="_blank" class="text-indigo-600 hover:underline">Lấy Key</a>
          </label>
          <textarea v-model="deepseekKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>Groq Keys</span>
            <a href="https://console.groq.com/keys" target="_blank" class="text-indigo-600 hover:underline">Lấy Key</a>
          </label>
          <textarea v-model="groqKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>SambaNova Keys</span>
            <a href="https://cloud.sambanova.ai/" target="_blank" class="text-indigo-600 hover:underline">Lấy Key</a>
          </label>
          <textarea v-model="sambanovaKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>Cerebras Keys</span>
          </label>
          <textarea v-model="cerebrasKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>HuggingFace Keys</span>
          </label>
          <textarea v-model="hfKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>Mistral Keys</span>
          </label>
          <textarea v-model="mistralKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>

        <div class="form-group flex flex-col gap-1">
          <label class="text-xs font-bold text-slate-700 flex justify-between">
            <span>NVIDIA Keys</span>
          </label>
          <textarea v-model="nvidiaKeys" class="form-input w-full p-2 border border-slate-200 rounded-lg text-xs font-mono" rows="3" placeholder="Một key mỗi dòng..."></textarea>
        </div>
      </div>

      <div v-if="showVatKeys" class="flex gap-2">
        <button @click="saveSettings()" class="btn btn-primary px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors">
          💾 Lưu API Keys
        </button>
      </div>

      <div v-else class="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
        🔓 Vui lòng nhập mã truy cập của Admin ở góc phải trên và nhấn "Lấy Keys" để cấu hình API Keys.
      </div>
    </div>
  </div>
</template>
