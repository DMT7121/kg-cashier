/* ============================================
   KG-CASHIER â€” Data Store (localStorage + Cloud Sync)
   COMPATIBLE: No optional chaining, no bare catch
   ============================================ */

// Safe dynamic import - if api.js fails, store still works
var _cloudSync = null;
var _cloudClose = null;
var _cloudAudit = null;
var _cloudGetShift = null;

try {
  // Use dynamic import pattern that won't crash module loading
  import('./api.js').then(function(api) {
    _cloudSync = api.syncShiftToCloud;
    _cloudClose = api.closeShiftOnCloud;
    _cloudAudit = api.addAuditLog;
    _cloudGetShift = api.getCurrentShiftFromCloud;
    console.log('[Store] API module loaded successfully');
  }).catch(function(err) {
    console.warn('[Store] API module failed to load:', err.message);
  });
} catch (e) {
  console.warn('[Store] Dynamic import not supported:', e.message);
}

var STORAGE_KEY = 'kg-cashier-data';
var SESSION_KEY = 'kg-cashier-session';
var STAFF_CACHE_KEY = 'kg-cashier-staff';

var defaultCategories = {
  income: ['Doanh thu bán hàng', 'Doanh thu dịch vụ', 'Thu hồi nợ', 'Thu khác'],
  expense: ['Mua nguyên liệu', 'Vận chuyển', 'Sửa chữa', 'Tiền tip/bo', 'Trả nợ', 'Chi khác']
};

var state = null;
var listeners = [];



function getInitialPrintForms() {
  return {
    checklist: [
      { section: 'CHECKLIST PHỤC VỤ \u2013 ĐẦU CA', items: [
        { cat: 'VỆ SINH & SETUP', title: 'I. Vệ sinh & setup khu vực', list: [
          'Vệ sinh sàn & Khu vực chung: Quét và lau sạch tổng thể khu trực, cổng ra vào.',
          'Bàn ghế: Lau sạch bàn ghế, setup tiêu chuẩn (Chén/Đũa/Ly...).',
          'Chuẩn bị xô đá: Đảm bảo sạch và đủ đá.',
          'Kiểm tra Menu: Sắp xếp ngay ngắn, lau sạch bìa.'
        ]},
        { cat: 'CA 15H', title: 'II. SETUP & VỆ SINH (CA 15H)', list: [
          'Bổ sung vật tư tiêu hao: Tăm, Xiên tre, Ống hút, Bao tay, Diêm, Khăn giấy, Hộp mang về...',
          'Sắp xếp: Gọn gàng tủ đồ, bố trí các Trạm đồ dùng dự phòng.'
        ]},
        { cat: 'BÀN ĐẶT', title: 'III. Bàn đặt trước', list: [
          'Setup bàn đặt: Đúng số lượng, màu sắc, nhu cầu tiệc.',
          'Đánh dấu: Cắm khăn giấy hoặc đặt bảng "Bàn đặt trước".'
        ]},
        { cat: 'BÀN GIAO', title: 'IV. Bàn giao đầu ca', list: [
          'Nắm bắt thông tin: Khách đặt, món hết, lưu ý đặc biệt từ ca trước.'
        ]},
        { cat: 'TRONG CA', title: 'V. Kiểm tra chéo & Bổ sung (Công việc trong ca)', list: [
          'Kiểm tra vệ sinh liên tục, bổ sung đá/dụng cụ.',
          'Hỗ trợ các bàn đông khách.',
          'Kiểm tra tồn kho vật tư tiêu hao.'
        ]}
      ]},
      { section: 'CHECKLIST PHỤC VỤ \u2013 CUỐI CA', items: [
        { cat: 'XUỐNG CA', title: 'VI. Checklist Cuối ca & Xuống ca', list: [
          'Thu dọn bàn, vệ sinh gầm bàn.',
          'Tắt các thiết bị điện (Máy lạnh, Đèn sảnh...).',
          'Dọn dẹp tổng thể và khóa cửa an toàn.',
          'Bàn giao lại thông tin cho quản lý/ca sau.'
        ]}
      ]}
    ],
    inventory: {
      ncc: {
        title: 'KIỂM KÊ HÀNG HÓA \u2013 NHÀ CUNG CẤP (THỊT / HẢI SẢN)',
        subtitle: 'CÔNG TY HOÀNG TRỌNG / MM MARKET / THỦY / CẢNH',
        items: [
          {supplier:'C.THỦY\nMM MARKET', items:['Gà (con)','Sụn gà (kg)','Trứng muối','Thịt bò (kg)','Giò heo (kg)','Xương ống (kg)']},
          {supplier:'HOÀNG TRỌNG\n0947459191', items:['Chân gà (kg)','Thanh cua (kg)','Bào ngư (kg)','Ba rọi bò (kg)','Ba rọi heo (kg)','Nạc dăm (kg)','Xương ống (kg)','Sườn heo (kg)','Cánh gà (kg)','Ếch (kg)','Mực trứng (kg)']},
          {supplier:'HUYỀN MỰC\nPHƯỚC THÀNH', items:['Mực Indo (kg)','Tôm Sú size 30 (kg)','Tôm càng size 10 (kg)','Ốc hương (kg)','Mực ống (kg)']}
        ],
        rightItems: ['Khô mực','Bê','Cá chim','Bạch tuộc','Mực 1 nắng','Cá hokke','Khoai tây','Sò điệp Nhật','Nghêu','Nông heo','Bơ bánh mì','Cá diêu hồng','Trứng non','Thú Linh','Ba rọi có da','Phổi bò','Tủy bò','Pate','Khoai tây cọng','Lạp xưởng xông khói','Sò huyết','Ba rọi xông khói','Trâu gác bếp','Bắp bò','Bao tử','Da heo','Mỡ heo','Phô mai sợi']
      },
      hangkho: {
        title: 'KIỂM KÊ HÀNG HÓA \u2013 HÀNG KHÔ / GIA VỊ',
        leftItems: [
          'Bột bắp','Bột chanh','Bột chiên giòn','Bột gạo','Bột mì','Bột năng','Bột ớt HQ','Bột ớt Việt','Bột xù trắng','Bột nếp','Bột nghệ','Bột cà ri','Đường cát','Đường phèn','Đường thốt nốt','Muối hột','Muối bọt','Muối Tây Ninh','Tiêu đen','Tiêu sọ','Ngũ vị hương','Hoa hồi','Quế cây','Cốm dẹp'
        ],
        rightItems: [
          'Dầu ăn (can 25l)','Giấm táo','Dầu hào','Nước mắm','Nước tương Nhị ca','Nước tương hấp cá LKK','Tương cà','Tương ớt','Tương xí muội','Tương ngọt','Dầu mè','Cà ri dầu','Rượu nếp','Rượu hoa tiêu','Vang trắng','Bánh pía','Bột ngọt','Pate gan','Phô mai Bò cười','Sữa đặc','Sữa tươi ko đường','Chao','Lạp xưởng','Bánh tráng cuốn'
        ],
        extraLeft: ['Mì Miliket','Mì trứng','Mì giòn','Miến thái','Mù tạt xanh','Mù tạt vàng','Nước cốt dừa','Bơ đậu phộng'],
        extraRight: ['Kỉ tử','Nấm mèo','Nấm đông cô','Lá nguyệt quế','Mạch nha','Bơ Tường An','Sốt đồ nướng','Hắc xì dầu'],
        extraRightTitle: 'KHÁC'
      },
      hangrau1: {
        title: 'KIỂM KÊ HÀNG HÓA \u2013 HÀNG RAU 1',
        leftItems: [
          'Bắp cải trắng:trái','Bầu:kg','Cà chua bi:kg','Cà chua lớn:kg','Cà tím:kg','Cà pháo:kg','Củ dền:kg','Củ sen:kg','Dưa leo Nhật:kg','Dưa leo nhỏ:kg','Đậu bắp:kg','Đu đủ:kg','Giá:kg','Gừng:kg','Hành phi:kg','Hạt sen:kg','Hẹ:kg','Húng lủi:kg','Khế:kg','Khoai lang:kg','Khoai mỡ:kg','Khoai tây:kg','Khổ qua:kg','Lá chanh:kg'
        ],
        rightItems: [
          'Lá dứa:kg','Lá lốt:kg','Lá mơ:kg','Lá ớt:kg','Lá quế:kg','Măng chua:kg','Măng le:kg','Bưởi:kg','Tảo xoắn:kg','Salad thủy tinh:kg','Salad fries:kg','Cải cầu vồng:kg','Măng tây:kg','Me vắt:kg','Mía cây:kg','Mồng tơi:kg','Mướp:kg','Nấm bạch tuyết:kg','Nấm đông cô:kg','Nấm đùi gà:kg','Nấm kim châm:kg','Nghệ:kg','Ngò gai:kg','Ngò rí:kg'
        ]
      },
      hangrau: {
        title: 'KIỂM KÊ HÀNG HÓA \u2013 HÀNG RAU 2',
        subtitle: 'NHẬP HÀNG NGÀY',
        items: [
          'Tỏi củ:kg','Hành tây:kg','Cà rốt:kg','Thơm lớn:kg','Tắc:kg','Ớt sừng:kg','Sả cây:kg','Tỏi xay:kg','Chanh:kg','Bắp Mỹ:kg','Ớt xiêm xanh:kg','Đậu rồng:kg','Hành tím:kg','Xoài keo:kg','Củ cải trắng:kg','Tiêu xanh:kg','Củ sắn:kg','Rau răm:kg','Đậu đũa:kg','Lá tía tô:kg','Hành lá:kg','Rau muống:kg','Súp lơ xanh:kg','Ớt chuông:kg'
        ]
      }
    }
  };
}

function defaults() {
  const s = {
    currentShift: null,
    shifts: [],
    categories: JSON.parse(JSON.stringify(defaultCategories)),
    cashiers: ['Thu ngân 1', 'Thu ngân 2', 'Thu ngân 3'],
    auditLog: [],
    notifications: [],
    settings: {
      storeName: "KING's GRILL",
      storeAddress: '34, Hoàng Văn Thụ, Chánh Nghĩa, TDM, Bình Dương',
      autoSync: true,
      discrepancyThreshold: 50000,
      shiftWarningHours: 10,
      requireLogin: true,
      adminPassword: '',
      printer: {
        kitchenIp: '',
        sashimiIp: '',
        barIp: '',
        useQzTray: false
      },
      vatKeys: {
        gemini: [],
        groq: [],
        hf: [],
        cerebras: [],
        sambanova: [],
        deepseek: [],
        mistral: [],
        nvidia: []
      },
      posTables: [],
      posCatalog: [],
      extension: {
        ttsProvider: 'google',
        ttsKey: '',
        qrTemplates: [],
        lastSelectedQr: null,
        ttsTemplates: [
          { name: 'Di dời xe 🚗', value: 'Xin thông báo, quý khách có xe mang biển số {bien_so} vui lòng dời xe để thuận tiện đi lại. Xin cảm ơn!' },
          { name: 'Mời nhận món 🍲', value: 'Bếp xin mời phục vụ nhận món cho bàn {ban}.' },
          { name: 'Thanh toán 💳', value: 'Xin mời quý khách ở bàn {ban} vui lòng qua quầy thu ngân thanh toán.' },
          { name: 'Phục vụ bàn 🙋', value: 'Xin thông báo phục vụ hỗ trợ khách hàng tại bàn {ban}.' }
        ]
      }
    },
    printForms: Object.assign(getInitialPrintForms(), {
      margins: { top: 8, bottom: 8, left: 8, right: 8 },
      customTemplates: {}
    })
  };
  return s;
}

