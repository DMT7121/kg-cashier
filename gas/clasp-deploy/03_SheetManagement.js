/**
 * ============================================================================
 * PHẦN MỞ RỘNG 3: HỆ THỐNG QUẢN LÝ SHEET PRO & ADVANCED SHEETS API
 * ============================================================================
 */

function showSidebar() {
  try {
    const html = HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setWidth(420)
      .setTitle('🔧 Hệ Thống Quản Lý Sheet Pro');
    
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    try {
      SpreadsheetApp.getUi().alert(
        'Thông Báo',
        'Giao diện Sidebar yêu cầu file HTML "Index.html" trong dự án Apps Script.\n\n' +
        'Bạn có thể quản lý và sắp xếp các sheet trực tiếp qua các mục trong Menu "🔧 Quản Lý Sheet" và "⚡ King\'s Grill".',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (eAlert) {
      console.error('showSidebar error:', e);
    }
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Simple trigger onEdit - tự động gọi khi có chỉnh sửa
 */
function onEdit(e) {
  try {
    if (!e || !e.source) {
      return;
    }
    
    // Bỏ qua nếu đang thao tác trên sheet ngày làm việc (DD/MM/YYYY) để tránh xung đột với 02_DateSheetSync.gs
    var activeSheet = e.source.getActiveSheet();
    if (activeSheet) {
      var sName = activeSheet.getName();
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sName.trim())) {
        return;
      }
    }
    
    const properties = PropertiesService.getScriptProperties();
    
    // Kiểm tra auto rename
    const autoRenameEnabled = properties.getProperty('automation_autoRename') === 'true';
    if (autoRenameEnabled) {
      Utilities.sleep(500);
      handleAutoRename(e);
    }
    
    // Kiểm tra auto booking
    const autoBookingEnabled = properties.getProperty('automation_autoBooking') === 'true';
    if (autoBookingEnabled) {
      Utilities.sleep(700);
      handleAutoBooking(e);
    }
    
  } catch (error) {
    console.error('onEdit error:', error);
  }
}

/**
 * Xử lý auto rename với validation đầy đủ
 */
function handleAutoRename(e) {
  try {
    const configs = loadConfigurations();
    if (configs.length === 0) {
      return;
    }
    
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const config = configs[0];
    
    const dynamicValues = {};
    config.components.forEach(component => {
      if (component.valueType === 'dynamic' && component.value) {
        try {
          const cellValue = sheet.getRange(component.value).getValue();
          dynamicValues[component.value] = cellValue;
        } catch (err) {
          dynamicValues[component.value] = '';
        }
      }
    });
    
    const newName = generateSheetNameFromConfig(config, dynamicValues);
    if (newName && newName !== sheetName && newName.length <= 100) {
      const allSheets = e.source.getSheets();
      const existingNames = allSheets.map(s => s.getName().toUpperCase());
      
      if (!existingNames.includes(newName.toUpperCase())) {
        try {
          sheet.setName(newName.toUpperCase());
        } catch (renameError) {
          console.error('Rename failed:', renameError);
        }
      }
    }
  } catch (error) {
    console.error('Auto rename error:', error);
  }
}

/**
 * Xử lý auto booking với validation
 */
function handleAutoBooking(e) {
  try {
    const configs = loadConfigurations();
    const validConfig = configs.find(c => 
      c.externalSpreadsheetId === '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY'
    );
    
    if (!validConfig) {
      return;
    }
    
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    
    addBookingSchedule([sheetName], validConfig.name);
  } catch (error) {
    console.error('Auto booking error:', error);
  }
}

/**
 * Lấy thông tin spreadsheet siêu nhanh bằng Advanced API
 */
function getSpreadsheetDataAdvanced(spreadsheetId = null) {
  try {
    const id = spreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId();
    
    const spreadsheet = Sheets.Spreadsheets.get(id, {
      includeGridData: false,
      fields: 'sheets.properties,properties.title'
    });
    
    return {
      success: true,
      id: id,
      title: spreadsheet.properties.title,
      sheets: spreadsheet.sheets.map(sheet => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        index: sheet.properties.index,
        hidden: sheet.properties.hidden || false,
        gridProperties: sheet.properties.gridProperties
      }))
    };
  } catch (error) {
    return {
      success: false,
      message: 'Lỗi Advanced API: ' + error.toString()
    };
  }
}

/**
 * Thực hiện batch operations siêu nhanh
 */
function executeBatchOperations(spreadsheetId, requests) {
  try {
    const response = Sheets.Spreadsheets.batchUpdate({
      requests: requests
    }, spreadsheetId);
    
    return {
      success: true,
      data: response,
      message: 'Đã thực hiện ' + requests.length + ' thao tác thành công'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Lỗi batch operation: ' + error.toString()
    };
  }
}

