// ============== KG-CASHIER BACKEND ==============
// Thêm file này vào Google Apps Script project
// Spreadsheet ID: 1drWBOfgTZ1nqgl-W_gb24P-7r4WRoxHxAfk657tvLQQ
// Drive Folder ID: 15FAybIiVn96rEXs7BoaTQL5yyqkWHoJz

const CASHIER_SS_ID = '1drWBOfgTZ1nqgl-W_gb24P-7r4WRoxHxAfk657tvLQQ';
const CASHIER_DRIVE_ID = '15FAybIiVn96rEXs7BoaTQL5yyqkWHoJz';

// ══════════════════════════════════════════════
//  ADVANCED SHEETS API — Bulk Read/Write
//  Requires: Google Sheets API v4 enabled in
//  Apps Script → Services → Google Sheets API
// ══════════════════════════════════════════════

/**
 * Read all data from a sheet using Advanced Sheets API.
 * Returns 2D array (including header row).
 * Falls back to SpreadsheetApp if Advanced API unavailable.
 */
function _sheetsGet(sheetName) {
  try {
    var resp = Sheets.Spreadsheets.Values.get(CASHIER_SS_ID, sheetName);
    return resp.values || [];
  } catch(e) {
    // Fallback: sheet doesn't exist or API not enabled
    return [];
  }
}

/**
 * Batch write rows to a sheet using Advanced Sheets API.
 * Much faster than individual setValues calls.
 * @param {string} sheetName
 * @param {string} range - A1 notation, e.g. 'Sheet1!A2:L'
 * @param {Array[]} values - 2D array of values
 */
function _sheetsBatchWrite(sheetName, range, values) {
  if (!values || values.length === 0) return;
  Sheets.Spreadsheets.Values.update(
    { values: values },
    CASHIER_SS_ID,
    range,
    { valueInputOption: 'RAW' }
  );
}

/**
 * Append rows to end of sheet using Advanced Sheets API.
 * Fastest method for bulk insert.
 */
function _sheetsAppend(sheetName, values) {
  if (!values || values.length === 0) return;
  Sheets.Spreadsheets.Values.append(
    { values: values },
    CASHIER_SS_ID,
    sheetName + '!A1',
    { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }
  );
}

/**
 * Clear a specific range using Advanced API.
 */
function _sheetsClear(range) {
  try {
    Sheets.Spreadsheets.Values.clear({}, CASHIER_SS_ID, range);
  } catch(e) { /* ignore */ }
}

// ── Web App Handlers ─────────────────────────
function doGet(e) {
  return _handleCashierRequest(e);
}

function doPost(e) {
  return _handleCashierRequest(e);
}