export function resetPrintForms() {
  var s = getState();
  s.printForms.customTemplates = {};
  save();
  addAudit('RESET_PRINT_FORMS', 'KhÃ´i phá»¥c máº«u in máº·c Ä‘á»‹nh');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function _normalizeDateStr(dStr) {
  if (!dStr) return '';
  if (dStr.indexOf('/') > -1) {
    var parts = dStr.split('/');
    if (parts.length === 3) {
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  return dStr;
}

function _getSummaryFromInvoicesSnapshot(shift, invoicesSnapshot) {
  var txs = shift.transactions || [];
  var otherTxs = shift.otherTransactions || [];

  var totalIncome = 0, totalExpense = 0, cashIncome = 0, cardIncome = 0, transferIncome = 0, cashExpense = 0, otherIncome = 0, otherExpense = 0, billCount = 0;
  var cukcukRevenue = 0, cukcukBills = 0;
  var manualIncome = 0, manualBills = 0;

  // Calculate CUKCUK revenue directly from frozen snapshot
  for (var i = 0; i < invoicesSnapshot.length; i++) {
    var inv = invoicesSnapshot[i];
    cukcukBills++;
    billCount++;
    var invTotal = 0;
    var payments = inv.payments || [];
    for (var p = 0; p < payments.length; p++) {
      var amt = payments[p].amount || 0;
      invTotal += amt;
      if (payments[p].method === 'cash') { cashIncome += amt; }
      else if (payments[p].method === 'card') { cardIncome += amt; }
      else if (payments[p].method === 'transfer') { transferIncome += amt; }
    }
    var effectiveAmt = invTotal > 0 ? invTotal : (inv.amount || 0);
    cukcukRevenue += effectiveAmt;
    totalIncome += effectiveAmt;
  }

  // Calculate other transactions
  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    var isCukcuk = t.note && t.note.indexOf('[CUKCUK]') !== -1;
    if (t.type === 'income') {
      if (isCukcuk) continue; // Skip to prevent double counting
      totalIncome += t.amount;
      billCount++;
      if (t.paymentMethod === 'cash') cashIncome += t.amount;
      else if (t.paymentMethod === 'card') cardIncome += t.amount;
      else if (t.paymentMethod === 'transfer') transferIncome += t.amount;
      manualIncome += t.amount;
      manualBills++;
    } else {
      totalExpense += t.amount;
      if (t.paymentMethod === 'cash') cashExpense += t.amount;
    }
  }

  for (var j = 0; j < otherTxs.length; j++) {
    if (otherTxs[j].type === 'income') otherIncome += otherTxs[j].amount;
    else otherExpense += otherTxs[j].amount;
  }

  var expectedCash = shift.startingCash + cashIncome - cashExpense + otherIncome - otherExpense;

  return {
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    cashIncome: cashIncome,
    cardIncome: cardIncome,
    transferIncome: transferIncome,
    cashExpense: cashExpense,
    otherIncome: otherIncome,
    otherExpense: otherExpense,
    cukcukRevenue: cukcukRevenue,
    cukcukBills: cukcukBills,
    billCount: billCount,
    expectedCash: expectedCash,
    manualIncome: manualIncome,
    manualBills: manualBills,
    revenue: totalIncome,
    netTotal: expectedCash
  };
}

// â”€â”€ Load / Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getState() {
  if (!state) {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);

        var def = defaults();
        // Merge manually for compatibility
        for (var key in def) {
          if (parsed[key] === undefined) parsed[key] = def[key];
        }
        
        // RECOVERY: Auto-heal corrupted types from previous bugs
        if (parsed.settings) {
            if (!Array.isArray(parsed.settings.posTables)) parsed.settings.posTables = [];
            if (!Array.isArray(parsed.settings.posCatalog)) parsed.settings.posCatalog = [];
            
            if (typeof parsed.settings.vatKeys !== 'object' || parsed.settings.vatKeys === null) {
                parsed.settings.vatKeys = def.settings.vatKeys;
            } else {
                // Ensure all keys exist
                for (var k in def.settings.vatKeys) {
                    if (!Array.isArray(parsed.settings.vatKeys[k])) {
                        parsed.settings.vatKeys[k] = def.settings.vatKeys[k];
                    }
                }
            }
            if (typeof parsed.settings.extension !== 'object' || parsed.settings.extension === null) {
                parsed.settings.extension = def.settings.extension;
            } else {
                if (parsed.settings.extension.ttsProvider === undefined) parsed.settings.extension.ttsProvider = def.settings.extension.ttsProvider;
                if (parsed.settings.extension.ttsKey === undefined) parsed.settings.extension.ttsKey = def.settings.extension.ttsKey;
                if (!Array.isArray(parsed.settings.extension.qrTemplates)) parsed.settings.extension.qrTemplates = [];
                if (parsed.settings.extension.lastSelectedQr === undefined) parsed.settings.extension.lastSelectedQr = null;
                if (!Array.isArray(parsed.settings.extension.ttsTemplates)) parsed.settings.extension.ttsTemplates = def.settings.extension.ttsTemplates;
            }
        }
        if (!parsed.categories || typeof parsed.categories !== 'object') {
            parsed.categories = def.categories;
        }

        state = parsed;
      } else {
        state = defaults();
      }

      // MIGRATION: Fix mojibake categories in memory
      if (state && state.categories) {
        const fixStr = (str) => {
          if (!str) return str;
          if (str.includes('Doanh thu b') && str.includes('n h')) return 'Doanh thu bán hàng';
          if (str.includes('Doanh thu d') && str.includes('ch v')) return 'Doanh thu dịch vụ';
          if (str.includes('Thu h') && str.includes('i n')) return 'Thu hồi nợ';
          if (str.includes('Mua nguy') && str.includes('n li')) return 'Mua nguyên liệu';
          if (str.includes('V') && str.includes('n chuy')) return 'Vận chuyển';
          if (str.startsWith('S') && str.includes('a ch')) return 'Sửa chữa';
          if (str.startsWith('Ti') && str.includes('n tip')) return 'Tiền tip/bo';
          if (str.startsWith('Tr') && str.includes('n')) return 'Trả nợ';
          if (str.startsWith('Thu kh')) return 'Thu khác';
          if (str.startsWith('Chi kh')) return 'Chi khác';
          return str;
        };
        if (state.categories.income) state.categories.income = state.categories.income.map(fixStr);
        if (state.categories.expense) state.categories.expense = state.categories.expense.map(fixStr);
      }
    } catch (e) {
      console.error('[Store] Load error:', e);
      state = defaults();
    }
  }
  // Safe Auto-Data Healing for legacy shifts
  if (state && !state._healed) {
    try {
      setTimeout(function() {
        try { healPastShiftsData(); } catch(he) { console.warn('[Store] healPastShiftsData async error:', he); }
      }, 50);
    } catch(e) {
      console.warn('[Store] healPastShiftsData launch failed:', e);
    }
  }
  return state;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[Store] Save failed:', e);
  }
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](state); } catch (e) { /* ignore */ }
  }
}

export function subscribe(fn) {
  listeners.push(fn);
  return function() {
    listeners = listeners.filter(function(l) { return l !== fn; });
  };
}

// â”€â”€ Audit Trail (Feature 10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function addAudit(action, details) {
  if (details === undefined) details = '';
  var s = getState();
  var user = getLoggedInUser();
  var userName = (user && user.name) ? user.name : 'SYSTEM';
  var entry = { timestamp: new Date().toISOString(), user: userName, action: action, details: details };
  if (!s.auditLog) s.auditLog = [];
  s.auditLog.unshift(entry);
  if (s.auditLog.length > 500) s.auditLog.length = 500;
  save();
  // Fire and forget cloud sync
  if (_cloudAudit) {
    try { _cloudAudit(entry).catch(function() {}); } catch (e) { /* ignore */ }
  }
}

export function getAuditLog() {
  return getState().auditLog || [];
}

// â”€â”€ Notifications (Feature 5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function addNotification(message, type) {
  if (!type) type = 'info';
  var s = getState();
  if (!s.notifications) s.notifications = [];
  s.notifications.unshift({ id: uid(), message: message, type: type, timestamp: new Date().toISOString(), read: false });
  if (s.notifications.length > 50) s.notifications.length = 50;
  save();
}

export function getNotifications() { return getState().notifications || []; }
export function getUnreadCount() {
  var notifs = getState().notifications || [];
  var count = 0;
  for (var i = 0; i < notifs.length; i++) {
    if (!notifs[i].read) count++;
  }
  return count;
}

export function markAllRead() {
  var s = getState();
  var notifs = s.notifications || [];
  for (var i = 0; i < notifs.length; i++) { notifs[i].read = true; }
  save();
}

export function clearNotifications() {
  getState().notifications = [];
  save();
}

// â”€â”€ Login / Session (Feature 8 - RBAC) â”€â”€â”€â”€â”€â”€â”€
export function setLoggedInUser(user) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { /* ignore */ }
}

export function getLoggedInUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

export function logoutUser() {
  var user = getLoggedInUser();
  var userName = (user && user.name) ? user.name : '';
  addAudit('LOGOUT', userName);
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

export function isLoggedIn() {
  return !!getLoggedInUser();
}

export function hasRole(requiredRole) {
  var user = getLoggedInUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (requiredRole === 'manager') return user.role === 'manager';
  return true;
}

// â”€â”€ Settings (Feature 9) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getSettings() {
  var s = getState();
  return s.settings || defaults().settings;
}

export function updateSettings(newSettings) {
  var s = getState();
  if (!s.settings) s.settings = defaults().settings;
  var defs = defaults().settings;
  
  for (var key in newSettings) {
    var val = newSettings[key];
    
    // Safety check against corrupted strings from Apps Script fallback
    if (typeof val === 'string' && typeof defs[key] === 'object' && defs[key] !== null) {
      try { val = JSON.parse(val); } catch(e) { continue; } // Skip if it can't be parsed
    }
    
    // Ensure array types are preserved (e.g., posTables, posCatalog)
    if (Array.isArray(defs[key]) && !Array.isArray(val)) {
      continue;
    }
    
    // Ensure object types are preserved (e.g., vatKeys)
    if (typeof defs[key] === 'object' && defs[key] !== null && !Array.isArray(defs[key])) {
      if (typeof val !== 'object' || Array.isArray(val) || val === null) {
        continue; 
      }
    }
    
    s.settings[key] = val;
  }
  save();
  addAudit('UPDATE_SETTINGS', 'Cập nhật cấu hình hệ thống');
}

// â”€â”€ Current shift â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getCurrentShift() { return getState().currentShift; }

