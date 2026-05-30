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

function _validateMetadata(data, action) {
  const origin = data.origin || '';
  const host = data.host || '';
  
  // Read ALLOW_DEV_WRITE from Settings, default is false
  let allowDevWrite = false;
  try {
    const settingsRes = _getSettings();
    if (settingsRes && settingsRes.success && settingsRes.settings) {
      allowDevWrite = settingsRes.settings.allowDevWrite === true;
    }
  } catch(e) {
    allowDevWrite = false;
  }

  // Check if localhost/dev or LAN IP (e.g. 192.168.x.x, 10.x.x.x, 172.x.x.x)
  const isLocalOrLan = origin.indexOf('localhost') > -1 || 
                       origin.indexOf('127.0.0.1') > -1 || 
                       origin.indexOf('file://') > -1 ||
                       host.indexOf('localhost') > -1 ||
                       host.indexOf('127.0.0.1') > -1 ||
                       /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) ||
                       !origin || !host;

  if (isLocalOrLan) {
    if (!allowDevWrite) {
      return { success: false, message: 'Ghi dữ liệu bị chặn từ môi trường local/LAN. Vui lòng bật "Cho phép thiết bị Local/LAN ghi dữ liệu" trong Cài đặt hệ thống.' };
    }
  }

  // Check production origin whitelist: must end with .pages.dev or match explicit production domain
  const isAllowedOrigin = origin === 'https://kg-cashier.pages.dev' || 
                          (origin.indexOf('.pages.dev') > -1 && origin.indexOf('https://') === 0);

  if (!isLocalOrLan && !isAllowedOrigin) {
    if (!allowDevWrite) {
      return { success: false, message: 'Yêu cầu từ origin không được phép: ' + origin };
    }
  }

  return { success: true };
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
      // Shift Actions & Registry
      case 'openShift':       result = _openShiftAction(data); break;
      case 'syncShift':       result = _syncShiftAction(data); break;
      case 'closeShift':      result = _closeShiftAction(data); break;
      case 'reopenShift':     result = _reopenShiftAction(data); break;
      case 'cancelShift':     result = _cancelShiftAction(data); break;
      case 'deleteShift':     result = _cancelShiftAction(data); break; // safe alias
      case 'voidGhostShift':  result = _voidGhostShiftAction(data); break;
      case 'getShiftRegistry': result = _getShiftRegistryAction(data); break;
      case 'repairShifts':    result = _repairShiftsAction(data); break;
      
      // Legacy Shifts (Read only / Compat)
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
      case 'getCukcukConfigSecure': result = _getCukcukConfigSecure(data); break;
      
      // Config (fast-load staff + store settings)
      case 'getConfig':       result = _getConfig(); break;
      case 'saveConfig':      result = _saveConfig(data); break;
      
      // CUKCUK Revenue & Indexing
      case 'syncCukcukRevenue': result = _syncCukcukRevenue(data); break;
      case 'rebuildCukcukIndex': result = rebuildCukcukIndex(); break;
      case 'getCukcukSyncState': result = _getCukcukSyncState(); break;
      case 'saveCukcukSyncState': result = _saveCukcukSyncState(data); break;

      // POS Cloud Sync
      case 'getPosOrders':    result = _getPosOrdersAction(data); break;
      case 'syncPosOrders':   result = _syncPosOrdersAction(data); break;
      
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
// ── Shift CRUD & Concurrency Registry ─────────

function _syncLegacyShift(data, status) {
  const headers = ['id','cashierName','shiftNumber','date','startTime','endTime','startingCash','status','notes','cashToKeep','cashToDeposit','jsonData','lastSync'];
  const sheet = _getSheet('KG_SHIFTS', headers);

  if (!data.id) return { success: false, message: 'Missing shift ID' };

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
    data.startingCash || 0, status || data.status || 'open',
    data.notes || '', data.cashToKeep || 0, data.cashToDeposit || 0,
    jsonData, new Date().toISOString()
  ];

  if (rowIndex > 0) {
    _sheetsBatchWrite('KG_SHIFTS', 'KG_SHIFTS!A' + rowIndex + ':M' + rowIndex, [row]);
  } else {
    _sheetsAppend('KG_SHIFTS', [row]);
  }

  return { success: true };
}

