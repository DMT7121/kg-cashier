// // ============== KHỞI TẠO VÀ CẤU HÌNH ==============

// function onOpen() {
//   const ui = SpreadsheetApp.getUi();
//   ui.createMenu('🔧 Quản Lý Sheet')
//     .addItem('📊 Mở Bảng Điều Khiển', 'showSidebar')
//     .addToUi();
// }

// function showSidebar() {
//   const html = HtmlService.createTemplateFromFile('Index')
//     .evaluate()
//     .setWidth(420)
//     .setTitle('🔧 Hệ Thống Quản Lý Sheet Pro');
  
//   SpreadsheetApp.getUi().showSidebar(html);
// }

// function include(filename) {
//   return HtmlService.createHtmlOutputFromFile(filename).getContent();
// }

// // ============== SIMPLE TRIGGER onEdit - ĐÃ SỬA LỖI ==============

// /**
//  * FIXED: Simple trigger onEdit - tự động gọi khi có chỉnh sửa
//  */
// function onEdit(e) {
//   try {
//     console.log('🔔 onEdit triggered');
    
//     if (!e || !e.source) {
//       console.log('❌ Invalid edit event');
//       return;
//     }
    
//     const properties = PropertiesService.getScriptProperties();
    
//     // FIXED: Kiểm tra auto rename với delay để tránh conflict
//     const autoRenameEnabled = properties.getProperty('automation_autoRename') === 'true';
//     console.log(`🔧 Auto rename enabled: ${autoRenameEnabled}`);
    
//     if (autoRenameEnabled) {
//       // Delay nhỏ để đảm bảo edit operation hoàn thành
//       Utilities.sleep(500);
//       handleAutoRename(e);
//     }
    
//     // FIXED: Kiểm tra auto booking với delay
//     const autoBookingEnabled = properties.getProperty('automation_autoBooking') === 'true';
//     console.log(`📅 Auto booking enabled: ${autoBookingEnabled}`);
    
//     if (autoBookingEnabled) {
//       Utilities.sleep(700);
//       handleAutoBooking(e);
//     }
    
//   } catch (error) {
//     console.error('❌ onEdit error:', error);
//   }
// }

// /**
//  * FIXED: Xử lý auto rename với validation đầy đủ
//  */
// function handleAutoRename(e) {
//   try {
//     console.log('🔄 Starting auto rename process');
    
//     const configs = loadConfigurations();
//     if (configs.length === 0) {
//       console.log('❌ No configurations available for auto rename');
//       return;
//     }
    
//     const sheet = e.source.getActiveSheet();
//     const sheetName = sheet.getName();
//     const config = configs[0]; // Sử dụng cấu hình đầu tiên
    
//     console.log(`🎯 Processing sheet: ${sheetName} with config: ${config.name}`);
    
//     // FIXED: Lấy dữ liệu cần thiết từ sheet hiện tại
//     const dynamicValues = {};
    
//     config.components.forEach(component => {
//       if (component.valueType === 'dynamic' && component.value) {
//         try {
//           const cellValue = sheet.getRange(component.value).getValue();
//           dynamicValues[component.value] = cellValue;
//           console.log(`📊 ${component.name} (${component.value}): ${cellValue}`);
//         } catch (err) {
//           console.error(`❌ Error reading ${component.value}:`, err);
//           dynamicValues[component.value] = '';
//         }
//       }
//     });
    
//     // FIXED: Tạo tên mới theo cấu hình
//     const newName = generateSheetNameFromConfig(config, dynamicValues);
//     console.log(`🏷️ Generated name: ${newName}`);
    
//     if (newName && newName !== sheetName && newName.length <= 100) {
//       // FIXED: Kiểm tra trùng tên trước khi đổi
//       const allSheets = e.source.getSheets();
//       const existingNames = allSheets.map(s => s.getName().toUpperCase());
      
//       if (!existingNames.includes(newName.toUpperCase())) {
//         try {
//           sheet.setName(newName.toUpperCase());
//           console.log(`✅ Auto renamed to: ${newName.toUpperCase()}`);
//         } catch (renameError) {
//           console.error(`❌ Rename failed: ${renameError}`);
//         }
//       } else {
//         console.log(`⚠️ Name already exists: ${newName}`);
//       }
//     } else {
//       console.log(`ℹ️ No rename needed. Current: ${sheetName}, New: ${newName}`);
//     }
    
//   } catch (error) {
//     console.error('❌ Auto rename error:', error);
//   }
// }

// /**
//  * FIXED: Xử lý auto booking với validation
//  */
// function handleAutoBooking(e) {
//   try {
//     console.log('📅 Starting auto booking process');
    
//     const configs = loadConfigurations();
//     const validConfig = configs.find(c => 
//       c.externalSpreadsheetId === '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY'
//     );
    
//     if (!validConfig) {
//       console.log('❌ No valid booking configuration found');
//       return;
//     }
    
//     const sheet = e.source.getActiveSheet();
//     const sheetName = sheet.getName();
    
//     console.log(`📅 Auto booking for sheet: ${sheetName} with config: ${validConfig.name}`);
    
//     // Sử dụng Advanced API để xử lý booking
//     const result = addBookingSchedule([sheetName], validConfig.name);
//     console.log('✅ Auto booking result:', result);
    
//   } catch (error) {
//     console.error('❌ Auto booking error:', error);
//   }
// }

// // ============== ADVANCED SHEETS API UTILITIES ==============

// /**
//  * Lấy thông tin spreadsheet siêu nhanh bằng Advanced API
//  */
// function getSpreadsheetDataAdvanced(spreadsheetId = null) {
//   try {
//     const id = spreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId();
    
//     // Sử dụng Advanced Sheets API để lấy toàn bộ thông tin
//     const spreadsheet = Sheets.Spreadsheets.get(id, {
//       includeGridData: false,
//       fields: 'sheets.properties,properties.title'
//     });
    
//     return {
//       success: true,
//       id: id,
//       title: spreadsheet.properties.title,
//       sheets: spreadsheet.sheets.map(sheet => ({
//         sheetId: sheet.properties.sheetId,
//         title: sheet.properties.title,
//         index: sheet.properties.index,
//         hidden: sheet.properties.hidden || false,
//         gridProperties: sheet.properties.gridProperties
//       }))
//     };
    
//   } catch (error) {
//     return {
//       success: false,
//       message: 'Lỗi Advanced API: ' + error.toString()
//     };
//   }
// }

// /**
//  * Thực hiện batch operations siêu nhanh
//  */
// function executeBatchOperations(spreadsheetId, requests) {
//   try {
//     const response = Sheets.Spreadsheets.batchUpdate({
//       requests: requests
//     }, spreadsheetId);
    
//     return {
//       success: true,
//       data: response,
//       message: `Đã thực hiện ${requests.length} thao tác thành công`
//     };
    
//   } catch (error) {
//     return {
//       success: false,
//       message: 'Lỗi batch operation: ' + error.toString()
//     };
//   }
// }