export async function openShift(opts) {
  var cashierName = opts.cashierName;
  var shiftNumber = opts.shiftNumber;
  var date = opts.date;
  var startingCash = opts.startingCash;
  var shiftPassword = opts.shiftPassword || '0000';

  console.log('[Store] openShift called:', cashierName, shiftNumber, date, startingCash, shiftPassword);

  var s = getState();
  if (s.currentShift) {
    throw new Error('ÄÃ£ cÃ³ ca Ä‘ang má»Ÿ. HÃ£y Ä‘Ã³ng ca trÆ°á»›c.');
  }

  // Pre-check: is there an active shift on cloud from another device?
  if (_cloudGetShift && opts.bypassCloudCheck !== true) {
    try {
      var cloudCheck = await _cloudGetShift();
      if (cloudCheck.success && cloudCheck.shift && cloudCheck.shift.status !== 'closed') {
        var cloudShiftId = cloudCheck.shift.id;
        // Check if this cloud shift was already closed/force-closed locally
        var isRecentlyClosed = (s._recentlyClosedIds || []).indexOf(cloudShiftId) !== -1;
        var isForceClosed = (s._forceClosedIds || []).indexOf(cloudShiftId) !== -1;
        var isInHistory = (s.shifts || []).some(function(h) { return h.id === cloudShiftId; });

        if (isRecentlyClosed || isForceClosed || isInHistory) {
          // Stale cloud shift — clear it silently and proceed
          console.log('[Store] openShift: clearing stale cloud shift:', cloudShiftId);
          if (_cloudClose) {
            try { _cloudClose(cloudCheck.shift).catch(function() {}); } catch (e2) { /* ignore */ }
          }
        } else {
          var cloudName = cloudCheck.shift.cashierName || 'unknown';
          var cloudNum = cloudCheck.shift.shiftNumber || '?';
          throw new Error('Thi\u1EBFt b\u1ECB kh\u00E1c \u0111ang m\u1EDF Ca ' + cloudNum + ' b\u1EDFi ' + cloudName + '. H\u00E3y \u0111\u00F3ng ca \u0111\u00F3 tr\u01B0\u1EDBc.');
        }
      }
    } catch (e) {
      if (e.message && e.message.indexOf('kh\u00E1c') > -1) throw e;
      // Network error \u2192 allow offline open
    }
  }

  // Standardize date format to yyyy-MM-dd
  var stdDate = date;
  if (date && date.indexOf('/') > -1) {
    var parts = date.split('/');
    if (parts.length === 3) {
      stdDate = parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  if (!stdDate) {
    stdDate = new Date().toISOString().split('T')[0];
  }

  s.currentShift = {
    id: 'shift_' + stdDate + '_' + shiftNumber,
    cashierName: cashierName,
    shiftNumber: shiftNumber,
    date: stdDate,
    startTime: new Date().toISOString(),
    endTime: null,
    startingCash: Number(startingCash) || 0,
    transactions: [],
    otherTransactions: [],
    cashCount: {},
    invoices: [],
    status: 'open',
    notes: '',
    shiftPassword: shiftPassword,
    cashToKeep: 0,
    cashToDeposit: 0
  };
  save();

  console.log('[Store] Shift opened successfully:', s.currentShift.id);

  addAudit('OPEN_SHIFT', 'Ca ' + shiftNumber + ' - ' + cashierName);
  addNotification('Ca ' + shiftNumber + ' Ä‘Ã£ Ä‘Æ°á»£c má»Ÿ bá»Ÿi ' + cashierName, 'success');
  _syncCurrentShift();
  return s.currentShift;
}

/** Cáº­p nháº­t tiá»n Ä‘áº§u ca (bá»• sung thÃªm tiá»n máº·t vÃ o quá»¹) */
export function updateStartingCash(newAmount) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a cÃ³ ca Ä‘ang má»Ÿ.');

  // Integrity validation
  if (!s.currentShift.id) throw new Error('Ca thi\u1EBFu ID');
  if (!s.currentShift.date) throw new Error('Ca thi\u1EBFu ng\u00E0y');
  if (!s.currentShift.cashierName) throw new Error('Ca thi\u1EBFu t\u00EAn thu ng\u00E2n');
  var old = s.currentShift.startingCash || 0;
  s.currentShift.startingCash = Number(newAmount) || 0;
  save();
  addAudit('UPDATE_STARTING_CASH', 'Tiá»n Ä‘áº§u ca: ' + old.toLocaleString() + ' â†’ ' + s.currentShift.startingCash.toLocaleString());
  _syncCurrentShift();
  return s.currentShift;
}

export async function closeShift(opts) {
  if (!opts) opts = {};
  _closeInProgress = true;
  try {
  var s = getState();
  if (!s.currentShift) throw new Error('Kh\u00F4ng c\u00F3 ca n\u00E0o \u0111ang m\u1EDF');

  s.currentShift.endTime = new Date().toISOString();
  s.currentShift.status = 'closed';
  s.currentShift.notes = opts.notes || '';
  s.currentShift.cashToKeep = Number(opts.cashToKeep) || 0;
  s.currentShift.cashToDeposit = Number(opts.cashToDeposit) || 0;

  var summary = getShiftSummary(s.currentShift);

  // â”€â”€ Snapshot drink inventory for this shift â”€â”€
  try {
    var invData = localStorage.getItem('kg-drink-inventory');
    if (invData) {
      var parsed = JSON.parse(invData);
      var sessionKey = s.currentShift.date + '_Ca ' + s.currentShift.shiftNumber;
      if (parsed.sessions && parsed.sessions[sessionKey]) {
        s.currentShift.drinkInventorySnapshot = parsed.sessions[sessionKey];
      }
    }
  } catch (e) { /* ignore */ }

  // â”€â”€ Snapshot CUKCUK invoices for this shift's working day â”€â”€
  try {
    var invoiceData = localStorage.getItem('cukcuk_invoice_store');
    if (invoiceData) {
      var invStore = JSON.parse(invoiceData);
      if (invStore && invStore.invoices) {
        var shiftDate = s.currentShift.date;
        var dp = shiftDate.split('-');
        var shiftDay = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
        var boundsStart = new Date(shiftDay.getFullYear(), shiftDay.getMonth(), shiftDay.getDate(), 12, 0, 0);
        var nextDay = new Date(shiftDay);
        nextDay.setDate(nextDay.getDate() + 1);
        var boundsEnd = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 6, 0, 0);

        var matchedInvoices = [];
        for (var k in invStore.invoices) {
          if (!invStore.invoices.hasOwnProperty(k)) continue;
          var inv = invStore.invoices[k];
          if (inv.unpaid) continue;
          var match = false;
          if (inv.refDate) {
            var rd = new Date(inv.refDate);
            if (isNaN(rd.getTime()) && typeof inv.refDate === 'string') {
              var netM = inv.refDate.match(/\/Date\((\d+)\)\//);
              if (netM) rd = new Date(parseInt(netM[1]));
            }
            if (!isNaN(rd.getTime())) match = rd >= boundsStart && rd < boundsEnd;
          }
          if (!match && !inv.refDate) match = inv.date === shiftDate;
          if (match) {
            matchedInvoices.push({
              refId: inv.refId, refNo: inv.refNo, refDate: inv.refDate,
              tableName: inv.tableName, amount: inv.amount, payments: inv.payments
            });
          }
        }
        if (matchedInvoices.length > 0) {
          s.currentShift.cukcukInvoicesSnapshot = matchedInvoices;
        }
      }
    }
  } catch (e) { /* ignore */ }

  // â”€â”€ Save summary snapshot FROZEN at close time (history reads this) â”€â”€
  s.currentShift.summarySnapshot = {
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    cashIncome: summary.cashIncome,
    cardIncome: summary.cardIncome,
    transferIncome: summary.transferIncome,
    cukcukRevenue: summary.cukcukRevenue,
    cukcukBills: summary.cukcukBills,
    billCount: summary.billCount,
    expectedCash: summary.expectedCash,
    cashCountTotal: summary.cashCountTotal,
    cashExpense: summary.cashExpense,
    discrepancy: summary.discrepancy,
    manualIncome: summary.manualIncome,
    manualBills: summary.manualBills,
    otherIncome: summary.otherIncome,
    otherExpense: summary.otherExpense,
    revenue: summary.revenue,
    netTotal: summary.netTotal
  };

  // Check discrepancy (Feature 5)
  var threshold = (s.settings && s.settings.discrepancyThreshold) ? s.settings.discrepancyThreshold : 50000;
  if (summary.cashCountTotal > 0 && Math.abs(summary.discrepancy) > threshold) {
    addNotification('âš ï¸ ChÃªnh lá»‡ch tiá»n máº·t: ' + summary.discrepancy.toLocaleString('vi-VN') + 'Ä‘', 'warning');
  }

  s.shifts.unshift(JSON.parse(JSON.stringify(s.currentShift)));
  // M2: Enforce shift history quota limit (180 entries = 90 days)
  if (s.shifts.length > 180) {
    s.shifts = s.shifts.slice(0, 180);
    console.warn('[Store] Shift history quota exceeded. Pruned to 180 entries.');
  }
  var closedShift = s.currentShift;
  // Fix 1B: Track recently closed IDs to prevent cloud restore race condition
  if (!s._recentlyClosedIds) s._recentlyClosedIds = [];
  s._recentlyClosedIds.push(closedShift.id);
  if (s._recentlyClosedIds.length > 20) s._recentlyClosedIds.shift();
  s.currentShift = null;
  save();
  addAudit('CLOSE_SHIFT', 'Ca ' + closedShift.shiftNumber + ' - Doanh thu: ' + summary.totalIncome.toLocaleString('vi-VN') + 'đ');
  addNotification('Ca ' + closedShift.shiftNumber + ' Ä‘Ã£ Ä‘Ã³ng - DT: ' + summary.totalIncome.toLocaleString('vi-VN') + 'Ä‘', 'info');

  // Fix 4: Retry cloud close up to 3 times
  if (_cloudClose) {
    for (var _attempt = 1; _attempt <= 3; _attempt++) {
      try {
        var _closeResult = await _cloudClose(closedShift);
        if (_closeResult && _closeResult.success) {
          console.log('[Store] Cloud close confirmed on attempt', _attempt);
          break;
        }
      } catch (e) {
        console.warn('[Store] Cloud close attempt', _attempt, 'failed:', e.message);
        if (_attempt < 3) await new Promise(function(r) { setTimeout(r, 1000 * _attempt); });
      }
    }
  }
  } finally {
    _closeInProgress = false;
  }
}

export async function reopenLastClosedShift() {
  var s = getState();
  if (s.currentShift) {
    throw new Error('Đang có ca mở. Hãy đóng ca hiện tại trước khi mở lại ca khác.');
  }
  if (!s.shifts || s.shifts.length === 0) {
    throw new Error('Không có ca đã đóng nào trong lịch sử.');
  }

  // Find the first shift with status === 'closed'
  var closedShiftIndex = -1;
  for (var i = 0; i < s.shifts.length; i++) {
    if (s.shifts[i].status === 'closed') {
      closedShiftIndex = i;
      break;
    }
  }

  if (closedShiftIndex === -1) {
    throw new Error('Không tìm thấy ca đã đóng nào.');
  }

  var shiftToReopen = s.shifts[closedShiftIndex];

  // Save the original summary snapshot at first closing to enable highlight comparisons on reports
  if (!shiftToReopen.originalSummarySnapshot && shiftToReopen.summarySnapshot) {
    shiftToReopen.originalSummarySnapshot = Object.assign({}, shiftToReopen.summarySnapshot);
  }

  // Modify shift status back to 'open'
  shiftToReopen.status = 'open';
  shiftToReopen.endTime = null;
  
  // Clear the frozen closing snapshots so that the shift dynamically calculates transactions, expected cash, etc.
  delete shiftToReopen.summarySnapshot;
  delete shiftToReopen.cukcukInvoicesSnapshot;

  // Restore drink inventory session to local storage if present, so the user can see and adjust their counts
  if (shiftToReopen.drinkInventorySnapshot) {
    try {
      var invData = localStorage.getItem('kg-drink-inventory');
      var parsed = invData ? JSON.parse(invData) : { sessions: {} };
      if (!parsed.sessions) parsed.sessions = {};
      var sessionKey = shiftToReopen.date + '_Ca ' + shiftToReopen.shiftNumber;
      parsed.sessions[sessionKey] = shiftToReopen.drinkInventorySnapshot;
      localStorage.setItem('kg-drink-inventory', JSON.stringify(parsed));
      console.log('[Store] Restored drink inventory session for:', sessionKey);
    } catch (e) { /* ignore */ }
  }

  // Set as current shift in active memory
  s.currentShift = JSON.parse(JSON.stringify(shiftToReopen));

  // Auto-validate session so user bypasses the login lock screen immediately
  try {
    sessionStorage.setItem('shift_validated', s.currentShift.id);
  } catch (e) { /* ignore */ }

  // Remove from shifts history array (since it is active again)
  s.shifts.splice(closedShiftIndex, 1);

  // Sync to Cloud as 'open'
  save();
  addAudit('REOPEN_SHIFT', 'Mở lại ca ' + s.currentShift.shiftNumber + ' - ' + s.currentShift.cashierName);
  _syncCurrentShift();

  return s.currentShift;
}

// â”€â”€ Transactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function addTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a má»Ÿ ca');
  var tx = {
    id: uid(),
    type: opts.type,
    category: opts.category,
    amount: Number(opts.amount),
    paymentMethod: opts.paymentMethod || 'cash',
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.transactions.push(tx);
  save();
  addAudit('ADD_TX', (opts.type === 'income' ? '+' : '-') + Number(opts.amount).toLocaleString('vi-VN') + 'Ä‘ - ' + opts.category);
  _syncCurrentShift();
  return tx;
}

export function removeTransaction(id) {
  var s = getState();
  if (!s.currentShift) return;
  var tx = null;
  for (var i = 0; i < s.currentShift.transactions.length; i++) {
    if (s.currentShift.transactions[i].id === id) {
      tx = s.currentShift.transactions[i];
      break;
    }
  }
  s.currentShift.transactions = s.currentShift.transactions.filter(function(t) { return t.id !== id; });
  save();
  if (tx) addAudit('REMOVE_TX', tx.category + ' - ' + tx.amount.toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
}

export function editTransaction(id, updates) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a má»Ÿ ca');
  for (var i = 0; i < s.currentShift.transactions.length; i++) {
    if (s.currentShift.transactions[i].id === id) {
      var tx = s.currentShift.transactions[i];
      var oldAmt = tx.amount;
      if (updates.category !== undefined) tx.category = updates.category;
      if (updates.amount !== undefined) tx.amount = Number(updates.amount);
      if (updates.paymentMethod !== undefined) tx.paymentMethod = updates.paymentMethod;
      if (updates.note !== undefined) tx.note = updates.note;
      if (updates.type !== undefined) tx.type = updates.type;
      save();
      addAudit('EDIT_TX', tx.category + ': ' + oldAmt.toLocaleString('vi-VN') + ' â†’ ' + tx.amount.toLocaleString('vi-VN') + 'đ');
      _syncCurrentShift();
      return tx;
    }
  }
  throw new Error('KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch');
}

export function addOtherTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a má»Ÿ ca');
  var tx = {
    id: uid(),
    type: opts.type,
    category: opts.category,
    amount: Number(opts.amount),
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.otherTransactions.push(tx);
  save();
  addAudit('ADD_OTHER_TX', opts.type + ': ' + opts.category + ' - ' + Number(opts.amount).toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
  return tx;
}

export function removeOtherTransaction(id) {
  var s = getState();
  if (!s.currentShift) return;
  s.currentShift.otherTransactions = s.currentShift.otherTransactions.filter(function(t) { return t.id !== id; });
  save();
  _syncCurrentShift();
}

// â”€â”€ Cash count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function updateCashCount(counts, pinnedCash, keepCash, handoverCash) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a má»Ÿ ca');
  var newCounts = {};
  for (var key in counts) { newCounts[key] = counts[key]; }
  s.currentShift.cashCount = newCounts;

  // Save denomination breakdown: ghim, giá»¯, giao
  if (pinnedCash) {
    var newPins = {};
    for (var pk in pinnedCash) { if (pinnedCash[pk] > 0) newPins[pk] = pinnedCash[pk]; }
    s.currentShift.pinnedCash = newPins;
  }
  if (keepCash) {
    var newKeep = {};
    for (var kk in keepCash) { if (keepCash[kk] > 0) newKeep[kk] = keepCash[kk]; }
    s.currentShift.keepCash = newKeep;
  }
  if (handoverCash) {
    var newHand = {};
    for (var hk in handoverCash) { if (handoverCash[hk] > 0) newHand[hk] = handoverCash[hk]; }
    s.currentShift.handoverCash = newHand;
  }

  // Auto-calculate cashToKeep and cashToDeposit
  var totalKet = 0, totalGiao = 0;
  var pc = s.currentShift.pinnedCash || {};
  var kc = s.currentShift.keepCash || {};
  var hc = s.currentShift.handoverCash || {};
  for (var d in newCounts) {
    totalKet += Number(d) * ((pc[d] || 0) + (kc[d] || 0));
    totalGiao += Number(d) * (hc[d] || 0);
  }
  s.currentShift.cashToKeep = totalKet;
  s.currentShift.cashToDeposit = totalGiao;

  save();
  var total = totalKet + totalGiao;
  addAudit('UPDATE_CASH_COUNT', 'KÃ©t: ' + totalKet.toLocaleString('vi-VN') + ' | Giao: ' + totalGiao.toLocaleString('vi-VN') + ' | Tá»•ng: ' + total.toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
}

// â”€â”€ Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function addInvoice(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('ChÆ°a má»Ÿ ca');
  var inv = {
    id: uid(),
    name: opts.name,
    fileType: opts.fileType || 'image',
    data: opts.data,
    driveFileId: opts.driveFileId,
    driveUrl: opts.driveUrl,
    thumbnailUrl: opts.thumbnailUrl,
    linkedTransactionId: opts.linkedTransactionId || null,
    note: opts.note || '',
    timestamp: new Date().toISOString()
  };
  s.currentShift.invoices.push(inv);
  save();
  addAudit('ADD_INVOICE', opts.name);
  return inv;
}

export function removeInvoice(id) {
  var s = getState();
  if (!s.currentShift) return;
  s.currentShift.invoices = s.currentShift.invoices.filter(function(i) { return i.id !== id; });
  save();
}

// â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getShiftSummary(shift) {
  if (!shift) shift = getState().currentShift;
  if (!shift) return null;
  var txs = shift.transactions || [];
  var otherTxs = shift.otherTransactions || [];

  var totalIncome = 0, totalExpense = 0, cashIncome = 0, cardIncome = 0, transferIncome = 0, cashExpense = 0, otherIncome = 0, otherExpense = 0, billCount = 0;
  var cukcukRevenue = 0, cukcukBills = 0;
  var manualIncome = 0, manualBills = 0;

  // Step 1: CUKCUK invoices — use shift actual time window
  // CLOSED shifts: frozen summarySnapshot (immutable)
  // OPEN shifts: filter by startTime→now
  var hasInvoiceStoreData = false;
  if (shift.status === 'closed' && shift.summarySnapshot && shift.summarySnapshot.cukcukRevenue !== undefined) {
    cukcukRevenue = shift.summarySnapshot.cukcukRevenue || 0;
    cukcukBills = shift.summarySnapshot.cukcukBills || 0;
    totalIncome += cukcukRevenue;
    billCount += cukcukBills;
    var snap = shift.summarySnapshot;
    cashIncome += snap.cashIncome || 0;
    cardIncome += snap.cardIncome || 0;
    transferIncome += snap.transferIncome || 0;
    hasInvoiceStoreData = true;
  } else if (shift.date) {
    try {
      var storeData = localStorage.getItem('cukcuk_invoice_store');
      if (storeData) {
        var parsed = JSON.parse(storeData);
        if (parsed && parsed.invoices) {
          var dp = shift.date.split('-');
          var shiftStart = shift.startTime ? new Date(shift.startTime) : new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), 12, 0, 0);
          var shiftEnd = shift.endTime ? new Date(shift.endTime) : (shift.status === 'closed' ? new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]) + 1, 6, 0, 0) : new Date());
          for (var k in parsed.invoices) {
            if (!parsed.invoices.hasOwnProperty(k)) continue;
            var inv = parsed.invoices[k];
            if (inv.unpaid) continue;
            var matchDay = false;
            if (inv.refDate) {
              var rd = new Date(inv.refDate);
              if (isNaN(rd.getTime()) && typeof inv.refDate === 'string') {
                var netM = inv.refDate.match(/\/Date\((\d+)\)\//);
                if (netM) rd = new Date(parseInt(netM[1]));
              }
              if (!isNaN(rd.getTime())) {
                matchDay = rd >= shiftStart && rd < shiftEnd;
              }
            }
            if (!matchDay) continue;
            hasInvoiceStoreData = true;
            cukcukBills++;
            billCount++;
            var invTotal = 0;
            var payments = inv.payments || [];
            for (var p = 0; p < payments.length; p++) {
              var amt = payments[p].amount || 0;
              invTotal += amt;
              if (payments[p].method === 'cash') { cashIncome += amt; }
              else if (payments[p].method === 'card') { cardIncome += amt; }
              else if (payments[p].method === 'transfer') { transferIncome += amt; }
            }
            var effectiveAmt = invTotal > 0 ? invTotal : (inv.amount || 0);
            cukcukRevenue += effectiveAmt;
            totalIncome += effectiveAmt;
          }
        }
      }
    } catch(e) { /* ignore */ }
  }

  // â”€â”€ Step 2: Process shift.transactions â”€â”€
  // Skip [CUKCUK]-tagged entries if invoiceStore already provided CUKCUK data (prevent double-counting)
  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    var isCukcuk = t.note && t.note.indexOf('[CUKCUK]') !== -1;

    if (t.type === 'income') {
      if (isCukcuk && hasInvoiceStoreData) {
        // Skip â€” already counted from invoiceStore
        continue;
      }
      totalIncome += t.amount;
      billCount++;
      if (t.paymentMethod === 'cash') cashIncome += t.amount;
      else if (t.paymentMethod === 'card') cardIncome += t.amount;
      else if (t.paymentMethod === 'transfer') transferIncome += t.amount;
      if (isCukcuk) {
        cukcukRevenue += t.amount;
        cukcukBills++;
      } else {
        manualIncome += t.amount;
        manualBills++;
      }
    } else {
      totalExpense += t.amount;
      if (t.paymentMethod === 'cash') cashExpense += t.amount;
    }
  }

  for (var j = 0; j < otherTxs.length; j++) {
    if (otherTxs[j].type === 'income') otherIncome += otherTxs[j].amount;
    else otherExpense += otherTxs[j].amount;
  }

  var cashCountTotal = 0;
  var cc = shift.cashCount || {};
  for (var denom in cc) {
    cashCountTotal += Number(denom) * Number(cc[denom]);
  }

  var expectedCash = shift.startingCash + cashIncome - cashExpense + otherIncome - otherExpense;
  var discrepancy = cashCountTotal - expectedCash;

  return {
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    cashIncome: cashIncome,
    cardIncome: cardIncome,
    transferIncome: transferIncome,
    cashExpense: cashExpense,
    otherIncome: otherIncome,
    otherExpense: otherExpense,
    cashCountTotal: cashCountTotal,
    expectedCash: expectedCash,
    discrepancy: discrepancy,
    revenue: totalIncome,
    billCount: billCount,
    netTotal: expectedCash,
    cukcukRevenue: cukcukRevenue,
    cukcukBills: cukcukBills,
    manualIncome: manualIncome,
    manualBills: manualBills
  };
}


