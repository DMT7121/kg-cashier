<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { formatMoney, showToast } from '../utils';

// Store & Settings
const settingsStore = useSettingsStore();

// Tab state
const activeTab = ref<'calc' | 'qr' | 'tts' | 'tools'>('calc');
const tabs = [
  { key: 'calc', icon: 'calculate', label: 'Tính thuế VAT', colorClass: 'text-blue-600', bgClass: 'bg-blue-50/50' },
  { key: 'qr', icon: 'qr_code_2', label: 'Tạo mã VietQR', colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50/50' },
  { key: 'tts', icon: 'volume_up', label: 'Phát loa thông báo', colorClass: 'text-purple-600', bgClass: 'bg-purple-50/50' },
  { key: 'tools', icon: 'construction', label: 'Tiện ích nghiệp vụ', colorClass: 'text-orange-600', bgClass: 'bg-orange-50/50' }
] as const;

// Helper - Vietnamese number to words translation
const ChuSo = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const Tien = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

function docSo3ChuSo(baso: number): string {
  const tram = Math.floor(baso / 100);
  const chuc = Math.floor((baso % 100) / 10);
  const donvi = baso % 10;
  let KetQua = "";
  if (tram === 0 && chuc === 0 && donvi === 0) return "";
  if (tram !== 0) {
    KetQua += ChuSo[tram] + " trăm ";
    if (chuc === 0 && donvi !== 0) KetQua += " linh ";
  }
  if (chuc !== 0 && chuc !== 1) {
    KetQua += ChuSo[chuc] + " mươi ";
  }
  if (chuc === 1) {
    KetQua += " mười ";
  }
  switch (donvi) {
    case 1:
      if (chuc !== 0 && chuc !== 1) KetQua += " mốt ";
      else KetQua += ChuSo[donvi] + " ";
      break;
    case 5:
      if (chuc === 0) KetQua += ChuSo[donvi] + " ";
      else KetQua += " lăm ";
      break;
    default:
      if (donvi !== 0) KetQua += ChuSo[donvi] + " ";
      break;
  }
  return KetQua;
}

function docTienBangChu(SoTien: number): string {
  if (SoTien === 0) return "Không đồng";
  let so = Math.abs(SoTien);
  let KetQua = "";
  const ViTri: number[] = [];
  
  ViTri[5] = Math.floor(so / 1000000000000000);
  so -= ViTri[5] * 1000000000000000;
  
  ViTri[4] = Math.floor(so / 1000000000000);
  so -= ViTri[4] * 1000000000000;
  
  ViTri[3] = Math.floor(so / 1000000000);
  so -= ViTri[3] * 1000000000;
  
  ViTri[2] = Math.floor(so / 1000000);
  ViTri[1] = Math.floor((so % 1000000) / 1000);
  ViTri[0] = Math.floor(so % 1000);
  
  const lan = ViTri[5] > 0 ? 5 : ViTri[4] > 0 ? 4 : ViTri[3] > 0 ? 3 : ViTri[2] > 0 ? 2 : ViTri[1] > 0 ? 1 : 0;
  for (let i = lan; i >= 0; i--) {
    const tmp = docSo3ChuSo(ViTri[i]);
    if (tmp !== "") {
      KetQua += tmp + Tien[i] + " ";
    }
  }
  KetQua = KetQua.trim().replace(/\s+/g, ' ');
  if (KetQua.length > 0) {
    KetQua = KetQua.substring(0, 1).toUpperCase() + KetQua.substring(1);
  }
  return KetQua + " đồng chẵn";
}

// Helper - Clean math formula solver
function safeMath(expr: string): number | null {
  try {
    let clean = expr.toLowerCase().replace(/k/g, '*1000');
    clean = clean.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '');
    const tokens = clean.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;
    const stack: number[] = [parseFloat(tokens[0])];
    if (isNaN(stack[0])) return null;
    const ops: string[] = [];
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = parseFloat(tokens[i + 1]);
      if (isNaN(next)) return null;
      if (op === '*') {
        stack[stack.length - 1] *= next;
      } else if (op === '/') {
        stack[stack.length - 1] /= (next === 0 ? 1 : next);
      } else {
        ops.push(op);
        stack.push(next);
      }
    }
    let res = stack[0];
    for (let j = 0; j < ops.length; j++) {
      if (ops[j] === '+') {
        res += stack[j + 1];
      } else if (ops[j] === '-') {
        res -= stack[j + 1];
      }
    }
    return isFinite(res) ? Math.round(res) : null;
  } catch (e) {
    return null;
  }
}

function parseCurrency(str: string | number): number {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  if (/[+\-*/k]/.test(str.toLowerCase())) {
    const res = safeMath(str);
    if (res !== null) return res;
  }
  const parsed = parseInt(str.replace(/[^\d]/g, ''), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}


// ──────────────────────────────────────────────────────────
// ── TAB 1: VAT CALCULATOR STATE & LOGIC ───────────────────
// ──────────────────────────────────────────────────────────
const calcType = ref<'1' | '2' | '3' | '4'>('1'); // 1: Pretax->Posttax, 2: Posttax->Pretax, 3: Tax->Pretax, 4: Tax->Posttax
const calcInputStr = ref('');
const calcTaxRate = ref(8);
const calcHistory = ref<Array<{
  typeStr: string;
  val: string;
  tax: number;
  main: string;
  sub: string;
}>>([]);

const numFormat = computed(() => settingsStore.settings.extension?.numFormat || 'dot');

const decimalSeparator = computed(() => numFormat.value === 'comma' ? ',' : '.');

// Custom input formatting
function formatInputValue(val: string) {
  let raw = val.replace(/[^0-9.,\s+\-*/kK]/g, '');
  let clean = raw.replace(/[.,\s]/g, '');
  if (clean === '') {
    calcInputStr.value = '';
    return;
  }
  
  // Format visual look of standard digits
  let formatted = raw.replace(/\d+/g, (match) => {
    return match.replace(/\B(?=(\d{3})+(?!\d))/g, decimalSeparator.value);
  });
  
  calcInputStr.value = formatted;
}

// Live calculation formula
const calcFormulaLive = computed(() => {
  if (/[+\-*/kK]/.test(calcInputStr.value)) {
    return calcInputStr.value.replace(/\s*([+\-*/])\s*/g, ' $1 ') + ' =';
  }
  return '';
});

// Computed Pretax, Posttax & Tax values
const calcResults = computed(() => {
  const v1 = parseCurrency(calcInputStr.value);
  const rate = calcTaxRate.value || 0;
  
  let mainVal = 0;
  let subVal = 0;
  let subLabel = 'Tiền thuế';
  let mainLabel = 'Giá trị cuối';

  if (v1 > 0) {
    if (calcType.value === '1') {
      subVal = v1 * (rate / 100);
      mainVal = v1 + subVal;
      subLabel = 'Tiền thuế VAT';
      mainLabel = 'Giá đã bao gồm thuế';
    } else if (calcType.value === '2') {
      mainVal = v1 / (1 + rate / 100);
      subVal = v1 - mainVal;
      subLabel = 'Tiền thuế VAT';
      mainLabel = 'Giá chưa bao gồm thuế';
    } else if (calcType.value === '3') {
      mainVal = v1 / (rate / 100 || 1);
      subVal = mainVal + v1;
      subLabel = 'Giá sau thuế (Tổng)';
      mainLabel = 'Giá trước thuế (Gốc)';
    } else if (calcType.value === '4') {
      subVal = v1 / (rate / 100 || 1);
      mainVal = subVal + v1;
      subLabel = 'Giá trước thuế (Gốc)';
      mainLabel = 'Giá sau thuế (Tổng)';
    }
  }

  return {
    main: mainVal,
    sub: subVal,
    mainLabel,
    subLabel,
    words: docTienBangChu(Math.round(mainVal))
  };
});

function handleCalcKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    const raw = calcInputStr.value;
    if (/[+\-*/kK]/.test(raw)) {
      const result = parseCurrency(raw);
      if (result > 0) {
        calcInputStr.value = formatWithFormat(result);
      }
    }
    pushCalcHistory();
  }
}