// /**
//  * FIXED: Lấy dữ liệu từ nhiều ranges cùng lúc với validation tốt hơn
//  */
// function getBatchRangeValues(spreadsheetId, ranges) {
//   try {
//     console.log(`📊 Getting batch values for ${ranges.length} ranges`);
//     console.log('📊 Ranges:', ranges);
    
//     if (!ranges || ranges.length === 0) {
//       return {
//         success: false,
//         message: 'Không có range nào để lấy dữ liệu'
//       };
//     }
    
//     const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
//       ranges: ranges,
//       valueRenderOption: 'UNFORMATTED_VALUE',
//       dateTimeRenderOption: 'FORMATTED_STRING'
//     });
    
//     console.log(`✅ Got ${response.valueRanges.length} value ranges`);
    
//     return {
//       success: true,
//       valueRanges: response.valueRanges
//     };
    
//   } catch (error) {
//     console.error('❌ getBatchRangeValues error:', error);
//     return {
//       success: false,
//       message: 'Lỗi lấy batch values: ' + error.toString()
//     };
//   }
// }

// /**
//  * FIXED: Cập nhật nhiều ranges cùng lúc với validation JSON payload
//  */
// function setBatchRangeValues(spreadsheetId, valueRanges) {
//   try {
//     console.log(`📝 Setting batch values for ${valueRanges.length} ranges`);
    
//     // FIXED: Validate và clean data trước khi gửi
//     const cleanedValueRanges = valueRanges.map(valueRange => {
//       return {
//         range: valueRange.range,
//         majorDimension: valueRange.majorDimension || 'ROWS',
//         values: valueRange.values || []
//       };
//     });
    
//     console.log('📝 Cleaned value ranges:', JSON.stringify(cleanedValueRanges, null, 2));
    
//     const requestBody = {
//       valueInputOption: 'USER_ENTERED',
//       data: cleanedValueRanges
//     };
    
//     console.log('📝 Request body:', JSON.stringify(requestBody, null, 2));
    
//     const response = Sheets.Spreadsheets.Values.batchUpdate(requestBody, spreadsheetId);
    
//     return {
//       success: true,
//       data: response,
//       message: `Đã cập nhật ${valueRanges.length} vùng dữ liệu`
//     };
    
//   } catch (error) {
//     console.error('❌ setBatchRangeValues error:', error);
//     return {
//       success: false,
//       message: 'Lỗi cập nhật batch values: ' + error.toString()
//     };
//   }
// }

// // ============== QUẢN LÝ CẤU HÌNH ==============

// function saveConfiguration(config) {
//   try {
//     const properties = PropertiesService.getScriptProperties();
//     const configKey = 'sheetConfig_' + config.name;
    
//     // Lưu với timestamp để tracking
//     config.lastModified = new Date().toISOString();
//     config.version = '2.0';
    
//     properties.setProperty(configKey, JSON.stringify(config));
    
//     // Lưu danh sách configs để tối ưu truy xuất
//     const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
//     if (!configsList.includes(config.name)) {
//       configsList.push(config.name);
//       properties.setProperty('configsList', JSON.stringify(configsList));
//     }
    
//     return { 
//       success: true, 
//       message: '✅ Cấu hình đã được lưu thành công!',
//       timestamp: config.lastModified
//     };
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi lưu cấu hình: ' + error.toString()
//     };
//   }
// }

// function loadConfigurations() {
//   try {
//     const properties = PropertiesService.getScriptProperties();
//     const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
//     const configs = [];
    
//     configsList.forEach(configName => {
//       try {
//         const configData = properties.getProperty('sheetConfig_' + configName);
//         if (configData) {
//           const config = JSON.parse(configData);
//           configs.push(config);
//         }
//       } catch (e) {
//         console.error('Error parsing config:', configName, e);
//       }
//     });
    
//     return configs.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
//   } catch (error) {
//     console.error('Error loading configurations:', error);
//     return [];
//   }
// }

// function deleteConfiguration(configName) {
//   try {
//     const properties = PropertiesService.getScriptProperties();
    
//     // Xóa config
//     properties.deleteProperty('sheetConfig_' + configName);
    
//     // Cập nhật danh sách
//     const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
//     const updatedList = configsList.filter(name => name !== configName);
//     properties.setProperty('configsList', JSON.stringify(updatedList));
    
//     return { 
//       success: true, 
//       message: '✅ Đã xóa cấu hình: ' + configName 
//     };
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi xóa cấu hình: ' + error.toString()
//     };
//   }
// }

// function getSpreadsheetInfo(spreadsheetId) {
//   try {
//     if (!spreadsheetId || spreadsheetId.trim() === '') {
//       return { success: false, message: 'ID spreadsheet không hợp lệ' };
//     }
    
//     // Sử dụng Advanced API để lấy thông tin nhanh
//     const spreadsheet = Sheets.Spreadsheets.get(spreadsheetId, {
//       fields: 'properties.title'
//     });
    
//     return { 
//       success: true, 
//       name: spreadsheet.properties.title,
//       url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
//     };
//   } catch (error) {
//     return {
//       success: false,
//       message: 'Không thể truy cập spreadsheet: ' + error.toString()
//     };
//   }
// }

// // ============== QUẢN LÝ SHEET VỚI ADVANCED API ==============

// function getAllSheets() {
//   try {
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return [];
//     }
    
//     return spreadsheetData.sheets.map(sheet => ({
//       name: sheet.title,
//       sheetId: sheet.sheetId,
//       isHidden: sheet.hidden,
//       index: sheet.index,
//       rowCount: sheet.gridProperties ? sheet.gridProperties.rowCount : 1000,
//       columnCount: sheet.gridProperties ? sheet.gridProperties.columnCount : 26
//     }));
//   } catch (error) {
//     console.error('Error getting sheets:', error);
//     return [];
//   }
// }

// function searchSheets(keyword) {
//   try {
//     const allSheets = getAllSheets();
    
//     if (!keyword || keyword.trim() === '') {
//       return allSheets;
//     }
    
//     const lowercaseKeyword = keyword.toLowerCase();
//     return allSheets.filter(sheet => 
//       sheet.name.toLowerCase().includes(lowercaseKeyword)
//     );
//   } catch (error) {
//     console.error('Error searching sheets:', error);
//     return [];
//   }
// }

// function toggleSheetVisibility(sheetName) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//     if (!sheet) {
//       return { success: false, message: 'Không tìm thấy sheet: ' + sheetName };
//     }
    
//     const newHiddenState = !sheet.hidden;
    