// ── History ──â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Get shift summary for HISTORY display.
 * Uses frozen summarySnapshot for closed shifts (immutable data at close time).
 * Falls back to live getShiftSummary() for current/legacy shifts without snapshot.
 */
export function getHistorySummary(shift) {
  if (!shift) return null;

  // ── CRITICAL: if this entry matches the currently open shift,
  // use the LIVE currentShift data (has latest cashCount, transactions, etc.)
  // Cloud sync may have created a stale copy without cashCount in shifts[].
  var s = getState();
  if (s.currentShift && s.currentShift.id === shift.id) {
    return getShiftSummary(s.currentShift);
  }

  // Closed shifts with snapshot: use it directly as the source of truth.
  // DO NOT recalculate from live invoiceStore — that creates artificial discrepancy
  // when CUKCUK data changes after closing while cashCountTotal stays frozen.
  if (shift.summarySnapshot && shift.status === 'closed') {
    var result = Object.assign({}, shift.summarySnapshot);

    // Edge case: snapshot was frozen before cash counting was done (cashCountTotal=0)
    // but the shift object itself has cashCount data (set by updateCashCount before close).
    if ((!result.cashCountTotal || result.cashCountTotal === 0) && shift.cashCount) {
      var cc = shift.cashCount;
      var recalcTotal = 0;
      for (var d in cc) {
        if (cc.hasOwnProperty(d)) recalcTotal += Number(d) * Number(cc[d]);
      }
      if (recalcTotal > 0) {
        result.cashCountTotal = recalcTotal;
        result.discrepancy = recalcTotal - (result.expectedCash || 0);
      }
    }

    return result;
  }

  // Fallback for legacy/open shifts without snapshot
  return getShiftSummary(shift);
}

