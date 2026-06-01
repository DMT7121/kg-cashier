<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { 
  formatCurrency, 
  showConfirm, 
  showToast 
} from '../utils';

// Interfaces
interface VatInvoice {
  fileName: string;
  tenDonVi: string;
  mst: string;
  diaChi: string;
  ngayKy: string;
  tongTien: string | number;
  linkView: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'scanning' | 'ready' | 'uploading' | 'done' | 'error';
  statusText?: string;
  rawText: string;
  data: {
    tenDonVi: string;
    mst: string;
    tongTien: string;
    ngayKy: string;
    diaChi: string;
  };
}

interface ActivityLog {
  time: string;
  activity: string;
}

// Stores
const settingsStore = useSettingsStore();

// Constants
const API_URL = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec";
const MAX_CONCURRENT_SCANS = 8;

const PROVIDER_MAP: Record<string, { label: string; runner: (key: string, prompt: string) => Promise<string> }> = {
  gemini: { label: 'Gemini', runner: callGeminiDirect },
  deepseek: { label: 'DeepSeek', runner: callDeepSeekDirect },
  groq: { label: 'Groq', runner: callGroqDirect },
  sambanova: { label: 'SambaNova', runner: callSambaNovaDirect },
  cerebras: { label: 'Cerebras', runner: callCerebrasDirect },
  mistral: { label: 'Mistral', runner: callMistralDirect },
  nvidia: { label: 'NVIDIA', runner: callNvidiaDirect },
  hf: { label: 'HuggingFace', runner: callHuggingFaceDirect }
};

// State
const activeTab = ref<'upload' | 'search' | 'history'>('upload');
const driveCount = ref<number | string>('...');
const uploadQueue = ref<UploadItem[]>([]);
const aiScanQueue = ref<string[]>([]);
const activeScans = ref(0);

// Search State
const searchQuery = ref('');
const currentSearchData = ref<VatInvoice[]>([]);
const isSearching = ref(false);
const currentPage = ref(1);
const itemsPerPage = 30;
const selectedInvoices = ref<Set<string>>(new Set());

// Email Modal State
const showEmailModal = ref(false);
const emailForm = ref({
  fileName: '',
  tenDonVi: '',
  tongTien: 0,
  email: ''
});
const isSendingEmail = ref(false);

// Activity Logs
const activityLogs = ref<string[][]>([]);
const isLoadingHistory = ref(false);

// Re-Scan State
const isRescanning = ref(false);

// Provider index rotation tracking
const providerIndices = ref<Record<string, number>>({
  gemini: 0, deepseek: 0, groq: 0, sambanova: 0, cerebras: 0, mistral: 0, nvidia: 0, hf: 0
});

// Computed properties for API keys
const geminiKeys = computed(() => settingsStore.settings?.vatKeys?.gemini || []);
const deepseekKeys = computed(() => settingsStore.settings?.vatKeys?.deepseek || []);
const groqKeys = computed(() => settingsStore.settings?.vatKeys?.groq || []);
const sambanovaKeys = computed(() => settingsStore.settings?.vatKeys?.sambanova || []);
const cerebrasKeys = computed(() => settingsStore.settings?.vatKeys?.cerebras || []);
const mistralKeys = computed(() => settingsStore.settings?.vatKeys?.mistral || []);
const nvidiaKeys = computed(() => settingsStore.settings?.vatKeys?.nvidia || []);
const hfKeys = computed(() => settingsStore.settings?.vatKeys?.hf || []);

const hasAnyKeys = computed(() => {
  return geminiKeys.value.length > 0 ||
         deepseekKeys.value.length > 0 ||
         groqKeys.value.length > 0 ||
         sambanovaKeys.value.length > 0 ||
         cerebrasKeys.value.length > 0 ||
         mistralKeys.value.length > 0 ||
         nvidiaKeys.value.length > 0 ||
         hfKeys.value.length > 0;
});

// Watch Tab
watch(activeTab, (tab) => {
  if (tab === 'search') {
    doSearch();
  } else if (tab === 'history') {
    loadHistory();
  }
});

// Lifecycle
onMounted(() => {
  getDriveCount();
});

// Utility Functions
function formatCurrencyVN(val: any): string {
  if (!val) return '0đ';
  const num = String(val).replace(/[^0-9]/g, '');
  if (!num) return '0đ';
  return Number(num).toLocaleString('vi-VN') + 'đ';
}

function formatDateVN(dateInput: any): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) return dateInput;
  const date = new Date(dateInput);
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return dateInput;
}

function parseDate(dateStr: string): number {
  if (!dateStr) return 0;
  if (dateStr.includes('T') || dateStr.includes('-')) return new Date(dateStr).getTime();
  const parts = dateStr.split('/');
  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
  return 0;
}

// Central API posting helper
async function callAPI(d: any) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(d)
    });
    return await response.json();
  } catch (e) {
    return { status: 'error', message: 'Lỗi mạng' };
  }
}

async function getDriveCount() {
  const res = await callAPI({ action: 'get_drive_count' });
  if (res.status === 'success') {
    driveCount.value = res.total;
  }
}

// Timeout wrapper for requests
function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 25000) {
  return Promise.race([
    fetch(url, opts),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ]);
}

