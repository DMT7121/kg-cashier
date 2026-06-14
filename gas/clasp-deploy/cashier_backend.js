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
    Logger.log('[GAS API Fallback] _sheetsGet error using Advanced Sheets API on ' + sheetName + ': ' + e.toString());
    try {
      var ss = SpreadsheetApp.openById(CASHIER_SS_ID);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        return sheet.getDataRange().getValues();
      }
    } catch(err) {
      Logger.log('[GAS API Fallback] _sheetsGet SpreadsheetApp fallback also failed: ' + err.toString());
    }
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
  try {
    Sheets.Spreadsheets.Values.update(
      { values: values },
      CASHIER_SS_ID,
      range,
      { valueInputOption: 'RAW' }
    );
  } catch(e) {
    Logger.log('[GAS API Fallback] _sheetsBatchWrite error using Advanced Sheets API on ' + range + ': ' + e.toString());
    try {
      var ss = SpreadsheetApp.openById(CASHIER_SS_ID);
      var cleanRange = range;
      var targetSheet = null;
      if (range.indexOf('!') > -1) {
        var parts = range.split('!');
        targetSheet = ss.getSheetByName(parts[0]);
        cleanRange = parts[1];
      } else {
        targetSheet = ss.getSheetByName(sheetName);
      }
      if (targetSheet) {
        targetSheet.getRange(cleanRange).setValues(values);
      }
    } catch(err) {
      Logger.log('[GAS API Fallback] _sheetsBatchWrite SpreadsheetApp fallback failed: ' + err.toString());
    }
  }
}

/**
 * Append rows to end of sheet using Advanced Sheets API.
 * Fastest method for bulk insert.
 */
function _sheetsAppend(sheetName, values) {
  if (!values || values.length === 0) return;
  try {
    Sheets.Spreadsheets.Values.append(
      { values: values },
      CASHIER_SS_ID,
      sheetName + '!A1',
      { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }
    );
  } catch(e) {
    Logger.log('[GAS API Fallback] _sheetsAppend error using Advanced Sheets API on ' + sheetName + ': ' + e.toString());
    try {
      var ss = SpreadsheetApp.openById(CASHIER_SS_ID);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        for (var i = 0; i < values.length; i++) {
          sheet.appendRow(values[i]);
        }
      }
    } catch(err) {
      Logger.log('[GAS API Fallback] _sheetsAppend SpreadsheetApp fallback failed: ' + err.toString());
    }
  }
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
      allowDevWrite = settingsRes.settings.allowDevWrite === true || 
                      String(settingsRes.settings.allowDevWrite).toUpperCase() === 'TRUE';
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
      case 'tryOpenShift':    result = _tryOpenShiftAction(data); break;
      case 'syncShift':       result = _syncShiftAction(data); break;
      case 'closeShift':      result = _closeShiftAction(data); break;
      case 'closeShiftAtomic': result = _closeShiftAtomicAction(data); break;
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
      
      // CUKCUK Revenue & Indexing (Upgraded V4 Sheets API)
      case 'syncCukcukRevenue': result = _syncCukcukRevenue(data); break;
      case 'rebuildCukcukIndex': result = rebuildCukcukIndex(); break;
      case 'getCukcukSyncState': result = _getCukcukSyncState(); break;
      case 'saveCukcukSyncState': result = _saveCukcukSyncState(data); break;
      case 'syncCukcukToSheets': result = apiRunCukcukSync(data); break;
      case 'syncCukcukInvoices': result = apiRunCukcukSync(data); break;
      case 'syncCukcukMenu':     result = _syncCukcukMenuAction(data); break;
      case 'setupCukcukAutoSyncTrigger': result = setupCukcukAutoSyncTrigger(); break;
      case 'disableCukcukAutoSyncTrigger': result = disableCukcukAutoSyncTrigger(); break;
      case 'clearCukcukSyncLock': result = apiClearCukcukSyncLock(data); break;
      case 'loadCukcukInvoices': result = _loadCukcukInvoicesAction(data); break;
      case 'getCukcukInvoices': result = _loadCukcukInvoicesAction(data); break;
      case 'getCukcukItems':    result = _getCukcukItemsAction(data); break;
      case 'getCukcukDailySales': result = _getCukcukDailySalesAction(data); break;
      case 'saveCukcukOverride': result = apiManualOverridePayment(data); break;
      case 'overrideCukcukInvoice': result = apiManualOverridePayment(data); break;
      case 'rollbackCukcukInvoice': result = _rollbackCukcukInvoiceAction(data); break;

      // New Sheets API V4 Endpoints
      case 'getRevenueOverview': result = apiGetRevenueOverview(data); break;
      case 'getRevenueByDay': result = apiGetRevenueByDay(data); break;
      case 'getRevenueByWeek': result = apiGetRevenueByWeek(data); break;
      case 'getRevenueByMonth': result = apiGetRevenueByMonth(data); break;
      case 'getRevenueByQuarter': result = apiGetRevenueByQuarter(data); break;
      case 'getRevenueByYear': result = apiGetRevenueByYear(data); break;
      case 'getInvoiceSearch': result = apiGetInvoiceSearch(data); break;
      case 'getInvoiceDetail': result = apiGetInvoiceDetail(data); break;
      case 'runCukcukSync': result = apiRunCukcukSync(data); break;
      case 'rebuildAggregates': result = apiRebuildAggregates(data); break;
      case 'rebuildMonthJson': result = apiRebuildMonthJson(data); break;
      case 'manualOverridePayment': result = apiManualOverridePayment(data); break;
      case 'migrateLegacyCukcukInvoices': result = migrateLegacyCukcukInvoicesToV4Architecture(data); break;
      case 'runAllV4BackendTests': result = runAllV4BackendTests(); break;

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
  const sheet = _getSheet('KG_SETTINGS', headers);
  const rows = _getSheetData('KG_SETTINGS');
  const settings = {};
  const seenKeys = {};
  let hasDuplicates = false;

  rows.forEach(r => { 
    if (!r.key) return;
    let val = r.value;
    let parsedVal = val;
    let isValidJson = false;

    if (typeof val === 'string') {
      try {
        parsedVal = JSON.parse(val);
        isValidJson = true;
      } catch(e) {
        // Skip Apps Script map representation strings like '{appId=..., domain=...}'
        if (val.indexOf('{') === 0 && val.indexOf('=') > -1) {
          return;
        }
      }
    }

    if (seenKeys[r.key] === undefined) {
      settings[r.key] = parsedVal;
      seenKeys[r.key] = { isValid: isValidJson, raw: val };
    } else {
      hasDuplicates = true;
      // If the new value is valid JSON, or the previous one wasn't, overwrite with the better one
      if (isValidJson || !seenKeys[r.key].isValid) {
        settings[r.key] = parsedVal;
        seenKeys[r.key] = { isValid: isValidJson, raw: val };
      }
    }
  });

  // If duplicates were found, automatically clean up and de-duplicate the KG_SETTINGS sheet
  if (hasDuplicates) {
    try {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      const uniqueRows = Object.entries(settings).map(([k, v]) => {
        const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return [k, strVal];
      });
      if (uniqueRows.length > 0) {
        sheet.getRange(2, 1, uniqueRows.length, 2).setValues(uniqueRows);
      }
      Logger.log('[GAS Settings] Successfully de-duplicated KG_SETTINGS sheet.');
    } catch(err) {
      Logger.log('[GAS Settings] De-duplication failed: ' + err.toString());
    }
  }

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
  _getSheet('KG_CUKCUK_INVOICES', INVOICES_HEADERS);
  _getSheet('KG_CUKCUK_ITEMS', ITEMS_HEADERS);
  _getSheet('KG_ITEM_CATEGORY_MAP', CATEGORY_MAP_HEADERS);
  _getSheet('KG_CUKCUK_OVERRIDES', ['OverrideId', 'RefId', 'OverrideType', 'OldValueJson', 'NewValueJson', 'Reason', 'EditedBy', 'EditedAt', 'SyncedAt', 'Status']);

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


// ══════════════════════════════════════════════
//  NEW CENTRAL CUKCUK BACKEND SYNC AND ACTIONS
// ══════════════════════════════════════════════

const INVOICES_HEADERS = [
  'RefId', 'RefNo', 'RefDate', 'WorkDate', 'ShiftId', 'ShiftNumber', 'TableName', 'EmployeeName', 'CustomerName',
  'Amount', 'CashAmount', 'CardAmount', 'TransferAmount', 'OtherAmount', 'PaymentInfo', 'PaymentJson',
  'Status', 'IsPaid', 'IsCancelled', 'IsDeleted', 'SourceUpdatedAt', 'LastFetchedAt', 'RowHash', 'DetailHash',
  'ItemsCount', 'ManualOverrideJson', 'ManualEditedAt', 'ManualEditedBy', 'ManualLock', 'SyncBatchId',
  'CreatedAt', 'UpdatedAt'
];

const ITEMS_HEADERS = [
  'ItemRowKey', 'RefId', 'RefNo', 'RefDate', 'WorkDate', 'RefDetailID', 'ItemID', 'ItemCode', 'ItemName',
  'CategoryID', 'CategoryName', 'UnitID', 'UnitName', 'Quantity', 'UnitPrice', 'Amount', 'DiscountAmount',
  'InventoryItemType', 'ItemType', 'IsDrink', 'IsFood', 'ClassifySource', 'RowHash', 'CreatedAt', 'UpdatedAt'
];

const CATEGORY_MAP_HEADERS = [
  'ItemID', 'ItemCode', 'ItemName', 'CategoryName', 'IsDrink', 'IsFood', 'InventoryProductId', 'Aliases', 'UpdatedBy', 'UpdatedAt'
];

function _md5Gas(inputStr) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, inputStr, Utilities.Charset.UTF_8);
  let hexStr = '';
  for (let i = 0; i < digest.length; i++) {
    let byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    hexStr += byteHex.length === 1 ? '0' + byteHex : byteHex;
  }
  return hexStr;
}

function _colLetter(colNumber) {
  let temp, letter = '';
  while (colNumber > 0) {
    temp = (colNumber - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colNumber = (colNumber - temp - 1) / 26;
  }
  return letter;
}

function _sheetsBatchUpdate(sheetName, updates) {
  if (!updates || updates.length === 0) return;
  const data = updates.map(u => ({
    range: sheetName + '!A' + u.rowIndex + ':' + u.rangeEndLetter + u.rowIndex,
    values: [u.rowData]
  }));
  try {
    Sheets.Spreadsheets.Values.batchUpdate(
      { valueInputOption: 'RAW', data: data },
      CASHIER_SS_ID
    );
  } catch(e) {
    Logger.log('[GAS API Fallback] batchUpdate failed, falling back to sequential: ' + e.toString());
    updates.forEach(u => {
      _sheetsBatchWrite(sheetName, sheetName + '!A' + u.rowIndex, [u.rowData]);
    });
  }
}

function _getWorkingDayGas(dateOrStr) {
  let dateObj;
  if (!dateOrStr) {
    dateObj = new Date();
  } else if (typeof dateOrStr === 'string') {
    dateObj = new Date(dateOrStr.replace(' ', 'T'));
  } else {
    dateObj = dateOrStr;
  }
  
  const tz = 'Asia/Ho_Chi_Minh';
  const hourStr = Utilities.formatDate(dateObj, tz, 'H');
  const hour = parseInt(hourStr);
  
  let targetDate = new Date(dateObj.getTime());
  if (hour < 6) {
    targetDate.setTime(targetDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return Utilities.formatDate(targetDate, tz, 'yyyy-MM-dd');
}

function _getWorkingDayRangeGas(workDateStr) {
  var parts = workDateStr.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]) - 1;
  var d = parseInt(parts[2]);
  
  var fromDate = new Date(y, m, d, 6, 0, 0);
  var toDate = new Date(y, m, d + 1, 6, 0, 0);
  
  var pad = function(n) { return n < 10 ? '0' + n : String(n); };
  var formatLocal = function(dt) {
    return dt.getFullYear() + '-' +
           pad(dt.getMonth() + 1) + '-' +
           pad(dt.getDate()) + 'T' +
           pad(dt.getHours()) + ':' +
           pad(dt.getMinutes()) + ':' +
           pad(dt.getSeconds());
  };
  
  return {
    fromDate: formatLocal(fromDate),
    toDate: formatLocal(toDate)
  };
}

function _loginCukcukInGas(appId, domain, secretKey) {
  const loginTime = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  const cleanAppId = appId.trim();
  const cleanDomain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.cukcuk\.vn\/?$/, '')
    .replace(/\/$/, '');
  
  const payloadStr = JSON.stringify({
    AppID: cleanAppId,
    Domain: cleanDomain,
    LoginTime: loginTime
  });
  
  const signatureBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    payloadStr,
    secretKey,
    Utilities.Charset.UTF_8
  );
  
  let signatureHex = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    let byteVal = signatureBytes[i];
    if (byteVal < 0) byteVal += 256;
    let hexStr = byteVal.toString(16);
    signatureHex += hexStr.length === 1 ? '0' + hexStr : hexStr;
  }
  
  const upstreamUrl = 'https://graphapi.cukcuk.vn/api/Account/Login';
  const response = UrlFetchApp.fetch(upstreamUrl, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({
      AppID: cleanAppId,
      Domain: cleanDomain,
      LoginTime: loginTime,
      SignatureInfo: signatureHex
    }),
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error('Đăng nhập CUKCUK thất bại với mã HTTP ' + response.getResponseCode());
  }
  
  const data = JSON.parse(response.getContentText());
  if (data && data.Success && data.Data) {
    const accessToken = data.Data.AccessToken || data.Data;
    const companyCode = data.Data.CompanyCode || cleanDomain;
    return {
      accessToken: accessToken,
      companyCode: companyCode
    };
  } else {
    throw new Error((data && (data.ErrorMessage || data.Message)) || 'Lỗi đăng nhập CUKCUK');
  }
}