function formatWithFormat(num: number): string {
  const sep = decimalSeparator.value;
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function pushCalcHistory() {
  const v1 = parseCurrency(calcInputStr.value);
  if (v1 <= 0) return;
  
  const typeLabels = {
    '1': 'Chưa thuế ➔ Đã thuế',
    '2': 'Đã thuế ➔ Chưa thuế',
    '3': 'Tiền thuế ➔ Chưa thuế',
    '4': 'Tiền thuế ➔ Đã thuế'
  };

  calcHistory.value.unshift({
    typeStr: typeLabels[calcType.value],
    val: calcInputStr.value,
    tax: calcTaxRate.value,
    main: formatWithFormat(calcResults.value.main) + ' đ',
    sub: formatWithFormat(calcResults.value.sub) + ' đ'
  });

  if (calcHistory.value.length > 10) calcHistory.value.pop();
}

function copyCalcResult() {
  const val = Math.round(calcResults.value.main).toString();
  navigator.clipboard.writeText(val);
  showToast('Đã sao chép kết quả vào bộ nhớ tạm!', 'success');
  pushCalcHistory();
}

function clearCalcHistory() {
  calcHistory.value = [];
  showToast('Đã xóa sạch lịch sử tính toán.');
}

function selectFormat(fmt: 'dot' | 'comma') {
  const currentExt = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      numFormat: fmt
    }
  });
  
  // Re-format current value
  if (calcInputStr.value) {
    const parsed = parseCurrency(calcInputStr.value);
    calcInputStr.value = formatWithFormat(parsed);
  }
}

function selectPresetTax(val: number) {
  calcTaxRate.value = val;
  const currentExt = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      defaultTax: val
    }
  });
}

function selectCalcType(type: '1' | '2' | '3' | '4') {
  calcType.value = type;
  const currentExt = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      calcType: type
    }
  });
}


// ──────────────────────────────────────────────────────────
// ── TAB 2: VIETQR GENERATOR STATE & LOGIC ─────────────────
// ──────────────────────────────────────────────────────────
const qrBank = ref('');
const qrAcc = ref('');
const qrName = ref('');
const qrAmountStr = ref('');
const qrContent = ref('');
const qrUrlGenerated = ref('');
const qrIsGenerated = ref(false);

const popularBanks = [
  { value: 'VCB', label: 'Vietcombank' },
  { value: 'CTG', label: 'VietinBank' },
  { value: 'BIDV', label: 'BIDV' },
  { value: 'VBA', label: 'Agribank' },
  { value: 'MB', label: 'MBBank' },
  { value: 'TCB', label: 'Techcombank' },
  { value: 'ACB', label: 'ACB' },
  { value: 'VPB', label: 'VPBank' },
  { value: 'TPB', label: 'TPBank' },
  { value: 'STB', label: 'Sacombank' }
];

const otherBanks = [
  { value: 'HDB', label: 'HDBank' },
  { value: 'VIB', label: 'VIB' },
  { value: 'SHB', label: 'SHB' },
  { value: 'MSB', label: 'MSB' },
  { value: 'LPB', label: 'LPBank' },
  { value: 'EIB', label: 'Eximbank' },
  { value: 'OCB', label: 'OCB' },
  { value: 'NAB', label: 'Nam A Bank' },
  { value: 'NCB', label: 'NCB' },
  { value: 'CAKE', label: 'Cake by VPBank' },
  { value: 'TIMO', label: 'Timo by BVBank' },
  { value: 'VTCB', label: 'Viettel Money' }
];

const savedQrTemplates = computed(() => settingsStore.settings.extension?.qrTemplates || []);

function handleQrAmountInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseCurrency(target.value);
  qrAmountStr.value = val === 0 ? '' : formatWithFormat(val);
}

function handleQrNameInput(e: Event) {
  const target = e.target as HTMLInputElement;
  qrName.value = removeAccents(target.value);
}