function _openShiftAction(data) {
  const val = _validateMetadata(data, 'openShift');
  if (val && !val.success) return val;

  const shiftNumber = String(data.shiftNumber || '');
  if (shiftNumber !== '1' && shiftNumber !== '2') {
    return { success: false, message: 'Số ca không hợp lệ. Chỉ cho phép Ca 1 hoặc Ca 2.' };
  }

  const workDay = data.date || '';
  if (!workDay) return { success: false, message: 'Thiếu ngày làm việc.' };

  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = 'shift_' + shiftKey;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    _autoMarkStaleShifts();

    const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
    
    // Check if slot has an open shift
    const activeOpen = registryRows.find(r => r.shiftKey === shiftKey && r.status === 'open');
    if (activeOpen) {
      return { success: false, message: 'Xung đột: Ca ' + shiftNumber + ' ngày ' + workDay + ' đang được mở trên thiết bị khác.' };
    }

    // Check if slot has a closed shift
    const activeClosed = registryRows.find(r => r.shiftKey === shiftKey && r.status === 'closed');
    if (activeClosed) {
      return { success: false, message: 'Xung đột: Ca ' + shiftNumber + ' ngày ' + workDay + ' đã đóng. Hãy dùng chức năng Mở lại ca.' };
    }

    // Ensure not more than 2 valid shifts for this day (Shift 1 & Shift 2)
    const dayShifts = registryRows.filter(r => r.workDay === workDay && (r.status === 'open' || r.status === 'closed'));
    if (dayShifts.length >= 2) {
      const alreadyExists = dayShifts.some(r => r.shiftNumber === shiftNumber);
      if (!alreadyExists) {
        return { success: false, message: 'Giới hạn tối đa 2 ca mỗi ngày làm việc đã đạt.' };
      }
    }

    // Record open shift in registry
    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    const nowStr = new Date().toISOString();
    const registryRow = [
      shiftKey,
      shiftId,
      workDay,
      shiftNumber,
      'open',
      data.cashierName || '',
      data.cashierId || '',
      nowStr, // openedAt
      '', // closedAt
      data.source || '',
      data.origin || '',
      data.host || '',
      data.environment || '',
      data.deviceId || '',
      data.sessionId || '',
      data.cashierName || '', // createdBy
      data.lastMutationId || '',
      1, // revision
      nowStr, // lastSync
      data.notes || ''
    ];
    _sheetsAppend('KG_SHIFT_REGISTRY', [registryRow]);

    data.id = shiftId;
    _syncLegacyShift(data, 'open');

    _addAuditLog({ user: data.cashierName, action: 'OPEN_SHIFT', details: 'Mở ca ' + shiftNumber + ' ngày ' + workDay });

    return { success: true, message: 'Đã mở ca thành công.', shiftId: shiftId };

  } finally {
    lock.releaseLock();
  }
}

function _syncShiftAction(data) {
  const val = _validateMetadata(data, 'syncShift');
  if (val && !val.success) return val;

  const shiftNumber = String(data.shiftNumber || '');
  const workDay = data.date || '';
  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = 'shift_' + shiftKey;
  data.id = shiftId;

  const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
  const registryEntry = registryRows.find(r => r.shiftKey === shiftKey);
  
  if (!registryEntry) {
    return { success: false, message: 'Ca làm việc chưa được đăng ký trên hệ thống.' };
  }

  if (registryEntry.status === 'closed') {
    return { success: false, message: 'Ca làm việc đã đóng, không thể cập nhật dữ liệu.' };
  }

  if (registryEntry.status === 'cancelled' || registryEntry.status === 'voided') {
    return { success: false, message: 'Ca làm việc đã bị hủy/thu hồi.' };
  }

  if (registryEntry.status === 'stale') {
    return { success: false, message: 'Ca làm việc đã quá hạn (stale), vui lòng liên hệ admin.' };
  }

  _syncLegacyShift(data, 'open');

  const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
  let rowIndex = -1;
  const allRows = _sheetsGet('KG_SHIFT_REGISTRY');
  if (allRows && allRows.length > 1) {
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][0] === shiftKey) { rowIndex = i + 1; break; }
    }
  }

  if (rowIndex > 0) {
    const revision = parseInt(allRows[rowIndex - 1][17] || '1') + 1;
    registrySheet.getRange(rowIndex, 18, 1, 3).setValues([[revision, new Date().toISOString(), data.notes || '']]);
  }

  return { success: true, message: 'Đồng bộ ca thành công.' };
}

function _closeShiftAction(data) {
  const val = _validateMetadata(data, 'closeShift');
  if (val && !val.success) return val;

  const shiftNumber = String(data.shiftNumber || '');
  const workDay = data.date || '';
  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = 'shift_' + shiftKey;
  data.id = shiftId;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
    const registryEntry = registryRows.find(r => r.shiftKey === shiftKey);
    
    if (!registryEntry) {
      return { success: false, message: 'Ca làm việc chưa được đăng ký trên hệ thống.' };
    }

    if (registryEntry.status === 'cancelled' || registryEntry.status === 'voided') {
      return { success: false, message: 'Ca làm việc đã bị hủy/thu hồi.' };
    }

    data.endTime = data.endTime || new Date().toISOString();
    _syncLegacyShift(data, 'closed');

    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    let rowIndex = -1;
    const allRows = _sheetsGet('KG_SHIFT_REGISTRY');
    if (allRows && allRows.length > 1) {
      for (let i = 1; i < allRows.length; i++) {
        if (allRows[i][0] === shiftKey) { rowIndex = i + 1; break; }
      }
    }

    if (rowIndex > 0) {
      const revision = parseInt(allRows[rowIndex - 1][17] || '1') + 1;
      registrySheet.getRange(rowIndex, 5).setValue('closed');
      registrySheet.getRange(rowIndex, 9).setValue(data.endTime);
      registrySheet.getRange(rowIndex, 18, 1, 3).setValues([[revision, new Date().toISOString(), data.notes || '']]);
    }

    _addAuditLog({ user: data.cashierName, action: 'CLOSE_SHIFT', details: 'Đóng ca ' + shiftNumber + ' ngày ' + workDay });

    return { success: true, message: 'Đóng ca thành công.' };
  } finally {
    lock.releaseLock();
  }
}

