import { showConfirm, showModal, hideModal, showToast } from '../utils.js';

let _activeTab = 'upload';
const _tabs = [
  { key: 'upload', icon: 'cloud_upload', label: 'Upload Hóa Đơn' },
  { key: 'search', icon: 'search', label: 'Tra Cứu & Kho' },
  { key: 'history', icon: 'history', label: 'Lịch Sử' },
  { key: 'settings', icon: 'settings', label: 'Cấu hình & Admin' }
];

// --- STATE ---
let uploadQueue = [];
let aiScanQueue = [];
let activeScans = 0;
const MAX_CONCURRENT_SCANS = 8; 

let currentSearchData = [];
let currentPage = 1;
const itemsPerPage = 30;
let searchDebounceTimer;
let selectedInvoices = new Set();

const API_URL = "https://script.google.com/macros/s/AKfycbw7MOPPDT0jzBRd_RrTPKAMeY1hNjGMEdilW9-1n8wHV59YipjHfaNlb71Txc9P6-es/exec"; 

// Keys
let geminiKeys = JSON.parse(localStorage.getItem("vat_master_gemini_keys") || "[]");
let groqKeys = JSON.parse(localStorage.getItem("vat_master_groq_keys") || "[]");
let hfKeys = JSON.parse(localStorage.getItem("vat_master_hf_keys") || "[]");
let cerebrasKeys = JSON.parse(localStorage.getItem("vat_master_cerebras_keys") || "[]");
let sambanovaKeys = JSON.parse(localStorage.getItem("vat_master_sambanova_keys") || "[]");
let deepseekKeys = JSON.parse(localStorage.getItem("vat_master_deepseek_keys") || "[]");
let mistralKeys = JSON.parse(localStorage.getItem("vat_master_mistral_keys") || "[]");
let nvidiaKeys = JSON.parse(localStorage.getItem("vat_master_nvidia_keys") || "[]");

let idx = { gemini: 0, groq: 0, hf: 0, cerebras: 0, sambanova: 0, deepseek: 0, mistral: 0, nvidia: 0 };
let currentPersona = 'gemini'; 
let availablePersonas = [];
let driveCount = '...';

// --- UTILS ---
function formatCurrencyVN(amount) {
    if (!amount) return '0đ';
    let str = String(amount);
    str = str.replace(/[.,]0+$/, ''); 
    const num = str.replace(/[^0-9]/g, '');
    if (!num) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
}