// ── Rebuild snapshots from live CUKCUK data (matches handover report) ──────────
// Iterates all closed shifts and re-freezes summarySnapshot using fresh invoice store data.
// cashCountTotal is preserved from old snapshot (immutable ground truth from cash counting).
export function rebuildHistorySnapshots() {
  var s = getState();
  var shifts = s.shifts || [];
  var rebuilt = 0;

  for (var i = 0; i < shifts.length; i++) {
    var shift = shifts[i];
    if (shift.status !== 'closed') continue;

    // Calculate fresh summary without relying on stale snapshot
    var shiftCopy = Object.assign({}, shift);
    delete shiftCopy.summarySnapshot;

    try {
      var fresh = getShiftSummary(shiftCopy);
      // Preserve cashCountTotal from old snapshot (immutable: what was physically counted)
      var oldSnap = shift.summarySnapshot || {};
      var cashCountTotal = oldSnap.cashCountTotal !== undefined ? oldSnap.cashCountTotal : fresh.cashCountTotal;

      shifts[i].summarySnapshot = {
        totalIncome: fresh.totalIncome,
        totalExpense: fresh.totalExpense,
        cashIncome: fresh.cashIncome,
        cardIncome: fresh.cardIncome,
        transferIncome: fresh.transferIncome,
        cukcukRevenue: fresh.cukcukRevenue,
        cukcukBills: fresh.cukcukBills,
        billCount: fresh.billCount,
        expectedCash: fresh.expectedCash,
        cashCountTotal: cashCountTotal,
        cashExpense: fresh.cashExpense,
        discrepancy: cashCountTotal - fresh.expectedCash,
        manualIncome: fresh.manualIncome,
        manualBills: fresh.manualBills,
        otherIncome: fresh.otherIncome,
        otherExpense: fresh.otherExpense,
        revenue: fresh.revenue,
        netTotal: fresh.netTotal
      };
      rebuilt++;
    } catch(e) {
      console.warn('[Store] rebuildHistorySnapshots: error for shift', shift.id, e);
    }
  }

  if (rebuilt > 0) {
    s.shifts = shifts;
    save();
  }
  return rebuilt;
}


export function healPastShiftsData() {
  var s = getState();
  if (!s || !s.shifts) return 0;
  var shifts = s.shifts;
  var healedCount = 0;

  console.log('[Store] healPastShiftsData: starting auto-healing for ' + shifts.length + ' shifts');

  // Step 1: Normalize date formats and assign deterministic IDs to all legacy shifts
  for (var i = 0; i < shifts.length; i++) {
    var sh = shifts[i];
    if (sh.date) {
      sh.date = _normalizeDateStr(sh.date);
    } else {
      sh.date = new Date(sh.startTime || Date.now()).toISOString().split('T')[0];
    }
    // Update to deterministic ID format
    var detId = 'shift_' + sh.date + '_' + sh.shiftNumber;
    if (sh.id !== detId) {
      console.log('[Store] healPastShiftsData: updating ID ' + sh.id + ' → ' + detId);
      sh.id = detId;
      healedCount++;
    }
  }

  // Step 2: Aggressive deduplication by the new deterministic ID
  var bestById = {};
  for (var i = 0; i < shifts.length; i++) {
    var sh = shifts[i];
    var existing = bestById[sh.id];
    if (!existing) {
      bestById[sh.id] = sh;
    } else {
      // closed wins, snapshot wins, more transactions wins
      var eScore = (existing.status === 'closed' ? 10000 : 0) + (existing.summarySnapshot ? 1000 : 0) + (existing.endTime ? 100 : 0) + ((existing.transactions || []).length);
      var nScore = (sh.status === 'closed' ? 10000 : 0) + (sh.summarySnapshot ? 1000 : 0) + (sh.endTime ? 100 : 0) + ((sh.transactions || []).length);
      if (nScore > eScore) {
        bestById[sh.id] = sh;
      }
      healedCount++;
    }
  }

  var dedupedShifts = [];
  for (var k in bestById) {
    if (bestById.hasOwnProperty(k)) dedupedShifts.push(bestById[k]);
  }

  // Sort by date/startTime desc
  dedupedShifts.sort(function(a, b) {
    var da = (a.date || '') + (a.startTime || '');
    var db = (b.date || '') + (b.startTime || '');
    return da > db ? -1 : (da < db ? 1 : 0);
  });

  // Step 3: Backfill missing CUKCUK invoices snapshots for closed shifts by scanning active store using actual shift hours
  var invoiceData = localStorage.getItem('cukcuk_invoice_store');
  var invStore = null;
  try { if (invoiceData) invStore = JSON.parse(invoiceData); } catch (e) {}

  for (var i = 0; i < dedupedShifts.length; i++) {
    var sh = dedupedShifts[i];
    if (sh.status !== 'closed') continue;

    // Check if snapshot is missing OR if we need to heal/re-segment date 2026-05-21
    var needsInvs = !sh.cukcukInvoicesSnapshot || sh.cukcukInvoicesSnapshot.length === 0 || sh.date === '2026-05-21';
    
    if (needsInvs && invStore && invStore.invoices) {
      // Define exact bounds based on startTime and endTime
      var boundsStart, boundsEnd;
      if (sh.startTime) {
        boundsStart = new Date(sh.startTime);
      } else {
        var dp = sh.date.split('-');
        boundsStart = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), 12, 0, 0);
      }
      if (sh.endTime) {
        boundsEnd = new Date(sh.endTime);
      } else {
        // Fallback to 8 hours duration
        boundsEnd = new Date(boundsStart.getTime() + 8 * 3600 * 1000);
      }

      var matchedInvoices = [];
      for (var k in invStore.invoices) {
        if (!invStore.invoices.hasOwnProperty(k)) continue;
        var inv = invStore.invoices[k];
        if (inv.unpaid) continue;
        var match = false;
        if (inv.refDate) {
          var rd = new Date(inv.refDate);
          if (isNaN(rd.getTime()) && typeof inv.refDate === 'string') {
            var netM = inv.refDate.match(/\/Date\((\d+)\)\//);
            if (netM) rd = new Date(parseInt(netM[1]));
          }
          if (!isNaN(rd.getTime())) {
            match = rd >= boundsStart && rd < boundsEnd;
          }
        }
        if (!match && !inv.refDate) {
          match = inv.date === sh.date;
        }
        if (match) {
          matchedInvoices.push({
            refId: inv.refId, refNo: inv.refNo, refDate: inv.refDate,
            tableName: inv.tableName, amount: inv.amount, payments: inv.payments
          });
        }
      }

      if (matchedInvoices.length > 0) {
        sh.cukcukInvoicesSnapshot = matchedInvoices;
        console.log('[Store] healPastShiftsData: backfilled ' + matchedInvoices.length + ' invoices for shift ' + sh.id);
        healedCount++;
      }
    }

    // Rebuild the summarySnapshot statically to heal discrepancy and dynamic bleed
    var oldSummary = sh.summarySnapshot || {};
    var savedCashCountTotal = oldSummary.cashCountTotal;

    var copy = Object.assign({}, sh);
    delete copy.summarySnapshot;
    copy.status = '_rebuilding';

    var fresh;
    if (sh.cukcukInvoicesSnapshot && sh.cukcukInvoicesSnapshot.length > 0) {
      fresh = _getSummaryFromInvoicesSnapshot(copy, sh.cukcukInvoicesSnapshot);
    } else {
      fresh = getShiftSummary(copy);
    }

    var cc = sh.cashCount || {};
    var actualCashCount = 0;
    for (var d in cc) {
      if (cc.hasOwnProperty(d)) actualCashCount += Number(d) * Number(cc[d]);
    }
    var cashCountTotal = actualCashCount > 0 ? actualCashCount : (savedCashCountTotal || 0);

    // Apply strict healing of expected cash to eliminate artificial accumulated discrepancies!
    sh.summarySnapshot = {
      totalIncome: fresh.totalIncome,
      totalExpense: fresh.totalExpense,
      cashIncome: fresh.cashIncome,
      cardIncome: fresh.cardIncome,
      transferIncome: fresh.transferIncome,
      cukcukRevenue: fresh.cukcukRevenue,
      cukcukBills: fresh.cukcukBills,
      billCount: fresh.billCount,
      expectedCash: fresh.expectedCash,
      cashCountTotal: cashCountTotal,
      cashExpense: fresh.cashExpense,
      discrepancy: cashCountTotal - fresh.expectedCash,
      manualIncome: fresh.manualIncome,
      manualBills: fresh.manualBills,
      otherIncome: fresh.otherIncome,
      otherExpense: fresh.otherExpense,
      revenue: fresh.revenue,
      netTotal: fresh.netTotal
    };
    healedCount++;
  }

  // Save healed shifts
  s.shifts = dedupedShifts;
  s._healed = true;
  save();

  console.log('[Store] healPastShiftsData: complete. Healed and optimized ' + healedCount + ' shift entities.');

  // Push healed shifts back to Google Sheets database in background
  try {
    import('./api.js').then(function(api) {
      if (api.closeShiftOnCloud) {
        console.log('[Store] healPastShiftsData: syncing healed shifts to cloud...');
        var syncNext = function(idx) {
          if (idx >= dedupedShifts.length) {
            console.log('[Store] healPastShiftsData: cloud database synchronization fully complete.');
            return;
          }
          var cleanShift = JSON.parse(JSON.stringify(dedupedShifts[idx]));
          if (cleanShift.invoices) {
            for (var j = 0; j < cleanShift.invoices.length; j++) {
              delete cleanShift.invoices[j].data;
            }
          }
          api.closeShiftOnCloud(cleanShift).then(function() {
            setTimeout(function() { syncNext(idx + 1); }, 150);
          }).catch(function() {
            setTimeout(function() { syncNext(idx + 1); }, 150);
          });
        };
        syncNext(0);
      }
    });
  } catch(e) {}

  return healedCount;
}

