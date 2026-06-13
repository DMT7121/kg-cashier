// ══════════════════════════════════════════════════════════════
//  UPGRADED SHEETS API V4 CORE GATEWAY & REGISTRY
// ══════════════════════════════════════════════════════════════

const SHEET_REGISTRY = {
  config: { name: 'KG_CONFIG', headerRow: 1, key: 'config' },
  schema: { name: 'KG_SHEET_SCHEMA', headerRow: 1, key: 'schema' },
  invoiceIndex: { name: 'KG_CUKCUK_INVOICE_INDEX', headerRow: 1, key: 'invoiceIndex' },
  monthJson: { name: 'KG_CUKCUK_MONTH_JSON', headerRow: 1, key: 'monthJson' },
  aggDay: { name: 'KG_CUKCUK_AGG_DAY', headerRow: 1, key: 'aggDay' },
  aggWeek: { name: 'KG_CUKCUK_AGG_WEEK', headerRow: 1, key: 'aggWeek' },
  aggMonth: { name: 'KG_CUKCUK_AGG_MONTH', headerRow: 1, key: 'aggMonth' },
  aggQuarter: { name: 'KG_CUKCUK_AGG_QUARTER', headerRow: 1, key: 'aggQuarter' },
  aggYear: { name: 'KG_CUKCUK_AGG_YEAR', headerRow: 1, key: 'aggYear' },
  syncLog: { name: 'KG_CUKCUK_SYNC_LOG', headerRow: 1, key: 'syncLog' },
  auditLog: { name: 'KG_CUKCUK_AUDIT_LOG', headerRow: 1, key: 'auditLog' },
  backupLog: { name: 'KG_CUKCUK_BACKUP_LOG', headerRow: 1, key: 'backupLog' }
};

const SHEET_HEADERS = {
  config: ['key', 'value', 'jsonValue', 'note', 'updatedAt', 'updatedBy'],
  schema: ['sheetKey', 'sheetName', 'version', 'headerJson', 'formatJson', 'protectedJson', 'note', 'updatedAt'],
  invoiceIndex: ['invoiceKey', 'workDate', 'workMonth', 'workQuarter', 'invoiceTime', 'cukcukRefNo', 'finalAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'paymentMethod', 'paymentStatus', 'sourceSheet', 'sourceRow', 'manualOverride', 'updatedAt'],
  monthJson: ['monthKey', 'schemaVersion', 'chunkIndex', 'chunkTotal', 'jsonChunk', 'rowCount', 'totalFinalAmount', 'checksum', 'generatedAt', 'sourceSheets', 'note'],
  aggDay: ['workDate', 'workMonth', 'workQuarter', 'workYear', 'invoiceCount', 'finalAmount', 'totalAmount', 'discountAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'otherAmount', 'unpaidAmount', 'avgBill', 'firstInvoiceTime', 'lastInvoiceTime', 'topItemsJson', 'paymentJson', 'updatedAt'],
  aggWeek: ['weekKey', 'weekStart', 'weekEnd', 'workMonth', 'workQuarter', 'workYear', 'invoiceCount', 'finalAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'topDaysJson', 'topItemsJson', 'updatedAt'],
  aggMonth: ['monthKey', 'workYear', 'workQuarter', 'invoiceCount', 'finalAmount', 'totalAmount', 'discountAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'otherAmount', 'avgBill', 'bestDay', 'worstDay', 'daysJson', 'paymentJson', 'topItemsJson', 'updatedAt'],
  aggQuarter: ['quarterKey', 'workYear', 'invoiceCount', 'finalAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'monthsJson', 'updatedAt'],
  aggYear: ['year', 'invoiceCount', 'finalAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'quartersJson', 'monthsJson', 'updatedAt'],
  syncLog: ['syncBatchId', 'workDate', 'fromDate', 'toDate', 'triggeredBy', 'triggerSource', 'startedAt', 'finishedAt', 'durationMs', 'totalFetched', 'totalInserted', 'totalUpdated', 'totalSkippedManualOverride', 'totalDeletedMarked', 'totalErrors', 'status', 'errorMessage', 'apiCallCount', 'tokenRefreshed'],
  auditLog: ['auditId', 'invoiceKey', 'action', 'beforeJson', 'afterJson', 'reason', 'user', 'createdAt'],
  backupLog: ['backupId', 'sourceSheet', 'backupSheet', 'rowCount', 'checksum', 'backedUpBy', 'backedUpAt']
};

const NEW_V4_INVOICES_HEADERS = [
  'invoiceKey', 'cukcukInvoiceId', 'cukcukRefNo', 'branchId', 'branchName', 'workDate', 'workMonth', 'workYear', 'workQuarter', 'workWeek', 
  'invoiceTime', 'invoiceHour', 'customerName', 'tableName', 'totalAmount', 'discountAmount', 'serviceCharge', 'vatAmount', 'finalAmount', 'paidAmount', 
  'cashAmount', 'transferAmount', 'cardAmount', 'otherAmount', 'paymentMethod', 'paymentStatus', 'paymentRawJson', 'itemsJson', 'itemSummaryText', 
  'itemCount', 'drinkItemsJson', 'drinkQtyJson', 'sourceRawJson', 'calcJson', 'sourceHash', 'syncBatchId', 'syncAt', 'syncStatus', 
  'manualOverride', 'overrideAt', 'overrideBy', 'overrideReason', 'auditJson', 'createdAt', 'updatedAt'
];

function getHeadersForSheetKey(sheetKey) {
  if (sheetKey.indexOf('KG_CUKCUK_INV_') === 0) {
    return NEW_V4_INVOICES_HEADERS;
  }
  return SHEET_HEADERS[sheetKey] || [];
}

function getRegistrySheetName(key, year) {
  const config = SHEET_REGISTRY[key];
  if (!config) return '';
  if (key === 'invoiceIndex') {
    return config.name + '_' + (year || '2026');
  }
  return config.name;
}

// ── GATEWAY VALUES READ/WRITE ──

function batchGetValuesV4(ranges) {
  try {
    const res = Sheets.Spreadsheets.Values.batchGet(CASHIER_SS_ID, {
      ranges: ranges,
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    return res.valueRanges || [];
  } catch (e) {
    Logger.log('[SheetsApiV4Gateway] batchGetValuesV4 error: ' + e.toString());
    throw e;
  }
}

function batchUpdateValuesV4(valueRanges) {
  try {
    return Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: 'USER_ENTERED',
      data: valueRanges,
      includeValuesInResponse: false
    }, CASHIER_SS_ID);
  } catch (e) {
    Logger.log('[SheetsApiV4Gateway] batchUpdateValuesV4 error: ' + e.toString());
    throw e;
  }
}

function appendRowsV4(sheetName, rows) {
  if (!rows || rows.length === 0) return;
  try {
    return Sheets.Spreadsheets.Values.append({
      values: rows
    }, CASHIER_SS_ID, sheetName + '!A1', {
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS'
    });
  } catch (e) {
    Logger.log('[SheetsApiV4Gateway] appendRowsV4 error on ' + sheetName + ': ' + e.toString());
    throw e;
  }
}

function clearRangeV4(range) {
  try {
    Sheets.Spreadsheets.Values.clear({}, CASHIER_SS_ID, range);
  } catch (e) {
    Logger.log('[SheetsApiV4Gateway] clearRangeV4 error on ' + range + ': ' + e.toString());
  }
}

function batchUpdateSpreadsheetV4(requests) {
  if (!requests || requests.length === 0) return;
  try {
    return Sheets.Spreadsheets.batchUpdate({
      requests: requests
    }, CASHIER_SS_ID);
  } catch (e) {
    Logger.log('[SheetsApiV4Gateway] batchUpdateSpreadsheetV4 error: ' + e.toString());
    throw e;
  }
}

// ── SCHEMA & REGISTRY SERVICES ──

function getSheetMetadataV4() {
  const ss = Sheets.Spreadsheets.get(CASHIER_SS_ID);
  const map = {};
  if (ss.sheets) {
    ss.sheets.forEach(s => {
      map[s.properties.title] = s.properties.sheetId;
    });
  }
  return map;
}

function ensureSheetByNameV4(sheetName) {
  const metadata = getSheetMetadataV4();
  if (metadata[sheetName] !== undefined) {
    return metadata[sheetName];
  }
  
  const response = Sheets.Spreadsheets.batchUpdate({
    requests: [{
      addSheet: {
        properties: {
          title: sheetName
        }
      }
    }]
  }, CASHIER_SS_ID);
  
  return response.replies[0].addSheet.properties.sheetId;
}

function ensureSheetByRegistryKey(key, year) {
  const name = getRegistrySheetName(key, year);
  if (!name) return null;
  const sheetId = ensureSheetByNameV4(name);
  ensureHeadersV4(key, year);
  ensureSheetFormatV4(key, year);
  return sheetId;
}

function ensureMonthSheetV4(monthKey) {
  const sheetName = 'KG_CUKCUK_INV_' + monthKey.replace('-', '_');
  const metadata = getSheetMetadataV4();
  if (metadata[sheetName] === undefined) {
    ensureSheetByNameV4(sheetName);
    _sheetsBatchWrite(sheetName, sheetName + '!A1:' + _colLetter(NEW_V4_INVOICES_HEADERS.length) + '1', [NEW_V4_INVOICES_HEADERS]);
    ensureSheetFormatV4(sheetName);
  }
  return sheetName;
}

function ensureHeadersV4(sheetKey, year) {
  const sheetName = getRegistrySheetName(sheetKey, year);
  const expectedHeaders = getHeadersForSheetKey(sheetKey);
  if (!expectedHeaders || expectedHeaders.length === 0) return;

  const allRows = _sheetsGet(sheetName);
  if (allRows.length === 0 || allRows[0].length === 0) {
    _sheetsBatchWrite(sheetName, sheetName + '!A1:' + _colLetter(expectedHeaders.length) + '1', [expectedHeaders]);
  } else {
    const existingHeaders = allRows[0];
    let match = true;
    for (let i = 0; i < expectedHeaders.length; i++) {
      if (existingHeaders[i] !== expectedHeaders[i]) {
        match = false;
        break;
      }
    }
    if (!match) {
      Logger.log('[ensureHeadersV4] Headers mismatch for ' + sheetName + '. Rewriting...');
      _sheetsBatchWrite(sheetName, sheetName + '!A1:' + _colLetter(expectedHeaders.length) + '1', [expectedHeaders]);
    }
  }
}

function ensureSheetFormatV4(sheetKey, year) {
  const sheetName = sheetKey.indexOf('KG_CUKCUK_INV_') === 0 ? sheetKey : getRegistrySheetName(sheetKey, year);
  const sheetId = ensureSheetByNameV4(sheetName);
  const headers = getHeadersForSheetKey(sheetKey);
  if (!headers || headers.length === 0) return;

  const requests = [];

  // Freeze Row 1
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetId,
        gridProperties: {
          frozenRowCount: 1
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Header Format: Bold, #111 Text, #e8a838 Background
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            bold: true,
            foregroundColor: { red: 0.07, green: 0.07, blue: 0.07 }
          },
          backgroundColor: { red: 0.91, green: 0.66, blue: 0.22 }
        }
      },
      fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor'
    }
  });

  // Currency Formats
  const currencyCols = ['totalAmount', 'discountAmount', 'serviceCharge', 'vatAmount', 'finalAmount', 'paidAmount', 'cashAmount', 'transferAmount', 'cardAmount', 'otherAmount', 'unpaidAmount', 'avgBill'];
  currencyCols.forEach(col => {
    const idx = headers.indexOf(col);
    if (idx !== -1) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            startColumnIndex: idx,
            endColumnIndex: idx + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'CURRENCY',
                pattern: '#,##0" đ"'
              }
            }
          },
          fields: 'userEnteredFormat.numberFormat'
        }
      });
    }
  });

  // JSON columns sizing and clipping to prevent overflow
  const jsonCols = ['paymentRawJson', 'itemsJson', 'sourceRawJson', 'calcJson', 'auditJson', 'topItemsJson', 'paymentJson', 'topDaysJson', 'monthsJson', 'quartersJson'];
  jsonCols.forEach(col => {
    const idx = headers.indexOf(col);
    if (idx !== -1) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: idx,
            endIndex: idx + 1
          },
          properties: {
            pixelSize: 100
          },
          fields: 'pixelSize'
        }
      });
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            startColumnIndex: idx,
            endColumnIndex: idx + 1
          },
          cell: {
            userEnteredFormat: {
              wrapStrategy: 'CLIP'
            }
          },
          fields: 'userEnteredFormat.wrapStrategy'
        }
      });
    }
  });

  // Auto size non-JSON columns
  headers.forEach((h, idx) => {
    if (jsonCols.indexOf(h) === -1) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: idx,
            endIndex: idx + 1
          },
          properties: {
            pixelSize: 120
          },
          fields: 'pixelSize'
        }
      });
    }
  });

  // Set Auto Filter
  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 100000,
          startColumnIndex: 0,
          endColumnIndex: headers.length
        }
      }
    }
  });

  batchUpdateSpreadsheetV4(requests);
}