// AI system prompts
const VISION_EXTRACT_PROMPT = `BẠN LÀ CHUYÊN GIA TRÍCH XUẤT HÓA ĐƠN VAT VIỆT NAM.

NHÌN vào file PDF hóa đơn VAT này và trích xuất thông tin NGƯỜI MUA HÀNG (KHÔNG PHẢI người bán/King's Grill).

CẤU TRÚC HÓA ĐƠN VAT:
- "Cộng tiền hàng" = tiền chưa thuế
- "Tiền thuế GTGT" = thuế (8% hoặc 10%)
- "Tổng cộng tiền thanh toán" = TỔNG CUỐI CÙNG (tiền hàng + thuế) → ĐÂY LÀ tongTien

QUY TẮC:
1. tongTien = "Tổng cộng tiền thanh toán", PHẢI LỚN HƠN "Cộng tiền hàng"
2. Kiểm chứng bằng dòng "Bằng chữ" nếu có
3. tongTien là SỐ NGUYÊN, không dấu chấm phẩy (ví dụ: 660000)
4. TUYỆT ĐỐI KHÔNG trả về 0
5. mst chỉ gồm chữ số và dấu gạch ngang

Trả về JSON:
{
  "tenDonVi": "Tên NGƯỜI MUA",
  "mst": "MST NGƯỜI MUA",
  "tongTien": "Số nguyên",
  "ngayKy": "DD/MM/YYYY",
  "diaChi": "Địa chỉ NGƯỜI MUA"
}`;

const TEXT_EXTRACT_PROMPT_TEMPLATE = (rawText: string) => `BẠN LÀ CHUYÊN GIA TRÍCH XUẤT HÓA ĐƠN VAT VIỆT NAM.

Đọc văn bản thô từ hóa đơn VAT. Trích xuất thông tin NGƯỜI MUA HÀNG (KHÔNG PHẢI người bán/King's Grill).

Văn bản hóa đơn:
"""
${rawText.substring(0, 3500)}
"""

CẤU TRÚC HÓA ĐƠN VAT:
- "Cộng tiền hàng" = tiền chưa thuế
- "Tiền thuế GTGT" = thuế (8% hoặc 10%)
- "Tổng cộng tiền thanh toán" = TỔNG CUỐI CÙNG (tiền hàng + thuế) → ĐÂY LÀ tongTien

QUY TẮC:
1. tongTien = "Tổng cộng tiền thanh toán", PHẢI LỚN HƠN "Cộng tiền hàng"
2. Kiểm chứng bằng dòng "Bằng chữ" nếu có
3. tongTien là SỐ NGUYÊN, không dấu chấm phẩy
4. TUYỆT ĐỐI KHÔNG trả về 0
5. mst chỉ gồm chữ số và dấu gạch ngang

Trả về DUY NHẤT JSON hợp lệ:
{
  "tenDonVi": "Tên NGƯỜI MUA",
  "mst": "MST NGƯỜI MUA",
  "tongTien": "Số nguyên",
  "ngayKy": "DD/MM/YYYY",
  "diaChi": "Địa chỉ NGƯỜI MUA"
}`;

const EXTRACT_SYS = "You are a Vietnamese VAT invoice extraction expert. Output ONLY valid JSON. Rules: (1) Date format DD/MM/YYYY. (2) tongTien = 'Tổng cộng tiền thanh toán' which is the FINAL total AFTER tax, NOT 'Cộng tiền hàng' (pre-tax subtotal). It equals subtotal + VAT tax. (3) tongTien must be a pure integer with no dots or commas (e.g. 660000 not 660.000). (4) NEVER return 0 for tongTien. (5) Do NOT confuse tax ID numbers or invoice serial numbers with money amounts.";

// Gemini Vision Direct
async function callGeminiVision(pdfBase64: string, fileId: string) {
  for (let i = 0; i < geminiKeys.value.length; i++) {
    const curIdx = (providerIndices.value.gemini + i) % geminiKeys.value.length;
    const key = geminiKeys.value[curIdx];
    providerIndices.value.gemini = (curIdx + 1) % geminiKeys.value.length;
    
    updateItemStatusText(fileId, '🔬 Gemini Vision đang nhìn...');

    try {
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: VISION_EXTRACT_PROMPT }
          ]}],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }, 30000);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err.substring(0, 120)}`);
      }
      const json = await res.json();
      const gParts = json.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (let pi = gParts.length - 1; pi >= 0; pi--) {
        if (!gParts[pi].thought && gParts[pi].text) {
          text = gParts[pi].text;
          break;
        }
      }
      if (!text) throw new Error('Gemini Vision returned empty');
      console.log('[VAT Vision] Gemini Vision succeeded');
      return text;
    } catch (e: any) {
      console.warn(`[VAT Vision] Gemini key #${i} failed:`, e.message);
    }
  }
  return null;
}

// Unified Fallback LLM callers
async function tryProvider(provider: string, prompt: string, fileId: string | null = null): Promise<string> {
  const cfg = PROVIDER_MAP[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  
  const keys = settingsStore.settings?.vatKeys?.[provider as keyof typeof settingsStore.settings.vatKeys] || [];
  if (!keys.length) throw new Error(`${provider} keys empty`);

  for (let i = 0; i < keys.length; i++) {
    const curIdx = (providerIndices.value[provider] + i) % keys.length;
    const key = keys[curIdx];
    providerIndices.value[provider] = (curIdx + 1) % keys.length;
    
    if (fileId) {
      updateItemStatusText(fileId, `${cfg.label} đang đọc...`);
    }
    
    try {
      return await cfg.runner(key, prompt);
    } catch (e: any) {
      console.warn(`[VAT] ${cfg.label} key #${i} failed:`, e.message);
    }
  }
  throw new Error(`${cfg.label}: hết key`);
}

async function callAI_Unified(promptText: string, fileId: string | null = null) {
  if (!hasAnyKeys.value) {
    showToast("Hệ thống cần ít nhất 1 API Key để hoạt động. Vui lòng cấu hình trong Cài đặt!", "warning");
    return null;
  }
  
  const errors: string[] = [];
  const providers = ['gemini', 'deepseek', 'groq', 'sambanova', 'cerebras', 'mistral', 'nvidia', 'hf'];

  for (const provider of providers) {
    const keys = settingsStore.settings?.vatKeys?.[provider as keyof typeof settingsStore.settings.vatKeys] || [];
    if (!keys.length) continue;
    try {
      return await tryProvider(provider, promptText, fileId);
    } catch (e: any) {
      const msg = `${provider}: ${e.message}`;
      errors.push(msg);
      console.warn('[VAT AI Fallback]', msg);
    }
  }
  throw new Error('Tất cả AI đều lỗi: ' + errors.join(' → '));
}

// Direct providers runners
async function callGeminiDirect(key: string, prompt: string): Promise<string> {
  const reqBody = {
    system_instruction: { parts: [{ text: EXTRACT_SYS }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody)
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  const json = await res.json();
  const gParts = json.candidates?.[0]?.content?.parts || [];
  let text = '';
  for (let pi = gParts.length - 1; pi >= 0; pi--) {
    if (!gParts[pi].thought && gParts[pi].text) {
      text = gParts[pi].text;
      break;
    }
  }
  if (!text) throw new Error('Gemini returned empty');
  return text;
}

async function callDeepSeekDirect(key: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1024
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned empty');
  return content;
}

async function callGroqDirect(key: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  return (await res.json()).choices[0].message.content;
}

async function callSambaNovaDirect(key: string, prompt: string): Promise<string> {
  const models = ['Meta-Llama-3.3-70B-Instruct', 'Llama-4-Scout-17B-16E-Instruct'];
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await fetchWithTimeout('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 1024
        })
      });
      if (!res.ok) { lastErr = await res.text(); continue; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (e: any) { lastErr = e.message; }
  }
  throw new Error(`SambaNova failed: ${String(lastErr).substring(0, 100)}`);
}

