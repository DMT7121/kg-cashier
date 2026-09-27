/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - TRANSACTION SYNC & AUTO-SORT WEBAPP (v4.3-SHEETS-API-V4)
 * ============================================================================
 * 
 * Quy trình xử lý theo chuẩn King's Grill Enterprise Architecture:
 * 1. Tự động kiểm tra sheet ngày làm việc theo định dạng "DD/MM/YYYY" (VD: "17/09/2026").
 * 2. Nếu chưa tồn tại:
 *    - Tìm kiếm và sao chép/nhân bản từ sheet mẫu "NONE" (hoặc " NONE", "NONEEE").
 *    - Đổi tên sheet nhân bản thành ngày đang làm việc (DD/MM/YYYY) và hiển thị sheet.
 *    - Tự động định vị sheet mới nằm ở vị trí ngày mới nhất, NGAY BÊN TRÁI CẠNH SHEET NGÀY CŨ LIỀN KỀ
 *      (VD: Sheet "17/09/2026" sẽ nằm ngay cạnh bên trái sheet "16/09/2026").
 * 3. Tự động chuẩn hóa và sắp xếp sheet theo ngày giảm dần:
 *    - Ghim cố định 2 sheet ngoài cùng bên trái: Vị trí 1 là "INFO", Vị trí 2 là "NONE".
 *    - Nhận diện các sheet ngày lệch ("14/9/2026", "5/5/2026", "1/02/2025" -> "14/09/2026", "05/05/2026", "01/02/2025").
 *    - Sắp xếp toàn bộ sheet ngày theo thứ tự GIẢM DẦN (Mới nhất -> Cũ dần).
 *    - Tự động kích hoạt sắp xếp lúc 00h hàng ngày qua Time-driven Trigger (dailyMidnightSortSheetsTrigger).
 * 4. Ghi độc lập lần lượt các lượt chuyển khoản (CK) và quẹt thẻ (ATM) vào các cột chỉ định:
 *    - Chuẩn hóa payload đầu vào thống nhất cả camelCase và snake_case, hỗ trợ cập nhật về 0.
 *    - Sắp xếp tăng dần theo thời gian đóng bàn lần đầu (sớm nhất -> trễ nhất), chuẩn hóa theo ngày ca qua nửa đêm.
 *    - Bảo toàn 100% các ô người dùng chỉnh sửa thủ công (hoặc cờ "ADMIN").
 *    - Chống nhân đôi giao dịch: giao dịch đã nằm ở ô sửa tay tuyệt đối không bị ghi thêm vào ô trống khác.
 *    - Xử lý tách biệt giữa CK và ATM: hóa đơn có cả CK và ATM xuất hiện chính xác 1 lần trong mỗi nhóm cột.
 *    - Phát hiện vượt sức chứa: báo cáo rõ ràng trạng thái partial/failed, danh sách và số lượng mã chưa ghi.
 * 5. Hiệu năng & Tính toàn vẹn:
 *    - Ghi nguyên tử Values + Notes trong 1 lần gọi API duy nhất (Sheets API V4 batchUpdate updateCells).
 *    - Trả JSON chuẩn kèm statusCode, errorCode, trạng thái retryable theo khả năng thực tế của Apps Script.
 */

var DEFAULT_SPREADSHEET_ID = "1drWBOfgTZ1nqgl-W_gb24P-7r4WRoxHxAfk657tvLQQ";

/**
 * Kiểm tra xem một action có thuộc về nghiệp vụ Cashier Backend (nếu cashier_backend.js có trong project) hay không
 */
function isCashierBackendAction(action) {
  if (!action) return false;
  var cashierActions = [
    'openShift', 'tryOpenShift', 'syncShift', 'closeShift', 'closeShiftAtomic',
    'reopenShift', 'cancelShift', 'deleteShift', 'voidGhostShift', 'getShiftRegistry',
    'repairShifts', 'getShifts', 'getCurrentShift', 'getStaff', 'saveStaff',
    'deleteStaff', 'login', 'addAudit', 'getAudit', 'uploadFile', 'deleteFile',
    'getSettings', 'saveSettings', 'getCukcukConfigSecure', 'getConfig', 'saveConfig',
    'syncCukcukRevenue', 'rebuildCukcukIndex', 'getCukcukSyncState', 'saveCukcukSyncState',
    'syncCukcukToSheets', 'syncCukcukInvoices', 'syncCukcukMenu',
    'setupCukcukAutoSyncTrigger', 'disableCukcukAutoSyncTrigger',
    'clearCukcukSyncLock', 'loadCukcukInvoices', 'getCukcukInvoices',
    'getCukcukItems', 'getCukcukDailySales', 'saveCukcukOverride',
    'overrideCukcukInvoice', 'rollbackCukcukInvoice', 'getRevenueOverview',
    'getRevenueByDay', 'getRevenueByWeek', 'getRevenueByMonth',
    'getRevenueByQuarter', 'getRevenueByYear', 'getInvoiceSearch',
    'getInvoiceDetail', 'runCukcukSync', 'rebuildAggregates',
    'rebuildMonthJson', 'manualOverridePayment', 'migrateLegacyCukcukInvoices',
    'runAllV4BackendTests', 'getPosOrders', 'syncPosOrders'
  ];
  return cashierActions.indexOf(action) !== -1;
}

/**
 * Global WebApp POST Handler
 * Tự động tiếp nhận và xử lý mọi yêu cầu đồng bộ CK/ATM, sắp xếp sheet, trigger hoặc chuyển tiếp nghiệp vụ thu ngân
 */
function doPost(e) {
  var data = {};
  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = {};
    }
  }

  // Merge URL query parameters into data if not already present
  if (e && e.parameter) {
    for (var p in e.parameter) {
      if (e.parameter.hasOwnProperty(p) && data[p] === undefined) {
        data[p] = e.parameter[p];
      }
    }
  }

  var action = (e && e.parameter && e.parameter.action) || data.action || "";

  // 1. Nếu có cashier_backend.js trong dự án và action thuộc thu ngân, chuyển tiếp an toàn
  if (typeof _handleCashierRequest === "function" && isCashierBackendAction(action)) {
    return _handleCashierRequest(e);
  }

  // 2. Mặc định xử lý đồng bộ CK/ATM & Sheet Engine
  return handleSyncWebappPost(e, data);
}

/**
 * Global WebApp GET Handler
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";

  // 1. Nếu có cashier_backend.js trong dự án và action thuộc thu ngân
  if (typeof _handleCashierRequest === "function" && isCashierBackendAction(action)) {
    return _handleCashierRequest(e);
  }

  // 2. Mặc định xử lý GET của 01_SyncWebapp
  return handleSyncWebappGet(e);
}

function handleSyncWebappPost(e, data) {
  var lock = LockService.getScriptLock();
  try {
    // Khóa tránh xung đột ghi đồng thời tối đa 30 giây
    if (!lock.tryLock(30000)) {
      return jsonResponse({ 
        success: false, 
        status: "failed", 
        statusCode: 429, 
        errorCode: "LOCK_TIMEOUT", 
        retryable: true, 
        message: "Hệ thống đang bận xử lý, vui lòng thử lại sau giây lát." 
      }, 429);
    }

    if (!data) {
      if (e && e.postData && e.postData.contents) {
        try {
          data = JSON.parse(e.postData.contents);
        } catch (parseErr) {
          return jsonResponse({ success: false, status: "failed", statusCode: 400, errorCode: "INVALID_JSON", retryable: false, message: "JSON payload không hợp lệ: " + parseErr.message }, 400);
        }
      } else {
        data = {};
      }
    }

    var action = (e && e.parameter && e.parameter.action) || data.action || "";

    // 0. Action ping / health check
    if (action === "ping" || action === "health") {
      return jsonResponse({
        success: true,
        status: "online",
        statusCode: 200,
        version: "v4.5",
        message: "King's Grill CK/ATM Transaction Sync Engine đang hoạt động ổn định.",
        serverTime: Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss"),
        retryable: false
      }, 200);
    }

    var ssId = data.spreadsheetId || (e && e.parameter && e.parameter.spreadsheetId) || DEFAULT_SPREADSHEET_ID;
    var rawSheetName = data.sheetName || data.date || data.workingDate || data.shiftDate || (e && e.parameter && (e.parameter.sheetName || e.parameter.date || e.parameter.workingDate));

    if (!ssId) {
      return jsonResponse({ 
        success: false, 
        status: "failed", 
        statusCode: 400, 
        errorCode: "MISSING_SPREADSHEET_ID", 
        retryable: false, 
        message: "Thiếu spreadsheetId trong dữ liệu gửi lên" 
      }, 400);
    }

    // Chuẩn hóa tên sheet thành định dạng ngày làm việc DD/MM/YYYY (VD: "14/09/2026")
    var sheetName = normalizeWorkingDateSheetName(rawSheetName);

    var ss = SpreadsheetApp.openById(ssId);

    // 1. Action sắp xếp & chuẩn hóa toàn bộ sheet ngày giảm dần
    if (action === "sort_sheets" || action === "sort") {
      var sortRes = sortAndNormalizeDateSheets(ss);
      sortRes.version = "v4.5";
      return jsonResponse(sortRes, 200);
    }

    // 2. Action cài đặt Time-driven Trigger tự động chạy lúc 00h hàng ngày
    if (action === "setup_trigger" || action === "setup_daily_trigger") {
      var trigRes = setupDailyMidnightSortTrigger();
      trigRes.version = "v4.5";
      return jsonResponse(trigRes, 200);
    }
    
    // Lấy sheet ngày làm việc hoặc nhân bản từ sheet mẫu "NONE"
    var sheet = getOrCreateWorkingSheet(ss, sheetName);

    var result;
    if (action === "deduplicate" || action === "deduplicate_sheet") {
      result = deduplicateSheet(sheet, ssId, sheetName, data);
    } else if (action === "bulk" || action === "bulk_resync" || (data.transactions && Array.isArray(data.transactions))) {
      // Nếu là bulk_resync nhưng không truyền transactions (ví dụ chỉ truyền ngày), fallback sang deduplicateSheet để re-sort ổn định
      if (!data.transactions || !Array.isArray(data.transactions) || data.transactions.length === 0) {
        result = deduplicateSheet(sheet, ssId, sheetName, data);
      } else {
        result = handleBulkSync(sheet, ssId, sheetName, data);
      }
    } else if (action === "sync_vat_invoice" || action === "sync_invoice") {
      result = handleVatInvoiceSync(sheet, ssId, sheetName, data);
    } else {
      // single_sync, sync_single, hoặc gọi trực tiếp hóa đơn đơn lẻ
      result = handleSingleSync(sheet, ssId, sheetName, data);
    }

    result.version = "v4.5";
    result.sheetName = sheetName;
    return jsonResponse(result, result.statusCode || (result.success ? 200 : 422));

  } catch (err) {
    return jsonResponse({ 
      success: false, 
      status: "failed", 
      statusCode: 500, 
      errorCode: "INTERNAL_ERROR", 
      retryable: false, 
      version: "v4.5", 
      message: "Lỗi xử lý hệ thống: " + (err.message || err.toString()) 
    }, 500);
  } finally {
    try {
      lock.releaseLock();
    } catch (eRel) {}
  }
}

// Handler kiểm tra trạng thái WebApp (GET request)
function handleSyncWebappGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : "";
  if (action === "sort" || action === "sort_sheets") {
    var ssId = (e.parameter && e.parameter.spreadsheetId) || DEFAULT_SPREADSHEET_ID;
    var ss = SpreadsheetApp.openById(ssId);
    var sortRes = sortAndNormalizeDateSheets(ss);
    return jsonResponse({ 
      success: true, 
      status: "completed", 
      statusCode: 200, 
      version: "v4.2", 
      message: "Đã sắp xếp và chuẩn hóa các sheet ngày giảm dần.",
      data: sortRes
    }, 200);
  }

  if (action === "setup_trigger" || action === "setup_daily_trigger") {
    var trigRes = setupDailyMidnightSortTrigger();
    return jsonResponse({ 
      success: true, 
      status: "completed", 
      statusCode: 200, 
      version: "v4.2", 
      message: trigRes.message
    }, 200);
  }

  if (action === "deduplicate" || action === "deduplicate_sheet") {
    var ssId = (e.parameter && e.parameter.spreadsheetId) || DEFAULT_SPREADSHEET_ID;
    var rawSheetName = (e.parameter && (e.parameter.sheetName || e.parameter.date || e.parameter.workingDate));
    var sheetName = normalizeWorkingDateSheetName(rawSheetName);
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = getOrCreateWorkingSheet(ss, sheetName);
    var dedupRes = deduplicateSheet(sheet, ssId, sheetName, {});
    return jsonResponse(dedupRes, 200);
  }

  return jsonResponse({ 
    status: "online", 
    success: true, 
    statusCode: 200, 
    version: "v4.2", 
    message: "Google Sheets CK/ATM Sync WebApp đang hoạt động bình thường.",
    serverTime: Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss")
  }, 200);
}

/**
 * Trả về kết quả JSON kèm header chuẩn và nhúng statusCode/status/retryable vào payload
 */