// ── MAPPING HELPERS ──

function getWeekKeyGas(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
                        - 3 + (week1.getDay() + 6) % 7) / 7);
  return date.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

function mapPaymentMethodGas(methodName) {
  const name = String(methodName).toLowerCase();
  if (name.includes('tiền mặt') || name.includes('cash')) return 'cash';
  if (name.includes('chuyển khoản') || name.includes('transfer') || name.includes('ngân hàng') || name.includes('bank')) return 'transfer';
  if (name.includes('thẻ') || name.includes('card') || name.includes('credit') || name.includes('atm')) return 'card';
  return 'other';
}

function md5HashGas(str) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8);
  let hexStr = '';
  for (let i = 0; i < digest.length; i++) {
    let byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length == 1) byteHex = '0' + byteHex;
    hexStr += byteHex;
  }
  return hexStr;
}

// Convert Row array to Object
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h] = (row[idx] !== undefined && row[idx] !== null) ? row[idx] : '';
  });
  return obj;
}

// Convert Object to Row array
function objectToRow(headers, obj) {
  const row = new Array(headers.length).fill('');
  headers.forEach((h, idx) => {
    row[idx] = (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  return row;
}

// Bulk convert objects to rows
function objectsToRows(headers, objects) {
  return objects.map(function(obj) { return objectToRow(headers, obj); });
}

// Bulk convert rows to objects
function rowsToObjects(headers, rows) {
  return rows.map(function(row) { return rowToObject(headers, row); });
}

// Get the sheet name for a monthly raw partitioned sheet
function getMonthSheetName(monthKey) {
  return 'KG_CUKCUK_INV_' + monthKey.replace('-', '_');
}

// Inserts or updates a single row in an aggregate sheet using V4 API
function upsertAggregateRow(sheetName, keyCol, keyValue, aggObj) {
  try {
    const rawRows = _sheetsGet(sheetName);
    const headers = getHeadersForSheetKey(sheetName);
    if (!headers || headers.length === 0) {
      Logger.log('[upsertAggregateRow] Warning: No headers found for ' + sheetName);
      return;
    }
    const keyIdx = headers.indexOf(keyCol);
    if (keyIdx === -1) {
      Logger.log('[upsertAggregateRow] Error: Key column ' + keyCol + ' not found in headers for ' + sheetName);
      return;
    }
    
    let rowIndex = -1;
    for (let i = 1; i < rawRows.length; i++) {
      if (String(rawRows[i][keyIdx]) === String(keyValue)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const row = objectToRow(headers, aggObj);
    if (rowIndex > 0) {
      const range = sheetName + '!A' + rowIndex + ':' + _colLetter(headers.length) + rowIndex;
      batchUpdateValuesV4([{
        range: range,
        values: [row]
      }]);
    } else {
      appendRowsV4(sheetName, [row]);
    }
  } catch (e) {
    Logger.log('[upsertAggregateRow] Error on ' + sheetName + ': ' + e.toString());
    throw e;
  }
}

// ── CUKCUK API & NORMALIZER ──

function normalizeInvoiceV4(inv, detail) {
  const workDate = _getWorkingDayGas(inv.RefDate || inv.CreatedDate || new Date());
  const dateObj = new Date(inv.RefDate || inv.CreatedDate);
  const workMonth = workDate.substring(0, 7);
  const workYear = workDate.substring(0, 4);
  
  const m = parseInt(workDate.substring(5, 7));
  const qNum = Math.floor((m - 1) / 3) + 1;
  const workQuarter = workYear + '-Q' + qNum;
  const workWeek = getWeekKeyGas(dateObj);

  let itemsList = [];
  if (detail && detail.SAInvoiceDetails) {
    itemsList = detail.SAInvoiceDetails.map(d => ({
      name: d.ItemName || '',
      qty: d.Quantity || 0,
      price: d.UnitPrice || 0,
      amount: d.Amount || 0,
      discount: d.DiscountAmount || 0
    }));
  }
  
  const itemCount = itemsList.length;
  const itemsJson = JSON.stringify(itemsList);
  
  const mainItems = itemsList.slice(0, 3).map(it => it.name + ' (x' + it.qty + ')');
  const itemSummaryText = mainItems.join(', ') + (itemsList.length > 3 ? '...' : '');

  let payments = [];
  if (detail && detail.SAInvoicePayments) {
    payments = detail.SAInvoicePayments.map(p => ({
      method: mapPaymentMethodGas(p.PaymentMethodName || p.PaymentMethod || ''),
      amount: p.Amount || 0,
      label: p.PaymentMethodName || ''
    }));
  }
  
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  let otherAmount = 0;
  
  payments.forEach(p => {
    if (p.method === 'cash') cashAmount += p.amount;
    else if (p.method === 'transfer') transferAmount += p.amount;
    else if (p.method === 'card') cardAmount += p.amount;
    else otherAmount += p.amount;
  });

  const totalAmount = inv.Amount || 0;
  const discountAmount = inv.DiscountAmount || 0;
  const finalAmount = inv.TotalAmount !== undefined ? inv.TotalAmount : (totalAmount - discountAmount);
  const paidAmount = cashAmount + transferAmount + cardAmount + otherAmount;

  return {
    invoiceKey: String(inv.RefId || ''),
    cukcukInvoiceId: String(inv.RefId || ''),
    cukcukRefNo: String(inv.RefNo || ''),
    branchId: String(inv.BranchId || ''),
    branchName: String(inv.BranchName || ''),
    workDate: workDate,
    workMonth: workMonth,
    workYear: workYear,
    workQuarter: workQuarter,
    workWeek: workWeek,
    invoiceTime: inv.RefDate ? new Date(inv.RefDate.replace(' ', 'T')).toISOString() : new Date().toISOString(),
    invoiceHour: dateObj.getHours(),
    customerName: String(inv.CustomerName || ''),
    tableName: String(inv.TableName || ''),
    totalAmount: totalAmount,
    discountAmount: discountAmount,
    serviceCharge: inv.ServiceAmount || 0,
    vatAmount: inv.VATAmount || 0,
    finalAmount: finalAmount,
    paidAmount: paidAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    otherAmount: otherAmount,
    paymentMethod: inv.PaymentTypeName || inv.PaymentType || 'Chưa thanh toán',
    paymentStatus: (inv.PaymentStatus === 3 || inv.PaymentStatus === 'Paid') ? 'Thanh toán' : 'Chưa thanh toán',
    paymentRawJson: JSON.stringify(payments),
    itemsJson: itemsJson,
    itemSummaryText: itemSummaryText,
    itemCount: itemCount,
    drinkItemsJson: '[]',
    drinkQtyJson: '{}',
    sourceRawJson: JSON.stringify(inv),
    calcJson: '{}',
    sourceHash: md5HashGas(JSON.stringify(inv) + JSON.stringify(detail || {})),
    syncBatchId: '',
    syncAt: new Date().toISOString(),
    syncStatus: 'OK',
    manualOverride: false,
    overrideAt: '',
    overrideBy: '',
    overrideReason: '',
    auditJson: '[]',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── REBUILD AGGREGATE SERVICES ──

function rebuildAggregatesForDate(workDate) {
  const monthKey = workDate.substring(0, 7);
  const sheetName = getMonthSheetName(monthKey);
  
  const metadata = getSheetMetadataV4();
  if (metadata[sheetName] === undefined) return;

  const rawRows = _getSheetData(sheetName);
  const invoices = rawRows.filter(r => r.workDate === workDate && (r.paymentStatus === 'Thanh toán' || r.paymentStatus === 'Đã thanh toán'));
  const allInvoices = rawRows.filter(r => r.workDate === workDate);

  let invoiceCount = invoices.length;
  let finalAmount = 0;
  let totalAmount = 0;
  let discountAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  let otherAmount = 0;
  let unpaidAmount = 0;
  
  let firstInvoiceTime = '';
  let lastInvoiceTime = '';
  
  const itemMap = {};
  const paymentMap = { cash: 0, card: 0, transfer: 0, other: 0 };

  allInvoices.forEach(inv => {
    const isPaid = inv.paymentStatus === 'Thanh toán' || inv.paymentStatus === 'Đã thanh toán';
    const finalAmt = Number(inv.finalAmount) || 0;
    
    if (!isPaid) {
      unpaidAmount += finalAmt;
    } else {
      finalAmount += finalAmt;
      totalAmount += Number(inv.totalAmount) || 0;
      discountAmount += Number(inv.discountAmount) || 0;
      cashAmount += Number(inv.cashAmount) || 0;
      transferAmount += Number(inv.transferAmount) || 0;
      cardAmount += Number(inv.cardAmount) || 0;
      otherAmount += Number(inv.otherAmount) || 0;
      
      const invTime = inv.invoiceTime || '';
      if (invTime) {
        if (!firstInvoiceTime || invTime < firstInvoiceTime) firstInvoiceTime = invTime;
        if (!lastInvoiceTime || invTime > lastInvoiceTime) lastInvoiceTime = invTime;
      }

      if (inv.itemsJson) {
        try {
          const items = JSON.parse(inv.itemsJson);
          if (Array.isArray(items)) {
            items.forEach(it => {
              const name = it.name;
              const qty = Number(it.qty) || 0;
              if (name) {
                itemMap[name] = (itemMap[name] || 0) + qty;
              }
            });
          }
        } catch(e) {}
      }
    }
  });

  const topItems = Object.keys(itemMap).map(name => ({
    name: name,
    quantity: itemMap[name]
  })).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  const avgBill = invoiceCount > 0 ? Math.round(finalAmount / invoiceCount) : 0;
  
  paymentMap.cash = cashAmount;
  paymentMap.card = cardAmount;
  paymentMap.transfer = transferAmount;
  paymentMap.other = otherAmount;

  const y = workDate.substring(0, 4);
  const m = parseInt(workDate.substring(5, 7));
  const qNum = Math.floor((m - 1) / 3) + 1;
  const workQuarter = y + '-Q' + qNum;

  const aggObj = {
    workDate: workDate,
    workMonth: monthKey,
    workQuarter: workQuarter,
    workYear: y,
    invoiceCount: invoiceCount,
    finalAmount: finalAmount,
    totalAmount: totalAmount,
    discountAmount: discountAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    otherAmount: otherAmount,
    unpaidAmount: unpaidAmount,
    avgBill: avgBill,
    firstInvoiceTime: firstInvoiceTime,
    lastInvoiceTime: lastInvoiceTime,
    topItemsJson: JSON.stringify(topItems),
    paymentJson: JSON.stringify(paymentMap),
    updatedAt: new Date().toISOString()
  };

  upsertAggregateRow('KG_CUKCUK_AGG_DAY', 'workDate', workDate, aggObj);
  
  // Rebuild week/month/quarter/year
  const parts = workDate.split('-');
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
  const weekKey = getWeekKeyGas(dateObj);
  
  rebuildWeeklyAggregate(weekKey);
  rebuildMonthlyAggregate(monthKey);
  rebuildQuarterlyAggregate(workQuarter);
  rebuildYearlyAggregate(y);
}

function rebuildWeeklyAggregate(weekKey) {
  const dayRows = _getSheetData('KG_CUKCUK_AGG_DAY');
  const matchDays = dayRows.filter(d => {
    const parts = d.workDate.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    return getWeekKeyGas(date) === weekKey;
  });

  if (matchDays.length === 0) return;

  matchDays.sort((a, b) => a.workDate.localeCompare(b.workDate));
  const weekStart = matchDays[0].workDate;
  const weekEnd = matchDays[matchDays.length - 1].workDate;

  let invoiceCount = 0;
  let finalAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  
  const dayBreakdown = [];
  const itemMap = {};

  matchDays.forEach(d => {
    invoiceCount += Number(d.invoiceCount) || 0;
    finalAmount += Number(d.finalAmount) || 0;
    cashAmount += Number(d.cashAmount) || 0;
    transferAmount += Number(d.transferAmount) || 0;
    cardAmount += Number(d.cardAmount) || 0;

    dayBreakdown.push({
      date: d.workDate,
      amount: Number(d.finalAmount) || 0
    });

    if (d.topItemsJson) {
      try {
        const items = JSON.parse(d.topItemsJson);
        if (Array.isArray(items)) {
          items.forEach(it => {
            itemMap[it.name] = (itemMap[it.name] || 0) + (Number(it.quantity) || 0);
          });
        }
      } catch(e) {}
    }
  });

  const topItems = Object.keys(itemMap).map(name => ({
    name: name,
    quantity: itemMap[name]
  })).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  const workMonth = weekStart.substring(0, 7);
  const y = weekStart.substring(0, 4);
  const m = parseInt(weekStart.substring(5, 7));
  const qNum = Math.floor((m - 1) / 3) + 1;
  const workQuarter = y + '-Q' + qNum;

  const aggObj = {
    weekKey: weekKey,
    weekStart: weekStart,
    weekEnd: weekEnd,
    workMonth: workMonth,
    workQuarter: workQuarter,
    workYear: y,
    invoiceCount: invoiceCount,
    finalAmount: finalAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    topDaysJson: JSON.stringify(dayBreakdown),
    topItemsJson: JSON.stringify(topItems),
    updatedAt: new Date().toISOString()
  };

  upsertAggregateRow('KG_CUKCUK_AGG_WEEK', 'weekKey', weekKey, aggObj);
}

function rebuildMonthlyAggregate(monthKey) {
  const dayRows = _getSheetData('KG_CUKCUK_AGG_DAY');
  const matchDays = dayRows.filter(d => d.workMonth === monthKey);

  if (matchDays.length === 0) return;

  let invoiceCount = 0;
  let finalAmount = 0;
  let totalAmount = 0;
  let discountAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  let otherAmount = 0;
  
  const dayBreakdown = [];
  const itemMap = {};
  const paymentMap = { cash: 0, card: 0, transfer: 0, other: 0 };
  
  let bestDay = '';
  let bestAmt = 0;
  let worstDay = '';
  let worstAmt = Infinity;

  matchDays.forEach(d => {
    const amt = Number(d.finalAmount) || 0;
    invoiceCount += Number(d.invoiceCount) || 0;
    finalAmount += amt;
    totalAmount += Number(d.totalAmount) || 0;
    discountAmount += Number(d.discountAmount) || 0;
    cashAmount += Number(d.cashAmount) || 0;
    transferAmount += Number(d.transferAmount) || 0;
    cardAmount += Number(d.cardAmount) || 0;
    otherAmount += Number(d.otherAmount) || 0;

    dayBreakdown.push({
      date: d.workDate,
      amount: amt
    });

    if (amt > bestAmt) {
      bestAmt = amt;
      bestDay = d.workDate;
    }
    if (amt < worstAmt && amt > 0) {
      worstAmt = amt;
      worstDay = d.workDate;
    }

    if (d.topItemsJson) {
      try {
        const items = JSON.parse(d.topItemsJson);
        if (Array.isArray(items)) {
          items.forEach(it => {
            itemMap[it.name] = (itemMap[it.name] || 0) + (Number(it.quantity) || 0);
          });
        }
      } catch(e) {}
    }
  });

  const topItems = Object.keys(itemMap).map(name => ({
    name: name,
    quantity: itemMap[name]
  })).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  const avgBill = invoiceCount > 0 ? Math.round(finalAmount / invoiceCount) : 0;
  paymentMap.cash = cashAmount;
  paymentMap.card = cardAmount;
  paymentMap.transfer = transferAmount;
  paymentMap.other = otherAmount;

  const y = monthKey.substring(0, 4);
  const m = parseInt(monthKey.substring(5, 7));
  const qNum = Math.floor((m - 1) / 3) + 1;
  const workQuarter = y + '-Q' + qNum;

  const aggObj = {
    monthKey: monthKey,
    workYear: y,
    workQuarter: workQuarter,
    invoiceCount: invoiceCount,
    finalAmount: finalAmount,
    totalAmount: totalAmount,
    discountAmount: discountAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    otherAmount: otherAmount,
    avgBill: avgBill,
    bestDay: bestDay,
    worstDay: worstDay === Infinity ? '' : worstDay,
    daysJson: JSON.stringify(dayBreakdown),
    paymentJson: JSON.stringify(paymentMap),
    topItemsJson: JSON.stringify(topItems),
    updatedAt: new Date().toISOString()
  };

  upsertAggregateRow('KG_CUKCUK_AGG_MONTH', 'monthKey', monthKey, aggObj);
}

function rebuildQuarterlyAggregate(quarterKey) {
  const monthRows = _getSheetData('KG_CUKCUK_AGG_MONTH');
  const matchMonths = monthRows.filter(m => m.workQuarter === quarterKey);

  if (matchMonths.length === 0) return;

  let invoiceCount = 0;
  let finalAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  
  const monthBreakdown = [];

  matchMonths.forEach(m => {
    invoiceCount += Number(m.invoiceCount) || 0;
    finalAmount += Number(m.finalAmount) || 0;
    cashAmount += Number(m.cashAmount) || 0;
    transferAmount += Number(m.transferAmount) || 0;
    cardAmount += Number(m.cardAmount) || 0;

    monthBreakdown.push({
      month: m.monthKey,
      amount: Number(m.finalAmount) || 0
    });
  });

  const y = quarterKey.split('-Q')[0];

  const aggObj = {
    quarterKey: quarterKey,
    workYear: y,
    invoiceCount: invoiceCount,
    finalAmount: finalAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    monthsJson: JSON.stringify(monthBreakdown),
    updatedAt: new Date().toISOString()
  };

  upsertAggregateRow('KG_CUKCUK_AGG_QUARTER', 'quarterKey', quarterKey, aggObj);
}

function rebuildYearlyAggregate(year) {
  const quarterRows = _getSheetData('KG_CUKCUK_AGG_QUARTER');
  const matchQuarters = quarterRows.filter(q => q.workYear === year);

  if (matchQuarters.length === 0) return;

  let invoiceCount = 0;
  let finalAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  
  const quarterBreakdown = [];

  matchQuarters.forEach(q => {
    invoiceCount += Number(q.invoiceCount) || 0;
    finalAmount += Number(q.finalAmount) || 0;
    cashAmount += Number(q.cashAmount) || 0;
    transferAmount += Number(q.transferAmount) || 0;
    cardAmount += Number(q.cardAmount) || 0;

    quarterBreakdown.push({
      quarter: q.quarterKey,
      amount: Number(q.finalAmount) || 0
    });
  });

  const monthRows = _getSheetData('KG_CUKCUK_AGG_MONTH');
  const matchMonths = monthRows.filter(m => m.workYear === year);
  const monthBreakdown = matchMonths.map(m => ({
    month: m.monthKey,
    amount: Number(m.finalAmount) || 0
  }));

  const aggObj = {
    year: year,
    invoiceCount: invoiceCount,
    finalAmount: finalAmount,
    cashAmount: cashAmount,
    transferAmount: transferAmount,
    cardAmount: cardAmount,
    quartersJson: JSON.stringify(quarterBreakdown),
    monthsJson: JSON.stringify(monthBreakdown),
    updatedAt: new Date().toISOString()
  };

  upsertAggregateRow('KG_CUKCUK_AGG_YEAR', 'year', year, aggObj);
}

// ── REBUILD MONTH JSON SERVICE ──

function buildMonthJsonFromRaw(monthKey) {
  const sheetName = getMonthSheetName(monthKey);
  const metadata = getSheetMetadataV4();
  if (metadata[sheetName] === undefined) return null;

  const rawRows = _getSheetData(sheetName);
  // Filter only active paid invoices for reporting payload
  const invoices = rawRows.filter(r => r.syncStatus !== 'DELETED');

  let finalAmount = 0;
  let cashAmount = 0;
  let transferAmount = 0;
  let cardAmount = 0;
  
  const daysSummary = {};

  invoices.forEach(inv => {
    const isPaid = inv.paymentStatus === 'Thanh toán' || inv.paymentStatus === 'Đã thanh toán';
    if (isPaid) {
      const amt = Number(inv.finalAmount) || 0;
      finalAmount += amt;
      cashAmount += Number(inv.cashAmount) || 0;
      transferAmount += Number(inv.transferAmount) || 0;
      cardAmount += Number(inv.cardAmount) || 0;

      const date = inv.workDate;
      if (!daysSummary[date]) {
        daysSummary[date] = { count: 0, total: 0 };
      }
      daysSummary[date].count++;
      daysSummary[date].total += amt;
    }
  });

  const jsonObject = {
    schemaVersion: 2,
    monthKey: monthKey,
    generatedAt: new Date().toISOString(),
    summary: {
      invoiceCount: invoices.filter(r => r.paymentStatus === 'Thanh toán' || r.paymentStatus === 'Đã thanh toán').length,
      finalAmount: finalAmount,
      cashAmount: cashAmount,
      transferAmount: transferAmount,
      cardAmount: cardAmount
    },
    days: daysSummary,
    invoices: invoices.map(r => ({
      refId: r.cukcukInvoiceId || r.invoiceKey,
      refNo: r.cukcukRefNo,
      refDate: r.invoiceTime,
      workDate: r.workDate,
      tableName: r.tableName,
      employeeName: r.employeeName || r.cashierName || 'THU NGÂN',
      amount: Number(r.finalAmount) || 0,
      payments: JSON.parse(r.paymentRawJson || '[]'),
      isPaid: r.paymentStatus === 'Thanh toán' || r.paymentStatus === 'Đã thanh toán',
      isCancelled: r.isCancelled === 'true' || r.isCancelled === true,
      isDeleted: r.isDeleted === 'true' || r.isDeleted === true,
      rowHash: r.sourceHash,
      itemsCount: Number(r.itemCount) || 0,
      items: JSON.parse(r.itemsJson || '[]'),
      manualOverride: r.manualOverride === 'true' || r.manualOverride === true,
      overrideReason: r.overrideReason,
      overrideBy: r.overrideBy,
      overrideAt: r.overrideAt
    }))
  };

  const jsonStr = JSON.stringify(jsonObject);
  const checksum = md5HashGas(jsonStr);

  saveMonthJsonChunks(monthKey, jsonStr, invoices.length, finalAmount, checksum);
  return jsonObject;
}

function saveMonthJsonChunks(monthKey, jsonStr, rowCount, totalFinalAmount, checksum) {
  ensureSheetByRegistryKey('monthJson');
  
  const allRows = _sheetsGet('KG_CUKCUK_MONTH_JSON');
  const headers = getHeadersForSheetKey('monthJson');
  const colIndex = headers.indexOf('monthKey');

  const CHUNK_SIZE = 45000;
  const chunkCount = Math.ceil(jsonStr.length / CHUNK_SIZE);
  const chunkRows = [];
  
  for (let i = 0; i < chunkCount; i++) {
    const chunk = jsonStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    chunkRows.push({
      monthKey: monthKey,
      schemaVersion: 2,
      chunkIndex: i,
      chunkTotal: chunkCount,
      jsonChunk: chunk,
      rowCount: rowCount,
      totalFinalAmount: totalFinalAmount,
      checksum: checksum,
      generatedAt: new Date().toISOString(),
      sourceSheets: getMonthSheetName(monthKey),
      note: 'Chunk ' + (i+1) + '/' + chunkCount
    });
  }

  const keepObjects = [];
  for (let i = 1; i < allRows.length; i++) {
    if (String(allRows[i][colIndex]) !== String(monthKey)) {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = allRows[i][idx] !== undefined ? allRows[i][idx] : '';
      });
      keepObjects.push(obj);
    }
  }

  const allObjects = keepObjects.concat(chunkRows);
  const rows = objectsToRows(headers, allObjects);

  clearRangeV4('KG_CUKCUK_MONTH_JSON!A2:ZZ');
  if (rows.length > 0) {
    _sheetsBatchWrite('KG_CUKCUK_MONTH_JSON', 'KG_CUKCUK_MONTH_JSON!A2:' + _colLetter(headers.length) + (rows.length + 1), rows);
  }
}

function loadMonthJsonFast(monthKey) {
  const rawRows = _getSheetData('KG_CUKCUK_MONTH_JSON');
  const chunks = rawRows.filter(r => r.monthKey === monthKey).sort((a, b) => (Number(a.chunkIndex) - Number(b.chunkIndex)));
  
  if (chunks.length === 0) return null;

  let jsonStr = '';
  chunks.forEach(c => {
    jsonStr += c.jsonChunk;
  });

  return JSON.parse(jsonStr);
}

// ── REFACTORED INCREMENTAL CUKCUK SYNC ──

function apiRunCukcukSync(data) {
  const startedAt = new Date();
  const workDateStr = data.workDate || _getWorkingDayGas(startedAt);
  const year = workDateStr.substring(0, 4);
  const forceMode = data.forceRebuild === true || 
                    data.forceMode === true || 
                    data.forceDetail === true ||
                    String(data.forceRebuild).toLowerCase() === 'true' ||
                    String(data.forceMode).toLowerCase() === 'true' ||
                    String(data.forceDetail).toLowerCase() === 'true';
  const syncBatchId = 'batch_' + Date.now().toString(36);

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedManualOverride = 0;
  let totalDeletedMarked = 0;
  let totalErrors = 0;
  let apiCallCount = 0;
  let tokenRefreshed = false;
  let status = 'SUCCESS';
  let errorMessage = '';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'cukcuk_sync_active_' + workDateStr;
  
  if (cache.get(cacheKey)) {
    return {
      ok: false,
      message: 'Hệ thống đang thực hiện đồng bộ hóa hóa đơn từ một thiết bị khác.'
    };
  }
  cache.put(cacheKey, 'true', 120);

  try {
    // 1. Authenticate MISA CUKCUK
    apiCallCount++;
    const loginInfo = CukcukService.refreshAccessTokenIfNeeded();
    if (loginInfo.refreshed) tokenRefreshed = true;

    // 2. Format sync window dates
    const parts = workDateStr.split('-');
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const d = parseInt(parts[2]);
    const pad = function(n) { return n < 10 ? '0' + n : String(n); };
    const fromTime = y + '-' + pad(m + 1) + '-' + pad(d) + 'T12:00:00';
    const nextDay = new Date(y, m, d + 1);
    const toTime = nextDay.getFullYear() + '-' + pad(nextDay.getMonth() + 1) + '-' + pad(nextDay.getDate()) + 'T06:00:00';

    // 3. Fetch invoices list
    apiCallCount++;
    const invoices = CukcukService.fetchInvoicesByDateRange(fromTime, toTime, loginInfo);
    
    // Filter active range strictly
    const activeInvoices = invoices.filter(inv => {
      const refDateStr = inv.RefDate || inv.CreatedDate || '';
      if (!refDateStr) return false;
      const refTime = new Date(refDateStr.replace(' ', 'T')).getTime();
      const fromTimeMs = new Date(fromTime.replace(' ', 'T')).getTime();
      const toTimeMs = new Date(toTime.replace(' ', 'T')).getTime();
      return refTime >= fromTimeMs && refTime <= toTimeMs;
    });

    totalFetched = activeInvoices.length;

    // Setup local cache index of target month raw invoices
    const monthKey = workDateStr.substring(0, 7);
    const monthSheetName = ensureMonthSheetV4(monthKey);
    ensureSheetByRegistryKey('invoiceIndex', year);
    
    const rawInvoices = _sheetsGet(monthSheetName);
    const rawHeaders = rawInvoices[0] || NEW_V4_INVOICES_HEADERS;
    const keyIdx = rawHeaders.indexOf('invoiceKey');
    const modIdx = rawHeaders.indexOf('modifiedTime');
    const hashIdx = rawHeaders.indexOf('sourceHash');
    const overIdx = rawHeaders.indexOf('manualOverride');
    
    const existingMap = {};
    for (let i = 1; i < rawInvoices.length; i++) {
      const k = String(rawInvoices[i][keyIdx]);
      if (k) {
        existingMap[k] = {
          rowIndex: i + 1,
          modifiedTime: String(rawInvoices[i][modIdx]),
          sourceHash: String(rawInvoices[i][hashIdx]),
          manualOverride: rawInvoices[i][overIdx] === true || String(rawInvoices[i][overIdx]).toLowerCase() === 'true',
          row: rawInvoices[i]
        };
      }
    }

    // Determine details fetching list
    const invoicesToFetch = [];
    activeInvoices.forEach(inv => {
      const key = String(inv.RefId || '');
      if (!key) return;
      const exist = existingMap[key];
      if (exist && exist.manualOverride && !forceMode) {
        totalSkippedManualOverride++;
        return;
      }
      const apiMod = String(inv.ModifiedDate || inv.ModifiedTime || '');
      if (exist && exist.modifiedTime === apiMod && !forceMode) {
        return; // Up to date
      }
      invoicesToFetch.push({ key: key, inv: inv });
    });

    // Bulk Fetch Detail JSONs in parallel chunks
    const detailMap = {};
    if (invoicesToFetch.length > 0) {
      const fetchHeaders = {
        'Authorization': 'Bearer ' + loginInfo.token,
        'CompanyCode': loginInfo.companyCode,
        'Content-Type': 'application/json'
      };
      const requests = invoicesToFetch.map(item => ({
        url: 'https://graphapi.cukcuk.vn/api/v1/sainvoices/' + item.key,
        method: 'GET',
        headers: fetchHeaders,
        muteHttpExceptions: true
      }));

      const CHUNK_SIZE = 5;
      const responses = [];
      for (let k = 0; k < requests.length; k += CHUNK_SIZE) {
        const chunk = requests.slice(k, k + CHUNK_SIZE);
        apiCallCount += chunk.length;
        if (k > 0) Utilities.sleep(1000);
        const chunkResponses = UrlFetchApp.fetchAll(chunk);
        chunkResponses.forEach(r => responses.push(r));
      }

      invoicesToFetch.forEach((item, idx) => {
        const resp = responses[idx];
        if (resp && resp.getResponseCode() === 200) {
          try {
            const parsed = JSON.parse(resp.getContentText());
            if (parsed && parsed.Success && parsed.Data) {
              detailMap[item.key] = parsed.Data;
            }
          } catch(e) { totalErrors++; }
        } else { totalErrors++; }
      });
    }

    // Write lock phase
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(20000);
    if (!hasLock) throw new Error('Lock busy.');

    try {
      const freshIndex = _sheetsGet(getRegistrySheetName('invoiceIndex', year));
      const idxHeaders = freshIndex[0] || SHEET_HEADERS.invoiceIndex;
      const idxColIndex = {};
      idxHeaders.forEach((h, i) => { idxColIndex[h] = i; });
      const idxMap = {};
      for (let i = 1; i < freshIndex.length; i++) {
        const key = String(freshIndex[i][idxColIndex['invoiceKey']]);
        if (key) {
          idxMap[key] = { rowIndex: i + 1, row: freshIndex[i] };
        }
      }

      const updatesMonth = [];
      const appendsMonth = [];
      const updatesIndex = [];
      const appendsIndex = [];

      invoicesToFetch.forEach(item => {
        const detail = detailMap[item.key];
        if (!detail) return;

        const normalized = normalizeInvoiceV4(item.inv, detail);
        normalized.syncBatchId = syncBatchId;
        normalized.syncAt = new Date().toISOString();

        const exist = existingMap[item.key];
        const newRawRow = objectToRow(rawHeaders, normalized);

        if (exist) {
          newRawRow[rawHeaders.indexOf('createdAt')] = exist.row[rawHeaders.indexOf('createdAt')] || normalized.createdAt;
          newRawRow[rawHeaders.indexOf('updatedAt')] = new Date().toISOString();
          updatesMonth.push({
            range: monthSheetName + '!A' + exist.rowIndex + ':' + _colLetter(rawHeaders.length) + exist.rowIndex,
            values: [newRawRow]
          });
          totalUpdated++;
        } else {
          newRawRow[rawHeaders.indexOf('createdAt')] = new Date().toISOString();
          newRawRow[rawHeaders.indexOf('updatedAt')] = new Date().toISOString();
          appendsMonth.push(newRawRow);
          totalInserted++;
        }

        // Map to Index Object
        const idxObj = {
          invoiceKey: normalized.invoiceKey,
          workDate: normalized.workDate,
          workMonth: normalized.workMonth,
          workQuarter: normalized.workQuarter,
          invoiceTime: normalized.invoiceTime,
          cukcukRefNo: normalized.cukcukRefNo,
          finalAmount: normalized.finalAmount,
          cashAmount: normalized.cashAmount,
          transferAmount: normalized.transferAmount,
          cardAmount: normalized.cardAmount,
          paymentMethod: normalized.paymentMethod,
          paymentStatus: normalized.paymentStatus,
          sourceSheet: monthSheetName,
          sourceRow: exist ? exist.rowIndex : (rawInvoices.length + appendsMonth.length),
          manualOverride: normalized.manualOverride,
          updatedAt: new Date().toISOString()
        };

        const idxRow = objectToRow(idxHeaders, idxObj);
        const idxExist = idxMap[item.key];

        if (idxExist) {
          updatesIndex.push({
            range: getRegistrySheetName('invoiceIndex', year) + '!A' + idxExist.rowIndex + ':' + _colLetter(idxHeaders.length) + idxExist.rowIndex,
            values: [idxRow]
          });
        } else {
          appendsIndex.push(idxRow);
        }
      });

      // Write partitioned raw invoice rows
      if (appendsMonth.length > 0) appendRowsV4(monthSheetName, appendsMonth);
      if (updatesMonth.length > 0) batchUpdateValuesV4(updatesMonth);

      // Write yearly index rows
      if (appendsIndex.length > 0) appendRowsV4(getRegistrySheetName('invoiceIndex', year), appendsIndex);
      if (updatesIndex.length > 0) batchUpdateValuesV4(updatesIndex);

      // Rebuild affected aggregates
      rebuildAggregatesForDate(workDateStr);
      // Rebuild month JSON cache
      buildMonthJsonFromRaw(monthKey);

    } finally {
      lock.releaseLock();
    }

  } catch(e) {
    status = 'FAILED';
    errorMessage = e.toString();
  } finally {
    cache.remove(cacheKey);
  }

  // Write sync log
  const finishedAt = new Date();
  const duration = finishedAt.getTime() - startedAt.getTime();
  const logObj = {
    syncBatchId: syncBatchId,
    workDate: workDateStr,
    fromDate: fromTime,
    toDate: toTime,
    triggeredBy: data.triggeredBy || 'SYSTEM',
    triggerSource: data.triggerSource || 'webapp',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: duration,
    totalFetched: totalFetched,
    totalInserted: totalInserted,
    totalUpdated: totalUpdated,
    totalSkippedManualOverride: totalSkippedManualOverride,
    totalDeletedMarked: totalDeletedMarked,
    totalErrors: totalErrors,
    status: status,
    errorMessage: errorMessage,
    apiCallCount: apiCallCount,
    tokenRefreshed: tokenRefreshed
  };
  ensureSheetByRegistryKey('syncLog');
  const logRow = objectsToRows(getHeadersForSheetKey('syncLog'), [logObj])[0];
  appendRowsV4(getRegistrySheetName('syncLog'), [logRow]);

  return {
    ok: status === 'SUCCESS',
    action: 'syncCukcukInvoices',
    message: status === 'SUCCESS' ? 'Đồng bộ hóa hoàn tất' : errorMessage,
    data: {
      totalFetched,
      totalInserted,
      totalUpdated,
      totalSkippedManualOverride,
      totalErrors,
      durationMs: duration
    }
  };
}

// ── MANUAL OVERRIDE & AUDIT LOG ──

function apiManualOverridePayment(data) {
  const key = data.invoiceKey || data.refId;
  let workDate = data.workDate;
  
  if (!key) {
    return { ok: false, message: 'Thiếu invoiceKey hoặc refId' };
  }

  // Lookup workDate from yearly index if missing
  if (!workDate) {
    const activeYear = data.year || '2026';
    const indexName = getRegistrySheetName('invoiceIndex', activeYear);
    ensureSheetByRegistryKey('invoiceIndex', activeYear);
    const indexRows = _getSheetData(indexName);
    const foundIdxRow = indexRows.find(r => String(r.invoiceKey) === String(key));
    if (foundIdxRow) {
      workDate = foundIdxRow.workDate;
    }
  }

  if (!workDate) {
    return { ok: false, message: 'Thiếu workDate và không thể tìm thấy trong index' };
  }

  const monthKey = workDate.substring(0, 7);
  const sheetName = getMonthSheetName(monthKey);
  const year = workDate.substring(0, 4);

  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(20000);
  if (!hasLock) return { ok: false, message: 'Hệ thống đang bận ghi dữ liệu.' };

  try {
    const rawInvoices = _sheetsGet(sheetName);
    const headers = getHeadersForSheetKey(sheetName);
    const keyIdx = headers.indexOf('invoiceKey');
    const overIdx = headers.indexOf('manualOverride');
    const overAtIdx = headers.indexOf('overrideAt');
    const overByIdx = headers.indexOf('overrideBy');
    const overReasonIdx = headers.indexOf('overrideReason');
    const payIdx = headers.indexOf('paymentRawJson');
    const auditIdx = headers.indexOf('auditJson');

    let rowIndex = -1;
    let oldInvoice = null;

    for (let i = 1; i < rawInvoices.length; i++) {
      if (String(rawInvoices[i][keyIdx]) === String(key)) {
        rowIndex = i + 1;
        oldInvoice = rowToObject(headers, rawInvoices[i]);
        break;
      }
    }

    if (rowIndex === -1 || !oldInvoice) {
      return { ok: false, message: 'Không tìm thấy hóa đơn cần cập nhật.' };
    }

    const beforePaymentsJson = oldInvoice.paymentRawJson;
    const afterPayments = data.paymentRawJson || data.newValueJson; // JSON array string
    const reason = data.reason || 'Điều chỉnh thủ công';
    const user = data.user || data.editedBy || 'SYSTEM';

    // Parse values to calculate cash, card, transfer
    let cash = 0, card = 0, transfer = 0, other = 0;
    try {
      const parsed = JSON.parse(afterPayments);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p.method === 'cash') cash += Number(p.amount) || 0;
          else if (p.method === 'card') card += Number(p.amount) || 0;
          else if (p.method === 'transfer') transfer += Number(p.amount) || 0;
          else other += Number(p.amount) || 0;
        });
      }
    } catch(e) {}

    // Update row object
    oldInvoice.manualOverride = true;
    oldInvoice.overrideAt = new Date().toISOString();
    oldInvoice.overrideBy = user;
    oldInvoice.overrideReason = reason;
    oldInvoice.paymentRawJson = afterPayments;
    oldInvoice.cashAmount = cash;
    oldInvoice.cardAmount = card;
    oldInvoice.transferAmount = transfer;
    oldInvoice.otherAmount = other;
    oldInvoice.updatedAt = new Date().toISOString();

    const auditTrail = JSON.parse(oldInvoice.auditJson || '[]');
    auditTrail.push({
      action: 'PAYMENT_OVERRIDE',
      by: user,
      at: new Date().toISOString(),
      reason: reason,
      before: beforePaymentsJson,
      after: afterPayments
    });
    oldInvoice.auditJson = JSON.stringify(auditTrail);

    const row = objectToRow(headers, oldInvoice);
    _sheetsBatchWrite(sheetName, sheetName + '!A' + rowIndex + ':' + _colLetter(headers.length) + rowIndex, [row]);

    // Update index row
    const indexName = getRegistrySheetName('invoiceIndex', year);
    const idxRows = _sheetsGet(indexName);
    const idxHeaders = getHeadersForSheetKey('invoiceIndex');
    const idxKeyIdx = idxHeaders.indexOf('invoiceKey');

    let idxRowIndex = -1;
    for (let i = 1; i < idxRows.length; i++) {
      if (String(idxRows[i][idxKeyIdx]) === String(key)) {
        idxRowIndex = i + 1;
        break;
      }
    }

    if (idxRowIndex !== -1) {
      const idxObj = rowToObject(idxHeaders, idxRows[idxRowIndex - 1]);
      idxObj.cashAmount = cash;
      idxObj.cardAmount = card;
      idxObj.transferAmount = transfer;
      idxObj.manualOverride = true;
      idxObj.updatedAt = new Date().toISOString();
      const idxRow = objectToRow(idxHeaders, idxObj);
      _sheetsBatchWrite(indexName, indexName + '!A' + idxRowIndex + ':' + _colLetter(idxHeaders.length) + idxRowIndex, [idxRow]);
    }

    // Write to audit log sheet
    ensureSheetByRegistryKey('auditLog');
    const auditObj = {
      auditId: 'audit_' + Date.now().toString(36),
      invoiceKey: key,
      action: 'PAYMENT_OVERRIDE',
      beforeJson: beforePaymentsJson,
      afterJson: afterPayments,
      reason: reason,
      user: user,
      createdAt: new Date().toISOString()
    };
    const auditRow = objectsToRows(getHeadersForSheetKey('auditLog'), [auditObj])[0];
    appendRowsV4(getRegistrySheetName('auditLog'), [auditRow]);

    // Rebuild aggregates
    rebuildAggregatesForDate(workDate);
    // Rebuild month JSON chunks
    buildMonthJsonFromRaw(monthKey);

    return { ok: true, message: 'Đã cập nhật hình thức thanh toán và lưu lịch sử biến động.' };

  } finally {
    lock.releaseLock();
  }
}

// ── REVENUE REPORT CONTROLLER ENDPOINTS ──

function apiGetRevenueOverview(data) {
  const fromDate = data.fromDate; // YYYY-MM-DD
  const toDate = data.toDate; // YYYY-MM-DD
  
  if (!fromDate || !toDate) {
    return { ok: false, message: 'Thiếu tham số fromDate hoặc toDate' };
  }

  const dayRows = _getSheetData('KG_CUKCUK_AGG_DAY');
  const filtered = dayRows.filter(r => r.workDate >= fromDate && r.workDate <= toDate)
                          .sort((a, b) => a.workDate.localeCompare(b.workDate));

  let totalRevenue = 0;
  let totalCash = 0;
  let totalCard = 0;
  let totalTransfer = 0;
  let totalBills = 0;

  filtered.forEach(d => {
    totalRevenue += Number(d.finalAmount) || 0;
    totalCash += Number(d.cashAmount) || 0;
    totalCard += Number(d.cardAmount) || 0;
    totalTransfer += Number(d.transferAmount) || 0;
    totalBills += Number(d.invoiceCount) || 0;
  });

  return {
    ok: true,
    data: {
      summary: {
        totalRevenue,
        totalCash,
        totalCard,
        totalTransfer,
        totalBills
      },
      days: filtered.map(r => ({
        date: r.workDate,
        bills: Number(r.invoiceCount) || 0,
        total: Number(r.finalAmount) || 0,
        cash: Number(r.cashAmount) || 0,
        card: Number(r.cardAmount) || 0,
        transfer: Number(r.transferAmount) || 0
      }))
    },
    meta: {
      source: 'AGG_DAY',
      generatedAt: new Date().toISOString()
    }
  };
}

function apiGetRevenueByDay(data) {
  const date = data.date;
  if (!date) return { ok: false, message: 'Thiếu tham số date' };
  const dayRows = _getSheetData('KG_CUKCUK_AGG_DAY');
  const found = dayRows.find(r => r.workDate === date);
  return {
    ok: true,
    data: found || null,
    meta: { source: 'AGG_DAY', generatedAt: new Date().toISOString() }
  };
}

function apiGetRevenueByWeek(data) {
  const weekKey = data.weekKey;
  if (!weekKey) return { ok: false, message: 'Thiếu tham số weekKey' };
  const weekRows = _getSheetData('KG_CUKCUK_AGG_WEEK');
  const found = weekRows.find(r => r.weekKey === weekKey);
  return {
    ok: true,
    data: found || null,
    meta: { source: 'AGG_WEEK', generatedAt: new Date().toISOString() }
  };
}

function apiGetRevenueByMonth(data) {
  const monthKey = data.monthKey;
  if (!monthKey) return { ok: false, message: 'Thiếu tham số monthKey' };
  const monthRows = _getSheetData('KG_CUKCUK_AGG_MONTH');
  const found = monthRows.find(r => r.monthKey === monthKey);
  return {
    ok: true,
    data: found || null,
    meta: { source: 'AGG_MONTH', generatedAt: new Date().toISOString() }
  };
}

function apiGetRevenueByQuarter(data) {
  const quarterKey = data.quarterKey;
  if (!quarterKey) return { ok: false, message: 'Thiếu tham số quarterKey' };
  const quarterRows = _getSheetData('KG_CUKCUK_AGG_QUARTER');
  const found = quarterRows.find(r => r.quarterKey === quarterKey);
  return {
    ok: true,
    data: found || null,
    meta: { source: 'AGG_QUARTER', generatedAt: new Date().toISOString() }
  };
}

function apiGetRevenueByYear(data) {
  const year = String(data.year);
  if (!year) return { ok: false, message: 'Thiếu tham số year' };
  const yearRows = _getSheetData('KG_CUKCUK_AGG_YEAR');
  const found = yearRows.find(r => String(r.year) === year);
  return {
    ok: true,
    data: found || null,
    meta: { source: 'AGG_YEAR', generatedAt: new Date().toISOString() }
  };
}

function apiGetInvoiceSearch(data) {
  const kw = String(data.keyword || '').toLowerCase();
  const fromDate = data.fromDate;
  const toDate = data.toDate;
  const paymentMethod = data.paymentMethod;
  const year = data.year || '2026';

  ensureSheetByRegistryKey('invoiceIndex', year);
  const indexRows = _getSheetData(getRegistrySheetName('invoiceIndex', year));
  
  let filtered = indexRows;

  if (fromDate) filtered = filtered.filter(r => r.workDate >= fromDate);
  if (toDate) filtered = filtered.filter(r => r.workDate <= toDate);
  if (paymentMethod && paymentMethod !== 'all') {
    filtered = filtered.filter(r => String(r.paymentMethod).toLowerCase().includes(paymentMethod.toLowerCase()));
  }

  if (kw) {
    filtered = filtered.filter(r => 
      String(r.cukcukRefNo).toLowerCase().includes(kw) ||
      String(r.invoiceKey).toLowerCase().includes(kw)
    );
  }

  return {
    ok: true,
    data: filtered.sort((a, b) => b.invoiceTime.localeCompare(a.invoiceTime)).slice(0, 100),
    meta: { source: 'INVOICE_INDEX', generatedAt: new Date().toISOString() }
  };
}

function apiGetInvoiceDetail(data) {
  const key = data.invoiceKey;
  const monthKey = data.monthKey || (data.workDate ? data.workDate.substring(0, 7) : '');
  if (!key || !monthKey) return { ok: false, message: 'Thiếu invoiceKey hoặc monthKey' };

  const sheetName = getMonthSheetName(monthKey);
  const rows = _getSheetData(sheetName);
  const headers = getHeadersForSheetKey(sheetName);
  const keyIdx = headers.indexOf('invoiceKey');

  const found = rows.find(r => String(r.invoiceKey) === String(key));
  return {
    ok: true,
    data: found || null,
    meta: { source: 'RAW_MONTH', generatedAt: new Date().toISOString() }
  };
}

function apiRebuildAggregates(data) {
  const date = data.date;
  if (!date) return { ok: false, message: 'Thiếu date' };
  rebuildAggregatesForDate(date);
  return { ok: true, message: 'Đã cấu trúc lại aggregate ngày ' + date };
}

function apiRebuildMonthJson(data) {
  const monthKey = data.monthKey;
  if (!monthKey) return { ok: false, message: 'Thiếu monthKey' };
  buildMonthJsonFromRaw(monthKey);
  return { ok: true, message: 'Đã xây dựng lại cache JSON tháng ' + monthKey };
}

// ── SAFE MIGRATION SERVICE TOOL ──

function migrateLegacyCukcukInvoicesToV4Architecture(data) {
  const dryRun = data.dryRun !== false && String(data.dryRun).toLowerCase() !== 'false';
  
  try {
    const rawLegacyRows = _getSheetData('KG_CUKCUK_INVOICES');
    if (rawLegacyRows.length === 0) {
      return { ok: false, message: 'Bảng tính KG_CUKCUK_INVOICES cũ không có dữ liệu để di chuyển.' };
    }

    const monthBreakdown = {};
    let duplicateCount = 0;
    const invalidRows = [];
    const keysSeen = {};

    // First scan to validate and analyze
    rawLegacyRows.forEach((row, idx) => {
      const key = row.invoiceKey || row.cukcukInvoiceId || row.RefId;
      if (!key) {
        invalidRows.push({ rowIndex: idx + 2, reason: 'Thiếu khóa hóa đơn (invoiceKey/RefId)' });
        return;
      }

      if (keysSeen[key]) {
        duplicateCount++;
        return;
      }
      keysSeen[key] = true;

      const workDate = row.workDate || row.WorkDate || _getWorkingDayGas(row.invoiceTime || row.RefDate || new Date());
      const monthKey = workDate.substring(0, 7);
      
      monthBreakdown[monthKey] = (monthBreakdown[monthKey] || 0) + 1;
    });

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        totalRows: rawLegacyRows.length,
        monthBreakdown: monthBreakdown,
        duplicateCount: duplicateCount,
        invalidRows: invalidRows
      };
    }

    // ACTUAL MIGRATION PHASE
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(60000); // Wait up to 60 seconds
    if (!hasLock) return { ok: false, message: 'Bảng tính bận. Không thể di chuyển lúc này.' };

    try {
      const monthGroups = {};
      const uniqueKeysMigrated = {};

      rawLegacyRows.forEach(row => {
        const key = row.invoiceKey || row.cukcukInvoiceId || row.RefId;
        if (!key || uniqueKeysMigrated[key]) return;
        uniqueKeysMigrated[key] = true;

        const workDate = row.workDate || row.WorkDate || _getWorkingDayGas(row.invoiceTime || row.RefDate || new Date());
        const monthKey = workDate.substring(0, 7);

        // Normalize legacy row structure to new V4 schema
        let payments = [];
        try {
          payments = JSON.parse(row.paymentRawJson || row.PaymentJson || '[]');
        } catch(e) {}

        let cash = 0, card = 0, transfer = 0, other = 0;
        if (Array.isArray(payments)) {
          payments.forEach(p => {
            const m = mapPaymentMethodGas(p.method || p.label || '');
            const amt = Number(p.amount) || 0;
            if (m === 'cash') cash += amt;
            else if (m === 'card') card += amt;
            else if (m === 'transfer') transfer += amt;
            else other += amt;
          });
        }

        let items = [];
        try {
          items = JSON.parse(row.itemsJson || '[]');
        } catch(e) {}

        const mainItems = items.slice(0, 3).map(it => it.name + ' (x' + (it.qty || it.quantity || 1) + ')');
        const itemSummaryText = mainItems.join(', ') + (items.length > 3 ? '...' : '');

        const normalized = {
          invoiceKey: key,
          cukcukInvoiceId: row.cukcukInvoiceId || key,
          cukcukRefNo: row.cukcukRefNo || row.RefNo || '',
          branchId: row.branchId || '',
          branchName: row.branchName || '',
          workDate: workDate,
          workMonth: monthKey,
          workYear: workDate.substring(0, 4),
          workQuarter: workDate.substring(0, 4) + '-Q' + (Math.floor((parseInt(workDate.substring(5, 7)) - 1) / 3) + 1),
          workWeek: getWeekKeyGas(new Date(row.invoiceTime || row.RefDate || new Date())),
          invoiceTime: row.invoiceTime || row.RefDate || new Date().toISOString(),
          invoiceHour: new Date(row.invoiceTime || row.RefDate || new Date()).getHours(),
          customerName: row.customerName || '',
          tableName: row.tableName || '',
          totalAmount: Number(row.totalAmount || row.Amount) || 0,
          discountAmount: Number(row.discountAmount || 0) || 0,
          serviceCharge: Number(row.serviceCharge || 0) || 0,
          vatAmount: Number(row.vatAmount || 0) || 0,
          finalAmount: Number(row.finalAmount || row.Amount || 0) || 0,
          paidAmount: Number(row.paidAmount || row.Amount || 0) || 0,
          cashAmount: cash,
          transferAmount: transfer,
          cardAmount: card,
          otherAmount: other,
          paymentMethod: row.paymentMethod || 'Chưa thanh toán',
          paymentStatus: row.paymentStatus || 'Thanh toán',
          paymentRawJson: JSON.stringify(payments),
          itemsJson: JSON.stringify(items),
          itemSummaryText: itemSummaryText,
          itemCount: items.length,
          drinkItemsJson: '[]',
          drinkQtyJson: '{}',
          sourceRawJson: row.sourceRawJson || '{}',
          calcJson: '{}',
          sourceHash: row.sourceHash || md5HashGas(JSON.stringify(row)),
          syncBatchId: row.syncBatchId || 'migrated',
          syncAt: new Date().toISOString(),
          syncStatus: 'OK',
          manualOverride: row.manualOverride === true || String(row.manualOverride).toLowerCase() === 'true',
          overrideAt: row.overrideAt || '',
          overrideBy: row.overrideBy || '',
          overrideReason: row.overrideReason || '',
          auditJson: row.auditJson || '[]',
          createdAt: row.createdAt || new Date().toISOString(),
          updatedAt: row.updatedAt || new Date().toISOString()
        };

        if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
        monthGroups[monthKey].push(normalized);
      });

      // Write partitioned groups to their monthly sheets
      const indexAppends = {};
      
      for (const mKey in monthGroups) {
        const list = monthGroups[mKey];
        const monthSheetName = ensureMonthSheetV4(mKey);
        const headers = getHeadersForSheetKey(monthSheetName);
        const rows = objectsToRows(headers, list);
        
        clearRangeV4(monthSheetName + '!A2:ZZ');
        if (rows.length > 0) {
          _sheetsBatchWrite(monthSheetName, monthSheetName + '!A2:' + _colLetter(headers.length) + (rows.length + 1), rows);
        }

        // Add index rows
        list.forEach((norm, listIdx) => {
          const year = norm.workYear;
          if (!indexAppends[year]) indexAppends[year] = [];
          
          indexAppends[year].push({
            invoiceKey: norm.invoiceKey,
            workDate: norm.workDate,
            workMonth: norm.workMonth,
            workQuarter: norm.workQuarter,
            invoiceTime: norm.invoiceTime,
            cukcukRefNo: norm.cukcukRefNo,
            finalAmount: norm.finalAmount,
            cashAmount: norm.cashAmount,
            transferAmount: norm.transferAmount,
            cardAmount: norm.cardAmount,
            paymentMethod: norm.paymentMethod,
            paymentStatus: norm.paymentStatus,
            sourceSheet: monthSheetName,
            sourceRow: listIdx + 2,
            manualOverride: norm.manualOverride,
            updatedAt: new Date().toISOString()
          });
        });
      }

      // Write yearly index sheets
      for (const yr in indexAppends) {
        ensureSheetByRegistryKey('invoiceIndex', yr);
        const indexSheetName = getRegistrySheetName('invoiceIndex', yr);
        const idxHeaders = getHeadersForSheetKey('invoiceIndex');
        const idxRows = objectsToRows(idxHeaders, indexAppends[yr]);
        
        clearRangeV4(indexSheetName + '!A2:ZZ');
        if (idxRows.length > 0) {
          _sheetsBatchWrite(indexSheetName, indexSheetName + '!A2:' + _colLetter(idxHeaders.length) + (idxRows.length + 1), idxRows);
        }
      }

      // Rebuild all aggregates and month JSON chunks for every month migrated
      const uniqueDates = {};
      rawLegacyRows.forEach(row => {
        const workDate = row.workDate || row.WorkDate || _getWorkingDayGas(row.invoiceTime || row.RefDate || new Date());
        uniqueDates[workDate] = true;
      });

      for (const dateVal in uniqueDates) {
        rebuildAggregatesForDate(dateVal);
      }

      for (const mKey in monthGroups) {
        buildMonthJsonFromRaw(mKey);
      }

      // Write backup log
      ensureSheetByRegistryKey('backupLog');
      const backupObj = {
        backupId: 'backup_' + Date.now().toString(36),
        sourceSheet: 'KG_CUKCUK_INVOICES',
        backupSheet: 'KG_CUKCUK_INVOICES_LEGACY_BACKUP_' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmm'),
        rowCount: rawLegacyRows.length,
        checksum: md5HashGas(JSON.stringify(rawLegacyRows)),
        backedUpBy: data.cashierName || 'SYSTEM',
        backedUpAt: new Date().toISOString()
      };
      const backupRow = objectsToRows(getHeadersForSheetKey('backupLog'), [backupObj])[0];
      appendRowsV4(getRegistrySheetName('backupLog'), [backupRow]);

      // Rename old sheet
      const ss = SpreadsheetApp.openById(CASHIER_SS_ID);
      const oldSheet = ss.getSheetByName('KG_CUKCUK_INVOICES');
      if (oldSheet) {
        oldSheet.setName(backupObj.backupSheet);
      }

      return {
        ok: true,
        message: 'Di chuyển dữ liệu cũ sang kiến trúc V4 thành công! Đã tạo các sheet tháng, index, JSON chunks và aggregates tương ứng.'
      };

    } finally {
      lock.releaseLock();
    }

  } catch(e) {
    return { ok: false, message: 'Di chuyển dữ liệu thất bại: ' + e.toString() };
  }
}

