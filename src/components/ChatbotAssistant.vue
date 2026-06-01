<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useCategoriesStore } from '../stores/categories';
import { useSettingsStore } from '../stores/settings';
import { useAppStore } from '../stores/app';
import { showToast } from '../utils';

// Interfaces
interface Message {
  role: 'user' | 'ai';
  text: string;
  ts?: string;
  pending?: boolean;
  pendingAction?: any;
  actionResult?: { ok: boolean; text: string };
  rest?: string;
}

// Stores
const shiftStore = useShiftStore();
const categoriesStore = useCategoriesStore();
const settingsStore = useSettingsStore();
const appStore = useAppStore();

// UI States
const isOpen = ref(false);
const messages = ref<Message[]>([]);
const isProcessing = ref(false);
const inputValue = ref('');
const msgsContainer = ref<HTMLDivElement | null>(null);

const HISTORY_KEY = 'kg_chatbot_history';
const MAX_MESSAGES = 200;

// Computed Properties
const activeShift = computed(() => shiftStore.currentShift);

const hasApiKeys = computed(() => {
  const keys = settingsStore.settings?.vatKeys;
  if (!keys) return false;
  return Object.values(keys).some(arr => arr && arr.length > 0);
});

const chips = computed(() => {
  if (activeShift.value) {
    return [
      { label: 'Tóm tắt ca', icon: 'summarize' },
      { label: 'Thu 500k TM', icon: 'add_circle' },
      { label: 'Chi vật tư 200k', icon: 'remove_circle' }
    ];
  } else {
    return [
      { label: 'Hướng dẫn mở ca', icon: 'help' },
      { label: 'Tìm hóa đơn', icon: 'search' }
    ];
  }
});

// Load / Save history
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      messages.value = JSON.parse(raw);
    }
  } catch (e) {
    messages.value = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.value.slice(-MAX_MESSAGES)));
  } catch (e) {
    console.error('[Chatbot] Save history failed', e);
  }
}

watch(messages, () => {
  saveHistory();
}, { deep: true });

// Auto-scroll to bottom of messages container
async function scrollToBottom() {
  await nextTick();
  if (msgsContainer.value) {
    msgsContainer.value.scrollTop = msgsContainer.value.scrollHeight;
  }
}