async function callCerebrasDirect(key: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  return (await res.json()).choices[0].message.content;
}

async function callMistralDirect(key: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  return (await res.json()).choices[0].message.content;
}

async function callNvidiaDirect(key: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1024, stream: false
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
  return (await res.json()).choices[0].message.content;
}

async function callHuggingFaceDirect(key: string, prompt: string): Promise<string> {
  const models = [
    'Qwen/Qwen2.5-72B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct',
    'mistralai/Mistral-Small-24B-Instruct-2501'
  ];
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: EXTRACT_SYS }, { role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 1024, stream: false
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        lastErr = `${model}: ${res.status} ${errText.substring(0, 80)}`;
        continue;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (e: any) {
      lastErr = `${model}: ${e.message}`;
    }
  }
  throw new Error(`HuggingFace: ${lastErr}`);
}

// PDF.js Text Extractor
let pdfjsLibLoaded = false;
async function loadPdfJs() {
  if (pdfjsLibLoaded || (window as any).pdfjsLib) return;
  return new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      pdfjsLibLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });
}

// Upload & PDF processing logic
function triggerFileSelect() {
  document.getElementById('vat-file-input')?.click();
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer?.files) {
    handleFileSelect(e.dataTransfer.files);
  }
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    handleFileSelect(target.files);
  }
}

function handleFileSelect(files: FileList) {
  if (!files || files.length === 0) return;
  
  Array.from(files).forEach(file => {
    if (file.type !== 'application/pdf') {
      showToast('Hệ thống chỉ chấp nhận file PDF!', 'error');
      return;
    }
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    uploadQueue.value.unshift({
      id,
      file,
      status: 'pending',
      rawText: '',
      data: { tenDonVi: '', mst: '', tongTien: '', ngayKy: '', diaChi: '' }
    });
    aiScanQueue.value.push(id);
  });
  
  processScanQueue();
}

async function processScanQueue() {
  if (!aiScanQueue.value.length || activeScans.value >= MAX_CONCURRENT_SCANS) return;
  
  while (aiScanQueue.value.length > 0 && activeScans.value < MAX_CONCURRENT_SCANS) {
    const id = aiScanQueue.value.shift();
    if (!id) continue;
    
    const item = uploadQueue.value.find(i => i.id === id);
    if (item && item.status === 'pending') {
      activeScans.value++;
      autoScanAndUpload(id).finally(() => {
        activeScans.value--;
        processScanQueue();
      });
    }
  }
}

function updateItemStatus(id: string, status: UploadItem['status'], statusText?: string) {
  const item = uploadQueue.value.find(i => i.id === id);
  if (item) {
    item.status = status;
    if (statusText) item.statusText = statusText;
  }
}

function updateItemStatusText(id: string, text: string) {
  const item = uploadQueue.value.find(i => i.id === id);
  if (item) {
    item.statusText = text;
  }
}

