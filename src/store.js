/* ============================================
   KG-CASHIER — Data Store (localStorage + Cloud Sync)
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
      { section: 'CHECKLIST PHỤC VỤ — ĐẦU CA', items: [
        { cat: 'VỆ SINH & SETUP', title: 'I. Vệ sinh & setup khu trực', list: [
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
      { section: 'CHECKLIST PHỤC VỤ — CUỐI CA', items: [
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
        title: 'KIỂM KÊ HÀNG HÓA — NHÀ CUNG CẤP (THỊT / HẢI SẢN)',
        subtitle: 'CÔNG TY HOÀNG TRỌNG / MM MARKET / THÚY / CẢNH',
        items: [
          {supplier:'C.THÚY\nMM MARKET', items:['Gà (con)','Sụn gà (kg)','Trứng muối','Thịt bò (kg)','Giò heo (kg)','Xương ống (kg)']},
          {supplier:'HOÀNG TRỌNG\n0947459191', items:['Chân gà (kg)','Thanh cua (kg)','Bào ngư (kg)','Ba rọi bò (kg)','Ba rọi heo (kg)','Nạc dăm (kg)','Xương ống (kg)','Sườn heo (kg)','Cánh gà (kg)','Ếch (kg)','Mực trứng (kg)']},
          {supplier:'HUYỀN MỰC\nPHƯỚC THÀNH', items:['Mực Indo (kg)','Tôm Sú size 30 (kg)','Tôm càng size 10 (kg)','Ốc hương (kg)','Mực ống (kg)']}
        ],
        rightItems: ['Khô mực','Bê','Cá chim','Bạch tuộc','Mực 1 nắng','Cá hokke','Khoai tây','Sò điệp Nhật','Nghêu','Nọng heo','Bơ bánh mì','Cá diêu hồng','Trứng non','Thú Linh','Ba rọi có da','Phổi bò','Tủy bò','Pate','Khoai tây cọng','Lạp xưởng xông khói','Sò huyết','Ba rọi xông khói','Trâu gác bếp','Bắp bò','Bao tử','Da heo','Mỡ heo','Phô mai sợi']
      },
      hangkho: {
        title: 'KIỂM KÊ HÀNG HÓA — HÀNG KHÔ / GIA VỊ',
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
        title: 'KIỂM KÊ HÀNG HÓA — HÀNG RAU 1',
        leftItems: [
          'Bắp cải trắng:trái','Bầu:kg','Cà chua bi:kg','Cà chua lớn:kg','Cà tím:kg','Cà pháo:kg','Củ dền:kg','Củ sen:kg','Dưa leo Nhật:kg','Dưa leo nhỏ:kg','Đậu bắp:kg','Đu đủ:kg','Giá:kg','Gừng:kg','Hành phi:kg','Hạt sen:kg','Hẹ:kg','Húng lủi:kg','Khế:kg','Khoai lang:kg','Khoai mỡ:kg','Khoai tây:kg','Khổ qua:kg','Lá chanh:kg'
        ],
        rightItems: [
          'Lá dứa:kg','Lá lốt:kg','Lá mơ:kg','Lá ớt:kg','Lá quế:kg','Măng chua:kg','Măng le:kg','Bưởi:kg','Tảo xoăn:kg','Salad thủy tinh:kg','Salad fries:kg','Cải cầu vồng:kg','Măng tây:kg','Me vắt:kg','Mía cây:kg','Mồng tơi:kg','Mướp:kg','Nấm bạch tuyết:kg','Nấm đông cô:kg','Nấm đùi gà:kg','Nấm kim châm:kg','Nghệ:kg','Ngò gai:kg','Ngò rí:kg'
        ]
      },
      hangrau: {
        title: 'KIỂM KÊ HÀNG HÓA — HÀNG RAU 2',
        subtitle: 'NHẬP HÀNG NGÀY',
        items: [
          'Tỏi củ:kg','Hành tây:kg','Cà rốt:kg','Thơm lớn:kg','Tắc:kg','Ớt sừng:kg','Sả cây:kg','Tỏi xay:kg','Chanh:kg','Bắp Mỹ:kg','Ớt xiêm xanh:kg','Đậu rồng:kg','Hành tím:kg','Xoài keo:kg','Củ cải trắng:kg','Tiêu xanh:kg','Củ sấn:kg','Rau răm:kg','Đậu đũa:kg','Lá tía tô:kg','Hành lá:kg','Rau muống:kg','Súp lơ xanh:kg','Ớt chuông:kg'
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
  addAudit('RESET_PRINT_FORMS', 'Khôi phục mẫu in mặc định');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ── Load / Save ──────────────────────────────
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

// ── Audit Trail (Feature 10) ─────────────────
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

// ── Notifications (Feature 5) ────────────────
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

// ── Login / Session (Feature 8 - RBAC) ───────
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

// ── Settings (Feature 9) ─────────────────────
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

// ── Current shift ────────────────────────────
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
    throw new Error('Đã có ca đang mở. Hãy đóng ca trước.');
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
  addNotification('Ca ' + shiftNumber + ' đã được mở bởi ' + cashierName, 'success');
  _syncCurrentShift();
  return s.currentShift;
}

/** Cập nhật tiền đầu ca (bổ sung thêm tiền mặt vào quỹ) */
export function updateStartingCash(newAmount) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa có ca đang mở.');
  var old = s.currentShift.startingCash || 0;
  s.currentShift.startingCash = Number(newAmount) || 0;
  save();
  addAudit('UPDATE_STARTING_CASH', 'Tiền đầu ca: ' + old.toLocaleString() + ' → ' + s.currentShift.startingCash.toLocaleString());
  return s.currentShift;
}