//     // Sử dụng Advanced API để cập nhật trạng thái
//     const requests = [{
//       updateSheetProperties: {
//         properties: {
//           sheetId: sheet.sheetId,
//           hidden: newHiddenState
//         },
//         fields: 'hidden'
//       }
//     }];
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ ${newHiddenState ? 'Đã ẩn' : 'Đã hiển thị'} sheet: ${sheetName}`,
//         isHidden: newHiddenState 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi thay đổi trạng thái sheet: ' + error.toString()
//     };
//   }
// }

// function pinSheet(sheetName) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//     if (!sheet) {
//       return { success: false, message: 'Không tìm thấy sheet: ' + sheetName };
//     }
    
//     // Di chuyển sheet về vị trí đầu tiên bằng Advanced API
//     const requests = [{
//       updateSheetProperties: {
//         properties: {
//           sheetId: sheet.sheetId,
//           index: 0
//         },
//         fields: 'index'
//       }
//     }];
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       // Lưu thông tin sheet được ghim
//       const properties = PropertiesService.getScriptProperties();
//       const pinnedSheets = JSON.parse(properties.getProperty('pinnedSheets') || '[]');
      
//       if (!pinnedSheets.includes(sheetName)) {
//         pinnedSheets.push(sheetName);
//         properties.setProperty('pinnedSheets', JSON.stringify(pinnedSheets));
//       }
      
//       return { 
//         success: true, 
//         message: '📌 Đã ghim sheet: ' + sheetName 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi ghim sheet: ' + error.toString()
//     };
//   }
// }

// function getPinnedSheets() {
//   try {
//     const properties = PropertiesService.getScriptProperties();
//     return JSON.parse(properties.getProperty('pinnedSheets') || '[]');
//   } catch (error) {
//     console.error('Error getting pinned sheets:', error);
//     return [];
//   }
// }

// // ============== THAO TÁC SHEET VỚI ADVANCED API ==============

// function sortSheetsAscending(selectedSheets = []) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const pinnedSheets = getPinnedSheets();
    
//     // Lọc và sắp xếp sheets
//     let sheetsToSort = spreadsheetData.sheets.filter(sheet => 
//       !pinnedSheets.includes(sheet.title) &&
//       (selectedSheets.length === 0 || selectedSheets.includes(sheet.title))
//     );
    
//     // Sắp xếp theo logic phức tạp
//     sheetsToSort.sort((a, b) => {
//       const dateA = extractDateFromSheetName(a.title);
//       const dateB = extractDateFromSheetName(b.title);
      
//       if (dateA && dateB) {
//         const diff = dateA.getTime() - dateB.getTime();
//         if (diff !== 0) return diff;
//       }
      
//       return naturalSort(a.title, b.title);
//     });
    
//     // Tạo batch requests để di chuyển sheets
//     const requests = [];
//     const pinnedCount = pinnedSheets.length;
    
//     sheetsToSort.forEach((sheet, index) => {
//       const newIndex = pinnedCount + index;
//       if (sheet.index !== newIndex) {
//         requests.push({
//           updateSheetProperties: {
//             properties: {
//               sheetId: sheet.sheetId,
//               index: newIndex
//             },
//             fields: 'index'
//           }
//         });
//       }
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Sheets đã được sắp xếp đúng thứ tự' };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã sắp xếp ${sheetsToSort.length} sheet theo thứ tự tăng dần` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi sắp xếp: ' + error.toString()
//     };
//   }
// }

// function sortSheetsDescending(selectedSheets = []) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const pinnedSheets = getPinnedSheets();
    
//     // Lọc và sắp xếp sheets
//     let sheetsToSort = spreadsheetData.sheets.filter(sheet => 
//       !pinnedSheets.includes(sheet.title) &&
//       (selectedSheets.length === 0 || selectedSheets.includes(sheet.title))
//     );
    
//     // Sắp xếp theo logic phức tạp (ngược lại)
//     sheetsToSort.sort((a, b) => {
//       const dateA = extractDateFromSheetName(a.title);
//       const dateB = extractDateFromSheetName(b.title);
      
//       if (dateA && dateB) {
//         const diff = dateB.getTime() - dateA.getTime();
//         if (diff !== 0) return diff;
//       }
      
//       return naturalSort(b.title, a.title);
//     });
    
//     // Tạo batch requests để di chuyển sheets
//     const requests = [];
//     const pinnedCount = pinnedSheets.length;
    
//     sheetsToSort.forEach((sheet, index) => {
//       const newIndex = pinnedCount + index;
//       if (sheet.index !== newIndex) {
//         requests.push({
//           updateSheetProperties: {
//             properties: {
//               sheetId: sheet.sheetId,
//               index: newIndex
//             },
//             fields: 'index'
//           }
//         });
//       }
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Sheets đã được sắp xếp đúng thứ tự' };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã sắp xếp ${sheetsToSort.length} sheet theo thứ tự giảm dần` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi sắp xếp: ' + error.toString()
//     };
//   }
// }

// /**
//  * FIXED: Hàm đổi tên sheet với validation trùng tên
//  */
// function renameSheets(selectedSheets, configName) {
//   try {
//     const config = loadConfigurations().find(c => c.name === configName);
//     if (!config) {
//       return { success: false, message: 'Không tìm thấy cấu hình: ' + configName };
//     }
    
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     // FIXED: Lấy dữ liệu từ các cells cần thiết
//     const ranges = [];
//     const cellMap = new Map();
    
//     config.components.forEach(component => {
//       if (component.valueType === 'dynamic' && component.value) {
//         selectedSheets.forEach(sheetName => {
//           const range = `${sheetName}!${component.value}`;
//           ranges.push(range);
//           cellMap.set(range, { sheetName, componentName: component.name });
//         });
//       }
//     });
    
//     let valuesData = {};
//     if (ranges.length > 0) {
//       const batchResult = getBatchRangeValues(spreadsheetId, ranges);
//       if (batchResult.success) {
//         batchResult.valueRanges.forEach((valueRange, index) => {
//           const range = ranges[index];
//           const value = valueRange.values && valueRange.values[0] && valueRange.values[0][0] 
//             ? valueRange.values[0][0] : '';
//           valuesData[range] = value;
//         });
//       }
//     }
    
//     // FIXED: Lấy danh sách tên sheet hiện tại để kiểm tra trùng
//     const existingNames = spreadsheetData.sheets.map(s => s.title.toUpperCase());
    
//     // Tạo batch requests để đổi tên
//     const requests = [];
//     let processedCount = 0;
//     let skippedCount = 0;
    
//     selectedSheets.forEach(sheetName => {
//       const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//       if (!sheet) return;
      
//       const newName = generateSheetNameAdvanced(config, sheetName, valuesData);
//       console.log(`🔄 Processing ${sheetName} -> ${newName}`);
      
//       if (newName && newName.length <= 100) {
//         const newNameUpper = newName.toUpperCase();
//         const currentNameUpper = sheetName.toUpperCase();
        
//         // FIXED: Chỉ đổi tên nếu tên mới khác tên hiện tại và không trùng với sheet khác
//         if (newNameUpper !== currentNameUpper) {
//           if (!existingNames.includes(newNameUpper) || newNameUpper === currentNameUpper) {
//             requests.push({
//               updateSheetProperties: {
//                 properties: {
//                   sheetId: sheet.sheetId,
//                   title: newNameUpper
//                 },
//                 fields: 'title'
//               }
//             });
            
