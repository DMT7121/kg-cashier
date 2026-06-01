<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { showToast } from '../../utils';

const settingsStore = useSettingsStore();

// Printer settings properties
const useQzTray = ref(false);
const kitchenIp = ref('');
const sashimiIp = ref('');
const barIp = ref('');

// Scan state
const foundPrinters = ref<string[]>([]);
const selectedPrinter = ref('');
const showSelector = ref(false);
const scanLoading = ref(false);

// Test/Connection results
const prResultText = ref('');
const prResultStatus = ref<'success' | 'error' | ''>('');

onMounted(() => {
  const p = settingsStore.settings.printer;
  if (p) {
    useQzTray.value = p.useQzTray || false;
    kitchenIp.value = p.kitchenIp || '';
    sashimiIp.value = p.sashimiIp || '';
    barIp.value = p.barIp || '';
  }
});

async function savePrinterConfig() {
  const newSettings = {
    ...settingsStore.settings,
    printer: {
      useQzTray: useQzTray.value,
      kitchenIp: kitchenIp.value.trim(),
      sashimiIp: sashimiIp.value.trim(),
      barIp: barIp.value.trim()
    }
  };

  await settingsStore.updateSettings(newSettings);
  showToast('Đã lưu cấu hình máy in', 'success');
}

// Load QZ-Tray Library Dynamically
function loadQzLibrary(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).qz) {
      resolve((window as any).qz);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js';
    script.onload = () => {
      const qz = (window as any).qz;
      if (qz) {
        qz.security.setCertificatePromise((res: any) => res());
        qz.security.setSignaturePromise(() => (res: any) => res());
        resolve(qz);
      } else {
        reject(new Error('QZ Tray variable is not loaded.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load QZ Tray script.'));
    };
    document.head.appendChild(script);
  });
}

async function testQzConnection() {
  prResultText.value = '';
  prResultStatus.value = '';
  showToast('Đang kết nối QZ Tray...', 'info');

  try {
    const qz = await loadQzLibrary();
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 1, delay: 1 });
    }
    prResultStatus.value = 'success';
    prResultText.value = '✅ Kết nối QZ Tray thành công!';
    showToast('✅ QZ Tray hoạt động!', 'success');
  } catch (e: any) {
    prResultStatus.value = 'error';
    prResultText.value = '❌ Lỗi kết nối QZ Tray: ' + e.message;
    showToast('❌ Lỗi QZ Tray', 'error');
  }
}

async function scanPrinters() {
  scanLoading.value = true;
  prResultText.value = '';
  prResultStatus.value = '';
  showToast('Đang quét danh sách máy in...', 'info');

  try {
    const qz = await loadQzLibrary();
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 1, delay: 1 });
    }

    const printers: string[] = await qz.printers.find();
    if (printers && printers.length > 0) {
      foundPrinters.value = printers;
      selectedPrinter.value = printers[0];
      showSelector.value = true;
      showToast(`✅ Tìm thấy ${printers.length} máy in!`, 'success');
    } else {
      throw new Error('Không tìm thấy máy in nào trên máy tính.');
    }
  } catch (e: any) {
    prResultStatus.value = 'error';
    prResultText.value = '❌ Lỗi quét máy in: ' + e.message;
    showToast('❌ Không tìm thấy máy in', 'error');
  } finally {
    scanLoading.value = false;
  }
}

function assignPrinter(dest: 'kitchen' | 'sashimi' | 'bar') {
  if (!selectedPrinter.value) {
    showToast('Vui lòng chọn máy in để gán', 'warning');
    return;
  }

  if (dest === 'kitchen') {
    kitchenIp.value = selectedPrinter.value;
    showToast(`Đã gán "${selectedPrinter.value}" cho Bếp`, 'success');
  } else if (dest === 'sashimi') {
    sashimiIp.value = selectedPrinter.value;
    showToast(`Đã gán "${selectedPrinter.value}" cho Bếp Sashimi`, 'success');
  } else if (dest === 'bar') {
    barIp.value = selectedPrinter.value;
    showToast(`Đã gán "${selectedPrinter.value}" cho Bar`, 'success');
  }
}