export function getShiftHistory() {
  var s = getState();
  var shifts = s.shifts || [];
  var dirty = false;

  // Fix: remove stale copies of the currently open shift from history
  var currentId = s.currentShift ? s.currentShift.id : null;
  if (currentId) {
    var beforeLen = shifts.length;
    shifts = shifts.filter(function(sh) { return sh.id !== currentId; });
    if (shifts.length < beforeLen) {
      dirty = true;
      console.log('[Store] getShiftHistory: removed ' + (beforeLen - shifts.length) + ' stale copy of current shift');
    }
  }

  // Aggressive dedup: key = date + shiftNumber + cashierName (no startTime — format may differ)
  // Keep the BEST version: closed > open, has summarySnapshot > not, more transactions > fewer
  var bestByKey = {};
  for (var i = 0; i < shifts.length; i++) {
    var sh = shifts[i];
    var normDate = _normalizeDateStr(sh.date);
    var key = normDate + '_' + (sh.shiftNumber || '') + '_' + (sh.cashierName || '');
    var existing = bestByKey[key];
    if (!existing) {
      bestByKey[key] = sh;
    } else {
      // Score: closed shift wins, snapshot wins, more transactions wins
      var eScore = (existing.status === 'closed' ? 10000 : 0) + (existing.summarySnapshot ? 1000 : 0) + (existing.endTime ? 100 : 0) + ((existing.transactions || []).length);
      var nScore = (sh.status === 'closed' ? 10000 : 0) + (sh.summarySnapshot ? 1000 : 0) + (sh.endTime ? 100 : 0) + ((sh.transactions || []).length);
      if (nScore > eScore) {
        bestByKey[key] = sh;
      }
      dirty = true; // found a duplicate — need to persist cleanup
    }
  }

  var result = [];
  for (var k in bestByKey) {
    if (bestByKey.hasOwnProperty(k)) result.push(bestByKey[k]);
  }

  // Sort by date desc
  result.sort(function(a, b) {
    var da = (a.date || '') + (a.startTime || '');
    var db = (b.date || '') + (b.startTime || '');
    return da > db ? -1 : (da < db ? 1 : 0);
  });

  // Persist cleanup to localStorage so duplicates don't come back
  if (dirty) {
    s.shifts = result;
    save();
    console.log('[Store] getShiftHistory: cleaned up duplicates, ' + shifts.length + ' → ' + result.length);
  }

  return result;
}

export function saveShiftToHistory(shift) {
  if (!shift || !shift.id) return;
  var s = getState();
  if (!s.shifts) s.shifts = [];

  // Normalize date format
  if (shift.date) {
    shift.date = _normalizeDateStr(shift.date);
  }

  // Upsert pattern
  var foundIdx = -1;
  for (var i = 0; i < s.shifts.length; i++) {
    var shDate = _normalizeDateStr(s.shifts[i].date);
    if (s.shifts[i].id === shift.id || (shDate === shift.date && s.shifts[i].shiftNumber === shift.shiftNumber)) {
      foundIdx = i;
      break;
    }
  }
  if (foundIdx > -1) {
    s.shifts[foundIdx] = Object.assign(s.shifts[foundIdx], shift);
  } else {
    s.shifts.push(shift);
  }
  save();
}

export function deleteShiftFromHistory(id) {
  var s = getState();
  s.shifts = s.shifts.filter(function(sh) { return sh.id !== id; });
  // Tombstone: remember deleted IDs so cloud sync won't re-add
  if (!s._deletedShiftIds) s._deletedShiftIds = [];
  if (s._deletedShiftIds.indexOf(id) === -1) s._deletedShiftIds.push(id);
  // Cap tombstone list at 200
  if (s._deletedShiftIds.length > 200) s._deletedShiftIds = s._deletedShiftIds.slice(-200);
  save();
  addAudit('DELETE_SHIFT_HISTORY', 'ID: ' + id);
  // Also delete from cloud + push tombstone list for cross-device sync
  import('./api.js').then(function(api) {
    if (api.deleteShiftFromCloud) api.deleteShiftFromCloud(id).catch(function() {});
    // Push tombstones to cloud so other devices skip this shift too
    var tombstones = getState()._deletedShiftIds || [];
    api.saveConfigToCloud('deleted_shift_ids', JSON.stringify(tombstones)).catch(function() {});
  }).catch(function() {});
}

// ── History Shift Editing (edit-in-place, no restore to currentShift) ──

/** Push edited history shift to cloud as closedShift */
function _syncHistoryShiftToCloud(shift) {
  try {
    import('./api.js').then(function(api) {
      if (api.closeShiftOnCloud) {
        var cleanShift = JSON.parse(JSON.stringify(shift));
        if (cleanShift.invoices) {
          for (var i = 0; i < cleanShift.invoices.length; i++) {
            delete cleanShift.invoices[i].data;
          }
        }
        api.closeShiftOnCloud(cleanShift).catch(function(e) {
          console.warn('[Store] History shift cloud push failed:', e.message);
        });
      }
    });
  } catch(e) { /* ignore */ }
}

/** Find a shift in history by ID — returns { shift, index } or null */
function _findHistoryShift(shiftId) {
  var s = getState();
  var shifts = s.shifts || [];
  for (var i = 0; i < shifts.length; i++) {
    if (shifts[i].id === shiftId) return { shift: shifts[i], index: i };
  }
  return null;
}

/** Rebuild summarySnapshot from shift data (preserves cashCountTotal from physical counting) */
function _rebuildShiftSnapshot(shift) {
  // Temporarily remove snapshot so getShiftSummary recalculates from raw data
  var oldSnap = shift.summarySnapshot || {};
  var savedCashCountTotal = oldSnap.cashCountTotal;

  var copy = Object.assign({}, shift);
  delete copy.summarySnapshot;
  if (!shift.originalSummarySnapshot && shift.summarySnapshot) {
    shift.originalSummarySnapshot = Object.assign({}, shift.summarySnapshot);
  }

  // Force open status so getShiftSummary reads live invoiceStore/transactions
  copy.status = '_rebuilding';

  var fresh;
  if (shift.cukcukInvoicesSnapshot && shift.cukcukInvoicesSnapshot.length > 0) {
    fresh = _getSummaryFromInvoicesSnapshot(copy, shift.cukcukInvoicesSnapshot);
  } else {
    fresh = getShiftSummary(copy);
  }

  // cashCountTotal comes from the physical cash count data on the shift
  var cc = shift.cashCount || {};
  var actualCashCount = 0;
  for (var d in cc) {
    if (cc.hasOwnProperty(d)) actualCashCount += Number(d) * Number(cc[d]);
  }
  // Use actual count from shift.cashCount if available, else preserve old snapshot
  var cashCountTotal = actualCashCount > 0 ? actualCashCount : (savedCashCountTotal || 0);

  shift.summarySnapshot = {
    totalIncome: fresh.totalIncome,
    totalExpense: fresh.totalExpense,
    cashIncome: fresh.cashIncome,
    cardIncome: fresh.cardIncome,
    transferIncome: fresh.transferIncome,
    cukcukRevenue: fresh.cukcukRevenue,
    cukcukBills: fresh.cukcukBills,
    billCount: fresh.billCount,
    expectedCash: fresh.expectedCash,
    cashCountTotal: cashCountTotal,
    cashExpense: fresh.cashExpense,
    discrepancy: cashCountTotal - fresh.expectedCash,
    manualIncome: fresh.manualIncome,
    manualBills: fresh.manualBills,
    otherIncome: fresh.otherIncome,
    otherExpense: fresh.otherExpense,
    revenue: fresh.revenue,
    netTotal: fresh.netTotal
  };
}

export function addHistoryTransaction(shiftId, txData) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var tx = {
    id: uid(),
    type: txData.type,
    category: txData.category,
    amount: Number(txData.amount),
    paymentMethod: txData.paymentMethod || 'cash',
    note: txData.note || '',
    timestamp: new Date().toISOString()
  };
  if (!shift.transactions) shift.transactions = [];
  shift.transactions.push(tx);
  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('EDIT_HISTORY_ADD_TX', 'Ca ' + shift.date + ' #' + shift.shiftNumber + ': ' + (txData.type === 'income' ? '+' : '-') + Number(txData.amount).toLocaleString('vi-VN') + 'đ');
  return tx;
}

export function editHistoryTransaction(shiftId, txId, updates) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var txs = shift.transactions || [];
  for (var i = 0; i < txs.length; i++) {
    if (txs[i].id === txId) {
      var tx = txs[i];
      var oldAmt = tx.amount;
      if (updates.category !== undefined) tx.category = updates.category;
      if (updates.amount !== undefined) tx.amount = Number(updates.amount);
      if (updates.paymentMethod !== undefined) tx.paymentMethod = updates.paymentMethod;
      if (updates.note !== undefined) tx.note = updates.note;
      if (updates.type !== undefined) tx.type = updates.type;
      _rebuildShiftSnapshot(shift);
      save();
      _syncHistoryShiftToCloud(shift);
      addAudit('EDIT_HISTORY_TX', 'Ca ' + shift.date + ': ' + tx.category + ' ' + oldAmt.toLocaleString('vi-VN') + ' → ' + tx.amount.toLocaleString('vi-VN') + 'đ');
      return tx;
    }
  }
  throw new Error('Không tìm thấy giao dịch');
}

export function removeHistoryTransaction(shiftId, txId) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var tx = null;
  for (var i = 0; i < (shift.transactions || []).length; i++) {
    if (shift.transactions[i].id === txId) { tx = shift.transactions[i]; break; }
  }
  shift.transactions = (shift.transactions || []).filter(function(t) { return t.id !== txId; });
  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  if (tx) addAudit('EDIT_HISTORY_DEL_TX', 'Ca ' + shift.date + ': xóa ' + tx.category + ' ' + tx.amount.toLocaleString('vi-VN') + 'đ');
}

export function addHistoryOtherTransaction(shiftId, txData) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var tx = {
    id: uid(),
    type: txData.type,
    category: txData.category,
    amount: Number(txData.amount),
    note: txData.note || '',
    timestamp: new Date().toISOString()
  };
  if (!shift.otherTransactions) shift.otherTransactions = [];
  shift.otherTransactions.push(tx);
  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('EDIT_HISTORY_ADD_OTHER', 'Ca ' + shift.date + ': ' + txData.type + ' ' + txData.category + ' ' + Number(txData.amount).toLocaleString('vi-VN') + 'đ');
  return tx;
}

export function removeHistoryOtherTransaction(shiftId, txId) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  shift.otherTransactions = (shift.otherTransactions || []).filter(function(t) { return t.id !== txId; });
  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('EDIT_HISTORY_DEL_OTHER', 'Ca ' + shift.date + ': xóa giao dịch khác');
}