function jsonResponse(obj, statusCode) {
  if (typeof obj === "object" && obj !== null) {
    if (statusCode) {
      obj.statusCode = statusCode;
    }
    if (obj.success === false && !obj.status) {
      obj.status = "failed";
    }
    if (obj.success === true && !obj.status) {
      obj.status = "completed";
    }
    if (obj.retryable === undefined) {
      obj.retryable = (obj.statusCode === 429 || obj.statusCode === 503);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Bóc tách và chuyển đổi số tiền an toàn tuyệt đối từ chuỗi định dạng tiền tệ
 * (loại bỏ triệt để 'đ', '₫', 'VND', dấu chấm phân cách hàng nghìn, khoảng trắng).
 */
function parseCleanCurrency(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  var str = String(val).trim();
  str = str.replace(/[^\d.,-]/g, "");
  if (!str) return 0;
  if (str.indexOf(".") !== -1 && str.indexOf(",") !== -1) {
    if (str.lastIndexOf(".") > str.lastIndexOf(",")) {
      str = str.replace(/,/g, "");
    } else {
      str = str.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, "");
  } else if ((str.match(/,/g) || []).length > 1) {
    str = str.replace(/,/g, "");
  } else if (str.indexOf(".") !== -1 && str.length - str.indexOf(".") === 4) {
    str = str.replace(/\./g, "");
  } else if (str.indexOf(",") !== -1 && str.length - str.indexOf(",") === 4) {
    str = str.replace(/,/g, "");
  }
  var num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Chuẩn hóa mã tham chiếu / mã phiếu duy nhất, gọt sạch các tiền tố nhiễu ('HD', '#', 'Ref:')
 */
function cleanRefNo(ref) {
  if (ref === null || ref === undefined) return "";
  var s = String(ref).trim();
  s = s.replace(/^(?:Ref:?\s*|HD\s*|#\s*)+/i, "").trim();
  return s;
}

/**
 * Chuẩn hóa một item giao dịch đầu vào: thống nhất camelCase và snake_case,
 * phân biệt rõ ràng thiếu trường (undefined), null và số 0.
 */
function normalizeTransactionPayload(raw) {
  if (!raw || typeof raw !== "object") return null;

  var rawRef = raw.refNo !== undefined ? raw.refNo : (raw.ref_no !== undefined ? raw.ref_no : "");
  var refNo = cleanRefNo(rawRef);
  var tableName = String(raw.tableName !== undefined ? raw.tableName : (raw.table_name !== undefined ? raw.table_name : "")).trim();
  var billTime = String(raw.billTime !== undefined ? raw.billTime : (raw.bill_time !== undefined ? raw.bill_time : (raw.created_at !== undefined ? raw.created_at : ""))).trim();

  var hasCk = (raw.ckValue !== undefined || raw.ck_value !== undefined);
  var rawCk = raw.ckValue !== undefined ? raw.ckValue : raw.ck_value;
  var ckValue = hasCk ? parseCleanCurrency(rawCk) : 0;

  var hasAtm = (raw.atmValue !== undefined || raw.atm_value !== undefined);
  var rawAtm = raw.atmValue !== undefined ? raw.atmValue : raw.atm_value;
  var atmValue = hasAtm ? parseCleanCurrency(rawAtm) : 0;

  var isExtra = Boolean(raw.isExtraShift !== undefined ? raw.isExtraShift : raw.is_extra_shift);
  var shiftNote = String(raw.shiftNote !== undefined ? raw.shiftNote : (raw.shift_note !== undefined ? raw.shift_note : "")).trim();

  var sapoReceipt = String(raw.sapoReceipt !== undefined ? raw.sapoReceipt : (raw.sapo_receipt !== undefined ? raw.sapo_receipt : "")).trim();
  var isPriceEdited = Boolean(raw.isPriceEdited !== undefined ? raw.isPriceEdited : (raw.is_price_edited !== undefined ? raw.is_price_edited : false));

  return {
    refNo: refNo,
    tableName: tableName,
    billTime: billTime,
    hasCkValue: hasCk,
    ckValue: ckValue,
    hasAtmValue: hasAtm,
    atmValue: atmValue,
    isExtraShift: isExtra,
    shiftNote: shiftNote,
    sapoReceipt: sapoReceipt,
    hasManualEdit: isPriceEdited
  };
}

/**
 * Xác định ngày ca làm việc theo quy chuẩn King's Grill F&B:
 * - 14:00 ngày D -> 06:00 sáng ngày D+1: Ca chính ngày D
 * - 06:00 -> 14:00 ngày D+1: Ca phát sinh ngày D (vẫn thuộc Sheet ngày D)
 * - >= 14:00 ngày D+1: Chuyển sang Ca chính ngày D+1
 */
function determineShiftDate(dateObj) {
  var d = dateObj || new Date();
  var hourStr = Utilities.formatDate(d, "Asia/Ho_Chi_Minh", "HH");
  var hour = parseInt(hourStr, 10);

  if (hour < 14) {
    var yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    return Utilities.formatDate(yesterday, "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
  } else {
    return Utilities.formatDate(d, "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
  }
}

/**
 * Chuẩn hóa tên sheet thành định dạng chuẩn "DD/MM/YYYY" (VD: "27/08/2026").
 */
function normalizeWorkingDateSheetName(rawInput) {
  if (!rawInput) {
    return determineShiftDate(new Date());
  }

  var str = String(rawInput).trim();

  // 1. Khớp dạng DD/MM/YYYY hoặc D/M/YYYY
  var dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    var day = ("0" + parseInt(dmyMatch[1], 10)).slice(-2);
    var month = ("0" + parseInt(dmyMatch[2], 10)).slice(-2);
    var year = dmyMatch[3];
    return day + "/" + month + "/" + year;
  }

  // 2. Khớp dạng YYYY-MM-DD hoặc YYYY/MM/DD (ISO Date)
  var ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    var year = ymdMatch[1];
    var month = ("0" + parseInt(ymdMatch[2], 10)).slice(-2);
    var day = ("0" + parseInt(ymdMatch[3], 10)).slice(-2);
    return day + "/" + month + "/" + year;
  }

  // 3. Nếu là chuỗi ngày giờ dài (vd: "27/08/2026 18:33"), lấy phần ngày
  var longMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (longMatch) {
    var day = ("0" + parseInt(longMatch[1], 10)).slice(-2);
    var month = ("0" + parseInt(longMatch[2], 10)).slice(-2);
    var year = longMatch[3];
    return day + "/" + month + "/" + year;
  }

  return str;
}

/**
 * Tìm sheet mẫu để nhân bản theo thứ tự ưu tiên
 */
function findTemplateSheet(ss) {
  var exactSpaceNone = ss.getSheetByName(" NONE");
  if (exactSpaceNone) return exactSpaceNone;

  var exactNone = ss.getSheetByName("NONE");
  if (exactNone) return exactNone;

  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var rawName = allSheets[i].getName();
    if (rawName.trim().toUpperCase() === "NONE") {
      return allSheets[i];
    }
  }

  for (var i = 0; i < allSheets.length; i++) {
    var cleanName = allSheets[i].getName().trim().toUpperCase();
    if (cleanName.indexOf("NONE") === 0 || cleanName === "NONEEE") {
      return allSheets[i];
    }
  }

  for (var i = 0; i < allSheets.length; i++) {
    var cleanName = allSheets[i].getName().trim().toUpperCase();
    if (cleanName.indexOf("TEMPLATE") !== -1 || cleanName.indexOf("MẪU") !== -1 || cleanName.indexOf("MAU") !== -1) {
      return allSheets[i];
    }
  }

  return null;
}

/**
 * Tìm sheet ngày làm việc, nếu chưa có thì nhân bản ưu tiên từ sheet mẫu "NONE".
 */
function getOrCreateWorkingSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    try {
      var c3Val = sheet.getRange("C3").getValue();
      if (!c3Val) {
        sheet.getRange("C3").setNumberFormat("@").setValue(sheetName);
      }
    } catch (eC3) {}
    return sheet;
  }

  var templateSheet = findTemplateSheet(ss);
  if (templateSheet) {
    sheet = templateSheet.copyTo(ss).setName(sheetName);
    sheet.showSheet();
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  try {
    sheet.getRange("C3").setNumberFormat("@").setValue(sheetName);
  } catch (eC3) {}

  // Tự động chuẩn hóa và sắp xếp toàn bộ sheet theo thứ tự ngày giảm dần:
  // Sheet mới tạo ("17/09/2026") sẽ nằm ở vị trí ngày mới nhất, ngay bên trái của sheet ngày cũ ("16/09/2026"),
  // đồng thời đảm bảo 2 sheet INFO và NONE luôn được ghim ở 2 vị trí ngoài cùng bên trái.
  try {
    sortAndNormalizeDateSheets(ss, sheet);
  } catch (eSort) {
    Logger.log("Lỗi khi tự động sắp xếp sheets sau khi nhân bản: " + (eSort.message || eSort.toString()));
  }

  return sheet;
}

/**
 * Xử lý đồng bộ danh sách hàng loạt (Bulk Resync khi kết ca hoặc bấm nút Đồng Bộ)
 */
function handleBulkSync(sheet, ssId, sheetName, data) {
  var ckRanges = parseRanges(data.ckCell || "E6:E32,F6:F32");
  var atmRanges = parseRanges(data.atmCell || "D6:D32");

  var rawTransactions = data.transactions;
  if (!rawTransactions || !Array.isArray(rawTransactions)) {
    return { 
      success: false, 
      status: "failed", 
      statusCode: 400, 
      errorCode: "INVALID_TRANSACTIONS", 
      message: "Danh sách transactions không hợp lệ hoặc rỗng" 
    };
  }

  // Chuẩn hóa và DEDUPLICATE toàn bộ danh sách transactions trước khi xử lý
  var txMap = {};
  var transactions = [];
  for (var i = 0; i < rawTransactions.length; i++) {
    var norm = normalizeTransactionPayload(rawTransactions[i]);
    if (!norm) continue;
    var cRef = cleanRefNo(norm.refNo);
    var dedupKey = cRef ? ("REF_" + cRef) : ("TBL_" + (norm.tableName || "").toLowerCase() + "_" + (norm.ckValue + norm.atmValue) + "_" + norm.billTime);
    if (!txMap[dedupKey]) {
      txMap[dedupKey] = norm;
      transactions.push(norm);
    } else {
      var existing = txMap[dedupKey];
      if (norm.hasCkValue) existing.ckValue = norm.ckValue;
      if (norm.hasAtmValue) existing.atmValue = norm.atmValue;
      if (norm.tableName) existing.tableName = norm.tableName;
      if (norm.billTime) existing.billTime = norm.billTime;
      if (norm.isExtraShift) existing.isExtraShift = true;
      if (norm.shiftNote) existing.shiftNote = norm.shiftNote;
    }
  }

  var cache = initSheetCache(sheet, ckRanges.concat(atmRanges));
  if (!cache) {
    return { 
      success: false, 
      status: "failed", 
      statusCode: 500, 
      errorCode: "CACHE_INIT_FAILED", 
      message: "Không thể khởi tạo vùng nhớ cache cho dải ô chỉ định" 
    };
  }

  var nowStr = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm");

  // Xử lý nhóm cột Chuyển Khoản (CK)
  var resCk = processAndWriteColumnGroup(cache, ckRanges, transactions, "CK", nowStr, sheetName);

  // Xử lý nhóm cột Thẻ/ATM
  var resAtm = processAndWriteColumnGroup(cache, atmRanges, transactions, "ATM", nowStr, sheetName);

  // Ghi toàn bộ cache đã xử lý trở lại Google Sheet
  writeBackCache(sheet, ssId, sheetName, cache);

  var unwrittenTotal = (resCk.unwritten || []).concat(resAtm.unwritten || []);
  var isPartial = (unwrittenTotal.length > 0);
  var totalPlaced = resCk.writtenCount + resAtm.writtenCount;
  var totalExpected = resCk.totalCount + resAtm.totalCount;

  if (isPartial) {
    return {
      success: false,
      status: (totalPlaced > 0 ? "partial" : "failed"),
      statusCode: 422,
      errorCode: "CAPACITY_EXCEEDED",
      retryable: false,
      message: "Đồng bộ một phần (" + totalPlaced + "/" + totalExpected + " giao dịch). Vượt quá sức chứa cấu hình cho " + unwrittenTotal.length + " giao dịch.",
      ck: {
        capacity: resCk.capacity,
        availableSlots: resCk.availableSlots,
        synced: resCk.writtenCount,
        total: resCk.totalCount,
        unwrittenCount: resCk.unwritten.length,
        unwrittenRefs: resCk.unwritten.map(function(u) { return u.refNo; })
      },
      atm: {
        capacity: resAtm.capacity,
        availableSlots: resAtm.availableSlots,
        synced: resAtm.writtenCount,
        total: resAtm.totalCount,
        unwrittenCount: resAtm.unwritten.length,
        unwrittenRefs: resAtm.unwritten.map(function(u) { return u.refNo; })
      },
      unwrittenTransactions: unwrittenTotal
    };
  }

  return {
    success: true,
    status: "completed",
    statusCode: 200,
    message: "Đồng bộ doanh thu CK/ATM thành công (" + totalPlaced + "/" + totalExpected + " giao dịch)",
    ckSynced: resCk.writtenCount,
    ckTotal: resCk.totalCount,
    atmSynced: resAtm.writtenCount,
    atmTotal: resAtm.totalCount,
    unwrittenTransactions: []
  };
}

/**
 * Xử lý đồng bộ từng hóa đơn đơn lẻ thời gian thực
 */
function handleSingleSync(sheet, ssId, sheetName, data) {
  var ckRanges = parseRanges(data.ckCell || "E6:E32,F6:F32");
  var atmRanges = parseRanges(data.atmCell || "D6:D32");

  var cache = initSheetCache(sheet, ckRanges.concat(atmRanges));
  if (!cache) {
    return { 
      success: false, 
      status: "failed", 
      statusCode: 500, 
      errorCode: "CACHE_INIT_FAILED", 
      message: "Không thể khởi tạo vùng nhớ cache cho dải ô chỉ định" 
    };
  }

  // 1. Trích xuất các hóa đơn hiện có trên sheet từ cell notes
  var existingTxMap = {};
  extractExistingTxFromCache(cache, ckRanges, true, existingTxMap);
  extractExistingTxFromCache(cache, atmRanges, false, existingTxMap);

  // 2. Chuẩn hóa payload đơn lẻ gửi lên
  var norm = normalizeTransactionPayload(data);
  if (!norm) {
    return {
      success: false,
      status: "failed",
      statusCode: 400,
      errorCode: "INVALID_TRANSACTION",
      message: "Payload giao dịch không hợp lệ"
    };
  }

  var onlyUpdateExisting = (data.onlyUpdateExisting === true || data.only_update_existing === true || String(data.onlyUpdateExisting).toLowerCase() === "true");
  var sapoReceipt = (data.sapoReceipt || data.sapo_receipt || norm.sapoReceipt || "").trim();
  var isPriceEditedInput = (data.isPriceEdited === true || data.is_price_edited === true || norm.hasManualEdit === true || String(data.isPriceEdited).toLowerCase() === "true");
  var originalAmountInput = (data.originalAmount !== undefined && data.originalAmount !== null) ? parseCleanCurrency(data.originalAmount) : 0;

  var cRef = cleanRefNo(norm.refNo);
  var targetKey = "";

  // Tìm kiếm xem đơn này đã có trong existingTxMap chưa
  // A. Tìm theo cleanRefNo: REF_<cRef> hoặc <cRef>
  if (cRef && existingTxMap["REF_" + cRef]) {
    targetKey = "REF_" + cRef;
  } else if (cRef && existingTxMap[cRef]) {
    targetKey = cRef;
  }

  // B. Nếu chưa tìm thấy và có sapoReceipt, tìm xem có key nào mang sapoReceipt này không
  if (!targetKey && sapoReceipt) {
    var cleanSapo = cleanRefNo(sapoReceipt);
    for (var sk in existingTxMap) {
      if (existingTxMap.hasOwnProperty(sk)) {
        var exItemSapo = existingTxMap[sk];
        if (exItemSapo.sapoReceipt && cleanRefNo(exItemSapo.sapoReceipt) === cleanSapo) {
          targetKey = sk;
          break;
        }
        if (exItemSapo.refNo && cleanRefNo(exItemSapo.refNo) === cleanSapo) {
          targetKey = sk;
          break;
        }
      }
    }
  }

  // C. Tìm theo fuzzy matching: cùng tableName và số tiền xấp xỉ (hoặc originalAmount)
  if (!targetKey) {
    var normTotal = (norm.ckValue || 0) + (norm.atmValue || 0);
    for (var ek in existingTxMap) {
      if (existingTxMap.hasOwnProperty(ek)) {
        var exItem = existingTxMap[ek];
        var exTotal = (exItem.ckValue || 0) + (exItem.atmValue || 0);
        var tableMatches = (norm.tableName && exItem.tableName && norm.tableName.toLowerCase() === exItem.tableName.toLowerCase());
        if (tableMatches) {
          if (Math.abs(normTotal - exTotal) < 1) {
            targetKey = ek;
            break;
          }
          if (originalAmountInput > 0 && Math.abs(originalAmountInput - exTotal) < 1) {
            targetKey = ek;
            break;
          }
        }
      }
    }
  }

  // QUY TẮC BẢO VỆ: Không tự tạo thêm các dòng CK, ATM mới cho Sapo. Chỉ đồng bộ theo những gì đã tạo ở lần đầu!
  if (!targetKey && (onlyUpdateExisting || sapoReceipt)) {
    return {
      success: true,
      status: "skipped",
      statusCode: 200,
      message: "Bỏ qua: Không tự tạo thêm dòng CK/ATM mới trong spreadsheet cho đơn Sapo chưa có sẵn từ lần đầu (Mã: #" + (cRef || sapoReceipt) + ")",
      ckSynced: 0,
      atmSynced: 0,
      unwrittenTransactions: []
    };
  }

  // NẾU LÀ ĐƠN MỚI TẠO LẦN ĐẦU (từ CUKCUK hoặc đồng bộ thông thường):
  if (!targetKey) {
    targetKey = cRef ? ("REF_" + cRef) : ("TBL_" + (norm.tableName || "").toLowerCase() + "_" + ((norm.ckValue || 0) + (norm.atmValue || 0)));
    existingTxMap[targetKey] = {
      refNo: norm.refNo,
      tableName: norm.tableName,
      billTime: norm.billTime || Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm"),
      ckValue: norm.ckValue,
      atmValue: norm.atmValue,
      isExtraShift: norm.isExtraShift,
      shiftNote: norm.shiftNote,
      sapoReceipt: sapoReceipt,
      hasManualEdit: isPriceEditedInput
    };
  } else {
    // ĐÃ TỒN TẠI TỪ LẦN TẠO TRƯỚC:
    var existing = existingTxMap[targetKey];
    if (norm.refNo) existing.refNo = norm.refNo;
    if (norm.tableName) existing.tableName = norm.tableName;
    if (!existing.billTime && norm.billTime) existing.billTime = norm.billTime;
    if (sapoReceipt) existing.sapoReceipt = sapoReceipt;
    if (norm.isExtraShift) existing.isExtraShift = true;
    if (norm.shiftNote) existing.shiftNote = norm.shiftNote;

    // QUY TẮC: Nếu 1 dòng có sửa chữa giá tiền thì ưu tiên giá tiền đã sửa. Khi này lệnh ghi vào spreadsheet sẽ bỏ qua và ghi chú lại - đã có chỉnh sửa tay.
    var hasPriceEdit = (isPriceEditedInput || existing.hasManualEdit);
    if (!hasPriceEdit) {
      if (norm.hasCkValue && existing.ckValue > 0 && Math.abs(norm.ckValue - existing.ckValue) >= 1) {
        hasPriceEdit = true;
      }
      if (norm.hasAtmValue && existing.atmValue > 0 && Math.abs(norm.atmValue - existing.atmValue) >= 1) {
        hasPriceEdit = true;
      }
    }

    if (hasPriceEdit) {
      // ƯU TIÊN GIÁ TIỀN ĐÃ SỬA: Giữ nguyên giá trị tiền đã có trên sheet, bỏ qua ghi đè tiền mới
      existing.hasManualEdit = true;
    } else {
      // Không sửa giá tiền: cập nhật giá trị bình thường
      if (norm.hasCkValue) existing.ckValue = norm.ckValue;
      if (norm.hasAtmValue) existing.atmValue = norm.atmValue;
    }
  }

  var transactions = [];
  for (var k in existingTxMap) {
    if (existingTxMap.hasOwnProperty(k)) {
      transactions.push(existingTxMap[k]);
    }
  }

  var nowStr = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm");
  var resCk = processAndWriteColumnGroup(cache, ckRanges, transactions, "CK", nowStr, sheetName);
  var resAtm = processAndWriteColumnGroup(cache, atmRanges, transactions, "ATM", nowStr, sheetName);

  writeBackCache(sheet, ssId, sheetName, cache);

  var unwrittenTotal = (resCk.unwritten || []).concat(resAtm.unwritten || []);
  var isPartial = (unwrittenTotal.length > 0);

  if (isPartial) {
    return {
      success: false,
      status: "partial",
      statusCode: 422,
      errorCode: "CAPACITY_EXCEEDED",
      retryable: false,
      message: "Đồng bộ hóa đơn hoàn tất nhưng vượt sức chứa cho " + unwrittenTotal.length + " giao dịch.",
      ckSynced: resCk.writtenCount,
      atmSynced: resAtm.writtenCount,
      unwrittenTransactions: unwrittenTotal
    };
  }

  return {
    success: true,
    status: "completed",
    statusCode: 200,
    message: "Đồng bộ hóa đơn thành công" + (existing && existing.hasManualEdit ? " (Ưu tiên giá đã sửa tay, note: - đã có chỉnh sửa tay)" : ""),
    ckSynced: resCk.writtenCount,
    atmSynced: resAtm.writtenCount,
    unwrittenTransactions: []
  };
}

/**
 * Xử lý đồng bộ hóa đơn VAT (tương thích ngược với sync_vat_invoice)
 * Không chuyển tiếp vào dải ô CK/ATM vì luồng SyncSingleTransactionAsync và Bulk Sync
 * đã đảm nhiệm ghi CK/ATM độc lập, tránh race condition nhân đôi ô trên Google Sheets.
 */
function handleVatInvoiceSync(sheet, ssId, sheetName, data) {
  var cleanRef = cleanRefNo(data.ref_no || data.refNo);
  return {
    success: true,
    status: "completed",
    statusCode: 200,
    message: "Đã tiếp nhận hóa đơn VAT #" + cleanRef + " (" + (data.table_name || data.tableName || "") + "). CK/ATM được xử lý qua luồng chuyên dụng."
  };
}

/**
 * Dọn dẹp và dập tắt triệt để các dòng giao dịch CK / ATM bị ghi lặp lại trên Google Sheet
 */
function deduplicateSheet(sheet, ssId, sheetName, data) {
  var ckRanges = parseRanges((data && data.ckCell) || "E6:E32,F6:F32");
  var atmRanges = parseRanges((data && data.atmCell) || "D6:D32");

  var cache = initSheetCache(sheet, ckRanges.concat(atmRanges));
  if (!cache) {
    return { 
      success: false, 
      status: "failed", 
      statusCode: 500, 
      errorCode: "CACHE_INIT_FAILED", 
      message: "Không thể khởi tạo vùng nhớ cache cho dải ô chỉ định" 
    };
  }

  // 1. Trích xuất toàn bộ giao dịch hiện có từ cell notes và giá trị ô
  var existingTxMap = {};
  extractExistingTxFromCache(cache, ckRanges, true, existingTxMap);
  extractExistingTxFromCache(cache, atmRanges, false, existingTxMap);

  // 2. Chuyển map thành danh sách giao dịch duy nhất
  var transactions = [];
  for (var k in existingTxMap) {
    if (existingTxMap.hasOwnProperty(k)) {
      transactions.push(existingTxMap[k]);
    }
  }

  var nowStr = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm");

  // 3. Sắp xếp và ghi lại nhóm cột Chuyển Khoản (CK) & Thẻ (ATM) không còn trùng lặp
  var resCk = processAndWriteColumnGroup(cache, ckRanges, transactions, "CK", nowStr, sheetName);
  var resAtm = processAndWriteColumnGroup(cache, atmRanges, transactions, "ATM", nowStr, sheetName);

  // 4. Ghi nguyên tử toàn bộ cache về Google Sheet
  writeBackCache(sheet, ssId, sheetName, cache);

  return {
    success: true,
    status: "completed",
    statusCode: 200,
    message: "Đã dọn dẹp trùng lặp thành công trên sheet '" + sheetName + "': " + resCk.writtenCount + " giao dịch CK, " + resAtm.writtenCount + " giao dịch ATM.",
    ckCount: resCk.writtenCount,
    atmCount: resAtm.writtenCount,
    sheetName: sheetName
  };
}

/**
 * Lọc giao dịch theo loại thanh toán (CK/ATM), sắp xếp tăng dần theo thời gian đóng bàn lần đầu (sớm nhất -> trễ nhất),
 * bảo toàn sửa tay và dập tắt hoàn toàn lỗi nhân đôi giao dịch.
 */
function processAndWriteColumnGroup(cache, ranges, transactions, payType, nowStr, shiftDateStr) {
  if (ranges.length === 0) {
    return { writtenCount: 0, totalCount: 0, capacity: 0, availableSlots: 0, unwritten: [] };
  }

  var isCk = (payType === "CK");
  var filtered = [];

  for (var i = 0; i < transactions.length; i++) {
    var rawTx = transactions[i];
    var norm = normalizeTransactionPayload(rawTx);
    if (!norm) continue;

    var val = isCk ? norm.ckValue : norm.atmValue;
    if (val > 0) {
      filtered.push({
        refNo: norm.refNo,
        tableName: norm.tableName,
        billTime: norm.billTime,
        value: val,
        isExtraShift: norm.isExtraShift,
        shiftNote: norm.shiftNote,
        hasManualEdit: Boolean(rawTx.hasManualEdit || norm.hasManualEdit),
        sapoReceipt: rawTx.sapoReceipt || norm.sapoReceipt || ""
      });
    }
  }

  // DẬP TẮT LỖI NHÂN ĐÔI GIAO DỊCH TRONG CÙNG ĐỢT ĐỒNG BỘ (INTRA-BATCH DEDUPLICATION)
  var dedupFiltered = [];
  var seenTxKeys = {};
  for (var d = 0; d < filtered.length; d++) {
    var itm = filtered[d];
    var itmRef = cleanRefNo(itm.refNo);
    var itmKey = itmRef ? ("REF_" + itmRef) : ("TBL_" + (itm.tableName || "").toLowerCase() + "_" + itm.value);
    if (!seenTxKeys[itmKey]) {
      seenTxKeys[itmKey] = true;
      dedupFiltered.push(itm);
    }
  }
  filtered = dedupFiltered;

  // Sắp xếp ưu tiên thời gian đóng bàn lần đầu theo ngày ca
  filtered.sort(function(a, b) {
    return compareTransactionsByFirstCloseTime(a, b, shiftDateStr);
  });

  // BƯỚC 1: Phân loại toàn bộ các ô trong dải ô của cột
  // - Ô đã bị người dùng sửa tay hoặc cờ ADMIN và có thông tin định danh: đưa vào preservedCellsByKey
  // - Ô công thức, ô người dùng tự nhập không thuộc tool: đưa vào foreignOccupied
  // - Ô trống hoặc ô do tool ghi ở lần trước (chưa bị người dùng sửa): dọn dẹp sạch và đưa vào availableSlots
  var preservedCellsByKey = {};
  var foreignOccupiedCount = 0;
  var availableSlots = [];
  var totalSlots = 0;

  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i];
    for (var r = range.startRow; r <= range.endRow; r++) {
      if (r >= cache.startRow && r <= cache.endRow) {
        totalSlots++;
        var rIdx = r - cache.startRow;
        var cIdx = range.colIndex - cache.minCol;

        var occupied = isUserOccupiedCell(rIdx, cIdx, cache);
        var note = String(cache.notes[rIdx][cIdx] || "");

        if (occupied) {
          // Kiểm tra xem ô sửa tay này có mang thông tin định danh phiếu hay không
          var refMatch = note.match(/Mã số phiếu:\s*([^\r\n]+)/);
          var cellRef = refMatch ? cleanRefNo(refMatch[1]) : "";
          var tblMatch = note.match(/Tên bàn:\s*([^\r\n]+)/);
          var cellTbl = tblMatch ? tblMatch[1].trim() : "";
          var cellVal = parseCleanCurrency(cache.values[rIdx][cIdx]);

          var sapoMatch = note.match(/Mã Sapo:\s*([^\r\n]+)/);
          var cellSapo = sapoMatch ? cleanRefNo(sapoMatch[1]) : "";
          var slotKey = cellRef ? ("REF_" + cellRef) : (cellSapo ? ("SAPO_" + cellSapo) : (cellTbl && cellVal > 0 ? ("TBL_" + cellTbl.toLowerCase() + "_" + cellVal) : ""));

          if (slotKey) {
            if (!preservedCellsByKey[slotKey]) {
              // Lưu vị trí ô sửa tay để bảo toàn giá trị cho mã phiếu/bàn này
              preservedCellsByKey[slotKey] = {
                rIdx: rIdx,
                cIdx: cIdx,
                val: cache.values[rIdx][cIdx],
                note: note
              };
            } else {
              // Đã có 1 ô trước đó giữ mã/thông tin này (ô đúp tàn dư từ trước) -> dọn sạch ô đúp thừa!
              cache.values[rIdx][cIdx] = "";
              cache.notes[rIdx][cIdx] = "";
              availableSlots.push({ rIdx: rIdx, cIdx: cIdx });
            }
          } else {
            // Ô chứa công thức hoặc người dùng tự nhập tay số tiền không thông qua tool
            foreignOccupiedCount++;
          }
        } else {
          // Ô trống hoặc do tool ghi lần trước (chưa bị sửa): dọn sạch để chuẩn bị ghi mới chuẩn xác
          cache.values[rIdx][cIdx] = "";
          cache.notes[rIdx][cIdx] = "";
          availableSlots.push({ rIdx: rIdx, cIdx: cIdx });
        }
      }
    }
  }

  // BƯỚC 2: Phân bổ các giao dịch vào các ô
  var unwrittenList = [];
  var writtenCount = 0;

  for (var i = 0; i < filtered.length; i++) {
    var item = filtered[i];
    var cRef = cleanRefNo(item.refNo);
    var itemKey = cRef ? ("REF_" + cRef) : ("TBL_" + (item.tableName || "").toLowerCase() + "_" + item.value);

    var presKey = preservedCellsByKey[itemKey] ? itemKey : (item.sapoReceipt && preservedCellsByKey["SAPO_" + cleanRefNo(item.sapoReceipt)] ? ("SAPO_" + cleanRefNo(item.sapoReceipt)) : "");

    // TRƯỜNG HỢP A: Giao dịch này đã có sẵn tại một ô sửa tay trên Sheet
    if (presKey && preservedCellsByKey[presKey]) {
      var pres = preservedCellsByKey[presKey];
      // BẢO TOÀN NGUYÊN VẸN GIÁ TRỊ DO NGƯỜI DÙNG SỬA TAY TẠI Ô ĐÓ
      cache.notes[pres.rIdx][pres.cIdx] = buildCellNote(
        pres.note,
        item.refNo,
        item.tableName,
        item.billTime,
        nowStr,
        pres.val,
        item.isExtraShift,
        item.shiftNote,
        true,
        item.sapoReceipt
      );

      writtenCount++;
      // Loại bỏ khỏi preservedCellsByKey để đánh dấu đã phân bổ xong
      delete preservedCellsByKey[presKey];
      continue;
    }

    // TRƯỜNG HỢP B: Giao dịch mới hoặc ô tool chuẩn -> ghi vào ô khả dụng kế tiếp
    if (availableSlots.length > 0) {
      var slot = availableSlots.shift();
      cache.values[slot.rIdx][slot.cIdx] = item.value;
      cache.notes[slot.rIdx][slot.cIdx] = buildCellNote(
        cache.notes[slot.rIdx][slot.cIdx],
        item.refNo,
        item.tableName,
        item.billTime,
        nowStr,
        item.value,
        item.isExtraShift,
        item.shiftNote,
        item.hasManualEdit,
        item.sapoReceipt
      );
      writtenCount++;
    } else {
      // HẾT SỨC CHỨA CỦA CỘT: Không tự ý ghi tràn ra ngoài dải ô cấu hình
      unwrittenList.push({
        refNo: item.refNo,
        value: item.value,
        tableName: item.tableName,
        billTime: item.billTime,
        reason: "CAPACITY_EXCEEDED"
      });
    }
  }

  // Nếu còn ô sửa tay nào trước đó trên sheet không nằm trong filtered (đơn từ nguồn khác): vẫn bảo lưu
  for (var remKey in preservedCellsByKey) {
    if (preservedCellsByKey.hasOwnProperty(remKey)) {
      writtenCount++;
    }
  }

  return {
    writtenCount: writtenCount,
    totalCount: filtered.length,
    capacity: totalSlots,
    availableSlots: (totalSlots - foreignOccupiedCount),
    unwritten: unwrittenList
  };
}

/**
 * So sánh 2 giao dịch theo thời gian đóng bàn lần đầu tăng dần (earliest to latest),
 * chuẩn hóa theo ngày ca qua nửa đêm.
 */
function compareTransactionsByFirstCloseTime(a, b, shiftDateStr) {
  var tA = parseBillTime(a.billTime, shiftDateStr);
  var tB = parseBillTime(b.billTime, shiftDateStr);
  if (tA !== tB) {
    return tA - tB;
  }
  var refA = String(a.refNo || "");
  var refB = String(b.refNo || "");
  return refA.localeCompare(refB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Phân tích chuỗi thời gian đóng bàn thành timestamp (milliseconds)
 * Xử lý đa dạng định dạng: DD/MM/YYYY HH:mm:ss, YYYY-MM-DDTHH:mm:ss, HH:mm:ss, HH:mm
 * Chuẩn hóa giờ đơn lẻ theo ngày ca làm việc thực tế (Shift Date).
 */
function parseBillTime(timeStr, shiftDateStr) {
  if (!timeStr) return 9999999999999;
  var str = String(timeStr).trim();
  if (!str) return 9999999999999;

  // 1. Format: DD/MM/YYYY HH:mm[:ss] hoặc D/M/YYYY H:m[:s]
  var dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    var day = parseInt(dmyMatch[1], 10);
    var month = parseInt(dmyMatch[2], 10) - 1;
    var year = parseInt(dmyMatch[3], 10);
    var hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    var min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    var sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return new Date(year, month, day, hour, min, sec).getTime();
  }

  // 2. Format: YYYY-MM-DD HH:mm[:ss] hoặc ISO 8601
  var ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    var year = parseInt(ymdMatch[1], 10);
    var month = parseInt(ymdMatch[2], 10) - 1;
    var day = parseInt(ymdMatch[3], 10);
    var hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    var min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    var sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    return new Date(year, month, day, hour, min, sec).getTime();
  }

  // 3. Format: HH:mm:ss hoặc HH:mm (Chỉ có giờ:phút)
  var timeMatch = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (timeMatch) {
    var hour = parseInt(timeMatch[1], 10);
    var min = parseInt(timeMatch[2], 10);
    var sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

    // Phân tích ngày gốc từ shiftDateStr (vd: "14/09/2026")
    var baseDay = 1, baseMonth = 0, baseYear = 2026;
    if (shiftDateStr) {
      var sMatch = String(shiftDateStr).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (sMatch) {
        baseDay = parseInt(sMatch[1], 10);
        baseMonth = parseInt(sMatch[2], 10) - 1;
        baseYear = parseInt(sMatch[3], 10);
      }
    }

    // Quy tắc ca đêm nhà hàng King's Grill (14:00 ngày D -> 14:00 ngày D+1):
    // Các hóa đơn từ 00:00 đến 13:59 tính thuộc buổi sáng ngày D+1
    var dObj = new Date(baseYear, baseMonth, baseDay, hour, min, sec);
    if (hour < 14) {
      dObj.setDate(dObj.getDate() + 1);
    }
    return dObj.getTime();
  }

  var parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return 9999999999999;
}

/**
 * Trích xuất các hóa đơn đã tồn tại trong cell notes của dải ô
 */
function extractExistingTxFromCache(cache, ranges, isCk, map) {
  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i];
    for (var r = range.startRow; r <= range.endRow; r++) {
      if (r >= cache.startRow && r <= cache.endRow) {
        var rIdx = r - cache.startRow;
        var cIdx = range.colIndex - cache.minCol;
        var note = cache.notes[rIdx][cIdx] || "";
        var val = parseCleanCurrency(cache.values[rIdx][cIdx]);

        // Nhận diện ô mang dấu vết của tool
        var hasToolSign = (note && (note.indexOf("Mã số phiếu:") !== -1 || note.indexOf("Mã Sapo:") !== -1 || note.indexOf("Giá trị đã đồng bộ:") !== -1 || note.indexOf("Thời gian cập nhật:") !== -1 || note.indexOf("Tên bàn:") !== -1));
        if (hasToolSign) {
          var refMatch = note.match(/Mã số phiếu:\s*([^\r\n]+)/);
          var refNo = refMatch ? cleanRefNo(refMatch[1]) : "";
          var tblMatch = note.match(/Tên bàn:\s*([^\r\n]+)/);
          var timeMatch = note.match(/Thời gian đóng bàn:\s*([^\r\n]+)/) || note.match(/Thời gian đóng bill:\s*([^\r\n]+)/);
          var shiftMatch = note.match(/Ca làm việc:\s*([^\r\n]+)/);
          var isExtra = shiftMatch && shiftMatch[1].indexOf("phát sinh") !== -1;
          var tableName = tblMatch ? tblMatch[1].trim() : "";
          var billTime = timeMatch ? timeMatch[1].trim() : "";
          var sapoMatch = note.match(/Mã Sapo:\s*([^\r\n]+)/);
          var sapoReceipt = sapoMatch ? sapoMatch[1].trim() : "";

          // Nhận diện trạng thái đã có chỉnh sửa tay
          var syncMatch = note.match(/Giá trị đã đồng bộ:\s*([\d.,]+)/);
          var lastSyncedVal = syncMatch ? parseCleanCurrency(syncMatch[1]) : 0;
          var hasManualEdit = false;
          if (note.indexOf("đã có chỉnh sửa tay") !== -1 || note.indexOf("chỉnh sửa tay") !== -1 || note.indexOf("ADMIN") !== -1) {
            hasManualEdit = true;
          } else if (syncMatch && Math.abs(val - lastSyncedVal) >= 1) {
            hasManualEdit = true;
          }

          // Định danh duy nhất theo cleanRefNo hoặc cặp (bàn + số tiền) hoặc sapoReceipt
          var key = refNo ? ("REF_" + refNo) : (sapoReceipt ? ("SAPO_" + cleanRefNo(sapoReceipt)) : (tableName && val > 0 ? ("TBL_" + tableName.toLowerCase() + "_" + val) : ""));
          if (!key) continue;

          if (!map[key]) {
            map[key] = {
              refNo: refNo,
              tableName: tableName,
              billTime: billTime,
              sapoReceipt: sapoReceipt,
              ckValue: 0,
              atmValue: 0,
              hasCkValue: false,
              hasAtmValue: false,
              hasManualEdit: hasManualEdit,
              isExtraShift: Boolean(isExtra),
              shiftNote: shiftMatch ? shiftMatch[1].trim() : ""
            };
          }

          if (hasManualEdit) {
            map[key].hasManualEdit = true;
          }
          if (sapoReceipt && !map[key].sapoReceipt) {
            map[key].sapoReceipt = sapoReceipt;
          }

          if (isCk) {
            map[key].ckValue = val;
            map[key].hasCkValue = true;
          } else {
            map[key].atmValue = val;
            map[key].hasAtmValue = true;
          }
        }
      }
    }
  }
}