function generateVietQR() {
  if (!qrBank.value || !qrAcc.value) {
    showToast('Vui lòng chọn Ngân hàng và điền Số tài khoản!', 'warning');
    return;
  }
  
  const bankCode = qrBank.value;
  const accountNumber = qrAcc.value.trim().replace(/\s/g, '');
  const ownerName = qrName.value.trim();
  const rawAmt = parseCurrency(qrAmountStr.value);
  const memo = qrContent.value.trim();

  // img.vietqr.io URL structure
  qrUrlGenerated.value = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${rawAmt}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ownerName)}`;
  qrIsGenerated.value = true;

  // Persist / update local list of templates automatically
  const templates = [...savedQrTemplates.value];
  const existingIdx = templates.findIndex(t => t.bank === bankCode && t.acc === accountNumber);
  
  const currentTemplate = {
    name: ownerName ? `${bankCode} - ${ownerName}` : `${bankCode} - ${accountNumber}`,
    url: qrUrlGenerated.value,
    bank: bankCode,
    acc: accountNumber,
    nameRaw: ownerName,
    amount: rawAmt,
    content: memo
  };

  if (existingIdx >= 0) {
    templates.splice(existingIdx, 1);
  }
  templates.unshift(currentTemplate);
  if (templates.length > 8) templates.pop();

  const currentExt = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      qrTemplates: templates,
      lastSelectedQr: currentTemplate
    }
  });
}

function loadQrTemplate(tpl: any) {
  qrBank.value = tpl.bank || '';
  qrAcc.value = tpl.acc || '';
  qrName.value = tpl.nameRaw || '';
  qrAmountStr.value = tpl.amount ? formatWithFormat(tpl.amount) : '';
  qrContent.value = tpl.content || '';
  
  // Persist as last selected
  const currentExt = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      lastSelectedQr: tpl
    }
  });

  generateVietQR();
}

function deleteQrTemplate(idx: number, event: Event) {
  event.stopPropagation();
  const templates = [...savedQrTemplates.value];
  const removed = templates.splice(idx, 1)[0];
  
  const currentExt = settingsStore.settings.extension || {};
  const nextSelected = settingsStore.settings.extension?.lastSelectedQr?.acc === removed.acc
    ? (templates[0] || null)
    : settingsStore.settings.extension?.lastSelectedQr;

  settingsStore.updateSettings({
    extension: {
      ...currentExt,
      qrTemplates: templates,
      lastSelectedQr: nextSelected
    }
  });
  
  showToast('Đã xóa mẫu VietQR đã lưu.');
}

function clearQrForm() {
  qrBank.value = '';
  qrAcc.value = '';
  qrName.value = '';
  qrAmountStr.value = '';
  qrContent.value = '';
  qrIsGenerated.value = false;
  qrUrlGenerated.value = '';
}


// ──────────────────────────────────────────────────────────
// ── TAB 3: TEXT TO SPEECH (TTS) STATE & LOGIC ────────────
// ──────────────────────────────────────────────────────────
const ttsText = ref('');
const ttsVoice = ref<'nu-bac' | 'nam-bac' | 'nu-nam' | 'nam-nam'>('nu-bac');
const ttsSpeed = ref<'0.8' | '1.0' | '1.2'>('1.0');
const ttsIsLoading = ref(false);

// Template add form state
const showAddTtsForm = ref(false);
const newTtsName = ref('');
const newTtsValue = ref('');

// Announcer variable bindings state
const ttsVariables = ref<Record<string, string>>({});
const activeTtsTplIdx = ref<number | null>(null);

const ttsProvider = computed({
  get: () => settingsStore.settings.extension?.ttsProvider || 'google',
  set: (val: string) => {
    const ext = settingsStore.settings.extension || {};
    settingsStore.updateSettings({
      extension: { ...ext, ttsProvider: val }
    });
  }
});

const ttsKey = computed({
  get: () => settingsStore.settings.extension?.ttsKey || '',
  set: (val: string) => {
    const ext = settingsStore.settings.extension || {};
    settingsStore.updateSettings({
      extension: { ...ext, ttsKey: val }
    });
  }
});

const ttsTemplates = computed(() => settingsStore.settings.extension?.ttsTemplates || []);

function applyTtsTemplate(idx: number) {
  activeTtsTplIdx.value = idx;
  const tpl = ttsTemplates.value[idx];
  if (!tpl) return;

  // Extract variables in template: e.g. {bien_so}, {ban}
  const matches = tpl.value.match(/\{[^}]+\}/g);
  const vars = matches ? [...new Set(matches)].map(m => m.slice(1, -1)) : [];
  
  // Set up inputs
  const initialVars: Record<string, string> = {};
  vars.forEach(v => {
    initialVars[v] = '';
  });
  ttsVariables.value = initialVars;
  
  interpolateTtsText(tpl.value);
}

function handleVariableChange() {
  const idx = activeTtsTplIdx.value;
  if (idx === null) return;
  const tpl = ttsTemplates.value[idx];
  if (!tpl) return;
  interpolateTtsText(tpl.value);
}

function interpolateTtsText(templateVal: string) {
  let interpolated = templateVal;
  for (const vName in ttsVariables.value) {
    const inputVal = ttsVariables.value[vName];
    interpolated = interpolated.replaceAll(`{${vName}}`, inputVal || `{${vName}}`);
  }
  ttsText.value = interpolated;
}

function deleteTtsTemplate(idx: number, event: Event) {
  event.stopPropagation();
  if (!confirm('Bạn có chắc chắn muốn xóa mẫu loa thông báo này?')) return;
  
  const list = [...ttsTemplates.value];
  list.splice(idx, 1);
  
  const ext = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: { ...ext, ttsTemplates: list }
  });
  
  if (activeTtsTplIdx.value === idx) {
    activeTtsTplIdx.value = null;
    ttsText.value = '';
    ttsVariables.value = {};
  }
  
  showToast('Đã xóa mẫu thông báo thành công.');
}

function saveNewTtsTemplate() {
  const name = newTtsName.value.trim();
  const val = newTtsValue.value.trim();
  if (!name || !val) {
    showToast('Vui lòng nhập đầy đủ tên và mẫu câu thông báo!', 'warning');
    return;
  }

  const list = [...ttsTemplates.value];
  list.push({ name, value: val });

  const ext = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: { ...ext, ttsTemplates: list }
  });

  newTtsName.value = '';
  newTtsValue.value = '';
  showAddTtsForm.value = false;
  showToast('Đã thêm mẫu loa thông báo mới!', 'success');
}

// System Synthesis Speech
function playSystemTts() {
  if (!ttsText.value) {
    showToast('Vui lòng nhập nội dung phát âm!', 'warning');
    return;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(ttsText.value);
    utterance.lang = 'vi-VN';
    utterance.rate = parseFloat(ttsSpeed.value) || 1.0;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast('Trình duyệt không hỗ trợ phát âm hệ thống (SpeechSynthesis).', 'error');
  }
}

// AI TTS Play Engine
async function playAiTts() {
  if (!ttsText.value) {
    showToast('Vui lòng nhập nội dung phát âm!', 'warning');
    return;
  }

  ttsIsLoading.value = true;
  const text = ttsText.value;
  const speed = ttsSpeed.value;
  const voice = ttsVoice.value;
  const provider = ttsProvider.value;
  const apiKey = ttsKey.value;

  try {
    if (provider === 'google') {
      showToast('Đang phát giọng đọc AI Google...');
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;
      const audio = new Audio(url);
      audio.playbackRate = parseFloat(speed) || 1.0;
      await audio.play();
    } else if (provider === 'fpt') {
      // FPT fallback default token if empty
      const defaultFptKey = 'bIsflyFl1tWRW2AQRp1EEUqGUwJYZKK0';
      const keyToUse = apiKey || defaultFptKey;
      const vMap = { 'nu-bac': 'banmai', 'nam-bac': 'leminh', 'nu-nam': 'lananh', 'nam-nam': 'giaihuy' };
      
      const res = await fetch('https://api.fpt.ai/hmi/tts/v5', {
        method: 'POST',
        headers: {
          'api-key': keyToUse,
          'speed': speed === '1.0' ? '0' : speed,
          'voice': vMap[voice] || 'banmai'
        },
        body: text
      });
      const data = await res.json();
      if (data.async) {
        showToast('Đang tạo âm thanh AI FPT...');
        setTimeout(() => {
          new Audio(data.async).play().catch(e => console.error(e));
        }, 2200);
      } else {
        throw new Error(data.message || 'Lỗi từ FPT API');
      }
    } else if (provider === 'viettel') {
      const defaultViettelKey = '87c68db598f7e17f3bb058e31cc830a9';
      const keyToUse = apiKey || defaultViettelKey;
      const vMap = { 'nu-bac': 'hn-quynh-anh', 'nam-bac': 'hn-minh-quan', 'nu-nam': 'sg-phuong-thao', 'nam-nam': 'sg-minh-hoang' };
      
      const res = await fetch('https://viettelai.vn/tts/v1/rest/syn', {
        method: 'POST',
        headers: {
          'token': keyToUse,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          voice: vMap[voice] || 'hn-quynh-anh',
          speed: parseFloat(speed),
          tts_return_url: false
        })
      });
      
      if (!res.ok) throw new Error('Lỗi Viettel AI Server Response');
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      await audio.play();
    }
  } catch (err: any) {
    console.error(err);
    showToast('Lỗi API phát loa AI. Đang phát bằng giọng đọc trình duyệt thay thế.', 'warning');
    playSystemTts();
  } finally {
    ttsIsLoading.value = false;
  }
}

// Trigger settings update
function saveTtsSettings() {
  const ext = settingsStore.settings.extension || {};
  settingsStore.updateSettings({
    extension: {
      ...ext,
      ttsProvider: ttsProvider.value,
      ttsKey: ttsKey.value
    }
  });
  showToast('Đã lưu cấu hình TTS thành công!', 'success');
}

async function syncTtsCloud() {
  ttsIsLoading.value = true;
  try {
    await settingsStore.loadSettings();
    showToast('Đồng bộ cấu hình đám mây thành công!', 'success');
  } catch (e) {
    showToast('Lỗi đồng bộ cấu hình!', 'error');
  } finally {
    ttsIsLoading.value = false;
  }
}


// ──────────────────────────────────────────────────────────
// ── TAB 4: UTILITY TOOLS (MST & CURRENCY EXCHANGE) ───────
// ──────────────────────────────────────────────────────────

// MST lookup state
const mstInput = ref('');
const mstLoading = ref(false);
const mstResult = ref<null | {
  success: boolean;
  name?: string;
  id?: string;
  address?: string;
  error?: string;
}>(null);

async function lookupTaxCode() {
  const q = mstInput.value.trim();
  if (!q) return;
  mstLoading.value = true;
  mstResult.value = null;

  try {
    const res = await fetch(`https://api.vietqr.io/v2/business/${q}`);
    const data = await res.json();
    if (data.code === "00" && data.data) {
      mstResult.value = {
        success: true,
        name: data.data.name,
        id: data.data.id,
        address: data.data.address
      };
    } else {
      mstResult.value = {
        success: false,
        error: 'Không tìm thấy thông tin mã số thuế này!'
      };
    }
  } catch (e) {
    mstResult.value = {
      success: false,
      error: 'Lỗi kết nối máy chủ tra cứu!'
    };
  } finally {
    mstLoading.value = false;
  }
}