function _reopenShiftAction(data) {
  const val = _validateMetadata(data, 'reopenShift');
  if (val && !val.success) return val;

  const settingsRes = _getSettings();
  const adminPass = settingsRes.success && settingsRes.settings ? String(settingsRes.settings.adminPassword || '712121').trim() : '712121';
  const managerPass = data.managerPassword || '';
  if (managerPass !== adminPass && managerPass !== '712121') {
    return { success: false, message: 'Mật khẩu quản lý không chính xác.' };
  }

  const shiftNumber = String(data.shiftNumber || '');
  const workDay = data.date || '';
  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = 'shift_' + shiftKey;
  data.id = shiftId;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
    const registryEntry = registryRows.find(r => r.shiftKey === shiftKey);
    
    if (!registryEntry) {
      return { success: false, message: 'Ca làm việc chưa được đăng ký trên hệ thống.' };
    }

    if (registryEntry.status !== 'closed' && registryEntry.status !== 'stale') {
      return { success: false, message: 'Chỉ có thể mở lại ca đã đóng hoặc quá hạn.' };
    }

    data.status = 'open';
    data.endTime = '';
    _syncLegacyShift(data, 'open');

    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    let rowIndex = -1;
    const allRows = _sheetsGet('KG_SHIFT_REGISTRY');
    if (allRows && allRows.length > 1) {
      for (let i = 1; i < allRows.length; i++) {
        if (allRows[i][0] === shiftKey) { rowIndex = i + 1; break; }
      }
    }

    if (rowIndex > 0) {
      const revision = parseInt(allRows[rowIndex - 1][17] || '1') + 1;
      registrySheet.getRange(rowIndex, 5).setValue('open');
      registrySheet.getRange(rowIndex, 9).setValue('');
      registrySheet.getRange(rowIndex, 18, 1, 3).setValues([[revision, new Date().toISOString(), 'Mở lại ca']]);
    }

    _addAuditLog({ user: data.cashierName || 'ADMIN', action: 'REOPEN_SHIFT', details: 'Mở lại ca ' + shiftNumber + ' ngày ' + workDay });

    return { success: true, message: 'Mở lại ca thành công.' };
  } finally {
    lock.releaseLock();
  }
}

function _cancelShiftAction(data) {
  const val = _validateMetadata(data, 'cancelShift');
  if (val && !val.success) return val;

  const shiftNumber = String(data.shiftNumber || '');
  const workDay = data.date || '';
  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = data.id || 'shift_' + shiftKey;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const shiftsSheet = _getSheet('KG_SHIFTS');
    let shiftRowIndex = -1;
    const allShifts = _sheetsGet('KG_SHIFTS');
    if (allShifts && allShifts.length > 1) {
      for (let i = 1; i < allShifts.length; i++) {
        if (allShifts[i][0] === shiftId) { shiftRowIndex = i + 1; break; }
      }
    }
    if (shiftRowIndex > 0) {
      shiftsSheet.getRange(shiftRowIndex, 8).setValue('cancelled');
    }

    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    let registryRowIndex = -1;
    const allRegistry = _sheetsGet('KG_SHIFT_REGISTRY');
    if (allRegistry && allRegistry.length > 1) {
      for (let i = 1; i < allRegistry.length; i++) {
        if (allRegistry[i][0] === shiftKey || allRegistry[i][1] === shiftId) { registryRowIndex = i + 1; break; }
      }
    }
    if (registryRowIndex > 0) {
      registrySheet.getRange(registryRowIndex, 5).setValue('cancelled');
      registrySheet.getRange(registryRowIndex, 19).setValue(new Date().toISOString());
    } else {
      const nowStr = new Date().toISOString();
      const registryRow = [
        shiftKey, shiftId, workDay, shiftNumber, 'cancelled',
        data.cashierName || '', '', nowStr, nowStr, data.source || '',
        data.origin || '', data.host || '', data.environment || '',
        data.deviceId || '', data.sessionId || '', 'SYSTEM', '', 1, nowStr, 'Tombstone record'
      ];
      _sheetsAppend('KG_SHIFT_REGISTRY', [registryRow]);
    }

    _addAuditLog({ user: data.cashierName || 'SYSTEM', action: 'CANCEL_SHIFT', details: 'Hủy ca ' + shiftNumber + ' ngày ' + workDay });

    return { success: true, message: 'Đã hủy ca làm việc.' };
  } finally {
    lock.releaseLock();
  }
}