/**
 * Tạo nội dung Cell Note chi tiết
 */
function buildCellNote(oldNote, refNo, tableName, billTime, nowStr, dbValue, isExtraShift, shiftNote, hasManualEdit, sapoReceipt) {
  var noteLines = [];
  var finalRef = cleanRefNo(refNo);
  if (!finalRef && oldNote) {
    var oldRefMatch = oldNote.match(/Mã số phiếu:\s*([^\r\n]+)/);
    if (oldRefMatch) finalRef = cleanRefNo(oldRefMatch[1]);
  }
  if (finalRef) noteLines.push("Mã số phiếu: " + finalRef);

  var finalSapo = sapoReceipt || "";
  if (!finalSapo && oldNote) {
    var oldSapoMatch = oldNote.match(/Mã Sapo:\s*([^\r\n]+)/);
    if (oldSapoMatch) finalSapo = oldSapoMatch[1].trim();
  }
  if (finalSapo) noteLines.push("Mã Sapo: " + finalSapo);

  if (tableName) noteLines.push("Tên bàn: " + tableName);
  
  var billTimeStr = billTime || "";
  if (oldNote && !billTimeStr) {
    var match = oldNote.match(/Thời gian đóng bàn:\s*([^\r\n]+)/) || oldNote.match(/Thời gian đóng bill:\s*([^\r\n]+)/);
    if (match) {
      billTimeStr = match[1];
    }
  }
  if (billTimeStr) noteLines.push("Thời gian đóng bàn: " + billTimeStr);

  // Ghi chú ca làm việc nếu là ca phát sinh (06:00 - 14:00)
  var extra = isExtraShift;
  if (!extra && billTimeStr) {
    var tMatch = billTimeStr.match(/(\d{1,2}):(\d{1,2})/);
    if (tMatch) {
      var h = parseInt(tMatch[1], 10);
      if (h >= 6 && h < 14) {
        extra = true;
      }
    }
  }
  if (extra || (shiftNote && shiftNote.indexOf("phát sinh") !== -1)) {
    noteLines.push("Ca làm việc: " + (shiftNote || "Ca phát sinh"));
  }

  noteLines.push("Thời gian cập nhật: " + nowStr);
  if (dbValue !== undefined && dbValue !== null) {
    noteLines.push("Giá trị đã đồng bộ: " + parseCleanCurrency(dbValue));
  }
  
  // Ghi chú rõ ràng nếu có chỉnh sửa tay
  var isManual = Boolean(hasManualEdit) || (oldNote && (oldNote.indexOf("đã có chỉnh sửa tay") !== -1 || oldNote.indexOf("chỉnh sửa tay") !== -1));
  if (isManual) {
    noteLines.push("- đã có chỉnh sửa tay");
  }

  // Bảo lưu cờ "ADMIN" nếu ô này trước đó đã được xác nhận thủ công
  if (oldNote && oldNote.indexOf("ADMIN") !== -1) {
    noteLines.push("ADMIN");
  }
  
  return noteLines.join("\n");
}

