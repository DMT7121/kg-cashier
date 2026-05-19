/* ── Chatbot AI — Global Floating Assistant ──
   2 modes: Default (invoice help) + Cashier (when shift is open)
   ── */
import { getCurrentShift, addTransaction, addOtherTransaction, getCategories, getShiftSummary } from '../store.js';
import { formatCurrency, showToast } from '../utils.js';

var _isOpen = false;
var _messages = [];
var _isProcessing = false;
var _pendingAction = null;
var HISTORY_KEY = 'kg_chatbot_history';
var MAX_MESSAGES = 200;

import { getSettings } from '../store.js';

// ── AI Keys (shared with VAT module) ──
function _getKeys(p) { 
  const settings = getSettings();
  if (!settings.vatKeys) return [];
  return settings.vatKeys[p] || [];
}

function _getProvider() {
  var ps = ['gemini','deepseek','groq','sambanova','cerebras','mistral','nvidia','hf'];
  for (var i = 0; i < ps.length; i++) { if (_getKeys(ps[i]).length) return ps[i]; }
  return null;
}

// ── System Prompt (2-mode) ──
function _buildPrompt() {
  var shift = getCurrentShift();
  var base = 'Bạn là trợ lý AI cho nhà hàng KING\'s GRILL. Trả lời ngắn gọn, thân thiện, tiếng Việt. ' +
    'Hỗ trợ tra cứu hóa đơn VAT, tìm MST, hướng dẫn sử dụng webapp thu ngân.';

  if (!shift) {
    return base + '\n\nHiện CHƯA MỞ CA thu ngân. ' +
      'Nếu user yêu cầu thêm giao dịch, báo cáo doanh thu, hoặc kiểm kê, ' +
      'hãy từ chối lịch sự và nhắc mở ca trước (Alt+2). KHÔNG tạo JSON action thu/chi.';
  }

  var cats = getCategories();
  return base +
    '\n\n💼 CA MỞ: ' + shift.cashierName + ', Ca ' + shift.shiftNumber + ', Ngày ' + shift.date +
    '\nKhi user yêu cầu thao tác, trả về ĐÚNG 1 dòng JSON action ĐẦU TIÊN, rồi text giải thích bên dưới.' +
    '\nActions:' +
    '\n{"action":"add_expense","category":"...","amount":NUMBER,"note":"...","payment":"cash|card|transfer"}' +
    '\n{"action":"add_income","category":"...","amount":NUMBER,"note":"...","payment":"cash|card|transfer"}' +
    '\n{"action":"add_other","type":"income|expense","category":"...","amount":NUMBER,"note":"..."}' +
    '\n{"action":"navigate","view":"dashboard|shift|transactions|cash-count|drink-inventory|revenue|history|vat|settings"}' +
    '\n{"action":"query","type":"shift_summary"}' +
    '\nDANH MỤC THU: ' + cats.income.join(', ') +
    '\nDANH MỤC CHI: ' + cats.expense.join(', ') +
    '\nVD: "Chi cọc D1 1tr" → {"action":"add_expense","category":"Trả cọc","amount":1000000,"note":"D1","payment":"cash"}' +
    '\nHỏi chuyện bình thường → trả lời text, KHÔNG JSON.';
}

// ── AI Call ──
async function _callAI(msg) {
  var provider = _getProvider();
  if (!provider) return '⚠️ Chưa có API key. Vào Hóa đơn VAT → Cấu hình để thêm key.';

  var sys = _buildPrompt();
  var ctx = _messages.slice(-6).map(function(m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + m.text; }).join('\n');
  var full = ctx ? ctx + '\nUser: ' + msg : msg;

  var errors = [];
  // Try all providers in order
  var all = ['gemini','deepseek','groq','sambanova','cerebras','mistral','nvidia','hf'];
  for (var p = 0; p < all.length; p++) {
    var ks = _getKeys(all[p]);
    for (var k = 0; k < ks.length; k++) {
      try {
        var r = await _call(all[p], ks[k], sys, full);
        if (r && r.trim()) { console.log('[Chatbot] OK via ' + all[p]); return r; }
      } catch (e) {
        var errMsg = all[p] + ': ' + (e.message || 'unknown');
        errors.push(errMsg);
        console.warn('[Chatbot]', errMsg);
      }
    }
  }
  console.error('[Chatbot] All failed:', errors);
  return '❌ AI không phản hồi: ' + (errors[0] || 'Không có key') + '. Thử lại sau.';
}