/**
 * Lấy dữ liệu từ nhiều ranges cùng lúc
 */
function getBatchRangeValues(spreadsheetId, ranges) {
  try {
    if (!ranges || ranges.length === 0) {
      return {
        success: false,
        message: 'Không có range nào để lấy dữ liệu'
      };
    }
    
    const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
      ranges: ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    
    return {
      success: true,
      valueRanges: response.valueRanges
    };
  } catch (error) {
    return {
      success: false,
      message: 'Lỗi lấy batch values: ' + error.toString()
    };
  }
}

/**
 * Cập nhật nhiều ranges cùng lúc với validation JSON payload
 */
function setBatchRangeValues(spreadsheetId, valueRanges) {
  try {
    const cleanedValueRanges = valueRanges.map(valueRange => {
      return {
        range: valueRange.range,
        majorDimension: valueRange.majorDimension || 'ROWS',
        values: valueRange.values || []
      };
    });
    
    const requestBody = {
      valueInputOption: 'USER_ENTERED',
      data: cleanedValueRanges
    };
    
    const response = Sheets.Spreadsheets.Values.batchUpdate(requestBody, spreadsheetId);
    
    return {
      success: true,
      data: response,
      message: 'Đã cập nhật ' + valueRanges.length + ' vùng dữ liệu'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Lỗi cập nhật batch values: ' + error.toString()
    };
  }
}

function saveConfiguration(config) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const configKey = 'sheetConfig_' + config.name;
    
    config.lastModified = new Date().toISOString();
    config.version = '2.0';
    
    properties.setProperty(configKey, JSON.stringify(config));
    
    const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
    if (!configsList.includes(config.name)) {
      configsList.push(config.name);
      properties.setProperty('configsList', JSON.stringify(configsList));
    }
    
    return { 
      success: true, 
      message: '✅ Cấu hình đã được lưu thành công!',
      timestamp: config.lastModified
    };
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi lưu cấu hình: ' + error.toString()
    };
  }
}

function loadConfigurations() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
    const configs = [];
    
    configsList.forEach(configName => {
      try {
        const configData = properties.getProperty('sheetConfig_' + configName);
        if (configData) {
          const config = JSON.parse(configData);
          configs.push(config);
        }
      } catch (e) {}
    });
    
    return configs.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
  } catch (error) {
    return [];
  }
}

function deleteConfiguration(configName) {
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('sheetConfig_' + configName);
    
    const configsList = JSON.parse(properties.getProperty('configsList') || '[]');
    const updatedList = configsList.filter(name => name !== configName);
    properties.setProperty('configsList', JSON.stringify(updatedList));
    
    return { 
      success: true, 
      message: '✅ Đã xóa cấu hình: ' + configName 
    };
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi xóa cấu hình: ' + error.toString()
    };
  }
}

function getSpreadsheetInfo(spreadsheetId) {
  try {
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return { success: false, message: 'ID spreadsheet không hợp lệ' };
    }
    
    const spreadsheet = Sheets.Spreadsheets.get(spreadsheetId, {
      fields: 'properties.title'
    });
    
    return { 
      success: true, 
      name: spreadsheet.properties.title,
      url: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Không thể truy cập spreadsheet: ' + error.toString()
    };
  }
}

function getAllSheets() {
  try {
    const spreadsheetData = getSpreadsheetDataAdvanced();
    if (!spreadsheetData.success) {
      return [];
    }
    
    return spreadsheetData.sheets.map(sheet => ({
      name: sheet.title,
      sheetId: sheet.sheetId,
      isHidden: sheet.hidden,
      index: sheet.index,
      rowCount: sheet.gridProperties ? sheet.gridProperties.rowCount : 1000,
      columnCount: sheet.gridProperties ? sheet.gridProperties.columnCount : 26
    }));
  } catch (error) {
    return [];
  }
}

function searchSheets(keyword) {
  try {
    const allSheets = getAllSheets();
    if (!keyword || keyword.trim() === '') {
      return allSheets;
    }
    
    const lowercaseKeyword = keyword.toLowerCase();
    return allSheets.filter(sheet => 
      sheet.name.toLowerCase().includes(lowercaseKeyword)
    );
  } catch (error) {
    return [];
  }
}

function toggleSheetVisibility(sheetName) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
    if (!sheet) {
      return { success: false, message: 'Không tìm thấy sheet: ' + sheetName };
    }
    
    const newHiddenState = !sheet.hidden;
    const requests = [{
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheetId,
          hidden: newHiddenState
        },
        fields: 'hidden'
      }
    }];
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: (newHiddenState ? '✅ Đã ẩn' : '✅ Đã hiển thị') + ' sheet: ' + sheetName,
        isHidden: newHiddenState 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi thay đổi trạng thái sheet: ' + error.toString()
    };
  }
}