function _handleCashierRequest(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let result = { success: false, message: 'Unknown action' };

  try {
    let data = {};
    if (e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch(ex) { data = {}; }
    }
    // Merge URL params
    Object.assign(data, e.parameter || {});

    switch (action) {
      // Shifts
      case 'syncShift':       result = _syncShift(data); break;
      case 'closeShift':      result = _closeShift(data); break;
      case 'getShifts':       result = _getShifts(data); break;
      case 'getCurrentShift': result = _getCurrentShift(); break;
      // Staff
      case 'getStaff':        result = _getStaff(); break;
      case 'saveStaff':       result = _saveStaff(data); break;
      case 'deleteStaff':     result = _deleteStaff(data); break;
      case 'login':           result = _login(data); break;
      // Audit
      case 'addAudit':        result = _addAuditLog(data); break;
      case 'getAudit':        result = _getAuditLog(data); break;
      // Files
      case 'uploadFile':      result = _uploadFileToDrive(data); break;
      case 'deleteFile':      result = _deleteFileFromDrive(data); break;
      // Settings
      case 'getSettings':     result = _getSettings(); break;
      case 'saveSettings':    result = _saveSettings(data); break;
      // Config (fast-load staff + store settings)
      case 'getConfig':       result = _getConfig(); break;
      case 'saveConfig':      result = _saveConfig(data); break;
      // CUKCUK Revenue (monthly sheets)
      case 'syncCukcukRevenue': result = _syncCukcukRevenue(data); break;
      // Health
      case 'ping':            result = { success: true, message: 'pong', timestamp: new Date().toISOString() }; break;
      default:
        result = { success: false, message: 'Unknown action: ' + action };
    }
  } catch (error) {
    result = { success: false, message: error.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet Helpers ────────────────────────────
function _getSheet(name, headers) {
  const ss = SpreadsheetApp.openById(CASHIER_SS_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#e8a838')
        .setFontColor('#111');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function _getSheetData(name) {
  // Use Advanced Sheets API for faster bulk read
  var allRows = _sheetsGet(name);
  if (!allRows || allRows.length < 2) return [];
  var headers = allRows[0];
  var result = [];
  for (var r = 1; r < allRows.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = (allRows[r] && allRows[r][c] !== undefined) ? allRows[r][c] : '';
    }
    result.push(obj);
  }
  return result;
}

// ── Shift CRUD ───────────────────────────────
function _syncShift(data) {
  const headers = ['id','cashierName','shiftNumber','date','startTime','endTime','startingCash','status','notes','cashToKeep','cashToDeposit','jsonData','lastSync'];
  const sheet = _getSheet('KG_SHIFTS', headers);

  if (!data.id) return { success: false, message: 'Missing shift ID' };

  // Use Advanced API for fast row lookup
  var allRows = _sheetsGet('KG_SHIFTS');
  let rowIndex = -1;
  if (allRows && allRows.length > 1) {
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === data.id) { rowIndex = i + 1; break; }
    }
  }

  const jsonData = JSON.stringify({
    transactions: data.transactions || [],
    otherTransactions: data.otherTransactions || [],
    cashCount: data.cashCount || {},
    summarySnapshot: data.summarySnapshot || null,
    cukcukInvoicesSnapshot: data.cukcukInvoicesSnapshot || [],
    drinkInventorySnapshot: data.drinkInventorySnapshot || null,
    pinnedCash: data.pinnedCash || {},
    keepCash: data.keepCash || {},
    handoverCash: data.handoverCash || {},
    invoices: (data.invoices || []).map(inv => ({ ...inv, data: undefined })), // Don't store base64 in sheets
    shiftPassword: data.shiftPassword || ''
  });

  const row = [
    data.id, data.cashierName || '', data.shiftNumber || '',
    data.date || '', data.startTime || '', data.endTime || '',
    data.startingCash || 0, data.status || 'open',
    data.notes || '', data.cashToKeep || 0, data.cashToDeposit || 0,
    jsonData, new Date().toISOString()
  ];

  if (rowIndex > 0) {
    _sheetsBatchWrite('KG_SHIFTS', 'KG_SHIFTS!A' + rowIndex + ':M' + rowIndex, [row]);
  } else {
    _sheetsAppend('KG_SHIFTS', [row]);
  }

  _addAuditLog({ user: data.cashierName, action: 'SYNC_SHIFT', details: 'Ca ' + data.shiftNumber + ' - ' + data.date });

  return { success: true, message: 'Đã đồng bộ ca làm việc' };
}

function _closeShift(data) {
  data.status = 'closed';
  data.endTime = data.endTime || new Date().toISOString();
  const result = _syncShift(data);
  if (result.success) {
    _addAuditLog({ user: data.cashierName, action: 'CLOSE_SHIFT', details: 'Đóng ca ' + data.shiftNumber });
  }
  return result;
}

function _getShifts(params) {
  const rows = _getSheetData('KG_SHIFTS');
  const shifts = rows.map(row => {
    let extra = {};
    try { extra = JSON.parse(row.jsonData || '{}'); } catch(e) {}
    return {
      id: row.id,
      cashierName: row.cashierName,
      shiftNumber: row.shiftNumber,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      startingCash: Number(row.startingCash) || 0,
      status: row.status,
      notes: row.notes,
      cashToKeep: Number(row.cashToKeep) || 0,
      cashToDeposit: Number(row.cashToDeposit) || 0,
      transactions: extra.transactions || [],
      otherTransactions: extra.otherTransactions || [],
      cashCount: extra.cashCount || {},
      summarySnapshot: extra.summarySnapshot || null,
      cukcukInvoicesSnapshot: extra.cukcukInvoicesSnapshot || [],
      drinkInventorySnapshot: extra.drinkInventorySnapshot || null,
      pinnedCash: extra.pinnedCash || {},
      keepCash: extra.keepCash || {},
      handoverCash: extra.handoverCash || {},
      invoices: extra.invoices || [],
      shiftPassword: extra.shiftPassword || ''
    };
  });

  // Sort by date desc
  shifts.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));

  const limit = parseInt(params.limit) || 100;
  return { success: true, shifts: shifts.slice(0, limit) };
}