async function _call(prov, key, sys, msg) {
  if (prov === 'gemini') {
    var res = await _ft('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: msg }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } })
    });
    if (!res.ok) { var errText = await res.text().catch(function() { return ''; }); throw new Error(res.status + ': ' + errText.substring(0, 100)); }
    var j = await res.json();
    var allParts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    var text = '';
    for (var pi = allParts.length - 1; pi >= 0; pi--) {
      if (!allParts[pi].thought && allParts[pi].text) { text = allParts[pi].text; break; }
    }
    if (!text) throw new Error('Empty response');
    return text;
  }
  var eps = { deepseek:'https://api.deepseek.com/v1/chat/completions', groq:'https://api.groq.com/openai/v1/chat/completions', sambanova:'https://api.sambanova.ai/v1/chat/completions', cerebras:'https://api.cerebras.ai/v1/chat/completions', mistral:'https://api.mistral.ai/v1/chat/completions', nvidia:'https://integrate.api.nvidia.com/v1/chat/completions', hf:'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1/v1/chat/completions' };
  var mods = { deepseek:'deepseek-chat', groq:'llama-3.3-70b-versatile', sambanova:'Meta-Llama-3.3-70B-Instruct', cerebras:'llama-3.3-70b', mistral:'mistral-large-latest', nvidia:'meta/llama-3.1-70b-instruct', hf:'mistralai/Mixtral-8x7B-Instruct-v0.1' };
  if (!eps[prov]) throw new Error('unknown provider');
  var res2 = await _ft(eps[prov], {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: mods[prov], messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }], temperature: 0.7, max_tokens: 1024 })
  });
  if (!res2.ok) { var errText2 = await res2.text().catch(function() { return ''; }); throw new Error(res2.status + ': ' + errText2.substring(0, 100)); }
  var j2 = await res2.json();
  var text2 = j2.choices && j2.choices[0] && j2.choices[0].message ? j2.choices[0].message.content : '';
  if (!text2) throw new Error('Empty response');
  return text2;
}

function _ft(url, opts) {
  return Promise.race([fetch(url, opts), new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout 25s')); }, 25000); })]);
}

// ── Action Parser + Executor ──
function _parseAction(text) {
  if (!text) return null;
  var lines = text.split('\n');
  for (var i = 0; i < Math.min(lines.length, 5); i++) {
    var ln = lines[i].trim();
    if (ln.charAt(0) === '{' && ln.charAt(ln.length - 1) === '}') {
      try { var o = JSON.parse(ln); if (o.action) return { action: o, rest: lines.slice(i + 1).join('\n').trim() }; } catch (e) {}
    }
  }
  var m = text.match(/\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/);
  if (m) { try { var o2 = JSON.parse(m[0]); if (o2.action) return { action: o2, rest: text.replace(m[0], '').trim() }; } catch (e) {} }
  return null;
}

function _exec(act) {
  var shift = getCurrentShift();
  var viewNames = { dashboard:'Tổng quan', shift:'Quản lý ca', transactions:'Giao dịch', 'cash-count':'Kiểm kê tiền', 'drink-inventory':'Kiểm kho', revenue:'Doanh thu', history:'Lịch sử ca', vat:'Hóa đơn VAT', settings:'Cài đặt' };

  if (act.action === 'add_income' || act.action === 'add_expense') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca. Nhấn Alt+2 để mở ca trước.' };
    if (!act.amount || Number(act.amount) <= 0) return { ok: false, text: '⚠️ Số tiền không hợp lệ (0 hoặc âm).' };
    try {
      addTransaction({ type: act.action === 'add_income' ? 'income' : 'expense', category: act.category || 'Khác', amount: Number(act.amount), paymentMethod: act.payment || 'cash', note: (act.note || '') + ' [AI]' });
      window.refreshView && window.refreshView();
      return { ok: true, text: '✅ Đã thêm ' + (act.action === 'add_income' ? 'thu' : 'chi') + ': "' + (act.category || '') + '" — ' + formatCurrency(act.amount) + ' (' + ({ transfer:'CK', card:'Thẻ', cash:'TM' }[act.payment] || 'TM') + ')' };
    } catch (e) { return { ok: false, text: '❌ ' + e.message }; }
  }
  if (act.action === 'add_other') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca.' };
    if (!act.amount || Number(act.amount) <= 0) return { ok: false, text: '⚠️ Số tiền không hợp lệ.' };
    try {
      addOtherTransaction({ type: act.type || 'expense', category: act.category || '', amount: Number(act.amount), note: (act.note || '') + ' [AI]' });
      window.refreshView && window.refreshView();
      return { ok: true, text: '✅ Đã thêm: "' + (act.category || '') + '" — ' + formatCurrency(act.amount) };
    } catch (e) { return { ok: false, text: '❌ ' + e.message }; }
  }
  if (act.action === 'navigate') {
    window.navigateTo && window.navigateTo(act.view);
    return { ok: true, text: '✅ Đã chuyển sang ' + (viewNames[act.view] || act.view) };
  }
  if (act.action === 'query') {
    if (!shift) return { ok: false, text: '⚠️ Chưa mở ca — không có dữ liệu.' };
    var sm = getShiftSummary(shift);
    return { ok: true, text: '📊 Ca ' + shift.shiftNumber + ' (' + shift.cashierName + '):\n• Tổng thu: ' + formatCurrency(sm.totalIncome || 0) + '\n• Tổng chi: ' + formatCurrency(sm.totalExpense || 0) + '\n• Số GD: ' + (sm.transactionCount || 0) };
  }
  return null;
}