function pinSheet(sheetName) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
    if (!sheet) {
      return { success: false, message: 'Không tìm thấy sheet: ' + sheetName };
    }
    
    const requests = [{
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheetId,
          index: 0
        },
        fields: 'index'
      }
    }];
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      const properties = PropertiesService.getScriptProperties();
      const pinnedSheets = JSON.parse(properties.getProperty('pinnedSheets') || '[]');
      
      if (!pinnedSheets.includes(sheetName)) {
        pinnedSheets.push(sheetName);
        properties.setProperty('pinnedSheets', JSON.stringify(pinnedSheets));
      }
      
      return { 
        success: true, 
        message: '📌 Đã ghim sheet: ' + sheetName 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi ghim sheet: ' + error.toString()
    };
  }
}

function getPinnedSheets() {
  try {
    const properties = PropertiesService.getScriptProperties();
    return JSON.parse(properties.getProperty('pinnedSheets') || '[]');
  } catch (error) {
    return [];
  }
}

function sortSheetsAscending(selectedSheets = []) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const pinnedSheets = getPinnedSheets();
    let sheetsToSort = spreadsheetData.sheets.filter(sheet => 
      !pinnedSheets.includes(sheet.title) &&
      (selectedSheets.length === 0 || selectedSheets.includes(sheet.title))
    );
    
    sheetsToSort.sort((a, b) => {
      const dateA = extractDateFromSheetName(a.title);
      const dateB = extractDateFromSheetName(b.title);
      
      if (dateA && dateB) {
        const diff = dateA.getTime() - dateB.getTime();
        if (diff !== 0) return diff;
      }
      
      return naturalSort(a.title, b.title);
    });
    
    const requests = [];
    const pinnedCount = pinnedSheets.length;
    
    sheetsToSort.forEach((sheet, index) => {
      const newIndex = pinnedCount + index;
      if (sheet.index !== newIndex) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              index: newIndex
            },
            fields: 'index'
          }
        });
      }
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Sheets đã được sắp xếp đúng thứ tự' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã sắp xếp ' + sheetsToSort.length + ' sheet theo thứ tự tăng dần' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi sắp xếp: ' + error.toString()
    };
  }
}

function sortSheetsDescending(selectedSheets = []) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const pinnedSheets = getPinnedSheets();
    let sheetsToSort = spreadsheetData.sheets.filter(sheet => 
      !pinnedSheets.includes(sheet.title) &&
      (selectedSheets.length === 0 || selectedSheets.includes(sheet.title))
    );
    
    sheetsToSort.sort((a, b) => {
      const dateA = extractDateFromSheetName(a.title);
      const dateB = extractDateFromSheetName(b.title);
      
      if (dateA && dateB) {
        const diff = dateB.getTime() - dateA.getTime();
        if (diff !== 0) return diff;
      }
      
      return naturalSort(b.title, a.title);
    });
    
    const requests = [];
    const pinnedCount = pinnedSheets.length;
    
    sheetsToSort.forEach((sheet, index) => {
      const newIndex = pinnedCount + index;
      if (sheet.index !== newIndex) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              index: newIndex
            },
            fields: 'index'
          }
        });
      }
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Sheets đã được sắp xếp đúng thứ tự' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã sắp xếp ' + sheetsToSort.length + ' sheet theo thứ tự giảm dần' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi sắp xếp: ' + error.toString()
    };
  }
}