async function autoScanAndUpload(id: string) {
  const item = uploadQueue.value.find(i => i.id === id);
  if (!item) return;

  updateItemStatus(id, 'scanning', 'Đang chờ xử lý...');
  
  try {
    let res = null;
    
    // Attempt Route 1: Gemini Vision (direct PDF sending)
    if (geminiKeys.value.length > 0) {
      updateItemStatus(id, 'scanning', '🔬 Vision đang đọc...');
      const buf = await item.file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), ''));
      res = await callGeminiVision(base64, id);
    }
    
    // Attempt Route 2: Fallback text parsing + unified text LLM
    if (!res) {
      updateItemStatus(id, 'scanning', 'pdf.js đang trích xuất...');
      await loadPdfJs();
      if (!item.rawText) {
        const buf = await item.file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
        let txt = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          txt += textContent.items.map((s: any) => s.str).join(' ') + '\n';
        }
        item.rawText = txt;
      }
      res = await callAI_Unified(TEXT_EXTRACT_PROMPT_TEMPLATE(item.rawText), id);
    }
    
    if (!res) {
      updateItemStatus(id, 'ready', 'AI không phản hồi');
      return;
    }
    
    let json = res.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (json.includes('{')) {
      json = json.substring(json.indexOf('{'), json.lastIndexOf('}') + 1);
    }
    const data = JSON.parse(json);
    
    // Standardize variables
    if (data.tongTien) data.tongTien = String(data.tongTien).replace(/[^0-9]/g, '');
    if (data.mst) data.mst = String(data.mst).replace(/[^0-9-]/g, '');
    if (data.ngayKy) {
      const match = String(data.ngayKy).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (match) data.ngayKy = `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`;
    }
    
    // Prevent 0đ invoices
    if (!data.tongTien || data.tongTien === '0') {
      item.data = { ...item.data, ...data };
      updateItemStatus(id, 'error', 'Lỗi: Tổng tiền 0đ');
      return;
    }
    
    item.data = { ...item.data, ...data };
    
    // Check duplicates before saving
    let isDuplicate = currentSearchData.value.some(d => 
      d.mst === item.data.mst && 
      d.ngayKy === item.data.ngayKy && 
      String(d.tongTien) === String(item.data.tongTien)
    );
    
    if (!isDuplicate) {
      isDuplicate = uploadQueue.value.some(q => 
        q.id !== id && 
        q.status === 'done' && 
        q.data.mst === item.data.mst && 
        q.data.ngayKy === item.data.ngayKy && 
        String(q.data.tongTien) === String(item.data.tongTien)
      );
    }
    
    if (isDuplicate) {
      updateItemStatus(id, 'error', 'Hóa đơn trùng lặp');
      showToast(`Hóa đơn của MST ${item.data.mst} (${item.data.ngayKy} - ${formatCurrencyVN(item.data.tongTien)}) đã tồn tại!`, 'warning');
      return;
    }
    
    updateItemStatus(id, 'ready', 'Sẵn sàng lưu');
    
    if (item.data.mst && item.data.ngayKy && item.data.tongTien) {
      await saveUploadItem(id);
    }
  } catch (e: any) {
    console.error('[VAT Scan Error]', e);
    const shortMsg = e.message && e.message.length > 60 ? e.message.substring(0, 60) + '…' : (e.message || 'Lỗi AI');
    updateItemStatus(id, 'error', shortMsg);
  }
}

async function saveUploadItem(id: string) {
  const item = uploadQueue.value.find(i => i.id === id);
  if (!item) return;
  
  updateItemStatus(id, 'uploading', 'Đang tải lên...');
  
  try {
    const fileReader = new FileReader();
    fileReader.readAsDataURL(item.file);
    
    await new Promise<void>((resolve, reject) => {
      fileReader.onload = async () => {
        let finalFileName = item.file.name;
        if (item.data.ngayKy && item.data.mst) {
          finalFileName = `${item.data.ngayKy}-${item.data.mst}.pdf`;
        }
        
        const res = await callAPI({
          action: 'upload',
          fileBase64: (fileReader.result as string).split(',')[1],
          mimeType: item.file.type,
          fileName: finalFileName,
          ...item.data
        });
        
        if (res.status === 'success') {
          updateItemStatus(id, 'done', 'Hoàn tất');
          getDriveCount();
          resolve();
        } else {
          updateItemStatus(id, 'error', res.message || 'Lỗi lưu trữ');
          reject(new Error(res.message));
        }
      };
      fileReader.onerror = () => reject(new Error('FileReader error'));
    });
  } catch (e: any) {
    updateItemStatus(id, 'error', e.message || 'Lỗi lưu trữ');
  }
}

function removeQueueItem(id: string) {
  uploadQueue.value = uploadQueue.value.filter(x => x.id !== id);
  aiScanQueue.value = aiScanQueue.value.filter(x => x !== id);
}

function retryQueueItem(id: string) {
  const item = uploadQueue.value.find(x => x.id === id);
  if (item) {
    item.status = 'pending';
    item.statusText = 'Chờ...';
    aiScanQueue.value.push(id);
    processScanQueue();
  }
}

// Search tab logic
async function doSearch() {
  isSearching.value = true;
  let q = searchQuery.value.trim();
  
  // Format quick date queries like DD-MM
  if (/^(\d{1,2})[-.\s](\d{1,2})(?:[-.\s](\d{4}))?$/.test(q)) {
    const match = q.match(/^(\d{1,2})[-.\s](\d{1,2})(?:[-.\s](\d{4}))?$/);
    if (match) {
      const d = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      const y = match[3];
      q = y ? `${d}/${m}/${y}` : `${d}/${m}`;
    }
  }
  
  try {
    const res = await callAPI({
      action: 'search',
      query: q,
      limit: 5000,
      nocache: Date.now()
    });
    if (res.status === 'success') {
      currentSearchData.value = (res.data || []).sort((a: VatInvoice, b: VatInvoice) => parseDate(b.ngayKy) - parseDate(a.ngayKy));
      currentPage.value = 1;
    }
  } catch (e: any) {
    showToast('Lỗi tìm kiếm: ' + e.message, 'error');
  } finally {
    isSearching.value = false;
  }
}

// Pagination computations
const totalPages = computed(() => Math.ceil(currentSearchData.value.length / itemsPerPage));
const pagedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return currentSearchData.value.slice(start, start + itemsPerPage);
});

function changePage(step: number) {
  const next = currentPage.value + step;
  if (next >= 1 && next <= totalPages.value) {
    currentPage.value = next;
  }
}

// Selection & Bulk Actions
function toggleSelectInvoice(fileName: string, isChecked: boolean) {
  if (isChecked) {
    selectedInvoices.value.add(fileName);
  } else {
    selectedInvoices.value.delete(fileName);
  }
}

function toggleSelectAll() {
  const allCurrentChecked = pagedResults.value.every(d => selectedInvoices.value.has(d.fileName));
  if (allCurrentChecked) {
    pagedResults.value.forEach(d => selectedInvoices.value.delete(d.fileName));
  } else {
    pagedResults.value.forEach(d => selectedInvoices.value.add(d.fileName));
  }
}

