/**
 * ============================================================================
 * PHẦN MỞ RỘNG 2: ĐỒNG BỘ 2 CHIỀU C3 <-> TÊN SHEET (SHEETS API V4 ENGINE)
 * ============================================================================
 *
 * Yêu cầu:
 * 1. Bật Advanced Google Service: Google Sheets API v4
 * 2. Chạy setupDateSheetSync() MỘT LẦN để:
 *    - Cấp quyền
 *    - Tạo installable onEdit (bắt thay đổi ô C3)
 *    - Tạo installable onChange (bắt thay đổi / rename tab Sheet)
 *    - Tạo installable onOpen (kiểm tra lại khi mở file)
 *    - Lưu snapshot tên Sheet
 *
 * Quy ước:
 * - C3 là ô ngày.
 * - Tên Sheet chuẩn: DD/MM/YYYY (Ví dụ: 08/08/2026)
 *
 * Advanced Sheets API v4 được dùng cho:
 * - Đọc C3, Ghi C3, Format C3, Rename Sheet, Đọc metadata Sheet
 */

const DATE_SYNC_CONFIG = {
  CELL_A1: 'C3',

  // Grid indexes của C3 - zero based.
  ROW_INDEX: 2,
  COLUMN_INDEX: 2,

  DATE_DISPLAY_PATTERN: 'dd/MM/yyyy',

  SNAPSHOT_KEY: 'DATE_SYNC_SHEET_TITLE_SNAPSHOT_V1',

  TRIGGER_FUNCTIONS: [
    'handleDateSyncEdit',
    'handleDateSyncChange',
    'handleDateSyncOpen'
  ]
};

/**
 * Cài đặt đồng bộ 2 chiều C3 <-> Tên Sheet (Chạy thủ công 1 lần)
 */