function formatDateVN(dateInput) {
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

function parseDate(dateStr) {
    if (!dateStr) return 0;
    if (dateStr.includes('T') || dateStr.includes('-')) return new Date(dateStr).getTime();
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    return 0;
}

async function callAPI(d) { 
    try { 
        return await (await fetch(API_URL, {method:'POST',body:JSON.stringify(d)})).json(); 
    } catch(e) { 
        return {status:'error',message:'Lỗi mạng'}; 
    } 
}

function getDriveCount() {
    callAPI({action: 'get_drive_count'}).then(res => {
         if (res.status === 'success') {
             driveCount = res.total;
             const el = document.getElementById('vat-drive-count');
             if(el) el.innerText = driveCount;
         }
    });
}

function determineInitialPersona() {
    availablePersonas = [];
    if (geminiKeys.length) availablePersonas.push('gemini');
    if (deepseekKeys.length) availablePersonas.push('deepseek');
    if (groqKeys.length) availablePersonas.push('groq');
    if (sambanovaKeys.length) availablePersonas.push('sambanova');
    if (cerebrasKeys.length) availablePersonas.push('cerebras');
    if (mistralKeys.length) availablePersonas.push('mistral');
    if (nvidiaKeys.length) availablePersonas.push('nvidia');
    if (hfKeys.length) availablePersonas.push('hf');

    if (!availablePersonas.length) currentPersona = 'gemini'; 
    else if (!availablePersonas.includes(currentPersona)) currentPersona = availablePersonas[0];
    
    updateChatSubtitle();
}

function getPersonaDisplayName(p) { return { 'gemini': 'Giáo Sư Biết Tuốt', 'deepseek': 'Thám Tử Tư', 'groq': 'Thánh Tốc Độ', 'sambanova': 'Tia Chớp Đen', 'cerebras': 'Cỗ Máy Hủy Diệt', 'mistral': 'Pháp Sư Âu Châu', 'nvidia': 'Siêu Máy Tính', 'hf': 'Bà Hàng Xóm' }[p] || 'AI'; }

function updateChatSubtitle() {
    const el = document.getElementById('chat-subtitle');
    if(!el) return;
    if (availablePersonas.length === 0) { 
        el.innerText = 'Chưa có nhân viên (Thiếu Key)'; 
        el.style.color = 'var(--danger)'; 
    } else { 
        el.innerText = `${getPersonaDisplayName(currentPersona)} đang trực ban`; 
        el.style.color = 'var(--success)'; 
    }
}

// --- RENDER VIEWS ---

function _renderTabs() {
  const hasKeys = (geminiKeys.length + groqKeys.length + hfKeys.length + cerebrasKeys.length + sambanovaKeys.length + deepseekKeys.length + mistralKeys.length + nvidiaKeys.length) > 0;
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <div class="settings-tabs" style="margin-bottom:0;">
            ${_tabs.map(t => `
            <button class="settings-tab ${_activeTab === t.key ? 'active' : ''}" data-vattab="${t.key}">
                <span class="material-symbols-rounded">${t.icon}</span>
                <span>${t.label}</span>
                ${t.key === 'settings' ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hasKeys ? 'var(--success)' : 'var(--danger)'};margin-left:4px;"></span>` : ''}
            </button>
            `).join('')}
        </div>
        <div style="font-size:12px; color:var(--text-muted); background:var(--bg-card); padding:8px 12px; border-radius:var(--radius); border:1px solid var(--border);">
            Đang có <strong id="vat-drive-count" style="color:var(--primary);">${driveCount}</strong> file trên Drive
        </div>
    </div>
  `;
}

function _renderUpload() {
    return `
    <div class="card animate-fade-in" style="margin-bottom:20px;">
        <div class="card-header" style="background:linear-gradient(90deg, rgba(59,130,246,0.1), transparent); border-bottom:1px solid rgba(59,130,246,0.2);">
            <h3 style="color:var(--info); display:flex; align-items:center; gap:8px;">
                <span class="material-symbols-rounded">psychology</span> Hệ Thống Scan Đa Nhân Cách
            </h3>
        </div>
        <div class="card-body">
            <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">Hỗ trợ 8 dòng AI xử lý song song. ${geminiKeys.length ? '<span style="color:var(--success); font-weight:600;">🔬 Gemini Vision: ON</span> — Đọc PDF bằng mắt, chính xác cao.' : '<span style="color:var(--warning);">⚠️ Chưa có Gemini key — đang dùng pdf.js (độ chính xác thấp hơn)</span>'}</p>
            <div id="vat-drop-zone" style="border: 2px dashed var(--border); border-radius: var(--radius); padding: 40px; text-align: center; cursor: pointer; transition: all .3s; position: relative;">
                <input type="file" id="vat-file-input" style="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="application/pdf" multiple style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--info); margin-bottom: 12px;">cloud_upload</span>
                <h3 style="font-size: 16px; margin-bottom: 8px;">Kéo thả file PDF vào đây</h3>
                <p style="font-size: 13px; color: var(--text-muted);">Biệt đội AI đang chờ lệnh!</p>
            </div>
            
            <div id="vat-upload-list" style="margin-top: 20px; display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    </div>
    `;
}

function _renderSearch() {
    return `
    <div class="animate-fade-in">
        <div class="card" style="margin-bottom:20px;">
            <div class="card-body" style="display:flex; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; position:relative;">
                    <span class="material-symbols-rounded" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted);">search</span>
                    <input type="text" id="vat-search-input" placeholder="Nhập MST, Tên, Tiền hoặc Ngày (DD/MM)..." class="form-input" style="padding-left:40px;">
                </div>
                <button class="btn btn-primary" id="vat-btn-search">
                    <span class="material-symbols-rounded">filter_alt</span> Tìm Kiếm
                </button>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:13px; color:var(--text-muted);">
            <div style="display:flex; align-items:center; gap:12px;">
                <span>Đang hiển thị <strong id="vat-display-count" style="color:var(--text);">0</strong> kết quả</span>
                <button class="btn btn-outline btn-sm" onclick="window.vatSyncData()" style="color:var(--info); border-color:var(--info); padding: 4px 8px;"><span class="material-symbols-rounded" style="font-size:16px;">sync</span> Đồng bộ</button>
                <button class="btn btn-outline btn-sm" onclick="window.vatRescanAll()" id="vat-btn-rescan" style="color:var(--warning); border-color:var(--warning); padding: 4px 8px;" ${!geminiKeys.length ? 'disabled title="Cần Gemini key"' : ''}><span class="material-symbols-rounded" style="font-size:16px;">auto_fix_high</span> Re-Scan AI</button>
            </div>
            <div id="vat-bulk-actions" style="display:none; align-items:center; gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="window.vatSelectAllToggle()" id="vat-btn-select-all">Chọn tất cả</button>
                <button class="btn btn-outline btn-sm" onclick="window.vatBulkDelete()" id="vat-btn-bulk-delete" style="color:var(--danger); border-color:var(--danger);">Xóa (<span id="vat-bulk-count">0</span>)</button>
            </div>
            <div id="vat-pagination-controls" style="display:none; align-items:center; gap:8px;">
                <button class="btn-icon border" id="vat-btn-prev"><span class="material-symbols-rounded">chevron_left</span></button>
                <span id="vat-page-info">Trang 1</span>
                <button class="btn-icon border" id="vat-btn-next"><span class="material-symbols-rounded">chevron_right</span></button>
            </div>
        </div>

        <div id="vat-search-results" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
        </div>
    </div>
    `;
}

function _renderChat() {
    return `
    <div class="card animate-fade-in" style="height: calc(100vh - 180px); display:flex; flex-direction:column;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:36px; height:36px; border-radius:50%; background:var(--primary-glow); display:flex; align-items:center; justify-content:center; color:var(--primary);">
                    <span class="material-symbols-rounded">auto_awesome</span>
                </div>
                <div>
                    <h3 style="margin:0; font-size:15px;">Chatbot Lầy Lội</h3>
                    <p id="chat-subtitle" style="margin:0; font-size:11px; color:var(--success);">AI đang trực ban</p>
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-outline btn-sm" id="vat-btn-switch-persona">
                    <span class="material-symbols-rounded" style="font-size:16px;">swap_horiz</span> Đổi Trợ Lý
                </button>
                <button class="btn btn-outline btn-sm" id="vat-btn-clear-chat" style="color:var(--danger); border-color:transparent;">Xóa</button>
            </div>
        </div>
        <div id="vat-chat-messages" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px; background:var(--bg);">
            <div style="align-self:flex-start; background:var(--bg-secondary); border:1px solid var(--border); padding:10px 14px; border-radius:12px; border-bottom-left-radius:2px; max-width:80%; font-size:13px;">
                <div style="font-size:10px; font-weight:700; color:var(--primary); margin-bottom:4px; text-transform:uppercase;">Giáo Sư Biết Tuốt</div>
                Chào bạn trẻ! Có hóa đơn nào cần soi hay muốn tâm sự mỏng thì bảo lẹ! 🤓
            </div>
        </div>
        <div style="padding:16px; border-top:1px solid var(--border); background:var(--bg-secondary);">
            <div style="display:flex; gap:8px;">
                <input type="text" id="vat-chat-input" class="form-input" placeholder="Hỏi gì khó khó xíu..." style="flex:1;">
                <button class="btn btn-primary" id="vat-btn-send-chat">
                    <span class="material-symbols-rounded">send</span>
                </button>
            </div>
        </div>
    </div>
    `;
}

function _renderHistory() {
    return `
    <div class="card animate-fade-in">
        <div class="card-header">
            <h3><span class="material-symbols-rounded" style="vertical-align:middle; margin-right:8px; color:var(--info);">list_alt</span> Nhật Ký Hoạt Động</h3>
        </div>
        <div class="card-body" style="padding:0;">
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Thời gian</th>
                            <th>Hoạt động</th>
                        </tr>
                    </thead>
                    <tbody id="vat-history-list">
                        <tr><td colspan="2" class="text-center text-muted">Đang tải...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

function _renderSettings() {
    return `
    <div class="card animate-fade-in">
        <div class="card-header" style="background:var(--bg-secondary);">
            <h3><span class="material-symbols-rounded" style="vertical-align:middle; margin-right:8px;">admin_panel_settings</span> Cấu Hình API Keys</h3>
            <button class="btn btn-primary btn-sm" id="vat-btn-save-settings">Lưu & Đồng Bộ</button>
        </div>
        <div class="card-body">
            
            <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2); border-radius:var(--radius); padding:16px; margin-bottom:20px;">
                <label class="form-label" style="color:#818cf8;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle;">key</span> Admin Access (Lấy key tự động)</label>
                <div style="display:flex; gap:8px; max-width:400px;">
                    <input type="password" id="vat-admin-password" class="form-input" placeholder="Nhập mã truy cập admin...">
                    <button class="btn" style="background:#4f46e5; color:#fff;" id="vat-btn-admin-login">Lấy Key</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px;">
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>Gemini</span> <a href="https://aistudio.google.com/app/apikey" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-gemini" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>DeepSeek</span> <a href="https://platform.deepseek.com/api_keys" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-deepseek" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>Groq</span> <a href="https://console.groq.com/keys" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-groq" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>SambaNova</span> <a href="https://cloud.sambanova.ai/" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-sambanova" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>Cerebras</span> <a href="https://cloud.cerebras.ai/" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-cerebras" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>HuggingFace</span> <a href="https://huggingface.co/settings/tokens" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-hf" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>Mistral AI</span> <a href="https://console.mistral.ai/api-keys/" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-mistral" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display:flex; justify-content:space-between;"><span>NVIDIA</span> <a href="https://build.nvidia.com/explore/discover" target="_blank" style="font-size:10px;">Lấy Key</a></label>
                    <textarea id="vat-key-nvidia" class="form-input" rows="2" style="font-size:11px; font-family:monospace;"></textarea>
                </div>
            </div>
        </div>
    </div>
    `;
}

export function render() {
  var content = '';
  if (_activeTab === 'upload') content = _renderUpload();
  else if (_activeTab === 'search') content = _renderSearch();
  else if (_activeTab === 'history') content = _renderHistory();
  else if (_activeTab === 'settings') content = _renderSettings();

  return `
    ${_renderTabs()}
    <div id="vatTabContent">
      ${content}
    </div>
  `;
}

// --- INIT & LOGIC ---

function _switchTab(tabKey) {
  _activeTab = tabKey;
  window.refreshView();
}

function _bindEvents() {
    document.querySelectorAll('[data-vattab]').forEach(btn => {
        btn.addEventListener('click', () => {
            _switchTab(btn.dataset.vattab);
        });
    });

    if (_activeTab === 'settings') {
        document.getElementById('vat-key-gemini').value = geminiKeys.join('\n');
        document.getElementById('vat-key-deepseek').value = deepseekKeys.join('\n');
        document.getElementById('vat-key-groq').value = groqKeys.join('\n');
        document.getElementById('vat-key-sambanova').value = sambanovaKeys.join('\n');
        document.getElementById('vat-key-cerebras').value = cerebrasKeys.join('\n');
        document.getElementById('vat-key-hf').value = hfKeys.join('\n');
        document.getElementById('vat-key-mistral').value = mistralKeys.join('\n');
        document.getElementById('vat-key-nvidia').value = nvidiaKeys.join('\n');

        document.getElementById('vat-btn-save-settings')?.addEventListener('click', saveSettings);
        document.getElementById('vat-btn-admin-login')?.addEventListener('click', handleAdminLogin);
    }
    
    if (_activeTab === 'upload') {
        const fileInput = document.getElementById('vat-file-input');
        if(fileInput) {
            fileInput.addEventListener('change', (e) => {
                handleFileSelect(e.target.files);
            });
        }
        renderQueue();
    }

    if (_activeTab === 'search') {
        const searchInput = document.getElementById('vat-search-input');
        if(searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => doSearch(true), 300);
            });
        }
        document.getElementById('vat-btn-search')?.addEventListener('click', () => doSearch(false));
        document.getElementById('vat-btn-prev')?.addEventListener('click', () => changePage(-1));
        document.getElementById('vat-btn-next')?.addEventListener('click', () => changePage(1));
        
        // Auto load if empty
        if(currentSearchData.length === 0) doSearch(true);
        else renderPagedResults();
    }

    if (_activeTab === 'history') {
        loadHistory();
    }
}

export function init() {
    determineInitialPersona();
    if(driveCount === '...') getDriveCount();
    _bindEvents();
}

// --- SETTINGS LOGIC ---

function parseKeys(id) { 
    const val = document.getElementById(id).value;
    if(!val) return [];
    return val.split('\n').map(k=>k.trim()).filter(k=>k.length>5); 
}

function saveSettings() {
    geminiKeys = parseKeys('vat-key-gemini');
    groqKeys = parseKeys('vat-key-groq');
    hfKeys = parseKeys('vat-key-hf');
    cerebrasKeys = parseKeys('vat-key-cerebras');
    sambanovaKeys = parseKeys('vat-key-sambanova');
    deepseekKeys = parseKeys('vat-key-deepseek');
    mistralKeys = parseKeys('vat-key-mistral');
    nvidiaKeys = parseKeys('vat-key-nvidia');

    localStorage.setItem("vat_master_gemini_keys", JSON.stringify(geminiKeys));
    localStorage.setItem("vat_master_groq_keys", JSON.stringify(groqKeys));
    localStorage.setItem("vat_master_hf_keys", JSON.stringify(hfKeys));
    localStorage.setItem("vat_master_cerebras_keys", JSON.stringify(cerebrasKeys));
    localStorage.setItem("vat_master_sambanova_keys", JSON.stringify(sambanovaKeys));
    localStorage.setItem("vat_master_deepseek_keys", JSON.stringify(deepseekKeys));
    localStorage.setItem("vat_master_mistral_keys", JSON.stringify(mistralKeys));
    localStorage.setItem("vat_master_nvidia_keys", JSON.stringify(nvidiaKeys));
    
    determineInitialPersona();
    callAPI({ action: 'save_system_keys', gemini: geminiKeys, groq: groqKeys, hf: hfKeys, cerebras: cerebrasKeys, sambanova: sambanovaKeys, deepseek: deepseekKeys, mistral: mistralKeys, nvidia: nvidiaKeys });
    
    alert("Đã lưu API Keys thành công!");
    window.refreshView();
}

function handleAdminLogin() {
    const pass = document.getElementById('vat-admin-password').value;
    if (!pass) return alert('Vui lòng nhập mã truy cập!');
    
    const btn = document.getElementById('vat-btn-admin-login');
    const oldText = btn.innerText;
    btn.innerText = 'Đang tải...';
    
    callAPI({ action: 'get_system_keys', password: pass }).then(res => {
        btn.innerText = oldText;
        if (res.status === 'success') {
            if(res.gemini) document.getElementById('vat-key-gemini').value = res.gemini.join('\n');
            if(res.groq) document.getElementById('vat-key-groq').value = res.groq.join('\n');
            if(res.hf) document.getElementById('vat-key-hf').value = res.hf.join('\n');
            if(res.cerebras) document.getElementById('vat-key-cerebras').value = res.cerebras.join('\n');
            if(res.sambanova) document.getElementById('vat-key-sambanova').value = res.sambanova.join('\n');
            if(res.deepseek) document.getElementById('vat-key-deepseek').value = res.deepseek.join('\n');
            if(res.mistral) document.getElementById('vat-key-mistral').value = res.mistral.join('\n');
            if(res.nvidia) document.getElementById('vat-key-nvidia').value = res.nvidia.join('\n');
            alert('Đã mượn được hàng nóng từ kho Admin!');
        } else alert(res.message || 'Mã không đúng!');
    });
}

function checkApiKey() {
    if (!availablePersonas.length) { 
        alert("Hệ thống cần ít nhất 1 Key để hoạt động. Vui lòng cấu hình!");
        _switchTab('settings');
        return false; 
    }
    return true;
}

// --- UPLOAD LOGIC ---

function handleFileSelect(files) {
    if(!files || files.length===0) return;
    Array.from(files).forEach(file => {
        if (file.type !== 'application/pdf') return alert('Chỉ nhận file PDF');
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        uploadQueue.unshift({ id, file, status: 'pending', rawText: '', data: { tenDonVi: '', mst: '', tongTien: '', ngayKy: '', diaChi: '' } });
        aiScanQueue.push(id);
    });
    renderQueue(); 
    processScanQueue();
}

function renderQueue() {
    const list = document.getElementById('vat-upload-list');
    if(!list) return;
    
    if(uploadQueue.length === 0) {
        list.innerHTML = '';
        return;
    }
    
    list.innerHTML = uploadQueue.map(item => `
        <div class="card" id="item-${item.id}">
            <div class="card-body" style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:12px 16px;">
                <div style="display:flex; align-items:center; gap:12px; min-width:200px; flex:1;">
                    <div style="width:40px; height:40px; background:var(--danger-bg); color:var(--danger); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                        <span class="material-symbols-rounded">picture_as_pdf</span>
                    </div>
                    <div style="overflow:hidden;">
                        <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.file.name}">${item.file.name}</div>
                        <span class="tag ${getStatusColor(item.status)}" id="status-badge-${item.id}" style="margin-top:4px;">${getStatusText(item.status)}</span>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; flex:2; min-width:300px;">
                    <input type="text" class="form-input" style="font-size:12px; padding:6px 10px;" placeholder="Đơn vị" value="${item.data.tenDonVi}" onchange="window.vatUpdateItem('${item.id}', 'tenDonVi', this.value)">
                    <input type="text" class="form-input" style="font-size:12px; padding:6px 10px; color:var(--info); font-family:monospace;" placeholder="MST" value="${item.data.mst}" onchange="window.vatUpdateItem('${item.id}', 'mst', this.value)">
                    <input type="text" class="form-input" style="font-size:12px; padding:6px 10px;" placeholder="Địa chỉ" value="${item.data.diaChi}" onchange="window.vatUpdateItem('${item.id}', 'diaChi', this.value)">
                    <input type="text" class="form-input" style="font-size:12px; padding:6px 10px; color:var(--success); font-weight:bold;" placeholder="Tổng tiền" value="${formatCurrencyVN(item.data.tongTien)}" onchange="window.vatUpdateItem('${item.id}', 'tongTien', this.value)">
                </div>
                
                <div style="display:flex; gap:8px; flex-direction:column; min-width:100px;" id="actions-${item.id}">
                    ${getActionButtons(item)}
                </div>
            </div>
        </div>
    `).join('');
}

function getStatusColor(s) { 
    return { pending: '', scanning: 'tag-warning', ready: 'tag-info', uploading: 'tag-transfer', done: 'tag-success', error: 'tag-expense' }[s] || ''; 
}
function getStatusText(s) { 
    return { pending: 'Chờ...', scanning: 'Đang đọc...', ready: 'Sẵn sàng', uploading: 'Đang lưu...', done: 'Hoàn tất', error: 'Lỗi' }[s]; 
}

function getActionButtons(item) {
    if (['ready', 'error'].includes(item.status)) return `
        <button onclick="window.vatRetryAI('${item.id}')" class="btn btn-outline btn-sm" style="color:var(--warning); border-color:var(--warning);"><span class="material-symbols-rounded" style="font-size:14px;">refresh</span> Thử lại</button>
        <button onclick="window.vatUploadItem('${item.id}')" class="btn btn-primary btn-sm">Lưu tay</button>
    `;
    if (item.status === 'done') return `<div style="text-align:center; color:var(--success); font-weight:bold; font-size:12px;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle;">check_circle</span> Đã lưu</div>`;
    return `<button onclick="window.vatRemoveItem('${item.id}')" class="btn btn-outline btn-sm" style="color:var(--danger); border-color:transparent;"><span class="material-symbols-rounded" style="font-size:16px;">delete</span> Xóa</button>`;
}

// Attach globals for inline handlers
window.vatUpdateItem = (id, key, val) => { const i = uploadQueue.find(x => x.id === id); if(i) i.data[key] = val; };
window.vatRemoveItem = (id) => { uploadQueue = uploadQueue.filter(x => x.id !== id); aiScanQueue = aiScanQueue.filter(x => x !== id); renderQueue(); };
window.vatRetryAI = (id) => { const i = uploadQueue.find(x => x.id === id); if(i) { i.status = 'pending'; renderQueue(); aiScanQueue.push(id); processScanQueue(); } };
window.vatUploadItem = uploadItem;
window.vatDeleteInvoice = deleteInvoice;
window.vatPreviewFile = (url) => window.open(url.replace('/view','/preview'), '_blank');
window.vatCopyLink = (url) => navigator.clipboard.writeText(url);
window.vatPromptEmail = promptEmail;

function updateStatusUI(id, s, t) { 
    const i = uploadQueue.find(x => x.id === id); 
    if(i) { 
        i.status = s; 
        const badge = document.getElementById(`status-badge-${id}`);
        if (badge) {
            badge.className = `tag ${getStatusColor(s)}`;
            if (s !== 'scanning') badge.innerText = getStatusText(s);
            else if (!badge.innerText.includes('đang đọc')) badge.innerText = t || getStatusText(s);
        }
        const actions = document.getElementById(`actions-${id}`);
        if (actions) actions.innerHTML = getActionButtons(i);
    } 
}

async function processScanQueue() {
    if (!aiScanQueue.length || activeScans >= MAX_CONCURRENT_SCANS) return;
    while (aiScanQueue.length > 0 && activeScans < MAX_CONCURRENT_SCANS) {
        const id = aiScanQueue.shift();
        const item = uploadQueue.find(i => i.id === id);
        if (item && item.status === 'pending') {
            activeScans++;
            autoScanAndUpload(id).finally(() => { activeScans--; processScanQueue(); });
        }
    }
}

// Add simple pdfjs worker injection for text extraction (we assume it's loaded in index.html if needed, 
// but since we shouldn't modify index.html heavily unless needed, we can load it dynamically or just rely on backend parsing if needed.
// Actually, original vat.html uses CDN for pdf.js. We need to inject it.
let pdfjsLibLoaded = false;
async function loadPdfJs() {
    if(pdfjsLibLoaded || window.pdfjsLib) return;
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            pdfjsLibLoaded = true;
            resolve();
        };
        document.head.appendChild(script);
    });
}

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

const TEXT_EXTRACT_PROMPT_TEMPLATE = (rawText) => `BẠN LÀ CHUYÊN GIA TRÍCH XUẤT HÓA ĐƠN VAT VIỆT NAM.

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

// Gemini Vision: gửi PDF trực tiếp, đọc bằng mắt
async function callGeminiVision(pdfBase64, fileId) {
    for (let i = 0; i < geminiKeys.length; i++) {
        const key = geminiKeys[(idx.gemini + i) % geminiKeys.length];
        idx.gemini = (idx.gemini + 1) % geminiKeys.length;
        
        const badge = fileId ? document.getElementById(`status-badge-${fileId}`) : null;
        if (badge) badge.innerText = '🔬 Gemini Vision đang nhìn...';

        try {
            const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
                        { text: VISION_EXTRACT_PROMPT }
                    ]}],
                    generationConfig: { responseMimeType: 'application/json' }
                })
            }, 30000); // 30s timeout for vision
            if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
            const json = await res.json();
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Gemini Vision returned empty');
            console.log('[VAT Vision] Gemini Vision succeeded');
            return text;
        } catch (e) {
            console.warn(`[VAT Vision] Gemini key #${i} failed:`, e.message);
        }
    }
    return null; // All Gemini keys failed → will fallback to text-based
}

