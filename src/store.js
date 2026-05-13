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
  income: ['Doanh thu bÃ¡n hÃ ng', 'Doanh thu dá»‹ch vá»¥', 'Thu há»“i ná»£', 'Thu khÃ¡c'],
  expense: ['Mua nguyÃªn liá»‡u', 'Váº­n chuyá»ƒn', 'Sá»­a chá»¯a', 'Tiá»n tip/bo', 'Tráº£ ná»£', 'Chi khÃ¡c']
};

var state = null;
var listeners = [];



function getInitialPrintForms() {
  return {
    checklist: [
      { section: 'CHECKLIST PHá»¤C Vá»¤ â€” Äáº¦U CA', items: [
        { cat: 'Vá»† SINH & SETUP', title: 'I. Vá»‡ sinh & setup khu trá»±c', list: [
          'Vá»‡ sinh sÃ n & Khu vá»±c chung: QuÃ©t vÃ  lau sáº¡ch tá»•ng thá»ƒ khu trá»±c, cá»•ng ra vÃ o.',
          'BÃ n gháº¿: Lau sáº¡ch bÃ n gháº¿, setup tiÃªu chuáº©n (ChÃ©n/ÄÅ©a/Ly...).',
          'Chuáº©n bá»‹ xÃ´ Ä‘Ã¡: Äáº£m báº£o sáº¡ch vÃ  Ä‘á»§ Ä‘Ã¡.',
          'Kiá»ƒm tra Menu: Sáº¯p xáº¿p ngay ngáº¯n, lau sáº¡ch bÃ¬a.'
        ]},
        { cat: 'CA 15H', title: 'II. SETUP & Vá»† SINH (CA 15H)', list: [
          'Bá»• sung váº­t tÆ° tiÃªu hao: TÄƒm, XiÃªn tre, á»ng hÃºt, Bao tay, DiÃªm, KhÄƒn giáº¥y, Há»™p mang vá»...',
          'Sáº¯p xáº¿p: Gá»n gÃ ng tá»§ Ä‘á»“, bá»‘ trÃ­ cÃ¡c Tráº¡m Ä‘á»“ dÃ¹ng dá»± phÃ²ng.'
        ]},
        { cat: 'BÃ€N Äáº¶T', title: 'III. BÃ n Ä‘áº·t trÆ°á»›c', list: [
          'Setup bÃ n Ä‘áº·t: ÄÃºng sá»‘ lÆ°á»£ng, mÃ u sáº¯c, nhu cáº§u tiá»‡c.',
          'ÄÃ¡nh dáº¥u: Cáº¯m khÄƒn giáº¥y hoáº·c Ä‘áº·t báº£ng "BÃ n Ä‘áº·t trÆ°á»›c".'
        ]},
        { cat: 'BÃ€N GIAO', title: 'IV. BÃ n giao Ä‘áº§u ca', list: [
          'Náº¯m báº¯t thÃ´ng tin: KhÃ¡ch Ä‘áº·t, mÃ³n háº¿t, lÆ°u Ã½ Ä‘áº·c biá»‡t tá»« ca trÆ°á»›c.'
        ]},
        { cat: 'TRONG CA', title: 'V. Kiá»ƒm tra chÃ©o & Bá»• sung (CÃ´ng viá»‡c trong ca)', list: [
          'Kiá»ƒm tra vá»‡ sinh liÃªn tá»¥c, bá»• sung Ä‘Ã¡/dá»¥ng cá»¥.',
          'Há»— trá»£ cÃ¡c bÃ n Ä‘Ã´ng khÃ¡ch.',
          'Kiá»ƒm tra tá»“n kho váº­t tÆ° tiÃªu hao.'
        ]}
      ]},
      { section: 'CHECKLIST PHá»¤C Vá»¤ â€” CUá»I CA', items: [
        { cat: 'XUá»NG CA', title: 'VI. Checklist Cuá»‘i ca & Xuá»‘ng ca', list: [
          'Thu dá»n bÃ n, vá»‡ sinh gáº§m bÃ n.',
          'Táº¯t cÃ¡c thiáº¿t bá»‹ Ä‘iá»‡n (MÃ¡y láº¡nh, ÄÃ¨n sáº£nh...).',
          'Dá»n dáº¹p tá»•ng thá»ƒ vÃ  khÃ³a cá»­a an toÃ n.',
          'BÃ n giao láº¡i thÃ´ng tin cho quáº£n lÃ½/ca sau.'
        ]}
      ]}
    ],
    inventory: {
      ncc: {
        title: 'KIá»‚M KÃŠ HÃ€NG HÃ“A â€” NHÃ€ CUNG Cáº¤P (THá»ŠT / Háº¢I Sáº¢N)',
        subtitle: 'CÃ”NG TY HOÃ€NG TRá»ŒNG / MM MARKET / THÃšY / Cáº¢NH',
        items: [
          {supplier:'C.THÃšY\nMM MARKET', items:['GÃ  (con)','Sá»¥n gÃ  (kg)','Trá»©ng muá»‘i','Thá»‹t bÃ² (kg)','GiÃ² heo (kg)','XÆ°Æ¡ng á»‘ng (kg)']},
          {supplier:'HOÃ€NG TRá»ŒNG\n0947459191', items:['ChÃ¢n gÃ  (kg)','Thanh cua (kg)','BÃ o ngÆ° (kg)','Ba rá»i bÃ² (kg)','Ba rá»i heo (kg)','Náº¡c dÄƒm (kg)','XÆ°Æ¡ng á»‘ng (kg)','SÆ°á»n heo (kg)','CÃ¡nh gÃ  (kg)','áº¾ch (kg)','Má»±c trá»©ng (kg)']},
          {supplier:'HUYá»€N Má»°C\nPHÆ¯á»šC THÃ€NH', items:['Má»±c Indo (kg)','TÃ´m SÃº size 30 (kg)','TÃ´m cÃ ng size 10 (kg)','á»c hÆ°Æ¡ng (kg)','Má»±c á»‘ng (kg)']}
        ],
        rightItems: ['KhÃ´ má»±c','BÃª','CÃ¡ chim','Báº¡ch tuá»™c','Má»±c 1 náº¯ng','CÃ¡ hokke','Khoai tÃ¢y','SÃ² Ä‘iá»‡p Nháº­t','NghÃªu','Ná»ng heo','BÆ¡ bÃ¡nh mÃ¬','CÃ¡ diÃªu há»“ng','Trá»©ng non','ThÃº Linh','Ba rá»i cÃ³ da','Phá»•i bÃ²','Tá»§y bÃ²','Pate','Khoai tÃ¢y cá»ng','Láº¡p xÆ°á»Ÿng xÃ´ng khÃ³i','SÃ² huyáº¿t','Ba rá»i xÃ´ng khÃ³i','TrÃ¢u gÃ¡c báº¿p','Báº¯p bÃ²','Bao tá»­','Da heo','Má»¡ heo','PhÃ´ mai sá»£i']
      },
      hangkho: {
        title: 'KIá»‚M KÃŠ HÃ€NG HÃ“A â€” HÃ€NG KHÃ” / GIA Vá»Š',
        leftItems: [
          'Bá»™t báº¯p','Bá»™t chanh','Bá»™t chiÃªn giÃ²n','Bá»™t gáº¡o','Bá»™t mÃ¬','Bá»™t nÄƒng','Bá»™t á»›t HQ','Bá»™t á»›t Viá»‡t','Bá»™t xÃ¹ tráº¯ng','Bá»™t náº¿p','Bá»™t nghá»‡','Bá»™t cÃ  ri','ÄÆ°á»ng cÃ¡t','ÄÆ°á»ng phÃ¨n','ÄÆ°á»ng thá»‘t ná»‘t','Muá»‘i há»™t','Muá»‘i bá»t','Muá»‘i TÃ¢y Ninh','TiÃªu Ä‘en','TiÃªu sá»','NgÅ© vá»‹ hÆ°Æ¡ng','Hoa há»“i','Quáº¿ cÃ¢y','Cá»‘m dáº¹p'
        ],
        rightItems: [
          'Dáº§u Äƒn (can 25l)','Giáº¥m tÃ¡o','Dáº§u hÃ o','NÆ°á»›c máº¯m','NÆ°á»›c tÆ°Æ¡ng Nhá»‹ ca','NÆ°á»›c tÆ°Æ¡ng háº¥p cÃ¡ LKK','TÆ°Æ¡ng cÃ ','TÆ°Æ¡ng á»›t','TÆ°Æ¡ng xÃ­ muá»™i','TÆ°Æ¡ng ngá»t','Dáº§u mÃ¨','CÃ  ri dáº§u','RÆ°á»£u náº¿p','RÆ°á»£u hoa tiÃªu','Vang tráº¯ng','BÃ¡nh pÃ­a','Bá»™t ngá»t','Pate gan','PhÃ´ mai BÃ² cÆ°á»i','Sá»¯a Ä‘áº·c','Sá»¯a tÆ°Æ¡i ko Ä‘Æ°á»ng','Chao','Láº¡p xÆ°á»Ÿng','BÃ¡nh trÃ¡ng cuá»‘n'
        ],
        extraLeft: ['MÃ¬ Miliket','MÃ¬ trá»©ng','MÃ¬ giÃ²n','Miáº¿n thÃ¡i','MÃ¹ táº¡t xanh','MÃ¹ táº¡t vÃ ng','NÆ°á»›c cá»‘t dá»«a','BÆ¡ Ä‘áº­u phá»™ng'],
        extraRight: ['Ká»‰ tá»­','Náº¥m mÃ¨o','Náº¥m Ä‘Ã´ng cÃ´','LÃ¡ nguyá»‡t quáº¿','Máº¡ch nha','BÆ¡ TÆ°á»ng An','Sá»‘t Ä‘á»“ nÆ°á»›ng','Háº¯c xÃ¬ dáº§u'],
        extraRightTitle: 'KHÃC'
      },
      hangrau1: {
        title: 'KIá»‚M KÃŠ HÃ€NG HÃ“A â€” HÃ€NG RAU 1',
        leftItems: [
          'Báº¯p cáº£i tráº¯ng:trÃ¡i','Báº§u:kg','CÃ  chua bi:kg','CÃ  chua lá»›n:kg','CÃ  tÃ­m:kg','CÃ  phÃ¡o:kg','Cá»§ dá»n:kg','Cá»§ sen:kg','DÆ°a leo Nháº­t:kg','DÆ°a leo nhá»:kg','Äáº­u báº¯p:kg','Äu Ä‘á»§:kg','GiÃ¡:kg','Gá»«ng:kg','HÃ nh phi:kg','Háº¡t sen:kg','Háº¹:kg','HÃºng lá»§i:kg','Kháº¿:kg','Khoai lang:kg','Khoai má»¡:kg','Khoai tÃ¢y:kg','Khá»• qua:kg','LÃ¡ chanh:kg'
        ],
        rightItems: [
          'LÃ¡ dá»©a:kg','LÃ¡ lá»‘t:kg','LÃ¡ mÆ¡:kg','LÃ¡ á»›t:kg','LÃ¡ quáº¿:kg','MÄƒng chua:kg','MÄƒng le:kg','BÆ°á»Ÿi:kg','Táº£o xoÄƒn:kg','Salad thá»§y tinh:kg','Salad fries:kg','Cáº£i cáº§u vá»“ng:kg','MÄƒng tÃ¢y:kg','Me váº¯t:kg','MÃ­a cÃ¢y:kg','Má»“ng tÆ¡i:kg','MÆ°á»›p:kg','Náº¥m báº¡ch tuyáº¿t:kg','Náº¥m Ä‘Ã´ng cÃ´:kg','Náº¥m Ä‘Ã¹i gÃ :kg','Náº¥m kim chÃ¢m:kg','Nghá»‡:kg','NgÃ² gai:kg','NgÃ² rÃ­:kg'
        ]
      },
      hangrau: {
        title: 'KIá»‚M KÃŠ HÃ€NG HÃ“A â€” HÃ€NG RAU 2',
        subtitle: 'NHáº¬P HÃ€NG NGÃ€Y',
        items: [
          'Tá»i cá»§:kg','HÃ nh tÃ¢y:kg','CÃ  rá»‘t:kg','ThÆ¡m lá»›n:kg','Táº¯c:kg','á»št sá»«ng:kg','Sáº£ cÃ¢y:kg','Tá»i xay:kg','Chanh:kg','Báº¯p Má»¹:kg','á»št xiÃªm xanh:kg','Äáº­u rá»“ng:kg','HÃ nh tÃ­m:kg','XoÃ i keo:kg','Cá»§ cáº£i tráº¯ng:kg','TiÃªu xanh:kg','Cá»§ sáº¥n:kg','Rau rÄƒm:kg','Äáº­u Ä‘Å©a:kg','LÃ¡ tÃ­a tÃ´:kg','HÃ nh lÃ¡:kg','Rau muá»‘ng:kg','SÃºp lÆ¡ xanh:kg','á»št chuÃ´ng:kg'
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
    cashiers: ['Thu ngÃ¢n 1', 'Thu ngÃ¢n 2', 'Thu ngÃ¢n 3'],
    auditLog: [],
    notifications: [],
    settings: {
      storeName: "KING's GRILL",
      storeAddress: '34, HoÃ ng VÄƒn Thá»¥, ChÃ¡nh NghÄ©a, TDM, BÃ¬nh DÆ°Æ¡ng',
      autoSync: true,
      discrepancyThreshold: 50000,
      shiftWarningHours: 10,
      requireLogin: true,
      adminPassword: '712121'
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
        state = parsed;
      } else {
        state = defaults();
      }
    } catch (e) {
      console.error('[Store] Load error:', e);
      state = defaults();
    }
  }
  // Migration v2 removed — summarySnapshot is now preserved as frozen data for history
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
  for (var key in newSettings) {
    s.settings[key] = newSettings[key];
  }
  save();
  addAudit('UPDATE_SETTINGS', JSON.stringify(newSettings));
}

// â”€â”€ Current shift â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getCurrentShift() { return getState().currentShift; }

export function openShift(opts) {
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

  s.currentShift = {
    id: uid(),
    cashierName: cashierName,
    shiftNumber: shiftNumber,
    date: date,
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
  var old = s.currentShift.startingCash || 0;
  s.currentShift.startingCash = Number(newAmount) || 0;
  save();
  addAudit('UPDATE_STARTING_CASH', 'Tiá»n Ä‘áº§u ca: ' + old.toLocaleString() + ' â†’ ' + s.currentShift.startingCash.toLocaleString());
  return s.currentShift;
}

export function closeShift(opts) {
  if (!opts) opts = {};
  var s = getState();
  if (!s.currentShift) throw new Error('KhÃ´ng cÃ³ ca nÃ o Ä‘ang má»Ÿ');

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
  var closedShift = s.currentShift;
  s.currentShift = null;
  save();
  addAudit('CLOSE_SHIFT', 'Ca ' + closedShift.shiftNumber + ' - Doanh thu: ' + summary.totalIncome.toLocaleString('vi-VN') + 'Ä‘');
  addNotification('Ca ' + closedShift.shiftNumber + ' Ä‘Ã£ Ä‘Ã³ng - DT: ' + summary.totalIncome.toLocaleString('vi-VN') + 'Ä‘', 'info');

  if (_cloudClose) {
    try { _cloudClose(closedShift).catch(function() {}); } catch (e) { /* ignore */ }
  }
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
  if (tx) addAudit('REMOVE_TX', tx.category + ' - ' + tx.amount.toLocaleString('vi-VN') + 'Ä‘');
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
      addAudit('EDIT_TX', tx.category + ': ' + oldAmt.toLocaleString('vi-VN') + ' â†’ ' + tx.amount.toLocaleString('vi-VN') + 'Ä‘');
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
  addAudit('ADD_OTHER_TX', opts.type + ': ' + opts.category + ' - ' + Number(opts.amount).toLocaleString('vi-VN') + 'Ä‘');
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
  addAudit('UPDATE_CASH_COUNT', 'KÃ©t: ' + totalKet.toLocaleString('vi-VN') + ' | Giao: ' + totalGiao.toLocaleString('vi-VN') + ' | Tá»•ng: ' + total.toLocaleString('vi-VN') + 'Ä‘');
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

  // â”€â”€ Step 1: Read CUKCUK invoices from invoiceStore (authoritative source) â”€â”€
  var hasInvoiceStoreData = false;
  if (shift.date) {
    try {
      var storeData = localStorage.getItem('cukcuk_invoice_store');
      if (storeData) {
        var parsed = JSON.parse(storeData);
        if (parsed && parsed.invoices) {
          var dp = shift.date.split('-');
          var shiftDay = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
          var boundsStart = new Date(shiftDay.getFullYear(), shiftDay.getMonth(), shiftDay.getDate(), 12, 0, 0);
          var nextDay = new Date(shiftDay);
          nextDay.setDate(nextDay.getDate() + 1);
          var boundsEnd = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 6, 0, 0);

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
                matchDay = rd >= boundsStart && rd < boundsEnd;
              }
            }
            if (!matchDay && !inv.refDate) {
              matchDay = inv.date === shift.date;
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


// â”€â”€ History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Get shift summary for HISTORY display.
 * Uses frozen summarySnapshot for closed shifts (immutable data at close time).
 * Falls back to live getShiftSummary() for current/legacy shifts without snapshot.
 */
export function getHistorySummary(shift) {
  if (!shift) return null;
  if (shift.summarySnapshot && shift.status === 'closed') {
    var snap = shift.summarySnapshot;
    return {
      totalIncome: snap.totalIncome || 0, totalExpense: snap.totalExpense || 0,
      cashIncome: snap.cashIncome || 0, cardIncome: snap.cardIncome || 0,
      transferIncome: snap.transferIncome || 0, cashExpense: snap.cashExpense || 0,
      cukcukRevenue: snap.cukcukRevenue || 0, cukcukBills: snap.cukcukBills || 0,
      billCount: snap.billCount || 0, expectedCash: snap.expectedCash || 0,
      cashCountTotal: snap.cashCountTotal || 0, discrepancy: snap.discrepancy || 0,
      manualIncome: snap.manualIncome || 0, manualBills: snap.manualBills || 0,
      otherIncome: snap.otherIncome || 0, otherExpense: snap.otherExpense || 0,
      revenue: snap.revenue || snap.totalIncome || 0,
      netTotal: snap.netTotal || snap.expectedCash || 0
    };
  }
  return getShiftSummary(shift);
}

export function getShiftHistory() { return getState().shifts || []; }

export function saveShiftToHistory(shift) {
  if (!shift || !shift.id) return;
  var s = getState();
  if (!s.shifts) s.shifts = [];
  // Avoid duplicates
  for (var i = 0; i < s.shifts.length; i++) {
    if (s.shifts[i].id === shift.id) return;
  }
  s.shifts.push(shift);
  save();
}

export function deleteShiftFromHistory(id) {
  var s = getState();
  s.shifts = s.shifts.filter(function(sh) { return sh.id !== id; });
  save();
  addAudit('DELETE_SHIFT_HISTORY', 'ID: ' + id);
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

    // Merge: add cloud shifts missing from local
    var added = 0;
    for (var j = 0; j < cloudShifts.length; j++) {
      var cs = cloudShifts[j];
      if (!cs || !cs.id) continue;
      if (localIds[cs.id] === undefined) {
        // Cloud shift not in local â†’ add
        cs.invoices = cs.invoices || [];
        s.shifts.push(cs);
        added++;
      } else {
        // Shift exists locally — closed shifts are IMMUTABLE (final data)
        var localShift = s.shifts[localIds[cs.id]];
        if (localShift.status === 'closed') continue;
        // Only update open shifts if cloud has more data
        var localTxCount = (localShift.transactions || []).length;
        var cloudTxCount = (cs.transactions || []).length;
        if (cloudTxCount > localTxCount) {
          cs.invoices = localShift.invoices || [];
          s.shifts[localIds[cs.id]] = cs;
          added++;
        }
      }
    }

    // Dedup: remove duplicate shifts with same (date + shiftNumber + cashierName + startTime)
    var seenKey = {};
    var deduped = [];
    for (var di = 0; di < s.shifts.length; di++) {
      var ds = s.shifts[di];
      var dkey = (ds.date || '') + '_' + (ds.shiftNumber || '') + '_' + (ds.cashierName || '') + '_' + (ds.startTime || '').substring(0, 19);
      if (seenKey[dkey]) {
        var prev = seenKey[dkey];
        if (ds.status === 'closed' && prev.status !== 'closed') {
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
        var localCats = s.categories || defaultCategories;
        // Merge: union of local + cloud (keep all)
        var merged = { income: [], expense: [] };
        var seen = { income: {}, expense: {} };
        ['income', 'expense'].forEach(function(type) {
          var all = (localCats[type] || []).concat(cloudCats[type] || []);
          for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!seen[type][c.toLowerCase()]) {
              seen[type][c.toLowerCase()] = true;
              merged[type].push(c);
            }
          }
        });
        s.categories = merged;
        save();
        console.log('[Store] â˜ï¸ Categories synced from cloud');
      }
    }
  } catch(e) {
    console.warn('[Store] Category cloud pull error:', e);
  }
}

// â”€â”€ Cloud Sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var _syncTimer = null;
var _shiftDirty = false;
var _lastCloudPushTime = 0;

function _syncCurrentShift() {
  var settings = getState().settings;
  if (!settings || !settings.autoSync) return;
  if (!_cloudSync) return;

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
      // â†’ Sync updates (transactions, cash count, etc.) from other devices
      if (cloudShift && s.currentShift && s.currentShift.id === cloudShift.id) {
        const localCompare = JSON.stringify(Object.assign({}, s.currentShift, { invoices: [] }));
        const cloudCompare = JSON.stringify(Object.assign({}, cloudShift, { invoices: [] }));

        if (localCompare !== cloudCompare) {
          // Same shift, different content â†’ merge cloud data but keep local invoices
          cloudShift.invoices = s.currentShift.invoices;
          s.currentShift = cloudShift;
          save();
          return true;
        }
      }

      // Case 3: Both local and cloud have open shifts but DIFFERENT IDs
      // â†’ Keep the NEWER shift (by startTime), push it to cloud
      if (cloudShift && s.currentShift && s.currentShift.id !== cloudShift.id) {
        var localStart = new Date(s.currentShift.startTime || 0).getTime();
        var cloudStart = new Date(cloudShift.startTime || 0).getTime();
        if (localStart >= cloudStart) {
          // Local is newer â€” push local to cloud, ignore stale cloud shift
          console.log('[Store] Local shift is newer than cloud, pushing local to cloud');
          _syncCurrentShift();
          return false;
        } else {
          // Cloud is newer â€” apply cloud shift
          console.log('[Store] Cloud shift is newer, applying:', cloudShift.id);
          s.currentShift = cloudShift;
          s.currentShift.invoices = s.currentShift.invoices || [];
          save();
          return true;
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