function setupDateSheetSync() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Script phải được gắn trực tiếp với Google Spreadsheet.'
    );
  }

  // Kiểm tra Advanced Sheets API đồng thời buộc cấp quyền.
  const metadata = getSpreadsheetMetadata_(ss.getId());

  // Xóa trigger cũ để tránh chạy trùng.
  removeDateSyncTriggers_();

  // Trigger bắt thay đổi C3.
  ScriptApp.newTrigger('handleDateSyncEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger bắt rename / thay đổi cấu trúc Sheet.
  ScriptApp.newTrigger('handleDateSyncChange')
    .forSpreadsheet(ss)
    .onChange()
    .create();

  // Trigger dự phòng: kiểm tra lại khi mở file.
  ScriptApp.newTrigger('handleDateSyncOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  // Lưu trạng thái tên Sheet hiện tại.
  saveSnapshot_(createSnapshotFromMetadata_(metadata));

  try {
    ss.toast(
      'Đã cài đặt đồng bộ C3 ↔ tên Sheet.',
      'Đồng bộ ngày',
      5
    );
  } catch (error) {
    console.log('Setup completed.');
  }
}

/**
 * Xóa trigger cũ của hệ thống này.
 */
function removeDateSyncTriggers_() {
  const triggerFunctions =
    new Set(DATE_SYNC_CONFIG.TRIGGER_FUNCTIONS);

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (triggerFunctions.has(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * INSTALLABLE onEdit - C3 -> TÊN SHEET
 */
function handleDateSyncEdit(e) {
  if (!e || !e.range) {
    return;
  }

  const range = e.range;

  // Chỉ xử lý khi vùng chỉnh sửa có chứa C3.
  if (!rangeContainsC3_(range)) {
    return;
  }

  const sheet = range.getSheet();

  processC3Change_(
    e.source.getId(),
    sheet.getSheetId()
  );
}

/**
 * Kiểm tra vùng edit có chứa C3 hay không (hỗ trợ paste nhiều ô chứa C3)
 */
function rangeContainsC3_(range) {
  const targetRow = 3;
  const targetColumn = 3;

  const firstRow = range.getRow();
  const lastRow =
    firstRow + range.getNumRows() - 1;

  const firstColumn = range.getColumn();
  const lastColumn =
    firstColumn + range.getNumColumns() - 1;

  return (
    targetRow >= firstRow &&
    targetRow <= lastRow &&
    targetColumn >= firstColumn &&
    targetColumn <= lastColumn
  );
}

/**
 * Logic chính C3 -> tên Sheet.
 */
function processC3Change_(spreadsheetId, sheetId) {
  const metadata =
    getSpreadsheetMetadata_(spreadsheetId);

  const sheetProperties =
    findSheetById_(metadata, sheetId);

  if (!sheetProperties) {
    return;
  }

  const sheetTitle = sheetProperties.title;

  // Đọc C3 bằng Sheets API v4
  const rawValue =
    readC3ViaApi_(spreadsheetId, sheetTitle);

  const dateParts =
    parseDateValue_(rawValue);

  if (!dateParts) {
    showMessage_(
      'Ngày không hợp lệ',
      'Ô C3 phải chứa ngày hợp lệ.\n\n' +
      'Định dạng yêu cầu: DD/MM/YYYY\n' +
      'Ví dụ: 08/08/2026'
    );

    return;
  }

  const targetSheetName =
    formatDateParts_(dateParts);

  // C3 và tên Sheet đã giống nhau -> bỏ qua
  if (sheetTitle === targetSheetName) {
    return;
  }

  const spreadsheetTimeZone =
    metadata.properties &&
    metadata.properties.timeZone
      ? metadata.properties.timeZone
      : Session.getScriptTimeZone();

  const today =
    Utilities.formatDate(
      new Date(),
      spreadsheetTimeZone,
      'dd/MM/yyyy'
    );

  let shouldRename = false;

  // Nếu C3 = Ngày hiện tại -> Rename ngay
  if (targetSheetName === today) {
    shouldRename = true;
  } else {
    shouldRename =
      confirmSheetRename_(
        sheetTitle,
        targetSheetName
      );
  }

  // Người dùng từ chối: Giữ tên Sheet nhưng chuẩn hóa C3 thành date serial chuẩn
  if (!shouldRename) {
    writeDateToC3_(
      spreadsheetId,
      sheetId,
      dateParts
    );

    return;
  }

  // Kiểm tra tên Sheet có bị trùng hay không
  const duplicate =
    metadata.sheets.some(item => {
      const properties = item.properties;

      return (
        properties.sheetId !== sheetId &&
        properties.title === targetSheetName
      );
    });

  if (duplicate) {
    writeDateToC3_(
      spreadsheetId,
      sheetId,
      dateParts
    );

    showMessage_(
      'Không thể đổi tên Sheet',
      'Đã tồn tại một Sheet có tên:\n\n' +
      targetSheetName +
      '\n\nTên Sheet trong cùng Spreadsheet phải duy nhất.'
    );

    return;
  }

  // Rename Sheet + chuẩn hóa C3 trong một batch request
  renameSheetAndWriteDate_(
    spreadsheetId,
    sheetId,
    targetSheetName,
    dateParts
  );

  updateSnapshotTitle_(
    sheetId,
    targetSheetName
  );
}

/**
 * Prompt xác nhận khi đổi tên Sheet sang ngày khác hôm nay
 */
function confirmSheetRename_(oldName, newName) {
  try {
    const ui = SpreadsheetApp.getUi();

    const result = ui.alert(
      'Xác nhận đổi tên Sheet',
      'Ngày tại ô C3 là:\n\n' +
      newName +
      '\n\nTên Sheet hiện tại:\n' +
      oldName +
      '\n\nBạn có muốn đổi tên Sheet thành "' +
      newName +
      '" không?',
      ui.ButtonSet.YES_NO
    );

    return result === ui.Button.YES;

  } catch (error) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Không thể hiển thị hộp thoại xác nhận. ' +
        'Tên Sheet chưa được thay đổi. ' +
        'Dùng menu "🔄 Đồng bộ ngày → Đổi tên Sheet theo C3".',
        'Cần xác nhận',
        10
      );
    } catch (toastError) {
      console.warn(error);
    }

    return false;
  }
}

/**
 * ON CHANGE - TÊN SHEET -> C3
 */
function handleDateSyncChange(e) {
  if (e && e.changeType === 'EDIT') {
    return;
  }

  syncRenamedSheets_();
}

/**
 * ON OPEN DỰ PHÒNG
 */
function handleDateSyncOpen(e) {
  try {
    onOpen(e);
  } catch (err) {
    console.error('handleDateSyncOpen onOpen error:', err);
  }
  syncRenamedSheets_();
}

/**
 * Menu: kiểm tra thủ công đồng bộ tên Sheet ↔ C3
 */
function syncSheetNamesNow() {
  syncRenamedSheets_();

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Đã kiểm tra đồng bộ tên Sheet ↔ C3.',
      'Đồng bộ ngày',
      4
    );
  } catch (error) {}
}