async function autoScanAndUpload(id) {
    const item = uploadQueue.find(i => i.id === id);
    updateStatusUI(id, 'scanning', 'Đang xếp hàng...');
    
    try {
        let res = null;
        
        // === ĐƯỜNG 1: Gemini Vision (ưu tiên — gửi PDF trực tiếp, đọc bằng mắt) ===
        if (geminiKeys.length) {
            updateStatusUI(id, 'scanning', '🔬 Vision đang đọc...');
            const buf = await item.file.arrayBuffer();
            const base64 = btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), ''));
            res = await callGeminiVision(base64, id);
        }
        
        // === ĐƯỜNG 2: Fallback — pdf.js text extraction + AI text mode ===
        if (!res) {
            updateStatusUI(id, 'scanning', 'pdf.js đang trích...');
            await loadPdfJs();
            if (!item.rawText) {
                const buf = await item.file.arrayBuffer();
                const pdf = await window.pdfjsLib.getDocument(buf).promise;
                let txt = ''; 
                for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) {
                    txt += (await (await pdf.getPage(i)).getTextContent()).items.map(s => s.str).join(' ') + '\n';
                }
                item.rawText = txt;
            }
            res = await callAI_Unified(TEXT_EXTRACT_PROMPT_TEMPLATE(item.rawText), 'extract', id);
        }
        
        if (!res) return updateStatusUI(id, 'ready');
        
        let json = res.replace(/```json/g, '').replace(/```/g, '').trim();
        if(json.includes('{')) json = json.substring(json.indexOf('{'), json.lastIndexOf('}')+1);
        const data = JSON.parse(json);
        
        // Chuẩn hóa dữ liệu trả về từ bất kỳ AI nào
        if (data.tongTien) data.tongTien = String(data.tongTien).replace(/[^0-9]/g, '');
        if (data.mst) data.mst = String(data.mst).replace(/[^0-9-]/g, '');
        if (data.ngayKy) {
            let match = String(data.ngayKy).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
            if (match) data.ngayKy = `${match[1].padStart(2,'0')}/${match[2].padStart(2,'0')}/${match[3]}`;
        }
        
        // KIỂM TRA NGHIÊM NGẶT: TUYỆT ĐỐI KHÔNG CHẤP NHẬN 0đ
        if (!data.tongTien || data.tongTien === '0') {
            item.data = { ...item.data, ...data };
            renderQueue();
            return updateStatusUI(id, 'error', 'Lỗi: Tổng tiền 0đ');
        }
        
        item.data = { ...item.data, ...data };
        renderQueue(); 
        
        if (item.data.mst && item.data.ngayKy && item.data.tongTien) await uploadItem(id); 
        else updateStatusUI(id, 'ready');
    } catch (e) { 
        console.error('[VAT Scan Error]', e);
        const shortMsg = e.message && e.message.length > 60 ? e.message.substring(0, 60) + '…' : (e.message || 'Lỗi AI');
        updateStatusUI(id, 'error', shortMsg); 
    }
}