// ── Helpers ──
function _isFinancial(act) { return act.action === 'add_income' || act.action === 'add_expense' || act.action === 'add_other'; }
function _describeAction(act) {
  var t = act.action === 'add_income' ? '➕ Thu' : act.action === 'add_expense' ? '➖ Chi' : '📝 Thu chi khác';
  var p = act.payment ? ' (' + ({cash:'TM',card:'Thẻ',transfer:'CK'}[act.payment] || 'TM') + ')' : '';
  return t + ': "' + (act.category || 'Khác') + '" — ' + formatCurrency(act.amount || 0) + p + (act.note ? '\nGhi chú: ' + act.note : '');
}

// ── Persistence ──
function _save() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(_messages.slice(-MAX_MESSAGES))); } catch (e) {} }
function _load() { try { _messages = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { _messages = []; } }

// ── HTML Helpers ──
function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _fmt(s) { return _esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }

// ── Render ──
function _renderMsgs() {
  var el = document.getElementById('cbMsgs');
  if (!el) return;
  var shift = getCurrentShift();
  var html = '<div class="cb-msg cb-ai"><div class="cb-name">🤖 AI Assistant</div>' +
    (shift ? 'Ca ' + shift.shiftNumber + ' đang mở! Tôi giúp thêm thu/chi, báo cáo, tra cứu hóa đơn.' :
      'Xin chào! Tôi giúp tra cứu hóa đơn VAT, tìm MST. Mở ca để dùng đầy đủ chức năng.') + '</div>';
  var prevDate = '';
  for (var i = 0; i < _messages.length; i++) {
    var m = _messages[i];
    var md = m.ts ? m.ts.substring(0, 10) : '';
    if (md && md !== prevDate) { var dp = md.split('-'); html += '<div class="cb-date-div">── ' + dp[2] + '/' + dp[1] + '/' + dp[0] + ' ──</div>'; prevDate = md; }
    if (m.role === 'user') {
      html += '<div class="cb-msg cb-user">' + _esc(m.text) + '</div>';
    } else {
      html += '<div class="cb-msg cb-ai">';
      if (m.pending) {
        html += '<div class="cb-action cb-action-pending">📋 Xác nhận thao tác:<br>' + _esc(m.text).replace(/\n/g, '<br>') + '</div>';
        html += '<div class="cb-confirm-row"><button class="cb-btn-yes" data-cb-confirm="' + i + '">✅ Xác nhận</button><button class="cb-btn-no" data-cb-cancel="' + i + '">❌ Hủy</button></div>';
      } else if (m.actionResult) {
        html += '<div class="cb-action ' + (m.actionResult.ok ? 'cb-action-ok' : 'cb-action-warn') + '">' + _esc(m.actionResult.text) + '</div>';
        if (m.rest) html += '<div style="margin-top:6px">' + _fmt(m.rest) + '</div>';
      } else { html += _fmt(m.text); }
      html += '</div>';
    }
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
  el.querySelectorAll('[data-cb-confirm]').forEach(function(b) { b.addEventListener('click', function() { _confirmPending(Number(b.dataset.cbConfirm)); }); });
  el.querySelectorAll('[data-cb-cancel]').forEach(function(b) { b.addEventListener('click', function() { _cancelPending(Number(b.dataset.cbCancel)); }); });
}

function _confirmPending(idx) {
  var msg = _messages[idx]; if (!msg || !msg.pendingAction) return;
  msg.actionResult = _exec(msg.pendingAction); msg.pending = false; msg.pendingAction = null;
  _save(); _renderMsgs();
}
function _cancelPending(idx) {
  var msg = _messages[idx]; if (!msg) return;
  msg.pending = false; msg.pendingAction = null; msg.actionResult = { ok: false, text: '❌ Đã hủy thao tác.' };
  _save(); _renderMsgs();
}

function _chips() {
  var shift = getCurrentShift();
  var cs = shift
    ? [['Tóm tắt ca','summarize'],['Thu 500k TM','add_circle'],['Chi vật tư 200k','remove_circle']]
    : [['Hướng dẫn mở ca','help'],['Tìm hóa đơn','search']];
  return cs.map(function(c) { return '<button class="cb-chip" data-chip="' + c[0] + '"><span class="material-symbols-rounded" style="font-size:14px">' + c[1] + '</span> ' + c[0] + '</button>'; }).join('');
}

function _renderPanel() {
  var panel = document.getElementById('chatbotPanel');
  if (!panel) return;
  var shift = getCurrentShift();
  var prov = _getProvider();

  panel.innerHTML =
    '<div class="cb-head">' +
      '<div class="cb-head-l"><span class="material-symbols-rounded" style="color:var(--primary);font-size:22px">smart_toy</span><div><div class="cb-title">AI Assistant</div><div class="cb-sub">' +
      (shift ? '💼 Ca ' + shift.shiftNumber + ' — ' + shift.cashierName : '📄 Hỗ trợ hóa đơn') +
      '</div></div></div>' +
      '<div><button class="cb-hbtn" id="cbClear" title="Xóa chat"><span class="material-symbols-rounded" style="font-size:18px">delete_sweep</span></button>' +
      '<button class="cb-hbtn" id="cbClose" title="Đóng"><span class="material-symbols-rounded" style="font-size:18px">close</span></button></div>' +
    '</div>' +
    '<div class="cb-msgs" id="cbMsgs"></div>' +
    (!prov ? '<div class="cb-warn">⚠️ Chưa có API key. <a href="#" id="cbGoVat">Cấu hình</a></div>' : '') +
    '<div class="cb-chips" id="cbChips">' + _chips() + '</div>' +
    '<div class="cb-foot"><input type="text" id="cbIn" class="form-input" placeholder="' +
    (shift ? 'Nhập lệnh hoặc hỏi...' : 'Hỏi về hóa đơn...') + '" autocomplete="off">' +
    '<button class="btn btn-primary cb-send" id="cbSend"' + (!prov ? ' disabled' : '') + '><span class="material-symbols-rounded">send</span></button></div>';

  setTimeout(function() {
    document.getElementById('cbClose').addEventListener('click', toggleChatbot);
    document.getElementById('cbClear').addEventListener('click', function() { _messages = []; _save(); _renderMsgs(); showToast('Đã xóa lịch sử chat', 'info'); });
    document.getElementById('cbSend').addEventListener('click', _send);
    var inp = document.getElementById('cbIn');
    if (inp) { inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); _send(); } }); if (_isOpen) inp.focus(); }
    var goVat = document.getElementById('cbGoVat');
    if (goVat) goVat.addEventListener('click', function(e) { e.preventDefault(); window.navigateTo && window.navigateTo('vat'); });
    document.querySelectorAll('[data-chip]').forEach(function(el) {
      el.addEventListener('click', function() { var inp2 = document.getElementById('cbIn'); if (inp2) { inp2.value = el.dataset.chip; _send(); } });
    });
    _renderMsgs();
  }, 50);
}

