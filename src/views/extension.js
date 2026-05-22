import { getSettings, updateSettings } from '../store.js';
import { showToast, formatCurrency } from '../utils.js';

let _activeTab = 'calc';
let _history = [];
let _qrTemplates = [];
let _ttsHistory = [];

const _tabs = [
  { key: 'calc', icon: 'calculate', label: 'Tính thuế VAT' },
  { key: 'qr', icon: 'qr_code_2', label: 'Tạo mã VietQR' },
  { key: 'tts', icon: 'volume_up', label: 'Phát loa thông báo' },
  { key: 'tools', icon: 'construction', label: 'Tiện ích mở rộng' },
  { key: 'settings', icon: 'settings', label: 'Cài đặt tiện ích' }
];

// Number to Words utility
const ChuSo = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const Tien = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
function DocSo3ChuSo(baso) {
  let tram = parseInt(baso / 100), chuc = parseInt((baso % 100) / 10), donvi = baso % 10, KetQua = "";
  if (tram == 0 && chuc == 0 && donvi == 0) return "";
  if (tram != 0) { KetQua += ChuSo[tram] + " trăm "; if ((chuc == 0) && (donvi != 0)) KetQua += " linh "; }
  if ((chuc != 0) && (chuc != 1)) KetQua += ChuSo[chuc] + " mươi ";
  if (chuc == 1) KetQua += " mười ";
  switch (donvi) {
    case 1: if ((chuc != 0) && (chuc != 1)) KetQua += " mốt "; else KetQua += ChuSo[donvi] + " "; break;
    case 5: if (chuc == 0) KetQua += ChuSo[donvi] + " "; else KetQua += " lăm "; break;
    default: if (donvi != 0) KetQua += ChuSo[donvi] + " "; break;
  }
  return KetQua;
}
function docTienBangChu(SoTien) {
  if (SoTien == 0) return "Không đồng";
  let so = Math.abs(SoTien), KetQua = "", ViTri = [];
  ViTri[5] = Math.floor(so / 1000000000000000); so -= parseFloat(ViTri[5].toString()) * 1000000000000000;
  ViTri[4] = Math.floor(so / 1000000000000); so -= parseFloat(ViTri[4].toString()) * 1000000000000;
  ViTri[3] = Math.floor(so / 1000000000); so -= parseFloat(ViTri[3].toString()) * 1000000000;
  ViTri[2] = parseInt(so / 1000000); ViTri[1] = parseInt((so % 1000000) / 1000); ViTri[0] = parseInt(so % 1000);
  let lan = ViTri[5] > 0 ? 5 : ViTri[4] > 0 ? 4 : ViTri[3] > 0 ? 3 : ViTri[2] > 0 ? 2 : ViTri[1] > 0 ? 1 : 0;
  for (let i = lan; i >= 0; i--) { let tmp = DocSo3ChuSo(ViTri[i]); if (tmp !== "") { KetQua += tmp + Tien[i] + " "; } }
  KetQua = KetQua.trim().replace(/\s+/g, ' ');
  if(KetQua.length > 0) KetQua = KetQua.substring(0, 1).toUpperCase() + KetQua.substring(1);
  return KetQua + " đồng chẵn";
}

function _safeMath(expr) {
  try {
    const clean = expr.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '');
    const tokens = clean.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;
    let stack = [parseFloat(tokens[0])];
    if (isNaN(stack[0])) return null;
    let ops = [];
    for (let i = 1; i < tokens.length; i += 2) {
      let op = tokens[i], next = parseFloat(tokens[i+1]);
      if (isNaN(next)) return null;
      if (op === '*') stack[stack.length-1] *= next;
      else if (op === '/') stack[stack.length-1] /= (next===0?1:next);
      else { ops.push(op); stack.push(next); }
    }
    let res = stack[0];
    for (let j = 0; j < ops.length; j++) {
      if (ops[j] === '+') res += stack[j+1];
      else if (ops[j] === '-') res -= stack[j+1];
    }
    return isFinite(res) ? Math.round(res) : null;
  } catch(e) { return null; }
}