/**
 * So sánh snapshot để phát hiện thao tác rename tab sheet
 */
function syncRenamedSheets_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    return;
  }

  const spreadsheetId = ss.getId();

  const lock =
    LockService.getDocumentLock();

  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    const metadata =
      getSpreadsheetMetadata_(spreadsheetId);

    const previousSnapshot =
      loadSnapshot_();

    const currentSnapshot =
      createSnapshotFromMetadata_(metadata);

    if (!previousSnapshot) {
      saveSnapshot_(currentSnapshot);
      return;
    }

    const requests = [];
    const existingTitles =
      new Set(
        metadata.sheets.map(
          sheet => sheet.properties.title
        )
      );

    metadata.sheets.forEach(sheet => {
      const properties = sheet.properties;

      const sheetId = properties.sheetId;
      const currentTitle = properties.title;

      const previousTitle =
        previousSnapshot[String(sheetId)];

      if (previousTitle === undefined || previousTitle === currentTitle) {
        return;
      }

      // Đã phát hiện rename tab
      const dateParts =
        parseDateText_(currentTitle);

      if (!dateParts) {
        console.warn(
          'Sheet "' +
          currentTitle +
          '" vừa được đổi tên nhưng không phải ngày hợp lệ.'
        );
        return;
      }

      const canonicalTitle =
        formatDateParts_(dateParts);

      // Cập nhật C3 bằng API v4
      requests.push(
        buildWriteDateRequest_(
          sheetId,
          dateParts
        )
      );

      // Chuẩn hóa tên sheet nếu chưa chuẩn (vd 8/8/2026 -> 08/08/2026)
      if (
        currentTitle !== canonicalTitle &&
        !existingTitles.has(canonicalTitle)
      ) {
        requests.push(
          buildRenameSheetRequest_(
            sheetId,
            canonicalTitle
          )
        );

        currentSnapshot[String(sheetId)] =
          canonicalTitle;

        existingTitles.delete(currentTitle);
        existingTitles.add(canonicalTitle);
      }
    });

    if (requests.length > 0) {
      Sheets.Spreadsheets.batchUpdate(
        {
          requests: requests
        },
        spreadsheetId
      );
    }

    saveSnapshot_(currentSnapshot);

  } catch (error) {
    console.error(
      'Lỗi syncRenamedSheets_:',
      error
    );

  } finally {
    lock.releaseLock();
  }
}

/**
 * Menu: Đổi tên active sheet theo C3
 */
function renameActiveSheetFromC3() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getActiveSheet();

  processC3Change_(
    ss.getId(),
    sheet.getSheetId()
  );
}

/**
 * Metadata qua Sheets API v4
 */
function getSpreadsheetMetadata_(spreadsheetId) {
  return Sheets.Spreadsheets.get(
    spreadsheetId,
    {
      includeGridData: false,
      fields:
        'properties(timeZone),' +
        'sheets(properties(sheetId,title))'
    }
  );
}

function findSheetById_(metadata, sheetId) {
  if (!metadata.sheets) {
    return null;
  }

  for (const sheet of metadata.sheets) {
    if (
      Number(sheet.properties.sheetId) ===
      Number(sheetId)
    ) {
      return sheet.properties;
    }
  }

  return null;
}

/**
 * Đọc C3 qua Sheets API v4
 */
function readC3ViaApi_(
  spreadsheetId,
  sheetTitle
) {
  const range =
    quoteSheetName_(sheetTitle) +
    '!' +
    DATE_SYNC_CONFIG.CELL_A1;

  const response =
    Sheets.Spreadsheets.Values.get(
      spreadsheetId,
      range,
      {
        valueRenderOption:
          'UNFORMATTED_VALUE',
        dateTimeRenderOption:
          'SERIAL_NUMBER'
      }
    );

  if (
    !response.values ||
    !response.values.length ||
    !response.values[0].length
  ) {
    return null;
  }

  return response.values[0][0];
}

/**
 * Ghi C3 qua Sheets API v4
 */
function writeDateToC3_(
  spreadsheetId,
  sheetId,
  dateParts
) {
  Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        buildWriteDateRequest_(
          sheetId,
          dateParts
        )
      ]
    },
    spreadsheetId
  );
}