//             // FIXED: Cập nhật danh sách tên đã sử dụng
//             existingNames.push(newNameUpper);
//             processedCount++;
//           } else {
//             console.log(`⚠️ Skipped ${sheetName}: Name "${newName}" already exists`);
//             skippedCount++;
//           }
//         } else {
//           console.log(`ℹ️ Skipped ${sheetName}: Same name`);
//           skippedCount++;
//         }
//       }
//     });
    
//     if (requests.length === 0) {
//       const message = skippedCount > 0 
//         ? `✅ Đã bỏ qua ${skippedCount} sheet (trùng tên hoặc không cần đổi)`
//         : '✅ Không có sheet nào cần đổi tên';
//       return { success: true, message: message };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       let message = `✅ Đã đổi tên ${processedCount} sheet theo cấu hình "${configName}"`;
//       if (skippedCount > 0) {
//         message += ` (Bỏ qua ${skippedCount} sheet)`;
//       }
//       return {
//         success: true,
//         message: message
//       };
//     } else {
//       return result;
//     }
    
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi đổi tên sheet: ' + error.toString()
//     };
//   }
// }

// function hideOldSheets() {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const pinnedSheets = getPinnedSheets();
    
//     // Tìm các sheet cũ cần ẩn
//     const requests = [];
//     let hiddenCount = 0;
    
//     spreadsheetData.sheets.forEach(sheet => {
//       if (pinnedSheets.includes(sheet.title) || sheet.hidden) return;
      
//       const sheetDate = extractDateFromSheetName(sheet.title);
//       if (sheetDate && sheetDate < today) {
//         requests.push({
//           updateSheetProperties: {
//             properties: {
//               sheetId: sheet.sheetId,
//               hidden: true
//             },
//             fields: 'hidden'
//           }
//         });
//         hiddenCount++;
//       }
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Không có sheet cũ nào cần ẩn' };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã ẩn ${hiddenCount} sheet cũ` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi ẩn sheet cũ: ' + error.toString()
//     };
//   }
// }

// function hideSelectedSheets(selectedSheets) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const requests = [];
//     let hiddenCount = 0;
    
//     selectedSheets.forEach(sheetName => {
//       const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//       if (sheet && !sheet.hidden) {
//         requests.push({
//           updateSheetProperties: {
//             properties: {
//               sheetId: sheet.sheetId,
//               hidden: true
//             },
//             fields: 'hidden'
//           }
//         });
//         hiddenCount++;
//       }
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Các sheet đã được ẩn hoặc không tồn tại' };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã ẩn ${hiddenCount} sheet` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi ẩn sheet: ' + error.toString()
//     };
//   }
// }

// function deleteSelectedSheets(selectedSheets) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     const requests = [];
//     let deletedCount = 0;
    