function renameSheets(selectedSheets, configName) {
  try {
    const config = loadConfigurations().find(c => c.name === configName);
    if (!config) {
      return { success: false, message: 'Không tìm thấy cấu hình: ' + configName };
    }
    
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const ranges = [];
    const cellMap = new Map();
    
    config.components.forEach(component => {
      if (component.valueType === 'dynamic' && component.value) {
        selectedSheets.forEach(sheetName => {
          const range = sheetName + '!' + component.value;
          ranges.push(range);
          cellMap.set(range, { sheetName, componentName: component.name });
        });
      }
    });
    
    let valuesData = {};
    if (ranges.length > 0) {
      const batchResult = getBatchRangeValues(spreadsheetId, ranges);
      if (batchResult.success) {
        batchResult.valueRanges.forEach((valueRange, index) => {
          const range = ranges[index];
          const value = valueRange.values && valueRange.values[0] && valueRange.values[0][0] 
            ? valueRange.values[0][0] : '';
          valuesData[range] = value;
        });
      }
    }
    
    const existingNames = spreadsheetData.sheets.map(s => s.title.toUpperCase());
    const requests = [];
    let processedCount = 0;
    let skippedCount = 0;
    
    selectedSheets.forEach(sheetName => {
      const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
      if (!sheet) return;
      
      const newName = generateSheetNameAdvanced(config, sheetName, valuesData);
      
      if (newName && newName.length <= 100) {
        const newNameUpper = newName.toUpperCase();
        const currentNameUpper = sheetName.toUpperCase();
        
        if (newNameUpper !== currentNameUpper) {
          if (!existingNames.includes(newNameUpper) || newNameUpper === currentNameUpper) {
            requests.push({
              updateSheetProperties: {
                properties: {
                  sheetId: sheet.sheetId,
                  title: newNameUpper
                },
                fields: 'title'
              }
            });
            
            existingNames.push(newNameUpper);
            processedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }
    });
    
    if (requests.length === 0) {
      const message = skippedCount > 0 
        ? '✅ Đã bỏ qua ' + skippedCount + ' sheet (trùng tên hoặc không cần đổi)'
        : '✅ Không có sheet nào cần đổi tên';
      return { success: true, message: message };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      let message = '✅ Đã đổi tên ' + processedCount + ' sheet theo cấu hình "' + configName + '"';
      if (skippedCount > 0) {
        message += ' (Bỏ qua ' + skippedCount + ' sheet)';
      }
      return {
        success: true,
        message: message
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi đổi tên sheet: ' + error.toString()
    };
  }
}

function hideOldSheets() {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pinnedSheets = getPinnedSheets();
    
    const requests = [];
    let hiddenCount = 0;
    
    spreadsheetData.sheets.forEach(sheet => {
      if (pinnedSheets.includes(sheet.title) || sheet.hidden) return;
      
      const sheetDate = extractDateFromSheetName(sheet.title);
      if (sheetDate && sheetDate < today) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              hidden: true
            },
            fields: 'hidden'
          }
        });
        hiddenCount++;
      }
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Không có sheet cũ nào cần ẩn' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã ẩn ' + hiddenCount + ' sheet cũ' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi ẩn sheet cũ: ' + error.toString()
    };
  }
}

function hideSelectedSheets(selectedSheets) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const requests = [];
    let hiddenCount = 0;
    
    selectedSheets.forEach(sheetName => {
      const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
      if (sheet && !sheet.hidden) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              hidden: true
            },
            fields: 'hidden'
          }
        });
        hiddenCount++;
      }
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Các sheet đã được ẩn hoặc không tồn tại' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã ẩn ' + hiddenCount + ' sheet' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi ẩn sheet: ' + error.toString()
    };
  }
}

function deleteSelectedSheets(selectedSheets) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    const requests = [];
    let deletedCount = 0;
    
    selectedSheets.forEach(sheetName => {
      const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
      if (sheet) {
        requests.push({
          deleteSheet: {
            sheetId: sheet.sheetId
          }
        });
        deletedCount++;
      }
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Không có sheet nào để xóa' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã xóa ' + deletedCount + ' sheet' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi xóa sheet: ' + error.toString()
    };
  }
}

function copyPasteValues(selectedSheets, excludeRanges = []) {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const spreadsheetData = getSpreadsheetDataAdvanced();
    
    if (!spreadsheetData.success) {
      return { success: false, message: 'Không thể lấy thông tin sheet' };
    }
    
    let processedCount = 0;
    const requests = [];
    
    selectedSheets.forEach(sheetName => {
      const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
      if (!sheet) return;
      
      if (excludeRanges.length === 0) {
        requests.push({
          copyPaste: {
            source: {
              sheetId: sheet.sheetId,
              startRowIndex: 0,
              endRowIndex: sheet.rowCount,
              startColumnIndex: 0,
              endColumnIndex: sheet.columnCount
            },
            destination: {
              sheetId: sheet.sheetId,
              rowIndex: 0,
              columnIndex: 0
            },
            pasteType: 'PASTE_VALUES'
          }
        });
      } else {
        processSheetWithExclusionAdvanced(sheet, excludeRanges, requests);
      }
      
      processedCount++;
    });
    
    if (requests.length === 0) {
      return { success: true, message: '✅ Không có dữ liệu để xử lý' };
    }
    
    const result = executeBatchOperations(spreadsheetId, requests);
    if (result.success) {
      return { 
        success: true, 
        message: '✅ Đã xử lý copy-paste values cho ' + processedCount + ' sheet' 
      };
    } else {
      return result;
    }
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi copy-paste values: ' + error.toString()
    };
  }
}