// ── BACKEND UNIT TEST CASES ──

function testRowsToObjectsAndObjectsToRows() {
  const headers = ['colA', 'colB', 'colC'];
  const testObjs = [
    { colA: 'valA1', colB: 'valB1', colC: 100 },
    { colA: 'valA2', colB: 'valB2', colC: 200 }
  ];
  
  const rows = objectsToRows(headers, testObjs);
  if (rows.length !== 2 || rows[0][0] !== 'valA1' || rows[1][2] !== 200) {
    throw new Error('testRowsToObjectsAndObjectsToRows failed: objectsToRows incorrect.');
  }
  
  const objs = rowsToObjects(headers, rows);
  if (objs.length !== 2 || objs[0].colA !== 'valA1' || Number(objs[1].colC) !== 200) {
    throw new Error('testRowsToObjectsAndObjectsToRows failed: rowsToObjects incorrect.');
  }
  
  Logger.log('[TEST] testRowsToObjectsAndObjectsToRows passed.');
  return { success: true };
}

function testWorkDateCutoffBefore6AM() {
  const dateStr1 = '2026-06-14T01:30:00+07:00';
  const workDate1 = _getWorkingDayGas(dateStr1);
  if (workDate1 !== '2026-06-13') {
    throw new Error('testWorkDateCutoffBefore6AM failed: 1:30 AM should fall in previous working day ' + workDate1);
  }
  
  const dateStr2 = '2026-06-14T08:30:00+07:00';
  const workDate2 = _getWorkingDayGas(dateStr2);
  if (workDate2 !== '2026-06-14') {
    throw new Error('testWorkDateCutoffBefore6AM failed: 8:30 AM should fall in today ' + workDate2);
  }
  
  Logger.log('[TEST] testWorkDateCutoffBefore6AM passed.');
  return { success: true };
}