function _getCurrentShift() {
  const rows = _getSheetData('KG_SHIFTS');
  const openShift = rows.find(r => r.status === 'open');
  if (!openShift) return { success: true, shift: null };

  let extra = {};
  try { extra = JSON.parse(openShift.jsonData || '{}'); } catch(e) {}

  return {
    success: true,
    shift: {
      ...openShift,
      startingCash: Number(openShift.startingCash) || 0,
      cashToKeep: Number(openShift.cashToKeep) || 0,
      cashToDeposit: Number(openShift.cashToDeposit) || 0,
      transactions: extra.transactions || [],
      otherTransactions: extra.otherTransactions || [],
      cashCount: extra.cashCount || {},
      summarySnapshot: extra.summarySnapshot || null,
      cukcukInvoicesSnapshot: extra.cukcukInvoicesSnapshot || [],
      drinkInventorySnapshot: extra.drinkInventorySnapshot || null,
      pinnedCash: extra.pinnedCash || {},
      keepCash: extra.keepCash || {},
      handoverCash: extra.handoverCash || {},
      invoices: extra.invoices || [],
      shiftPassword: extra.shiftPassword || ''
    }
  };
}

// ── Staff CRUD ───────────────────────────────
function _getStaff() {
  const headers = ['id','name','pin','role','status','createdAt'];
  _getSheet('KG_STAFF', headers); // ensure exists
  const rows = _getSheetData('KG_STAFF');
  // Return full staff data including PIN for client-side verification (internal tool)
  return { success: true, staff: rows, timestamp: new Date().toISOString() };
}

function _saveStaff(data) {
  const headers = ['id','name','pin','role','status','createdAt'];
  const sheet = _getSheet('KG_STAFF', headers);

  if (!data.name) return { success: false, message: 'Thiếu tên nhân viên' };
  // PIN required for new staff, optional for edits
  if (!data.id && (!data.pin || data.pin.length < 4)) return { success: false, message: 'PIN phải có ít nhất 4 số' };

  const id = data.id || Utilities.getUuid().substring(0, 8);
  
  // Use Advanced API for fast read
  var allRows = _sheetsGet('KG_STAFF');
  let rowIndex = -1;
  let existingPin = '';
  if (allRows && allRows.length > 1) {
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === id) {
        rowIndex = i + 1; // sheet row (1-indexed)
        existingPin = allRows[i][2] || ''; // keep old PIN if not provided
        break;
      }
    }
  }

  var pin = data.pin || existingPin;
  if (!pin || pin.length < 4) return { success: false, message: 'PIN phải có ít nhất 4 số' };

  const row = [id, data.name, pin, data.role || 'cashier', data.status || 'active', data.createdAt || new Date().toISOString()];

  if (rowIndex > 0) {
    // Update existing row via Advanced API
    _sheetsBatchWrite('KG_STAFF', 'KG_STAFF!A' + rowIndex + ':F' + rowIndex, [row]);
  } else {
    _sheetsAppend('KG_STAFF', [row]);
  }

  // Auto-update KG_CONFIG sheet with staff list
  _syncStaffToConfig();

  _addAuditLog({ user: 'ADMIN', action: 'SAVE_STAFF', details: data.name + ' (' + (data.role || 'cashier') + ')' });
  return { success: true, message: 'Đã lưu nhân viên: ' + data.name, id: id };
}

function _deleteStaff(data) {
  const sheet = _getSheet('KG_STAFF', []);
  if (sheet.getLastRow() < 2) return { success: false, message: 'Không tìm thấy' };

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < allData.length; i++) {
    if (allData[i][0] === data.id) {
      sheet.deleteRow(i + 2);
      // Auto-update KG_CONFIG sheet with staff list
      _syncStaffToConfig();
      _addAuditLog({ user: 'ADMIN', action: 'DELETE_STAFF', details: 'ID: ' + data.id });
      return { success: true, message: 'Đã xóa nhân viên' };
    }
  }
  return { success: false, message: 'Không tìm thấy nhân viên' };
}