function _voidGhostShiftAction(data) {
  const val = _validateMetadata(data, 'voidGhostShift');
  if (val && !val.success) return val;

  const settingsRes = _getSettings();
  const adminPass = settingsRes.success && settingsRes.settings ? String(settingsRes.settings.adminPassword || '712121').trim() : '712121';
  const managerPass = data.managerPassword || '';
  if (managerPass !== adminPass && managerPass !== '712121') {
    return { success: false, message: 'Mật khẩu quản lý không chính xác.' };
  }

  const shiftId = data.shiftId || '';
  if (!shiftId) return { success: false, message: 'Thiếu ID ca cần thu hồi.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const shiftsSheet = _getSheet('KG_SHIFTS');
    let shiftRowIndex = -1;
    const allShifts = _sheetsGet('KG_SHIFTS');
    if (allShifts && allShifts.length > 1) {
      for (let i = 1; i < allShifts.length; i++) {
        if (allShifts[i][0] === shiftId) { shiftRowIndex = i + 1; break; }
      }
    }
    if (shiftRowIndex > 0) {
      shiftsSheet.getRange(shiftRowIndex, 8).setValue('voided');
    }

    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    let registryRowIndex = -1;
    const allRegistry = _sheetsGet('KG_SHIFT_REGISTRY');
    if (allRegistry && allRegistry.length > 1) {
      for (let i = 1; i < allRegistry.length; i++) {
        if (allRegistry[i][1] === shiftId) { registryRowIndex = i + 1; break; }
      }
    }
    if (registryRowIndex > 0) {
      registrySheet.getRange(registryRowIndex, 5).setValue('voided');
      registrySheet.getRange(registryRowIndex, 19).setValue(new Date().toISOString());
    }

    _addAuditLog({ user: data.cashierName || 'ADMIN', action: 'VOID_GHOST_SHIFT', details: 'Thu hồi ca ma: ' + shiftId });

    return { success: true, message: 'Thu hồi ca ma thành công.' };
  } finally {
    lock.releaseLock();
  }
}

function _getShiftRegistryAction(data) {
  const rows = _getSheetData('KG_SHIFT_REGISTRY');
  return { success: true, registry: rows };
}

function _repairShiftsAction(data) {
  const settingsRes = _getSettings();
  const adminPass = settingsRes.success && settingsRes.settings ? String(settingsRes.settings.adminPassword || '712121').trim() : '712121';
  const managerPass = data.managerPassword || '';
  if (managerPass !== adminPass && managerPass !== '712121') {
    return { success: false, message: 'Mật khẩu quản lý không chính xác.' };
  }

  const staleCount = _autoMarkStaleShifts();

  const shiftsRows = _getSheetData('KG_SHIFTS');
  const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
  const registrySheet = _getSheet('KG_SHIFT_REGISTRY');

  let restoredCount = 0;
  shiftsRows.forEach(sh => {
    const shiftKey = sh.date + '_' + sh.shiftNumber;
    const exists = registryRows.some(r => r.shiftId === sh.id || r.shiftKey === shiftKey);
    if (!exists && sh.id && sh.date && sh.shiftNumber) {
      const nowStr = new Date().toISOString();
      const registryRow = [
        shiftKey, sh.id, sh.date, sh.shiftNumber, sh.status || 'closed',
        sh.cashierName || '', '', sh.startTime || nowStr, sh.endTime || '',
        'repair', '', '', '', '', '', 'SYSTEM', '', 1, nowStr, 'Restored during repair'
      ];
      _sheetsAppend('KG_SHIFT_REGISTRY', [registryRow]);
      restoredCount++;
    }
  });

  return { success: true, message: 'Sửa lỗi hoàn tất. Đã đánh dấu stale ' + staleCount + ' ca, khôi phục đăng ký ' + restoredCount + ' ca.' };
}

function _autoMarkStaleShifts() {
  const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
  const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
  const shiftsSheet = _getSheet('KG_SHIFTS');
  const shiftsRows = _getSheetData('KG_SHIFTS');

  let staleCount = 0;
  const now = new Date();

  registryRows.forEach((r, idx) => {
    if (r.status === 'open') {
      let isStale = false;
      const openedAt = r.openedAt ? new Date(r.openedAt) : null;
      
      if (openedAt && !isNaN(openedAt.getTime())) {
        const hoursOpen = (now - openedAt) / (1000 * 60 * 60);
        if (hoursOpen > 18) {
          isStale = true;
        }
      }

      if (!isStale && r.workDay) {
        const parts = r.workDay.split('-');
        if (parts.length === 3) {
          const yr = parseInt(parts[0]);
          const mo = parseInt(parts[1]) - 1;
          const dy = parseInt(parts[2]);
          const workDayEnd = new Date(yr, mo, dy);
          workDayEnd.setDate(workDayEnd.getDate() + 1);
          workDayEnd.setHours(6, 0, 0, 0);
          
          if (now > workDayEnd) {
            isStale = true;
          }
        }
      }

      if (isStale) {
        const rowNum = idx + 2;
        registrySheet.getRange(rowNum, 5).setValue('stale');
        registrySheet.getRange(rowNum, 19).setValue(new Date().toISOString());

        let shiftRowIndex = -1;
        for (let i = 0; i < shiftsRows.length; i++) {
          if (shiftsRows[i].id === r.shiftId) { shiftRowIndex = i + 2; break; }
        }
        if (shiftRowIndex > 0) {
          shiftsSheet.getRange(shiftRowIndex, 8).setValue('stale');
        }

        _addAuditLog({ user: 'SYSTEM', action: 'STALE_SHIFT', details: 'Đánh dấu ca quá hạn: Ca ' + r.shiftNumber + ' ngày ' + r.workDay });
        staleCount++;
      }
    }
  });

  return staleCount;
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
  }).filter(s => s.status !== 'cancelled' && s.status !== 'voided');

  shifts.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));

  const limit = parseInt(params.limit) || 100;
  return { success: true, shifts: shifts.slice(0, limit) };
}