async function uploadItem(id) {
    const item = uploadQueue.find(i => i.id === id);
    updateStatusUI(id, 'uploading', 'Đang lưu...');
    return new Promise(resolve => {
        // Kiểm tra trùng lặp trước khi đọc file
        if (item.data.mst && item.data.ngayKy && item.data.tongTien) {
            // Kiểm tra trong DB hiện tại
            let isDuplicate = currentSearchData.some(d => 
                d.mst === item.data.mst && 
                d.ngayKy === item.data.ngayKy && 
                String(d.tongTien) === String(item.data.tongTien)
            );
            
            // CŨNG PHẢI KIỂM TRA TRONG NHỮNG FILE VỪA UPLOAD THÀNH CÔNG (Nhưng chưa kịp đồng bộ vào currentSearchData)
            if (!isDuplicate) {
                isDuplicate = uploadQueue.some(q => 
                    q.id !== id && 
                    q.status === 'done' && 
                    q.data.mst === item.data.mst && 
                    q.data.ngayKy === item.data.ngayKy && 
                    String(q.data.tongTien) === String(item.data.tongTien)
                );
            }
            
            if (isDuplicate) {
                updateStatusUI(id, 'error', 'Trùng lặp');
                showToast(`Hóa đơn của ${item.data.mst} (ngày ${item.data.ngayKy} - ${item.data.tongTien}đ) đã tồn tại! Bỏ qua.`, 'warning');
                resolve();
                return;
            }
        }

        const r = new FileReader(); r.readAsDataURL(item.file);
        r.onload = () => {
            let finalFileName = item.file.name;
            if (item.data.ngayKy && item.data.mst) {
                // Đồng nhất tên file theo chuẩn cũ: "DD/MM/YYYY-MST" (viết liền không khoảng trắng)
                finalFileName = `${item.data.ngayKy}-${item.data.mst}.pdf`;
            }

            callAPI({ 
                action: 'upload', 
                fileBase64: r.result.split(',')[1], 
                mimeType: item.file.type, 
                fileName: finalFileName,
                ...item.data 
            }).then(res => {
                updateStatusUI(id, res.status==='success'?'done':'error', res.status==='success'?'Đã lưu':'Lỗi');
                if(res.status==='success') { 
                    doSearch(true); 
                    getDriveCount(); 
                }
                resolve();
            });
        };
    });
}