// ── Send ──
async function _send() {
  var inp = document.getElementById('cbIn');
  if (!inp || _isProcessing) return;
  var text = inp.value.trim();
  if (!text) return;

  _isProcessing = true;
  _messages.push({ role: 'user', text: text, ts: new Date().toISOString() });
  inp.value = '';
  _renderMsgs();

  // Loading indicator
  var el = document.getElementById('cbMsgs');
  var lid = 'cbl' + Date.now();
  if (el) { el.innerHTML += '<div id="' + lid + '" class="cb-msg cb-ai cb-loading"><span class="material-symbols-rounded spin-icon" style="font-size:16px">sync</span> Đang suy nghĩ...</div>'; el.scrollTop = el.scrollHeight; }

  try {
    var resp = await _callAI(text);
    var parsed = _parseAction(resp);
    var msgObj = { role: 'ai', ts: new Date().toISOString() };

    if (parsed) {
      if (_isFinancial(parsed.action)) {
        msgObj.pending = true; msgObj.pendingAction = parsed.action;
        msgObj.rest = parsed.rest; msgObj.text = _describeAction(parsed.action);
      } else {
        var result = _exec(parsed.action);
        if (result) { msgObj.actionResult = result; msgObj.rest = parsed.rest; msgObj.text = result.text + (parsed.rest ? '\n' + parsed.rest : ''); }
        else { msgObj.text = resp; }
      }
    } else {
      msgObj.text = resp;
    }
    _messages.push(msgObj);
  } catch (e) {
    _messages.push({ role: 'ai', text: '❌ Lỗi: ' + e.message, ts: new Date().toISOString() });
  }

  _isProcessing = false;
  var loadEl = document.getElementById(lid);
  if (loadEl) loadEl.remove();
  _save();
  _renderMsgs();

  // Update chips (shift state may have changed)
  var chipsEl = document.getElementById('cbChips');
  if (chipsEl) {
    chipsEl.innerHTML = _chips();
    document.querySelectorAll('[data-chip]').forEach(function(el) {
      el.addEventListener('click', function() { var inp2 = document.getElementById('cbIn'); if (inp2) { inp2.value = el.dataset.chip; _send(); } });
    });
  }
}