export function updateHistoryCashCount(shiftId, counts, pinnedCash, keepCash, handoverCash) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;

  var newCounts = {};
  for (var key in counts) { newCounts[key] = counts[key]; }
  shift.cashCount = newCounts;

  if (pinnedCash) {
    var newPins = {};
    for (var pk in pinnedCash) { if (pinnedCash[pk] > 0) newPins[pk] = pinnedCash[pk]; }
    shift.pinnedCash = newPins;
  }
  if (keepCash) {
    var newKeep = {};
    for (var kk in keepCash) { if (keepCash[kk] > 0) newKeep[kk] = keepCash[kk]; }
    shift.keepCash = newKeep;
  }
  if (handoverCash) {
    var newHand = {};
    for (var hk in handoverCash) { if (handoverCash[hk] > 0) newHand[hk] = handoverCash[hk]; }
    shift.handoverCash = newHand;
  }

  // Auto-calculate cashToKeep and cashToDeposit
  var totalKet = 0, totalGiao = 0;
  var pc = shift.pinnedCash || {};
  var kc = shift.keepCash || {};
  var hc = shift.handoverCash || {};
  for (var d in newCounts) {
    totalKet += Number(d) * ((pc[d] || 0) + (kc[d] || 0));
    totalGiao += Number(d) * (hc[d] || 0);
  }
  shift.cashToKeep = totalKet;
  shift.cashToDeposit = totalGiao;

  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  var total = totalKet + totalGiao;
  addAudit('EDIT_HISTORY_CASH', 'Ca ' + shift.date + ': Két ' + totalKet.toLocaleString('vi-VN') + ' | Giao ' + totalGiao.toLocaleString('vi-VN') + ' | Tổng ' + total.toLocaleString('vi-VN') + 'đ');
}

export function updateHistoryShiftField(shiftId, field, value) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var allowed = ['notes', 'startingCash', 'cashierName'];
  if (allowed.indexOf(field) === -1) throw new Error('Trường không hợp lệ: ' + field);
  var old = shift[field];
  shift[field] = value;
  if (field === 'startingCash') {
    shift[field] = Number(value) || 0;
    _rebuildShiftSnapshot(shift);
  }
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('EDIT_HISTORY_FIELD', 'Ca ' + shift.date + ': ' + field + ' thay đổi');
}

export function updateHistoryDrinkInventory(shiftId, items) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  if (!shift.drinkInventorySnapshot) shift.drinkInventorySnapshot = { items: {} };
  shift.drinkInventorySnapshot.items = items;
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('EDIT_HISTORY_DRINK_INV', 'Ca ' + shift.date + ': sửa kiểm kho');
}

export function editHistoryInvoicePayment(shiftId, refId, newPayments) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  var invoices = shift.cukcukInvoicesSnapshot || [];
  for (var i = 0; i < invoices.length; i++) {
    if (invoices[i].refId === refId) {
      invoices[i].payments = newPayments;
      // Recalc amount from payments
      var total = 0;
      for (var p = 0; p < newPayments.length; p++) total += newPayments[p].amount || 0;
      if (total > 0) invoices[i].amount = total;
      _rebuildShiftSnapshot(shift);
      save();
      _syncHistoryShiftToCloud(shift);
      addAudit('EDIT_HISTORY_INV_PAY', 'Ca ' + shift.date + ': sửa PTTT bill ' + (invoices[i].refNo || refId));
      return invoices[i];
    }
  }
  throw new Error('Không tìm thấy hóa đơn');
}

export function backfillHistoryInvoiceSnapshot(shiftId, invoicesArray) {
  var found = _findHistoryShift(shiftId);
  if (!found) throw new Error('Không tìm thấy ca');
  var shift = found.shift;
  // Save compact snapshot (same format as closeShift creates)
  shift.cukcukInvoicesSnapshot = invoicesArray.map(function(inv) {
    return {
      refId: inv.refId, refNo: inv.refNo, refDate: inv.refDate,
      tableName: inv.tableName, amount: inv.amount, payments: inv.payments
    };
  });
  _rebuildShiftSnapshot(shift);
  save();
  _syncHistoryShiftToCloud(shift);
  addAudit('BACKFILL_INV_SNAPSHOT', 'Ca ' + shift.date + ': lưu ' + invoicesArray.length + ' hóa đơn POS');
  return invoicesArray.length;
}

/**
 * Sync shift history with cloud â€” merge cloud shifts into local history.
 * Uses union merge: local shifts + cloud shifts not already in local.
 * Sorted by date descending (most recent first).
 */
var _historySyncInFlight = false;
export async function syncShiftHistory() {
  if (_historySyncInFlight) return false;
  _historySyncInFlight = true;
  try {
    var getShiftsFromCloud = null;
    try {
      var api = await import('./api.js');
      getShiftsFromCloud = api.getShiftsFromCloud;
    } catch(e) { _historySyncInFlight = false; return false; }

    var res = await getShiftsFromCloud();
    if (!res || !res.success || !res.shifts || !Array.isArray(res.shifts)) {
      _historySyncInFlight = false;
      return false;
    }

    var cloudShifts = res.shifts;
    var s = getState();
    if (!s.shifts) s.shifts = [];

    // Build index of local shift IDs
    var localIds = {};
    for (var i = 0; i < s.shifts.length; i++) {
      localIds[s.shifts[i].id] = i;
    }

    // Merge: add cloud shifts missing from local (skip tombstoned)
    var deletedIds = s._deletedShiftIds || [];
    // Pull tombstones from cloud for cross-device sync
    try {
      var configRes = await api.getConfigFromCloud();
      if (configRes && configRes.success && configRes.config) {
        var cloudTombStr = configRes.config.deleted_shift_ids;
        if (cloudTombStr) {
          var cloudTombs = typeof cloudTombStr === 'string' ? JSON.parse(cloudTombStr) : cloudTombStr;
          if (Array.isArray(cloudTombs)) {
            for (var ti = 0; ti < cloudTombs.length; ti++) {
              if (deletedIds.indexOf(cloudTombs[ti]) === -1) deletedIds.push(cloudTombs[ti]);
            }
          }
        }
      }
    } catch(tombErr) { /* ignore */ }
    // Fix: skip cloud shifts that match the currently open shift
    // (prevents stale copies without cashCount from appearing in history)
    var currentShiftId = s.currentShift ? s.currentShift.id : null;
    var added = 0;
    for (var j = 0; j < cloudShifts.length; j++) {
      var cs = cloudShifts[j];
      if (!cs || !cs.id) continue;
      // Skip shifts that were explicitly deleted by user
      if (deletedIds.indexOf(cs.id) !== -1) continue;
      // Skip the currently open shift — it belongs in currentShift, not history
      if (cs.id === currentShiftId) continue;
      if (localIds[cs.id] === undefined) {
        // Cloud shift not in local â†’ add
        cs.invoices = cs.invoices || [];
        s.shifts.push(cs);
        added++;
      } else {
        // Shift exists locally — sync content if different (e.g. edits made on another device)
        var localShift = s.shifts[localIds[cs.id]];
        
        var localStr = JSON.stringify({
          startingCash: localShift.startingCash,
          notes: localShift.notes || '',
          transactions: localShift.transactions || [],
          otherTransactions: localShift.otherTransactions || [],
          cashCount: localShift.cashCount || {},
          summarySnapshot: localShift.summarySnapshot || {}
        });
        
        var cloudStr = JSON.stringify({
          startingCash: cs.startingCash,
          notes: cs.notes || '',
          transactions: cs.transactions || [],
          otherTransactions: cs.otherTransactions || [],
          cashCount: cs.cashCount || {},
          summarySnapshot: cs.summarySnapshot || {}
        });
        
        if (localStr !== cloudStr) {
          console.log('[Store] History shift out of sync, updating local:', cs.id);
          // Preserve local invoices if available
          cs.invoices = localShift.invoices || cs.invoices || [];
          s.shifts[localIds[cs.id]] = cs;
          added++;
        }
      }
    }

    // Fix: remove any stale copies of the currently open shift from history
    if (currentShiftId) {
      var beforeLen = s.shifts.length;
      s.shifts = s.shifts.filter(function(sh) { return sh.id !== currentShiftId; });
      if (s.shifts.length < beforeLen) {
        console.log('[Store] Removed ' + (beforeLen - s.shifts.length) + ' stale copy(s) of current shift from history');
        added++;
      }
    }

    // Dedup: remove duplicate shifts with same (date + shiftNumber + cashierName)
    // Clones may differ by seconds in startTime — ignore startTime in key
    var seenKey = {};
    var deduped = [];
    for (var di = 0; di < s.shifts.length; di++) {
      var ds = s.shifts[di];
      var dkey = (ds.date || '') + '_' + (ds.shiftNumber || '') + '_' + (ds.cashierName || '');
      if (seenKey[dkey]) {
        var prev = seenKey[dkey];
        // Keep the "better" version: closed > open, more transactions wins
        var prevScore = (prev.status === 'closed' ? 1000 : 0) + ((prev.transactions || []).length);
        var dsScore = (ds.status === 'closed' ? 1000 : 0) + ((ds.transactions || []).length);
        if (dsScore > prevScore) {
          deduped = deduped.filter(function(x) { return x !== prev; });
          deduped.push(ds);
          seenKey[dkey] = ds;
        }
        continue;
      }
      seenKey[dkey] = ds;
      deduped.push(ds);
    }
    if (deduped.length < s.shifts.length) {
      var removed = s.shifts.length - deduped.length;
      s.shifts = deduped;
      added += removed;
      console.log('[Store] Dedup: removed ' + removed + ' duplicate shifts');
    }

    if (added > 0) {
      s.shifts.sort(function(a, b) {
        var da = (a.date || '') + (a.startTime || '');
        var db = (b.date || '') + (b.startTime || '');
        return da > db ? -1 : (da < db ? 1 : 0);
      });
      save();
      console.log('[Store] History synced: +' + added + ' shifts from cloud, total: ' + s.shifts.length);
    }

    _historySyncInFlight = false;
    return added > 0;
  } catch(e) {
    console.warn('[Store] History sync error:', e);
    _historySyncInFlight = false;
    return false;
  }
}

export function getCategories() { return getState().categories; }

export function addCategory(type, name) {
  if (!type || !name) return false;
  var s = getState();
  if (!s.categories) s.categories = JSON.parse(JSON.stringify(defaultCategories));
  if (!s.categories[type]) s.categories[type] = [];
  var trimmed = name.trim();
  if (!trimmed) return false;
  // Check duplicate
  for (var i = 0; i < s.categories[type].length; i++) {
    if (s.categories[type][i].toLowerCase() === trimmed.toLowerCase()) return false;
  }
  // Insert before "Thu khÃ¡c" / "Chi khÃ¡c" (the last item)
  var lastIdx = s.categories[type].length - 1;
  var lastItem = s.categories[type][lastIdx];
  if (lastItem === 'Thu khÃ¡c' || lastItem === 'Chi khÃ¡c') {
    s.categories[type].splice(lastIdx, 0, trimmed);
  } else {
    s.categories[type].push(trimmed);
  }
  save();
  addAudit('ADD_CATEGORY', type + ': ' + trimmed);
  _syncCategoriesToCloud();
  return true;
}

export function removeCategory(type, name) {
  var s = getState();
  if (!s.categories || !s.categories[type]) return false;
  s.categories[type] = s.categories[type].filter(function(c) { return c !== name; });
  save();
  addAudit('REMOVE_CATEGORY', type + ': ' + name);
  _syncCategoriesToCloud();
  return true;
}

/** Push categories to cloud for cross-device sync */
function _syncCategoriesToCloud() {
  try {
    import('./api.js').then(function(api) {
      var cats = getState().categories;
      api.saveConfigToCloud('categories', JSON.stringify(cats)).catch(function() {});
    });
  } catch(e) { /* ignore */ }
}