export function closeShift(opts) {
  if (!opts) opts = {};
  var s = getState();
  if (!s.currentShift) throw new Error('Không có ca nào đang mở');

  s.currentShift.endTime = new Date().toISOString();
  s.currentShift.status = 'closed';
  s.currentShift.notes = opts.notes || '';
  s.currentShift.cashToKeep = Number(opts.cashToKeep) || 0;
  s.currentShift.cashToDeposit = Number(opts.cashToDeposit) || 0;

  var summary = getShiftSummary(s.currentShift);

  // Check discrepancy (Feature 5)
  var threshold = (s.settings && s.settings.discrepancyThreshold) ? s.settings.discrepancyThreshold : 50000;
  if (summary.cashCountTotal > 0 && Math.abs(summary.discrepancy) > threshold) {
    addNotification('⚠️ Chênh lệch tiền mặt: ' + summary.discrepancy.toLocaleString('vi-VN') + 'đ', 'warning');
  }

  s.shifts.unshift(JSON.parse(JSON.stringify(s.currentShift)));
  var closedShift = s.currentShift;
  s.currentShift = null;
  save();
  addAudit('CLOSE_SHIFT', 'Ca ' + closedShift.shiftNumber + ' - Doanh thu: ' + summary.totalIncome.toLocaleString('vi-VN') + 'đ');
  addNotification('Ca ' + closedShift.shiftNumber + ' đã đóng - DT: ' + summary.totalIncome.toLocaleString('vi-VN') + 'đ', 'info');

  if (_cloudClose) {
    try { _cloudClose(closedShift).catch(function() {}); } catch (e) { /* ignore */ }
  }
}

// ── Transactions ─────────────────────────────
export function addTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
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
  addAudit('ADD_TX', (opts.type === 'income' ? '+' : '-') + Number(opts.amount).toLocaleString('vi-VN') + 'đ - ' + opts.category);
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