// ── Public API ──
export function toggleChatbot() {
  _isOpen = !_isOpen;
  var panel = document.getElementById('chatbotPanel');
  var fab = document.getElementById('chatbotFab');
  if (panel) panel.classList.toggle('cb-open', _isOpen);
  if (fab) fab.classList.toggle('cb-fab-active', _isOpen);
  if (_isOpen) {
    _renderPanel();
    setTimeout(function() { var inp = document.getElementById('cbIn'); if (inp) inp.focus(); }, 100);
  }
}

export function initChatbot() {
  _load();
  // Create FAB + Panel in DOM
  var fab = document.createElement('button');
  fab.id = 'chatbotFab';
  fab.className = 'cb-fab';
  fab.title = 'AI Assistant (Alt+/)';
  fab.innerHTML = '<span class="material-symbols-rounded" style="font-size:28px">smart_toy</span>';
  fab.addEventListener('click', toggleChatbot);
  document.body.appendChild(fab);

  var panel = document.createElement('div');
  panel.id = 'chatbotPanel';
  panel.className = 'cb-panel';
  document.body.appendChild(panel);
}

export function refreshChatbot() {
  if (!_isOpen || _isProcessing) return;
  var sub = document.querySelector('.cb-sub');
  if (sub) { var s = getCurrentShift(); sub.textContent = s ? '💼 Ca ' + s.shiftNumber + ' — ' + s.cashierName : '📄 Hỗ trợ hóa đơn'; }
}

export function destroy() {
  // Clean up any loose event listeners if needed
}