/**
 * Khởi tạo bộ nhớ đệm (Cache) đọc nhanh 1 lần cho toàn bộ bounding box của các dải ô
 */
function initSheetCache(sheet, allRanges) {
  if (allRanges.length === 0) return null;

  var startRow = 999999;
  var endRow = 0;
  var minCol = 999999;
  var maxCol = 0;
  for (var i = 0; i < allRanges.length; i++) {
    var r = allRanges[i];
    if (r.startRow < startRow) startRow = r.startRow;
    if (r.endRow > endRow) endRow = r.endRow;
    if (r.colIndex < minCol) minCol = r.colIndex;
    if (r.colIndex > maxCol) maxCol = r.colIndex;
  }

  var numRows = endRow - startRow + 1;
  var numCols = maxCol - minCol + 1;
  var range = sheet.getRange(startRow, minCol, numRows, numCols);
  var notes = range.getNotes();
  var values = range.getValues();
  var formulas = range.getFormulas();

  // Tạo bản sao lưu ban đầu để kiểm tra diff thay đổi
  var initialValues = [];
  var initialNotes = [];
  for (var r = 0; r < numRows; r++) {
    initialValues.push(values[r].slice());
    initialNotes.push(notes[r].slice());
  }

  return {
    startRow: startRow,
    endRow: endRow,
    minCol: minCol,
    maxCol: maxCol,
    notes: notes,
    values: values,
    formulas: formulas,
    initialValues: initialValues,
    initialNotes: initialNotes
  };
}

