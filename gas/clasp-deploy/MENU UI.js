// // Hàm này được gọi khi mở spreadsheet để tạo menu UI
// function onOpen() {
//   var ui = SpreadsheetApp.getUi();
//   ui.createMenu('Tùy Chỉnh Menu')
//     .addItem('Ẩn Sheet Ngoại Trừ 7 Sheet Đầu Tiên', 'hideSheetsExceptFirstSeven')
//     .addItem('Đổi Tên Sheet Theo Ngày', 'doiTenSheetTheoNgay')
//     .addToUi();
// }

// // Hàm để ẩn tất cả các sheet ngoại trừ 7 sheet đầu tiên
// function hideSheetsExceptFirstSeven() {
//   var ss = SpreadsheetApp.getActiveSpreadsheet();
//   var sheets = ss.getSheets();
//   var sheetCount = sheets.length;

//   // Kiểm tra nếu có nhiều hơn 7 sheet
//   if (sheetCount <= 7) {
//     SpreadsheetApp.getUi().alert('Không có đủ sheet để ẩn.');
//     return;
//   }

//   try {
//     // Lặp qua tất cả các sheet từ thứ 8 trở đi và ẩn chúng
//     for (var i = 7; i < sheetCount; i++) {
//       sheets[i].hideSheet();
//     }

//     // Hiển thị thông báo hoàn thành
//     SpreadsheetApp.getUi().alert('Đã hoàn thành ẩn các sheet cũ.');
//   } catch (error) {
//     // Hiển thị thông báo lỗi nếu có lỗi xảy ra
//     SpreadsheetApp.getUi().alert('Đã xảy ra lỗi: ' + error.message);
//   }
// }

// // Hàm để đổi tên sheet hiện tại theo ngày trong ô C3
// function doiTenSheetTheoNgay() {
//   // Mở Spreadsheet hiện hành
//   var ss = SpreadsheetApp.getActiveSpreadsheet();
  
//   // Lấy Sheet cần đổi tên
//   var sheet = ss.getActiveSheet();  
  
//   // Lấy giá trị từ ô C3
//   var dateValue = sheet.getRange("C3").getValue();
  
//   // Khai báo biến cho đối tượng Date
//   var dateObj;
  
//   // Kiểm tra kiểu dữ liệu của dateValue
//   if (dateValue instanceof Date) {
//     // Nếu đã là Date, sử dụng trực tiếp
//     dateObj = dateValue;
//   } else if (typeof dateValue === "string") {
//     // Nếu là chuỗi, chuyển đổi thành Date
//     // Giả sử định dạng chuỗi là "dd/MM/yyyy"
//     var parts = dateValue.split("/");
//     if (parts.length === 3) {
//       var day = parseInt(parts[0], 10);
//       var month = parseInt(parts[1], 10) - 1; // Tháng trong JS bắt đầu từ 0
//       var year = parseInt(parts[2], 10);
//       dateObj = new Date(year, month, day);
//       if (isNaN(dateObj.getTime())) {
//         Logger.log("Giá trị trong ô C3 không phải là ngày hợp lệ.");
//         return;
//       }
//     } else {
//       Logger.log("Định dạng ngày trong ô C3 không đúng.");
//       return;
//     }
//   } else {
//     Logger.log("Giá trị trong ô C3 không phải là ngày.");
//     return;
//   }
  
//   // Định dạng ngày thành "dd/MM/yyyy"
//   var newSheetName = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");

//   // Đổi tên sheet
//   sheet.setName(newSheetName);
// }