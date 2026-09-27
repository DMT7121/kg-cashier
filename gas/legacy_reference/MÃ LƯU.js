// function onOpen() {
//   // Thiết lập bảo vệ ban đầu khi mở file
//   protectSheet();
// }

// function protectSheet() {
//   var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
//   var sheet = spreadsheet.getSheetByName("DEMO (ĐỂ SAO CHÉP)");
  
//   if (!sheet) return; // Nếu sheet không tồn tại thì thoát
  
//   var protection = sheet.protect();
//   protection.setDescription('Sheet này được bảo vệ');
  
//   // Xóa tất cả các quyền hiện tại
//   protection.removeEditors(protection.getEditors());
  
//   // Chỉ cho phép chủ sở hữu chỉnh sửa
//   var me = Session.getActiveUser();
//   protection.addEditor(me);
// }

// function checkProtection() {
//   var ui = SpreadsheetApp.getUi();
//   var password = "712121"; // Thay đổi mật khẩu tại đây
  
//   var response = ui.prompt(
//     'Xác nhận bảo mật',
//     'Vui lòng nhập mật khẩu để thực hiện thao tác:',
//     ui.ButtonSet.OK_CANCEL
//   );
  
//   if (response.getSelectedButton() == ui.Button.OK) {
//     if (response.getResponseText() === password) {
//       ui.alert('Thành công', 'Mật khẩu đúng! Bạn có thể thực hiện thao tác.', ui.ButtonSet.OK);
//       // Tạm thời gỡ bảo vệ để thực hiện thao tác
//       var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DEMO (ĐỂ SAO CHÉP)");
//       var protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
//       if (protection) protection.remove();
//     } else {
//       ui.alert('Lỗi', 'Liên hệ Mr. Trí nha, thao tác này không được phép!', ui.ButtonSet.OK);
//     }
//   }
// }

// // Trigger khi có thay đổi trong spreadsheet
// function onEdit(e) {
//   protectSheet(); // Đảm bảo sheet luôn được bảo vệ sau mỗi chỉnh sửa
// }

// // Trigger khi có thay đổi cấu trúc spreadsheet
// function onChange(e) {
//   var changeType = e.changeType;
//   if (changeType === 'REMOVE_GRID' || // Xóa sheet
//       changeType === 'OTHER' ||      // Đổi tên sheet
//       changeType === 'FORMAT') {     // Ẩn sheet
//     checkProtection();
//     protectSheet();
//   }
// }

// -----------------------------------
// function onEdit(e) {
//   var sheet = e.source.getActiveSheet();
//   var range = e.range;
//   var ui = SpreadsheetApp.getUi();
  
//   // Kiểm tra xem chỉnh sửa có xảy ra trong sheet "TIỀN LẺ" không
//   if (sheet.getName() === "TIỀN LẺ") {
//     var cellA12 = sheet.getRange("A12");
//     var correctPassword = "712121";
    
//     // Nếu chỉnh sửa xảy ra ở ô A12
//     if (range.getA1Notation() === "A12") {
//       ui.alert('Lỗi', 'Liên hệ Mr. Trí nhé, thao tác này bị hạn chế!', ui.ButtonSet.OK);
//       updateLastModified(cellA12); // Khôi phục giá trị thời gian
//       protectCellA12(sheet, cellA12);
//       return;
//     }
    
//     // Yêu cầu nhập mật khẩu cho mọi chỉnh sửa khác
//     var response = ui.prompt(
//       'Xác nhận bảo mật',
//       'Vui lòng nhập mật khẩu để thực hiện chỉnh sửa:',
//       ui.ButtonSet.OK_CANCEL
//     );
    
//     if (response.getSelectedButton() == ui.Button.OK) {
//       if (response.getResponseText() === correctPassword) {
//         // Nếu mật khẩu đúng, cập nhật thời gian ở A12
//         updateLastModified(cellA12);
//       } else {
//         // Nếu mật khẩu sai, hoàn tác chỉnh sửa và thông báo
//         ui.alert('Lỗi', 'Liên hệ Mr. Trí nhé, thao tác này bị hạn chế!', ui.ButtonSet.OK);
//         SpreadsheetApp.getActiveSpreadsheet().toast('Đã hoàn tác chỉnh sửa.');
//         e.source.getActiveSheet().getRange(range.getA1Notation()).setValue(e.oldValue); // Hoàn tác
//       }
//     } else {
//       // Nếu hủy, hoàn tác chỉnh sửa
//       SpreadsheetApp.getActiveSpreadsheet().toast('Đã hoàn tác chỉnh sửa.');
//       e.source.getActiveSheet().getRange(range.getA1Notation()).setValue(e.oldValue); // Hoàn tác
//     }
    