function deleteInvoice(fileName) {
    showConfirm('Bạn có chắc muốn xóa hóa đơn cũ này để nạp lại bản mới không?', {title: 'Thay thế hóa đơn?'}).then(confirmed => {
        if (!confirmed) return;
        callAPI({ action: 'delete_invoice', fileName: fileName }).then(res => {
            if(res.status === 'success') {
                alert('Đã xóa hóa đơn cũ. Hãy chọn file mới để upload.');
                doSearch(true);
                getDriveCount();
                _switchTab('upload');
            } else {
                alert('Không xóa được file.');
            }
        });
    });
}

function promptEmail(fileName, tenDonVi, tongTien) {
    const inputId = 'vatEmailInput_' + Date.now();
    const html = `
        <div style="padding:10px 0;">
            <div style="display:flex; justify-content:center; margin-bottom:16px;">
                <div style="width:48px; height:48px; border-radius:50%; background:var(--info-dim); color:var(--info); display:flex; align-items:center; justify-content:center;">
                    <span class="material-symbols-rounded" style="font-size:24px;">mail</span>
                </div>
            </div>
            <h3 style="font-size:18px; font-weight:700; text-align:center; margin-bottom:8px;">Gửi Hóa Đơn</h3>
            <p style="font-size:14px; text-align:center; color:var(--text-muted); margin-bottom:16px;">
                ${tenDonVi}<br>
                <strong style="color:var(--text); font-size:16px;">${formatCurrencyVN(tongTien)}</strong>
            </p>
            <div class="form-group" style="margin-bottom:24px;">
                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">Email khách hàng</label>
                <input type="email" id="${inputId}" class="form-input" placeholder="Nhập địa chỉ email..." autocomplete="email" style="width:100%; text-align:center;">
            </div>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn btn-outline" id="vatEmailCancel" style="flex:1;">Hủy</button>
                <button class="btn btn-primary" id="vatEmailSubmit" style="flex:1; background:var(--info); border-color:var(--info);">Gửi Email</button>
            </div>
        </div>
    `;

    showModal(html);

    setTimeout(() => {
        const inputEl = document.getElementById(inputId);
        const cancelBtn = document.getElementById('vatEmailCancel');
        const submitBtn = document.getElementById('vatEmailSubmit');

        if (inputEl) inputEl.focus();

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => hideModal());
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                const email = inputEl.value.trim();
                if (!email) {
                    showToast('Vui lòng nhập email', 'error');
                    inputEl.focus();
                    return;
                }
                if (!email.includes('@')) {
                    showToast('Email không hợp lệ', 'error');
                    inputEl.focus();
                    return;
                }
                
                hideModal();
                
                const toastId = 'toast-' + Date.now();
                const toast = document.createElement('div');
                toast.id = toastId;
                toast.style.cssText = 'position:fixed; top:20px; right:20px; background:var(--bg-card); border:1px solid var(--info); padding:12px 20px; border-radius:8px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.2); display:flex; align-items:center; gap:8px;';
                toast.innerHTML = `<span class="material-symbols-rounded spin-icon" style="color:var(--info);">sync</span> <span>Đang gửi email...</span>`;
                document.body.appendChild(toast);

                callAPI({ 
                    action: 'send_email', 
                    email: email, 
                    fileName: fileName,
                    tenDonVi: tenDonVi,
                    tongTien: tongTien
                }).then(res => {
                    const t = document.getElementById(toastId); if(t) t.remove();
                    if(res.status === 'success') {
                        showToast(`Đã gửi email thành công đến: ${email}`, 'success');
                    } else {
                        showToast('Lỗi: ' + (res.message || 'Backend chưa xử lý send_email'), 'error');
                    }
                }).catch(e => {
                    const t = document.getElementById(toastId); if(t) t.remove();
                    showToast('Lỗi kết nối.', 'error');
                });
            });
        }
    }, 50);
}