// Helper - Clean math formula solver & evaluation
function autoEvaluateTextMoney(text: string): number {
  const hasPlus = text.indexOf('+') !== -1;
  // Clean text from quantities to avoid false matches (e.g. kg, ly, cái, hộp)
  const cleanText = text.replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|l|lít|lit|ly|cái|cai|hộp|hop|chai|lon|bịch|bich|con|quả|qua|trứng|trung|túi|tui|củ|cu|gói|goi|tép|tep|nhánh|nhanh|bó|bo|phần|phan|suất|suat)\b/gi, '');
  
  let sum = 0;
  const matches: Array<{ text: string; val: number }> = [];
  let match: RegExpExecArray | null;

  // Match [number]k or [number]K
  const kRegex = /(\d+(?:[.,]\d+)?)\s*[kK](?![gG\w])/g;
  while ((match = kRegex.exec(cleanText)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    sum += val * 1000;
    matches.push({ text: match[0], val: val * 1000 });
  }

  // Match [number]tr, triệu, M, m
  const trRegex = /(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|M|m)\b/gi;
  while ((match = trRegex.exec(cleanText)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    sum += val * 1000000;
    matches.push({ text: match[0], val: val * 1000000 });
  }

  // Plain numbers
  let remainingText = cleanText;
  matches.forEach(m => {
    remainingText = remainingText.replace(m.text, ' ');
  });

  const plainMoneyRegex = /\b(\d{1,3}(?:\.\d{3})+|\d{4,12})\b/g;
  while ((match = plainMoneyRegex.exec(remainingText)) !== null) {
    const rawNum = match[1].replace(/\./g, '');
    const val = parseInt(rawNum, 10);
    if (val >= 1000) {
      sum += val;
      matches.push({ text: match[0], val });
    }
  }

  // Only return sum if:
  // - There is a '+' symbol
  // - OR we have at least 2 distinct money items and the text doesn't contain mixed 'thu' and 'chi'
  const isMixed = (text.toLowerCase().indexOf('thu') !== -1 && text.toLowerCase().indexOf('chi') !== -1);
  if (hasPlus || (matches.length >= 2 && !isMixed)) {
    return sum;
  }
  return 0;
}

// AI keys & system prompt helper
function getKeys(provider: string): string[] {
  const keys = settingsStore.settings?.vatKeys;
  if (!keys) return [];
  return (keys as any)[provider] || [];
}

function buildPrompt(): string {
  const shift = activeShift.value;
  const base = "Bạn là trợ lý AI cho nhà hàng KING's GRILL. Trả lời ngắn gọn, thân thiện, tiếng Việt. " +
    "Hỗ trợ tra cứu hóa đơn VAT, tìm MST, hướng dẫn sử dụng webapp thu ngân.";

  if (!shift) {
    return base + '\n\nHiện CHƯA MỞ CA thu ngân. ' +
      'Nếu user yêu cầu thêm giao dịch, báo cáo doanh thu, hoặc kiểm kê, ' +
      'hãy từ chối lịch sự và nhắc mở ca trước. KHÔNG tạo JSON action thu/chi.';
  }

  const cats = categoriesStore.categories;
  return base +
    `\n\n💼 CA MỞ: ${shift.cashierName}, Ca ${shift.shiftNumber}, Ngày ${shift.date}` +
    '\nKhi user yêu cầu thao tác, trả về ĐÚNG 1 dòng JSON action ĐẦU TIÊN, rồi text giải thích bên dưới.' +
    '\nActions:' +
    '\n{"action":"add_expense","category":"...","amount":NUMBER,"note":"...","payment":"cash|card|transfer"}' +
    '\n{"action":"add_income","category":"...","amount":NUMBER,"note":"...","payment":"cash|card|transfer"}' +
    '\n{"action":"add_other","type":"income|expense","category":"...","amount":NUMBER,"note":"..."}' +
    `\n{"action":"navigate","view":"dashboard|shift|transactions|cash-count|drink-inventory|revenue|history|vat|settings"}` +
    '\n{"action":"query","type":"shift_summary"}' +
    `\nDANH MỤC THU: ${cats.income.join(', ')}` +
    `\nDANH MỤC CHI: ${cats.expense.join(', ')}` +
    '\nVD: "Chi cọc D1 1tr" → {"action":"add_expense","category":"Trả cọc","amount":1000000,"note":"D1","payment":"cash"}' +
    '\nHỏi chuyện bình thường → trả lời text, KHÔNG JSON.';
}

// AI Call implementation
async function callAI(msg: string): Promise<string> {
  if (!hasApiKeys.value) {
    return '⚠️ Chưa có API key. Vào Hóa đơn VAT → Cấu hình để thêm key.';
  }

  let sys = buildPrompt();
  const calculatedSum = autoEvaluateTextMoney(msg);
  if (calculatedSum > 0) {
    sys += '\n\n⚠️ LƯU Ý TOÁN HỌC: Tin nhắn của user chứa nhiều khoản tiền hoặc phép tính. Hệ thống đã tính toán chính xác tổng số tiền này là: ' + calculatedSum + ' VNĐ. Bạn MUST sử dụng số tiền ' + calculatedSum + ' này cho trường "amount" trong JSON action nếu tạo lệnh thu/chi.';
  }

  const ctx = messages.value.slice(-6).map(m => (m.role === 'user' ? 'User: ' : 'AI: ') + m.text).join('\n');
  const full = ctx ? ctx + '\nUser: ' + msg : msg;

  const errors: string[] = [];
  const providers = ['gemini', 'deepseek', 'groq', 'sambanova', 'cerebras', 'mistral', 'nvidia', 'hf'];

  for (const p of providers) {
    const ks = getKeys(p);
    for (const key of ks) {
      try {
        const response = await _callProvider(p, key, sys, full);
        if (response && response.trim()) {
          console.log(`[Chatbot] OK via ${p}`);
          return response;
        }
      } catch (e: any) {
        const errMsg = `${p}: ${e.message || 'unknown'}`;
        errors.push(errMsg);
        console.warn('[Chatbot]', errMsg);
      }
    }
  }

  console.error('[Chatbot] All failed:', errors);
  return '❌ AI không phản hồi: ' + (errors[0] || 'Không có key') + '. Thử lại sau.';
}

async function _callProvider(prov: string, key: string, sys: string, msg: string): Promise<string> {
  const fetchWithTimeout = (url: string, opts: RequestInit) => {
    return Promise.race([
      fetch(url, opts),
      new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('timeout 25s')), 25000))
    ]);
  };

  if (prov === 'gemini') {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ parts: [{ text: msg }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${res.status}: ${errText.substring(0, 100)}`);
    }
    const j = await res.json();
    const allParts = j.candidates?.[0]?.content?.parts || [];
    let text = '';
    for (let pi = allParts.length - 1; pi >= 0; pi--) {
      if (!allParts[pi].thought && allParts[pi].text) {
        text = allParts[pi].text;
        break;
      }
    }
    if (!text) throw new Error('Empty response');
    return text;
  }

  const eps: Record<string, string> = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    sambanova: 'https://api.sambanova.ai/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
    hf: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1/v1/chat/completions'
  };

  const mods: Record<string, string> = {
    deepseek: 'deepseek-chat',
    groq: 'llama-3.3-70b-versatile',
    sambanova: 'Meta-Llama-3.3-70B-Instruct',
    cerebras: 'llama-3.3-70b',
    mistral: 'mistral-large-latest',
    nvidia: 'meta/llama-3.1-70b-instruct',
    hf: 'mistralai/Mixtral-8x7B-Instruct-v0.1'
  };

  if (!eps[prov]) throw new Error('Unknown provider');

  const res2 = await fetchWithTimeout(eps[prov], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: mods[prov],
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: msg }
      ],
      temperature: 0.7,
      max_tokens: 1024
    })
  });

  if (!res2.ok) {
    const errText2 = await res2.text().catch(() => '');
    throw new Error(`${res2.status}: ${errText2.substring(0, 100)}`);
  }

  const j2 = await res2.json();
  const text2 = j2.choices?.[0]?.message?.content || '';
  if (!text2) throw new Error('Empty response');
  return text2;
}

// Action executor / checker
function parseAction(text: string): { action: any; rest: string } | null {
  if (!text) return null;
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const ln = lines[i].trim();
    if (ln.charAt(0) === '{' && ln.charAt(ln.length - 1) === '}') {
      try {
        const o = JSON.parse(ln);
        if (o.action) {
          return { action: o, rest: lines.slice(i + 1).join('\n').trim() };
        }
      } catch (e) {}
    }
  }

  const m = text.match(/\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/);
  if (m) {
    try {
      const o2 = JSON.parse(m[0]);
      if (o2.action) {
        return { action: o2, rest: text.replace(m[0], '').trim() };
      }
    } catch (e) {}
  }
  return null;
}

async function execAction(act: any): Promise<{ ok: boolean; text: string }> {
  const shift = activeShift.value;
  const viewNames: Record<string, string> = {
    dashboard: 'Tổng quan',
    shift: 'Quản lý ca',
    transactions: 'Giao dịch',
    'cash-count': 'Kiểm kê tiền',
    'drink-inventory': 'Kiểm kho',
    revenue: 'Doanh thu',
    history: 'Lịch sử ca',
    vat: 'Hóa đơn VAT',
    settings: 'Cài đặt'
  };

  if (act.action === 'add_income' || act.action === 'add_expense') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca. Mở ca trước để thêm giao dịch.' };
    if (!act.amount || Number(act.amount) <= 0) return { ok: false, text: '⚠️ Số tiền không hợp lệ (0 hoặc âm).' };
    try {
      shiftStore.addTransaction({
        type: act.action === 'add_income' ? 'income' : 'expense',
        category: act.category || 'Khác',
        amount: Number(act.amount),
        paymentMethod: act.payment || 'cash',
        note: (act.note || '') + ' [AI]'
      });
      // Try calling trigger sync or refresh
      return {
        ok: true,
        text: `✅ Đã thêm ${act.action === 'add_income' ? 'thu' : 'chi'}: "${act.category || ''}" — ${Number(act.amount).toLocaleString('vi-VN')} đ (${act.payment === 'transfer' ? 'CK' : act.payment === 'card' ? 'Thẻ' : 'TM'})`
      };
    } catch (e: any) {
      return { ok: false, text: '❌ ' + e.message };
    }
  }

  if (act.action === 'add_other') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca.' };
    if (!act.amount || Number(act.amount) <= 0) return { ok: false, text: '⚠️ Số tiền không hợp lệ.' };
    try {
      shiftStore.addOtherTransaction({
        type: act.type || 'expense',
        category: act.category || '',
        amount: Number(act.amount),
        note: (act.note || '') + ' [AI]'
      });
      return {
        ok: true,
        text: `✅ Đã thêm: "${act.category || ''}" — ${Number(act.amount).toLocaleString('vi-VN')} đ`
      };
    } catch (e: any) {
      return { ok: false, text: '❌ ' + e.message };
    }
  }

  if (act.action === 'navigate') {
    appStore.navigateTo(act.view);
    return { ok: true, text: '✅ Đã chuyển sang ' + (viewNames[act.view] || act.view) };
  }

  if (act.action === 'query') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca — không có dữ liệu.' };
    const sm = await shiftStore.getShiftSummary(shift);
    if (!sm) return { ok: false, text: '⚠️ Không có dữ liệu tóm tắt ca.' };
    return {
      ok: true,
      text: `📊 Ca ${shift.shiftNumber} (${shift.cashierName}):\n• Tổng thu: ${(sm.totalIncome || 0).toLocaleString('vi-VN')} đ\n• Tổng chi: ${(sm.totalExpense || 0).toLocaleString('vi-VN')} đ\n• Số GD: ${sm.transactionCount || 0}`
    };
  }

  return { ok: false, text: '⚠️ Hành động không được hỗ trợ.' };
}

function isFinancial(act: any): boolean {
  return act.action === 'add_income' || act.action === 'add_expense' || act.action === 'add_other';
}

function describeAction(act: any): string {
  const typeStr = act.action === 'add_income' ? '➕ Thu' : act.action === 'add_expense' ? '➖ Chi' : '📝 Thu chi khác';
  const payStr = act.payment ? ' (' + (act.payment === 'transfer' ? 'CK' : act.payment === 'card' ? 'Thẻ' : 'TM') + ')' : '';
  return `${typeStr}: "${act.category || 'Khác'}" — ${Number(act.amount || 0).toLocaleString('vi-VN')} đ${payStr}${act.note ? '\nGhi chú: ' + act.note : ''}`;
}

// Actions
function toggleChatbot() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    scrollToBottom();
  }
}

function clearChat() {
  messages.value = [];
  showToast('Đã xóa lịch sử chat', 'info');
}

async function handleSend() {
  if (isProcessing.value) return;
  const text = inputValue.value.trim();
  if (!text) return;

  isProcessing.value = true;
  messages.value.push({
    role: 'user',
    text: text,
    ts: new Date().toISOString()
  });
  inputValue.value = '';
  scrollToBottom();

  try {
    const response = await callAI(text);
    const parsed = parseAction(response);
    const msgObj: Message = {
      role: 'ai',
      ts: new Date().toISOString(),
      text: ''
    };

    if (parsed) {
      if (isFinancial(parsed.action)) {
        msgObj.pending = true;
        msgObj.pendingAction = parsed.action;
        msgObj.rest = parsed.rest;
        msgObj.text = describeAction(parsed.action);
      } else {
        const result = await execAction(parsed.action);
        msgObj.actionResult = result;
        msgObj.rest = parsed.rest;
        msgObj.text = result.text + (parsed.rest ? '\n' + parsed.rest : '');
      }
    } else {
      msgObj.text = response;
    }
    messages.value.push(msgObj);
  } catch (e: any) {
    messages.value.push({
      role: 'ai',
      text: '❌ Lỗi: ' + e.message,
      ts: new Date().toISOString()
    });
  } finally {
    isProcessing.value = false;
    scrollToBottom();
  }
}

async function confirmPending(idx: number) {
  const msg = messages.value[idx];
  if (!msg || !msg.pendingAction) return;

  const result = await execAction(msg.pendingAction);
  msg.actionResult = result;
  msg.pending = false;
  msg.pendingAction = null;
  saveHistory();
}

function cancelPending(idx: number) {
  const msg = messages.value[idx];
  if (!msg) return;

  msg.pending = false;
  msg.pendingAction = null;
  msg.actionResult = { ok: false, text: '❌ Đã hủy thao tác.' };
  saveHistory();
}

function handleChipClick(label: string) {
  inputValue.value = label;
  handleSend();
}

// Hotkey listener Alt+/
function handleKeyDown(e: KeyboardEvent) {
  if (e.altKey && e.key === '/') {
    e.preventDefault();
    toggleChatbot();
  }
}

// Format markdown bold text inside responses
function formatMessageText(text: string): string {
  if (!text) return '';
  // Escaped tag protection
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

onMounted(() => {
  loadHistory();
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div>
    <!-- FAB trigger button -->
    <button 
      id="chatbotFab" 
      class="cb-fab" 
      :class="{ 'cb-fab-active': isOpen }" 
      title="AI Assistant (Alt+/)"
      @click="toggleChatbot"
    >
      <span class="material-symbols-rounded" style="font-size:28px">smart_toy</span>
    </button>

    <!-- Chatbot drawer panel -->
    <div id="chatbotPanel" class="cb-panel" :class="{ 'cb-open': isOpen }">
      <!-- Header -->
      <div class="cb-head">
        <div class="cb-head-l">
          <span class="material-symbols-rounded" style="color: var(--primary, #2563eb); font-size: 22px">smart_toy</span>
          <div>
            <div class="cb-title">AI Assistant</div>
            <div class="cb-sub">
              {{ activeShift ? `Ca ${activeShift.shiftNumber} — ${activeShift.cashierName}` : '📄 Hỗ trợ hóa đơn' }}
            </div>
          </div>
        </div>
        <div class="flex gap-1">
          <button class="cb-hbtn" title="Xóa lịch sử chat" @click="clearChat">
            <span class="material-symbols-rounded" style="font-size: 18px">delete_sweep</span>
          </button>
          <button class="cb-hbtn" title="Đóng" @click="toggleChatbot">
            <span class="material-symbols-rounded" style="font-size: 18px">close</span>
          </button>
        </div>
      </div>

      <!-- Messages container -->
      <div ref="msgsContainer" class="cb-msgs">
        <!-- Default Welcome Message -->
        <div class="cb-msg cb-ai">
          <div class="cb-name">🤖 AI Assistant</div>
          <p v-if="activeShift">
            Ca {{ activeShift.shiftNumber }} đang mở! Tôi có thể giúp thêm nhanh phiếu thu/chi, truy vấn thông tin tóm tắt doanh thu, hoặc mở các tiện ích khác.
          </p>
          <p v-else>
            Xin chào! Tôi có thể hỗ trợ tra cứu hóa đơn VAT hoặc tìm kiếm mã số thuế doanh nghiệp. Vui lòng mở ca làm việc để thực hiện đầy đủ các chức năng.
          </p>
        </div>

        <!-- Render Messages -->
        <template v-for="(m, i) in messages" :key="i">
          <div v-if="m.role === 'user'" class="cb-msg cb-user">
            {{ m.text }}
          </div>
          <div v-else class="cb-msg cb-ai">
            <div class="cb-name">🤖 AI Assistant</div>
            
            <!-- Pending Confirm Dialog -->
            <div v-if="m.pending" class="cb-action cb-action-pending">
              <span class="font-bold">📋 Xác nhận thao tác:</span>
              <p class="mt-1" v-html="formatMessageText(m.text)"></p>
              <div class="cb-confirm-row">
                <button class="cb-btn-yes" @click="confirmPending(i)">✅ Xác nhận</button>
                <button class="cb-btn-no" @click="cancelPending(i)">❌ Hủy</button>
              </div>
            </div>

            <!-- Executed Action Result -->
            <div v-else-if="m.actionResult" class="cb-action" :class="m.actionResult.ok ? 'cb-action-ok' : 'cb-action-warn'">
              {{ m.actionResult.text }}
            </div>

            <!-- Message text response -->
            <div v-if="!m.pending" :style="{ marginTop: m.actionResult ? '6px' : '0px' }" v-html="formatMessageText(m.rest || m.text)"></div>
          </div>
        </template>

        <!-- Loading indicator -->
        <div v-if="isProcessing" class="cb-msg cb-ai cb-loading">
          <span class="material-symbols-rounded spin-icon" style="font-size: 16px; display: inline-block; vertical-align: middle;">sync</span>
          Đang suy nghĩ...
        </div>
      </div>

      <!-- Warnings/API Keys notice -->
      <div v-if="!hasApiKeys" class="cb-warn">
        ⚠️ Chưa cấu hình API Key. 
        <a href="#vat" class="font-bold underline text-rose-700 ml-1" @click="isOpen = false">Nhấn vào đây để thiết lập</a>
      </div>

      <!-- Quick Suggestion Chips -->
      <div class="cb-chips">
        <button 
          v-for="(c, ci) in chips" 
          :key="ci" 
          class="cb-chip" 
          @click="handleChipClick(c.label)"
        >
          <span class="material-symbols-rounded" style="font-size: 14px">{{ c.icon }}</span>
          {{ c.label }}
        </button>
      </div>

      <!-- Footer input form -->
      <div class="cb-foot">
        <input 
          v-model="inputValue" 
          type="text" 
          class="form-input flex-1 p-2 rounded-xl border border-slate-200" 
          :placeholder="activeShift ? 'Nhập lệnh hoặc đặt câu hỏi...' : 'Hỏi về hóa đơn VAT, MST...'"
          autocomplete="off"
          :disabled="isProcessing"
          @keydown.enter="handleSend"
        />
        <button 
          class="btn btn-primary cb-send" 
          :disabled="isProcessing || !inputValue.trim() || !hasApiKeys"
          @click="handleSend"
        >
          <span class="material-symbols-rounded">send</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spin-icon {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