//     selectedSheets.forEach(sheetName => {
//       const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//       if (sheet) {
//         requests.push({
//           deleteSheet: {
//             sheetId: sheet.sheetId
//           }
//         });
//         deletedCount++;
//       }
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Không có sheet nào để xóa' };
//     }
    
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã xóa ${deletedCount} sheet` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi xóa sheet: ' + error.toString()
//     };
//   }
// }

// function copyPasteValues(selectedSheets, excludeRanges = []) {
//   try {
//     const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
//     const spreadsheetData = getSpreadsheetDataAdvanced();
    
//     if (!spreadsheetData.success) {
//       return { success: false, message: 'Không thể lấy thông tin sheet' };
//     }
    
//     let processedCount = 0;
//     const requests = [];
    
//     selectedSheets.forEach(sheetName => {
//       const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//       if (!sheet) return;
      
//       // Tạo request để copy paste values cho toàn bộ sheet
//       const dataRange = `A1:${columnToLetter(sheet.columnCount)}${sheet.rowCount}`;
      
//       if (excludeRanges.length === 0) {
//         // Copy paste toàn bộ nếu không có loại trừ
//         requests.push({
//           copyPaste: {
//             source: {
//               sheetId: sheet.sheetId,
//               startRowIndex: 0,
//               endRowIndex: sheet.rowCount,
//               startColumnIndex: 0,
//               endColumnIndex: sheet.columnCount
//             },
//             destination: {
//               sheetId: sheet.sheetId,
//               rowIndex: 0,
//               columnIndex: 0
//             },
//             pasteType: 'PASTE_VALUES'
//           }
//         });
//       } else {
//         // Xử lý với exclusion - sử dụng approach khác
//         processSheetWithExclusionAdvanced(sheet, excludeRanges, requests);
//       }
      
//       processedCount++;
//     });
    
//     if (requests.length === 0) {
//       return { success: true, message: '✅ Không có dữ liệu để xử lý' };
//     }
    
//     // Thực hiện batch operations
//     const result = executeBatchOperations(spreadsheetId, requests);
    
//     if (result.success) {
//       return { 
//         success: true, 
//         message: `✅ Đã xử lý copy-paste values cho ${processedCount} sheet` 
//       };
//     } else {
//       return result;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       message: '❌ Lỗi khi copy-paste values: ' + error.toString()
//     };
//   }
// }

// // ============== CHỨC NĂNG ĐẶT BÀN VỚI ADVANCED API - FIXED HOÀN TOÀN ==============

// /**
//  * FIXED: Hàm thêm lịch đặt bàn với validation và error handling tốt nhất
//  */
// function addBookingSchedule(selectedSheets, configName) {
//   try {
//     console.log(`📅 Starting addBookingSchedule for ${selectedSheets.length} sheets`);
//     console.log('📅 Sheets:', selectedSheets);
//     console.log('📅 Config:', configName);
    
//     const targetSpreadsheetId = '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY';
//     const config = loadConfigurations().find(c => c.name === configName);
    
//     if (!config || config.externalSpreadsheetId !== targetSpreadsheetId) {
//       return { 
//         success: false, 
//         message: 'Cấu hình không hợp lệ hoặc không có ID spreadsheet đích' 
//       };
//     }
    
//     // FIXED: Validation selectedSheets
//     if (!selectedSheets || selectedSheets.length === 0) {
//       return { 
//         success: false, 
//         message: 'Không có sheet nào được chọn' 
//       };
//     }
    
//     const sourceSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    
//     // FIXED: Lấy thông tin booking từ tất cả sheets được chọn với validation
//     const ranges = [];
//     selectedSheets.forEach(sheetName => {
//       ranges.push(
//         `${sheetName}!F5`,    // Ngày tổ chức
//         `${sheetName}!C7`,    // Số bàn  
//         `${sheetName}!E6`,    // Tên khách hàng
//         `${sheetName}!H7`,    // Số khách
//         `${sheetName}!D5`,    // Giờ
//         `${sheetName}!M7`,    // Nhu cầu tổ chức
//         `${sheetName}!N6`,    // Số điện thoại
//         `${sheetName}!C57`    // Người nhận
//       );
//     });
    
//     console.log(`📊 Total ranges to fetch: ${ranges.length}`);
    
//     // FIXED: Lấy tất cả dữ liệu cùng lúc với error handling tốt hơn
//     const batchResult = getBatchRangeValues(sourceSpreadsheetId, ranges);
//     if (!batchResult.success) {
//       console.error('❌ Failed to get batch values:', batchResult.message);
//       return { success: false, message: 'Không thể lấy dữ liệu booking: ' + batchResult.message };
//     }
    
//     console.log(`✅ Successfully got ${batchResult.valueRanges.length} value ranges`);
    
//     // FIXED: Xử lý từng booking với validation tốt hơn
//     let processedCount = 0;
//     const bookingData = [];
    
//     selectedSheets.forEach((sheetName, sheetIndex) => {
//       const baseIndex = sheetIndex * 8;
//       const booking = {
//         sheetName: sheetName,
//         date: getValueFromBatch(batchResult.valueRanges, baseIndex),
//         tableNumber: getValueFromBatch(batchResult.valueRanges, baseIndex + 1),
//         customerName: getValueFromBatch(batchResult.valueRanges, baseIndex + 2),
//         guestCount: getValueFromBatch(batchResult.valueRanges, baseIndex + 3),
//         time: getValueFromBatch(batchResult.valueRanges, baseIndex + 4),
//         eventType: getValueFromBatch(batchResult.valueRanges, baseIndex + 5),
//         phone: getValueFromBatch(batchResult.valueRanges, baseIndex + 6),
//         receiver: getValueFromBatch(batchResult.valueRanges, baseIndex + 7)
//       };
      
//       console.log(`📊 Booking for ${sheetName}:`, booking);
      
//       // FIXED: Validation booking data tốt hơn
//       if (booking.date && booking.tableNumber) {
//         bookingData.push(booking);
//         console.log(`✅ Valid booking for ${sheetName}`);
//       } else {
//         console.log(`⚠️ Invalid booking for ${sheetName}: missing date or table number`);
//       }
//     });
    
//     if (bookingData.length === 0) {
//       return { success: false, message: 'Không có dữ liệu booking hợp lệ (thiếu ngày hoặc số bàn)' };
//     }
    
//     console.log(`📅 Processing ${bookingData.length} valid bookings`);
    
//     // FIXED: Xử lý từng booking trong target spreadsheet
//     for (const booking of bookingData) {
//       const result = processBookingAdvanced(targetSpreadsheetId, booking, sourceSpreadsheetId);
//       if (result.success) {
//         processedCount++;
//         console.log(`✅ Processed booking for ${booking.sheetName}`);
//       } else {
//         console.error(`❌ Failed to process booking for ${booking.sheetName}:`, result.message);
//       }
//     }
    
//     return { 
//       success: true, 
//       message: `✅ Đã xử lý ${processedCount}/${bookingData.length} lịch đặt bàn` 
//     };
//   } catch (error) {
//     console.error('❌ addBookingSchedule error:', error);
//     return {
//       success: false,
//       message: '❌ Lỗi khi thêm lịch đặt bàn: ' + error.toString()
//     };
//   }
// }

// /**
//  * FIXED: Process booking với date handling tốt hơn
//  */
// function processBookingAdvanced(targetSpreadsheetId, booking, sourceSpreadsheetId) {
//   try {
//     console.log(`🔄 Processing booking for ${booking.sheetName}`);
//     console.log(`🔄 Date: ${booking.date}, Type: ${typeof booking.date}`);
    
//     // FIXED: Parse date properly
//     let targetDate;
//     if (booking.date instanceof Date) {
//       targetDate = booking.date;
//     } else {
//       // Parse date string
//       targetDate = parseDateString(booking.date);
//     }
    
//     if (!targetDate || isNaN(targetDate.getTime())) {
//       return { success: false, message: 'Ngày không hợp lệ: ' + booking.date };
//     }
    
//     // FIXED: Format target sheet name consistently
//     const targetSheetName = `📅${formatDateForSheetName(targetDate)}`;
//     console.log(`🎯 Target sheet name: ${targetSheetName}`);
    
//     // Kiểm tra sheet đã tồn tại chưa
//     const targetSpreadsheetData = getSpreadsheetDataAdvanced(targetSpreadsheetId);
//     if (!targetSpreadsheetData.success) {
//       return { success: false, message: 'Không thể truy cập target spreadsheet' };
//     }
    
//     let targetSheet = targetSpreadsheetData.sheets.find(s => s.title === targetSheetName);
    
//     if (!targetSheet) {
//       // Tạo sheet mới từ template
//       const templateSheet = targetSpreadsheetData.sheets.find(s => s.title === '[RS]📅2025');
//       if (!templateSheet) {
//         return { success: false, message: 'Không tìm thấy sheet template' };
//       }
      
//       // Duplicate sheet template
//       const duplicateResult = executeBatchOperations(targetSpreadsheetId, [{
//         duplicateSheet: {
//           sourceSheetId: templateSheet.sheetId,
//           newSheetName: targetSheetName
//         }
//       }]);
      
//       if (!duplicateResult.success) {
//         return duplicateResult;
//       }
      
//       // FIXED: Update date in G1 cell với format đúng
//       const dateUpdateResult = setBatchRangeValues(targetSpreadsheetId, [{
//         range: `${targetSheetName}!G1`,
//         values: [[formatDateForSheetName(targetDate)]]
//       }]);
      
//       if (!dateUpdateResult.success) {
//         console.error('❌ Failed to update date in G1:', dateUpdateResult.message);
//       }
//     }
    
//     // Thêm thông tin booking vào sheet
//     return addBookingToSheetAdvanced(targetSpreadsheetId, targetSheetName, booking, sourceSpreadsheetId);
//   } catch (error) {
//     console.error('❌ processBookingAdvanced error:', error);
//     return { success: false, message: 'Lỗi xử lý booking: ' + error.toString() };
//   }
// }

// /**
//  * FIXED: Add booking to sheet với error handling tốt hơn
//  */
// function addBookingToSheetAdvanced(spreadsheetId, sheetName, booking, sourceSpreadsheetId) {
//   try {
//     console.log(`📝 Adding booking to ${sheetName} for table ${booking.tableNumber}`);
    
//     const tableMap = {
//       'A': { startCol: 0, infoCol: 1 }, // A-B columns
//       'B': { startCol: 2, infoCol: 3 }, // C-D columns
//       'C': { startCol: 4, infoCol: 5 }, // E-F columns
//       'D': { startCol: 6, infoCol: 7 }, // G-H columns
//       'E': { startCol: 8, infoCol: 9 }  // I-J columns
//     };
    
//     const tableCode = booking.tableNumber.toString().charAt(0).toUpperCase();
//     const tableConfig = tableMap[tableCode];
    
//     if (!tableConfig) {
//       return { success: false, message: 'Mã bàn không hợp lệ: ' + tableCode };
//     }
    
//     // Tìm vị trí trống để thêm thông tin (bắt đầu từ hàng 3, mỗi block 6 hàng)
//     const startRow = 3;
//     const blockSize = 6;
//     const maxBlocks = 20;
    
//     // Lấy dữ liệu hiện tại của cột info để tìm vị trí trống
//     const checkRange = `${sheetName}!${columnToLetter(tableConfig.infoCol + 1)}${startRow}:${columnToLetter(tableConfig.infoCol + 1)}${startRow + (maxBlocks * blockSize)}`;
    
//     const existingData = getBatchRangeValues(spreadsheetId, [checkRange]);
//     let targetRow = startRow;
    
//     if (existingData.success && existingData.valueRanges[0].values) {
//       const values = existingData.valueRanges[0].values;
      
//       for (let i = 0; i < maxBlocks; i++) {
//         const checkIndex = i * blockSize;
//         if (checkIndex >= values.length || !values[checkIndex] || !values[checkIndex][0]) {
//           targetRow = startRow + checkIndex;
//           break;
//         }
//       }
//     }
    
//     console.log(`📍 Target row: ${targetRow}`);
    
//     // FIXED: Tạo dữ liệu booking với format đúng
//     const receiverName = formatReceiverName(booking.receiver);
//     const sheetId = getSheetIdByName(sourceSpreadsheetId, booking.sheetName);
//     const hyperlinkFormula = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${sourceSpreadsheetId}/edit#gid=${sheetId}","${booking.sheetName}")`;
    