// --- SEARCH LOGIC ---

function doSearch(bg=false) {
    const searchInput = document.getElementById('vat-search-input');
    let q = searchInput ? searchInput.value.trim() : '';
    
    if (/^(\d{1,2})[-.\s](\d{1,2})(?:[-.\s](\d{4}))?$/.test(q)) {
         const match = q.match(/^(\d{1,2})[-.\s](\d{1,2})(?:[-.\s](\d{4}))?$/);
         const d = match[1].padStart(2, '0');
         const m = match[2].padStart(2, '0');
         const y = match[3];
         q = y ? `${d}/${m}/${y}` : `${d}/${m}`;
    }

    if(!bg) {
        const btn = document.getElementById('vat-btn-search');
        if(btn) btn.innerHTML = '<span class="material-symbols-rounded spin-icon">sync</span> Đang tìm...';
    }
    
    callAPI({ action: 'search', query: q, limit: 5000, nocache: new Date().getTime() }).then(res => {
        if(!bg) {
            const btn = document.getElementById('vat-btn-search');
            if(btn) btn.innerHTML = '<span class="material-symbols-rounded">filter_alt</span> Tìm Kiếm';
        }
        if(res.status === 'success') {
            currentSearchData = res.data.sort((a, b) => parseDate(b.ngayKy) - parseDate(a.ngayKy));
            currentPage = 1;
            renderPagedResults();
        }
    });
}

function renderPagedResults() {
    const container = document.getElementById('vat-search-results');
    if(!container) return;
    
    const totalItems = currentSearchData.length;
    const countEl = document.getElementById('vat-display-count');
    if(countEl) countEl.innerText = totalItems;
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentSearchData.slice(startIndex, endIndex);

    const controls = document.getElementById('vat-pagination-controls');
    if (controls) {
        if (totalItems > itemsPerPage) {
            controls.style.display = 'flex';
            document.getElementById('vat-page-info').innerText = `Trang ${currentPage} / ${totalPages}`;
            document.getElementById('vat-btn-prev').disabled = currentPage === 1;
            document.getElementById('vat-btn-next').disabled = currentPage === totalPages;
        } else {
            controls.style.display = 'none';
        }
    }

    if(pageData.length === 0) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><span class="material-symbols-rounded empty-icon">search_off</span><h3>Không tìm thấy dữ liệu</h3><p>Vui lòng thử từ khóa khác</p></div>';
        return;
    }

    container.innerHTML = pageData.map(d => `
        <div class="card" style="display:flex; flex-direction:column; position:relative;">
            <div style="position:absolute; top:12px; right:12px; z-index:10;">
                <input type="checkbox" class="vat-invoice-checkbox" value="${d.fileName}" ${selectedInvoices.has(d.fileName) ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;" onchange="window.vatToggleSelection('${d.fileName}', this.checked)">
            </div>
            <div class="card-body" style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <h3 style="font-size:14px; margin:0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${d.tenDonVi}</h3>
                    <span class="tag tag-info" style="margin-left:8px;">${d.mst}</span>
                </div>
                <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px; display:flex; gap:4px;"><span class="material-symbols-rounded" style="font-size:14px;">location_on</span> ${d.diaChi}</p>
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                        <span style="color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle;">calendar_today</span> Ngày ký</span>
                        <span style="font-weight:600;">${formatDateVN(d.ngayKy)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;">
                        <span style="color:var(--success);"><span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle;">payments</span> Tiền</span>
                        <span style="font-weight:700; color:var(--success);">${formatCurrencyVN(d.tongTien)}</span>
                    </div>
                </div>
            </div>
            <div style="padding:12px; border-top:1px solid var(--border); display:flex; gap:8px; background:var(--bg-secondary);">
                <button onclick="window.vatPreviewFile('${d.linkView}')" class="btn btn-outline btn-sm" style="flex:1;">Xem</button>
                <button onclick="window.vatPromptEmail('${d.fileName}', '${(d.tenDonVi||'').replace(/'/g, "\\'")}', '${d.tongTien||''}')" class="btn btn-outline btn-sm" style="color:var(--info); border-color:transparent;" title="Gửi Email"><span class="material-symbols-rounded" style="font-size:16px;">mail</span></button>
                <button onclick="window.vatDeleteInvoice('${d.fileName}')" class="btn btn-outline btn-sm" style="color:var(--danger);" title="Thay thế/Xóa"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>
                <button onclick="window.vatCopyLink('${d.linkView}')" class="btn btn-outline btn-sm" title="Copy Link"><span class="material-symbols-rounded" style="font-size:16px;">content_copy</span></button>
            </div>
        </div>
    `).join('');
}

function changePage(step) {
    const totalPages = Math.ceil(currentSearchData.length / itemsPerPage);
    const newPage = currentPage + step;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPagedResults();
    }
}

// --- HISTORY LOGIC ---

function loadHistory() {
    callAPI({action:'get_history'}).then(res => { 
        const list = document.getElementById('vat-history-list');
        if(list && res.status==='success') {
            list.innerHTML=res.data.map(r=>`
                <tr>
                    <td style="font-size:12px; color:var(--text-muted);">${new Date(r[0]).toLocaleString('vi-VN')}</td>
                    <td>${r[1]}</td>
                </tr>
            `).join(''); 
        }
    }); 
}

// --- CHAT LOGIC ---

function rotatePersona() { 
    if (availablePersonas.length > 1) { 
        currentPersona = availablePersonas[(availablePersonas.indexOf(currentPersona) + 1) % availablePersonas.length]; 
        updateChatSubtitle(); 
        return currentPersona; 
    } 
}

function manualSwitchPersona() { 
    if (availablePersonas.length > 1) { 
        rotatePersona(); 
        const container = document.getElementById('vat-chat-messages'); 
        if(container) {
            container.innerHTML += `<div style="text-align:center; font-size:11px; color:var(--text-muted); margin:10px 0;">Đã đổi sang: <b>${getPersonaDisplayName(currentPersona)}</b>. Sẵn sàng phục vụ!</div>`; 
            container.scrollTop = container.scrollHeight; 
        }
    } 
}

async function sendChat() {
    const input = document.getElementById('vat-chat-input');
    const msg = input.value.trim(); 
    if(!msg) return;
    
    const container = document.getElementById('vat-chat-messages');
    
    // User message
    container.innerHTML += `
        <div style="align-self:flex-end; background:var(--primary-glow); border:1px solid rgba(232,168,56,.2); color:var(--primary); padding:10px 14px; border-radius:12px; border-bottom-right-radius:2px; max-width:80%; font-size:13px;">
            ${msg}
        </div>
    `;
    input.value = ''; 
    container.scrollTop = container.scrollHeight;
    
    const lid = 'l-'+Date.now(); 
    container.innerHTML += `
        <div id="${lid}" style="align-self:flex-start; color:var(--text-muted); padding:10px 14px; font-size:13px;">
            <span class="material-symbols-rounded spin-icon" style="font-size:16px; vertical-align:middle;">sync</span> Đang suy nghĩ...
        </div>
    `; 
    container.scrollTop = container.scrollHeight;
    
    const context = currentSearchData.slice(0,20).map(d=>`- ${d.tenDonVi} (${d.tongTien})`).join('\n');
    const res = await callAI_Persona(`Dữ liệu hóa đơn:\n${context}\nHỏi: "${msg}"`);
    
    document.getElementById(lid).remove();
    
    // AI message
    container.innerHTML += `
        <div style="align-self:flex-start; background:var(--bg-secondary); border:1px solid var(--border); padding:10px 14px; border-radius:12px; border-bottom-left-radius:2px; max-width:80%; font-size:13px; line-height:1.5;">
            <div style="font-size:10px; font-weight:700; color:var(--success); margin-bottom:4px; text-transform:uppercase;">${getPersonaDisplayName(currentPersona)}</div>
            ${res.replace(/\n/g, '<br>')}
        </div>
    `;
    container.scrollTop = container.scrollHeight;
}