function addBookingSchedule(selectedSheets, configName) {
  try {
    const targetSpreadsheetId = '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY';
    const config = loadConfigurations().find(c => c.name === configName);
    
    if (!config || config.externalSpreadsheetId !== targetSpreadsheetId) {
      return { 
        success: false, 
        message: 'Cấu hình không hợp lệ hoặc không có ID spreadsheet đích' 
      };
    }
    
    if (!selectedSheets || selectedSheets.length === 0) {
      return { 
        success: false, 
        message: 'Không có sheet nào được chọn' 
      };
    }
    
    const sourceSpreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    const ranges = [];
    selectedSheets.forEach(sheetName => {
      ranges.push(
        sheetName + '!F5',    // Ngày tổ chức
        sheetName + '!C7',    // Số bàn  
        sheetName + '!E6',    // Tên khách hàng
        sheetName + '!H7',    // Số khách
        sheetName + '!D5',    // Giờ
        sheetName + '!M7',    // Nhu cầu tổ chức
        sheetName + '!N6',    // Số điện thoại
        sheetName + '!C57'    // Người nhận
      );
    });
    
    const batchResult = getBatchRangeValues(sourceSpreadsheetId, ranges);
    if (!batchResult.success) {
      return { success: false, message: 'Không thể lấy dữ liệu booking: ' + batchResult.message };
    }
    
    let processedCount = 0;
    const bookingData = [];
    
    selectedSheets.forEach((sheetName, sheetIndex) => {
      const baseIndex = sheetIndex * 8;
      const booking = {
        sheetName: sheetName,
        date: getValueFromBatch(batchResult.valueRanges, baseIndex),
        tableNumber: getValueFromBatch(batchResult.valueRanges, baseIndex + 1),
        customerName: getValueFromBatch(batchResult.valueRanges, baseIndex + 2),
        guestCount: getValueFromBatch(batchResult.valueRanges, baseIndex + 3),
        time: getValueFromBatch(batchResult.valueRanges, baseIndex + 4),
        eventType: getValueFromBatch(batchResult.valueRanges, baseIndex + 5),
        phone: getValueFromBatch(batchResult.valueRanges, baseIndex + 6),
        receiver: getValueFromBatch(batchResult.valueRanges, baseIndex + 7)
      };
      
      if (booking.date && booking.tableNumber) {
        bookingData.push(booking);
      }
    });
    
    if (bookingData.length === 0) {
      return { success: false, message: 'Không có dữ liệu booking hợp lệ (thiếu ngày hoặc số bàn)' };
    }
    
    for (const booking of bookingData) {
      const result = processBookingAdvanced(targetSpreadsheetId, booking, sourceSpreadsheetId);
      if (result.success) {
        processedCount++;
      }
    }
    
    return { 
      success: true, 
      message: '✅ Đã xử lý ' + processedCount + '/' + bookingData.length + ' lịch đặt bàn' 
    };
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi thêm lịch đặt bàn: ' + error.toString()
    };
  }
}

function processBookingAdvanced(targetSpreadsheetId, booking, sourceSpreadsheetId) {
  try {
    let targetDate;
    if (booking.date instanceof Date) {
      targetDate = booking.date;
    } else {
      targetDate = parseDateString(booking.date);
    }
    
    if (!targetDate || isNaN(targetDate.getTime())) {
      return { success: false, message: 'Ngày không hợp lệ: ' + booking.date };
    }
    
    const targetSheetName = '📅' + formatDateForSheetName(targetDate);
    const targetSpreadsheetData = getSpreadsheetDataAdvanced(targetSpreadsheetId);
    if (!targetSpreadsheetData.success) {
      return { success: false, message: 'Không thể truy cập target spreadsheet' };
    }
    
    let targetSheet = targetSpreadsheetData.sheets.find(s => s.title === targetSheetName);
    
    if (!targetSheet) {
      const templateSheet = targetSpreadsheetData.sheets.find(s => s.title === '[RS]📅2025');
      if (!templateSheet) {
        return { success: false, message: 'Không tìm thấy sheet template' };
      }
      
      const duplicateResult = executeBatchOperations(targetSpreadsheetId, [{
        duplicateSheet: {
          sourceSheetId: templateSheet.sheetId,
          newSheetName: targetSheetName
        }
      }]);
      
      if (!duplicateResult.success) {
        return duplicateResult;
      }
      
      setBatchRangeValues(targetSpreadsheetId, [{
        range: targetSheetName + '!G1',
        values: [[formatDateForSheetName(targetDate)]]
      }]);
    }
    
    return addBookingToSheetAdvanced(targetSpreadsheetId, targetSheetName, booking, sourceSpreadsheetId);
  } catch (error) {
    return { success: false, message: 'Lỗi xử lý booking: ' + error.toString() };
  }
}