function buildWriteDateRequest_(
  sheetId,
  dateParts
) {
  const serialNumber =
    datePartsToSerialNumber_(dateParts);

  return {
    updateCells: {
      start: {
        sheetId: Number(sheetId),
        rowIndex:
          DATE_SYNC_CONFIG.ROW_INDEX,
        columnIndex:
          DATE_SYNC_CONFIG.COLUMN_INDEX
      },

      rows: [
        {
          values: [
            {
              userEnteredValue: {
                numberValue: serialNumber
              },

              userEnteredFormat: {
                numberFormat: {
                  type: 'DATE',
                  pattern:
                    DATE_SYNC_CONFIG.DATE_DISPLAY_PATTERN
                }
              }
            }
          ]
        }
      ],

      fields:
        'userEnteredValue,' +
        'userEnteredFormat.numberFormat'
    }
  };
}

function buildRenameSheetRequest_(
  sheetId,
  newTitle
) {
  return {
    updateSheetProperties: {
      properties: {
        sheetId: Number(sheetId),
        title: newTitle
      },

      fields: 'title'
    }
  };
}

function renameSheetAndWriteDate_(
  spreadsheetId,
  sheetId,
  newTitle,
  dateParts
) {
  Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        buildWriteDateRequest_(
          sheetId,
          dateParts
        ),

        buildRenameSheetRequest_(
          sheetId,
          newTitle
        )
      ]
    },
    spreadsheetId
  );
}

function parseDateValue_(value) {
  if (value === null ||
      value === undefined ||
      value === '') {
    return null;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return serialNumberToDateParts_(value);
  }

  if (typeof value === 'string') {
    return parseDateText_(value);
  }

  return null;
}

function parseDateText_(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const normalized =
    text.trim();

  const match =
    normalized.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (!match) {
    return null;
  }

  const day =
    Number(match[1]);

  const month =
    Number(match[2]);

  const year =
    Number(match[3]);

  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const check =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year: year,
    month: month,
    day: day
  };
}

function serialNumberToDateParts_(serial) {
  const wholeDays =
    Math.floor(serial);

  const milliseconds =
    (wholeDays - 25569) *
    86400000;

  const date =
    new Date(milliseconds);

  const year =
    date.getUTCFullYear();

  const month =
    date.getUTCMonth() + 1;

  const day =
    date.getUTCDate();

  if (
    year < 1900 ||
    year > 9999
  ) {
    return null;
  }

  return {
    year: year,
    month: month,
    day: day
  };
}

function datePartsToSerialNumber_(parts) {
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day
    ) /
    86400000
  ) + 25569;
}

function formatDateParts_(parts) {
  return (
    pad2_(parts.day) +
    '/' +
    pad2_(parts.month) +
    '/' +
    String(parts.year).padStart(4, '0')
  );
}

function pad2_(number) {
  return String(number).padStart(2, '0');
}

function createSnapshotFromMetadata_(
  metadata
) {
  const result = {};

  if (!metadata.sheets) {
    return result;
  }

  metadata.sheets.forEach(sheet => {
    result[
      String(sheet.properties.sheetId)
    ] = sheet.properties.title;
  });

  return result;
}

function saveSnapshot_(snapshot) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      DATE_SYNC_CONFIG.SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
}

function loadSnapshot_() {
  const value =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        DATE_SYNC_CONFIG.SNAPSHOT_KEY
      );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function updateSnapshotTitle_(
  sheetId,
  newTitle
) {
  const properties =
    PropertiesService
      .getDocumentProperties();

  const current =
    loadSnapshot_() || {};

  current[String(sheetId)] =
    newTitle;

  properties.setProperty(
    DATE_SYNC_CONFIG.SNAPSHOT_KEY,
    JSON.stringify(current)
  );
}

function quoteSheetName_(sheetName) {
  return (
    "'" +
    String(sheetName)
      .replace(/'/g, "''") +
    "'"
  );
}

function showMessage_(title, message) {
  try {
    SpreadsheetApp
      .getUi()
      .alert(
        title,
        message,
        SpreadsheetApp
          .getUi()
          .ButtonSet.OK
      );

  } catch (error) {
    try {
      SpreadsheetApp
        .getActiveSpreadsheet()
        .toast(
          message,
          title,
          8
        );
    } catch (toastError) {
      console.log(
        title + ': ' + message
      );
    }
  }
}