function testPrintSlip(destName: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;}body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}@media print{@page{size:80mm auto;margin:0;}}h2{font-size:18px;text-align:center;margin-bottom:6px;}hr{border-top:1px dashed #000;margin:4px 0;}</style></head><body>` +
    `<h2>⚡ TEST ${destName.toUpperCase()}</h2><hr>` +
    `<div style="font-size:16px;font-weight:bold;padding:8px 0;">3 x Món kiểm tra</div>` +
    `<div style="font-size:16px;font-weight:bold;padding:8px 0;">1 x Phương án in OK</div><hr>` +
    `<div style="text-align:center;font-size:11px;">--- HẾT PHIẾU ---</div>` +
    `<script>window.onload=function(){window.print();window.close();}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=380,height=400');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    showToast('Cho phép popup để in thử', 'warning');
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-6">
      <div class="border-b border-slate-100 pb-4 flex items-center justify-between">
        <div>
          <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span class="material-symbols-rounded text-orange-500">print</span>
            Cấu hình Máy in POS
          </h4>
          <p class="text-xs text-slate-500 mt-1">Cấu hình máy in nhiệt K80 cho quầy thu ngân, bếp và bar.</p>
        </div>
        <span class="px-2.5 py-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-full">Phase 2</span>
      </div>

      <div class="flex flex-col gap-4">
        <!-- QZ Tray Toggle SWITCH -->
        <div class="form-group flex items-center justify-between p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
          <div>
            <label class="font-bold text-slate-800 text-sm block">Sử dụng QZ Tray (in tự động không popup)</label>
            <span class="text-xs text-slate-500">Cần chạy ứng dụng QZ Tray trên máy tính local. Port mặc định: 8182</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="useQzTray" class="sr-only peer">
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>

        <!-- Printers IPs Inputs -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">🍳 Máy in Bếp (Food)</label>
            <input type="text" v-model="kitchenIp" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="VD: 192.168.1.100 hoặc tên máy in">
            <p class="text-xxs text-slate-400 mt-1">Nấu bếp chính</p>
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">🐟 Máy in Sashimi</label>
            <input type="text" v-model="sashimiIp" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="VD: 192.168.1.102">
            <p class="text-xxs text-slate-400 mt-1">Sashimi, Gỏi, Salad, Nướng</p>
          </div>
          <div class="form-group">
            <label class="form-label font-semibold text-slate-700 mb-1 block">🍹 Máy in Bar (Drink)</label>
            <input type="text" v-model="barIp" class="form-input w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="VD: 192.168.1.101">
            <p class="text-xxs text-slate-400 mt-1">Đồ uống pha chế</p>
          </div>
        </div>

        <!-- Dynamic QZ Printer Selector -->
        <div v-if="showSelector" class="p-4 bg-sky-50 border border-sky-200 rounded-xl flex flex-col gap-3">
          <label class="text-sm font-bold text-sky-800">Danh sách máy in local tìm thấy qua QZ Tray:</label>
          <div class="flex gap-2 items-center flex-wrap">
            <select v-model="selectedPrinter" class="form-input flex-1 min-w-[200px] px-3 py-2 border border-sky-300 rounded-lg text-sm bg-white">
              <option v-for="printer in foundPrinters" :key="printer" :value="printer">{{ printer }}</option>
            </select>
            <button @click="assignPrinter('kitchen')" class="btn px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors">+ Gán Bếp</button>
            <button @click="assignPrinter('sashimi')" class="btn px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors">+ Gán Sashimi</button>
            <button @click="assignPrinter('bar')" class="btn px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold transition-colors">+ Gán Bar</button>
          </div>
        </div>

        <!-- Connection and Actions footer -->
        <div class="flex flex-wrap gap-2.5 mt-2">
          <button @click="savePrinterConfig" class="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm">save</span>
            Lưu cấu hình
          </button>
          <button @click="testQzConnection" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm text-orange-500">wifi_find</span>
            Kiểm tra QZ Tray
          </button>
          <button @click="scanPrinters" :disabled="scanLoading" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            <span class="material-symbols-rounded text-sm text-sky-500" :class="{ 'animate-spin': scanLoading }">search</span>
            Dò máy in local
          </button>
          <button @click="testPrintSlip('Bếp')" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm text-emerald-500">print</span>
            In thử Bếp
          </button>
          <button @click="testPrintSlip('Bếp Sashimi')" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm text-orange-500">print</span>
            In thử Sashimi
          </button>
          <button @click="testPrintSlip('Bar')" class="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors">
            <span class="material-symbols-rounded text-sm text-indigo-500">print</span>
            In thử Bar
          </button>
        </div>

        <div v-if="prResultText" class="p-3.5 rounded-xl border text-xs font-mono" :class="prResultStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'">
          {{ prResultText }}
        </div>
      </div>
    </div>

    <!-- Instructions Guide -->
    <div class="card p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
      <div class="border-b border-slate-100 pb-3">
        <h4 class="text-md font-bold text-slate-800 flex items-center gap-2">
          <span class="material-symbols-rounded text-indigo-500">help</span>
          Hướng dẫn cài đặt QZ Tray
        </h4>
      </div>
      <div class="text-sm text-slate-600 flex flex-col gap-3">
        <ol class="list-decimal list-inside flex flex-col gap-2 leading-relaxed">
          <li>Tải phần mềm QZ Tray tại <a href="https://qz.io/download" target="_blank" class="text-indigo-600 hover:underline font-semibold">qz.io/download</a>.</li>
          <li>Cài đặt và khởi chạy QZ Tray trên máy thu ngân (Windows/Mac).</li>
          <li>Bật toggle <strong class="text-slate-800">"Sử dụng QZ Tray"</strong> trong cấu hình máy in và bấm lưu lại.</li>
          <li>Các lệnh in từ POS (Báo bếp, In hóa đơn) sẽ tự động chạy thẳng tới máy in LAN hoặc USB tương ứng mà không hiển thị hộp thoại trình duyệt.</li>
        </ol>
        <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-xs text-indigo-800 mt-2 flex flex-col gap-1">
          <strong class="font-bold text-indigo-950">💡 Giải pháp thay thế (Local Proxy Server)</strong>
          Nếu không muốn dùng QZ Tray, bạn có thể triển khai một server NodeJS local nhỏ tại máy thu ngân để nghe cổng <code>http://localhost:5000/print</code> và gửi trực tiếp các lệnh ESC/POS qua mạng TCP. Hãy liên hệ bộ phận kỹ thuật để cấu hình nếu cần.
        </div>
      </div>
    </div>
  </div>
</template>