function _login(data) {
  const sheet = _getSheet('KG_STAFF', []);
  if (sheet.getLastRow() < 2) return { success: true, user: { name: 'Admin', role: 'admin' }, message: 'Chưa có nhân viên, đăng nhập mặc định' };

  const rows = _getSheetData('KG_STAFF');
  const user = rows.find(r => r.pin === data.pin && r.status === 'active');

  if (user) {
    _addAuditLog({ user: user.name, action: 'LOGIN', details: 'Đăng nhập thành công' });
    return { success: true, user: { id: user.id, name: user.name, role: user.role }, message: 'Đăng nhập thành công' };
  }

  return { success: false, message: 'PIN không đúng hoặc tài khoản bị khóa' };
}

// ══════════════════════════════════════════════
//  KG_CONFIG — Sheet cấu hình nhanh
//  Lưu danh sách nhân viên ở dạng JSON để load nhanh
//  Format: key | jsonValue | updatedAt
// ══════════════════════════════════════════════

function _getConfig() {
  const headers = ['key', 'jsonValue', 'updatedAt'];
  _getSheet('KG_CONFIG', headers);
  const rows = _getSheetData('KG_CONFIG');
  
  const config = {};
  rows.forEach(r => {
    try {
      config[r.key] = JSON.parse(r.jsonValue);
    } catch(e) {
      config[r.key] = r.jsonValue;
    }
  });
  
  // Always include fresh staff data
  if (!config.staff) {
    const staffResult = _getStaff();
    if (staffResult.success) {
      config.staff = staffResult.staff;
    }
  }
  
  return { 
    success: true, 
    config: config,
    timestamp: new Date().toISOString()
  };
}

function _saveConfig(data) {
  const headers = ['key', 'jsonValue', 'updatedAt'];
  const sheet = _getSheet('KG_CONFIG', headers);
  
  if (!data.key) return { success: false, message: 'Missing config key' };
  
  const jsonValue = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
  const now = new Date().toISOString();
  
  // Find existing row
  const lastRow = sheet.getLastRow();
  let found = false;
  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] === data.key) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[jsonValue, now]]);
        found = true;
        break;
      }
    }
  }
  if (!found) {
    sheet.appendRow([data.key, jsonValue, now]);
  }
  
  return { success: true, message: 'Config saved: ' + data.key };
}

/**
 * Sync current staff list → KG_CONFIG sheet as JSON.
 * Called automatically when staff is added/edited/deleted.
 * This makes getConfig() ultra-fast since it's pre-computed JSON.
 */
function _syncStaffToConfig() {
  try {
    const staffResult = _getStaff();
    if (staffResult.success) {
      _saveConfig({ key: 'staff', value: staffResult.staff });
      _saveConfig({ key: 'staffUpdatedAt', value: new Date().toISOString() });
    }
  } catch(e) {
    Logger.log('Error syncing staff to config: ' + e.toString());
  }
}