function _cukcukApiCallInGas(url, options, accessToken, companyCode) {
  const headers = options.headers || {};
  headers['Authorization'] = 'Bearer ' + accessToken;
  headers['CompanyCode'] = companyCode;
  
  const fetchOptions = {
    method: options.method || 'GET',
    headers: headers,
    muteHttpExceptions: true
  };
  if (options.body) {
    fetchOptions.payload = options.body;
    fetchOptions.contentType = 'application/json';
  }
  
  const targetUrl = 'https://graphapi.cukcuk.vn' + url;
  
  let delay = 500;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = UrlFetchApp.fetch(targetUrl, fetchOptions);
      const respCode = response.getResponseCode();
      if (respCode === 200) {
        const bodyText = response.getContentText();
        let bodyJson;
        try { bodyJson = JSON.parse(bodyText); } catch(e) {}
        if (bodyJson && !bodyJson.Success) {
          const errMsg = (bodyJson.ErrorMessage || bodyJson.Message || '').toLowerCase();
          const errCode = bodyJson.ErrorCode || 0;
          if (errCode === 102 || errMsg.indexOf('102') !== -1 || errMsg.indexOf('đang xử lý') !== -1) {
            Logger.log('[GAS CUKCUK] Concurrency Lock (102). Retrying in ' + delay + 'ms...');
            Utilities.sleep(delay);
            delay *= 2;
            continue;
          }
        }
        return bodyJson || bodyText;
      } else if (respCode === 401) {
        return { _authFailed: true };
      } else {
        throw new Error('HTTP ' + respCode + ' from ' + url);
      }
    } catch(error) {
      if (attempt === 2) throw error;
      Logger.log('[GAS CUKCUK] Connection error (attempt ' + (attempt + 1) + '): ' + error.toString() + '. Retrying...');
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
  return null;
}