/**
 * Kiểm tra xem một ô có dữ liệu do người dùng tự nhập hoặc chỉnh sửa hay không.
 */
function isUserOccupiedCell(rIdx, cIdx, cache) {
  // BẢO VỆ CÔNG THỨC TUYỆT ĐỐI: Bất kỳ ô nào chứa công thức đều được bảo vệ
  if (cache.formulas && cache.formulas[rIdx] && cache.formulas[rIdx][cIdx] !== "") {
    return true;
  }

  var rawVal = cache.values[rIdx][cIdx];
  var note = String(cache.notes[rIdx][cIdx] || "");

  var isValEmpty = (rawVal === "" || rawVal === null || rawVal === undefined);
  var isNoteEmpty = (note.trim() === "");

  // Trường hợp 1: Ô hoàn toàn trống
  if (isValEmpty && isNoteEmpty) {
    return false;
  }

  // Trường hợp 2: Note có cờ "ADMIN" hoặc "- đã có chỉnh sửa tay" -> luôn bảo lưu 100%
  if (note.indexOf("ADMIN") !== -1 || note.indexOf("đã có chỉnh sửa tay") !== -1 || note.indexOf("chỉnh sửa tay") !== -1) {
    return true;
  }

  // Trường hợp 3: Ô có giá trị (số, chữ, công thức, ký tự)
  if (!isValEmpty) {
    var hasToolSignature = (note.indexOf("Mã số phiếu:") !== -1 || note.indexOf("Giá trị đã đồng bộ:") !== -1 || note.indexOf("Thời gian cập nhật:") !== -1);
    // Nếu ô không mang bất kỳ dấu hiệu nào của tool -> Người dùng tự gõ vào
    if (!hasToolSignature) {
      return true;
    }

    // Nếu có ghi chú của tool, kiểm tra xem người dùng có sửa số tiền trên ô hay không
    var match = note.match(/Giá trị đã đồng bộ:\s*([\d.,]+)/);
    if (match) {
      var lastSyncedVal = parseCleanCurrency(match[1]);
      var currentValNum = parseCleanCurrency(rawVal);
      // Nếu số tiền trên sheet khác với số tiền đã đồng bộ trước đó -> người dùng đã can thiệp sửa
      if (Math.abs(currentValNum - lastSyncedVal) >= 1) {
        return true;
      }
    }

    // Ô này thuần túy do tool ghi ở lần trước và chưa hề bị người dùng chỉnh sửa
    return false;
  }

  // Trường hợp 4: Giá trị rỗng nhưng ô có note do người dùng để lại
  if (note.indexOf("Mã số phiếu:") === -1 && note.indexOf("Giá trị đã đồng bộ:") === -1) {
    return true;
  }

  return false;
}