function addBookingToSheetAdvanced(spreadsheetId, sheetName, booking, sourceSpreadsheetId) {
  try {
    const tableMap = {
      'A': { startCol: 0, infoCol: 1 },
      'B': { startCol: 2, infoCol: 3 },
      'C': { startCol: 4, infoCol: 5 },
      'D': { startCol: 6, infoCol: 7 },
      'E': { startCol: 8, infoCol: 9 }
    };
    
    const tableCode = booking.tableNumber.toString().charAt(0).toUpperCase();
    const tableConfig = tableMap[tableCode];
    
    if (!tableConfig) {
      return { success: false, message: 'Mã bàn không hợp lệ: ' + tableCode };
    }
    
    const startRow = 3;
    const blockSize = 6;
    const maxBlocks = 20;
    
    const checkRange = sheetName + '!' + columnToLetter(tableConfig.infoCol + 1) + startRow + ':' + columnToLetter(tableConfig.infoCol + 1) + (startRow + (maxBlocks * blockSize));
    const existingData = getBatchRangeValues(spreadsheetId, [checkRange]);
    let targetRow = startRow;
    
    if (existingData.success && existingData.valueRanges[0].values) {
      const values = existingData.valueRanges[0].values;
      for (let i = 0; i < maxBlocks; i++) {
        const checkIndex = i * blockSize;
        if (checkIndex >= values.length || !values[checkIndex] || !values[checkIndex][0]) {
          targetRow = startRow + checkIndex;
          break;
        }
      }
    }
    
    const receiverName = formatReceiverName(booking.receiver);
    const sheetId = getSheetIdByName(sourceSpreadsheetId, booking.sheetName);
    const hyperlinkFormula = '=HYPERLINK("https://docs.google.com/spreadsheets/d/' + sourceSpreadsheetId + '/edit#gid=' + sheetId + '","' + booking.sheetName + '")';
    
    const bookingInfo = [
      [booking.customerName || ''],
      [(booking.guestCount || '') + 'ng - ' + (booking.time || '') + 'h'],
      [booking.phone || ''],
      [booking.eventType || ''],
      [receiverName],
      [hyperlinkFormula]
    ];
    
    const updateRange = sheetName + '!' + columnToLetter(tableConfig.infoCol + 1) + targetRow + ':' + columnToLetter(tableConfig.infoCol + 1) + (targetRow + 5);
    return setBatchRangeValues(spreadsheetId, [{
      range: updateRange,
      values: bookingInfo
    }]);
  } catch (error) {
    return { success: false, message: 'Lỗi thêm booking: ' + error.toString() };
  }
}

function setAutomationTrigger(triggerType, enabled) {
  try {
    const properties = PropertiesService.getScriptProperties();
    
    if (triggerType === 'autoSortAsc' && enabled) {
      properties.setProperty('automation_autoSortDesc', 'false');
      deleteTimeTriggers('scheduledSortDescHandler');
    } else if (triggerType === 'autoSortDesc' && enabled) {
      properties.setProperty('automation_autoSortAsc', 'false');
      deleteTimeTriggers('scheduledSortAscHandler');
    }
    
    properties.setProperty('automation_' + triggerType, enabled.toString());
    
    if (triggerType === 'autoHideOld') {
      deleteTimeTriggers('scheduledHideOldHandler');
      if (enabled) {
        createTimeTrigger('scheduledHideOldHandler', 0, 15);
      }
    } else if (triggerType === 'autoSortAsc') {
      deleteTimeTriggers('scheduledSortAscHandler');
      if (enabled) {
        createTimeTrigger('scheduledSortAscHandler', 0, 0);
      }
    } else if (triggerType === 'autoSortDesc') {
      deleteTimeTriggers('scheduledSortDescHandler');
      if (enabled) {
        createTimeTrigger('scheduledSortDescHandler', 0, 0);
      }
    }
    
    if (triggerType === 'autoRename' && enabled) {
      const configs = loadConfigurations();
      if (configs.length === 0) {
        return {
          success: false,
          message: '❌ Không có cấu hình nào để áp dụng tự động đổi tên'
        };
      }
    }
    
    if (triggerType === 'autoBooking' && enabled) {
      const bookingConfigs = loadConfigurations().filter(c => 
        c.externalSpreadsheetId === '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY'
      );
      if (bookingConfigs.length === 0) {
        return {
          success: false,
          message: '❌ Không có cấu hình booking hợp lệ'
        };
      }
    }
    
    return {
      success: true,
      message: (enabled ? '✅ Đã bật' : '✅ Đã tắt') + ' tự động hóa: ' + getTriggerDisplayName(triggerType)
    };
  } catch (error) {
    return {
      success: false,
      message: '❌ Lỗi khi thiết lập tự động hóa: ' + error.toString()
    };
  }
}