// ── Audit Log ────────────────────────────────
function _addAuditLog(data) {
  try {
    const headers = ['timestamp','user','action','details'];
    const sheet = _getSheet('KG_AUDIT', headers);
    sheet.appendRow([new Date().toISOString(), data.user || 'SYSTEM', data.action || '', data.details || '']);

    // Keep only last 1000 entries
    const rowCount = sheet.getLastRow();
    if (rowCount > 1001) {
      sheet.deleteRows(2, rowCount - 1001);
    }
    return { success: true };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function _getAuditLog(params) {
  const rows = _getSheetData('KG_AUDIT');
  rows.reverse(); // newest first
  const limit = parseInt(params.limit) || 200;
  return { success: true, logs: rows.slice(0, limit) };
}

// ── File Upload to Drive ─────────────────────
function _uploadFileToDrive(data) {
  try {
    if (!data.fileName || !data.fileData) {
      return { success: false, message: 'Thiếu tên file hoặc dữ liệu' };
    }

    const parentFolder = DriveApp.getFolderById(CASHIER_DRIVE_ID);

    // Determine subfolder
    let folderName = 'KHOẢN THU'; // default
    if (data.category === 'expense') folderName = 'KHOẢN CHI';
    else if (data.category === 'debt') folderName = 'BILL NỢ';
    else if (data.category === 'income') folderName = 'KHOẢN THU';

    let folder;
    const folders = parentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = parentFolder.createFolder(folderName);
    }

    // Create date subfolder for organization
    const today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    let dateFolder;
    const dateFolders = folder.getFoldersByName(today);
    if (dateFolders.hasNext()) {
      dateFolder = dateFolders.next();
    } else {
      dateFolder = folder.createFolder(today);
    }

    // Decode base64 and create file
    const base64Data = data.fileData.replace(/^data:[^;]+;base64,/, '');
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', data.fileName);

    const file = dateFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileUrl = file.getUrl();
    const fileId = file.getId();
    const thumbnailUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';

    _addAuditLog({ user: data.user || 'SYSTEM', action: 'UPLOAD_FILE', details: data.fileName + ' → ' + folderName });

    return {
      success: true,
      message: 'Đã upload: ' + data.fileName,
      fileId: fileId,
      fileUrl: fileUrl,
      thumbnailUrl: thumbnailUrl,
      folder: folderName
    };
  } catch(error) {
    return { success: false, message: 'Lỗi upload: ' + error.toString() };
  }
}

function _deleteFileFromDrive(data) {
  try {
    if (!data.fileId) return { success: false, message: 'Thiếu file ID' };
    const file = DriveApp.getFileById(data.fileId);
    file.setTrashed(true);
    _addAuditLog({ user: data.user || 'SYSTEM', action: 'DELETE_FILE', details: 'File ID: ' + data.fileId });
    return { success: true, message: 'Đã xóa file' };
  } catch(error) {
    return { success: false, message: 'Lỗi xóa file: ' + error.toString() };
  }
}

// ── Settings ─────────────────────────────────
function _getSettings() {
  const headers = ['key','value'];
  _getSheet('KG_SETTINGS', headers);
  const rows = _getSheetData('KG_SETTINGS');
  const settings = {};
  rows.forEach(r => { 
    let val = r.value;
    try { val = JSON.parse(val); } catch(e) {}
    settings[r.key] = val; 
  });
  return { success: true, settings: settings };
}

function _saveSettings(data) {
  const headers = ['key','value'];
  const sheet = _getSheet('KG_SETTINGS', headers);

  Object.entries(data.settings || {}).forEach(([key, value]) => {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    // Find existing row
    const lastRow = sheet.getLastRow();
    let found = false;
    if (lastRow > 1) {
      const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < keys.length; i++) {
        if (keys[i][0] === key) {
          sheet.getRange(i + 2, 2).setValue(stringValue);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      sheet.appendRow([key, stringValue]);
    }
  });

  return { success: true, message: 'Đã lưu cài đặt' };
}

// ── Init sheets function (run once) ──────────
function cashier_initAllSheets() {
  _getSheet('KG_SHIFTS', ['id','cashierName','shiftNumber','date','startTime','endTime','startingCash','status','notes','cashToKeep','cashToDeposit','jsonData','lastSync']);
  _getSheet('KG_STAFF', ['id','name','pin','role','status','createdAt']);
  _getSheet('KG_AUDIT', ['timestamp','user','action','details']);
  _getSheet('KG_SETTINGS', ['key','value']);
  _getSheet('KG_CONFIG', ['key','jsonValue','updatedAt']);

  // Create Drive folders if needed
  const parent = DriveApp.getFolderById(CASHIER_DRIVE_ID);
  ['BILL NỢ', 'KHOẢN THU', 'KHOẢN CHI'].forEach(name => {
    if (!parent.getFoldersByName(name).hasNext()) {
      parent.createFolder(name);
    }
  });

  // Initial staff → config sync
  _syncStaffToConfig();

  Logger.log('✅ KG-Cashier sheets and folders initialized');
}

// ══════════════════════════════════════════════
//  CUKCUK REVENUE — Monthly Google Sheets Sync
//  Sheet per month: CUKCUK_T04-2026, CUKCUK_T05-2026...
//  Webapp pushes data here; no loading back.
// ══════════════════════════════════════════════

const CUKCUK_HEADERS = [
  'RefId',        // Unique invoice ID from CUKCUK
  'RefNo',        // Bill number
  'RefDate',      // Invoice date
  'TableName',    // Table name
  'EmployeeName', // Cashier name
  'Amount',       // Total invoice amount
  'CashAmount',   // Paid by cash
  'CardAmount',   // Paid by card
  'TransferAmount', // Paid by transfer
  'PaymentInfo',  // Payment method summary
  'ShiftId',      // Which shift synced this
  'SyncedAt'      // When it was synced
];

function _syncCukcukRevenue(data) {
  if (!data || !data.invoices || !Array.isArray(data.invoices)) {
    return { success: false, message: 'No invoices data' };
  }

  const ss = SpreadsheetApp.openById(CASHIER_SS_ID);
  const invoices = data.invoices;
  const shiftId = data.shiftId || '';
  const now = new Date().toISOString();
  
  // Group invoices by month
  const byMonth = {};
  invoices.forEach(inv => {
    let monthKey = 'unknown';
    try {
      const d = new Date(inv.refDate);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      monthKey = 'T' + m + '-' + y;
    } catch(e) {
      monthKey = 'unknown';
    }
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    byMonth[monthKey].push(inv);
  });
  
  let totalInserted = 0;
  let totalUpdated = 0;
  
  // Process each month
  for (const monthKey in byMonth) {
    const sheetName = 'CUKCUK_' + monthKey;
    let sheet = ss.getSheetByName(sheetName);
    
    // Create sheet if not exists (one-time setup with SpreadsheetApp)
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(CUKCUK_HEADERS);
      const headerRange = sheet.getRange(1, 1, 1, CUKCUK_HEADERS.length);
      headerRange.setFontWeight('bold').setBackground('#10b981').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 12, 140);
    }
    
    // ★ ADVANCED API: Read existing RefIds in single API call
    var existingRefIds = {};
    var existingRows = _sheetsGet(sheetName);
    if (existingRows && existingRows.length > 1) {
      for (var ei = 1; ei < existingRows.length; ei++) {
        existingRefIds[String(existingRows[ei][0] || '')] = ei + 1;
      }
    }
    
    const monthInvoices = byMonth[monthKey];
    const newRows = [];
    var updateBatch = []; // Collect updates for batch write
    
    for (let i = 0; i < monthInvoices.length; i++) {
      const inv = monthInvoices[i];
      const refId = String(inv.refId || '');
      
      const row = [
        refId, inv.refNo || '', inv.refDate || '',
        inv.tableName || '', inv.employeeName || '',
        inv.amount || 0, inv.cashAmount || 0,
        inv.cardAmount || 0, inv.transferAmount || 0,
        inv.paymentInfo || '', shiftId, now
      ];
      
      if (existingRefIds[refId]) {
        // Collect for batch update
        updateBatch.push({ range: sheetName + '!A' + existingRefIds[refId], values: [row] });
        totalUpdated++;
      } else {
        newRows.push(row);
        totalInserted++;
      }
    }
    
    // ★ ADVANCED API: Batch update existing rows in single call
    if (updateBatch.length > 0) {
      try {
        Sheets.Spreadsheets.Values.batchUpdate(
          { valueInputOption: 'RAW', data: updateBatch },
          CASHIER_SS_ID
        );
      } catch(e) {
        // Fallback: individual updates
        updateBatch.forEach(function(u) {
          try { _sheetsBatchWrite(sheetName, u.range, u.values); } catch(ex) {}
        });
      }
    }
    
    // ★ ADVANCED API: Bulk append new rows in single call
    if (newRows.length > 0) {
      _sheetsAppend(sheetName, newRows);
    }
    
    // Format amount columns (one-time cosmetic, uses SpreadsheetApp)
    if (sheet.getLastRow() > 1) {
      try {
        sheet.getRange(2, 6, sheet.getLastRow() - 1, 4).setNumberFormat('#,##0');
      } catch(e) { /* ignore format errors */ }
    }
  }
  
  return {
    success: true,
    message: 'Đã đồng bộ ' + totalInserted + ' mới, cập nhật ' + totalUpdated + ' hóa đơn',
    inserted: totalInserted,
    updated: totalUpdated,
    total: invoices.length
  };
}