//     const bookingInfo = [
//       [booking.customerName || ''],
//       [`${booking.guestCount || ''}ng - ${booking.time || ''}h`],
//       [booking.phone || ''],
//       [booking.eventType || ''],
//       [receiverName],
//       [hyperlinkFormula]
//     ];
    
//     console.log(`📝 Booking info:`, bookingInfo);
    
//     // FIXED: Cập nhật thông tin vào sheet với range đúng
//     const updateRange = `${sheetName}!${columnToLetter(tableConfig.infoCol + 1)}${targetRow}:${columnToLetter(tableConfig.infoCol + 1)}${targetRow + 5}`;
//     console.log(`📝 Update range: ${updateRange}`);
    
//     const updateResult = setBatchRangeValues(spreadsheetId, [{
//       range: updateRange,
//       values: bookingInfo
//     }]);
    
//     return updateResult;
//   } catch (error) {
//     console.error('❌ addBookingToSheetAdvanced error:', error);
//     return { success: false, message: 'Lỗi thêm booking: ' + error.toString() };
//   }
// }

// // ============== TỰ ĐỘNG HÓA VỚI FLAG SYSTEM ==============

// /**
//  * FIXED: Hàm thiết lập automation với flag system
//  */
// function setAutomationTrigger(triggerType, enabled) {
//   try {
//     console.log(`🔧 Setting automation: ${triggerType} = ${enabled}`);
    
//     const properties = PropertiesService.getScriptProperties();
    
//     // Xử lý mutual exclusivity cho sorting
//     if (triggerType === 'autoSortAsc' && enabled) {
//       properties.setProperty('automation_autoSortDesc', 'false');
//       deleteTimeTriggers('scheduledSortDescHandler');
//     } else if (triggerType === 'autoSortDesc' && enabled) {
//       properties.setProperty('automation_autoSortAsc', 'false');
//       deleteTimeTriggers('scheduledSortAscHandler');
//     }
    
//     // Lưu trạng thái automation
//     properties.setProperty('automation_' + triggerType, enabled.toString());
    
//     // Xử lý time-based triggers
//     if (triggerType === 'autoHideOld') {
//       deleteTimeTriggers('scheduledHideOldHandler');
//       if (enabled) {
//         createTimeTrigger('scheduledHideOldHandler', 0, 15); // 00:15 hằng ngày
//       }
//     } else if (triggerType === 'autoSortAsc') {
//       deleteTimeTriggers('scheduledSortAscHandler');
//       if (enabled) {
//         createTimeTrigger('scheduledSortAscHandler', 0, 0); // 00:00 hằng ngày
//       }
//     } else if (triggerType === 'autoSortDesc') {
//       deleteTimeTriggers('scheduledSortDescHandler');
//       if (enabled) {
//         createTimeTrigger('scheduledSortDescHandler', 0, 0); // 00:00 hằng ngày
//       }
//     }
    
//     // Validation cho edit triggers
//     if (triggerType === 'autoRename' && enabled) {
//       const configs = loadConfigurations();
//       if (configs.length === 0) {
//         return {
//           success: false,
//           message: '❌ Không có cấu hình nào để áp dụng tự động đổi tên'
//         };
//       }
//     }
    
//     if (triggerType === 'autoBooking' && enabled) {
//       const bookingConfigs = loadConfigurations().filter(c => 
//         c.externalSpreadsheetId === '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY'
//       );
//       if (bookingConfigs.length === 0) {
//         return {
//           success: false,
//           message: '❌ Không có cấu hình booking hợp lệ'
//         };
//       }
//     }
    
//     console.log(`✅ Automation ${triggerType} set to ${enabled}`);
    
//     return {
//       success: true,
//       message: `✅ ${enabled ? 'Đã bật' : 'Đã tắt'} tự động hóa: ${getTriggerDisplayName(triggerType)}`
//     };
    
//   } catch (error) {
//     console.error('❌ Automation setting error:', error);
//     return {
//       success: false,
//       message: '❌ Lỗi khi thiết lập tự động hóa: ' + error.toString()
//     };
//   }
// }

// /**
//  * Tạo time-based trigger
//  */
// function createTimeTrigger(functionName, hour, minute) {
//   try {
//     ScriptApp.newTrigger(functionName)
//       .timeBased()
//       .everyDays(1)
//       .atHour(hour)
//       .nearMinute(minute)
//       .create();
//     console.log(`✅ Created time trigger: ${functionName} at ${hour}:${minute}`);
//   } catch (error) {
//     console.error(`❌ Error creating time trigger: ${error}`);
//   }
// }

// /**
//  * Xóa time-based triggers
//  */
// function deleteTimeTriggers(functionName) {
//   try {
//     const triggers = ScriptApp.getProjectTriggers();
//     let deletedCount = 0;
    
//     triggers.forEach(trigger => {
//       if (trigger.getHandlerFunction() === functionName) {
//         ScriptApp.deleteTrigger(trigger);
//         deletedCount++;
//       }
//     });
    
//     if (deletedCount > 0) {
//       console.log(`🗑️ Deleted ${deletedCount} time triggers for ${functionName}`);
//     }
//     return deletedCount;
    
//   } catch (error) {
//     console.error(`❌ Error deleting time triggers: ${error}`);
//     return 0;
//   }
// }