function isCellManuallyEdited(rIdx, cIdx, cache) {
  return isUserOccupiedCell(rIdx, cIdx, cache);
}

/**
 * Ghi toàn bộ dữ liệu từ Cache trở lại Sheet:
 * - Ưu tiên ghi nguyên tử Values + Notes qua Sheets API V4 updateCells batchUpdate trong 1 request duy nhất.
 * - Chỉ ghi các ô có thay đổi thực tế (diffed update).
 * - Fallback SpreadsheetApp với xử lý lỗi minh bạch, bảo vệ công thức tuyệt đối.
 */
function writeBackCache(sheet, ssId, sheetName, cache) {
  var numRows = cache.endRow - cache.startRow + 1;
  var numCols = cache.maxCol - cache.minCol + 1;

  // BẢO VỆ CÔNG THỨC TUYỆT ĐỐI: Phục hồi lại công thức ban đầu nếu có
  if (cache.formulas) {
    for (var r = 0; r < cache.formulas.length; r++) {
      for (var c = 0; c < cache.formulas[r].length; c++) {
        if (cache.formulas[r][c] !== "") {
          cache.values[r][c] = cache.formulas[r][c];
        }
      }
    }
  }

  // Kiểm tra diff thay đổi
  var hasChanges = false;
  for (var r = 0; r < numRows; r++) {
    for (var c = 0; c < numCols; c++) {
      if (cache.values[r][c] !== cache.initialValues[r][c] || cache.notes[r][c] !== cache.initialNotes[r][c]) {
        hasChanges = true;
        break;
      }
    }
    if (hasChanges) break;
  }

  if (!hasChanges) {
    return; // Không có thay đổi nào, không cần gọi API ghi
  }

  // Phương thức 1: Sheets API V4 Batch Update (Nguyên tử cả Values và Notes trong 1 request)
  if (typeof Sheets !== "undefined" && Sheets.Spreadsheets && Sheets.Spreadsheets.batchUpdate) {
    try {
      var rowsData = [];
      for (var r = 0; r < numRows; r++) {
        var rowCells = [];
        for (var c = 0; c < numCols; c++) {
          var val = cache.values[r][c];
          var note = cache.notes[r][c] || "";
          var cellData = { note: note };

          if (val === "" || val === null || val === undefined) {
            cellData.userEnteredValue = { stringValue: "" };
          } else if (typeof val === "string" && val.charAt(0) === "=") {
            cellData.userEnteredValue = { formulaValue: val };
          } else if (typeof val === "number" || (!isNaN(Number(val)) && typeof val !== "boolean")) {
            cellData.userEnteredValue = { numberValue: Number(val) };
          } else {
            cellData.userEnteredValue = { stringValue: String(val) };
          }

          rowCells.push(cellData);
        }
        rowsData.push({ values: rowCells });
      }

      var batchRequest = {
        requests: [
          {
            updateCells: {
              range: {
                sheetId: sheet.getSheetId(),
                startRowIndex: cache.startRow - 1,
                endRowIndex: cache.endRow,
                startColumnIndex: cache.minCol - 1,
                endColumnIndex: cache.maxCol
              },
              rows: rowsData,
              fields: "userEnteredValue,note"
            }
          }
        ]
      };

      Sheets.Spreadsheets.batchUpdate(batchRequest, ssId);
      return;
    } catch (eSheetsApi) {
      // Khi Sheets API V4 gặp lỗi thực sự hoặc chưa được cấp quyền, chuyển sang SpreadsheetApp
    }
  }

  // Phương thức 2: SpreadsheetApp fallback chuẩn
  var range = sheet.getRange(cache.startRow, cache.minCol, numRows, numCols);
  range.setValues(cache.values);
  range.setNotes(cache.notes);
}