function testMonthJsonChunkSaveLoadChecksum() {
  const monthKey = '2026-06';
  const testData = {
    schemaVersion: 2,
    monthKey: monthKey,
    generatedAt: new Date().toISOString(),
    invoices: [
      { refNo: '111', amount: 100000, isPaid: true },
      { refNo: '222', amount: 200000, isPaid: true }
    ]
  };
  const jsonStr = JSON.stringify(testData);
  const checksum = md5HashGas(jsonStr);
  
  saveMonthJsonChunks(monthKey, jsonStr, 2, 300000, checksum);
  
  const loaded = loadMonthJsonFast(monthKey);
  if (!loaded || loaded.monthKey !== monthKey || loaded.invoices.length !== 2) {
    throw new Error('testMonthJsonChunkSaveLoadChecksum failed: chunk loaded incorrect.');
  }
  
  Logger.log('[TEST] testMonthJsonChunkSaveLoadChecksum passed.');
  return { success: true };
}

function runAllV4BackendTests() {
  try {
    testRowsToObjectsAndObjectsToRows();
    testWorkDateCutoffBefore6AM();
    testMonthJsonChunkSaveLoadChecksum();
    return { ok: true, message: 'Tất cả các test case backend V4 đã vượt qua thành công!' };
  } catch(e) {
    return { ok: false, message: 'Test thất bại: ' + e.toString() };
  }
}