// function getAutomationStatus() {
//   try {
//     const properties = PropertiesService.getScriptProperties();
//     return {
//       autoRename: properties.getProperty('automation_autoRename') === 'true',
//       autoBooking: properties.getProperty('automation_autoBooking') === 'true',
//       autoHideOld: properties.getProperty('automation_autoHideOld') === 'true',
//       autoSortAsc: properties.getProperty('automation_autoSortAsc') === 'true',
//       autoSortDesc: properties.getProperty('automation_autoSortDesc') === 'true'
//     };
//   } catch (error) {
//     console.error('Error getting automation status:', error);
//     return {
//       autoRename: false,
//       autoBooking: false,
//       autoHideOld: false,
//       autoSortAsc: false,
//       autoSortDesc: false
//     };
//   }
// }

// // ============== CÁC HÀM SCHEDULED CHO TIME-BASED TRIGGERS ==============

// /**
//  * Handler cho scheduled hide old sheets
//  */
// function scheduledHideOldHandler() {
//   try {
//     console.log('🕐 Running scheduled hide old sheets');
//     const result = hideOldSheets();
//     console.log('✅ Scheduled hide result:', result);
//   } catch (error) {
//     console.error('❌ Scheduled hide error:', error);
//   }
// }

// /**
//  * Handler cho scheduled sort ascending
//  */
// function scheduledSortAscHandler() {
//   try {
//     console.log('🕐 Running scheduled sort ascending');
//     const result = sortSheetsAscending();
//     console.log('✅ Scheduled sort asc result:', result);
//   } catch (error) {
//     console.error('❌ Scheduled sort asc error:', error);
//   }
// }

// /**
//  * Handler cho scheduled sort descending
//  */
// function scheduledSortDescHandler() {
//   try {
//     console.log('🕐 Running scheduled sort descending');
//     const result = sortSheetsDescending();
//     console.log('✅ Scheduled sort desc result:', result);
//   } catch (error) {
//     console.error('❌ Scheduled sort desc error:', error);
//   }
// }

// // ============== UTILITY FUNCTIONS - FIXED ==============

// function extractDateFromSheetName(sheetName) {
//   const datePatterns = [
//     { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, yearPos: 3, monthPos: 2, dayPos: 1 },
//     { regex: /(\d{1,2})\.(\d{1,2})\.(\d{2})/, yearPos: 3, monthPos: 2, dayPos: 1, shortYear: true },
//     { regex: /(\d{1,2})-(\d{1,2})-(\d{4})/, yearPos: 3, monthPos: 2, dayPos: 1 }
//   ];
  
//   for (const pattern of datePatterns) {
//     const match = sheetName.match(pattern.regex);
//     if (match) {
//       let day = parseInt(match[pattern.dayPos]);
//       let month = parseInt(match[pattern.monthPos]);
//       let year = parseInt(match[pattern.yearPos]);
      
//       if (pattern.shortYear && year < 100) {
//         year += 2000;
//       }
      
//       const date = new Date(year, month - 1, day);
//       if (!isNaN(date.getTime())) {
//         return date;
//       }
//     }
//   }
  
//   return null;
// }

// function naturalSort(a, b) {
//   const collator = new Intl.Collator('vi', {
//     numeric: true,
//     sensitivity: 'base'
//   });
//   return collator.compare(a, b);
// }

// /**
//  * FIXED: Hàm tạo tên sheet từ cấu hình với xử lý ngày chính xác
//  */
// function generateSheetNameAdvanced(config, sheetName, valuesData) {
//   try {
//     let name = '';
    
//     for (const component of config.components) {
//       let value = '';
      
//       if (component.valueType === 'static') {
//         value = component.value;
//       } else if (component.valueType === 'dynamic') {
//         const range = `${sheetName}!${component.value}`;
//         const cellValue = valuesData[range];
        
//         if (component.name === '[NGÀY]' && cellValue) {
//           // FIXED: Xử lý ngày chính xác
//           let date;
//           if (cellValue instanceof Date) {
//             date = cellValue;
//           } else if (typeof cellValue === 'string') {
//             // Thử parse string thành date
//             date = parseVietnameseDate(cellValue);
//           } else {
//             date = new Date(cellValue);
//           }
          
//           if (!isNaN(date.getTime())) {
//             value = formatDate(date, config.dateFormat || 'DD/MM/YYYY');
//           } else {
//             value = cellValue.toString();
//           }
//         } else {
//           value = cellValue ? cellValue.toString() : '';
//         }
//       }
      
//       name += value;
//       if (component.addSpace && value) {
//         name += ' ';
//       }
//     }
    
//     return name.trim();
    
//   } catch (error) {
//     console.error('Error generating sheet name:', error);
//     return null;
//   }
// }

// /**
//  * FIXED: Hàm tạo tên sheet từ cấu hình cho auto rename
//  */
// function generateSheetNameFromConfig(config, dynamicValues) {
//   try {
//     let name = '';
    
//     for (const component of config.components) {
//       let value = '';
      
//       if (component.valueType === 'static') {
//         value = component.value;
//       } else if (component.valueType === 'dynamic') {
//         const cellValue = dynamicValues[component.value];
        
//         if (component.name === '[NGÀY]' && cellValue) {
//           // FIXED: Xử lý ngày chính xác
//           let date;
//           if (cellValue instanceof Date) {
//             date = cellValue;
//           } else if (typeof cellValue === 'string') {
//             // Thử parse string thành date
//             date = parseVietnameseDate(cellValue);
//           } else {
//             date = new Date(cellValue);
//           }
          
//           if (!isNaN(date.getTime())) {
//             value = formatDate(date, config.dateFormat || 'DD/MM/YYYY');
//           } else {
//             value = cellValue.toString();
//           }
//         } else {
//           value = cellValue ? cellValue.toString() : '';
//         }
//       }
      
//       name += value;
//       if (component.addSpace && value) {
//         name += ' ';
//       }
//     }
    
//     return name.trim();
    
//   } catch (error) {
//     console.error('Error generating sheet name from config:', error);
//     return null;
//   }
// }

// /**
//  * FIXED: Parse date string với nhiều format
//  */
// function parseDateString(dateString) {
//   try {
//     console.log(`🔄 Parsing date string: ${dateString}`);
    
//     if (!dateString) return null;
    
//     const cleaned = dateString.toString().trim();
    
//     // Pattern cho DD/MM/YYYY
//     const ddmmyyyy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
//     if (ddmmyyyy) {
//       const day = parseInt(ddmmyyyy[1]);
//       const month = parseInt(ddmmyyyy[2]);
//       const year = parseInt(ddmmyyyy[3]);
//       const date = new Date(year, month - 1, day);
//       console.log(`✅ Parsed DD/MM/YYYY: ${date}`);
//       return date;
//     }
    
//     // Pattern cho DD.MM.YY
//     const ddmmyy = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
//     if (ddmmyy) {
//       const day = parseInt(ddmmyy[1]);
//       const month = parseInt(ddmmyy[2]);
//       let year = parseInt(ddmmyy[3]);
//       if (year < 100) year += 2000;
//       const date = new Date(year, month - 1, day);
//       console.log(`✅ Parsed DD.MM.YY: ${date}`);
//       return date;
//     }
    