export function addOtherTransaction(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
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

// ── Cash count ───────────────────────────────
export function updateCashCount(counts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
  var newCounts = {};
  for (var key in counts) { newCounts[key] = counts[key]; }
  s.currentShift.cashCount = newCounts;
  save();
  var total = 0;
  for (var d in counts) { total += Number(d) * Number(counts[d]); }
  addAudit('UPDATE_CASH_COUNT', 'Tổng: ' + total.toLocaleString('vi-VN') + 'đ');
  _syncCurrentShift();
}

// ── Invoices ─────────────────────────────────
export function addInvoice(opts) {
  var s = getState();
  if (!s.currentShift) throw new Error('Chưa mở ca');
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

// ── Summary ──────────────────────────────────
export function getShiftSummary(shift) {
  if (!shift) shift = getState().currentShift;
  if (!shift) return null;
  var txs = shift.transactions || [];
  var otherTxs = shift.otherTransactions || [];

  var totalIncome = 0, totalExpense = 0, cashIncome = 0, cardIncome = 0, transferIncome = 0, cashExpense = 0, otherIncome = 0, otherExpense = 0, billCount = 0;
  // CUKCUK breakdown
  var cukcukRevenue = 0, cukcukBills = 0;
  var manualIncome = 0, manualBills = 0;

  for (var i = 0; i < txs.length; i++) {
    var t = txs[i];
    var isCukcuk = t.note && t.note.indexOf('[CUKCUK]') !== -1;
    if (t.type === 'income') {
      totalIncome += t.amount;
      billCount++;
      if (t.paymentMethod === 'cash') cashIncome += t.amount;
      else if (t.paymentMethod === 'card') cardIncome += t.amount;
      else if (t.paymentMethod === 'transfer') transferIncome += t.amount;
      // Separate CUKCUK vs manual
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
    // CUKCUK breakdown
    cukcukRevenue: cukcukRevenue,
    cukcukBills: cukcukBills,
    manualIncome: manualIncome,
    manualBills: manualBills
  };
}

// ── History ──────────────────────────────────
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
  // Insert before "Thu khác" / "Chi khác" (the last item)
  var lastIdx = s.categories[type].length - 1;
  var lastItem = s.categories[type][lastIdx];
  if (lastItem === 'Thu khác' || lastItem === 'Chi khác') {
    s.categories[type].splice(lastIdx, 0, trimmed);
  } else {
    s.categories[type].push(trimmed);
  }
  save();
  addAudit('ADD_CATEGORY', type + ': ' + trimmed);
  return true;
}

export function removeCategory(type, name) {
  var s = getState();
  if (!s.categories || !s.categories[type]) return false;
  s.categories[type] = s.categories[type].filter(function(c) { return c !== name; });
  save();
  addAudit('REMOVE_CATEGORY', type + ': ' + name);
  return true;
}

// ── Cloud Sync ───────────────────────────────
var _syncTimer = null;

function _syncCurrentShift() {
  var settings = getState().settings;
  if (!settings || !settings.autoSync) return;
  if (!_cloudSync) return;

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
      try { _cloudSync(cleanShift).catch(function() {}); } catch (e) { /* ignore */ }
    }
  }, 1500); // 1.5s debounce for near real-time sync
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
      
      // Case 1: Cloud has no open shift but local does → shift was closed on another device
      if (!cloudShift && s.currentShift) {
        s.currentShift = null;
        save();
        return true;
      }
      
      // Case 2: Cloud has an open shift AND local also has an open shift with SAME ID
      // → Sync updates (transactions, cash count, etc.) from other devices
      if (cloudShift && s.currentShift && s.currentShift.id === cloudShift.id) {
        const localCompare = JSON.stringify(Object.assign({}, s.currentShift, { invoices: [] }));
        const cloudCompare = JSON.stringify(Object.assign({}, cloudShift, { invoices: [] }));

        if (localCompare !== cloudCompare) {
          // Same shift, different content → merge cloud data but keep local invoices
          cloudShift.invoices = s.currentShift.invoices;
          s.currentShift = cloudShift;
          save();
          return true;
        }
      }
      
      // Case 3: Cloud has an open shift but local does NOT
      // → Do NOT auto-apply! This prevents the "phantom shift" bug where a stale
      //   cloud shift keeps reappearing. The user must explicitly open a shift.
      //   (Previously this would silently set s.currentShift = cloudShift, causing
      //    the "Admin đang mở ca" notification when nobody actually opened a shift)
    }
  } catch (e) {
    console.warn('[Store] Cloud sync pull error:', e);
  }
  return false;
}

// ── Analytics Helpers (Feature 4) ────────────
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
  addAudit('UPDATE_PRINT_FORMS', 'Cập nhật mẫu in');
}

// ── Staff Cache (localStorage) ───────────────
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