/** Pull categories from cloud (called on startup) */
export async function pullCategoriesFromCloud() {
  try {
    var api = await import('./api.js');
    var res = await api.getConfigFromCloud();
    if (res && res.success && res.config) {
      var cloudCats = null;
      // Config may be an object with 'categories' key
      if (res.config.categories) {
        cloudCats = typeof res.config.categories === 'string' ? JSON.parse(res.config.categories) : res.config.categories;
      }
      if (cloudCats && cloudCats.income && cloudCats.expense) {
        var s = getState();
        // Cloud-wins: cloud is pushed on every add/remove, so it is always the latest
        // This ensures deletions propagate across devices
        
        // MIGRATION: Fix mojibake in cloud categories
        const fixStr = (str) => {
          if (!str) return str;
          if (str.includes('Doanh thu b') && str.includes('n h')) return 'Doanh thu bán hàng';
          if (str.includes('Doanh thu d') && str.includes('ch v')) return 'Doanh thu dịch vụ';
          if (str.includes('Thu h') && str.includes('i n')) return 'Thu hồi nợ';
          if (str.includes('Mua nguy') && str.includes('n li')) return 'Mua nguyên liệu';
          if (str.includes('V') && str.includes('n chuy')) return 'Vận chuyển';
          if (str.startsWith('S') && str.includes('a ch')) return 'Sửa chữa';
          if (str.startsWith('Ti') && str.includes('n tip')) return 'Tiền tip/bo';
          if (str.startsWith('Tr') && str.includes('n')) return 'Trả nợ';
          if (str.startsWith('Thu kh')) return 'Thu khác';
          if (str.startsWith('Chi kh')) return 'Chi khác';
          return str;
        };
        
        let oldStr = JSON.stringify(cloudCats);
        if (cloudCats.income) cloudCats.income = cloudCats.income.map(fixStr);
        if (cloudCats.expense) cloudCats.expense = cloudCats.expense.map(fixStr);
        
        let hasMojibake = oldStr !== JSON.stringify(cloudCats);

        s.categories = cloudCats;
        save();
        console.log('[Store] Cloud categories synced');
        
        if (hasMojibake) {
           _syncCategoriesToCloud();
        }
      }
    }
  } catch(e) {
    console.warn('[Store] Category cloud pull error:', e);
  }
}

// â”€â”€ Cloud Sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Merge two transaction arrays by id (union). Used for cross-device sync. */
function _mergeTransactions(localTxs, cloudTxs) {
  var byId = {};
  var merged = [];
  var arr1 = localTxs || [];
  var arr2 = cloudTxs || [];
  for (var i = 0; i < arr1.length; i++) { byId[arr1[i].id] = true; merged.push(arr1[i]); }
  for (var j = 0; j < arr2.length; j++) {
    if (!byId[arr2[j].id]) { merged.push(arr2[j]); }
  }
  return merged.sort(function(a, b) {
    return (a.timestamp || '') > (b.timestamp || '') ? 1 : -1;
  });
}

var _syncTimer = null;
var _shiftDirty = false;
var _lastCloudPushTime = 0;
var _closeInProgress = false;

function _syncCurrentShift() {
  var settings = getState().settings;
  if (!settings || !settings.autoSync) return;
  if (!_cloudSync) return;
  if (_closeInProgress) return;

  _shiftDirty = true;

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function() {
    var shift = getCurrentShift();
    if (shift) {
      // Clone and remove heavy data
      var cleanShift = JSON.parse(JSON.stringify(shift));
      if (cleanShift.invoices) {
        for (var i = 0; i < cleanShift.invoices.length; i++) {
          delete cleanShift.invoices[i].data;
        }
      }
      try {
        _cloudSync(cleanShift).then(function() {
          _shiftDirty = false;
          _lastCloudPushTime = Date.now();
        }).catch(function() {});
      } catch (e) { /* ignore */ }
    }
  }, 1500); // 1.5s debounce for near real-time sync
}

/** Check if shift data has local changes not yet pushed to cloud */
export function isShiftDirty() { return _shiftDirty; }

/** Clear dirty flag (called after successful cloud pull) */
export function clearShiftDirty() { _shiftDirty = false; }

/** Get cloud sync metadata for UI status bar */
export function getCloudSyncMeta() {
  return {
    dirty: _shiftDirty,
    lastPushTime: _lastCloudPushTime,
    hasPendingPush: !!_syncTimer
  };
}

export async function syncCurrentShiftWithCloud() {
  if (!_cloudGetShift) return;
  if (_closeInProgress) return false;
  
  // If we are currently waiting to push local changes, don't pull (avoid race conditions)
  if (_syncTimer) return false;

  try {
    const res = await _cloudGetShift();
    if (res.success) {
      const cloudShift = res.shift;
      const s = getState();
      
      // Case 1: Cloud has no open shift but local does â†’ shift was closed on another device
      if (!cloudShift && s.currentShift) {
        // DON'T auto-close local shift! The cloud may just be empty.
        // Only push our local shift to cloud to restore sync.
        _syncCurrentShift();
        return false;
      }
      
      // Case 2: Cloud has an open shift AND local also has an open shift with SAME ID
      // → Sync updates (transactions, cash count, etc.) from other devices
      if (cloudShift && s.currentShift && s.currentShift.id === cloudShift.id) {
        var mergedTxs = _mergeTransactions(
          s.currentShift.transactions, cloudShift.transactions
        );
        var mergedOtherTxs = _mergeTransactions(
          s.currentShift.otherTransactions, cloudShift.otherTransactions
        );
        
        var hasChanges = false;
        if (mergedTxs.length !== (s.currentShift.transactions || []).length) hasChanges = true;
        if (mergedOtherTxs.length !== (s.currentShift.otherTransactions || []).length) hasChanges = true;
        if (cloudShift.startingCash !== s.currentShift.startingCash) hasChanges = true;
        if (cloudShift.status !== s.currentShift.status) hasChanges = true;
        if (cloudShift.notes !== s.currentShift.notes) hasChanges = true;
        if (JSON.stringify(cloudShift.cashCount || {}) !== JSON.stringify(s.currentShift.cashCount || {})) hasChanges = true;

        if (hasChanges) {
          // Use cloud as base for non-array fields (cashCount, notes, etc.)
          cloudShift.transactions = mergedTxs;
          cloudShift.otherTransactions = mergedOtherTxs;
          cloudShift.invoices = s.currentShift.invoices;
          // Preserve local cashCount data — user's manual input takes priority
          var localCC = s.currentShift.cashCount || {};
          if (Object.keys(localCC).length > 0) {
            cloudShift.cashCount = localCC;
            cloudShift.pinnedCash = s.currentShift.pinnedCash || cloudShift.pinnedCash;
            cloudShift.keepCash = s.currentShift.keepCash || cloudShift.keepCash;
            cloudShift.handoverCash = s.currentShift.handoverCash || cloudShift.handoverCash;
          }
          // Preserve security fields from local
          cloudShift.shiftPassword = cloudShift.shiftPassword || s.currentShift.shiftPassword;
          s.currentShift = cloudShift;
          save();
          return true;
        } else {
          return false;
        }
      }

      // Fix 1C: Check if cloud shift was already closed in history
      if (cloudShift && s.currentShift && s.currentShift.id !== cloudShift.id) {
        var cloudInHistory = (s.shifts || []).some(function(h) { return h.id === cloudShift.id; });
        if (cloudInHistory) {
          console.log('[Store] Cloud shift already in history, keeping local');
          _syncCurrentShift();
          return false;
        }
      }

      // Case 3: Both local and cloud have open shifts but DIFFERENT IDs
      // → Cloud shift always takes priority as the established master shift.
      if (cloudShift && s.currentShift && s.currentShift.id !== cloudShift.id) {
        console.log('[Store] Cloud shift is the established master, adopting cloud shift:', cloudShift.id);
        s.currentShift = cloudShift;
        s.currentShift.invoices = s.currentShift.invoices || [];
        save();
        return true;
      }
      
      // Fix 1A: Check if this shift was already closed and saved to history
      if (cloudShift && !s.currentShift) {
        var _alreadyClosed = (s.shifts || []).some(function(h) { return h.id === cloudShift.id; });
        if (_alreadyClosed) {
          console.log('[Store] Skipping cloud shift (already in history):', cloudShift.id);
          if (_cloudClose) { try { _cloudClose(cloudShift).catch(function(){}); } catch(e) {} }
          return false;
        }
        // Fix 1B: Check recently closed IDs (race condition protection)
        var _recentlyClosed = (s._recentlyClosedIds || []).indexOf(cloudShift.id) !== -1;
        if (_recentlyClosed) {
          console.log('[Store] Skipping cloud shift (recently closed):', cloudShift.id);
          if (_cloudClose) { try { _cloudClose(cloudShift).catch(function(){}); } catch(e) {} }
          return false;
        }
      }

      // Case 4: Cloud has an open shift but local does NOT â†’ apply cloud shift
      if (cloudShift && !s.currentShift) {
        var forceClosedIds = s._forceClosedIds || [];
        if (forceClosedIds.indexOf(cloudShift.id) !== -1) {
          console.log('[Store] Skipping cloud shift (force-closed locally):', cloudShift.id);
          if (_cloudClose) {
            try { _cloudClose(cloudShift).catch(function() {}); } catch (e) { /* */ }
          }
          return false;
        }
        if (cloudShift.status === 'closed') {
          console.log('[Store] Skipping cloud shift (already closed):', cloudShift.id);
          return false;
        }
        console.log('[Store] Cloud shift applied locally:', cloudShift.id, '- Ca', cloudShift.shiftNumber);
        s.currentShift = cloudShift;
        s.currentShift.invoices = s.currentShift.invoices || [];
        save();
        return true;
      }
    }
  } catch (e) {
    console.warn('[Store] Cloud sync pull error:', e);
  }
  return false;
}

// â”€â”€ Analytics Helpers (Feature 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getDailyReport(dateStr) {
  var shifts = getShiftHistory().filter(function(s) { return s.date === dateStr; });
  var totalIncome = 0, totalExpense = 0, cashTotal = 0, cardTotal = 0, transferTotal = 0, billCount = 0;
  for (var i = 0; i < shifts.length; i++) {
    var sm = getShiftSummary(shifts[i]);
    totalIncome += sm.totalIncome;
    totalExpense += sm.totalExpense + sm.otherExpense;
    cashTotal += sm.cashIncome;
    cardTotal += sm.cardIncome;
    transferTotal += sm.transferIncome;
    billCount += sm.billCount;
  }
  return {
    date: dateStr, shifts: shifts.length, totalIncome: totalIncome, totalExpense: totalExpense,
    cashTotal: cashTotal, cardTotal: cardTotal, transferTotal: transferTotal,
    billCount: billCount, net: totalIncome - totalExpense
  };
}

export function getWeeklyReport() {
  var today = new Date();
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
  }
  return days;
}

export function getMonthlyReport() {
  var today = new Date();
  var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  var days = [];
  var d = new Date(firstDay);
  while (d <= today) {
    var dateStr = d.toISOString().split('T')[0];
    days.push(getDailyReport(dateStr));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function getPrintForms() {
  var s = getState();
  if (!s.printForms) s.printForms = getInitialPrintForms();
  return s.printForms;
}

export function updatePrintForms(data) {
  var s = getState();
  s.printForms = data;
  save();
  addAudit('UPDATE_PRINT_FORMS', 'Cáº­p nháº­t máº«u in');
}

// â”€â”€ Staff Cache (localStorage) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Staff is cached locally so the shift open form always has data immediately
export function getCachedStaff() {
  try {
    var saved = localStorage.getItem(STAFF_CACHE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[Store] Staff cache read error:', e);
  }
  return [];
}

export function setCachedStaff(staffList) {
  try {
    localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(staffList));
  } catch (e) {
    console.warn('[Store] Staff cache write error:', e);
  }
}

export function clearCachedStaff() {
  try {
    localStorage.removeItem(STAFF_CACHE_KEY);
  } catch (e) { /* ignore */ }
}