/**
 * Phân tích chuỗi cấu hình dải ô (VD: "E6:E32,F6:F32" hoặc "D6:D32")
 */
function parseRanges(rangeStr) {
  var ranges = [];
  if (!rangeStr) return ranges;
  var parts = rangeStr.split(",");
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var match = part.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (match) {
      var colLetter = match[1].toUpperCase();
      var startRow = parseInt(match[2], 10);
      var endRow = parseInt(match[4], 10);
      ranges.push({
        colLetter: colLetter,
        colIndex: letterToCol(colLetter),
        startRow: startRow,
        endRow: endRow
      });
    }
  }
  return ranges;
}

/**
 * Chuyển đổi chữ cái cột (VD: "E") sang chỉ số số 1-indexed (VD: 5)
 */
function letterToCol(letter) {
  var column = 0, length = letter.length;
  for (var i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}

/**
 * Chuyển đổi chỉ số cột 1-indexed sang chữ cái (VD: 5 -> "E")
 */
function colToLetter(column) {
  var temp, letter = "";
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = Math.floor((column - temp - 1) / 26);
  }
  return letter;
}


/**
 * ============================================================================
 * PHẦN MỞ RỘNG: QUẢN LÝ, CHUẨN HÓA & SẮP XẾP SHEET NGÀY GIẢM DẦN (v4.2)
 * ============================================================================
 */

/**
 * Phân tích tên sheet để kiểm tra xem có phải là sheet ngày hay không.
 * Nhận diện cả định dạng chuẩn DD/MM/YYYY và các định dạng lệch ("D/M/YYYY", "DD/M/YYYY", "D/MM/YYYY", dấu gạch ngang, v.v.)
 * Trả về object { isDate: true, canonicalName: "DD/MM/YYYY", dateKey: YYYYMMDD, day: D, month: M, year: Y } hoặc null.
 */
function extractSheetDateInfo(sheetName) {
  if (!sheetName || typeof sheetName !== "string") return null;
  var str = sheetName.trim();

  // Pattern 1: D/M/YYYY hoặc DD/MM/YYYY với phân cách / hoặc - hoặc .
  var match = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (match) {
    var day = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var year = parseInt(match[3], 10);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1970 && year <= 2099) {
      var stdDay = ("0" + day).slice(-2);
      var stdMonth = ("0" + month).slice(-2);
      var canonicalName = stdDay + "/" + stdMonth + "/" + year;
      var dateKey = (year * 10000) + (month * 100) + day;
      return {
        isDate: true,
        canonicalName: canonicalName,
        dateKey: dateKey,
        day: day,
        month: month,
        year: year
      };
    }
  }

  // Pattern 2: ISO YYYY-MM-DD hoặc YYYY/MM/DD
  var isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    var yearIso = parseInt(isoMatch[1], 10);
    var monthIso = parseInt(isoMatch[2], 10);
    var dayIso = parseInt(isoMatch[3], 10);

    if (monthIso >= 1 && monthIso <= 12 && dayIso >= 1 && dayIso <= 31 && yearIso >= 1970 && yearIso <= 2099) {
      var stdDayIso = ("0" + dayIso).slice(-2);
      var stdMonthIso = ("0" + monthIso).slice(-2);
      var canonicalNameIso = stdDayIso + "/" + stdMonthIso + "/" + yearIso;
      var dateKeyIso = (yearIso * 10000) + (monthIso * 100) + dayIso;
      return {
        isDate: true,
        canonicalName: canonicalNameIso,
        dateKey: dateKeyIso,
        day: dayIso,
        month: monthIso,
        year: yearIso
      };
    }
  }

  return null;
}

/**
 * Sắp xếp và chuẩn hóa toàn bộ sheet trong Spreadsheet:
 * 1. Ghim cố định ở 2 vị trí ngoài cùng bên trái:
 *    - Vị trí 1: Sheet "INFO" (nếu có)
 *    - Vị trí 2: Sheet "NONE" (hoặc " NONE", sheet mẫu template)
 * 2. Tất cả các sheet ngày tháng:
 *    - Nhận diện các định dạng lệch ("DD/M/YYYY", "D/M/YYYY", "D/MM/YYYY", "DD-MM-YYYY", v.v.)
 *    - Tự động đổi tên về đúng chuẩn "DD/MM/YYYY" (VD: "14/9/2026" -> "14/09/2026", "5/5/2026" -> "05/05/2026", "1/02/2025" -> "01/02/2025")
 *    - Sắp xếp theo thứ tự ngày GIẢM DẦN (mới nhất -> cũ dần).
 *    - Khi sheet ngày mới được nhân bản từ "NONE", nó sẽ đứng ở vị trí ngày mới nhất,
 *      ngay bên trái của sheet ngày cũ liền kề nó!
 * 3. Các sheet khác (nếu có):
 *    - Xếp ở phía sau tất cả các sheet ngày tháng.
 * 4. Tối ưu hiệu năng:
 *    - Chỉ di chuyển các sheet thực sự bị lệch vị trí, tránh quá tải API.
 */