async function bulkDelete() {
  if (selectedInvoices.value.size === 0) return;
  const ok = await showConfirm(`Bạn có chắc chắn muốn xóa ${selectedInvoices.value.size} hóa đơn đã chọn không?`, {
    title: 'Xóa hàng loạt?',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (!ok) return;

  showToast(`Đang xóa ${selectedInvoices.value.size} hóa đơn...`, 'info');
  let successCount = 0;
  const list = Array.from(selectedInvoices.value);
  for (const fileName of list) {
    try {
      const res = await callAPI({ action: 'delete_invoice', fileName });
      if (res.status === 'success') successCount++;
    } catch (e) {}
  }
  showToast(`Đã xóa thành công ${successCount}/${list.length} hóa đơn.`, 'success');
  selectedInvoices.value.clear();
  await doSearch();
  await getDriveCount();
}

async function deleteInvoice(fileName: string) {
  const ok = await showConfirm('Bạn có chắc muốn xóa hóa đơn cũ này để nạp lại bản mới không?', {
    title: 'Thay thế hóa đơn?',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (!ok) return;

  const res = await callAPI({ action: 'delete_invoice', fileName });
  if (res.status === 'success') {
    showToast('Đã xóa hóa đơn thành công. Hãy tải lên file mới!', 'success');
    await doSearch();
    await getDriveCount();
    activeTab.value = 'upload';
  } else {
    showToast('Không thể xóa file: ' + (res.message || 'Lỗi hệ thống'), 'error');
  }
}

async function syncDriveData() {
  const ok = await showConfirm('Bạn có chắc muốn Đồng bộ dữ liệu? Quá trình này sẽ rà soát và xóa các hóa đơn trùng lặp/lỗi hệ thống.', {
    title: 'Đồng bộ hệ thống',
    confirmText: 'Đồng bộ',
    type: 'info'
  });
  if (!ok) return;

  showToast('Đang quét và đồng bộ với Drive... Vui lòng đợi', 'info');
  try {
    const res = await callAPI({ action: 'sync_db' });
    if (res.status === 'success') {
      showToast(res.message || 'Đồng bộ hoàn tất!', 'success');
      selectedInvoices.value.clear();
      await doSearch();
      await getDriveCount();
    } else {
      showToast('Lỗi đồng bộ: ' + res.message, 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối khi đồng bộ.', 'error');
  }
}

// Rescan with AI
async function rescanAllWithAI() {
  if (!geminiKeys.value.length) {
    showToast('Cần cấu hình Gemini API Key trước khi Re-Scan!', 'error');
    return;
  }

  const ok = await showConfirm(
    'Re-Scan sẽ dùng Gemini Vision đọc lại TẤT CẢ file PDF trên Drive và tự động cập nhật thông tin.\n\nQuá trình này mất vài phút tùy số lượng file.',
    { title: 'Re-Scan bằng Gemini Vision?', type: 'info', confirmText: 'Bắt đầu' }
  );
  if (!ok) return;

  isRescanning.value = true;
  let totalProcessed = 0, totalUpdated = 0, totalErrors = 0, totalFiles = 0;
  let startIndex = 0;
  const batchSize = 15;
  let hasMore = true;

  try {
    while (hasMore) {
      showToast(`🔬 Đang scan lô ${startIndex + 1}-${startIndex + batchSize}...`, 'info');
      const res = await callAPI({
        action: 'rescan_batch',
        startIndex,
        batchSize
      });

      if (res.status !== 'success') {
        showToast('Lỗi Re-Scan: ' + (res.message || 'Lỗi không xác định'), 'error');
        break;
      }

      totalFiles = res.total;
      totalProcessed += res.processed;
      totalUpdated += res.updated;
      totalErrors += res.errors;
      hasMore = res.hasMore;
      startIndex = res.nextIndex;
    }

    showToast(
      `✅ Re-Scan hoàn tất! ${totalProcessed}/${totalFiles} file: ${totalUpdated} cập nhật, ${totalErrors} lỗi.`,
      totalErrors > 0 ? 'warning' : 'success'
    );
    await doSearch();
    await getDriveCount();
  } catch (e: any) {
    showToast('Lỗi kết nối khi Re-Scan: ' + e.message, 'error');
  } finally {
    isRescanning.value = false;
  }
}

// Mail Sending Modal
function openMailModal(invoice: VatInvoice) {
  emailForm.value = {
    fileName: invoice.fileName,
    tenDonVi: invoice.tenDonVi,
    tongTien: Number(invoice.tongTien),
    email: ''
  };
  showEmailModal.value = true;
}

async function sendEmailInvoice() {
  const email = emailForm.value.email.trim();
  if (!email || !email.includes('@')) {
    showToast('Vui lòng nhập địa chỉ email hợp lệ!', 'warning');
    return;
  }

  isSendingEmail.value = true;
  try {
    const res = await callAPI({
      action: 'send_email',
      email: email,
      fileName: emailForm.value.fileName,
      tenDonVi: emailForm.value.tenDonVi,
      tongTien: emailForm.value.tongTien
    });
    if (res.status === 'success') {
      showToast(`Đã gửi email thành công đến: ${email}`, 'success');
      showEmailModal.value = false;
    } else {
      showToast('Lỗi: ' + (res.message || 'Không thể gửi email'), 'error');
    }
  } catch (e: any) {
    showToast('Lỗi kết nối gửi email: ' + e.message, 'error');
  } finally {
    isSendingEmail.value = false;
  }
}

// History Logs loader
async function loadHistory() {
  isLoadingHistory.value = true;
  try {
    const res = await callAPI({ action: 'get_history' });
    if (res.status === 'success') {
      activityLogs.value = res.data || [];
    }
  } catch (e: any) {
    showToast('Lỗi tải nhật ký: ' + e.message, 'error');
  } finally {
    isLoadingHistory.value = false;
  }
}

// Helper actions
function previewFile(url: string) {
  window.open(url.replace('/view', '/preview'), '_blank');
}

function copyLink(url: string) {
  navigator.clipboard.writeText(url);
  showToast('Đã copy đường dẫn liên kết!', 'success');
}
</script>

<template>
  <div class="view-content p-6">
    <!-- Header tabs dashboard bar -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-fit">
        <button 
          v-for="t in [
            { key: 'upload', icon: 'cloud_upload', label: 'Upload Hóa Đơn' },
            { key: 'search', icon: 'search', label: 'Tra Cứu & Kho' },
            { key: 'history', icon: 'history', label: 'Lịch Sử hoạt động' }
          ]" 
          :key="t.key"
          class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          :class="activeTab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
          @click="activeTab = t.key as any"
        >
          <span class="material-symbols-rounded text-lg">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>

      <div class="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-sm">
        <span class="material-symbols-rounded text-indigo-500 text-sm">cloud_done</span>
        <span>Có <strong class="text-indigo-600 font-semibold">{{ driveCount }}</strong> hóa đơn trên Google Drive</span>
      </div>
    </div>

    <!-- Active Tab content view -->
    <div id="vatTabContent" class="space-y-6">
      
      <!-- ── UPLOAD TAB ── -->
      <div v-if="activeTab === 'upload'" class="space-y-6 animate-fade-in">
        <div class="card bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div class="flex items-center gap-3 pb-3 border-b border-slate-50">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span class="material-symbols-rounded">psychology</span>
            </div>
            <div>
              <h4 class="text-lg font-bold text-slate-800">Hệ Thống Scan Hóa Đơn VAT Đa Kênh AI</h4>
              <p class="text-xs text-slate-500 mt-0.5">
                Tự động trích xuất bằng mắt thần Gemini Vision hoặc 7 loại mô hình ngôn ngữ lớn chạy song song.
                <span v-if="geminiKeys.length > 0" class="text-emerald-600 font-semibold ml-1">🔬 Gemini Vision: Đang bật</span>
                <span v-else class="text-amber-500 ml-1">⚠️ Chưa có Gemini key (Sử dụng trích xuất văn bản pdf.js)</span>
              </p>
            </div>
          </div>

          <!-- Drag and drop zone -->
          <div 
            class="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-10 text-center cursor-pointer transition-all relative flex flex-col items-center justify-center min-h-[220px]"
            @dragover.prevent
            @drop.prevent="handleFileDrop"
            @click="triggerFileSelect"
          >
            <input 
              type="file" 
              id="vat-file-input" 
              class="hidden" 
              accept="application/pdf" 
              multiple 
              @change="handleFileInput"
            />
            <div class="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
              <span class="material-symbols-rounded text-3xl">upload_file</span>
            </div>
            <h5 class="text-sm font-semibold text-slate-700">Kéo & thả các file PDF hóa đơn VAT tại đây</h5>
            <p class="text-xs text-slate-400 mt-1">hoặc nhấn để duyệt file từ máy tính của bạn</p>
            <span class="mt-3 text-[10px] text-slate-400 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">Hỗ trợ PDF hóa đơn điện tử</span>
          </div>

          <!-- Queue layout list -->
          <div v-if="uploadQueue.length > 0" class="space-y-3 mt-4">
            <h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách hàng đợi ({{ uploadQueue.length }} file)</h5>
            <div class="space-y-3">
              <div 
                v-for="item in uploadQueue" 
                :key="item.id" 
                class="border border-slate-100 rounded-xl bg-white p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all"
              >
                <div class="flex items-center gap-3.5 min-w-[240px] flex-1">
                  <div class="w-11 h-11 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center shrink-0">
                    <span class="material-symbols-rounded text-xl">picture_as_pdf</span>
                  </div>
                  <div class="overflow-hidden">
                    <h6 class="text-xs font-bold text-slate-800 truncate max-w-[200px]" :title="item.file.name">
                      {{ item.file.name }}
                    </h6>
                    <span 
                      class="inline-block text-[10px] px-2 py-0.5 mt-1 rounded font-medium border"
                      :class="{
                        'bg-slate-100 border-slate-200 text-slate-600': item.status === 'pending',
                        'bg-amber-50 border-amber-200 text-amber-600 animate-pulse': item.status === 'scanning',
                        'bg-sky-50 border-sky-200 text-sky-600': item.status === 'ready',
                        'bg-indigo-50 border-indigo-200 text-indigo-600 animate-pulse': item.status === 'uploading',
                        'bg-emerald-50 border-emerald-200 text-emerald-600': item.status === 'done',
                        'bg-rose-50 border-rose-200 text-rose-600': item.status === 'error'
                      }"
                    >
                      {{ item.statusText || 'Đang chờ...' }}
                    </span>
                  </div>
                </div>

                <!-- Manual values edit form fields -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-[3]">
                  <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-medium text-slate-400">Đơn vị mua</span>
                    <input 
                      type="text" 
                      class="form-input text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 w-full"
                      placeholder="Tên đơn vị..."
                      v-model="item.data.tenDonVi"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-medium text-slate-400">Mã số thuế</span>
                    <input 
                      type="text" 
                      class="form-input text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 w-full font-mono text-indigo-600"
                      placeholder="MST..."
                      v-model="item.data.mst"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-medium text-slate-400">Địa chỉ</span>
                    <input 
                      type="text" 
                      class="form-input text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 w-full"
                      placeholder="Địa chỉ..."
                      v-model="item.data.diaChi"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-medium text-slate-400">Tổng tiền</span>
                    <input 
                      type="text" 
                      class="form-input text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 w-full font-bold text-emerald-600"
                      placeholder="Số tiền..."
                      :value="formatCurrencyVN(item.data.tongTien)"
                      @input="(e) => item.data.tongTien = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '')"
                    />
                  </div>
                </div>

                <!-- Actions buttons for this queue block -->
                <div class="flex sm:flex-col lg:flex-row items-center gap-1.5 shrink-0 justify-end">
                  <template v-if="['ready', 'error'].includes(item.status)">
                    <button 
                      class="btn btn-outline btn-sm px-2.5 text-xs text-amber-500 border-amber-200 hover:bg-amber-50 hover:border-amber-400"
                      @click="retryQueueItem(item.id)"
                    >
                      <span class="material-symbols-rounded text-base">refresh</span>
                    </button>
                    <button 
                      class="btn btn-primary btn-sm text-xs px-3"
                      @click="saveUploadItem(item.id)"
                    >
                      Lưu
                    </button>
                  </template>
                  <template v-else-if="item.status === 'done'">
                    <span class="text-xs font-semibold text-emerald-600 flex items-center gap-1 px-3 py-1">
                      <span class="material-symbols-rounded text-base">check_circle</span> Đã lưu
                    </span>
                  </template>
                  <button 
                    v-if="item.status !== 'done'"
                    class="btn btn-outline btn-sm px-2 border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200"
                    @click="removeQueueItem(item.id)"
                  >
                    <span class="material-symbols-rounded text-base">delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TRA CỨU / KHO TAB ── -->
      <div v-if="activeTab === 'search'" class="space-y-4 animate-fade-in">
        
        <!-- Search bar -->
        <div class="card bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
          <div class="relative flex-1">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <span class="material-symbols-rounded text-lg">search</span>
            </span>
            <input 
              type="text" 
              class="form-input pl-9.5 pr-4 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 text-sm"
              placeholder="Nhập MST, tên đơn vị mua, số tiền hoặc ngày ký hóa đơn (DD/MM)..."
              v-model="searchQuery"
              @keyup.enter="doSearch"
            />
          </div>
          <button 
            class="btn btn-primary px-6 flex items-center justify-center gap-2 text-sm h-[38px] rounded-xl"
            @click="doSearch"
            :disabled="isSearching"
          >
            <span class="material-symbols-rounded text-lg" :class="{ 'spin': isSearching }">
              {{ isSearching ? 'sync' : 'search' }}
            </span>
            <span>{{ isSearching ? 'Đang tìm...' : 'Tìm Kiếm' }}</span>
          </button>
        </div>

        <!-- Filter bar stats & dynamic quick buttons -->
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div class="flex items-center gap-3.5">
            <span>Đang hiển thị <strong class="text-slate-800 font-semibold">{{ currentSearchData.length }}</strong> kết quả</span>
            <button 
              class="btn btn-outline btn-xs px-2.5 py-1 text-sky-600 border-sky-100 hover:bg-sky-50 flex items-center gap-1"
              @click="syncDriveData"
            >
              <span class="material-symbols-rounded text-sm">sync</span> Đồng bộ Drive
            </button>
            <button 
              class="btn btn-outline btn-xs px-2.5 py-1 text-amber-600 border-amber-100 hover:bg-amber-50 flex items-center gap-1"
              @click="rescanAllWithAI"
              :disabled="isRescanning"
            >
              <span class="material-symbols-rounded text-sm" :class="{ 'spin animate-spin': isRescanning }">
                {{ isRescanning ? 'sync' : 'auto_fix_high' }}
              </span>
              <span>Re-Scan AI</span>
            </button>
          </div>

          <!-- Selection & Bulk actions bar -->
          <div class="flex items-center gap-2">
            <div v-if="selectedInvoices.size > 0" class="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
              <span class="text-slate-700 font-medium">Đã chọn <strong class="text-indigo-600">{{ selectedInvoices.size }}</strong></span>
              <button 
                class="btn btn-outline btn-xs text-rose-500 border-rose-100 hover:bg-rose-50"
                @click="bulkDelete"
              >
                Xóa tất cả đã chọn
              </button>
            </div>
            <button 
              class="btn btn-outline btn-xs text-slate-600 border-slate-200"
              @click="toggleSelectAll"
            >
              {{ pagedResults.every(d => selectedInvoices.has(d.fileName)) ? 'Bỏ chọn hết' : 'Chọn trang này' }}
            </button>
            
            <!-- Pagination buttons -->
            <div v-if="totalPages > 1" class="flex items-center gap-1.5 ml-2">
              <button 
                class="w-6 h-6 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-50"
                @click="changePage(-1)"
                :disabled="currentPage === 1"
              >
                <span class="material-symbols-rounded text-base">chevron_left</span>
              </button>
              <span class="text-[11px] font-semibold text-slate-700">Trang {{ currentPage }}/{{ totalPages }}</span>
              <button 
                class="w-6 h-6 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-50"
                @click="changePage(1)"
                :disabled="currentPage === totalPages"
              >
                <span class="material-symbols-rounded text-base">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Invoices List Grid -->
        <div v-if="pagedResults.length === 0" class="card bg-white py-16 text-center border border-slate-100 rounded-2xl shadow-sm">
          <span class="material-symbols-rounded text-slate-300 text-5xl">search_off</span>
          <h4 class="text-sm font-semibold text-slate-700 mt-2">Không tìm thấy dữ liệu hóa đơn</h4>
          <p class="text-xs text-slate-400 mt-1">Hãy thử tìm kiếm với MST, Tên Đơn Vị hoặc Ngày Ký khác</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="d in pagedResults" 
            :key="d.fileName"
            class="card bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col relative"
          >
            <!-- Checkbox select floating button -->
            <div class="absolute top-3.5 right-3.5 z-10">
              <input 
                type="checkbox" 
                class="w-4 h-4 cursor-pointer rounded text-indigo-600 focus:ring-indigo-500"
                :checked="selectedInvoices.has(d.fileName)"
                @change="(e) => toggleSelectInvoice(d.fileName, (e.target as HTMLInputElement).checked)"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 space-y-3 pb-3">
              <div class="pr-6 space-y-1">
                <h5 class="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed" :title="d.tenDonVi">
                  {{ d.tenDonVi || '(Chưa xác định đơn vị)' }}
                </h5>
                <span class="inline-block text-[10px] font-semibold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100/50 font-mono">
                  MST: {{ d.mst || '...' }}
                </span>
              </div>

              <div class="text-[11px] text-slate-400 flex items-start gap-1">
                <span class="material-symbols-rounded text-sm text-slate-300 shrink-0">location_on</span>
                <span class="line-clamp-2 leading-normal" :title="d.diaChi">{{ d.diaChi || 'Không có địa chỉ' }}</span>
              </div>

              <!-- Price & Date box breakdown -->
              <div class="grid grid-cols-2 gap-2 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100/50">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[9px] text-slate-400 uppercase tracking-wider">Ngày ký</span>
                  <span class="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span class="material-symbols-rounded text-xs text-slate-400">calendar_today</span>
                    {{ formatDateVN(d.ngayKy) }}
                  </span>
                </div>
                <div class="flex flex-col gap-0.5 text-right border-l border-slate-200/60 pl-2">
                  <span class="text-[9px] text-slate-400 uppercase tracking-wider">Tổng tiền</span>
                  <strong class="text-xs font-bold text-emerald-600">
                    {{ formatCurrency(d.tongTien) }}
                  </strong>
                </div>
              </div>
            </div>

            <!-- Detail quick action bar -->
            <div class="pt-3 border-t border-slate-100 flex items-center gap-1.5 justify-between">
              <button 
                class="btn btn-outline btn-xs flex-1 text-slate-600 border-slate-200 hover:bg-slate-50"
                @click="previewFile(d.linkView)"
              >
                Xem PDF
              </button>
              <button 
                class="btn btn-outline btn-xs px-2 border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200"
                title="Gửi Email"
                @click="openMailModal(d)"
              >
                <span class="material-symbols-rounded text-base">mail</span>
              </button>
              <button 
                class="btn btn-outline btn-xs px-2 border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200"
                title="Thay thế / Xóa"
                @click="deleteInvoice(d.fileName)"
              >
                <span class="material-symbols-rounded text-base">delete</span>
              </button>
              <button 
                class="btn btn-outline btn-xs px-2 border-slate-200 text-slate-400 hover:text-slate-800"
                title="Sao chép liên kết"
                @click="copyLink(d.linkView)"
              >
                <span class="material-symbols-rounded text-base">content_copy</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── LỊCH SỬ HOẠT ĐỘNG TAB ── -->
      <div v-if="activeTab === 'history'" class="space-y-4 animate-fade-in">
        <div class="card bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-100 flex items-center justify-between">
            <h5 class="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <span class="material-symbols-rounded text-indigo-500">list_alt</span>
              Nhật Ký Xử Lý Hệ Thống
            </h5>
            <button 
              class="btn btn-outline btn-xs px-2.5 py-1 flex items-center gap-1 text-slate-600 border-slate-200 hover:bg-slate-50"
              @click="loadHistory"
              :disabled="isLoadingHistory"
            >
              <span class="material-symbols-rounded text-sm" :class="{ 'spin': isLoadingHistory }">refresh</span>
              Làm mới
            </button>
          </div>

          <div class="p-0">
            <div class="overflow-x-auto">
              <table class="report-table text-xs text-slate-700 w-full text-left">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-100">
                    <th class="px-4 py-3 font-semibold text-slate-500">Thời gian ghi nhận</th>
                    <th class="px-4 py-3 font-semibold text-slate-500">Chi tiết hoạt động hệ thống</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="activityLogs.length === 0" class="border-b border-slate-50">
                    <td colspan="2" class="px-4 py-8 text-center text-slate-400">
                      {{ isLoadingHistory ? 'Đang tải nhật ký từ Google Sheets...' : 'Chưa ghi nhận hoạt động nào.' }}
                    </td>
                  </tr>
                  <tr 
                    v-for="(log, idx) in activityLogs" 
                    :key="idx"
                    class="border-b border-slate-50 hover:bg-slate-50/50"
                  >
                    <td class="px-4 py-3 text-slate-400 font-mono">
                      {{ new Date(log[0]).toLocaleString('vi-VN') }}
                    </td>
                    <td class="px-4 py-3 font-medium text-slate-700">
                      {{ log[1] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
    </div>

    <!-- Email Modal popup -->
    <div 
      v-if="showEmailModal" 
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      @click.self="showEmailModal = false"
    >
      <div class="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 animate-scale-in space-y-4">
        <div class="flex justify-center">
          <div class="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
            <span class="material-symbols-rounded text-2xl">mail</span>
          </div>
        </div>
        
        <div class="text-center space-y-1">
          <h3 class="text-base font-bold text-slate-800">Gửi Hóa Đơn VAT</h3>
          <p class="text-xs text-slate-500">{{ emailForm.tenDonVi }}</p>
          <strong class="text-base font-extrabold text-emerald-600 block mt-1">
            {{ formatCurrency(emailForm.tongTien) }}
          </strong>
        </div>

        <div class="form-group space-y-1.5">
          <label class="text-xs font-semibold text-slate-600 block">Email khách hàng</label>
          <input 
            type="email" 
            class="form-input w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-indigo-500 text-sm text-center"
            placeholder="Nhập địa chỉ email của khách hàng..."
            v-model="emailForm.email"
            @keyup.enter="sendEmailInvoice"
          />
        </div>

        <div class="flex gap-3 pt-2">
          <button 
            class="btn btn-outline flex-1 border-slate-200 text-slate-600 rounded-xl py-2"
            @click="showEmailModal = false"
          >
            Hủy
          </button>
          <button 
            class="btn btn-primary flex-1 rounded-xl py-2 flex items-center justify-center gap-1.5"
            @click="sendEmailInvoice"
            :disabled="isSendingEmail"
          >
            <span v-if="isSendingEmail" class="material-symbols-rounded text-base spin">sync</span>
            <span>{{ isSendingEmail ? 'Đang gửi...' : 'Gửi Email' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