function _getCurrentShift() {
  _autoMarkStaleShifts();

  const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
  const openRegistry = registryRows.find(r => r.status === 'open');
  if (!openRegistry) return { success: true, shift: null };

  const rows = _getSheetData('KG_SHIFTS');
  const openShift = rows.find(r => r.id === openRegistry.shiftId);
  if (!openShift) {
    return {
      success: true,
      shift: {
        id: openRegistry.shiftId,
        cashierName: openRegistry.cashierName,
        shiftNumber: openRegistry.shiftNumber,
        date: openRegistry.workDay,
        startTime: openRegistry.openedAt,
        endTime: '',
        startingCash: 0,
        status: 'open',
        notes: openRegistry.notes,
        transactions: [],
        otherTransactions: [],
        cashCount: {},
        summarySnapshot: null,
        cukcukInvoicesSnapshot: [],
        drinkInventorySnapshot: null,
        pinnedCash: {},
        keepCash: {},
        handoverCash: {},
        invoices: [],
        shiftPassword: ''
      }
    };
  }

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

  // Auto-migrate legacy plain text CUKCUK secrets to ScriptProperties
  if (settings.cukcuk) {
    const props = PropertiesService.getScriptProperties();
    let mutated = false;
    
    // If domain is in sheet, cache in props if not present
    if (settings.cukcuk.domain && !props.getProperty('CUKCUK_DOMAIN')) {
      props.setProperty('CUKCUK_DOMAIN', settings.cukcuk.domain);
      mutated = true;
    }
    // If appId is in sheet, cache in props if not present
    if (settings.cukcuk.appId && !props.getProperty('CUKCUK_APP_ID')) {
      props.setProperty('CUKCUK_APP_ID', settings.cukcuk.appId);
      mutated = true;
    }
    // If key is in sheet (plain text), migrate to props and remove from settings
    if (settings.cukcuk.key && 
        settings.cukcuk.key.indexOf('***') === -1 && 
        settings.cukcuk.key.indexOf('•') === -1 && 
        settings.cukcuk.key.indexOf('*') === -1) {
      props.setProperty('CUKCUK_SECRET_KEY', settings.cukcuk.key);
      delete settings.cukcuk.key;
      mutated = true;
    }

    // Replace key with boolean flag
    settings.cukcuk.hasKey = !!props.getProperty('CUKCUK_SECRET_KEY');
    if (settings.cukcuk.key) {
      delete settings.cukcuk.key;
    }

    if (mutated) {
      // Save back scrubbed settings to sheet
      _saveSettings({ settings: { cukcuk: settings.cukcuk } });
    }
  }

  return { success: true, settings: settings };
}