function _syncCukcukToSheetsAction(data) {
  const val = _validateMetadata(data, 'syncCukcukToSheets');
  if (val && !val.success) return val;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận (không thể lấy khóa đồng bộ), vui lòng thử lại sau.' };
  }

  const startTimeMs = Date.now();
  
  try {
    const props = PropertiesService.getScriptProperties();
    let domain = props.getProperty('CUKCUK_DOMAIN') || '';
    let appId = props.getProperty('CUKCUK_APP_ID') || '';
    let secretKey = props.getProperty('CUKCUK_SECRET_KEY') || '';

    if (!domain || !appId || !secretKey) {
      try {
        const settingsRows = _getSheetData('KG_SETTINGS');
        const settingsObj = {};
        settingsRows.forEach(r => { settingsObj[r.key] = r.value; });
        if (settingsObj.cukcuk) {
          const cukcukConf = JSON.parse(settingsObj.cukcuk);
          domain = cukcukConf.domain || '';
          appId = cukcukConf.appId || '';
          secretKey = cukcukConf.key || '';
        }
      } catch(e) {
        Logger.log('[GAS CUKCUK] Settings parse fallback failed: ' + e.toString());
      }
    }

    if (!domain || !appId || !secretKey) {
      return { success: false, message: 'Thiếu cấu hình kết nối CUKCUK (CUKCUK_DOMAIN, CUKCUK_APP_ID, CUKCUK_SECRET_KEY).' };
    }

    let loginRes;
    try {
      loginRes = _loginCukcukInGas(appId, domain, secretKey);
    } catch(err) {
      return { success: false, message: 'Lỗi đăng nhập CUKCUK: ' + err.toString() };
    }

    let useFromDate, useToDate;
    if (data.fromDate && data.toDate) {
      useFromDate = data.fromDate;
      useToDate = data.toDate;
    } else if (data.workDate) {
      const range = _getWorkingDayRangeGas(data.workDate);
      useFromDate = range.fromDate;
      useToDate = range.toDate;
    } else {
      const todayWorkDateStr = _getWorkingDayGas(new Date());
      const parts = todayWorkDateStr.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      const d = parseInt(parts[2]);
      
      const fromDateObj = new Date(y, m, d - 2, 6, 0, 0);
      const toDateObj = new Date(y, m, d + 1, 6, 0, 0);
      
      const pad = function(n) { return n < 10 ? '0' + n : String(n); };
      const formatLocal = function(dt) {
        return dt.getFullYear() + '-' +
               pad(dt.getMonth() + 1) + '-' +
               pad(dt.getDate()) + 'T' +
               pad(dt.getHours()) + ':' +
               pad(dt.getMinutes()) + ':' +
               pad(dt.getSeconds());
      };
      useFromDate = formatLocal(fromDateObj);
      useToDate = formatLocal(toDateObj);
    }

    Logger.log('[GAS CUKCUK] Sync window: ' + useFromDate + ' -> ' + useToDate);

    let page = 1;
    let allApiInvoices = [];
    let hasMore = true;
    const limit = 100;
    
    while (hasMore) {
      const body = {
        Page: page,
        Limit: limit,
        FromDate: useFromDate,
        ToDate: useToDate
      };
      
      let response = _cukcukApiCallInGas('/api/v1/sainvoices/paging', {
        method: 'POST',
        body: JSON.stringify(body)
      }, loginRes.accessToken, loginRes.companyCode);
      
      if (response && response._authFailed) {
        loginRes = _loginCukcukInGas(appId, domain, secretKey);
        response = _cukcukApiCallInGas('/api/v1/sainvoices/paging', {
          method: 'POST',
          body: JSON.stringify(body)
        }, loginRes.accessToken, loginRes.companyCode);
      }
      
      let items = [];
      if (response && response.Success && response.Data) {
        if (Array.isArray(response.Data)) items = response.Data;
        else if (response.Data.PageData) items = response.Data.PageData;
        else if (response.Data.Items) items = response.Data.Items;
      }
      
      if (items.length > 0) {
        allApiInvoices = allApiInvoices.concat(items);
        if (items.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    Logger.log('[GAS CUKCUK] Found ' + allApiInvoices.length + ' invoices on API.');

    _getSheet('KG_CUKCUK_INVOICES', INVOICES_HEADERS);
    _getSheet('KG_CUKCUK_ITEMS', ITEMS_HEADERS);
    _getSheet('KG_ITEM_CATEGORY_MAP', CATEGORY_MAP_HEADERS);
    
    const allInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
    const invoiceHeaders = allInvoices[0] || INVOICES_HEADERS;
    const colIndex = {};
    invoiceHeaders.forEach((h, idx) => { colIndex[h] = idx; });
    
    const invoiceMap = {};
    for (let i = 1; i < allInvoices.length; i++) {
      const refId = String(allInvoices[i][colIndex['RefId']] || '');
      if (refId) {
        invoiceMap[refId] = {
          rowIndex: i + 1,
          rowHash: String(allInvoices[i][colIndex['RowHash']] || ''),
          detailHash: String(allInvoices[i][colIndex['DetailHash']] || ''),
          isPaid: allInvoices[i][colIndex['IsPaid']] === true || String(allInvoices[i][colIndex['IsPaid']]).toLowerCase() === 'true',
          manualLock: allInvoices[i][colIndex['ManualLock']] === true || String(allInvoices[i][colIndex['ManualLock']]).toLowerCase() === 'true',
        };
      }
    }

    const allItems = _sheetsGet('KG_CUKCUK_ITEMS');
    const itemsHeaders = allItems[0] || ITEMS_HEADERS;
    const itemsColIndex = {};
    itemsHeaders.forEach((h, idx) => { itemsColIndex[h] = idx; });
    
    const itemsMap = {};
    for (let i = 1; i < allItems.length; i++) {
      const itemRowKey = String(allItems[i][itemsColIndex['ItemRowKey']] || '');
      if (itemRowKey) {
        itemsMap[itemRowKey] = {
          rowIndex: i + 1
        };
      }
    }

    const categoryMapRows = _getSheetData('KG_ITEM_CATEGORY_MAP');
    const categoryMap = {};
    categoryMapRows.forEach(r => {
      categoryMap[String(r.ItemID)] = r;
    });

    const newCategoryMapRows = [];
    const invoicesToAppend = [];
    const invoicesToUpdate = [];
    const itemsToAppend = [];
    const itemsToUpdate = [];
    
    let insertedInvoices = 0;
    let updatedInvoices = 0;
    let skippedInvoices = 0;
    let insertedItems = 0;
    let updatedItems = 0;
    let skippedItems = 0;
    let detailFetched = 0;

    const forceDetail = data.forceDetail === true || String(data.forceDetail).toLowerCase() === 'true';
    const syncBatchId = 'batch_' + Date.now().toString(36);
    const nowStr = new Date().toISOString();

    for (let i = 0; i < allApiInvoices.length; i++) {
      const inv = allApiInvoices[i];
      const refId = String(inv.RefId || '');
      if (!refId) continue;

      const lightHashStr = [
        refId,
        inv.RefNo || '',
        inv.RefDate || '',
        inv.Amount || 0,
        inv.Status || 0,
        inv.IsPaid === true || String(inv.IsPaid).toLowerCase() === 'true',
        inv.IsCancelled === true || String(inv.IsCancelled).toLowerCase() === 'true',
        inv.IsDeleted === true || String(inv.IsDeleted).toLowerCase() === 'true'
      ].join('|');
      const lightHash = _md5Gas(lightHashStr);

      const existingInv = invoiceMap[refId];

      if (existingInv && existingInv.rowHash === lightHash && existingInv.isPaid && !forceDetail) {
        skippedInvoices++;
        continue;
      }

      if (existingInv && existingInv.manualLock && !forceDetail) {
        skippedInvoices++;
        continue;
      }

      let detail = null;
      try {
        detail = _cukcukApiCallInGas('/api/v1/sainvoices/' + refId, { method: 'GET' }, loginRes.accessToken, loginRes.companyCode);
        detailFetched++;
      } catch(detailErr) {
        Logger.log('[GAS CUKCUK] Detail fetch failed for ' + refId + ': ' + detailErr.toString());
        continue;
      }

      if (detail && detail.Success && detail.Data) {
        const detailData = detail.Data;
        const payments = detailData.SAInvoicePayments || detailData.Payments || [];
        const detailAmount = detailData.Amount || 0;
        
        let invCash = 0, invCard = 0, invTransfer = 0, invOther = 0;
        const paymentInfoParts = [];
        const paymentJsonList = [];

        payments.forEach(pmt => {
          const pmtAmount = pmt.Amount || 0;
          if (pmtAmount <= 0) return;
          
          const name = (pmt.PaymentName || '').toLowerCase();
          const type = pmt.PaymentType;
          let method = 'cash';
          let label = 'Tiền mặt';

          if (name.indexOf('mặt') !== -1 || name.indexOf('tiền mặt') !== -1 || name.indexOf('cash') !== -1) {
            method = 'cash'; label = 'Tiền mặt'; invCash += pmtAmount;
          } else if (name.indexOf('chuyển') !== -1 || name.indexOf('khoản') !== -1 || name.indexOf('ngân hàng') !== -1 || name.indexOf('bank') !== -1 || name.indexOf('transfer') !== -1) {
            method = 'transfer'; label = 'Chuyển khoản'; invTransfer += pmtAmount;
          } else if (name.indexOf('thẻ') !== -1 || name.indexOf('card') !== -1 || name.indexOf('visa') !== -1 || name.indexOf('master') !== -1) {
            method = 'card'; label = 'Thẻ'; invCard += pmtAmount;
          } else {
            switch (type) {
              case 1: method = 'cash'; label = 'Tiền mặt'; invCash += pmtAmount; break;
              case 2: method = 'card'; label = 'Thẻ'; invCard += pmtAmount; break;
              case 3: method = 'transfer'; label = 'Chuyển khoản'; invTransfer += pmtAmount; break;
              default: method = 'other'; label = pmt.PaymentName || 'Khác'; invOther += pmtAmount; break;
            }
          }
          paymentInfoParts.push(label + ': ' + pmtAmount.toLocaleString('vi-VN'));
          paymentJsonList.push({ method: method, amount: pmtAmount, label: label });
        });

        const effectiveAmount = (invCash + invCard + invTransfer + invOther) || detailAmount;
        const paymentInfo = paymentInfoParts.join(' + ') || 'Chưa thanh toán';

        const itemsList = detailData.SAInvoiceDetails || detailData.Details || [];
        
        const detailItemsStr = (itemsList || []).map(item => {
          return [
            item.InventoryItemName || item.ItemName || item.Name || '',
            item.Quantity || item.Qty || 0,
            item.UnitPrice || item.Price || 0,
            item.Amount || 0
          ].join(',');
        }).join('|');
        const detailHash = _md5Gas(detailItemsStr);

        const workDate = _getWorkingDayGas(detailData.RefDate || inv.RefDate);

        const newInvoiceRow = new Array(INVOICES_HEADERS.length).fill('');
        newInvoiceRow[colIndex['RefId']] = refId;
        newInvoiceRow[colIndex['RefNo']] = detailData.RefNo || inv.RefNo || '';
        newInvoiceRow[colIndex['RefDate']] = detailData.RefDate || inv.RefDate || '';
        newInvoiceRow[colIndex['WorkDate']] = workDate;
        newInvoiceRow[colIndex['ShiftId']] = '';
        newInvoiceRow[colIndex['ShiftNumber']] = '';
        newInvoiceRow[colIndex['TableName']] = detailData.TableName || inv.TableName || '';
        newInvoiceRow[colIndex['EmployeeName']] = detailData.EmployeeName || inv.EmployeeName || '';
        newInvoiceRow[colIndex['CustomerName']] = detailData.CustomerName || inv.CustomerName || '';
        newInvoiceRow[colIndex['Amount']] = effectiveAmount;
        newInvoiceRow[colIndex['CashAmount']] = invCash;
        newInvoiceRow[colIndex['CardAmount']] = invCard;
        newInvoiceRow[colIndex['TransferAmount']] = invTransfer;
        newInvoiceRow[colIndex['OtherAmount']] = invOther;
        newInvoiceRow[colIndex['PaymentInfo']] = paymentInfo;
        newInvoiceRow[colIndex['PaymentJson']] = JSON.stringify(paymentJsonList);
        newInvoiceRow[colIndex['Status']] = detailData.Status !== undefined ? detailData.Status : (inv.Status || 0);
        newInvoiceRow[colIndex['IsPaid']] = detailData.IsPaid !== undefined ? detailData.IsPaid : (inv.IsPaid || false);
        newInvoiceRow[colIndex['IsCancelled']] = detailData.IsCancelled !== undefined ? detailData.IsCancelled : (inv.IsCancelled || false);
        newInvoiceRow[colIndex['IsDeleted']] = detailData.IsDeleted !== undefined ? detailData.IsDeleted : (inv.IsDeleted || false);
        newInvoiceRow[colIndex['SourceUpdatedAt']] = detailData.ModifiedDate || '';
        newInvoiceRow[colIndex['LastFetchedAt']] = nowStr;
        newInvoiceRow[colIndex['RowHash']] = lightHash;
        newInvoiceRow[colIndex['DetailHash']] = detailHash;
        newInvoiceRow[colIndex['ItemsCount']] = itemsList.length;
        newInvoiceRow[colIndex['ManualOverrideJson']] = existingInv ? (allInvoices[existingInv.rowIndex - 1][colIndex['ManualOverrideJson']] || '{}') : '{}';
        newInvoiceRow[colIndex['ManualEditedAt']] = existingInv ? (allInvoices[existingInv.rowIndex - 1][colIndex['ManualEditedAt']] || '') : '';
        newInvoiceRow[colIndex['ManualEditedBy']] = existingInv ? (allInvoices[existingInv.rowIndex - 1][colIndex['ManualEditedBy']] || '') : '';
        newInvoiceRow[colIndex['ManualLock']] = existingInv ? (allInvoices[existingInv.rowIndex - 1][colIndex['ManualLock']] === true || String(allInvoices[existingInv.rowIndex - 1][colIndex['ManualLock']]).toLowerCase() === 'true') : false;
        newInvoiceRow[colIndex['SyncBatchId']] = syncBatchId;
        newInvoiceRow[colIndex['CreatedAt']] = existingInv ? (allInvoices[existingInv.rowIndex - 1][colIndex['CreatedAt']] || nowStr) : nowStr;
        newInvoiceRow[colIndex['UpdatedAt']] = nowStr;

        if (existingInv) {
          invoicesToUpdate.push({
            rowIndex: existingInv.rowIndex,
            rangeEndLetter: _colLetter(INVOICES_HEADERS.length),
            rowData: newInvoiceRow
          });
          updatedInvoices++;
        } else {
          invoicesToAppend.push(newInvoiceRow);
          insertedInvoices++;
        }

        if (!existingInv || existingInv.detailHash !== detailHash || forceDetail) {
          itemsList.forEach((item, itemIdx) => {
            const itemId = String(item.InventoryItemID || item.ItemID || '');
            if (!itemId) return;
            const refDetailId = String(item.RefDetailID || '');
            const itemRowKey = refDetailId ? (refId + '__' + refDetailId) : (refId + '__' + itemId + '__' + itemIdx);

            const itemName = item.InventoryItemName || item.ItemName || item.Name || '';
            const itemCode = item.InventoryItemCode || item.ItemCode || '';
            const itemCategoryName = item.InventoryItemCategoryName || item.CategoryName || '';

            let isDrink = false;
            let isFood = true;
            if (categoryMap[itemId]) {
              isDrink = categoryMap[itemId].IsDrink === true || String(categoryMap[itemId].IsDrink).toLowerCase() === 'true';
              isFood = categoryMap[itemId].IsFood === true || String(categoryMap[itemId].IsFood).toLowerCase() === 'true';
            } else {
              const lowerName = itemName.toLowerCase();
              const lowerCat = itemCategoryName.toLowerCase();
              if (lowerCat.indexOf('uống') > -1 || lowerCat.indexOf('nước') > -1 || lowerCat.indexOf('bia') > -1 || lowerCat.indexOf('ngọt') > -1 || lowerCat.indexOf('rượu') > -1 || lowerCat.indexOf('cà phê') > -1 || lowerCat.indexOf('cafe') > -1 || lowerCat.indexOf('sinh tố') > -1 || lowerCat.indexOf('trà') > -1) {
                isDrink = true; isFood = false;
              } else if (lowerName.indexOf('nước') > -1 || lowerName.indexOf('bia') > -1 || lowerName.indexOf('coca') > -1 || lowerName.indexOf('pepsi') > -1 || lowerName.indexOf('rượu') > -1 || lowerName.indexOf('redbull') > -1 || lowerName.indexOf('sting') > -1 || lowerName.indexOf('trà') > -1 || lowerName.indexOf('cafe') > -1 || lowerName.indexOf('chai') > -1 || lowerName.indexOf('lon') > -1) {
                isDrink = true; isFood = false;
              }

              newCategoryMapRows.push([
                itemId, itemCode, itemName, itemCategoryName,
                isDrink ? 'TRUE' : 'FALSE', isFood ? 'TRUE' : 'FALSE',
                '', '', 'SYSTEM', nowStr
              ]);
              categoryMap[itemId] = {
                ItemID: itemId,
                IsDrink: isDrink,
                IsFood: isFood
              };
            }

            const newItemRow = new Array(ITEMS_HEADERS.length).fill('');
            newItemRow[itemsColIndex['ItemRowKey']] = itemRowKey;
            newItemRow[itemsColIndex['RefId']] = refId;
            newItemRow[itemsColIndex['RefNo']] = detailData.RefNo || inv.RefNo || '';
            newItemRow[itemsColIndex['RefDate']] = detailData.RefDate || inv.RefDate || '';
            newItemRow[itemsColIndex['WorkDate']] = workDate;
            newItemRow[itemsColIndex['RefDetailID']] = refDetailId;
            newItemRow[itemsColIndex['ItemID']] = itemId;
            newItemRow[itemsColIndex['ItemCode']] = itemCode;
            newItemRow[itemsColIndex['ItemName']] = itemName;
            newItemRow[itemsColIndex['CategoryID']] = item.InventoryItemCategoryID || item.CategoryID || '';
            newItemRow[itemsColIndex['CategoryName']] = itemCategoryName;
            newItemRow[itemsColIndex['UnitID']] = item.UnitID || '';
            newItemRow[itemsColIndex['UnitName']] = item.UnitName || '';
            newItemRow[itemsColIndex['Quantity']] = item.Quantity || item.Qty || 1;
            newItemRow[itemsColIndex['UnitPrice']] = item.UnitPrice || item.Price || 0;
            newItemRow[itemsColIndex['Amount']] = item.Amount || 0;
            newItemRow[itemsColIndex['DiscountAmount']] = item.DiscountAmount || 0;
            newItemRow[itemsColIndex['InventoryItemType']] = item.InventoryItemType || 0;
            newItemRow[itemsColIndex['ItemType']] = item.ItemType || 0;
            newItemRow[itemsColIndex['IsDrink']] = isDrink;
            newItemRow[itemsColIndex['IsFood']] = isFood;
            newItemRow[itemsColIndex['ClassifySource']] = categoryMap[itemId].UpdatedBy ? 'manual' : 'system';
            newItemRow[itemsColIndex['RowHash']] = detailHash;
            newItemRow[itemsColIndex['CreatedAt']] = itemsMap[itemRowKey] ? (allItems[itemsMap[itemRowKey].rowIndex - 1][itemsColIndex['CreatedAt']] || nowStr) : nowStr;
            newItemRow[itemsColIndex['UpdatedAt']] = nowStr;

            if (itemsMap[itemRowKey]) {
              itemsToUpdate.push({
                rowIndex: itemsMap[itemRowKey].rowIndex,
                rangeEndLetter: _colLetter(ITEMS_HEADERS.length),
                rowData: newItemRow
              });
              updatedItems++;
            } else {
              itemsToAppend.push(newItemRow);
              insertedItems++;
            }
          });
        } else {
          skippedItems += itemsList.length;
        }
      }
    }

    if (invoicesToAppend.length > 0) _sheetsAppend('KG_CUKCUK_INVOICES', invoicesToAppend);
    if (invoicesToUpdate.length > 0) _sheetsBatchUpdate('KG_CUKCUK_INVOICES', invoicesToUpdate);
    
    if (itemsToAppend.length > 0) _sheetsAppend('KG_CUKCUK_ITEMS', itemsToAppend);
    if (itemsToUpdate.length > 0) _sheetsBatchUpdate('KG_CUKCUK_ITEMS', itemsToUpdate);

    if (newCategoryMapRows.length > 0) _sheetsAppend('KG_ITEM_CATEGORY_MAP', newCategoryMapRows);

    const durationMs = Date.now() - startTimeMs;
    _saveCukcukSyncState({
      syncType: data.mode || 'auto',
      startDate: useFromDate,
      endDate: useToDate,
      status: 'success',
      invoicesCount: allApiInvoices.length,
      details: JSON.stringify({
        insertedInvoices: insertedInvoices,
        updatedInvoices: updatedInvoices,
        skippedInvoices: skippedInvoices,
        insertedItems: insertedItems,
        updatedItems: updatedItems,
        skippedItems: skippedItems,
        durationMs: durationMs
      })
    });

    return {
      success: true,
      insertedInvoices: insertedInvoices,
      updatedInvoices: updatedInvoices,
      skippedInvoices: skippedInvoices,
      insertedItems: insertedItems,
      updatedItems: updatedItems,
      skippedItems: skippedItems,
      detailFetched: detailFetched,
      durationMs: durationMs,
      syncBatchId: syncBatchId
    };

  } catch(syncErr) {
    Logger.log('[GAS CUKCUK] Sync failed: ' + syncErr.toString());
    _saveCukcukSyncState({
      syncType: data.mode || 'auto',
      startDate: data.fromDate || '',
      endDate: data.toDate || '',
      status: 'failed',
      invoicesCount: 0,
      details: syncErr.toString()
    });
    return { success: false, message: 'Lỗi đồng bộ: ' + syncErr.toString() };
  } finally {
    lock.releaseLock();
  }
}

function _getCukcukInvoicesAction(data) {
  const rows = _getSheetData('KG_CUKCUK_INVOICES');
  let filtered = rows;
  
  if (data.workDate) {
    filtered = filtered.filter(r => r.WorkDate === data.workDate);
  } else {
    if (data.fromDate) {
      filtered = filtered.filter(r => r.RefDate >= data.fromDate);
    }
    if (data.toDate) {
      filtered = filtered.filter(r => r.RefDate <= data.toDate);
    }
  }
  
  if (data.since) {
    filtered = filtered.filter(r => r.UpdatedAt > data.since);
  }
  
  filtered.sort((a, b) => (a.UpdatedAt || '').localeCompare(b.UpdatedAt || ''));
  
  const page = parseInt(data.page || 1);
  const limit = parseInt(data.limit || 0);
  let pageData = filtered;
  if (limit > 0) {
    const start = (page - 1) * limit;
    pageData = filtered.slice(start, start + limit);
  }
  
  return {
    success: true,
    invoices: pageData,
    total: filtered.length,
    page: page,
    limit: limit
  };
}

function _getCukcukItemsAction(data) {
  const rows = _getSheetData('KG_CUKCUK_ITEMS');
  let filtered = rows;
  
  if (data.workDate) {
    filtered = filtered.filter(r => r.WorkDate === data.workDate);
  } else {
    if (data.fromDate) {
      filtered = filtered.filter(r => r.RefDate >= data.fromDate);
    }
    if (data.toDate) {
      filtered = filtered.filter(r => r.RefDate <= data.toDate);
    }
  }
  
  if (data.since) {
    filtered = filtered.filter(r => r.UpdatedAt > data.since);
  }
  
  return {
    success: true,
    items: filtered
  };
}

function _getCukcukDailySalesAction(data) {
  const rows = _getSheetData('KG_CUKCUK_ITEMS');
  let filtered = rows;
  
  if (data.workDate) {
    filtered = filtered.filter(r => r.WorkDate === data.workDate);
  } else {
    if (data.fromDate) {
      filtered = filtered.filter(r => r.RefDate >= data.fromDate);
    }
    if (data.toDate) {
      filtered = filtered.filter(r => r.RefDate <= data.toDate);
    }
  }
  
  const agg = {};
  filtered.forEach(item => {
    const key = item.ItemID;
    if (!agg[key]) {
      agg[key] = {
        itemId: item.ItemID,
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        categoryName: item.CategoryName,
        isDrink: item.IsDrink === true || String(item.IsDrink).toLowerCase() === 'true',
        isFood: item.IsFood === true || String(item.IsFood).toLowerCase() === 'true',
        unitName: item.UnitName,
        quantity: 0,
        amount: 0,
        bills: {},
        billCount: 0
      };
    }
    const q = parseFloat(item.Quantity || 0);
    const amt = parseFloat(item.Amount || 0);
    agg[key].quantity += q;
    agg[key].amount += amt;
    agg[key].bills[item.RefId] = true;
  });
  
  const result = Object.values(agg).map(x => {
    x.billCount = Object.keys(x.bills).length;
    x.bills = undefined;
    return x;
  });
  
  result.sort((a, b) => b.quantity - a.quantity);
  
  return {
    success: true,
    sales: result
  };
}

function _saveCukcukOverrideAction(data) {
  const val = _validateMetadata(data, 'saveCukcukOverride');
  if (val && !val.success) return val;

  if (!data.refId) {
    return { success: false, message: 'Missing refId' };
  }
  
  const headers = ['OverrideId', 'RefId', 'OverrideType', 'OldValueJson', 'NewValueJson', 'Reason', 'EditedBy', 'EditedAt', 'SyncedAt', 'Status'];
  const sheet = _getSheet('KG_CUKCUK_OVERRIDES', headers);
  
  const overrideId = data.overrideId || ('ovr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const row = [
    overrideId,
    data.refId,
    data.overrideType || 'payment',
    data.oldValueJson || '{}',
    data.newValueJson || '{}',
    data.reason || '',
    data.editedBy || 'SYSTEM',
    data.editedAt || new Date().toISOString(),
    new Date().toISOString(),
    'active'
  ];
  
  _sheetsAppend('KG_CUKCUK_OVERRIDES', [row]);
  
  const invoicesSheet = _getSheet('KG_CUKCUK_INVOICES');
  const allInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
  let rowIndex = -1;
  const colIndex = {};
  if (allInvoices && allInvoices.length > 0) {
    allInvoices[0].forEach((h, idx) => { colIndex[h] = idx; });
    for (let i = 1; i < allInvoices.length; i++) {
      if (String(allInvoices[i][colIndex['RefId']] || '') === data.refId) {
        rowIndex = i + 1;
        break;
      }
    }
  }
  
  if (rowIndex > 0) {
    invoicesSheet.getRange(rowIndex, colIndex['ManualOverrideJson'] + 1).setValue(data.newValueJson || '{}');
    invoicesSheet.getRange(rowIndex, colIndex['ManualEditedAt'] + 1).setValue(data.editedAt || new Date().toISOString());
    invoicesSheet.getRange(rowIndex, colIndex['ManualEditedBy'] + 1).setValue(data.editedBy || 'SYSTEM');
    invoicesSheet.getRange(rowIndex, colIndex['ManualLock'] + 1).setValue(true);
    invoicesSheet.getRange(rowIndex, colIndex['UpdatedAt'] + 1).setValue(new Date().toISOString());
  }
  
  return { success: true, message: 'Đã lưu chỉnh sửa thủ công và khóa hóa đơn.' };
}

function _tryOpenShiftAction(data) {
  const val = _validateMetadata(data, 'tryOpenShift');
  if (val && !val.success) return val;

  const shiftNumber = String(data.shiftNumber || '');
  if (shiftNumber !== '1' && shiftNumber !== '2') {
    return { success: false, message: 'Số ca không hợp lệ. Chỉ cho phép Ca 1 hoặc Ca 2.' };
  }

  const workDay = data.date || '';
  if (!workDay) return { success: false, message: 'Thiếu ngày làm việc.' };

  const shiftKey = workDay + '_' + shiftNumber;
  const shiftId = 'shift_' + shiftKey;
  const clientRequestId = data.clientRequestId || '';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, không thể lấy khóa mở ca. Vui lòng thử lại.' };
  }

  try {
    _autoMarkStaleShifts();

    const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
    
    if (clientRequestId) {
      const duplicate = registryRows.find(r => r.lastMutationId === clientRequestId);
      if (duplicate) {
        const shifts = _getSheetData('KG_SHIFTS');
        const existingShift = shifts.find(s => s.id === duplicate.shiftId);
        let shiftData = {};
        if (existingShift && existingShift.jsonData) {
          try { shiftData = JSON.parse(existingShift.jsonData); } catch(ex) {}
        }
        return { success: true, message: 'Yêu cầu mở ca trùng lặp. Đang khôi phục ca hiện tại.', shift: shiftData, shiftId: duplicate.shiftId };
      }
    }

    const activeOpen = registryRows.find(r => r.shiftKey === shiftKey && r.status === 'open');
    if (activeOpen) {
      return { success: false, code: 'SHIFT_ALREADY_OPEN', message: 'Ca ' + shiftNumber + ' ngày ' + workDay + ' đang được mở trên thiết bị khác.', shift: activeOpen };
    }

    const activeClosed = registryRows.find(r => r.shiftKey === shiftKey && r.status === 'closed');
    if (activeClosed) {
      return { success: false, code: 'SHIFT_ALREADY_CLOSED', message: 'Ca ' + shiftNumber + ' ngày ' + workDay + ' đã đóng. Hãy dùng chức năng Mở lại ca.' };
    }

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
      nowStr,
      '',
      data.source || '',
      data.origin || '',
      data.host || '',
      data.environment || '',
      data.deviceId || '',
      data.sessionId || '',
      data.cashierName || '',
      clientRequestId,
      1,
      nowStr,
      data.notes || ''
    ];
    _sheetsAppend('KG_SHIFT_REGISTRY', [registryRow]);

    data.id = shiftId;
    data.version = 1;
    data.status = 'open';
    data.startTime = nowStr;
    _syncLegacyShift(data, 'open');

    _addAuditLog({ user: data.cashierName, action: 'OPEN_SHIFT', details: 'Mở ca ' + shiftNumber + ' ngày ' + workDay });

    return { success: true, message: 'Đã mở ca thành công.', shiftId: shiftId, shift: data };

  } finally {
    lock.releaseLock();
  }
}

