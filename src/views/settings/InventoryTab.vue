<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePrintFormsStore } from '../../stores/printForms';
import { showToast } from '../../utils';

const printFormsStore = usePrintFormsStore();
const inventoryJson = ref('');

onMounted(async () => {
  await printFormsStore.loadConfig();
  const inv = printFormsStore.config.inventory || {};
  inventoryJson.value = JSON.stringify(inv, null, 2);
});

async function saveInventory() {
  try {
    const parsed = JSON.parse(inventoryJson.value);
    
    // Validate some basic inventory structure if needed, or save directly
    const updatedConfig = {
      ...printFormsStore.config,
      inventory: parsed
    };

    await printFormsStore.updatePrintForms(updatedConfig);
    showToast('Đã lưu cấu hình dữ liệu Kho & Nhà Cung Cấp', 'success');
  } catch (e: any) {
    showToast('Lỗi định dạng JSON: ' + e.message, 'error');
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="card p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-6">
      <div class="border-b border-slate-100 dark:border-slate-800 pb-4 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h4 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400">inventory_2</span>
            Cấu hình dữ liệu kiểm kho & Nhà cung cấp
          </h4>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Định dạng cấu trúc JSON dùng để in ấn phiếu đối soát kho hàng ngày.</p>
        </div>
        <button @click="saveInventory" class="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all">
          <span class="material-symbols-rounded text-sm">save</span>
          Lưu thay đổi
        </button>
      </div>

      <div class="flex flex-col gap-4">
        <textarea v-model="inventoryJson" class="form-input w-full p-4 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 transition-colors" rows="18" spellcheck="false"></textarea>
        <p class="text-xs text-slate-400 dark:text-slate-500">
          * Lưu ý: Cấu trúc JSON cần bao gồm đầy đủ các nhóm khóa: <code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">ncc</code> (Thịt/Hải sản), <code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">hangkho</code> (Hàng khô/Gia vị), <code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">hangrau1</code> (Rau củ quả sấy/đông), và <code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">hangrau</code> (Rau củ tươi nhập hàng ngày).
        </p>
      </div>
    </div>
  </div>
</template>