//     // Pattern cho DD-MM-YYYY
//     const ddmmyyyy2 = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
//     if (ddmmyyyy2) {
//       const day = parseInt(ddmmyyyy2[1]);
//       const month = parseInt(ddmmyyyy2[2]);
//       const year = parseInt(ddmmyyyy2[3]);
//       const date = new Date(year, month - 1, day);
//       console.log(`✅ Parsed DD-MM-YYYY: ${date}`);
//       return date;
//     }
    
//     // Thử parse bằng Date constructor
//     const date = new Date(dateString);
//     console.log(`✅ Parsed by Date constructor: ${date}`);
//     return date;
    
//   } catch (error) {
//     console.error('❌ Error parsing date string:', error);
//     return null;
//   }
// }

// /**
//  * FIXED: Parse ngày theo format Việt Nam
//  */
// function parseVietnameseDate(dateString) {
//   return parseDateString(dateString);
// }

// /**
//  * FIXED: Format date cho sheet name
//  */
// function formatDateForSheetName(date) {
//   try {
//     const day = date.getDate().toString().padStart(2, '0');
//     const month = (date.getMonth() + 1).toString().padStart(2, '0');
//     const year = date.getFullYear();
//     return `${day}/${month}/${year}`;
//   } catch (error) {
//     console.error('❌ Error formatting date for sheet name:', error);
//     return 'INVALID_DATE';
//   }
// }

// function formatDate(date, format) {
//   const day = date.getDate().toString().padStart(2, '0');
//   const month = (date.getMonth() + 1).toString().padStart(2, '0');
//   const year = date.getFullYear();
//   const year2 = year.toString().slice(-2);
  
//   switch (format) {
//     case 'DD/MM/YYYY':
//       return `${day}/${month}/${year}`;
//     case 'DD.MM.YY':
//       return `${day}.${month}.${year2}`;
//     case 'DD-MM-YYYY':
//       return `${day}-${month}-${year}`;
//     default:
//       return `${day}/${month}/${year}`;
//   }
// }

// function formatReceiverName(fullName) {
//   if (!fullName) return 'Nhận: ';
  
//   const name = fullName.toString().trim().toUpperCase();
  
//   // Xử lý các trường hợp đặc biệt
//   if (name.includes('BOSS')) return 'Nhận: Boss';
  
//   const words = name.split(' ').filter(word => word.length > 0);
  
//   if (words.length === 1) {
//     return `Nhận: ${words[0]}`;
//   } else if (words.length === 2) {
//     return `Nhận: ${words[1]}`;
//   } else if (words.length === 3) {
//     return `Nhận: ${words[2]}`;
//   } else {
//     // Tạo viết tắt cho tên dài
//     const initials = words.map(word => word.charAt(0)).join('');
//     return `Nhận: ${initials}`;
//   }
// }

// function columnToLetter(column) {
//   let result = '';
//   while (column > 0) {
//     column--;
//     result = String.fromCharCode(65 + (column % 26)) + result;
//     column = Math.floor(column / 26);
//   }
//   return result;
// }

// /**
//  * FIXED: Hàm lấy giá trị từ batch với validation tốt hơn
//  */
// function getValueFromBatch(valueRanges, index) {
//   try {
//     if (index >= valueRanges.length) {
//       console.log(`⚠️ Index ${index} out of range (${valueRanges.length})`);
//       return '';
//     }
    
//     const valueRange = valueRanges[index];
//     if (!valueRange || !valueRange.values || !valueRange.values[0] || valueRange.values[0][0] === undefined) {
//       console.log(`⚠️ Empty value at index ${index}`);
//       return '';
//     }
    
//     const value = valueRange.values[0][0];
//     console.log(`📊 Value at index ${index}: ${value}`);
//     return value;
//   } catch (error) {
//     console.error(`❌ Error getting value at index ${index}:`, error);
//     return '';
//   }
// }

// function getSheetIdByName(spreadsheetId, sheetName) {
//   try {
//     const spreadsheetData = getSpreadsheetDataAdvanced(spreadsheetId);
//     if (spreadsheetData.success) {
//       const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
//       return sheet ? sheet.sheetId : 0;
//     }
//     return 0;
//   } catch (error) {
//     return 0;
//   }
// }

// function processSheetWithExclusionAdvanced(sheet, excludeRanges, requests) {
//   // Implementation đơn giản cho exclusion
//   // Có thể mở rộng thêm logic phức tạp nếu cần
//   requests.push({
//     copyPaste: {
//       source: {
//         sheetId: sheet.sheetId,
//         startRowIndex: 0,
//         endRowIndex: sheet.rowCount,
//         startColumnIndex: 0,
//         endColumnIndex: sheet.columnCount
//       },
//       destination: {
//         sheetId: sheet.sheetId,
//         rowIndex: 0,
//         columnIndex: 0
//       },
//       pasteType: 'PASTE_VALUES'
//     }
//   });
// }

// function getTriggerDisplayName(triggerType) {
//   const names = {
//     'autoRename': 'Đổi tên tự động',
//     'autoBooking': 'Thêm lịch đặt bàn tự động',
//     'autoHideOld': 'Ẩn sheet cũ tự động',
//     'autoSortAsc': 'Sắp xếp tăng dần tự động',
//     'autoSortDesc': 'Sắp xếp giảm dần tự động'
//   };
//   return names[triggerType] || triggerType;
// }

// // ============== DEBUG FUNCTIONS ==============

// /**
//  * Hàm debug để kiểm tra triggers hiện tại
//  */
// function debugTriggers() {
//   const triggers = ScriptApp.getProjectTriggers();
//   console.log(`📊 Total triggers: ${triggers.length}`);
//   triggers.forEach((trigger, index) => {
//     console.log(`📌 Trigger ${index + 1}:`);
//     console.log(`  - Function: ${trigger.getHandlerFunction()}`);
//     console.log(`  - ID: ${trigger.getUniqueId()}`);
//     console.log(`  - Source: ${trigger.getTriggerSource()}`);
//     console.log(`  - Type: ${trigger.getEventType()}`);
//   });
  
//   return triggers.length;
// }

// /**
//  * Hàm debug để xóa tất cả triggers
//  */
// function deleteAllTriggers() {
//   const triggers = ScriptApp.getProjectTriggers();
//   triggers.forEach(trigger => {
//     ScriptApp.deleteTrigger(trigger);
//   });
//   console.log(`🗑️ Deleted all ${triggers.length} triggers`);
//   return triggers.length;
// }

// // ============== API LOGS VÀ PROGRESS ==============

// function logProgress(message, percentage = null) {
//   const timestamp = new Date().toLocaleTimeString('vi-VN');
//   const logEntry = {
//     timestamp: timestamp,
//     message: message,
//     percentage: percentage
//   };
  
//   console.log(`[${timestamp}] ${message}${percentage ? ` (${percentage}%)` : ''}`);
//   return logEntry;
// }