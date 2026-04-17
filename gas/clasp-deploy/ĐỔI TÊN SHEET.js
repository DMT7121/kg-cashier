function doiTenSheetTheoNgay() {
  // Mở Spreadsheet hiện hành
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Lấy Sheet cần đổi tên
  var sheet = ss.getActiveSheet();  
  
  // Lấy giá trị từ ô C3
  var dateValue = sheet.getRange("C3").getValue();
  
  // Khai báo biến cho đối tượng Date
  var dateObj;
  
  // Kiểm tra kiểu dữ liệu của dateValue
  if (dateValue instanceof Date) {
    // Nếu đã là Date, sử dụng trực tiếp
    dateObj = dateValue;
  } else if (typeof dateValue === "string") {
    // Nếu là chuỗi, chuyển đổi thành Date
    // Giả sử định dạng chuỗi là "dd/MM/yyyy"
    var parts = dateValue.split("/");
    if (parts.length === 3) {
      var day = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1; // Tháng trong JS bắt đầu từ 0
      var year = parseInt(parts[2], 10);
      dateObj = new Date(year, month, day);
      if (isNaN(dateObj.getTime())) {
        Logger.log("Giá trị trong ô C3 không phải là ngày hợp lệ.");
        return;
      }
    } else {
      Logger.log("Định dạng ngày trong ô C3 không đúng.");
      return;
    }
  } else {
    Logger.log("Giá trị trong ô C3 không phải là ngày.");
    return;
  }
  
  // Định dạng ngày thành "dd/MM/yyyy"
  var newSheetName = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");

  // Đổi tên sheet
  sheet.setName(newSheetName);
}