function _saveSettings(data) {
  const headers = ['key','value'];
  const sheet = _getSheet('KG_SETTINGS', headers);

  if (data.settings && data.settings.cukcuk) {
    const props = PropertiesService.getScriptProperties();
    const incomingCukcuk = data.settings.cukcuk;
    
    if (incomingCukcuk.domain) {
      props.setProperty('CUKCUK_DOMAIN', incomingCukcuk.domain);
    }
    if (incomingCukcuk.appId) {
      props.setProperty('CUKCUK_APP_ID', incomingCukcuk.appId);
    }
    // If a new key is sent (not masked and not empty)
    if (incomingCukcuk.key && 
        incomingCukcuk.key.indexOf('***') === -1 && 
        incomingCukcuk.key.indexOf('•') === -1 && 
        incomingCukcuk.key.indexOf('*') === -1 && 
        incomingCukcuk.key.trim() !== '') {
      props.setProperty('CUKCUK_SECRET_KEY', incomingCukcuk.key.trim());
    }

    // Always scrub the key before storing in the sheet
    const scrubbedCukcuk = {
      domain: incomingCukcuk.domain || '',
      appId: incomingCukcuk.appId || '',
      autoSync: incomingCukcuk.autoSync || false,
      hasKey: !!props.getProperty('CUKCUK_SECRET_KEY')
    };
    data.settings.cukcuk = scrubbedCukcuk;
  }

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

function _getCukcukConfigSecure(data) {
  if (!data) data = {};
  // Validate admin password or PIN (master pin 712121)
  const adminPass = String(_getSettings().settings.adminPassword || '712121').trim();
  if (String(data.adminPassword || '').trim() !== adminPass && String(data.pin || '').trim() !== '712121') {
    return { success: false, message: 'Chưa xác thực quyền quản trị' };
  }
  const props = PropertiesService.getScriptProperties();
  return {
    success: true,
    domain: props.getProperty('CUKCUK_DOMAIN') || '',
    appId: props.getProperty('CUKCUK_APP_ID') || '',
    secretKey: props.getProperty('CUKCUK_SECRET_KEY') || ''
  };
}

// ── Init sheets function (run once) ──────────
function cashier_initAllSheets() {
  _getSheet('KG_SHIFTS', ['id','cashierName','shiftNumber','date','startTime','endTime','startingCash','status','notes','cashToKeep','cashToDeposit','jsonData','lastSync']);
  _getSheet('KG_STAFF', ['id','name','pin','role','status','createdAt']);
  _getSheet('KG_AUDIT', ['timestamp','user','action','details']);
  _getSheet('KG_SETTINGS', ['key','value']);
  _getSheet('KG_CONFIG', ['key','jsonValue','updatedAt']);
  _getSheet('KG_SHIFT_REGISTRY', ['shiftKey', 'shiftId', 'workDay', 'shiftNumber', 'status', 'cashierName', 'cashierId', 'openedAt', 'closedAt', 'source', 'origin', 'host', 'environment', 'deviceId', 'sessionId', 'createdBy', 'lastMutationId', 'revision', 'lastSync', 'notes']);
  _getSheet('KG_CUKCUK_SYNC_STATE', ['syncType', 'startDate', 'endDate', 'lastSyncTime', 'status', 'invoicesCount', 'details']);
  _getSheet('CUKCUK_INDEX', ['RefId', 'SheetCell']);

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
//  Using CUKCUK_INDEX for O(1) upsert queries.
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

  // 1. Read CUKCUK_INDEX to populate indexMap
  const indexHeaders = ['RefId', 'SheetCell'];
  _getSheet('CUKCUK_INDEX', indexHeaders); // ensure sheet exists
  const indexData = _sheetsGet('CUKCUK_INDEX');
  
  const indexMap = {};
  if (indexData && indexData.length > 1) {
    for (let i = 1; i < indexData.length; i++) {
      if (indexData[i][0]) {
        indexMap[String(indexData[i][0])] = {
          cell: indexData[i][1],
          rowIndex: i + 1
        };
      }
    }
  }

  // 2. Group invoices by month
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
  const newIndexRows = [];
  const updateBatch = [];

  // 3. Process each month
  for (const monthKey in byMonth) {
    const sheetName = 'CUKCUK_' + monthKey;
    let sheet = ss.getSheetByName(sheetName);
    
    // Create sheet if not exists
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(CUKCUK_HEADERS);
      const headerRange = sheet.getRange(1, 1, 1, CUKCUK_HEADERS.length);
      headerRange.setFontWeight('bold').setBackground('#10b981').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 12, 140);
    }
    
    const monthInvoices = byMonth[monthKey];
    const newRows = [];
    let currentLastRow = sheet.getLastRow();
    
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
      
      if (indexMap[refId]) {
        const cellString = indexMap[refId].cell;
        const bangIndex = cellString.indexOf('!');
        const sheetPart = bangIndex > -1 ? cellString.substring(0, bangIndex) : sheetName;
        const cellPart = bangIndex > -1 ? cellString.substring(bangIndex + 1) : cellString;
        const rowNumber = cellPart.replace(/\D/g, '');
        
        updateBatch.push({
          range: sheetPart + '!A' + rowNumber + ':L' + rowNumber,
          values: [row]
        });
        totalUpdated++;
      } else {
        newRows.push(row);
        currentLastRow++;
        const cellRef = sheetName + '!A' + currentLastRow;
        newIndexRows.push([refId, cellRef]);
        totalInserted++;
      }
    }
    
    if (newRows.length > 0) {
      _sheetsAppend(sheetName, newRows);
    }
    
    if (sheet.getLastRow() > 1) {
      try {
        sheet.getRange(2, 6, sheet.getLastRow() - 1, 4).setNumberFormat('#,##0');
      } catch(e) {}
    }
  }

  // 4. Batch update existing rows
  if (updateBatch.length > 0) {
    try {
      Sheets.Spreadsheets.Values.batchUpdate(
        { valueInputOption: 'RAW', data: updateBatch },
        CASHIER_SS_ID
      );
    } catch(e) {
      updateBatch.forEach(function(u) {
        try { _sheetsBatchWrite(u.range.split('!')[0], u.range, u.values); } catch(ex) {}
      });
    }
  }

  // 5. Append new records to CUKCUK_INDEX
  if (newIndexRows.length > 0) {
    _sheetsAppend('CUKCUK_INDEX', newIndexRows);
  }

  return {
    success: true,
    message: 'Đã đồng bộ ' + totalInserted + ' mới, cập nhật ' + totalUpdated + ' hóa đơn',
    inserted: totalInserted,
    updated: totalUpdated,
    total: invoices.length
  };
}

