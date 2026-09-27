<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePrintFormsStore } from '../../stores/printForms';
import { showToast } from '../../utils';

const printFormsStore = usePrintFormsStore();

// Margin configurations
const topMargin = ref(8);
const bottomMargin = ref(8);
const leftMargin = ref(8);
const rightMargin = ref(8);

// Checklist JSON editor
const checklistJson = ref('');

onMounted(async () => {
  await printFormsStore.loadConfig();
  const cfg = printFormsStore.config;
  topMargin.value = cfg.margins?.top ?? 8;
  bottomMargin.value = cfg.margins?.bottom ?? 8;
  leftMargin.value = cfg.margins?.left ?? 8;
  rightMargin.value = cfg.margins?.right ?? 8;
  checklistJson.value = JSON.stringify(cfg.checklist || [], null, 2);
});

async function saveConfig() {
  try {
    const parsedChecklist = JSON.parse(checklistJson.value);
    if (!Array.isArray(parsedChecklist)) {
      showToast('Checklist phải là một mảng!', 'error');
      return;
    }

    const updatedConfig = {
      ...printFormsStore.config,
      margins: {
        top: Number(topMargin.value),
        bottomMargin: Number(bottomMargin.value), // Keep legacy schema key compatibility if needed, but margins interface says top, bottom, left, right
        bottom: Number(bottomMargin.value),
        left: Number(leftMargin.value),
        right: Number(rightMargin.value)
      },
      checklist: parsedChecklist
    };

    await printFormsStore.updatePrintForms(updatedConfig);
    showToast('Đã lưu cấu hình mẫu in', 'success');
  } catch (e: any) {
    showToast('Lỗi định dạng JSON checklist: ' + e.message, 'error');
  }
}

async function handleResetDefault() {
  if (confirm('Bạn có chắc chắn muốn xóa mọi tùy chỉnh mẫu in và khôi phục về mặc định?')) {
    await printFormsStore.resetPrintForms();
    const cfg = printFormsStore.config;
    topMargin.value = cfg.margins?.top ?? 8;
    bottomMargin.value = cfg.margins?.bottom ?? 8;
    leftMargin.value = cfg.margins?.left ?? 8;
    rightMargin.value = cfg.margins?.right ?? 8;
    checklistJson.value = JSON.stringify(cfg.checklist || [], null, 2);
    showToast('Đã khôi phục cài đặt mặc định!', 'success');
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Margin configuration card -->
    <div class="card p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-6">
      <div class="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h4 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400">tune</span>
          Cấu hình in (Khổ A4/Checklist/Kho)
        </h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Điều chỉnh căn lề trang in và lề giấy in nhiệt.</p>
      </div>

      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Lề trên (mm)</label>
            <input type="number" v-model.number="topMargin" class="form-input w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm" min="0" max="50">
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Lề dưới (mm)</label>
            <input type="number" v-model.number="bottomMargin" class="form-input w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm" min="0" max="50">
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Lề trái (mm)</label>
            <input type="number" v-model.number="leftMargin" class="form-input w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm" min="0" max="50">
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Lề phải (mm)</label>
            <input type="number" v-model.number="rightMargin" class="form-input w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm" min="0" max="50">
          </div>
        </div>

        <!-- Checklist Template JSON -->
        <div class="form-group mt-2">
          <label class="form-label font-semibold text-slate-700 dark:text-slate-300 mb-1 block">📋 Cấu hình mẫu Checklist giao ca (JSON)</label>
          <textarea v-model="checklistJson" class="form-input w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 transition-colors" rows="12" spellcheck="false"></textarea>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 mt-2 border-t border-slate-100 dark:border-slate-800 pt-4 flex-wrap">
          <button @click="saveConfig" class="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all">
            <span class="material-symbols-rounded text-sm">save</span>
            Lưu thay đổi
          </button>
          <button @click="handleResetDefault" class="btn-ghost flex items-center justify-center gap-2 px-4 py-2.5 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">restart_alt</span>
            Khôi phục mẫu mặc định
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