// --- AI API CALLS ---

async function callAI_Unified(promptText, mode = 'extract', fileId = null) {
    if (!checkApiKey()) return null;
    
    const tryProv = (p, prompt, m) => tryProvider(p, prompt, m, fileId);
    const errors = [];
    const providers = [
        ['gemini', geminiKeys], ['deepseek', deepseekKeys], ['groq', groqKeys],
        ['sambanova', sambanovaKeys], ['cerebras', cerebrasKeys], ['mistral', mistralKeys],
        ['nvidia', nvidiaKeys], ['hf', hfKeys]
    ];

    for (const [name, keys] of providers) {
        if (!keys.length) continue;
        try {
            return await tryProv(name, promptText, mode);
        } catch (e) {
            const msg = `${name}: ${e.message}`;
            errors.push(msg);
            console.warn('[VAT AI Fallback]', msg);
        }
    }
    console.error('[VAT AI] All providers failed:', errors);
    throw new Error('Tất cả AI đều lỗi: ' + errors.join(' → '));
}

async function callAI_Persona(promptText) {
    if (!checkApiKey()) return null;
    if (!availablePersonas.includes(currentPersona)) {
        if (availablePersonas.length) currentPersona = availablePersonas[0];
        else return `Xin lỗi, chưa có Key nào được cấu hình.`;
    }
    let attemptOrder = availablePersonas.slice(availablePersonas.indexOf(currentPersona)).concat(availablePersonas.slice(0, availablePersonas.indexOf(currentPersona)));
    for (const persona of attemptOrder) {
        try {
            if (currentPersona !== persona) { currentPersona = persona; updateChatSubtitle(); }
            const res = await tryProvider(persona, promptText, 'chat');
            if (persona !== attemptOrder[0]) return `_(⚠️ ${getPersonaDisplayName(attemptOrder[0])} bận, **${getPersonaDisplayName(persona)}** trả lời thay)_\n\n${res}`;
            return res;
        } catch (e) {}
    }
    return `Toang rồi! Tất cả các trợ lý đều bận.`;
}

// Timeout wrapper — kills hung requests after 25s
function fetchWithTimeout(url, opts, timeoutMs = 25000) {
    return Promise.race([
        fetch(url, opts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
}

const PROVIDER_MAP = {
    gemini:    { label: 'Gemini',      get keys() { return geminiKeys; },    runner: callGeminiDirect },
    deepseek:  { label: 'DeepSeek',    get keys() { return deepseekKeys; },  runner: callDeepSeekDirect },
    groq:      { label: 'Groq',        get keys() { return groqKeys; },      runner: callGroqDirect },
    sambanova: { label: 'SambaNova',   get keys() { return sambanovaKeys; }, runner: callSambaNovaDirect },
    cerebras:  { label: 'Cerebras',    get keys() { return cerebrasKeys; },  runner: callCerebrasDirect },
    mistral:   { label: 'Mistral',     get keys() { return mistralKeys; },   runner: callMistralDirect },
    nvidia:    { label: 'NVIDIA',      get keys() { return nvidiaKeys; },    runner: callNvidiaDirect },
    hf:        { label: 'HuggingFace', get keys() { return hfKeys; },        runner: callHuggingFaceDirect }
};

async function tryProvider(provider, prompt, mode, fileId = null) {
    const cfg = PROVIDER_MAP[provider];
    if (!cfg) throw new Error(`Unknown provider: ${provider}`);
    const keys = cfg.keys;
    const runner = cfg.runner;

    for (let i = 0; i < keys.length; i++) {
        let startIdx = idx[provider]; idx[provider] = (idx[provider] + 1) % keys.length;
        
        if (mode === 'extract' && fileId) {
            const badge = document.getElementById(`status-badge-${fileId}`);
            if (badge) badge.innerText = `${cfg.label} đang đọc...`;
        }
        
        try {
            return await runner(keys[(startIdx + i) % keys.length], prompt, mode);
        } catch (e) {
            console.warn(`[VAT] ${cfg.label} key #${i} failed:`, e.message);
        }
    }
    throw new Error(`${cfg.label}: hết key`);
}

const SYSTEM_INSTRUCTION = "YÊU CẦU: Trả lời NGẮN GỌN, SÚC TÍCH, ĐẦY ĐỦ Ý. Giọng điệu: HÀI HƯỚC, LẦY LỘI nhưng LỊCH SỰ. Không lan man. Ngày tháng luôn dùng định dạng DD/MM/YYYY. Tiền bạc lấy số nguyên, không dấu chấm phẩy.";
const EXTRACT_SYS = "You are a Vietnamese VAT invoice extraction expert. Output ONLY valid JSON. Rules: (1) Date format DD/MM/YYYY. (2) tongTien = 'Tổng cộng tiền thanh toán' which is the FINAL total AFTER tax, NOT 'Cộng tiền hàng' (pre-tax subtotal). It equals subtotal + VAT tax. (3) tongTien must be a pure integer with no dots or commas (e.g. 660000 not 660.000). (4) NEVER return 0 for tongTien. (5) Do NOT confuse tax ID numbers or invoice serial numbers with money amounts.";

async function callGeminiDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Giáo Sư Biết Tuốt'. ${SYSTEM_INSTRUCTION} Dùng icon 🤓📚.` : EXTRACT_SYS;
    const p = mode === 'chat' ? prompt : prompt;
    const reqBody = {
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts: [{ text: p }] }]
    };
    if (mode === 'extract') reqBody.generationConfig = { responseMimeType: 'application/json' };
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody)
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response');
    return text;
}

async function callDeepSeekDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Thám Tử Tư'. ${SYSTEM_INSTRUCTION} Dùng icon 🕵️‍♂️.` : EXTRACT_SYS;
    // Try deepseek-chat (alias for v4-flash, retiring July 2026)
    const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], response_format: mode === 'extract' ? { type: 'json_object' } : undefined, max_tokens: 1024 })
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned empty');
    return content;
}

async function callGroqDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Thánh Tốc Độ'. ${SYSTEM_INSTRUCTION} Dùng icon 🚀.` : EXTRACT_SYS;
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], response_format: mode === 'extract' ? { type: 'json_object' } : undefined })
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    return (await res.json()).choices[0].message.content;
}

async function callSambaNovaDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Tia Chớp Đen'. ${SYSTEM_INSTRUCTION} Dùng icon ⚡.` : EXTRACT_SYS;
    const models = ['Meta-Llama-3.3-70B-Instruct', 'Llama-4-Scout-17B-16E-Instruct'];
    let lastErr = null;
    for (const model of models) {
        try {
            const body = { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], max_tokens: 1024 };
            if (mode === 'extract') body.response_format = { type: 'json_object' };
            const res = await fetchWithTimeout('https://api.sambanova.ai/v1/chat/completions', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(body)
            });
            if (!res.ok) { lastErr = await res.text(); continue; }
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) return content;
        } catch (e) { lastErr = e.message; }
    }
    throw new Error(`SambaNova all models failed: ${String(lastErr).substring(0, 100)}`);
}