function _closeShiftAtomicAction(data) {
  const val = _validateMetadata(data, 'closeShiftAtomic');
  if (val && !val.success) return val;

  const shiftData = data.shift || {};
  const shiftId = shiftData.id;
  if (!shiftId) {
    return { success: false, message: 'Thiếu shift ID.' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: 'Hệ thống bận, vui lòng thử lại sau.' };
  }

  try {
    const registryRows = _getSheetData('KG_SHIFT_REGISTRY');
    const registryEntry = registryRows.find(r => r.shiftId === shiftId);
    
    if (!registryEntry) {
      return { success: false, message: 'Ca làm việc chưa được đăng ký trên hệ thống.' };
    }

    if (registryEntry.status === 'cancelled' || registryEntry.status === 'voided') {
      return { success: false, message: 'Ca làm việc đã bị hủy/thu hồi.' };
    }

    const currentVersion = parseInt(registryEntry.revision || '1');
    const clientVersion = parseInt(data.version || shiftData.version || 1);

    if (registryEntry.status === 'closed') {
      if (clientVersion > currentVersion) {
        _syncLegacyShift(shiftData, 'closed');
        
        const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
        let rowIndex = -1;
        const allRows = _sheetsGet('KG_SHIFT_REGISTRY');
        for (let i = 1; i < allRows.length; i++) {
          if (allRows[i][1] === shiftId) { rowIndex = i + 1; break; }
        }
        if (rowIndex > 0) {
          registrySheet.getRange(rowIndex, 18, 1, 2).setValues([[clientVersion, new Date().toISOString()]]);
        }
        return { success: true, message: 'Đã cập nhật ca làm việc đã đóng.', isClosed: true };
      }
      return { success: true, message: 'Ca làm việc đã đóng từ trước.', isClosed: true };
    }

    const endTime = data.closedAt || shiftData.endTime || new Date().toISOString();
    shiftData.endTime = endTime;
    _syncLegacyShift(shiftData, 'closed');

    const registrySheet = _getSheet('KG_SHIFT_REGISTRY');
    let rowIndex = -1;
    const allRows = _sheetsGet('KG_SHIFT_REGISTRY');
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][1] === shiftId) { rowIndex = i + 1; break; }
    }

    if (rowIndex > 0) {
      registrySheet.getRange(rowIndex, 5).setValue('closed');
      registrySheet.getRange(rowIndex, 9).setValue(endTime);
      registrySheet.getRange(rowIndex, 18, 1, 2).setValues([[clientVersion, new Date().toISOString()]]);
    }

    _addAuditLog({ 
      user: shiftData.cashierName || 'SYSTEM', 
      action: 'CLOSE_SHIFT', 
      details: 'Đóng ca ' + (shiftData.shiftNumber || '') + ' ngày ' + (shiftData.date || '') 
    });

    return { success: true, message: 'Đóng ca thành công.', isClosed: true };
  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════
//  UPGRADED CLOUD-FIRST CUKCUK INTEGRATION SERVICE & SCHEMAS
// ══════════════════════════════════════════════════════════════

const NEW_INVOICES_HEADERS = [
  'invoiceKey', 'cukcukInvoiceId', 'cukcukRefNo', 'branchId', 'branchName', 'workDate', 'businessDate', 
  'invoiceTime', 'createdTime', 'modifiedTime', 'tableName', 'customerName', 'guestCount', 'totalAmount', 
  'discountAmount', 'serviceCharge', 'vatAmount', 'finalAmount', 'paymentMethod', 'paymentStatus', 
  'paymentRawJson', 'itemsJson', 'sourceRawJson', 'manualOverride', 'overrideAt', 'overrideBy', 
  'overrideReason', 'overrideFieldsJson', 'syncBatchId', 'lastSyncedAt', 'syncStatus', 'syncError', 
  'shiftId', 'sessionId', 'cashierName', 'isDeleted', 'deletedAt', 'note', 'createdAt', 'updatedAt'
];

const NEW_OVERRIDES_HEADERS = [
  'overrideId', 'invoiceKey', 'cukcukInvoiceId', 'workDate', 'fieldName', 'oldValue', 'newValue', 
  'reason', 'overrideBy', 'overrideAt', 'deviceId', 'sessionId', 'shiftId', 'clientSnapshotJson', 
  'serverSnapshotJson', 'status', 'note'
];

const NEW_SYNC_LOGS_HEADERS = [
  'syncBatchId', 'workDate', 'fromTime', 'toTime', 'triggeredBy', 'triggerSource', 'startedAt', 'finishedAt', 
  'durationMs', 'totalFetched', 'totalInserted', 'totalUpdated', 'totalSkippedManualOverride', 'totalDeletedMarked', 
  'totalErrors', 'status', 'errorMessage', 'requestId', 'tokenRefreshed', 'apiCallCount', 'note'
];

const NEW_CONFIG_HEADERS = [
  'key', 'value', 'description', 'updatedAt', 'updatedBy'
];

/**
 * Centered service class for CUKCUK authentication, paging fetches, and retry controls.
 */