//     // Bảo vệ ô A12
//     protectCellA12(sheet, cellA12);
//   }
// }

// function updateLastModified(cell) {
//   var now = new Date();
//   var formattedDate = Utilities.formatDate(now, "GMT+7", "HH:mm dd/MM/yyyy");
//   cell.setValue("Cập nhật lần cuối vào " + formattedDate);
// }

// function protectCellA12(sheet, cell) {
//   var protection = cell.protect();
//   protection.setDescription('Ô A12 được bảo vệ');
  
//   // Xóa tất cả các quyền hiện tại
//   protection.removeEditors(protection.getEditors());
  
//   // Chỉ cho phép chủ sở hữu chỉnh sửa (nhưng vẫn bị chặn bởi logic)
//   var me = Session.getActiveUser();
//   protection.addEditor(me);
// }

// function onOpen() {
//   // Khởi tạo bảo vệ ô A12 khi mở file
//   var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TIỀN LẺ");
//   if (sheet) {
//     var cellA12 = sheet.getRange("A12");
//     protectCellA12(sheet, cellA12);
//   }
// }



// -------------------------------------------------
// function copyFormulasToRightSheets() {
//   // Lấy spreadsheet hiện tại
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sourceSheetName = "29/03/2025";
  
//   // Lấy sheet nguồn
//   const sourceSheet = ss.getSheetByName(sourceSheetName);
//   if (!sourceSheet) {
//     Logger.log("Không tìm thấy sheet: " + sourceSheetName);
//     return;
//   }
  
//   // Lấy tất cả các sheet trong spreadsheet
//   const allSheets = ss.getSheets();
  
//   // Tìm vị trí của sheet nguồn
//   let sourceSheetIndex = -1;
//   for (let i = 0; i < allSheets.length; i++) {
//     if (allSheets[i].getName() === sourceSheetName) {
//       sourceSheetIndex = i;
//       break;
//     }
//   }
  
//   if (sourceSheetIndex === -1) {
//     Logger.log("Không tìm thấy sheet nguồn trong spreadsheet");
//     return;
//   }
  
//   // Lấy PropertiesService để lưu trạng thái
//   const scriptProperties = PropertiesService.getScriptProperties();
//   const lastProcessedSheet = scriptProperties.getProperty("lastProcessedSheet");
  
//   // Xác định index bắt đầu xử lý
//   let startIndex = sourceSheetIndex + 1;
//   if (lastProcessedSheet) {
//     for (let i = 0; i < allSheets.length; i++) {
//       if (allSheets[i].getName() === lastProcessedSheet) {
//         startIndex = i + 1;
//         break;
//       }
//     }
//   }
  
//   // Lấy công thức từ dải ô J7:J15 của sheet nguồn
//   const rangeToCopy = sourceSheet.getRange("J7:J15");
//   const formulas = rangeToCopy.getFormulas();
  
//   // Dán công thức vào các sheet bên phải
//   let processedAnySheet = false;
//   for (let i = startIndex; i < allSheets.length; i++) {
//     const targetSheet = allSheets[i];
    
//     // Bỏ qua sheet nguồn
//     if (targetSheet.getName() === sourceSheetName) continue;
    
//     // Dán công thức vào dải ô J7:J15 của sheet đích
//     const targetRange = targetSheet.getRange("J7:J15");
//     targetRange.setFormulas(formulas);
    
//     // Lưu tên sheet vừa xử lý
//     scriptProperties.setProperty("lastProcessedSheet", targetSheet.getName());
//     processedAnySheet = true;
    
//     // Log để kiểm tra
//     Logger.log("Đã copy công thức sang sheet: " + targetSheet.getName());
//   }
  
//   // Nếu không xử lý sheet nào (đã xử lý hết), reset trạng thái
//   if (!processedAnySheet && lastProcessedSheet) {
//     scriptProperties.deleteProperty("lastProcessedSheet");
//     Logger.log("Đã xử lý hết các sheet. Reset trạng thái.");
//   }
// }

// // Hàm reset trạng thái (tùy chọn, để chạy lại từ đầu nếu cần)
// function resetProcessedState() {
//   PropertiesService.getScriptProperties().deleteProperty("lastProcessedSheet");
//   Logger.log("Đã reset trạng thái xử lý.");
// }