function copyMstCompany() {
  if (mstResult.value && mstResult.value.name) {
    navigator.clipboard.writeText(mstResult.value.name);
    showToast('Đã sao chép tên công ty!', 'success');
  }
}

// Exchange rates state
const exFrom = ref<'USD' | 'EUR' | 'VND'>('USD');
const exTo = ref<'VND' | 'USD' | 'EUR'>('VND');
const exAmountStr = ref('');
const exResultVal = ref<number>(0);
const exRates = ref<Record<string, number> | null>(null);
const exRatesTime = ref('');

async function fetchExchangeRates() {
  if (exRates.value) return;
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    exRates.value = data.rates;
    exRatesTime.value = new Date(data.time_last_updated * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    console.error('Rates fetch error:', e);
  }
}

const exResultFormatted = computed(() => {
  if (!exRates.value) return 'Tải tỷ giá...';
  const amt = parseCurrency(exAmountStr.value);
  if (amt === 0) return `0 ${exTo.value}`;
  
  const rateFrom = exRates.value[exFrom.value];
  const rateTo = exRates.value[exTo.value];
  
  if (rateFrom && rateTo) {
    const value = (amt / rateFrom) * rateTo;
    return `${formatWithFormat(value)} ${exTo.value}`;
  }
  return 'Lỗi quy đổi';
});

function handleExAmountInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseCurrency(target.value);
  exAmountStr.value = val === 0 ? '' : formatWithFormat(val);
}