function sortAndNormalizeDateSheets(ss, preferredActiveSheet) {
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
    if (!ss) {
      ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
    }
  }

  var ssId = (ss && typeof ss.getId === "function") ? ss.getId() : DEFAULT_SPREADSHEET_ID;
  var allSheets = ss.getSheets();
  var infoSheets = [];
  var noneSheets = [];
  var dateSheets = [];
  var otherSheets = [];
  var renameMap = {}; // key: sheetId, value: { sheet, originalName, canonicalName }
  var renamedList = [];

  // Xác định sheet mẫu template
  var templateSheet = findTemplateSheet(ss);
  var templateSheetId = templateSheet ? templateSheet.getSheetId() : null;

  // 1. Phân loại từng sheet
  for (var i = 0; i < allSheets.length; i++) {
    var sh = allSheets[i];
    var rawName = sh.getName();
    var cleanUpper = rawName.trim().toUpperCase();

    // 1.1. Kiểm tra sheet INFO
    if (cleanUpper === "INFO") {
      infoSheets.push(sh);
      continue;
    }

    // 1.2. Kiểm tra sheet NONE / template
    if (templateSheetId && sh.getSheetId() === templateSheetId) {
      noneSheets.push(sh);
      continue;
    }
    if (cleanUpper === "NONE" || cleanUpper === "NONEEE" || cleanUpper === "TEMPLATE") {
      noneSheets.push(sh);
      continue;
    }

    // 1.3. Kiểm tra sheet ngày tháng (chuẩn hoặc lệch)
    var dInfo = extractSheetDateInfo(rawName);
    if (dInfo && dInfo.isDate) {
      dateSheets.push({
        sheet: sh,
        originalName: rawName,
        canonicalName: dInfo.canonicalName,
        dateKey: dInfo.dateKey
      });
      continue;
    }

    // 1.4. Các sheet còn lại
    otherSheets.push(sh);
  }

  // 2. Xác định các sheet ngày tháng lệch định dạng cần đổi tên về chuẩn DD/MM/YYYY
  for (var d = 0; d < dateSheets.length; d++) {
    var item = dateSheets[d];
    if (item.originalName !== item.canonicalName) {
      var existing = ss.getSheetByName(item.canonicalName);
      if (!existing) {
        renameMap[item.sheet.getSheetId()] = item;
        renamedList.push({
          from: item.originalName,
          to: item.canonicalName,
          sheetId: item.sheet.getSheetId()
        });
      } else {
        Logger.log("Đã có sheet mang tên chuẩn '" + item.canonicalName + "', giữ nguyên tên '" + item.originalName + "'");
      }
    }
  }

  // 3. Sắp xếp các sheet ngày tháng theo thứ tự GIẢM DẦN (mới nhất -> cũ dần)
  dateSheets.sort(function(a, b) {
    return b.dateKey - a.dateKey;
  });

  // 4. Tổng hợp danh sách sheet theo đúng thứ tự mong muốn:
  // [INFO] -> [NONE] -> [Ngày mới nhất -> Ngày cũ dần] -> [Các sheet khác]
  var orderedSheets = [];
  for (var i = 0; i < infoSheets.length; i++) orderedSheets.push(infoSheets[i]);
  for (var n = 0; n < noneSheets.length; n++) orderedSheets.push(noneSheets[n]);
  for (var ds = 0; ds < dateSheets.length; ds++) orderedSheets.push(dateSheets[ds].sheet);
  for (var o = 0; o < otherSheets.length; o++) orderedSheets.push(otherSheets[o]);

  // 5. Kiểm tra xem thứ tự hoặc tên có thực sự thay đổi không (Diff Optimization)
  var currentSheets = ss.getSheets();
  var hasOrderDifference = false;
  if (currentSheets.length !== orderedSheets.length) {
    hasOrderDifference = true;
  } else {
    for (var c = 0; c < orderedSheets.length; c++) {
      if (currentSheets[c].getSheetId() !== orderedSheets[c].getSheetId()) {
        hasOrderDifference = true;
        break;
      }
    }
  }

  var hasRenames = (renamedList.length > 0);
  var pinnedNames = [];
  for (var p = 0; p < infoSheets.length; p++) pinnedNames.push(infoSheets[p].getName());
  for (var p2 = 0; p2 < noneSheets.length; p2++) pinnedNames.push(noneSheets[p2].getName());

  if (!hasOrderDifference && !hasRenames) {
    if (preferredActiveSheet) {
      try { ss.setActiveSheet(preferredActiveSheet); } catch (eAct) {}
    }
    return {
      success: true,
      engine: "No-op (Thứ tự và tên sheet đã chuẩn 100%)",
      totalSheets: allSheets.length,
      pinnedSheets: pinnedNames,
      dateSheetsCount: dateSheets.length,
      renamedCount: 0,
      renamedSheets: [],
      movedCount: 0,
      orderedSheetNames: orderedSheets.map(function(s) { return s.getName(); })
    };
  }

  // 6. PHƯƠNG THỨC 1: TỐI ƯU HÓA BẰNG GOOGLE SHEETS API V4 (batchUpdate nguyên tử trong 1 request)
  var useSheetsApi = (typeof Sheets !== "undefined" && Sheets.Spreadsheets && Sheets.Spreadsheets.batchUpdate);
  var executedViaSheetsApi = false;

  if (useSheetsApi) {
    try {
      var batchRequests = [];

      // A. Đổi tên sheet và cập nhật ô C3 trong batchUpdate
      for (var sIdKey in renameMap) {
        if (renameMap.hasOwnProperty(sIdKey)) {
          var rInfo = renameMap[sIdKey];
          var numericSheetId = Number(sIdKey);

          // Request 1: Đổi tên sheet
          batchRequests.push({
            updateSheetProperties: {
              properties: {
                sheetId: numericSheetId,
                title: rInfo.canonicalName
              },
              fields: "title"
            }
          });

          // Request 2: Cập nhật giá trị ngày chuẩn vào ô C3 (Row 3, Col C: index 2, 2)
          batchRequests.push({
            updateCells: {
              range: {
                sheetId: numericSheetId,
                startRowIndex: 2,
                endRowIndex: 3,
                startColumnIndex: 2,
                endColumnIndex: 3
              },
              rows: [
                {
                  values: [
                    {
                      userEnteredValue: { stringValue: rInfo.canonicalName }
                    }
                  ]
                }
              ],
              fields: "userEnteredValue"
            }
          });
        }
      }

      // B. Sắp xếp vị trí các sheet theo thứ tự orderedSheets (chỉ số index 0-based)
      for (var pos = 0; pos < orderedSheets.length; pos++) {
        batchRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId: orderedSheets[pos].getSheetId(),
              index: pos
            },
            fields: "index"
          }
        });
      }

      if (batchRequests.length > 0) {
        Sheets.Spreadsheets.batchUpdate({ requests: batchRequests }, ssId);
        executedViaSheetsApi = true;
        Logger.log("Sheets API v4: Thực thi thành công " + batchRequests.length + " requests đổi tên & sắp xếp trong 1 atomic batchUpdate duy nhất!");
      }
    } catch (eSheetsApi) {
      Logger.log("Sheets API v4 gặp lỗi (hoặc chưa bật Advanced Service), chuyển sang fallback SpreadsheetApp: " + (eSheetsApi.message || eSheetsApi.toString()));
      executedViaSheetsApi = false;
    }
  }

  // 7. PHƯƠNG THỨC 2: FALLBACK SPREADSHEETAPP (khi Sheets API v4 chưa được kích hoạt hoặc gặp lỗi)
  var movedCount = 0;
  if (!executedViaSheetsApi) {
    // 7.1. Fallback đổi tên và C3
    for (var sIdKey2 in renameMap) {
      if (renameMap.hasOwnProperty(sIdKey2)) {
        var rInfo2 = renameMap[sIdKey2];
        try {
          rInfo2.sheet.setName(rInfo2.canonicalName);
          try {
            var c3Val = rInfo2.sheet.getRange("C3").getValue();
            if (!c3Val || String(c3Val).trim() === rInfo2.originalName) {
              rInfo2.sheet.getRange("C3").setNumberFormat("@").setValue(rInfo2.canonicalName);
            }
          } catch (eC3) {}
        } catch (eRen) {
          Logger.log("SpreadsheetApp fallback: Không thể đổi tên sheet '" + rInfo2.originalName + "': " + eRen.message);
        }
      }
    }

    // 7.2. Fallback di chuyển vị trí các sheet
    for (var pos2 = 0; pos2 < orderedSheets.length; pos2++) {
      var targetSheet = orderedSheets[pos2];
      var currentSheetsNow = ss.getSheets();
      if (currentSheetsNow[pos2] && currentSheetsNow[pos2].getSheetId() === targetSheet.getSheetId()) {
        continue;
      }
      try {
        ss.setActiveSheet(targetSheet);
        ss.moveActiveSheet(pos2 + 1);
        movedCount++;
      } catch (eMove) {
        Logger.log("SpreadsheetApp fallback: Lỗi di chuyển sheet " + targetSheet.getName() + " về vị trí " + (pos2 + 1) + ": " + eMove.message);
      }
    }
  } else {
    movedCount = orderedSheets.length;
  }

  // 8. Kích hoạt sheet ưu tiên (nếu có truyền vào)
  if (preferredActiveSheet) {
    try {
      ss.setActiveSheet(preferredActiveSheet);
    } catch (eAct) {}
  }

  return {
    success: true,
    engine: executedViaSheetsApi ? "Sheets API v4 (BatchUpdate)" : "SpreadsheetApp (Fallback)",
    totalSheets: allSheets.length,
    pinnedSheets: pinnedNames,
    dateSheetsCount: dateSheets.length,
    renamedCount: renamedList.length,
    renamedSheets: renamedList,
    movedCount: movedCount,
    orderedSheetNames: orderedSheets.map(function(s) { 
      var r = renameMap[s.getSheetId()];
      return r ? r.canonicalName : s.getName();
    })
  };
}

function dailyMidnightSortSheetsTrigger() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
    } catch (e2) {}
  }
  if (!ss) {
    Logger.log("dailyMidnightSortSheetsTrigger: Không tìm thấy Spreadsheet.");
    return { success: false, message: "Không tìm thấy Spreadsheet" };
  }

  var res = sortAndNormalizeDateSheets(ss);
  Logger.log("dailyMidnightSortSheetsTrigger: Hoàn tất sắp xếp lúc 00h: " + JSON.stringify(res));
  return res;
}

/**
 * Thiết lập Time-driven Trigger chạy lúc 00h hàng ngày (00:00 - 01:00) theo múi giờ Asia/Ho_Chi_Minh
 */
function setupDailyMidnightSortTrigger() {
  var functionName = "dailyMidnightSortSheetsTrigger";
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var trigger = ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .inTimezone("Asia/Ho_Chi_Minh")
    .create();

  var msg = "Đã thiết lập thành công Trigger chạy lúc 00h hàng ngày (Handler: " + functionName + ", Id: " + trigger.getUniqueId() + ")";
  Logger.log(msg);
  return { success: true, message: msg };
}