function createTimeTrigger(functionName, hour, minute) {
  try {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .nearMinute(minute)
      .create();
  } catch (error) {
    console.error('Error creating time trigger:', error);
  }
}

function deleteTimeTriggers(functionName) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let deletedCount = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === functionName) {
        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
      }
    });
    return deletedCount;
  } catch (error) {
    return 0;
  }
}

function getAutomationStatus() {
  try {
    const properties = PropertiesService.getScriptProperties();
    return {
      autoRename: properties.getProperty('automation_autoRename') === 'true',
      autoBooking: properties.getProperty('automation_autoBooking') === 'true',
      autoHideOld: properties.getProperty('automation_autoHideOld') === 'true',
      autoSortAsc: properties.getProperty('automation_autoSortAsc') === 'true',
      autoSortDesc: properties.getProperty('automation_autoSortDesc') === 'true'
    };
  } catch (error) {
    return {
      autoRename: false,
      autoBooking: false,
      autoHideOld: false,
      autoSortAsc: false,
      autoSortDesc: false
    };
  }
}

function scheduledHideOldHandler() {
  try {
    hideOldSheets();
  } catch (error) {
    console.error('Scheduled hide error:', error);
  }
}

function scheduledSortAscHandler() {
  try {
    sortSheetsAscending();
  } catch (error) {
    console.error('Scheduled sort asc error:', error);
  }
}

function scheduledSortDescHandler() {
  try {
    sortSheetsDescending();
  } catch (error) {
    console.error('Scheduled sort desc error:', error);
  }
}

function extractDateFromSheetName(sheetName) {
  const datePatterns = [
    { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, yearPos: 3, monthPos: 2, dayPos: 1 },
    { regex: /(\d{1,2})\.(\d{1,2})\.(\d{2})/, yearPos: 3, monthPos: 2, dayPos: 1, shortYear: true },
    { regex: /(\d{1,2})-(\d{1,2})-(\d{4})/, yearPos: 3, monthPos: 2, dayPos: 1 }
  ];
  
  for (const pattern of datePatterns) {
    const match = sheetName.match(pattern.regex);
    if (match) {
      let day = parseInt(match[pattern.dayPos]);
      let month = parseInt(match[pattern.monthPos]);
      let year = parseInt(match[pattern.yearPos]);
      
      if (pattern.shortYear && year < 100) {
        year += 2000;
      }
      
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  return null;
}

function naturalSort(a, b) {
  const collator = new Intl.Collator('vi', {
    numeric: true,
    sensitivity: 'base'
  });
  return collator.compare(a, b);
}

function generateSheetNameAdvanced(config, sheetName, valuesData) {
  try {
    let name = '';
    for (const component of config.components) {
      let value = '';
      if (component.valueType === 'static') {
        value = component.value;
      } else if (component.valueType === 'dynamic') {
        const range = sheetName + '!' + component.value;
        const cellValue = valuesData[range];
        
        if (component.name === '[NGÀY]' && cellValue) {
          let date;
          if (cellValue instanceof Date) {
            date = cellValue;
          } else if (typeof cellValue === 'string') {
            date = parseVietnameseDate(cellValue);
          } else {
            date = new Date(cellValue);
          }
          
          if (!isNaN(date.getTime())) {
            value = formatDate(date, config.dateFormat || 'DD/MM/YYYY');
          } else {
            value = cellValue.toString();
          }
        } else {
          value = cellValue ? cellValue.toString() : '';
        }
      }
      name += value;
      if (component.addSpace && value) {
        name += ' ';
      }
    }
    return name.trim();
  } catch (error) {
    return null;
  }
}

function generateSheetNameFromConfig(config, dynamicValues) {
  try {
    let name = '';
    for (const component of config.components) {
      let value = '';
      if (component.valueType === 'static') {
        value = component.value;
      } else if (component.valueType === 'dynamic') {
        const cellValue = dynamicValues[component.value];
        if (component.name === '[NGÀY]' && cellValue) {
          let date;
          if (cellValue instanceof Date) {
            date = cellValue;
          } else if (typeof cellValue === 'string') {
            date = parseVietnameseDate(cellValue);
          } else {
            date = new Date(cellValue);
          }
          
          if (!isNaN(date.getTime())) {
            value = formatDate(date, config.dateFormat || 'DD/MM/YYYY');
          } else {
            value = cellValue.toString();
          }
        } else {
          value = cellValue ? cellValue.toString() : '';
        }
      }
      name += value;
      if (component.addSpace && value) {
        name += ' ';
      }
    }
    return name.trim();
  } catch (error) {
    return null;
  }
}

function parseDateString(dateString) {
  try {
    if (!dateString) return null;
    const cleaned = dateString.toString().trim();
    
    const ddmmyyyy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1]);
      const month = parseInt(ddmmyyyy[2]);
      const year = parseInt(ddmmyyyy[3]);
      return new Date(year, month - 1, day);
    }
    
    const ddmmyy = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
    if (ddmmyy) {
      const day = parseInt(ddmmyy[1]);
      const month = parseInt(ddmmyy[2]);
      let year = parseInt(ddmmyy[3]);
      if (year < 100) year += 2000;
      return new Date(year, month - 1, day);
    }
    
    const ddmmyyyy2 = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy2) {
      const day = parseInt(ddmmyyyy2[1]);
      const month = parseInt(ddmmyyyy2[2]);
      const year = parseInt(ddmmyyyy2[3]);
      return new Date(year, month - 1, day);
    }
    
    return new Date(dateString);
  } catch (error) {
    return null;
  }
}