function parseCurrency(str) {
  if (!str) return 0;
  const s = str.toString();
  if (/[+\-*/]/.test(s)) {
    const res = _safeMath(s);
    if (res !== null) return res;
  }
  const parsed = parseInt(s.replace(/[^\d]/g, ''), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function extFmt(amount) {
  const s = getSettings();
  const sep = (s.extension && s.extension.numFormat === 'comma') ? ',' : '.';
  let rounded = Math.round(Number(amount || 0));
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function render() {
  let contentHtml = '';
  if (_activeTab === 'calc') contentHtml = _renderCalcTab();
  else if (_activeTab === 'qr') contentHtml = _renderQRTab();
  else if (_activeTab === 'tts') contentHtml = _renderTTSTab();
  else if (_activeTab === 'tools') contentHtml = _renderToolsTab();
  else if (_activeTab === 'settings') contentHtml = _renderSettingsTab();

  return `
    <div class="view-container">
      <div class="section-header">
        <h2 class="section-title">Tiện ích & Mở rộng</h2>
      </div>

      <div class="settings-tabs">
        ${_tabs.map(t => `
          <button class="settings-tab ${_activeTab === t.key ? 'active' : ''}" data-stab="${t.key}">
            <span class="material-symbols-rounded">${t.icon}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>

      <div class="extension-content">
        ${contentHtml}
      </div>
    </div>
  `;
}

// ── CALC TAB ─────────────────────────────────────────────
function _renderCalcTab() {
  const s = getSettings();
  const ext = s.extension || {};
  const defTax = ext.defaultTax || 8;

  return `
    <div class="max-w-4xl mx-auto">
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        
        <!-- Decoration background -->
        <div class="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div class="p-6 md:p-8 relative z-10 flex flex-col md:flex-row gap-8 items-center">
          
          <!-- LEFT: Inputs -->
          <div class="w-full md:w-1/2 flex flex-col gap-5">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                <span class="material-symbols-rounded text-2xl">calculate</span>
              </div>
              <div>
                <h3 class="font-black text-slate-800 text-2xl tracking-tight">Máy tính Thuế</h3>
                <p class="text-sm font-medium text-slate-500">Hỗ trợ nhập phép tính (+ - * /)</p>
              </div>
            </div>

            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">Loại tính toán</label>
              <div class="relative">
                <select id="ext-calc-type" class="form-control w-full bg-slate-50/80 border-slate-200 hover:border-blue-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 appearance-none pr-10 font-bold text-slate-700 h-14 rounded-xl transition-all shadow-sm">
                  <option value="1">Giá chưa thuế ➔ Giá đã thuế</option>
                  <option value="2">Giá đã thuế ➔ Giá chưa thuế</option>
                  <option value="3">Tiền thuế ➔ Giá chưa thuế</option>
                  <option value="4">Tiền thuế ➔ Giá đã thuế</option>
                </select>
                <span class="material-symbols-rounded absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none font-bold">expand_more</span>
              </div>
            </div>

            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-bold text-slate-700">Giá trị (VNĐ)</label>
                <div id="ext-calc-formula" class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md transition-all tracking-wide min-h-[22px]"></div>
              </div>
              <input type="text" id="ext-input-1" class="form-control w-full text-right font-black text-2xl md:text-3xl h-16 bg-slate-50/80 border-slate-200 hover:border-blue-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-slate-800 placeholder:text-slate-300 transition-all tracking-tight shadow-sm" placeholder="0" autocomplete="off">
            </div>

            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">Thuế suất (%)</label>
              <div class="flex gap-3">
                <input type="number" id="ext-input-2" class="form-control w-24 text-center font-black text-xl bg-slate-50/80 border-slate-200 hover:border-blue-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl h-12 transition-all shadow-sm" value="${defTax}">
                <div class="flex flex-1 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner">
                  <button class="ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all ${defTax == 0 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}" data-val="0">0%</button>
                  <button class="ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all ${defTax == 5 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}" data-val="5">5%</button>
                  <button class="ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all ${defTax == 8 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}" data-val="8">8%</button>
                  <button class="ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all ${defTax == 10 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}" data-val="10">10%</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Divider for Mobile -->
          <div class="w-full h-px bg-slate-100 md:hidden my-2"></div>
          <!-- Divider for Desktop -->
          <div class="hidden md:block w-px h-[320px] bg-gradient-to-b from-transparent via-slate-200 to-transparent mx-4"></div>

          <!-- RIGHT: Result -->
          <div class="w-full md:w-1/2 flex flex-col items-center justify-center text-center p-6 md:p-8 bg-slate-50/50 rounded-3xl border border-slate-100">
            <div id="ext-res-label" class="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span class="w-8 h-px bg-slate-300"></span>
              Kết quả tính toán
              <span class="w-8 h-px bg-slate-300"></span>
            </div>
            
            <div class="relative w-full">
              <div id="ext-res-main" class="text-5xl md:text-[3.5rem] leading-[1.1] font-black mb-6 text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-600 tracking-tighter truncate w-full px-2 pb-2">0 đ</div>
            </div>
            
            <div id="ext-res-sub" class="text-sm font-bold text-slate-600 mb-6 bg-white py-3 px-6 rounded-2xl border border-slate-200/80 shadow-[0_4px_15px_-3px_rgba(0,0,0,0.05)] flex items-center gap-2 transition-all">
              Tiền thuế: <span class="text-emerald-600 font-black text-xl">0 đ</span>
            </div>
            
            <div class="w-full max-w-[280px]">
              <div id="ext-res-words" class="text-sm font-medium italic text-slate-500 mb-8 leading-relaxed">Không đồng</div>
            </div>
            
            <button id="ext-copy-btn" class="group flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white w-full max-w-[260px] py-4 rounded-2xl font-bold shadow-lg shadow-slate-900/20 transition-all active:scale-95 border border-slate-700">
              <span class="material-symbols-rounded text-xl group-hover:scale-110 transition-transform text-blue-300">content_copy</span> 
              <span>Sao chép kết quả</span>
            </button>
          </div>

        </div>
      </div>
      
      <!-- Lịch sử thao tác -->
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div class="bg-slate-50/80 p-5 border-b border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
              <span class="material-symbols-rounded text-lg">history</span>
            </div>
            <h3 class="font-bold text-slate-700 tracking-tight">Lịch sử tính toán</h3>
            <span class="text-[11px] font-bold text-slate-400 bg-slate-200/50 px-2.5 py-1 rounded-full uppercase tracking-wider">10 gần nhất</span>
          </div>
          <button id="ext-clear-history" class="text-sm text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1">
            <span class="material-symbols-rounded text-[18px]">delete</span>
            Xóa
          </button>
        </div>
        <div class="p-2" id="ext-calc-history">
          <div class="text-center text-slate-400 py-8 font-medium text-sm">Chưa có lịch sử tính toán</div>
        </div>
      </div>
    </div>
  `;
}

// ── VIETQR TAB ───────────────────────────────────────────
function _renderQRTab() {
  return `
    <div class="max-w-4xl mx-auto">
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        
        <!-- Decoration background -->
        <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div class="p-6 md:p-8 relative z-10 flex flex-col md:flex-row gap-8 items-center">
          
          <!-- LEFT: Inputs -->
          <div class="w-full md:w-1/2 flex flex-col gap-5">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <span class="material-symbols-rounded text-2xl">qr_code_2</span>
              </div>
              <div>
                <h3 class="font-black text-slate-800 text-2xl tracking-tight">Tạo mã VietQR</h3>
                <p class="text-sm font-medium text-slate-500">Hỗ trợ nhận tiền hơn 50 ngân hàng</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-bold text-slate-700 mb-2">Ngân hàng</label>
                <div class="relative">
                  <select id="ext-qr-bank" class="form-control w-full bg-slate-50/80 border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 appearance-none pr-10 font-bold text-slate-700 h-14 rounded-xl transition-all shadow-sm">
                    <option value="">-- Chọn ngân hàng --</option>
                    <optgroup label="Ngân hàng phổ biến">
                      <option value="VCB">Vietcombank - Ngân hàng Ngoại thương</option>
                      <option value="CTG">VietinBank - Ngân hàng Công Thương</option>
                      <option value="BIDV">BIDV - Đầu tư và Phát triển</option>
                      <option value="VBA">Agribank - Ngân hàng Nông nghiệp</option>
                      <option value="MB">MBBank - Ngân hàng Quân Đội</option>
                      <option value="TCB">Techcombank - Ngân hàng Kỹ Thương</option>
                      <option value="ACB">ACB - Ngân hàng Á Châu</option>
                      <option value="VPB">VPBank - Việt Nam Thịnh Vượng</option>
                      <option value="TPB">TPBank - Ngân hàng Tiên Phong</option>
                      <option value="STB">Sacombank - Sài Gòn Thương Tín</option>
                      <option value="HDB">HDBank - Phát triển TP.HCM</option>
                      <option value="VIB">VIB - Ngân hàng Quốc Tế</option>
                      <option value="SHB">SHB - Sài Gòn-Hà Nội</option>
                      <option value="MSB">MSB - Ngân hàng Hàng Hải</option>
                      <option value="LPB">LPBank - Lộc Phát Việt Nam</option>
                      <option value="EIB">Eximbank - Xuất Nhập Khẩu</option>
                      <option value="SEAB">SeABank - Đông Nam Á</option>
                      <option value="OCB">OCB - Ngân hàng Phương Đông</option>
                    </optgroup>
                    <optgroup label="Khối TMCP & Khác">
                      <option value="ABB">ABBank - An Bình</option>
                      <option value="NAB">Nam A Bank - Nam Á</option>
                      <option value="VAB">VietABank - Ngân hàng Việt Á</option>
                      <option value="VCCB">BVBank - Ngân hàng Bản Việt</option>
                      <option value="BVB">BaoVietBank - Ngân hàng Bảo Việt</option>
                      <option value="BAB">BacABank - Ngân hàng Bắc Á</option>
                      <option value="DAB">DongABank - Ngân hàng Đông Á</option>
                      <option value="KLB">KienLongBank - Ngân hàng Kiên Long</option>
                      <option value="NCB">NCB - Ngân hàng Quốc Dân</option>
                      <option value="PGB">PGBank - Ngân hàng Thịnh vượng và Phát triển</option>
                      <option value="PVCB">PVcomBank - Đại Chúng Việt Nam</option>
                      <option value="SGB">SaigonBank - Sài Gòn Công Thương</option>
                      <option value="VIETBANK">VietBank - Việt Nam Thương Tín</option>
                      <option value="CBB">CBBank - Ngân hàng Xây Dựng</option>
                      <option value="GPB">GPBank - Dầu Khí Toàn Cầu</option>
                      <option value="OJB">Oceanbank - Ngân hàng Đại Dương</option>
                      <option value="COOPBANK">Co-opBank - Ngân hàng Hợp tác xã</option>
                      <option value="SCB">SCB - Ngân hàng Sài Gòn</option>
                      <option value="VRB">VRB - Liên doanh Việt - Nga</option>
                    </optgroup>
                    <optgroup label="Nước ngoài & Ví điện tử">
                      <option value="SHBVN">ShinhanBank - Ngân hàng Shinhan</option>
                      <option value="WOORI">Woori - Ngân hàng Woori</option>
                      <option value="UOB">UOB - United Overseas Bank</option>
                      <option value="CIMB">CIMB - Ngân hàng CIMB</option>
                      <option value="PUBLICBANK">PublicBank - Public Bank Việt Nam</option>
                      <option value="CITIBANK">Citibank - Ngân hàng Citibank</option>
                      <option value="SCVN">Standard Chartered - Standard Chartered VN</option>
                      <option value="IBK">IBK - Ngân hàng Công nghiệp Hàn Quốc</option>
                      <option value="KEBHANAHN">KEB Hana HN - KEB Hana Hà Nội</option>
                      <option value="KEBHANAHCM">KEB Hana HCM - KEB Hana Hồ Chí Minh</option>
                      <option value="NHB">Nonghyup - Ngân hàng Nonghyup</option>
                      <option value="KookminHN">Kookmin HN - Kookmin Hà Nội</option>
                      <option value="KookminHCM">Kookmin HCM - Kookmin Hồ Chí Minh</option>
                      <option value="MAFC">Mirae Asset - Tài chính Mirae Asset</option>
                      <option value="CAKE">Cake - Cake by VPBank</option>
                      <option value="UBANK">Ubank - Ubank by VPBank</option>
                      <option value="TIMO">Timo - Timo by BVBank</option>
                      <option value="VTCB">Viettel Money - Dịch vụ số Viettel</option>
                      <option value="VNPTMONEY">VNPT Money - Dịch vụ số VNPT</option>
                    </optgroup>
                  </select>
                  <span class="material-symbols-rounded absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none font-bold">expand_more</span>
                </div>
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-bold text-slate-700 mb-2">Số tài khoản</label>
                <input type="text" id="ext-qr-acc" class="form-control w-full h-12 bg-slate-50/80 border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl font-black text-lg text-slate-800 transition-all shadow-sm" placeholder="Nhập số tài khoản">
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-bold text-slate-700 mb-2">Tên chủ tài khoản (Không dấu)</label>
                <input type="text" id="ext-qr-name" class="form-control w-full h-12 bg-slate-50/80 border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl font-bold uppercase text-slate-700 transition-all shadow-sm" placeholder="VD: NGUYEN VAN A">
              </div>

              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">Số tiền (Tùy chọn)</label>
                <input type="text" id="ext-qr-amount" class="form-control w-full h-12 text-right font-black text-emerald-600 bg-slate-50/80 border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl transition-all shadow-sm" placeholder="0">
              </div>
              
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">Nội dung (Tùy chọn)</label>
                <input type="text" id="ext-qr-content" class="form-control w-full h-12 bg-slate-50/80 border-slate-200 hover:border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl font-medium text-slate-700 transition-all shadow-sm" placeholder="Thanh toan">
              </div>
            </div>

            <div class="flex gap-3 mt-2">
              <button id="ext-qr-gen" class="btn-primary flex-1 py-4 text-base font-bold bg-emerald-600 hover:bg-emerald-700 border-none shadow-md shadow-emerald-200 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95">
                <span class="material-symbols-rounded">magic_button</span> Tạo mã VietQR
              </button>
              <button id="ext-qr-clear" class="btn-secondary w-14 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 border-none rounded-xl transition-colors shadow-sm" title="Xóa trắng">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <!-- Divider for Mobile -->
          <div class="w-full h-px bg-slate-100 md:hidden my-2"></div>
          <!-- Divider for Desktop -->
          <div class="hidden md:block w-px h-[480px] bg-gradient-to-b from-transparent via-slate-200 to-transparent mx-4"></div>

          <!-- RIGHT: Result -->
          <div class="w-full md:w-1/2 flex flex-col items-center justify-center min-h-[400px] p-6 md:p-8 bg-slate-50/50 rounded-3xl border border-slate-100 relative overflow-hidden">
            
            <div id="ext-qr-result" class="hidden text-center w-full relative z-10 flex flex-col items-center">
              <div class="bg-white p-4 rounded-3xl shadow-lg border border-slate-200/80 mb-6 group relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <img id="ext-qr-img" src="" class="rounded-xl w-[240px] h-[240px] object-cover relative z-10 transition-transform group-hover:scale-[1.02]">
              </div>
              <div id="ext-qr-info" class="text-sm font-medium text-slate-700 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.05)] w-full max-w-[320px] text-left"></div>
            </div>
            
            <div id="ext-qr-placeholder" class="text-center text-slate-400 relative z-10 border-2 border-dashed border-slate-200/80 p-10 rounded-3xl bg-slate-50/50 w-full max-w-[320px]">
              <span class="material-symbols-rounded text-6xl mb-4 opacity-30 text-emerald-600">qr_code_scanner</span>
              <p class="font-bold text-sm text-slate-500">Điền thông tin và nhấn Tạo mã<br>để hiển thị QR tại đây</p>
            </div>
          </div>

        </div>
      </div>

      <!-- Mẫu QR đã lưu -->
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div class="bg-slate-50/80 p-5 border-b border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
              <span class="material-symbols-rounded text-lg">bookmarks</span>
            </div>
            <h3 class="font-bold text-slate-700 tracking-tight">Mẫu QR đã lưu</h3>
            <span class="text-[11px] font-bold text-slate-400 bg-slate-200/50 px-2.5 py-1 rounded-full uppercase tracking-wider">Tự động lưu</span>
          </div>
        </div>
        <div class="p-4" id="ext-qr-history">
          <!-- Render saved templates here -->
        </div>
      </div>
    </div>
  `;
}

// ── TTS TAB ──────────────────────────────────────────────
function _renderTTSTab() {
  const s = getSettings();
  const ext = s.extension || {};
  const ttsKey = ext.ttsKey || '';
  const provider = ext.ttsProvider || 'google';

  return `
    <div class="grid grid-cols-1 md:grid-cols-5 gap-5">
      <div class="md:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-purple-50 to-white p-6 border-b border-purple-50/50 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shadow-inner">
            <span class="material-symbols-rounded">campaign</span>
          </div>
          <h3 class="font-bold text-slate-800 text-lg">Phát loa thông báo (TTS)</h3>
        </div>
        
        <div class="p-6">
          <!-- Predefined templates container -->
          <div class="mb-5">
            <div class="flex justify-between items-center mb-2.5">
              <label class="block text-sm font-bold text-slate-700">Mẫu thông báo nhanh</label>
              <button id="ext-tts-add-tpl-btn" class="flex items-center gap-1 text-xs font-black text-purple-600 hover:text-purple-700 transition-colors">
                <span class="material-symbols-rounded text-base">add_circle</span> Thêm mẫu mới
              </button>
            </div>
            
            <!-- Add new template inline form -->
            <div id="ext-tts-new-tpl-form" class="hidden flex flex-col gap-3 p-4 bg-purple-50/50 rounded-xl border border-purple-100 mb-3 shadow-inner">
              <div class="text-xs font-black text-purple-800 uppercase tracking-wide">Tạo mẫu thông báo mới</div>
              <div class="grid grid-cols-1 gap-2.5">
                <input type="text" id="new-tpl-name" class="form-control text-xs font-bold bg-white" placeholder="Tên gợi nhớ (Ví dụ: Dời xe 🚗)">
                <input type="text" id="new-tpl-value" class="form-control text-xs bg-white" placeholder="Nội dung phát (Ví dụ: Xin mời bàn {ban} qua quầy thanh toán)">
              </div>
              <div class="flex justify-end gap-2 mt-1">
                <button id="new-tpl-cancel" class="btn btn-outline py-1 px-3 text-xs">Hủy</button>
                <button id="new-tpl-save" class="btn btn-primary py-1 px-3 text-xs bg-purple-600 hover:bg-purple-700 border-none text-white font-bold">Lưu mẫu</button>
              </div>
            </div>

            <!-- Predefined templates list -->
            <div class="flex flex-wrap gap-2 mb-3" id="ext-tts-tpl-list"></div>

            <!-- Predefined template parameters input grid -->
            <div id="ext-tts-params-container" class="hidden grid grid-cols-2 gap-3 bg-purple-50/30 p-3 rounded-xl border border-purple-100 shadow-inner mb-4"></div>
          </div>

          <div class="mb-5">
            <label class="block text-sm font-bold text-slate-700 mb-1.5">Nội dung cần phát</label>
            <textarea id="ext-tts-text" class="form-control resize-none bg-slate-50 focus:bg-white leading-relaxed font-semibold text-slate-800" rows="3" placeholder="Chọn một mẫu ở trên hoặc tự gõ nội dung cần phát thanh tại đây..."></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4 mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <div>
              <label class="block text-sm font-semibold text-slate-600 mb-1.5">Giọng đọc</label>
              <div class="relative">
                <select id="ext-tts-voice" class="form-control bg-white appearance-none pr-8">
                  <option value="nu-bac">Nữ miền Bắc</option>
                  <option value="nam-bac">Nam miền Bắc</option>
                  <option value="nu-nam">Nữ miền Nam</option>
                  <option value="nam-nam">Nam miền Nam</option>
                </select>
                <span class="material-symbols-rounded absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">expand_more</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-600 mb-1.5">Tốc độ</label>
              <div class="relative">
                <select id="ext-tts-speed" class="form-control bg-white appearance-none pr-8">
                  <option value="0.8">Chậm</option>
                  <option value="1.0" selected>Bình thường</option>
                  <option value="1.2">Nhanh</option>
                </select>
                <span class="material-symbols-rounded absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">expand_more</span>
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <button id="ext-tts-play" class="btn-secondary flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors">
              <span class="material-symbols-rounded text-slate-500">volume_up</span> Đọc (Hệ thống)
            </button>
            <button id="ext-tts-api-play" class="btn-primary flex-[1.5] py-3 text-base font-bold flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 border-none shadow-sm shadow-purple-200">
              <span class="material-symbols-rounded">graphic_eq</span> Dùng AI (Khuyên dùng)
            </button>
          </div>
        </div>
      </div>

      <div class="md:col-span-2 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-6 border-b border-slate-200 bg-white/50 backdrop-blur">
          <h3 class="font-bold text-slate-800 flex items-center gap-2 text-base">
            <span class="material-symbols-rounded text-slate-400">settings_applications</span>
            Cấu hình API & Đám mây
          </h3>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <div class="mb-4">
            <label class="block text-sm font-semibold text-slate-600 mb-1.5">Nhà cung cấp</label>
            <div class="relative">
              <select id="ext-tts-provider" class="form-control bg-white appearance-none pr-8 font-medium">
                <option value="google" ${provider === 'google' ? 'selected' : ''}>Google Translate TTS (Miễn phí & Rất ổn định)</option>
                <option value="fpt" ${provider === 'fpt' ? 'selected' : ''}>FPT AI TTS</option>
                <option value="viettel" ${provider === 'viettel' ? 'selected' : ''}>Viettel AI</option>
              </select>
              <span class="material-symbols-rounded absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">expand_more</span>
            </div>
          </div>
          
          <div class="mb-6 flex-1 flex flex-col justify-between">
            <div id="ext-tts-key-container">
              <label class="block text-sm font-semibold text-slate-600 mb-1.5">API Key</label>
              <input type="password" id="ext-tts-key" class="form-control bg-white" value="${ttsKey}" placeholder="Dùng key hệ thống mặc định">
            </div>
            
            <div class="mt-4 bg-purple-50 text-purple-700 text-[11px] leading-relaxed p-3 rounded-lg border border-purple-100">
              <b class="block mb-1">💡 Mẹo phát loa thông báo:</b>
              - <b>Google TTS:</b> Hoàn toàn miễn phí, tốc độ phản hồi cực nhanh, giọng đọc chuẩn quốc tế, không giới hạn ký tự và hoàn toàn không cần cấu hình API key!<br>
              - <b>FPT/Viettel AI:</b> Giọng điệu tự nhiên, ngắt nghỉ đúng chỗ, hỗ trợ đa vùng miền, cần cấu hình API key để sử dụng.
            </div>
          </div>
          
          <div class="flex flex-col gap-2">
            <button id="ext-tts-sync-cloud" class="btn-outline w-full py-2.5 font-bold flex items-center justify-center gap-2 border-dashed border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
              <span class="material-symbols-rounded text-slate-500">sync</span> Đồng bộ cấu hình đám mây
            </button>
            <button id="ext-tts-save-key" class="btn-secondary w-full py-2.5 font-bold">Lưu cấu hình</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── TOOLS TAB ────────────────────────────────────────────
function _renderToolsTab() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      
      <!-- Tra cứu MST -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-6 border-b border-slate-100 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner">
            <span class="material-symbols-rounded">corporate_fare</span>
          </div>
          <h3 class="font-bold text-slate-800 text-lg">Tra cứu Mã số thuế</h3>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <div class="flex gap-2 mb-4">
            <div class="relative flex-1">
              <span class="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input type="text" id="ext-mst-input" class="form-control pl-10 bg-slate-50 focus:bg-white" placeholder="Nhập MST công ty...">
            </div>
            <button id="ext-mst-btn" class="btn-primary font-bold px-5 bg-orange-500 hover:bg-orange-600 border-none shadow-sm shadow-orange-200">Tra cứu</button>
          </div>
          <div id="ext-mst-result" class="p-4 bg-slate-50/50 rounded-xl border border-slate-200 text-sm hidden flex-1"></div>
        </div>
      </div>

      <!-- Ngoại tệ -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-6 border-b border-slate-100 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shadow-inner">
            <span class="material-symbols-rounded">currency_exchange</span>
          </div>
          <h3 class="font-bold text-slate-800 text-lg">Đổi ngoại tệ</h3>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-5">
            <div class="relative">
              <select id="ext-cur-from" class="form-control bg-slate-50 appearance-none pr-8 font-bold text-center"><option value="USD">USD</option><option value="VND">VND</option><option value="EUR">EUR</option></select>
              <span class="material-symbols-rounded absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">expand_more</span>
            </div>
            <span class="material-symbols-rounded text-slate-300">arrow_forward</span>
            <div class="relative">
              <select id="ext-cur-to" class="form-control bg-slate-50 appearance-none pr-8 font-bold text-center"><option value="VND">VND</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
              <span class="material-symbols-rounded absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">expand_more</span>
            </div>
          </div>
          
          <input type="text" id="ext-cur-amount" class="form-control mb-5 text-center font-bold text-lg h-12 bg-slate-50 focus:bg-white" placeholder="Nhập số tiền...">
          
          <div class="text-center mt-auto p-4 rounded-xl bg-slate-50/50 border border-slate-100">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Kết quả</div>
            <div id="ext-cur-result" class="text-3xl font-black text-cyan-600 drop-shadow-sm">0 VND</div>
            <div id="ext-cur-rate" class="text-[10px] text-slate-400 mt-2 flex justify-center items-center gap-1">
              <span class="material-symbols-rounded text-[12px]">schedule</span> Cập nhật tỷ giá trực tuyến
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

// ── SETTINGS TAB ─────────────────────────────────────────
function _renderSettingsTab() {
  const s = getSettings();
  const ext = s.extension || {};
  const numFormat = ext.numFormat || 'dot';

  return `
    <div class="max-w-2xl mx-auto">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-6 border-b border-slate-100 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shadow-inner">
            <span class="material-symbols-rounded">settings</span>
          </div>
          <h3 class="font-bold text-slate-800 text-lg">Cài đặt tiện ích mở rộng</h3>
        </div>
        
        <div class="p-6">
          <div class="mb-6">
            <label class="block text-sm font-semibold text-slate-700 mb-2">Định dạng số tiền (Dấu phân cách hàng nghìn)</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer p-3 border border-slate-200 rounded-xl flex-1 hover:bg-slate-50 transition-colors">
                <input type="radio" name="ext_num_format" value="dot" ${numFormat === 'dot' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                <span class="font-medium text-slate-700">Dấu chấm (100.000)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-3 border border-slate-200 rounded-xl flex-1 hover:bg-slate-50 transition-colors">
                <input type="radio" name="ext_num_format" value="comma" ${numFormat === 'comma' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                <span class="font-medium text-slate-700">Dấu phẩy (100,000)</span>
              </label>
            </div>
          </div>
          
          <button id="ext-settings-save" class="btn-primary w-full py-3 text-base shadow-sm">Lưu cài đặt</button>
        </div>
      </div>
    </div>
  `;
}

// ── INITIALIZATION ───────────────────────────────────────
export function init() {
  // Bind tabs
  const tabs = document.querySelectorAll('.settings-tab[data-stab]');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function() {
      _activeTab = this.getAttribute('data-stab');
      const root = document.getElementById('viewContainer');
      if (root) {
        root.innerHTML = render();
        init(); // re-bind events
      }
    });
  }

  // Bind Calc Logic
  if (_activeTab === 'calc') {
    const input1 = document.getElementById('ext-input-1');
    const input2 = document.getElementById('ext-input-2');
    const typeSel = document.getElementById('ext-calc-type');
    const presets = document.querySelectorAll('.ext-preset-btn');
    const historyContainer = document.getElementById('ext-calc-history');
    
    const renderHistory = () => {
      if (!_history || _history.length === 0) {
        historyContainer.innerHTML = '<div class="text-center text-slate-400 py-4 italic text-sm">Chưa có lịch sử tính toán</div>';
        return;
      }
      historyContainer.innerHTML = _history.map(item => `
        <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 rounded-lg transition-colors">
          <div class="text-sm">
            <div class="font-semibold text-slate-700">${item.typeStr}</div>
            <div class="text-slate-500 text-xs">Giá trị: ${item.val} | Thuế: ${item.tax}%</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-blue-600">${item.main}</div>
            <div class="text-xs text-emerald-600">Thuế: ${item.sub}</div>
          </div>
        </div>
      `).join('');
    };
    renderHistory();
    
    document.getElementById('ext-clear-history').addEventListener('click', () => {
      _history = [];
      renderHistory();
      showToast('Đã xóa lịch sử');
    });

    const updateCalc = () => {
      const v1 = parseCurrency(input1.value);
      const rate = parseFloat(input2.value) || 0;
      const type = typeSel.value;
      
      let resMain = 0;
      let resSub = 0;
      let subLabel = "Tiền thuế";

      if (v1 > 0) {
        if (type === "1") {
          resSub = v1 * (rate / 100);
          resMain = v1 + resSub;
          subLabel = "Tiền thuế";
        } else if (type === "2") {
          resMain = v1 / (1 + rate / 100);
          resSub = v1 - resMain;
          subLabel = "Tiền thuế";
        } else if (type === "3") {
          resMain = v1 / (rate / 100);
          resSub = resMain + v1;
          subLabel = "Giá đã thuế";
        } else if (type === "4") {
          resSub = v1 / (rate / 100);
          resMain = resSub + v1;
          subLabel = "Giá chưa thuế";
        }
      }

      document.getElementById('ext-res-main').innerText = extFmt(resMain) + ' đ';
      document.getElementById('ext-res-sub').innerHTML = `${subLabel}: <span class="text-emerald-600 font-bold">${extFmt(resSub)} đ</span>`;
      document.getElementById('ext-res-words').innerText = v1 > 0 ? docTienBangChu(Math.round(resMain)) : "Không đồng";
    };

    input1.addEventListener('input', (e) => {
      let raw = e.target.value;
      // Strip non-math and non-numeric characters immediately
      raw = raw.replace(/[^0-9.,\s+\-*/]/g, '');
      
      const s = getSettings();
      const sep = (s.extension && s.extension.numFormat === 'comma') ? ',' : '.';
      
      let clean = raw.replace(/[.,\s]/g, '');
      if (clean === '') {
        e.target.value = '';
        const formulaEl = document.getElementById('ext-calc-formula');
        if (formulaEl) formulaEl.innerText = '';
        updateCalc();
        return;
      }
      let formatted = clean.replace(/\d+/g, function(match) {
        return match.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      });
      
      const caret = e.target.selectionStart;
      const oldLen = e.target.value.length;
      
      e.target.value = formatted;
      
      const newLen = formatted.length;
      if (document.activeElement === e.target) {
        let newCaret = caret + (newLen - oldLen);
        if (newCaret < 0) newCaret = 0;
        e.target.setSelectionRange(newCaret, newCaret);
      }
      
      // Live-render the formula above the input box (e.g. "1.500.000 + 150.000")
      const formulaEl = document.getElementById('ext-calc-formula');
      if (formulaEl) {
        if (/[+\-*/]/.test(formatted)) {
          formulaEl.innerText = formatted.replace(/\s*([+\-*/])\s*/g, ' $1 ');
        } else {
          formulaEl.innerText = '';
        }
      }
      
      updateCalc();
    });
    input2.addEventListener('input', () => {
      presets.forEach(p => p.className = 'ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all text-slate-500 hover:text-slate-700 hover:bg-slate-200/50');
      updateCalc();
    });
    typeSel.addEventListener('change', updateCalc);

    presets.forEach(btn => {
      btn.addEventListener('click', () => {
        presets.forEach(p => p.className = 'ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all text-slate-500 hover:text-slate-700 hover:bg-slate-200/50');
        btn.className = 'ext-preset-btn flex-1 rounded-lg text-sm font-bold transition-all bg-white text-blue-600 shadow-sm';
        input2.value = btn.getAttribute('data-val');
        updateCalc();
      });
    });

    const saveToHistory = () => {
      const v1 = parseCurrency(input1.value);
      if (v1 <= 0) return;
      
      const rate = parseFloat(input2.value) || 0;
      const typeStr = typeSel.options[typeSel.selectedIndex].text;
      
      _history.unshift({
        typeStr,
        val: input1.value,
        tax: rate,
        main: document.getElementById('ext-res-main').innerText,
        sub: document.getElementById('ext-res-sub').innerText.replace('Tiền thuế: ', '').replace('Giá đã thuế: ', '').replace('Giá chưa thuế: ', '')
      });
      if (_history.length > 10) _history.pop();
      renderHistory();
    };

    input1.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const raw = e.target.value;
        const s = getSettings();
        const sep = (s.extension && s.extension.numFormat === 'comma') ? ',' : '.';
        
        if (/[+\-*/]/.test(raw)) {
          const result = parseCurrency(raw);
          if (result > 0) {
            // Update formula above to show calculated state (e.g., "1.500.000 + 150.000 =")
            const formulaEl = document.getElementById('ext-calc-formula');
            if (formulaEl) {
              const formattedFormula = raw.replace(/\s*([+\-*/])\s*/g, ' $1 ');
              formulaEl.innerText = formattedFormula + ' =';
            }
            
            // Set input box value to evaluated result formatted neatly
            const formattedResult = result.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
            e.target.value = formattedResult;
            
            // Trigger recalculation of VAT values
            updateCalc();
          }
        }
        saveToHistory();
      }
    });

    document.getElementById('ext-copy-btn').addEventListener('click', () => {
      const val = document.getElementById('ext-res-main').innerText.replace(' đ', '').replace(/\./g, '').replace(/,/g, '');
      navigator.clipboard.writeText(val);
      showToast('Đã sao chép kết quả!');
      saveToHistory();
    });
  }

  // Bind QR Logic
  if (_activeTab === 'qr') {
    const btnGen = document.getElementById('ext-qr-gen');
    const btnClear = document.getElementById('ext-qr-clear');
    const amtInput = document.getElementById('ext-qr-amount');
    const historyContainer = document.getElementById('ext-qr-history');
    
    const s = getSettings();
    if (s.extension && s.extension.qrTemplates) {
      _qrTemplates = s.extension.qrTemplates;
    }

    const renderQRHistory = () => {
      if (!_qrTemplates || _qrTemplates.length === 0) {
        historyContainer.innerHTML = '<div class="text-center text-slate-400 py-8 font-medium text-sm">Chưa có mẫu QR nào được lưu</div>';
        return;
      }
      historyContainer.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + _qrTemplates.map((item, idx) => `
        <div class="flex items-center justify-between p-4 border border-slate-200/60 bg-slate-50/50 rounded-2xl hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer group" onclick="window._loadQRTemplate(${idx})">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-emerald-600 shadow-sm group-hover:scale-105 transition-transform">
              ${item.bank}
            </div>
            <div>
              <div class="font-bold text-slate-700 text-base tracking-tight">${item.acc}</div>
              <div class="text-xs font-semibold text-slate-500 uppercase">${item.name || 'Không có tên'}</div>
            </div>
          </div>
          <button class="w-8 h-8 rounded-full bg-white border border-slate-200 text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors shadow-sm" onclick="event.stopPropagation(); window._deleteQRTemplate(${idx})">
            <span class="material-symbols-rounded text-[18px]">delete</span>
          </button>
        </div>
      `).join('') + '</div>';
    };

    window._loadQRTemplate = (idx) => {
      const item = _qrTemplates[idx];
      if (!item) return;
      document.getElementById('ext-qr-bank').value = item.bank;
      document.getElementById('ext-qr-acc').value = item.acc;
      document.getElementById('ext-qr-name').value = item.name;
      document.getElementById('ext-qr-amount').value = item.amount ? formatCurrency(item.amount) : '';
      document.getElementById('ext-qr-content').value = item.content || '';
      
      // Persist as last selected QR template
      const st = getSettings();
      if (!st.extension) st.extension = {};
      st.extension.lastSelectedQr = item;
      updateSettings(st);
      
      btnGen.click();
    };

    window._deleteQRTemplate = (idx) => {
      const item = _qrTemplates[idx];
      _qrTemplates.splice(idx, 1);
      const st = getSettings();
      if (!st.extension) st.extension = {};
      st.extension.qrTemplates = _qrTemplates;
      
      // Update last selected QR if it matches the deleted one
      if (st.extension.lastSelectedQr && st.extension.lastSelectedQr.bank === item.bank && st.extension.lastSelectedQr.acc === item.acc) {
        st.extension.lastSelectedQr = _qrTemplates[0] || null;
      }
      
      updateSettings(st);
      renderQRHistory();
    };

    renderQRHistory();

    // Auto load the last selected or first template if exists
    if (_qrTemplates.length > 0) {
      const first = (s.extension && s.extension.lastSelectedQr) || _qrTemplates[0];
      document.getElementById('ext-qr-bank').value = first.bank;
      document.getElementById('ext-qr-acc').value = first.acc;
      document.getElementById('ext-qr-name').value = first.name;
      document.getElementById('ext-qr-amount').value = first.amount ? formatCurrency(first.amount) : '';
      document.getElementById('ext-qr-content').value = first.content || '';
      btnGen.click();
    }
    
    amtInput.addEventListener('input', (e) => {
      const val = parseCurrency(e.target.value);
      e.target.value = val === 0 ? '' : formatCurrency(val);
    });

    btnGen.addEventListener('click', () => {
      const bank = document.getElementById('ext-qr-bank').value;
      const acc = document.getElementById('ext-qr-acc').value.trim().replace(/\s/g, '');
      const name = document.getElementById('ext-qr-name').value.trim();
      const amount = parseCurrency(document.getElementById('ext-qr-amount').value);
      const content = document.getElementById('ext-qr-content').value.trim();

      if (!bank || !acc) {
        showToast('Vui lòng chọn Ngân hàng và nhập STK!');
        return;
      }

      const url = `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(name)}`;
      
      document.getElementById('ext-qr-placeholder').classList.add('hidden');
      const resContainer = document.getElementById('ext-qr-result');
      resContainer.classList.remove('hidden');
      
      const img = document.getElementById('ext-qr-img');
      img.src = url;
      document.getElementById('ext-qr-info').innerHTML = `
        <div class="font-black text-blue-700 text-lg mb-1 uppercase">${bank}</div>
        <div class="text-sm text-slate-500 mb-2">STK: <b class="text-slate-800 text-base">${acc}</b></div>
        <div class="text-sm text-slate-500 mb-3">Chủ TK: <b class="text-slate-800 uppercase">${name || 'Không có'}</b></div>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1">
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold text-slate-400">SỐ TIỀN</span>
            <span class="text-emerald-600 font-black text-lg">${formatCurrency(amount)} đ</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold text-slate-400">NỘI DUNG</span>
            <span class="text-sm font-semibold text-slate-700 truncate max-w-[150px]">${content || 'Thanh toan'}</span>
          </div>
        </div>
      `;

      // Save template
      const existingIdx = _qrTemplates.findIndex(t => t.bank === bank && t.acc === acc);
      const newTpl = { bank, acc, name, amount, content };
      if (existingIdx >= 0) {
        _qrTemplates.splice(existingIdx, 1);
      }
      _qrTemplates.unshift(newTpl);
      if (_qrTemplates.length > 10) _qrTemplates.pop();
      
      const st = getSettings();
      if (!st.extension) st.extension = {};
      st.extension.qrTemplates = _qrTemplates;
      updateSettings(st);
      renderQRHistory();
    });

    btnClear.addEventListener('click', () => {
      ['ext-qr-bank', 'ext-qr-acc', 'ext-qr-name', 'ext-qr-amount', 'ext-qr-content'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('ext-qr-placeholder').classList.remove('hidden');
      document.getElementById('ext-qr-result').classList.add('hidden');
    });
  }

  // Bind TTS Logic
  if (_activeTab === 'tts') {
    const btnPlaySys = document.getElementById('ext-tts-play');
    const btnPlayApi = document.getElementById('ext-tts-api-play');
    const btnSaveKey = document.getElementById('ext-tts-save-key');
    const btnSyncCloud = document.getElementById('ext-tts-sync-cloud');
    const providerSel = document.getElementById('ext-tts-provider');
    const keyContainer = document.getElementById('ext-tts-key-container');

    const toggleKeyInput = () => {
      if (providerSel.value === 'google') {
        if (keyContainer) keyContainer.style.display = 'none';
      } else {
        if (keyContainer) keyContainer.style.display = 'block';
      }
    };
    providerSel.addEventListener('change', toggleKeyInput);
    toggleKeyInput();

    const s = getSettings();
    const ext = s.extension || {};
    let _ttsTemplates = ext.ttsTemplates || [];

    let activeTplValue = '';
    window._applyTtsTemplate = function(idx) {
      const item = _ttsTemplates[idx];
      if (!item) return;
      activeTplValue = item.value;

      const matches = item.value.match(/\{[^}]+\}/g);
      const variables = matches ? [...new Set(matches)].map(m => m.slice(1, -1)) : [];

      const paramsContainer = document.getElementById('ext-tts-params-container');
      if (variables.length > 0) {
        paramsContainer.innerHTML = variables.map(v => `
          <div>
            <label class="block text-[10px] font-bold text-purple-700 uppercase mb-1">${v.replaceAll('_', ' ')}</label>
            <input type="text" data-var="${v}" class="form-input text-xs font-semibold border-purple-200 focus:border-purple-500 rounded-lg h-8" placeholder="Nhập giá trị...">
          </div>
        `).join('');
        paramsContainer.classList.remove('hidden');

        const inputs = paramsContainer.querySelectorAll('input[data-var]');
        const updateText = () => {
          let text = activeTplValue;
          inputs.forEach(input => {
            const vName = input.getAttribute('data-var');
            const val = input.value || `{${vName}}`;
            text = text.replaceAll(`{${vName}}`, val);
          });
          document.getElementById('ext-tts-text').value = text;
        };

        inputs.forEach(input => {
          input.addEventListener('input', updateText);
        });
        updateText();
      } else {
        paramsContainer.classList.add('hidden');
        document.getElementById('ext-tts-text').value = activeTplValue;
      }

      document.querySelectorAll('.ext-tts-chip').forEach((chip, i) => {
        if (i === idx) {
          chip.classList.add('bg-purple-100', 'border-purple-400', 'text-purple-800');
          chip.classList.remove('bg-slate-50', 'border-slate-200', 'text-slate-700');
        } else {
          chip.classList.remove('bg-purple-100', 'border-purple-400', 'text-purple-800');
          chip.classList.add('bg-slate-50', 'border-slate-200', 'text-slate-700');
        }
      });
    };

    window._deleteTtsTemplate = function(idx) {
      if (confirm('Bạn chắc chắn muốn xóa mẫu thông báo này?')) {
        _ttsTemplates.splice(idx, 1);
        saveTtsTemplates();
      }
    };

    const renderTtsTemplates = () => {
      const container = document.getElementById('ext-tts-tpl-list');
      if (!container) return;

      if (_ttsTemplates.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic py-2">Chưa có mẫu nào. Nhấn "+ Thêm mẫu" để tạo!</div>`;
        return;
      }

      container.innerHTML = _ttsTemplates.map((item, idx) => `
        <div class="ext-tts-chip flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer bg-slate-50 border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50/30 group" onclick="window._applyTtsTemplate(${idx})">
          <span>${item.name}</span>
          <button class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity" onclick="event.stopPropagation(); window._deleteTtsTemplate(${idx})">
            <span class="material-symbols-rounded text-[14px]">close</span>
          </button>
        </div>
      `).join('');
    };

    const saveTtsTemplates = () => {
      const st = getSettings();
      if (!st.extension) st.extension = {};
      st.extension.ttsTemplates = _ttsTemplates;
      updateSettings(st);
      renderTtsTemplates();
      
      import('../api.js').then(api => {
        if (api.saveSettingsToCloud) api.saveSettingsToCloud(st).catch(() => {});
      });
    };

    renderTtsTemplates();

    const addBtn = document.getElementById('ext-tts-add-tpl-btn');
    const form = document.getElementById('ext-tts-new-tpl-form');
    const cancelBtn = document.getElementById('new-tpl-cancel');
    const saveBtn = document.getElementById('new-tpl-save');

    addBtn.addEventListener('click', () => {
      form.classList.toggle('hidden');
      document.getElementById('new-tpl-name').focus();
    });

    cancelBtn.addEventListener('click', () => {
      form.classList.add('hidden');
      ['new-tpl-name', 'new-tpl-value'].forEach(id => document.getElementById(id).value = '');
    });

    saveBtn.addEventListener('click', () => {
      const name = document.getElementById('new-tpl-name').value.trim();
      const val = document.getElementById('new-tpl-value').value.trim();
      if (!name || !val) return showToast('Vui lòng điền đủ tên mẫu và nội dung mẫu!', 'warning');

      _ttsTemplates.push({ name, value: val });
      saveTtsTemplates();

      form.classList.add('hidden');
      ['new-tpl-name', 'new-tpl-value'].forEach(id => document.getElementById(id).value = '');
      showToast('Đã lưu mẫu thông báo mới!');
    });

    const readSys = () => {
      const text = document.getElementById('ext-tts-text').value;
      const speed = parseFloat(document.getElementById('ext-tts-speed').value) || 1.0;
      if (!text) return showToast('Vui lòng nhập nội dung!');
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN';
        u.rate = speed;
        speechSynthesis.speak(u);
      } else {
        showToast('Trình duyệt không hỗ trợ TTS hệ thống.');
      }
    };

    btnPlaySys.addEventListener('click', readSys);

    btnSaveKey.addEventListener('click', () => {
      const s = getSettings();
      if (!s.extension) s.extension = {};
      s.extension.ttsProvider = document.getElementById('ext-tts-provider').value;
      s.extension.ttsKey = document.getElementById('ext-tts-key').value.trim();
      updateSettings(s);
      showToast('Đã lưu cấu hình API!');
    });

    if (btnSyncCloud) {
      btnSyncCloud.addEventListener('click', () => {
        const originalText = btnSyncCloud.innerHTML;
        btnSyncCloud.innerHTML = `<span class="material-symbols-rounded animate-spin">sync</span> Đang đồng bộ...`;
        btnSyncCloud.disabled = true;

        import('../api.js').then(api => {
          if (!api.getSettingsFromCloud) {
            showToast('Lỗi module api.js', 'error');
            btnSyncCloud.innerHTML = originalText;
            btnSyncCloud.disabled = false;
            return;
          }

          api.getSettingsFromCloud().then(res => {
            if (res && res.success && res.settings) {
              const current = getSettings();
              const merged = Object.assign({}, current, res.settings);
              merged.requireLogin = current.requireLogin;
              updateSettings(merged);

              showToast('🎉 Đồng bộ dữ liệu cấu hình thành công!', 'success');
              const root = document.getElementById('viewContainer');
              if (root) {
                root.innerHTML = render();
                init();
              }
            } else {
              showToast('Lỗi lấy dữ liệu cấu hình đám mây!', 'warning');
              btnSyncCloud.innerHTML = originalText;
              btnSyncCloud.disabled = false;
            }
          }).catch(e => {
            console.error(e);
            showToast('Lỗi kết nối đồng bộ!', 'error');
            btnSyncCloud.innerHTML = originalText;
            btnSyncCloud.disabled = false;
          });
        });
      });
    }

    btnPlayApi.addEventListener('click', async () => {
      const text = document.getElementById('ext-tts-text').value;
      const speed = document.getElementById('ext-tts-speed').value;
      const voice = document.getElementById('ext-tts-voice').value;
      const s = getSettings();
      const ext = s.extension || {};
      const provider = ext.ttsProvider || 'google';

      if (!text) return showToast('Vui lòng nhập nội dung!');
      
      const originalText = btnPlayApi.innerHTML;
      btnPlayApi.innerHTML = `<span class="material-symbols-rounded animate-spin">sync</span> Đang xử lý...`;
      btnPlayApi.disabled = true;

      try {
        if (provider === 'google') {
          showToast('Đang phát giọng đọc Google...');
          const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;
          const audio = new Audio(url);
          audio.playbackRate = parseFloat(speed) || 1.0;
          await audio.play();
        } else if (provider === 'fpt') {
          const defaultFptKey = 'bIsflyFl1tWRW2AQRp1EEUqGUwJYZKK0';
          const apiKey = ext.ttsKey || defaultFptKey;
          const vMap = { 'nu-bac': 'banmai', 'nam-bac': 'leminh', 'nu-nam': 'lananh', 'nam-nam': 'giaihuy' };
          const res = await fetch('https://api.fpt.ai/hmi/tts/v5', {
            method: 'POST',
            headers: { 'api-key': apiKey, 'speed': speed === '1.0' ? '0' : speed, 'voice': vMap[voice] || 'banmai' },
            body: text
          });
          const data = await res.json();
          if (data.async) {
            showToast('Đang tạo âm thanh AI...');
            setTimeout(() => {
              new Audio(data.async).play().catch(e => console.error(e));
            }, 2500);
          } else throw new Error(data.message || 'Lỗi FPT');
        } else {
          const defaultViettelKey = '87c68db598f7e17f3bb058e31cc830a9';
          const apiKey = ext.ttsKey || defaultViettelKey;
          const vMap = { 'nu-bac': 'hn-quynh-anh', 'nam-bac': 'hn-minh-quan', 'nu-nam': 'sg-phuong-thao', 'nam-nam': 'sg-minh-hoang' };
          const res = await fetch('https://viettelai.vn/tts/v1/rest/syn', {
            method: 'POST',
            headers: { 'token': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: vMap[voice] || 'hn-quynh-anh', speed: parseFloat(speed), tts_return_url: false })
          });
          if (!res.ok) throw new Error('Lỗi Viettel AI');
          const blob = await res.blob();
          new Audio(URL.createObjectURL(blob)).play();
        }
      } catch(e) {
        console.error(e);
        showToast('Lỗi API. Dùng giọng hệ thống thay thế.');
        readSys();
      } finally {
        btnPlayApi.innerHTML = originalText;
        btnPlayApi.disabled = false;
      }
    });
  }

  // Bind Tools Logic
  if (_activeTab === 'tools') {
    // MST
    document.getElementById('ext-mst-btn').addEventListener('click', async () => {
      const q = document.getElementById('ext-mst-input').value.trim();
      const res = document.getElementById('ext-mst-result');
      if (!q) return;
      res.classList.remove('hidden');
      res.innerHTML = '<div class="text-center text-slate-500">Đang tra cứu...</div>';
      try {
        const fetchRes = await fetch(`https://api.vietqr.io/v2/business/${q}`);
        const data = await fetchRes.json();
        if (data.code === "00" && data.data) {
          const c = data.data;
          res.innerHTML = `
            <div class="font-bold text-blue-700">${c.name}</div>
            <div class="mt-1">MST: <b>${c.id}</b></div>
            <div class="text-xs text-slate-500 mt-2">${c.address}</div>
          `;
        } else {
          res.innerHTML = '<div class="text-center text-red-500 font-medium">Không tìm thấy thông tin công ty!</div>';
        }
      } catch(e) {
        res.innerHTML = '<div class="text-center text-red-500 font-medium">Lỗi kết nối tra cứu!</div>';
      }
    });

    // Currency
    const curAmt = document.getElementById('ext-cur-amount');
    const curFrom = document.getElementById('ext-cur-from');
    const curTo = document.getElementById('ext-cur-to');
    const curRes = document.getElementById('ext-cur-result');
    const curRateInfo = document.getElementById('ext-cur-rate');
    let rates = null;

    const calcCur = async () => {
      const amt = parseCurrency(curAmt.value);
      if (amt === 0) { curRes.innerText = "0 " + curTo.value; return; }
      if (!rates) {
        try {
          curRateInfo.innerText = "Đang tải tỷ giá...";
          const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
          const d = await r.json();
          rates = d.rates;
          curRateInfo.innerText = `Cập nhật: ${new Date(d.time_last_updated * 1000).toLocaleString()}`;
        } catch(e) {
          curRateInfo.innerText = "Lỗi kết nối tỷ giá.";
          return;
        }
      }
      if (rates) {
        const rf = rates[curFrom.value];
        const rt = rates[curTo.value];
        if (rf && rt) {
          curRes.innerText = formatCurrency((amt / rf) * rt) + " " + curTo.value;
        }
      }
    };

    curAmt.addEventListener('input', (e) => {
      const val = parseCurrency(e.target.value);
      e.target.value = val === 0 ? '' : formatCurrency(val);
      calcCur();
    });
    curFrom.addEventListener('change', calcCur);
    curTo.addEventListener('change', calcCur);
  }

  // Bind Settings
  if (_activeTab === 'settings') {
    const btnSave = document.getElementById('ext-settings-save');
    btnSave.addEventListener('click', () => {
      const formatVal = document.querySelector('input[name="ext_num_format"]:checked').value;
      const s = getSettings();
      if (!s.extension) s.extension = {};
      s.extension.numFormat = formatVal;
      updateSettings(s);
      showToast('Đã lưu cấu hình tiện ích!');
    });
  }
}

export function destroy() {
  // Reset tab to default on exit if desired, or keep state
}
