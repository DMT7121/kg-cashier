/**
 * Menu handler: Sắp xếp sheet ngày giảm dần theo chuẩn King's Grill (INFO, NONE, ngày mới -> cũ)
 */
function manualSortDateSheetsMenu() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
    }
    var res = sortAndNormalizeDateSheets(ss);
    try {
      ss.toast(
        (res.message || "Đã hoàn tất sắp xếp sheet ngày giảm dần."),
        "⚡ King's Grill",
        5
      );
    } catch (eToast) {
      console.log(res.message);
    }
  } catch (err) {
    console.error("manualSortDateSheetsMenu error:", err);
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast("Lỗi sắp xếp: " + err.message, "Lỗi", 5);
    } catch (e) {}
  }
}

/**
 * Menu handler: Cài đặt trigger tự động sắp xếp lúc 00h hàng ngày
 */
function setupDailyMidnightSortTriggerMenu() {
  try {
    var res = setupDailyMidnightSortTrigger();
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        res.message || "Đã cài đặt tự động sắp xếp lúc 00h hàng ngày.",
        "⏰ Trigger 00h",
        5
      );
    } catch (eToast) {
      console.log(res.message);
    }
  } catch (err) {
    console.error("setupDailyMidnightSortTriggerMenu error:", err);
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast("Lỗi cài trigger: " + err.message, "Lỗi", 5);
    } catch (e) {}
  }
}

/**
 * Menu handler: Dọn dẹp dòng giao dịch CK/ATM trùng lặp trên sheet hiện tại
 */
function deduplicateActiveSheetMenu() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var sheetName = sheet.getName();
    var ssId = ss.getId();

    var res = deduplicateSheet(sheet, ssId, sheetName, {});
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        res.message || "Đã dọn dẹp trùng lặp thành công.",
        "🧹 Dọn Dẹp Trùng Lặp",
        6
      );
    } catch (eToast) {
      console.log(res.message);
    }
  } catch (err) {
    console.error("deduplicateActiveSheetMenu error:", err);
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast("Lỗi dọn dẹp: " + err.message, "Lỗi", 5);
    } catch (e) {}
  }
}

function onOpen(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    if (!ui) {
      console.warn("⚠️ onOpen: Không thể lấy UI context. Vui lòng mở Google Spreadsheet trong trình duyệt và nhấn F5 để tải menu.");
      return;
    }

    // 1. Menu King's Grill & Vận Hành Sapo POS
    ui.createMenu("⚡ King's Grill")
      .addItem("📅 Sắp Xếp Sheet Ngày Giảm Dần", "manualSortDateSheetsMenu")
      .addItem("⏰ Cài Đặt Tự Động Sắp Xếp Lúc 00h", "setupDailyMidnightSortTriggerMenu")
      .addSeparator()
      .addItem("🧹 Dọn Dẹp Dòng CK/ATM Trùng Lặp (Sheet Hiện Tại)", "deduplicateActiveSheetMenu")
      .addToUi();

    // 2. Menu Đồng Bộ 2 Chiều C3 ↔ Tên Sheet
    ui.createMenu('🔄 Đồng bộ ngày')
      .addItem('Đổi tên Sheet theo C3', 'renameActiveSheetFromC3')
      .addItem('Kiểm tra đồng bộ ngay', 'syncSheetNamesNow')
      .addSeparator()
      .addItem('Cài đặt / cài lại Trigger 2 chiều', 'setupDateSheetSync')
      .addToUi();

    // 3. Menu Quản Lý Sheet Pro & Tự Động Hóa
    ui.createMenu('🔧 Quản Lý Sheet')
      .addItem('📊 Mở Bảng Điều Khiển', 'showSidebar')
      .addSeparator()
      .addItem('🔼 Sắp xếp tăng dần', 'sortSheetsAscending')
      .addItem('🔽 Sắp xếp giảm dần', 'sortSheetsDescending')
      .addItem('👁️ Ẩn sheet cũ', 'hideOldSheets')
      .addToUi();

  } catch (err) {
    if (err && err.message && err.message.indexOf('Cannot call SpreadsheetApp.getUi') !== -1) {
      console.info("ℹ️ Lưu ý: Hàm onOpen dùng để tạo Menu trên thanh công cụ của Google Spreadsheet, KHÔNG THỂ chạy bằng nút 'Chạy' (Run) trong trình soạn thảo Apps Script.\n👉 Hãy quay lại tab Google Spreadsheet (https://docs.google.com/spreadsheets/d/" + DEFAULT_SPREADSHEET_ID + ") và bấm F5 (Tải lại trang) - Menu sẽ xuất hiện ngay lập tức!");
    } else {
      console.error('onOpen error:', err);
    }
  }
}