function parseVietnameseDate(dateString) {
  return parseDateString(dateString);
}

function formatDateForSheetName(date) {
  try {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return day + '/' + month + '/' + year;
  } catch (error) {
    return 'INVALID_DATE';
  }
}

function formatDate(date, format) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const year2 = year.toString().slice(-2);
  
  switch (format) {
    case 'DD/MM/YYYY':
      return day + '/' + month + '/' + year;
    case 'DD.MM.YY':
      return day + '.' + month + '.' + year2;
    case 'DD-MM-YYYY':
      return day + '-' + month + '-' + year;
    default:
      return day + '/' + month + '/' + year;
  }
}

function formatReceiverName(fullName) {
  if (!fullName) return 'Nhận: ';
  const name = fullName.toString().trim().toUpperCase();
  if (name.includes('BOSS')) return 'Nhận: Boss';
  
  const words = name.split(' ').filter(word => word.length > 0);
  if (words.length === 1) {
    return 'Nhận: ' + words[0];
  } else if (words.length === 2) {
    return 'Nhận: ' + words[1];
  } else if (words.length === 3) {
    return 'Nhận: ' + words[2];
  } else {
    const initials = words.map(word => word.charAt(0)).join('');
    return 'Nhận: ' + initials;
  }
}

function columnToLetter(column) {
  let result = '';
  while (column > 0) {
    column--;
    result = String.fromCharCode(65 + (column % 26)) + result;
    column = Math.floor(column / 26);
  }
  return result;
}

function getValueFromBatch(valueRanges, index) {
  try {
    if (index >= valueRanges.length) {
      return '';
    }
    
    const valueRange = valueRanges[index];
    if (!valueRange || !valueRange.values || !valueRange.values[0] || valueRange.values[0][0] === undefined) {
      return '';
    }
    
    return valueRange.values[0][0];
  } catch (error) {
    return '';
  }
}

function getSheetIdByName(spreadsheetId, sheetName) {
  try {
    const spreadsheetData = getSpreadsheetDataAdvanced(spreadsheetId);
    if (spreadsheetData.success) {
      const sheet = spreadsheetData.sheets.find(s => s.title === sheetName);
      return sheet ? sheet.sheetId : 0;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

function processSheetWithExclusionAdvanced(sheet, excludeRanges, requests) {
  requests.push({
    copyPaste: {
      source: {
        sheetId: sheet.sheetId,
        startRowIndex: 0,
        endRowIndex: sheet.rowCount,
        startColumnIndex: 0,
        endColumnIndex: sheet.columnCount
      },
      destination: {
        sheetId: sheet.sheetId,
        rowIndex: 0,
        columnIndex: 0
      },
      pasteType: 'PASTE_VALUES'
    }
  });
}

function getTriggerDisplayName(triggerType) {
  const names = {
    'autoRename': 'Đổi tên tự động',
    'autoBooking': 'Thêm lịch đặt bàn tự động',
    'autoHideOld': 'Ẩn sheet cũ tự động',
    'autoSortAsc': 'Sắp xếp tăng dần tự động',
    'autoSortDesc': 'Sắp xếp giảm dần tự động'
  };
  return names[triggerType] || triggerType;
}

function debugTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  console.log('Total triggers:', triggers.length);
  triggers.forEach((trigger, index) => {
    console.log('Trigger ' + (index + 1) + ': ' + trigger.getHandlerFunction() + ' (ID: ' + trigger.getUniqueId() + ')');
  });
  return triggers.length;
}

function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  return triggers.length;
}

function logProgress(message, percentage = null) {
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const logEntry = {
    timestamp: timestamp,
    message: message,
    percentage: percentage
  };
  return logEntry;
}