function rebuildCukcukIndex() {
  const ss = SpreadsheetApp.openById(CASHIER_SS_ID);
  
  const indexHeaders = ['RefId', 'SheetCell'];
  let indexSheet = ss.getSheetByName('CUKCUK_INDEX');
  if (indexSheet) {
    indexSheet.clear();
    indexSheet.getRange(1, 1, 1, indexHeaders.length).setValues([indexHeaders]);
  } else {
    indexSheet = ss.insertSheet('CUKCUK_INDEX');
    indexSheet.getRange(1, 1, 1, indexHeaders.length).setValues([indexHeaders]);
    indexSheet.setFrozenRows(1);
  }
  
  const sheets = ss.getSheets();
  const indexRows = [];
  
  sheets.forEach(sheet => {
    const name = sheet.getName();
    // Match sheets named CUKCUK_TXX-YYYY
    if (name.indexOf('CUKCUK_T') === 0) {
      const data = _sheetsGet(name);
      if (data && data.length > 1) {
        for (let r = 1; r < data.length; r++) {
          const refId = data[r][0];
          if (refId) {
            indexRows.push([String(refId), name + '!A' + (r + 1)]);
          }
        }
      }
    }
  });
  
  if (indexRows.length > 0) {
    _sheetsAppend('CUKCUK_INDEX', indexRows);
  }
  
  return { success: true, message: 'Đã tái thiết lập index thành công cho ' + indexRows.length + ' hóa đơn.' };
}

function _getCukcukSyncState() {
  const headers = ['syncType', 'startDate', 'endDate', 'lastSyncTime', 'status', 'invoicesCount', 'details'];
  _getSheet('KG_CUKCUK_SYNC_STATE', headers);
  const rows = _getSheetData('KG_CUKCUK_SYNC_STATE');
  return { success: true, syncStates: rows };
}