async function callCerebrasDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Cỗ Máy Hủy Diệt'. ${SYSTEM_INSTRUCTION} Dùng icon 🤖.` : EXTRACT_SYS;
    const res = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'llama-4-scout-17b-16e-instruct', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], response_format: mode === 'extract' ? { type: 'json_object' } : undefined })
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    return (await res.json()).choices[0].message.content;
}

async function callMistralDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Pháp Sư Âu Châu'. ${SYSTEM_INSTRUCTION}` : EXTRACT_SYS;
    const res = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'mistral-small-latest', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], response_format: mode === 'extract' ? { type: 'json_object' } : undefined })
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    return (await res.json()).choices[0].message.content;
}

async function callNvidiaDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Siêu Máy Tính'. ${SYSTEM_INSTRUCTION}` : EXTRACT_SYS;
    const body = {
        model: 'meta/llama-3.3-70b-instruct', 
        messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], 
        max_tokens: 1024, stream: false
    };
    if (mode === 'extract') body.response_format = { type: 'json_object' };
    const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.text(); throw new Error(`${res.status}: ${err.substring(0, 120)}`); }
    return (await res.json()).choices[0].message.content;
}

async function callHuggingFaceDirect(key, prompt, mode) {
    const sys = mode === 'chat' ? `Bạn là 'Bà Hàng Xóm'. ${SYSTEM_INSTRUCTION}` : EXTRACT_SYS;
    const models = [
        'Qwen/Qwen2.5-72B-Instruct',
        'meta-llama/Llama-3.3-70B-Instruct',
        'mistralai/Mistral-Small-24B-Instruct-2501'
    ];
    let lastErr = null;
    for (const model of models) {
        try {
            const body = { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], max_tokens: 1024, stream: false };
            if (mode === 'extract') body.response_format = { type: 'json_object' };
            const res = await fetchWithTimeout(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const errText = await res.text();
                lastErr = `${model}: ${res.status} ${errText.substring(0, 80)}`;
                continue;
            }
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) return content;
        } catch (e) { lastErr = `${model}: ${e.message}`; }
    }
    throw new Error(`HuggingFace: ${lastErr}`);
}

window.vatToggleSelection = function(fileName, isChecked) {
    if(isChecked) selectedInvoices.add(fileName);
    else selectedInvoices.delete(fileName);
    updateBulkUI();
};

window.vatSelectAllToggle = function() {
    const checkboxes = document.querySelectorAll('.vat-invoice-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    if (allChecked) {
        checkboxes.forEach(cb => { cb.checked = false; selectedInvoices.delete(cb.value); });
    } else {
        checkboxes.forEach(cb => { cb.checked = true; selectedInvoices.add(cb.value); });
    }
    updateBulkUI();
};

window.vatBulkDelete = async function() {
    if(selectedInvoices.size === 0) return;
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedInvoices.size} hóa đơn đã chọn không?`, {title: 'Xóa hàng loạt?', type: 'danger'});
    if (!confirmed) return;
    
    let successCount = 0;
    const filesToDelete = Array.from(selectedInvoices);
    showToast(`Đang xóa ${filesToDelete.length} hóa đơn...`, 'info');
    for(const fileName of filesToDelete) {
        try {
            const res = await callAPI({ action: 'delete_invoice', fileName: fileName });
            if(res.status === 'success') successCount++;
        } catch(e) {}
    }
    showToast(`Đã xóa thành công ${successCount}/${filesToDelete.length} hóa đơn.`);
    selectedInvoices.clear();
    updateBulkUI();
    doSearch(true);
    getDriveCount();
};

window.vatSyncData = async function() {
    const confirmed = await showConfirm(`Bạn có chắc muốn Đồng bộ dữ liệu? Quá trình này sẽ rà soát và xóa các hóa đơn rác (bóng ma) hoặc trùng lặp trong hệ thống.`, {title: 'Đồng bộ hệ thống', type: 'info'});
    if (!confirmed) return;
    
    showToast(`Đang đồng bộ dữ liệu với Drive... Vui lòng đợi`, 'info');
    try {
        const res = await callAPI({ action: 'sync_db' });
        if(res.status === 'success') {
            showToast(res.message || `Đồng bộ hoàn tất!`, 'success');
            selectedInvoices.clear();
            updateBulkUI();
            doSearch(true);
            getDriveCount();
        } else {
            showToast('Lỗi: ' + res.message, 'error');
        }
    } catch(e) {
        showToast('Lỗi kết nối khi đồng bộ.', 'error');
    }
};

window.vatRescanAll = async function() {
    if (!geminiKeys.length) {
        showToast('Cần cấu hình Gemini API Key trước khi Re-Scan!', 'error');
        return;
    }
    
    const confirmed = await showConfirm(
        'Re-Scan sẽ dùng Gemini Vision đọc lại TẤT CẢ file PDF trên Drive và tự động cập nhật thông tin (tên, MST, tổng tiền, ngày, địa chỉ).\n\nQuá trình này mất vài phút tùy số lượng file.',
        { title: '🔬 Re-Scan bằng Gemini Vision?', type: 'info' }
    );
    if (!confirmed) return;
    
    const btn = document.getElementById('vat-btn-rescan');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded spin-icon" style="font-size:16px;">sync</span> Đang scan...'; }
    
    let totalProcessed = 0, totalUpdated = 0, totalErrors = 0, totalFiles = 0;
    let startIndex = 0;
    const batchSize = 15;
    let hasMore = true;
    
    try {
        while (hasMore) {
            showToast(`🔬 Đang scan batch ${startIndex + 1}-${startIndex + batchSize}...`, 'info');
            
            const res = await callAPI({ 
                action: 'rescan_batch', 
                startIndex: startIndex, 
                batchSize: batchSize 
            });
            
            if (res.status !== 'success') {
                showToast('Lỗi Re-Scan: ' + (res.message || 'Unknown error'), 'error');
                break;
            }
            
            totalFiles = res.total;
            totalProcessed += res.processed;
            totalUpdated += res.updated;
            totalErrors += res.errors;
            hasMore = res.hasMore;
            startIndex = res.nextIndex;
            
            // Log chi tiết
            if (res.details) {
                res.details.forEach(d => {
                    if (d.status === 'updated') console.log(`[Re-Scan] ✅ ${d.fileName}: cập nhật`, d.old, '→', d.newData || d.new);
                    else if (d.status === 'error') console.warn(`[Re-Scan] ❌ ${d.fileName}:`, d.message);
                });
            }
        }
        
        showToast(
            `✅ Re-Scan hoàn tất! ${totalProcessed}/${totalFiles} file: ${totalUpdated} cập nhật, ${totalErrors} lỗi.`,
            totalErrors > 0 ? 'warning' : 'success'
        );
        
        // Refresh dữ liệu
        doSearch(true);
        getDriveCount();
        
    } catch (e) {
        console.error('[Re-Scan Error]', e);
        showToast('Lỗi kết nối khi Re-Scan: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">auto_fix_high</span> Re-Scan AI'; }
    }
};

function updateBulkUI() {
    const bulkBar = document.getElementById('vat-bulk-actions');
    const bulkCount = document.getElementById('vat-bulk-count');
    if(bulkBar) {
        if(selectedInvoices.size > 0) {
            bulkBar.style.display = 'flex';
            if(bulkCount) bulkCount.innerText = selectedInvoices.size;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}