// Trigger initial template loads and default parameters
onMounted(async () => {
  // Load pinia settings if needed
  if (!settingsStore.settings.extension) {
    await settingsStore.loadSettings();
  }
  
  // Set defaults from store
  const ext = settingsStore.settings.extension || {};
  calcType.value = (ext.calcType as any) || '1';
  calcTaxRate.value = ext.defaultTax !== undefined ? ext.defaultTax : 8;

  // Auto load active template
  if (savedQrTemplates.value.length > 0) {
    const last = settingsStore.settings.extension?.lastSelectedQr || savedQrTemplates.value[0];
    qrBank.value = last.bank || '';
    qrAcc.value = last.acc || '';
    qrName.value = last.nameRaw || '';
    qrAmountStr.value = last.amount ? formatWithFormat(last.amount) : '';
    qrContent.value = last.content || '';
    generateVietQR();
  }
  
  // Fetch currencies rates background
  fetchExchangeRates();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
    <div class="max-w-7xl mx-auto flex flex-col gap-6">
      
      <!-- Page Title Header -->
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-bold text-slate-800 flex items-center gap-2 tracking-tight">
          <span class="material-symbols-rounded text-indigo-600 text-3xl">construction</span>
          Tiện ích & Mở rộng
        </h2>
        <p class="text-sm text-slate-500">Hỗ trợ các công cụ tính toán nhanh, tạo mã QR, phát âm loa thông báo và tra cứu nghiệp vụ phụ trợ.</p>
      </div>

      <!-- Main Layout shell -->
      <div class="flex flex-col lg:flex-row gap-6 items-start">
        
        <!-- Sidebar Navigation -->
        <aside class="w-full lg:w-64 bg-white rounded-2xl border border-slate-100 shadow-xs p-3 shrink-0">
          <nav class="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0 scrollbar-none">
            <button 
              v-for="tab in tabs" 
              :key="tab.key"
              @click="activeTab = tab.key"
              class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 select-none group w-full text-left"
              :class="activeTab === tab.key 
                ? 'bg-indigo-50/70 text-indigo-700 font-bold' 
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

        <!-- Main Workspace -->
        <main class="flex-1 w-full min-w-0">
          
          <!-- ── TAB 1: TAX CALCULATOR ──────────────────────── -->
          <div v-if="activeTab === 'calc'" class="flex flex-col gap-6 animate-fade-in">
            <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden relative">
              <div class="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

              <div class="p-6 md:p-8 relative z-10 flex flex-col md:flex-row gap-8 items-stretch">
                <!-- Inputs fields -->
                <div class="w-full md:w-1/2 flex flex-col gap-5 justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <span class="material-symbols-rounded text-2xl">calculate</span>
                    </div>
                    <div>
                      <h3 class="font-extrabold text-slate-800 text-xl tracking-tight">Máy tính Thuế VAT</h3>
                      <p class="text-xs text-slate-500 font-medium">Hỗ trợ các phép tính cơ bản (+ - * / k)</p>
                    </div>
                  </div>

                  <!-- Type Selector -->
                  <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Cách tính toán</label>
                    <div class="grid grid-cols-2 gap-2">
                      <button 
                        @click="selectCalcType('1')"
                        class="p-2.5 rounded-xl border-2 text-left transition-all text-xs flex flex-col gap-1"
                        :class="calcType === '1' ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-bold' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'"
                      >
                        <span class="flex items-center justify-between w-full">
                          <span>Chưa thuế ➔ Đã thuế</span>
                          <span v-if="calcType === '1'" class="material-symbols-rounded text-sm text-blue-600 font-black">check_circle</span>
                        </span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">Cộng thuế VAT</span>
                      </button>

                      <button 
                        @click="selectCalcType('2')"
                        class="p-2.5 rounded-xl border-2 text-left transition-all text-xs flex flex-col gap-1"
                        :class="calcType === '2' ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-bold' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'"
                      >
                        <span class="flex items-center justify-between w-full">
                          <span>Đã thuế ➔ Chưa thuế</span>
                          <span v-if="calcType === '2'" class="material-symbols-rounded text-sm text-blue-600 font-black">check_circle</span>
                        </span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">Tách thuế ra</span>
                      </button>

                      <button 
                        @click="selectCalcType('3')"
                        class="p-2.5 rounded-xl border-2 text-left transition-all text-xs flex flex-col gap-1"
                        :class="calcType === '3' ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-bold' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'"
                      >
                        <span class="flex items-center justify-between w-full">
                          <span>Tiền thuế ➔ Chưa thuế</span>
                          <span v-if="calcType === '3'" class="material-symbols-rounded text-sm text-blue-600 font-black">check_circle</span>
                        </span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">Thuế ra tiền gốc</span>
                      </button>

                      <button 
                        @click="selectCalcType('4')"
                        class="p-2.5 rounded-xl border-2 text-left transition-all text-xs flex flex-col gap-1"
                        :class="calcType === '4' ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-bold' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'"
                      >
                        <span class="flex items-center justify-between w-full">
                          <span>Tiền thuế ➔ Đã thuế</span>
                          <span v-if="calcType === '4'" class="material-symbols-rounded text-sm text-blue-600 font-black">check_circle</span>
                        </span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">Thuế ra tiền tổng</span>
                      </button>
                    </div>
                  </div>

                  <!-- Amount input field -->
                  <div class="flex flex-col gap-1.5">
                    <div class="flex justify-between items-center">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tiền (VNĐ)</label>
                      <div class="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md min-h-[22px]">
                        {{ calcFormulaLive }}
                      </div>
                    </div>
                    <input 
                      type="text" 
                      v-model="calcInputStr"
                      @input="formatInputValue(calcInputStr)"
                      @keydown="handleCalcKeydown"
                      class="w-full text-right font-black text-2xl h-14 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 rounded-xl px-4 text-slate-800 transition-all outline-none"
                      placeholder="0"
                    >

                    <!-- Thousand separator control -->
                    <div class="mt-2 flex items-center justify-between p-2.5 border border-slate-100 bg-slate-50/50 rounded-xl">
                      <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <span class="material-symbols-rounded text-base">tune</span>
                        Phân cách hàng nghìn:
                      </span>
                      <div class="flex items-center gap-1 bg-slate-200/50 p-0.5 rounded-lg border border-slate-200">
                        <button 
                          @click="selectFormat('dot')"
                          class="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          :class="numFormat === 'dot' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
                        >
                          Dấu chấm (.)
                        </button>
                        <button 
                          @click="selectFormat('comma')"
                          class="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                          :class="numFormat === 'comma' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'"
                        >
                          Dấu phẩy (,)
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Tax Rate percentage -->
                  <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Thuế suất (%)</label>
                    <div class="flex items-center gap-3">
                      <input 
                        type="number" 
                        v-model.number="calcTaxRate" 
                        class="w-20 text-center font-bold text-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 rounded-xl h-11 transition-all outline-none"
                      >
                      <div class="flex flex-wrap gap-1 flex-1">
                        <button 
                          v-for="r in [0, 5, 8, 10]" 
                          :key="r"
                          @click="selectPresetTax(r)"
                          class="px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-200 bg-white"
                          :class="calcTaxRate === r ? 'border-blue-500 bg-blue-50/20 text-blue-600 font-extrabold' : 'text-slate-500 hover:bg-slate-50'"
                        >
                          {{ r }}%
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Vertical divider -->
                <div class="hidden md:block w-px bg-slate-100 mx-4"></div>

                <!-- Right calculated result panel -->
                <div class="w-full md:w-1/2 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span class="w-6 h-px bg-slate-200"></span>
                    Kết quả tính toán
                    <span class="w-6 h-px bg-slate-200"></span>
                  </div>

                  <div class="w-full">
                    <div class="text-3xl md:text-4xl font-black mb-4 text-slate-800 tracking-tight truncate w-full px-2">
                      {{ formatWithFormat(calcResults.main) }} đ
                    </div>
                  </div>

                  <div class="text-xs font-bold text-slate-600 mb-4 bg-white py-2.5 px-4 rounded-xl border border-slate-150 shadow-xs flex items-center gap-1.5">
                    {{ calcResults.subLabel }}: 
                    <span class="text-emerald-600 font-extrabold text-base">{{ formatWithFormat(calcResults.sub) }} đ</span>
                  </div>

                  <div class="text-xs font-medium italic text-slate-500 mb-6 leading-relaxed max-w-[280px]">
                    {{ calcResults.words }}
                  </div>

                  <button 
                    @click="copyCalcResult" 
                    class="group flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white w-full max-w-[240px] py-3 rounded-xl font-bold shadow-md shadow-slate-900/10 transition-all active:scale-[0.98]"
                  >
                    <span class="material-symbols-rounded text-lg text-blue-300">content_copy</span>
                    <span>Sao chép kết quả</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Calculation history list -->
            <div class="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <div class="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <span class="material-symbols-rounded text-slate-400 text-xl">history</span>
                  <h4 class="font-bold text-slate-700 text-sm">Lịch sử tính toán</h4>
                  <span class="text-[9px] font-black text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-md uppercase">10 phép tính gần nhất</span>
                </div>
                <button 
                  v-if="calcHistory.length > 0" 
                  @click="clearCalcHistory"
                  class="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span class="material-symbols-rounded text-sm">delete</span> Xóa lịch sử
                </button>
              </div>

              <div class="divide-y divide-slate-100 p-2">
                <div v-if="calcHistory.length === 0" class="text-center text-slate-400 py-6 italic text-xs font-medium">
                  Chưa có lịch sử tính toán nào trong phiên làm việc này.
                </div>
                <div 
                  v-for="(item, idx) in calcHistory" 
                  :key="idx" 
                  class="flex justify-between items-center py-2.5 px-3 hover:bg-slate-50/55 rounded-lg transition-colors"
                >
                  <div class="text-xs">
                    <div class="font-bold text-slate-700">{{ item.typeStr }}</div>
                    <div class="text-slate-400 text-[10px]">Đầu vào: {{ item.val }} | Thuế suất: {{ item.tax }}%</div>
                  </div>
                  <div class="text-right">
                    <div class="font-black text-blue-600 text-sm">{{ item.main }}</div>
                    <div class="text-[10px] text-emerald-600 font-semibold">Thuế: {{ item.sub }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── TAB 2: VIETQR GENERATOR ────────────────────── -->
          <div v-else-if="activeTab === 'qr'" class="flex flex-col gap-6 animate-fade-in">
            <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden relative">
              <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-50/50 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

              <div class="p-6 md:p-8 relative z-10 flex flex-col md:flex-row gap-8 items-stretch">
                <!-- Generator form panel -->
                <div class="w-full md:w-1/2 flex flex-col gap-4 justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <span class="material-symbols-rounded text-2xl">qr_code_2</span>
                    </div>
                    <div>
                      <h3 class="font-extrabold text-slate-800 text-xl tracking-tight">Tạo mã VietQR</h3>
                      <p class="text-xs text-slate-500 font-medium">Hỗ trợ thanh toán nhanh bằng ứng dụng ngân hàng</p>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3.5">
                    <div class="col-span-2 flex flex-col gap-1.5">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Ngân hàng thụ hưởng</label>
                      <select 
                        v-model="qrBank"
                        class="w-full bg-slate-50 border border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 h-11 rounded-xl text-xs font-bold text-slate-700 px-3 transition-all outline-none"
                      >
                        <option value="">-- Chọn ngân hàng thụ hưởng --</option>
                        <optgroup label="Ngân hàng phổ biến nhất">
                          <option v-for="b in popularBanks" :key="b.value" :value="b.value">{{ b.label }}</option>
                        </optgroup>
                        <optgroup label="Các ngân hàng TMCP khác">
                          <option v-for="b in otherBanks" :key="b.value" :value="b.value">{{ b.label }}</option>
                        </optgroup>
                      </select>
                    </div>

                    <div class="col-span-2 flex flex-col gap-1.5">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tài khoản</label>
                      <input 
                        type="text" 
                        v-model="qrAcc"
                        class="w-full h-10.5 bg-slate-50 border border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 rounded-xl font-bold text-sm text-slate-800 px-3 transition-all outline-none"
                        placeholder="Nhập số tài khoản ngân hàng"
                      >
                    </div>

                    <div class="col-span-2 flex flex-col gap-1.5">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Tên chủ tài khoản (Không dấu)</label>
                      <input 
                        type="text" 
                        v-model="qrName"
                        @input="handleQrNameInput"
                        class="w-full h-10.5 bg-slate-50 border border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 rounded-xl font-bold uppercase text-sm text-slate-800 px-3 transition-all outline-none"
                        placeholder="VD: NGUYEN VAN A"
                      >
                    </div>

                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tiền (Tùy chọn)</label>
                      <input 
                        type="text" 
                        v-model="qrAmountStr"
                        @input="handleQrAmountInput"
                        class="w-full h-10.5 text-right font-black text-sm text-emerald-600 bg-slate-50 border border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 rounded-xl px-3 transition-all outline-none"
                        placeholder="0"
                      >
                    </div>

                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Nội dung (Tùy chọn)</label>
                      <input 
                        type="text" 
                        v-model="qrContent"
                        class="w-full h-10.5 bg-slate-50 border border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 rounded-xl text-xs font-semibold text-slate-700 px-3 transition-all outline-none"
                        placeholder="Thanh toan"
                      >
                    </div>
                  </div>

                  <div class="flex gap-2 mt-2">
                    <button 
                      @click="generateVietQR"
                      class="flex-1 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] border-none shadow-sm shadow-emerald-500/10 cursor-pointer"
                    >
                      <span class="material-symbols-rounded text-lg">magic_button</span> Tạo mã VietQR
                    </button>
                    <button 
                      @click="clearQrForm"
                      class="w-12 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 rounded-xl transition-colors border-none cursor-pointer"
                      title="Xóa trắng form"
                    >
                      <span class="material-symbols-rounded text-lg">delete</span>
                    </button>
                  </div>
                </div>

                <!-- Vertical divider -->
                <div class="hidden md:block w-px bg-slate-100 mx-4"></div>

                <!-- QR code output preview -->
                <div class="w-full md:w-1/2 flex flex-col items-center justify-center min-h-[300px] p-6 bg-slate-50/50 rounded-2xl border border-slate-100 relative overflow-hidden">
                  <div v-if="qrIsGenerated" class="text-center w-full flex flex-col items-center animate-scale-up">
                    <div class="bg-white p-3 rounded-2xl shadow-md border border-slate-200/80 mb-4 group relative overflow-hidden">
                      <img :src="qrUrlGenerated" class="rounded-lg w-48 h-48 object-cover relative z-10 transition-transform group-hover:scale-102">
                    </div>
                    
                    <div class="text-xs font-medium text-slate-700 bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs w-full max-w-[280px] text-left flex flex-col gap-1">
                      <div class="font-black text-blue-700 text-sm uppercase">{{ qrBank }}</div>
                      <div class="text-[11px] text-slate-500">Số tài khoản: <b class="text-slate-800 text-xs">{{ qrAcc }}</b></div>
                      <div class="text-[11px] text-slate-500 mb-1">Chủ tài khoản: <b class="text-slate-800 text-xs uppercase">{{ qrName || 'N/A' }}</b></div>
                      <div class="pt-2 border-t border-slate-100 flex flex-col gap-0.5">
                        <div class="flex justify-between items-center">
                          <span class="text-[10px] font-bold text-slate-400 uppercase">Số tiền</span>
                          <span class="text-emerald-600 font-extrabold text-sm">{{ formatMoney(parseCurrency(qrAmountStr)) }}</span>
                        </div>
                        <div class="flex justify-between items-center" v-if="qrContent">
                          <span class="text-[10px] font-bold text-slate-400 uppercase">Nội dung</span>
                          <span class="text-xs text-slate-700 font-semibold truncate max-w-[140px]">{{ qrContent }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else class="text-center text-slate-400 p-8 rounded-2xl border-2 border-dashed border-slate-200/80 bg-white/50 w-full max-w-[280px]">
                    <span class="material-symbols-rounded text-5xl mb-3 opacity-30 text-emerald-600">qr_code_scanner</span>
                    <p class="font-bold text-xs text-slate-500 leading-relaxed">Vui lòng điền thông tin tài khoản và nhấn nút Tạo mã để hiển thị QR động tại đây.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Saved templates registry -->
            <div class="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <div class="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <span class="material-symbols-rounded text-slate-400 text-xl">bookmarks</span>
                  <h4 class="font-bold text-slate-700 text-sm">Danh sách tài khoản lưu nhanh</h4>
                  <span class="text-[9px] font-black text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-md uppercase">Lưu trữ cục bộ</span>
                </div>
              </div>

              <div class="p-4">
                <div v-if="savedQrTemplates.length === 0" class="text-center text-slate-400 py-6 italic text-xs">
                  Chưa lưu tài khoản nào. Tạo mã QR thành công sẽ tự động ghi nhớ tài khoản này.
                </div>
                <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div 
                    v-for="(tpl, idx) in savedQrTemplates" 
                    :key="idx"
                    @click="loadQrTemplate(tpl)"
                    class="flex items-center justify-between p-3 border border-slate-150 bg-slate-50/30 rounded-xl hover:bg-emerald-50/30 hover:border-emerald-200 transition-all cursor-pointer group"
                  >
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-lg bg-white border border-slate-250 flex items-center justify-center font-extrabold text-emerald-600 text-xs shadow-xs group-hover:scale-102 transition-transform">
                        {{ tpl.bank }}
                      </div>
                      <div>
                        <div class="font-bold text-slate-700 text-xs">{{ tpl.acc }}</div>
                        <div class="text-[9px] font-semibold text-slate-400 uppercase tracking-tight truncate max-w-[120px]">{{ tpl.nameRaw || 'N/A' }}</div>
                      </div>
                    </div>
                    <button 
                      @click="deleteQrTemplate(idx, $event)"
                      class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors shadow-xs"
                      title="Xóa mẫu này"
                    >
                      <span class="material-symbols-rounded text-sm">close</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── TAB 3: TEXT TO SPEECH (TTS) ────────────────── -->
          <div v-else-if="activeTab === 'tts'" class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <!-- Left inputs panel -->
            <div class="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
              <div class="bg-gradient-to-r from-purple-50/50 to-white p-5 border-b border-purple-50 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-purple-100/60 text-purple-600 flex items-center justify-center shadow-inner">
                  <span class="material-symbols-rounded">campaign</span>
                </div>
                <div>
                  <h3 class="font-extrabold text-slate-800 text-lg">Phát loa thông báo (TTS)</h3>
                  <p class="text-xs text-slate-500">Gọi khách thanh toán hoặc chuyển tiếp thông điệp bằng loa</p>
                </div>
              </div>

              <div class="p-6 flex flex-col gap-4">
                <!-- Announcement templates list -->
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between items-center">
                    <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Mẫu thông báo sẵn có</label>
                    <button 
                      @click="showAddTtsForm = !showAddTtsForm"
                      class="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-700 transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <span class="material-symbols-rounded text-sm">add_circle</span> Thêm mẫu câu mới
                    </button>
                  </div>

                  <!-- Inline addition form -->
                  <div v-if="showAddTtsForm" class="flex flex-col gap-2.5 p-3.5 bg-purple-50/20 rounded-xl border border-purple-100 shadow-inner">
                    <div class="text-[10px] font-black text-purple-800 uppercase tracking-wider">Tạo mẫu câu phát loa mới</div>
                    <div class="grid grid-cols-1 gap-2">
                      <input 
                        type="text" 
                        v-model="newTtsName"
                        class="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 h-8.5 outline-none"
                        placeholder="Tên nhãn (Ví dụ: Nhắc dọn xe 🚗)"
                      >
                      <input 
                        type="text" 
                        v-model="newTtsValue"
                        class="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 h-8.5 outline-none"
                        placeholder="Nội dung phát (Ví dụ: Xin mời bàn {ban} qua quầy)"
                      >
                    </div>
                    <div class="flex justify-end gap-1.5 mt-1">
                      <button 
                        @click="showAddTtsForm = false"
                        class="px-3 py-1 text-xs border border-slate-200 rounded-lg bg-white cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button 
                        @click="saveNewTtsTemplate"
                        class="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold border-none cursor-pointer"
                      >
                        Lưu mẫu câu
                      </button>
                    </div>
                  </div>

                  <!-- Templates selector list -->
                  <div class="flex flex-wrap gap-1.5" v-if="ttsTemplates.length > 0">
                    <div 
                      v-for="(item, idx) in ttsTemplates" 
                      :key="idx"
                      @click="applyTtsTemplate(idx)"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer group"
                      :class="activeTtsTplIdx === idx 
                        ? 'bg-purple-50 border-purple-300 text-purple-700' 
                        : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:border-purple-200'"
                    >
                      <span>{{ item.name }}</span>
                      <button 
                        @click.stop="deleteTtsTemplate(idx, $event)"
                        class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity bg-transparent border-none cursor-pointer"
                      >
                        <span class="material-symbols-rounded text-sm">close</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Variable input parameter fields -->
                <div 
                  v-if="Object.keys(ttsVariables).length > 0"
                  class="grid grid-cols-2 gap-3 bg-purple-50/20 p-3.5 rounded-xl border border-purple-100 shadow-inner"
                >
                  <div 
                    v-for="(vVal, vKey) in ttsVariables" 
                    :key="vKey"
                    class="flex flex-col gap-1"
                  >
                    <label class="text-[9px] font-black text-purple-800 uppercase tracking-wider">Giá trị biến {{ vKey.replace('_', ' ') }}</label>
                    <input 
                      type="text" 
                      v-model="ttsVariables[vKey]"
                      @input="handleVariableChange"
                      class="w-full text-xs font-bold border border-purple-200 focus:border-purple-500 rounded-lg px-2.5 h-8 outline-none bg-white"
                      placeholder="Nhập tham số..."
                    >
                  </div>
                </div>

                <!-- Textarea announcement input -->
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Nội dung phát thanh thực tế</label>
                  <textarea 
                    v-model="ttsText"
                    rows="3"
                    class="w-full resize-none bg-slate-50/50 border border-slate-200 hover:border-purple-250 focus:border-purple-500 focus:bg-white rounded-2xl p-4 text-sm font-semibold text-slate-800 transition-all outline-none leading-relaxed"
                    placeholder="Nhấp vào mẫu câu ở trên hoặc tự gõ nội dung thông báo muốn phát ở đây..."
                  ></textarea>
                </div>

                <!-- Voice / Speed adjustment -->
                <div class="grid grid-cols-2 gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                  <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Giọng đọc</label>
                    <select 
                      v-model="ttsVoice"
                      class="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 h-9.5 rounded-lg px-2 outline-none"
                    >
                      <option value="nu-bac">Nữ miền Bắc</option>
                      <option value="nam-bac">Nam miền Bắc</option>
                      <option value="nu-nam">Nữ miền Nam</option>
                      <option value="nam-nam">Nam miền Nam</option>
                    </select>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tốc độ phát</label>
                    <select 
                      v-model="ttsSpeed"
                      class="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 h-9.5 rounded-lg px-2 outline-none"
                    >
                      <option value="0.8">Tốc độ chậm (0.8x)</option>
                      <option value="1.0">Bình thường (1.0x)</option>
                      <option value="1.2">Tốc độ nhanh (1.2x)</option>
                    </select>
                  </div>
                </div>

                <!-- Play actions -->
                <div class="flex gap-3">
                  <button 
                    @click="playSystemTts"
                    class="flex-1 h-11 rounded-xl border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <span class="material-symbols-rounded text-slate-500">volume_up</span> Đọc (Loa Hệ Thống)
                  </button>
                  
                  <button 
                    @click="playAiTts"
                    :disabled="ttsIsLoading"
                    class="flex-[1.2] h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all border-none shadow-sm cursor-pointer"
                  >
                    <span class="material-symbols-rounded" :class="{'animate-pulse': ttsIsLoading}">graphic_eq</span>
                    <span>{{ ttsIsLoading ? 'Đang tổng hợp...' : 'Đọc (Giọng AI)' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Right settings panel -->
            <div class="bg-slate-50 rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col justify-between">
              <div class="p-5 border-b border-slate-200 bg-white/50">
                <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                  <span class="material-symbols-rounded text-slate-400 text-xl">settings_applications</span>
                  Cấu hình kết nối API AI
                </h4>
              </div>

              <div class="p-5 flex-1 flex flex-col justify-between gap-4">
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Nhà cung cấp giọng đọc</label>
                    <select 
                      v-model="ttsProvider"
                      class="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 h-10 rounded-lg px-2 outline-none"
                    >
                      <option value="google">Google Cloud TTS (Miễn phí & Cực nhanh)</option>
                      <option value="fpt">FPT.AI Voice TTS</option>
                      <option value="viettel">Viettel AI Speech</option>
                    </select>
                  </div>

                  <div class="flex flex-col gap-1.5" v-if="ttsProvider !== 'google'">
                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">API Token / Key</label>
                    <input 
                      type="password"
                      v-model="ttsKey"
                      class="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 h-10 rounded-lg px-3 outline-none"
                      placeholder="Dùng Key hệ thống mặc định"
                    >
                  </div>
                </div>

                <div class="bg-purple-50 text-purple-700 text-[10px] leading-relaxed p-3 rounded-xl border border-purple-100 shadow-inner">
                  <span class="font-bold block mb-1">💡 Hướng dẫn phát loa thông báo:</span>
                  - <b>Google Translate Engine</b>: Hoàn toàn miễn phí, không giới hạn ký tự và không yêu cầu cấu hình API key.<br>
                  - <b>FPT / Viettel AI Engine</b>: Giọng điệu tự nhiên, ngắt nghỉ câu từ chuẩn chỉ hơn, yêu cầu điền API Key cá nhân để hoạt động lâu dài.
                </div>

                <div class="flex flex-col gap-2 mt-2">
                  <button 
                    @click="syncTtsCloud"
                    class="w-full h-10.5 rounded-xl border border-dashed border-purple-200 bg-white hover:bg-purple-50/20 text-purple-600 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span class="material-symbols-rounded text-sm">sync</span> Đồng bộ đám mây
                  </button>
                  <button 
                    @click="saveTtsSettings"
                    class="w-full h-10.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center border-none cursor-pointer"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ── TAB 4: GENERAL BUSINESS TOOLS ────────────── -->
          <div v-else-if="activeTab === 'tools'" class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
            
            <!-- Tax Code Search panel -->
            <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col justify-between">
              <div class="p-5 border-b border-slate-100 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner">
                  <span class="material-symbols-rounded text-xl">corporate_fare</span>
                </div>
                <div>
                  <h3 class="font-extrabold text-slate-800 text-base">Tra cứu Mã số thuế</h3>
                  <p class="text-[11px] text-slate-500">Tra cứu nhanh tên doanh nghiệp theo mã số thuế</p>
                </div>
              </div>

              <div class="p-6 flex-1 flex flex-col gap-4">
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input 
                      type="text" 
                      v-model="mstInput"
                      @keydown.enter="lookupTaxCode"
                      class="w-full h-10 bg-slate-50 border border-slate-200 hover:border-orange-300 focus:bg-white focus:border-orange-500 rounded-xl pl-9 pr-3 text-xs font-bold outline-none transition-all" 
                      placeholder="Nhập mã số thuế công ty..."
                    >
                  </div>
                  <button 
                    @click="lookupTaxCode"
                    :disabled="mstLoading"
                    class="px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl border-none cursor-pointer shadow-xs shadow-orange-100"
                  >
                    {{ mstLoading ? '...' : 'Tra cứu' }}
                  </button>
                </div>

                <div 
                  v-if="mstResult"
                  class="p-4 rounded-xl border flex-1 text-xs"
                  :class="mstResult.success ? 'bg-orange-50/10 border-orange-100' : 'bg-rose-50/10 border-rose-100 text-rose-600'"
                >
                  <div v-if="mstResult.success" class="flex flex-col gap-2 justify-between h-full">
                    <div>
                      <div class="font-extrabold text-orange-700 text-sm mb-1 leading-snug">{{ mstResult.name }}</div>
                      <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Mã số thuế: <span class="text-slate-800 text-xs font-black">{{ mstResult.id }}</span></div>
                      <div class="text-slate-500 mt-1 leading-relaxed">{{ mstResult.address }}</div>
                    </div>
                    <button 
                      @click="copyMstCompany"
                      class="self-start mt-3 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-bold flex items-center gap-1"
                    >
                      <span class="material-symbols-rounded text-sm">content_copy</span> Sao chép tên doanh nghiệp
                    </button>
                  </div>
                  <div v-else class="text-center font-bold">
                    {{ mstResult.error }}
                  </div>
                </div>

                <div v-else class="flex-1 flex items-center justify-center p-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <div class="text-center text-slate-400">
                    <span class="material-symbols-rounded text-4xl opacity-20 text-orange-500">search_check</span>
                    <p class="text-xs font-semibold text-slate-500 mt-1.5">Kết quả tra cứu sẽ hiển thị tại đây.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Currency Exchange panel -->
            <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col justify-between">
              <div class="p-5 border-b border-slate-100 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shadow-inner">
                  <span class="material-symbols-rounded text-xl">currency_exchange</span>
                </div>
                <div>
                  <h3 class="font-extrabold text-slate-800 text-base">Công cụ đổi ngoại tệ</h3>
                  <p class="text-[11px] text-slate-500">Quy đổi ngoại tệ theo tỷ giá cập nhật trực tuyến</p>
                </div>
              </div>

              <div class="p-6 flex-1 flex flex-col gap-4">
                <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                  <select 
                    v-model="exFrom"
                    class="h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center outline-none"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="VND">VND (đ)</option>
                  </select>
                  
                  <span class="material-symbols-rounded text-slate-300">arrow_forward</span>

                  <select 
                    v-model="exTo"
                    class="h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center outline-none"
                  >
                    <option value="VND">VND (đ)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Số tiền quy đổi</label>
                  <input 
                    type="text"
                    v-model="exAmountStr"
                    @input="handleExAmountInput"
                    class="w-full h-11 text-center font-bold text-base bg-slate-50 border border-slate-200 focus:bg-white focus:border-cyan-500 rounded-xl px-3 outline-none transition-all"
                    placeholder="Nhập số tiền..."
                  >
                </div>

                <div class="p-4 rounded-xl bg-slate-50/50 border border-slate-100 flex flex-col justify-center items-center text-center mt-2">
                  <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Giá trị quy đổi</span>
                  <div class="text-2xl font-black text-cyan-600">{{ exResultFormatted }}</div>
                  
                  <div class="text-[9px] text-slate-400 mt-2.5 flex items-center gap-1 font-medium">
                    <span class="material-symbols-rounded text-xs">schedule</span>
                    <span>Tỷ giá trực tuyến. {{ exRatesTime ? `Cập nhật lúc: ${exRatesTime}` : '' }}</span>
                  </div>
                </div>
              </div>
            </div>

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

/* Micro-animations */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

.animate-scale-up {
  animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