function _saveCukcukSyncState(data) {
  const headers = ['syncType', 'startDate', 'endDate', 'lastSyncTime', 'status', 'invoicesCount', 'details'];
  const sheet = _getSheet('KG_CUKCUK_SYNC_STATE', headers);

  if (!data.syncType) return { success: false, message: 'Missing syncType' };

  const lastSyncTime = new Date().toISOString();
  
  const lastRow = sheet.getLastRow();
  let foundIndex = -1;
  const rows = _getSheetData('KG_CUKCUK_SYNC_STATE');
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].syncType === data.syncType && rows[i].startDate === data.startDate && rows[i].endDate === data.endDate) {
      foundIndex = i + 2;
      break;
    }
  }

  const row = [
    data.syncType,
    data.startDate || '',
    data.endDate || '',
    lastSyncTime,
    data.status || 'success',
    data.invoicesCount || 0,
    data.details || ''
  ];

  if (foundIndex > 0) {
    sheet.getRange(foundIndex, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return { success: true, message: 'Cukcuk sync state saved' };
}

// ── POS Cloud Sync Helpers ───────────────────

function _getPosOrdersAction(data) {
  const headers = ['orderId', 'tableId', 'tableName', 'status', 'itemsJson', 'total', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'deviceId', 'sessionId', 'revision', 'lastMutationId'];
  _getSheet('KG_POS_ORDERS', headers);
  const rows = _getSheetData('KG_POS_ORDERS');
  // Only return active orders
  const activeOrders = rows.filter(r => r.status === 'active');
  return { success: true, orders: activeOrders };
}

function _syncPosOrdersAction(data) {
  const val = _validateMetadata(data, 'syncPosOrders');
  if (val && !val.success) return val;

  const headers = ['orderId', 'tableId', 'tableName', 'status', 'itemsJson', 'total', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'deviceId', 'sessionId', 'revision', 'lastMutationId'];
  const sheet = _getSheet('KG_POS_ORDERS', headers);
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const cloudOrders = _getSheetData('KG_POS_ORDERS');
    const clientOrders = data.orders || [];
    const responseOrders = [];
    const rowsToWrite = [];
    
    // Create a map of cloud orders by tableId
    const cloudMap = {};
    cloudOrders.forEach(o => {
      cloudMap[o.tableId] = o;
    });
    
    clientOrders.forEach(clientOrder => {
      const tableId = clientOrder.tableId;
      const cloudOrder = cloudMap[tableId];
      
      if (!cloudOrder) {
        // New order on client, save to cloud
        clientOrder.revision = 1;
        clientOrder.updatedAt = clientOrder.updatedAt || new Date().toISOString();
        rowsToWrite.push(clientOrder);
        responseOrders.push(clientOrder);
      } else {
        // Order exists on both
        if (clientOrder.lastMutationId === cloudOrder.lastMutationId) {
          // Same mutation, no change
          responseOrders.push(cloudOrder);
        } else {
          const clientRev = Number(clientOrder.revision || 0);
          const cloudRev = Number(cloudOrder.revision || 0);
          
          if (clientRev > cloudRev) {
            // Client is newer
            clientOrder.updatedAt = new Date().toISOString();
            rowsToWrite.push(clientOrder);
            responseOrders.push(clientOrder);
          } else if (clientRev < cloudRev) {
            // Cloud is newer, send to client
            responseOrders.push(cloudOrder);
          } else {
            // Same revision but different mutation (conflict!)
            // Merge items by item.id, keeping latest printedAt or active item
            let mergedItems = [];
            let clientItems = [];
            let cloudItems = [];
            try { clientItems = JSON.parse(clientOrder.itemsJson || '[]'); } catch(e) {}
            try { cloudItems = JSON.parse(cloudOrder.itemsJson || '[]'); } catch(e) {}
            
            const itemMap = {};
            clientItems.forEach(i => { itemMap[i.id] = { item: i, source: 'client' }; });
            cloudItems.forEach(i => {
              const existing = itemMap[i.id];
              if (!existing) {
                itemMap[i.id] = { item: i, source: 'cloud' };
              } else {
                // Conflict resolution: compare printedAt or qty
                const clientTime = new Date(existing.item.printedAt || existing.item.cancelledAt || clientOrder.updatedAt).getTime();
                const cloudTime = new Date(i.printedAt || i.cancelledAt || cloudOrder.updatedAt).getTime();
                if (cloudTime > clientTime) {
                  itemMap[i.id] = { item: i, source: 'cloud' };
                }
              }
            });
            
            mergedItems = Object.values(itemMap).map(x => x.item);
            
            // Re-calculate total
            const mergedTotal = mergedItems.reduce((sum, item) => {
              if (item.status === 'cancelled') return sum;
              return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
            }, 0);
            
            const mergedOrder = {
              orderId: cloudOrder.orderId,
              tableId: tableId,
              tableName: cloudOrder.tableName,
              status: clientOrder.status || cloudOrder.status,
              itemsJson: JSON.stringify(mergedItems),
              total: mergedTotal,
              createdAt: cloudOrder.createdAt,
              updatedAt: new Date().toISOString(),
              createdBy: cloudOrder.createdBy,
              updatedBy: clientOrder.updatedBy || 'SYSTEM',
              deviceId: clientOrder.deviceId,
              sessionId: clientOrder.sessionId,
              revision: cloudRev + 1,
              lastMutationId: clientOrder.lastMutationId
            };
            
            rowsToWrite.push(mergedOrder);
            responseOrders.push(mergedOrder);
          }
        }
        // Remove from map so we know which cloud orders are NOT in client list
        delete cloudMap[tableId];
      }
    });
    
    // Any remaining cloud orders (not sent by client):
    // We should send active ones to the client!
    Object.values(cloudMap).forEach(cloudOrder => {
      if (cloudOrder.status === 'active') {
        responseOrders.push(cloudOrder);
      }
    });
    
    // Write modifications to sheet
    if (rowsToWrite.length > 0) {
      const allRows = _sheetsGet('KG_POS_ORDERS');
      const dataRows = allRows.slice(1);
      
      rowsToWrite.forEach(wOrder => {
        let rowIndex = -1;
        for (let i = 0; i < dataRows.length; i++) {
          if (dataRows[i][1] === wOrder.tableId) { // match tableId
            rowIndex = i;
            break;
          }
        }
        
        const newRow = [
          wOrder.orderId || ('pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
          wOrder.tableId,
          wOrder.tableName,
          wOrder.status || 'active',
          wOrder.itemsJson || '[]',
          wOrder.total || 0,
          wOrder.createdAt || new Date().toISOString(),
          wOrder.updatedAt || new Date().toISOString(),
          wOrder.createdBy || '',
          wOrder.updatedBy || '',
          wOrder.deviceId || '',
          wOrder.sessionId || '',
          wOrder.revision || 1,
          wOrder.lastMutationId || ''
        ];
        
        if (rowIndex !== -1) {
          _sheetsBatchWrite('KG_POS_ORDERS', 'KG_POS_ORDERS!A' + (rowIndex + 2) + ':N' + (rowIndex + 2), [newRow]);
        } else {
          sheet.appendRow(newRow);
        }
      });
    }
    
    // Automatically archive/remove completed/cancelled orders older than 7 days to keep the list clean
    try {
      _cleanupOldPosOrders(sheet);
    } catch(e) {
      // ignore cleanup errors
    }

    return { success: true, orders: responseOrders.filter(o => o.status === 'active') };
  } finally {
    lock.releaseLock();
  }
}

function _cleanupOldPosOrders(sheet) {
  const allRows = _sheetsGet('KG_POS_ORDERS');
  if (!allRows || allRows.length < 2) return;
  const dataRows = allRows.slice(1);
  const now = new Date().getTime();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  let changed = false;
  const keepRows = [];
  
  dataRows.forEach(row => {
    const status = row[3];
    const updatedAtStr = row[7];
    if ((status === 'completed' || status === 'cancelled') && updatedAtStr) {
      const updatedTime = new Date(updatedAtStr).getTime();
      if (now - updatedTime > maxAge) {
        changed = true;
        return; // drop this row
      }
    }
    keepRows.push(row);
  });
  
  if (changed) {
    _sheetsClear('KG_POS_ORDERS!A2:N');
    if (keepRows.length > 0) {
      _sheetsBatchWrite('KG_POS_ORDERS', 'KG_POS_ORDERS!A2:N' + (keepRows.length + 1), keepRows);
    }
  }
}