const CukcukService = {
  getAccessToken: function() {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty('CUKCUK_ACCESS_TOKEN');
  },
  
  saveTokenInfo: function(accessToken, expiresAt, companyCode) {
    const props = PropertiesService.getScriptProperties();
    if (accessToken) props.setProperty('CUKCUK_ACCESS_TOKEN', accessToken);
    if (expiresAt) props.setProperty('CUKCUK_TOKEN_EXPIRES_AT', String(expiresAt));
    if (companyCode) props.setProperty('CUKCUK_COMPANY_CODE', companyCode);
  },

  refreshAccessTokenIfNeeded: function(force) {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('CUKCUK_ACCESS_TOKEN');
    const expiresAt = Number(props.getProperty('CUKCUK_TOKEN_EXPIRES_AT') || 0);
    const companyCode = props.getProperty('CUKCUK_COMPANY_CODE');
    
    const now = Date.now();
    // Refresh if no token, expired, or expiring in less than 5 minutes
    if (!token || now >= (expiresAt - 5 * 60 * 1000) || force) {
      const domain = props.getProperty('CUKCUK_DOMAIN') || '';
      const appId = props.getProperty('CUKCUK_APP_ID') || '';
      const secretKey = props.getProperty('CUKCUK_SECRET_KEY') || '';
      
      if (!domain || !appId || !secretKey) {
        throw new Error('Thiếu cấu hình CUKCUK trong Script Properties (CUKCUK_DOMAIN, CUKCUK_APP_ID, CUKCUK_SECRET_KEY).');
      }
      
      // Use the correct signature-signed login function targeting graphapi.cukcuk.vn
      const loginRes = _loginCukcukInGas(appId, domain, secretKey);
      const access_token = loginRes.accessToken;
      const company_code = loginRes.companyCode;
      const expires_in = 23 * 60 * 60; // 23 hours safety margin for CUKCUK's 24h token TTL
      
      this.saveTokenInfo(access_token, now + expires_in * 1000, company_code);
      return { token: access_token, companyCode: company_code, refreshed: true };
    }
    
    return { token: token, companyCode: companyCode, refreshed: false };
  },
  
  _apiCall: function(path, options, loginInfo) {
    // Route CUKCUK API calls to the correct centralized domain
    const url = 'https://graphapi.cukcuk.vn' + path;
    
    const headers = {
      'Authorization': 'Bearer ' + loginInfo.token,
      'CompanyCode': loginInfo.companyCode,
      'Content-Type': 'application/json'
    };
    
    const params = {
      method: options.method || 'GET',
      headers: headers,
      muteHttpExceptions: true
    };
    if (options.body) {
      params.payload = options.body;
    }
    
    let attempt = 0;
    const maxRetry = 3;
    let delay = 1000;
    
    while (attempt < maxRetry) {
      try {
        const response = UrlFetchApp.fetch(url, params);
        const code = response.getResponseCode();
        const text = response.getContentText();
        
        if (code === 401) {
          // Token expired or invalid, trigger refresh
          const newLogin = this.refreshAccessTokenIfNeeded(true);
          headers['Authorization'] = 'Bearer ' + newLogin.token;
          headers['CompanyCode'] = newLogin.companyCode;
          params.headers = headers;
          
          // Retry immediately once with new token
          const retryResponse = UrlFetchApp.fetch(url, params);
          const retryCode = retryResponse.getResponseCode();
          const retryText = retryResponse.getContentText();
          if (retryCode !== 200) {
            throw new Error('CUKCUK API Retry HTTP Error: ' + retryCode + ' - ' + retryText);
          }
          return JSON.parse(retryText);
        }
        
        if (code === 200) {
          return JSON.parse(text);
        }
        
        // Handle concurrency or too many requests error 102
        if (text.indexOf('102') > -1 || code === 429) {
          Logger.log('[CUKCUK API 102/429] Busy, retrying in ' + delay + 'ms...');
          Utilities.sleep(delay);
          attempt++;
          delay *= 2;
          continue;
        }
        
        throw new Error('CUKCUK API HTTP Error: ' + code + ' - ' + text);
      } catch (e) {
        attempt++;
        if (attempt >= maxRetry) throw e;
        Logger.log('[CUKCUK API Error] attempt ' + attempt + ': ' + e.toString());
        Utilities.sleep(delay);
        delay *= 2;
      }
    }
    throw new Error('CUKCUK API call failed after max retries');
  },
  
  fetchInvoicesByDateRange: function(fromTime, toTime, loginInfo) {
    let page = 1;
    let allInvoices = [];
    let hasMore = true;
    const limit = 100;
    
    while (hasMore) {
      const body = {
        Page: page,
        Limit: limit,
        FromDate: fromTime,
        ToDate: toTime
      };
      
      const response = this._apiCall('/api/v1/sainvoices/paging', {
        method: 'POST',
        body: JSON.stringify(body)
      }, loginInfo);
      
      let items = [];
      if (response && response.Success && response.Data) {
        if (Array.isArray(response.Data)) items = response.Data;
        else if (response.Data.PageData) items = response.Data.PageData;
        else if (response.Data.Items) items = response.Data.Items;
      }
      
      if (items.length > 0) {
        allInvoices = allInvoices.concat(items);
        if (items.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }
    
    return allInvoices;
  },
  
  fetchInvoiceDetail: function(invoiceId, loginInfo) {
    const response = this._apiCall('/api/v1/sainvoices/' + invoiceId, {
      method: 'GET'
    }, loginInfo);
    
    if (response && response.Success && response.Data) {
      return response.Data;
    }
    return null;
  },

  fetchCategories: function(loginInfo) {
    const response = this._apiCall('/api/v1/categories/list?includeInactive=true', {
      method: 'GET'
    }, loginInfo);
    if (response && response.Success && Array.isArray(response.Data)) {
      return response.Data;
    }
    return [];
  },

  fetchInventoryItems: function(loginInfo) {
    let page = 1;
    let allItems = [];
    let hasMore = true;
    const limit = 100;
    
    while (hasMore) {
      const body = {
        Page: page,
        Limit: limit,
        includeInactive: true,
        IncludeInactive: true
      };
      
      const response = this._apiCall('/api/v1/inventoryitems/paging', {
        method: 'POST',
        body: JSON.stringify(body)
      }, loginInfo);
      
      let items = [];
      if (response && response.Success && response.Data) {
        if (Array.isArray(response.Data)) items = response.Data;
        else if (response.Data.PageData) items = response.Data.PageData;
        else if (response.Data.Items) items = response.Data.Items;
      }
      
      if (items.length > 0) {
        allItems = allItems.concat(items);
        if (items.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }
    
    return allItems;
  },
  
  normalizeInvoice: function(rawInvoice, rawDetail) {
    const refId = String(rawInvoice.RefId || rawInvoice.RefID || '');
    const refNo = rawInvoice.RefNo || '';
    
    // Parse payments
    const payments = (rawDetail && (rawDetail.SAInvoicePayments || rawDetail.Payments)) || [];
    let invCash = 0, invCard = 0, invTransfer = 0, invOther = 0;
    const paymentJsonList = [];
    
    payments.forEach(pmt => {
      const pmtAmount = pmt.Amount || 0;
      if (pmtAmount <= 0) return;
      
      const name = (pmt.PaymentName || '').toLowerCase();
      const type = pmt.PaymentType;
      let method = 'cash';
      let label = 'Tiền mặt';
      
      if (name.indexOf('mặt') !== -1 || name.indexOf('tiền mặt') !== -1 || name.indexOf('cash') !== -1) {
        method = 'cash'; label = 'Tiền mặt'; invCash += pmtAmount;
      } else if (name.indexOf('chuyển') !== -1 || name.indexOf('khoản') !== -1 || name.indexOf('ngân hàng') !== -1 || name.indexOf('bank') !== -1 || name.indexOf('transfer') !== -1) {
        method = 'transfer'; label = 'Chuyển khoản'; invTransfer += pmtAmount;
      } else if (name.indexOf('thẻ') !== -1 || name.indexOf('card') !== -1 || name.indexOf('visa') !== -1 || name.indexOf('master') !== -1) {
        method = 'card'; label = 'Thẻ'; invCard += pmtAmount;
      } else {
        switch (type) {
          case 1: method = 'cash'; label = 'Tiền mặt'; invCash += pmtAmount; break;
          case 2: method = 'card'; label = 'Thẻ'; invCard += pmtAmount; break;
          case 3: method = 'transfer'; label = 'Chuyển khoản'; invTransfer += pmtAmount; break;
          default: method = 'other'; label = pmt.PaymentName || 'Khác'; invOther += pmtAmount; break;
        }
      }
      paymentJsonList.push({ method: method, amount: pmtAmount, label: label });
    });
    
    let paymentMethodStr = 'Chưa thanh toán';
    if (paymentJsonList.length > 0) {
      paymentMethodStr = paymentJsonList.map(p => p.label).join(' + ');
    }
    
    // items JSON
    const itemsList = (rawDetail && (rawDetail.SAInvoiceDetails || rawDetail.Details)) || [];
    const itemsJsonList = itemsList.map(item => ({
      name: item.InventoryItemName || item.ItemName || item.Name || '',
      qty: item.Quantity || item.Qty || 1,
      price: item.UnitPrice || item.Price || 0,
      amount: item.Amount || 0,
      discount: item.DiscountAmount || 0
    }));
    
    const finalAmount = (invCash + invCard + invTransfer + invOther) || rawInvoice.Amount || 0;
    
    return {
      invoiceKey: refId,
      cukcukInvoiceId: refId,
      cukcukRefNo: refNo,
      branchId: rawInvoice.BranchID || rawInvoice.BranchId || '',
      branchName: rawInvoice.BranchName || '',
      workDate: '', // populated in sync handler
      businessDate: rawInvoice.RefDate ? rawInvoice.RefDate.split('T')[0] : '',
      invoiceTime: rawInvoice.RefDate || '',
      createdTime: rawInvoice.CreatedDate || '',
      modifiedTime: rawInvoice.ModifiedDate || '',
      tableName: rawInvoice.TableName || '',
      customerName: rawInvoice.CustomerName || '',
      guestCount: rawInvoice.NumberOfGuests || 0,
      totalAmount: rawInvoice.TotalAmount || finalAmount,
      discountAmount: rawInvoice.DiscountAmount || 0,
      serviceCharge: rawInvoice.ServiceChargeAmount || 0,
      vatAmount: rawInvoice.VATAmount || 0,
      finalAmount: finalAmount,
      paymentMethod: paymentMethodStr,
      paymentStatus: (rawInvoice.IsPaid === true || String(rawInvoice.IsPaid).toLowerCase() === 'true' || rawInvoice.PaymentStatus === 3 || String(rawInvoice.PaymentStatus) === '3') ? 'Thanh toán' : 'Chưa thanh toán',
      paymentRawJson: JSON.stringify(paymentJsonList),
      itemsJson: JSON.stringify(itemsJsonList),
      sourceRawJson: JSON.stringify(rawInvoice),
      manualOverride: false,
      overrideAt: '',
      overrideBy: '',
      overrideReason: '',
      overrideFieldsJson: '{}',
      isDeleted: rawInvoice.IsDeleted === true || String(rawInvoice.IsDeleted).toLowerCase() === 'true',
      deletedAt: (rawInvoice.IsDeleted === true) ? new Date().toISOString() : '',
      note: rawInvoice.Description || ''
    };
  }
};

/**
 * Initializes CUKCUK Configuration Sheet if it doesn't exist yet.
 */
function _initializeCukcukConfigSheet() {
  const headers = NEW_CONFIG_HEADERS;
  const sheet = _getSheet('KG_CUKCUK_CONFIG', headers);
  const rows = _getSheetData('KG_CUKCUK_CONFIG');
  if (rows.length === 0) {
    const defaultConfigs = [
      ['CUKCUK_WORKDAY_START_HOUR', '12', 'Giờ bắt đầu ngày làm việc để đồng bộ (12 = 12h trưa)', new Date().toISOString(), 'SYSTEM'],
      ['CUKCUK_WORKDAY_END_NEXT_DAY_HOUR', '6', 'Giờ kết thúc ngày làm việc vào sáng hôm sau (6 = 6h sáng)', new Date().toISOString(), 'SYSTEM'],
      ['CUKCUK_READ_MODE', 'GVIZ', 'Chế độ đọc dữ liệu hóa đơn về Webapp (GVIZ hoặc GAS_PROXY)', new Date().toISOString(), 'SYSTEM'],
      ['CUKCUK_SYNC_PAGE_SIZE', '100', 'Số lượng hóa đơn tải mỗi trang từ API', new Date().toISOString(), 'SYSTEM'],
      ['CUKCUK_MAX_RETRY', '3', 'Số lần tối đa gọi lại API khi gặp lỗi bận', new Date().toISOString(), 'SYSTEM'],
      ['CUKCUK_RETRY_DELAY_MS', '1000', 'Độ trễ cơ sở để retry (mili giây)', new Date().toISOString(), 'SYSTEM']
    ];
    _sheetsAppend('KG_CUKCUK_CONFIG', defaultConfigs);
  }
}

/**
 * Upgraded central backend action to execute the sync process.
 */
function _syncCukcukInvoicesAction(data) {
  const val = _validateMetadata(data, 'syncCukcukInvoices');
  if (val && !val.success) return val;

  const cache = CacheService.getScriptCache();
  const cacheKey = 'cukcuk_sync_active_' + (data.workDate || 'today');
  
  // Wait loop if another sync is running for this workDate
  let isRunning = cache.get(cacheKey);
  if (isRunning) {
    for (let attempt = 0; attempt < 25; attempt++) {
      Utilities.sleep(1000);
      isRunning = cache.get(cacheKey);
      if (!isRunning) {
        break;
      }
    }
    if (isRunning) {
      return {
        ok: true,
        action: 'syncCukcukInvoices',
        requestId: data.requestId || '',
        syncBatchId: 'skipped_concurrent',
        message: 'Hệ thống đang thực hiện đồng bộ hóa đơn CUKCUK từ một thiết bị khác. Vui lòng đợi trong giây lát.',
        data: {
          totalFetched: 0,
          totalInserted: 0,
          totalUpdated: 0,
          totalSkippedManualOverride: 0,
          totalDeletedMarked: 0,
          totalErrors: 0,
          durationMs: 0
        }
      };
    }
  }

  // Set the cache lock
  cache.put(cacheKey, 'true', 90); // 90 seconds timeout

  const startedAt = new Date();
  const syncBatchId = 'batch_' + Date.now().toString(36);
  const requestId = data.requestId || 'req_' + startedAt.getTime().toString(36);
  const forceMode = data.forceMode === true || 
                    data.forceDetail === true || 
                    String(data.forceMode).toLowerCase() === 'true' || 
                    String(data.forceDetail).toLowerCase() === 'true';
  const workDateStr = data.workDate || _getWorkingDayGas(startedAt);
  
  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedManualOverride = 0;
  let totalDeletedMarked = 0;
  let totalErrors = 0;
  let tokenRefreshed = false;
  let apiCallCount = 0;
  let status = 'SUCCESS';
  let errorMessage = '';

  try {
    // Ensure config exists
    _initializeCukcukConfigSheet();

    // 1. Refresh CUKCUK Token
    apiCallCount++;
    const loginInfo = CukcukService.refreshAccessTokenIfNeeded();
    if (loginInfo.refreshed) tokenRefreshed = true;

    // 2. Setup date boundaries
    const parts = workDateStr.split('-');
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const d = parseInt(parts[2]);
    
    const pad = function(n) { return n < 10 ? '0' + n : String(n); };
    const fromTime = y + '-' + pad(m + 1) + '-' + pad(d) + 'T12:00:00';
    
    const nextDay = new Date(y, m, d + 1);
    const toTime = nextDay.getFullYear() + '-' + pad(nextDay.getMonth() + 1) + '-' + pad(nextDay.getDate()) + 'T06:00:00';

    Logger.log('[GAS CUKCUK] Syncing ' + workDateStr + ' Window: ' + fromTime + ' -> ' + toTime);

    // 3. Fetch Invoices from CUKCUK
    apiCallCount++;
    const invoices = CukcukService.fetchInvoicesByDateRange(fromTime, toTime, loginInfo);

    // Filter CUKCUK invoices strictly within the target date range to prevent processing historical database dumps (e.g. sandbox data)
    const activeInvoices = invoices.filter(inv => {
      const refDateStr = inv.RefDate || inv.CreatedDate || '';
      if (!refDateStr) return false;
      try {
        const refTime = new Date(refDateStr.replace(' ', 'T')).getTime();
        const fromTimeMs = new Date(fromTime.replace(' ', 'T')).getTime();
        const toTimeMs = new Date(toTime.replace(' ', 'T')).getTime();
        return refTime >= fromTimeMs && refTime <= toTimeMs;
      } catch (e) {
        return false;
      }
    });
    totalFetched = activeInvoices.length;

    // 4. Initialize Sheets
    _getSheet('KG_CUKCUK_INVOICES', NEW_INVOICES_HEADERS);
    _getSheet('KG_CUKCUK_OVERRIDES', NEW_OVERRIDES_HEADERS);
    _getSheet('KG_CUKCUK_SYNC_LOGS', NEW_SYNC_LOGS_HEADERS);

    // 5. Pre-flight Read of existing invoices to determine which ones need detail fetches
    const preAllInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
    const preHeaders = preAllInvoices[0] || NEW_INVOICES_HEADERS;
    const preColIndex = {};
    preHeaders.forEach((h, idx) => { preColIndex[h] = idx; });

    const preInvoiceMap = {};
    for (let i = 1; i < preAllInvoices.length; i++) {
      const key = String(preAllInvoices[i][preColIndex['invoiceKey']] || '');
      if (key) {
        preInvoiceMap[key] = {
          manualOverride: preAllInvoices[i][preColIndex['manualOverride']] === true || String(preAllInvoices[i][preColIndex['manualOverride']]).toLowerCase() === 'true',
          modifiedTime: String(preAllInvoices[i][preColIndex['modifiedTime']] || ''),
          paymentRawJson: String(preAllInvoices[i][preColIndex['paymentRawJson']] || '')
        };
      }
    }

    // Filter which invoices need details fetched
    const invoicesToFetchDetails = [];
    const keysSeenInCurrentLoop = {};
    for (let i = 0; i < activeInvoices.length; i++) {
      const inv = activeInvoices[i];
      const key = String(inv.RefId || inv.RefID || '');
      if (!key) continue;

      if (keysSeenInCurrentLoop[key]) {
        continue;
      }
      keysSeenInCurrentLoop[key] = true;

      const existing = preInvoiceMap[key];

      // Skip manually overridden ones
      if (existing && existing.manualOverride && !forceMode) {
        totalSkippedManualOverride++;
        continue;
      }

      // Check if unmodified
      const extModified = existing ? existing.modifiedTime : '';
      const apiModified = String(inv.ModifiedDate || inv.ModifiedTime || '');
      const hasDetails = existing && existing.paymentRawJson && existing.paymentRawJson !== '{}' && existing.paymentRawJson !== '[]' && existing.paymentRawJson !== '';

      if (existing && extModified === apiModified && hasDetails && !forceMode) {
        continue;
      }

      invoicesToFetchDetails.push({ key: key, inv: inv });
    }

    // Fetch invoice details in parallel chunks
    const detailMap = {};
    if (invoicesToFetchDetails.length > 0) {
      const fetchHeaders = {
        'Authorization': 'Bearer ' + loginInfo.token,
        'CompanyCode': loginInfo.companyCode,
        'Content-Type': 'application/json'
      };

      const requests = invoicesToFetchDetails.map(item => ({
        url: 'https://graphapi.cukcuk.vn/api/v1/sainvoices/' + item.key,
        method: 'GET',
        headers: fetchHeaders,
        muteHttpExceptions: true
      }));

      // CHUNK_SIZE = 5, sleep 1000ms between chunks to prevent rate limit
      const CHUNK_SIZE = 5;
      const responses = [];
      Logger.log('[GAS CUKCUK] Fetching ' + requests.length + ' details in chunks of 5 with 1s sleep...');

      for (let k = 0; k < requests.length; k += CHUNK_SIZE) {
        const chunk = requests.slice(k, k + CHUNK_SIZE);
        apiCallCount += chunk.length;
        
        if (k > 0) {
          Utilities.sleep(1000); // 1s sleep to stay safe from urlfetch limit
        }

        const chunkResponses = UrlFetchApp.fetchAll(chunk);
        chunkResponses.forEach(r => {
          responses.push(r);
        });
      }

      for (let i = 0; i < invoicesToFetchDetails.length; i++) {
        const item = invoicesToFetchDetails[i];
        const resp = responses[i];
        if (!resp) continue;
        const code = resp.getResponseCode();
        const text = resp.getContentText();

        if (code === 200) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.Success && parsed.Data) {
              detailMap[item.key] = parsed.Data;
            } else {
              totalErrors++;
              Logger.log('[GAS CUKCUK] API error in detail for ' + item.key + ': ' + text);
            }
          } catch (e) {
            totalErrors++;
            Logger.log('[GAS CUKCUK] Parse detail failed for ' + item.key + ': ' + e.toString());
          }
        } else {
          totalErrors++;
          Logger.log('[GAS CUKCUK] Fetch detail failed for ' + item.key + ' HTTP code: ' + code);
        }
      }
    }

    // Now we enter the WRITE LOCK PHASE
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(20000); // Wait up to 20 seconds for database write lock
    if (!hasLock) {
      throw new Error('Không thể ghi dữ liệu do hàng đợi ghi bảng tính đang bận. Vui lòng thử lại.');
    }

    try {
      // Re-read existing invoices to get absolute latest row indices and prevent duplicates
      const freshAllInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
      const freshHeaders = freshAllInvoices[0] || NEW_INVOICES_HEADERS;
      const freshColIndex = {};
      freshHeaders.forEach((h, idx) => { freshColIndex[h] = idx; });

      const freshInvoiceMap = {};
      for (let i = 1; i < freshAllInvoices.length; i++) {
        const key = String(freshAllInvoices[i][freshColIndex['invoiceKey']] || '');
        if (key) {
          freshInvoiceMap[key] = {
            rowIndex: i + 1,
            manualOverride: freshAllInvoices[i][freshColIndex['manualOverride']] === true || String(freshAllInvoices[i][freshColIndex['manualOverride']]).toLowerCase() === 'true',
            modifiedTime: String(freshAllInvoices[i][freshColIndex['modifiedTime']] || ''),
            paymentRawJson: String(freshAllInvoices[i][freshColIndex['paymentRawJson']] || ''),
            row: freshAllInvoices[i]
          };
        }
      }

      const invoicesToAppend = [];
      const invoicesToUpdate = [];

      for (let i = 0; i < invoicesToFetchDetails.length; i++) {
        const item = invoicesToFetchDetails[i];
        const inv = item.inv;
        const key = item.key;
        const detail = detailMap[key];

        if (!detail) continue;

        const existing = freshInvoiceMap[key];

        // Double-check skip manual override
        if (existing && existing.manualOverride && !forceMode) {
          continue;
        }

        // Double-check duplicate avoidance
        const extModified = existing ? existing.modifiedTime : '';
        const apiModified = String(inv.ModifiedDate || inv.ModifiedTime || '');
        const hasDetails = existing && existing.paymentRawJson && existing.paymentRawJson !== '{}' && existing.paymentRawJson !== '[]' && existing.paymentRawJson !== '';

        if (existing && extModified === apiModified && hasDetails && !forceMode) {
          continue;
        }

        const normalized = CukcukService.normalizeInvoice(inv, detail);
        normalized.workDate = workDateStr;
        normalized.syncBatchId = syncBatchId;
        normalized.lastSyncedAt = new Date().toISOString();
        
        if (normalized.isDeleted) {
          totalDeletedMarked++;
        }

        const newRow = new Array(freshHeaders.length).fill('');
        freshHeaders.forEach((h, idx) => {
          newRow[idx] = normalized[h] !== undefined ? normalized[h] : '';
        });

        if (existing) {
          newRow[freshColIndex['createdAt']] = existing.row[freshColIndex['createdAt']] || normalized.createdAt || new Date().toISOString();
          newRow[freshColIndex['updatedAt']] = new Date().toISOString();

          invoicesToUpdate.push({
            rowIndex: existing.rowIndex,
            rangeEndLetter: _colLetter(freshHeaders.length),
            rowData: newRow
          });
          totalUpdated++;
        } else {
          newRow[freshColIndex['createdAt']] = new Date().toISOString();
          newRow[freshColIndex['updatedAt']] = new Date().toISOString();
          invoicesToAppend.push(newRow);
          totalInserted++;
        }
      }

      // Write to Sheet
      if (invoicesToAppend.length > 0) {
        _sheetsAppend('KG_CUKCUK_INVOICES', invoicesToAppend);
      }
      if (invoicesToUpdate.length > 0) {
        _sheetsBatchUpdate('KG_CUKCUK_INVOICES', invoicesToUpdate);
      }
    } finally {
      lock.releaseLock();
    }

  } catch (e) {
    status = 'FAILED';
    errorMessage = e.toString();
    Logger.log('[GAS CUKCUK Sync Error] ' + errorMessage);
  } finally {
    // Clear the active cache lock
    cache.remove(cacheKey);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // Log the sync batch
  try {
    const syncLogRow = [
      syncBatchId,
      workDateStr,
      data.fromDate || '',
      data.toDate || '',
      data.cashierName || 'SYSTEM',
      data.triggerSource || 'webapp',
      startedAt.toISOString(),
      finishedAt.toISOString(),
      durationMs,
      totalFetched,
      totalInserted,
      totalUpdated,
      totalSkippedManualOverride,
      totalDeletedMarked,
      totalErrors,
      status,
      errorMessage,
      requestId,
      tokenRefreshed ? 'TRUE' : 'FALSE',
      apiCallCount,
      data.note || ''
    ];
    _sheetsAppend('KG_CUKCUK_SYNC_LOGS', [syncLogRow]);
  } catch (logErr) {
    Logger.log('[GAS CUKCUK Log Error] ' + logErr.toString());
  }

  return {
    success: status === 'SUCCESS',
    ok: status === 'SUCCESS',
    action: 'syncCukcukInvoices',
    requestId: requestId,
    syncBatchId: syncBatchId,
    message: status === 'SUCCESS' ? 'Đồng bộ hoàn tất' : ('Lỗi đồng bộ: ' + errorMessage),
    data: {
      totalFetched: totalFetched,
      totalInserted: totalInserted,
      totalUpdated: totalUpdated,
      totalSkippedManualOverride: totalSkippedManualOverride,
      totalDeletedMarked: totalDeletedMarked,
      totalErrors: totalErrors,
      durationMs: durationMs
    },
    error: status === 'FAILED' ? { code: 'UNKNOWN_ERROR', detail: errorMessage, retryable: true } : null
  };
}

/**
 * Synchronizes categories and inventory items from CUKCUK into Google Sheets and configuration.
 */
function _syncCukcukMenuAction(data) {
  const val = _validateMetadata(data, 'syncCukcukMenu');
  if (val && !val.success) return val;

  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(15000); // 15s wait timeout
  if (!hasLock) {
    return {
      success: false,
      message: 'Hệ thống đang bận đồng bộ dữ liệu CUKCUK. Vui lòng thử lại sau.'
    };
  }

  try {
    // 1. Refresh CUKCUK Token
    const loginInfo = CukcukService.refreshAccessTokenIfNeeded();

    // 2. Fetch categories
    const categories = CukcukService.fetchCategories(loginInfo);
    const catMap = {};
    categories.forEach(c => {
      catMap[String(c.InventoryItemCategoryID || c.Id || c.CategoryID || '')] = c.InventoryItemCategoryName || c.Name || '';
    });

    // 3. Fetch inventory items
    const apiItems = CukcukService.fetchInventoryItems(loginInfo);

    // 4. Update KG_ITEM_CATEGORY_MAP sheet
    const catMapSheet = _getSheet('KG_ITEM_CATEGORY_MAP', CATEGORY_MAP_HEADERS);
    const existingMapRows = _sheetsGet('KG_ITEM_CATEGORY_MAP');
    const existingHeader = existingMapRows[0] || CATEGORY_MAP_HEADERS;
    const itemColIndex = {};
    existingHeader.forEach((h, idx) => { itemColIndex[h] = idx; });

    const itemMap = {};
    for (let i = 1; i < existingMapRows.length; i++) {
      const itemId = String(existingMapRows[i][itemColIndex['ItemID']] || '');
      if (itemId) {
        itemMap[itemId] = {
          rowIndex: i + 1,
          row: existingMapRows[i]
        };
      }
    }

    const mapRowsToAppend = [];
    const mapRowsToUpdate = [];
    const nowStr = new Date().toISOString();

    apiItems.forEach(item => {
      const itemId = String(item.InventoryItemID || item.ItemID || item.Id || '');
      if (!itemId) return;

      const itemCode = item.InventoryItemCode || item.ItemCode || '';
      const itemName = item.InventoryItemName || item.ItemName || '';
      const categoryId = String(item.InventoryItemCategoryID || item.CategoryID || '');
      const categoryName = item.InventoryItemCategoryName || catMap[categoryId] || item.CategoryName || '';
      const inactive = item.Inactive === true || String(item.Inactive).toLowerCase() === 'true';

      // Determine if drink or food
      let isDrink = false;
      let isFood = true;

      const lowerName = itemName.toLowerCase();
      const lowerCat = categoryName.toLowerCase();
      if (lowerCat.indexOf('uống') > -1 || lowerCat.indexOf('nước') > -1 || lowerCat.indexOf('bia') > -1 || lowerCat.indexOf('ngọt') > -1 || lowerCat.indexOf('rượu') > -1 || lowerCat.indexOf('cà phê') > -1 || lowerCat.indexOf('cafe') > -1 || lowerCat.indexOf('sinh tố') > -1 || lowerCat.indexOf('trà') > -1) {
        isDrink = true; isFood = false;
      } else if (lowerName.indexOf('nước') > -1 || lowerName.indexOf('bia') > -1 || lowerName.indexOf('coca') > -1 || lowerName.indexOf('pepsi') > -1 || lowerName.indexOf('rượu') > -1 || lowerName.indexOf('redbull') > -1 || lowerName.indexOf('sting') > -1 || lowerName.indexOf('trà') > -1 || lowerName.indexOf('cafe') > -1 || lowerName.indexOf('chai') > -1 || lowerName.indexOf('lon') > -1) {
        isDrink = true; isFood = false;
      }

      const existing = itemMap[itemId];
      const newRow = new Array(CATEGORY_MAP_HEADERS.length).fill('');
      
      newRow[itemColIndex['ItemID']] = itemId;
      newRow[itemColIndex['ItemCode']] = itemCode;
      newRow[itemColIndex['ItemName']] = itemName;
      newRow[itemColIndex['CategoryName']] = categoryName;
      newRow[itemColIndex['IsDrink']] = isDrink ? 'TRUE' : 'FALSE';
      newRow[itemColIndex['IsFood']] = isFood ? 'TRUE' : 'FALSE';
      
      if (existing) {
        // Preserve manual fields
        newRow[itemColIndex['InventoryProductId']] = existing.row[itemColIndex['InventoryProductId']] || '';
        newRow[itemColIndex['Aliases']] = existing.row[itemColIndex['Aliases']] || '';
        newRow[itemColIndex['UpdatedBy']] = existing.row[itemColIndex['UpdatedBy']] || 'SYSTEM';
        newRow[itemColIndex['UpdatedAt']] = nowStr;

        // Compare if we actually need to write updates to avoid slow updates
        let changed = false;
        for (let j = 0; j < newRow.length; j++) {
          if (String(newRow[j]) !== String(existing.row[j])) {
            changed = true;
            break;
          }
        }
        if (changed) {
          mapRowsToUpdate.push({
            rowIndex: existing.rowIndex,
            rangeEndLetter: _colLetter(CATEGORY_MAP_HEADERS.length),
            rowData: newRow
          });
        }
      } else {
        newRow[itemColIndex['InventoryProductId']] = '';
        newRow[itemColIndex['Aliases']] = itemCode.toLowerCase() + ',' + itemName.toLowerCase();
        newRow[itemColIndex['UpdatedBy']] = 'SYSTEM';
        newRow[itemColIndex['UpdatedAt']] = nowStr;
        mapRowsToAppend.push(newRow);
      }
    });

    if (mapRowsToAppend.length > 0) {
      _sheetsAppend('KG_ITEM_CATEGORY_MAP', mapRowsToAppend);
    }
    if (mapRowsToUpdate.length > 0) {
      _sheetsBatchUpdate('KG_ITEM_CATEGORY_MAP', mapRowsToUpdate);
    }

    // 5. Merge items into KG_CONFIG's "products" JSON array
    const configHeaders = ['key', 'jsonValue', 'updatedAt'];
    const configSheet = _getSheet('KG_CONFIG', configHeaders);
    const configRows = _getSheetData('KG_CONFIG');
    
    let productsList = [];
    let productsRowIndex = -1;
    for (let i = 0; i < configRows.length; i++) {
      if (configRows[i].key === 'products') {
        productsRowIndex = i + 2; // +1 header, +1 1-indexed
        try {
          productsList = JSON.parse(configRows[i].jsonValue);
        } catch (e) {
          productsList = [];
        }
        break;
      }
    }

    if (!Array.isArray(productsList)) {
      productsList = [];
    }

    apiItems.forEach(item => {
      const itemId = String(item.InventoryItemID || item.ItemID || item.Id || '');
      if (!itemId) return;

      const inactive = item.Inactive === true || String(item.Inactive).toLowerCase() === 'true';
      const itemName = item.InventoryItemName || item.ItemName || '';
      const itemCode = item.InventoryItemCode || item.ItemCode || '';
      const categoryId = String(item.InventoryItemCategoryID || item.CategoryID || '');
      const categoryName = item.InventoryItemCategoryName || catMap[categoryId] || item.CategoryName || '';
      const unitName = item.UnitName || 'lon';

      // Check if it is a drink
      let isDrink = false;
      const lowerName = itemName.toLowerCase();
      const lowerCat = categoryName.toLowerCase();
      if (lowerCat.indexOf('uống') > -1 || lowerCat.indexOf('nước') > -1 || lowerCat.indexOf('bia') > -1 || lowerCat.indexOf('ngọt') > -1 || lowerCat.indexOf('rượu') > -1 || lowerCat.indexOf('cà phê') > -1 || lowerCat.indexOf('cafe') > -1 || lowerCat.indexOf('sinh tố') > -1 || lowerCat.indexOf('trà') > -1) {
        isDrink = true;
      } else if (lowerName.indexOf('nước') > -1 || lowerName.indexOf('bia') > -1 || lowerName.indexOf('coca') > -1 || lowerName.indexOf('pepsi') > -1 || lowerName.indexOf('rượu') > -1 || lowerName.indexOf('redbull') > -1 || lowerName.indexOf('sting') > -1 || lowerName.indexOf('trà') > -1 || lowerName.indexOf('cafe') > -1 || lowerName.indexOf('chai') > -1 || lowerName.indexOf('lon') > -1) {
        isDrink = true;
      }

      // We only care about drinks for Drink Inventory catalog
      if (!isDrink) return;

      // Find matching product in current products list
      let matchedProd = null;
      for (let j = 0; j < productsList.length; j++) {
        const p = productsList[j];
        if (p.cukcukItemId === itemId || p.id === itemId || p.id === 'cuk_' + itemId) {
          matchedProd = p;
          break;
        }
        if (p.itemCode === itemCode && itemCode) {
          matchedProd = p;
          break;
        }
        const nameLower = p.name.toLowerCase();
        if (nameLower === lowerName) {
          matchedProd = p;
          break;
        }
        if (Array.isArray(p.cukcukAliases) && p.cukcukAliases.some(a => a.toLowerCase() === lowerName)) {
          matchedProd = p;
          break;
        }
      }

      if (matchedProd) {
        // Update details from CUKCUK
        matchedProd.name = itemName;
        matchedProd.category = categoryName;
        matchedProd.unit = unitName;
        matchedProd.cukcukItemId = itemId;
        matchedProd.itemCode = itemCode;
        matchedProd.active = !inactive;
        if (!Array.isArray(matchedProd.cukcukAliases)) {
          matchedProd.cukcukAliases = [itemName.toLowerCase()];
        } else if (!matchedProd.cukcukAliases.some(a => a.toLowerCase() === lowerName)) {
          matchedProd.cukcukAliases.push(itemName.toLowerCase());
        }
      } else if (!inactive) {
        // Create new product for active drinks
        productsList.push({
          id: 'cuk_' + itemId,
          name: itemName,
          category: categoryName,
          unit: unitName,
          emoji: lowerCat.indexOf('bia') > -1 ? '🍺' : (lowerCat.indexOf('rượu') > -1 ? '🍶' : '🥤'),
          active: true,
          sort: productsList.length + 1,
          volume: '',
          caseSize: 24,
          caseSizeUnit: unitName,
          cukcukAliases: [itemName.toLowerCase()],
          cukcukItemId: itemId,
          itemCode: itemCode
        });
      }
    });

    // Write back to KG_CONFIG
    const configValueStr = JSON.stringify(productsList);
    if (productsRowIndex > -1) {
      configSheet.getRange(productsRowIndex, 2).setValue(configValueStr);
      configSheet.getRange(productsRowIndex, 3).setValue(nowStr);
    } else {
      _sheetsAppend('KG_CONFIG', [['products', configValueStr, nowStr]]);
    }

    return {
      success: true,
      message: 'Đồng bộ thực đơn thành công',
      products: productsList
    };

  } catch (e) {
    Logger.log('[GAS CUKCUK Menu Sync Error] ' + e.toString());
    return {
      success: false,
      message: 'Lỗi đồng bộ: ' + e.toString()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Loads JSON invoices from Sheets for a given workDate.
 */
function _loadCukcukInvoicesAction(data) {
  try {
    let invoices = [];
    if (data.workDate) {
      const monthKey = data.workDate.substring(0, 7);
      // Try to load from Month JSON chunks first
      const cached = loadMonthJsonFast(monthKey);
      if (cached && cached.invoices) {
        invoices = cached.invoices.filter(function(r) { return r.workDate === data.workDate; });
      } else {
        // Fallback to monthly raw sheet
        const sheetName = 'KG_CUKCUK_INV_' + monthKey.replace('-', '_');
        const rows = _getSheetData(sheetName);
        invoices = rows.filter(function(r) { return r.workDate === data.workDate; });
      }
    } else {
      // If we have fromDate/toDate
      let startMonth = data.fromDate ? data.fromDate.substring(0, 7) : '';
      let endMonth = data.toDate ? data.toDate.substring(0, 7) : '';
      // Fallback to current month if not specified
      if (!startMonth) startMonth = _getWorkingDayGas(new Date()).substring(0, 7);
      if (!endMonth) endMonth = startMonth;
      
      // Get all month keys in range
      const months = [];
      let current = new Date(startMonth + '-01');
      const end = new Date(endMonth + '-01');
      while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        months.push(y + '-' + m);
        current.setMonth(current.getMonth() + 1);
      }
      
      months.forEach(function(mKey) {
        const cached = loadMonthJsonFast(mKey);
        if (cached && cached.invoices) {
          invoices = invoices.concat(cached.invoices);
        } else {
          const sheetName = 'KG_CUKCUK_INV_' + mKey.replace('-', '_');
          const rows = _getSheetData(sheetName);
          invoices = invoices.concat(rows);
        }
      });
      
      if (data.fromDate) {
        invoices = invoices.filter(function(r) { return r.invoiceTime >= data.fromDate || r.workDate >= data.fromDate; });
      }
      if (data.toDate) {
        invoices = invoices.filter(function(r) { return r.invoiceTime <= data.toDate || r.workDate <= data.toDate; });
      }
    }
    
    // Sort from oldest to newest by invoiceTime
    invoices.sort(function(a, b) { return (a.invoiceTime || '').localeCompare(b.invoiceTime || ''); });
    
    // Map V4 invoice attributes to the format expected by the frontend
    const mapped = invoices.map(function(r) {
      return {
        invoiceKey: r.invoiceKey || r.refId || '',
        cukcukInvoiceId: r.cukcukInvoiceId || r.refId || '',
        cukcukRefNo: r.cukcukRefNo || r.refNo || '',
        branchId: r.branchId || '',
        branchName: r.branchName || '',
        workDate: r.workDate || '',
        invoiceTime: r.invoiceTime || r.refDate || '',
        tableName: r.tableName || '',
        customerName: r.customerName || '',
        totalAmount: Number(r.totalAmount || r.amount || 0),
        discountAmount: Number(r.discountAmount || 0),
        serviceCharge: Number(r.serviceCharge || 0),
        vatAmount: Number(r.vatAmount || 0),
        finalAmount: Number(r.finalAmount || r.amount || 0),
        paidAmount: Number(r.paidAmount || r.amount || 0),
        cashAmount: Number(r.cashAmount || 0),
        transferAmount: Number(r.transferAmount || 0),
        cardAmount: Number(r.cardAmount || 0),
        otherAmount: Number(r.otherAmount || 0),
        paymentMethod: r.paymentMethod || '',
        paymentStatus: r.paymentStatus || (r.isPaid ? 'Thanh toán' : 'Chưa thanh toán'),
        paymentRawJson: typeof r.paymentRawJson === 'string' ? r.paymentRawJson : JSON.stringify(r.payments || []),
        itemsJson: typeof r.itemsJson === 'string' ? r.itemsJson : JSON.stringify(r.items || []),
        sourceRawJson: r.sourceRawJson || '{}',
        manualOverride: r.manualOverride === true || r.manualOverride === 'true',
        overrideAt: r.overrideAt || '',
        overrideBy: r.overrideBy || '',
        overrideReason: r.overrideReason || '',
        auditJson: typeof r.auditJson === 'string' ? r.auditJson : JSON.stringify(r.auditTrail || []),
        createdAt: r.createdAt || '',
        updatedAt: r.updatedAt || ''
      };
    });
    
    return {
      ok: true,
      action: 'loadCukcukInvoices',
      message: 'Tải hóa đơn thành công',
      data: {
        invoices: mapped,
        total: mapped.length
      },
      error: null
    };
  } catch (e) {
    return {
      ok: false,
      action: 'loadCukcukInvoices',
      message: 'Không thể tải hóa đơn: ' + e.toString(),
      error: { code: 'SHEET_WRITE_FAILED', detail: e.toString(), retryable: true }
    };
  }
}

/**
 * Saves manual overrides for specific fields of a CUKCUK invoice.
 */
function _overrideCukcukInvoiceAction(data) {
  const val = _validateMetadata(data, 'overrideCukcukInvoice');
  if (val && !val.success) return val;

  const key = data.invoiceId || data.invoiceKey || data.refId;
  if (!key) {
    return { ok: false, action: 'overrideCukcukInvoice', message: 'Thiếu invoiceKey', error: { code: 'UNKNOWN_ERROR', detail: 'Missing invoiceKey' } };
  }
  
  const workDate = data.workDate || '';
  
  try {
    _getSheet('KG_CUKCUK_INVOICES', NEW_INVOICES_HEADERS);
    _getSheet('KG_CUKCUK_OVERRIDES', NEW_OVERRIDES_HEADERS);
    
    const invoicesSheet = _getSheet('KG_CUKCUK_INVOICES');
    const allInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
    let rowIndex = -1;
    const colIndex = {};
    
    if (allInvoices && allInvoices.length > 0) {
      allInvoices[0].forEach((h, idx) => { colIndex[h] = idx; });
      for (let i = 1; i < allInvoices.length; i++) {
        if (String(allInvoices[i][colIndex['invoiceKey']] || '') === key) {
          rowIndex = i + 1;
          break;
        }
      }
    }
    
    if (rowIndex === -1) {
      return { ok: false, action: 'overrideCukcukInvoice', message: 'Không tìm thấy hóa đơn cần chỉnh sửa trên Sheet', error: { code: 'UNKNOWN_ERROR', detail: 'Invoice not found on sheet' } };
    }
    
    const oldRow = allInvoices[rowIndex - 1];
    
    // Support legacy saveCukcukOverride parameter mapping
    let changedFields = data.changedFields;
    if (!changedFields && data.newValueJson) {
      try {
        changedFields = JSON.parse(data.newValueJson);
      } catch(ex) {
        changedFields = {};
      }
    }
    if (!changedFields) changedFields = {};
    
    const overrideId = data.overrideId || ('ovr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    
    // Prepare log fields
    const overrideRow = [
      overrideId,
      key,
      oldRow[colIndex['cukcukInvoiceId']] || '',
      workDate || oldRow[colIndex['workDate']] || '',
      Object.keys(changedFields).join(','),
      JSON.stringify(Object.keys(changedFields).reduce((acc, f) => { acc[f] = oldRow[colIndex[f]] || ''; return acc; }, {})),
      JSON.stringify(changedFields),
      data.reason || data.overrideReason || '',
      data.cashierName || data.overrideBy || data.editedBy || 'SYSTEM',
      new Date().toISOString(),
      data.deviceId || '',
      data.sessionId || '',
      data.shiftId || '',
      data.clientSnapshotJson || '{}',
      JSON.stringify(oldRow),
      'SUCCESS',
      ''
    ];
    
    _sheetsAppend('KG_CUKCUK_OVERRIDES', [overrideRow]);
    
    // Update invoice row
    invoicesSheet.getRange(rowIndex, colIndex['manualOverride'] + 1).setValue(true);
    invoicesSheet.getRange(rowIndex, colIndex['overrideAt'] + 1).setValue(new Date().toISOString());
    invoicesSheet.getRange(rowIndex, colIndex['overrideBy'] + 1).setValue(data.cashierName || data.overrideBy || data.editedBy || 'SYSTEM');
    invoicesSheet.getRange(rowIndex, colIndex['overrideReason'] + 1).setValue(data.reason || data.overrideReason || '');
    invoicesSheet.getRange(rowIndex, colIndex['overrideFieldsJson'] + 1).setValue(JSON.stringify(changedFields));
    
    // Apply changes (paymentMethod, paymentStatus, finalAmount, note)
    if (changedFields.paymentMethod !== undefined) {
      invoicesSheet.getRange(rowIndex, colIndex['paymentMethod'] + 1).setValue(changedFields.paymentMethod);
    }
    if (changedFields.paymentStatus !== undefined) {
      invoicesSheet.getRange(rowIndex, colIndex['paymentStatus'] + 1).setValue(changedFields.paymentStatus);
    }
    if (changedFields.finalAmount !== undefined) {
      invoicesSheet.getRange(rowIndex, colIndex['finalAmount'] + 1).setValue(Number(changedFields.finalAmount) || 0);
    }
    if (changedFields.note !== undefined) {
      invoicesSheet.getRange(rowIndex, colIndex['note'] + 1).setValue(changedFields.note);
    }
    
    invoicesSheet.getRange(rowIndex, colIndex['updatedAt'] + 1).setValue(new Date().toISOString());
    
    return {
      ok: true,
      action: 'overrideCukcukInvoice',
      message: 'Cập nhật chỉnh sửa thủ công và khóa hóa đơn thành công',
      data: { invoiceKey: key },
      error: null
    };
  } catch (e) {
    return {
      ok: false,
      action: 'overrideCukcukInvoice',
      message: 'Lỗi cập nhật ghi đè: ' + e.toString(),
      error: { code: 'SHEET_WRITE_FAILED', detail: e.toString() }
    };
  }
}

/**
 * Resets manualOverride to FALSE and restores original CUKCUK details.
 */
function _rollbackCukcukInvoiceAction(data) {
  const val = _validateMetadata(data, 'rollbackCukcukInvoice');
  if (val && !val.success) return val;

  if (!data.invoiceKey) {
    return { ok: false, action: 'rollbackCukcukInvoice', message: 'Thiếu invoiceKey', error: { code: 'UNKNOWN_ERROR', detail: 'Missing invoiceKey' } };
  }
  
  const key = data.invoiceKey;
  
  try {
    _getSheet('KG_CUKCUK_INVOICES', NEW_INVOICES_HEADERS);
    _getSheet('KG_CUKCUK_OVERRIDES', NEW_OVERRIDES_HEADERS);
    
    const invoicesSheet = _getSheet('KG_CUKCUK_INVOICES');
    const allInvoices = _sheetsGet('KG_CUKCUK_INVOICES');
    let rowIndex = -1;
    const colIndex = {};
    
    if (allInvoices && allInvoices.length > 0) {
      allInvoices[0].forEach((h, idx) => { colIndex[h] = idx; });
      for (let i = 1; i < allInvoices.length; i++) {
        if (String(allInvoices[i][colIndex['invoiceKey']] || '') === key) {
          rowIndex = i + 1;
          break;
        }
      }
    }
    
    if (rowIndex === -1) {
      return { ok: false, action: 'rollbackCukcukInvoice', message: 'Không tìm thấy hóa đơn cần rollback trên Sheet', error: { code: 'UNKNOWN_ERROR', detail: 'Invoice not found on sheet' } };
    }
    
    const oldRow = allInvoices[rowIndex - 1];
    
    // Save to OVERRIDES log
    const overrideId = 'ovr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    
    const overrideRow = [
      overrideId,
      key,
      oldRow[colIndex['cukcukInvoiceId']] || '',
      oldRow[colIndex['workDate']] || '',
      'manualOverride',
      'TRUE',
      'FALSE',
      'Rollback manual override to CUKCUK data',
      data.cashierName || 'SYSTEM',
      new Date().toISOString(),
      data.deviceId || '',
      data.sessionId || '',
      data.shiftId || '',
      '{}',
      JSON.stringify(oldRow),
      'SUCCESS',
      ''
    ];
    
    _sheetsAppend('KG_CUKCUK_OVERRIDES', [overrideRow]);
    
    // Unlock the invoice: set manualOverride = FALSE
    invoicesSheet.getRange(rowIndex, colIndex['manualOverride'] + 1).setValue(false);
    invoicesSheet.getRange(rowIndex, colIndex['overrideAt'] + 1).setValue('');
    invoicesSheet.getRange(rowIndex, colIndex['overrideBy'] + 1).setValue('');
    invoicesSheet.getRange(rowIndex, colIndex['overrideReason'] + 1).setValue('');
    invoicesSheet.getRange(rowIndex, colIndex['overrideFieldsJson'] + 1).setValue('{}');
    invoicesSheet.getRange(rowIndex, colIndex['updatedAt'] + 1).setValue(new Date().toISOString());

    // Fetch original invoice details from CUKCUK to override the local manual modifications
    try {
      const loginInfo = CukcukService.refreshAccessTokenIfNeeded();
      const detail = CukcukService.fetchInvoiceDetail(key, loginInfo);
      if (detail) {
        const normalized = CukcukService.normalizeInvoice(detail, detail);
        normalized.workDate = oldRow[colIndex['workDate']];
        normalized.lastSyncedAt = new Date().toISOString();
        
        NEW_INVOICES_HEADERS.forEach((h, idx) => {
          if (h !== 'createdAt' && h !== 'manualOverride' && h !== 'overrideAt' && h !== 'overrideBy' && h !== 'overrideReason' && h !== 'overrideFieldsJson') {
            invoicesSheet.getRange(rowIndex, idx + 1).setValue(normalized[h] !== undefined ? normalized[h] : '');
          }
        });
      }
    } catch (apiErr) {
      Logger.log('[GAS CUKCUK Rollback Sync Error] ' + apiErr.toString());
    }
    
    return {
      ok: true,
      action: 'rollbackCukcukInvoice',
      message: 'Khôi phục và mở khóa hóa đơn thành công',
      data: { invoiceKey: key },
      error: null
    };
  } catch (e) {
    return {
      ok: false,
      action: 'rollbackCukcukInvoice',
      message: 'Lỗi rollback: ' + e.toString(),
      error: { code: 'SHEET_WRITE_FAILED', detail: e.toString() }
    };
  }
}

/**
 * Hàm hỗ trợ test kết nối ngoài để kích hoạt popup cấp quyền UrlFetchApp
 */
function testExternalRequest() {
  Logger.log("Testing connection...");
  const response = UrlFetchApp.fetch("https://graphapi.cukcuk.vn");
  Logger.log("Response code: " + response.getResponseCode());
}



