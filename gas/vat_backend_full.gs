/**
 * HỆ THỐNG BACKEND QUẢN LÝ HÓA ĐƠN VAT & KHO API KEYS
 * Tính năng: Upload, Search, Delete, Email, Sync, History, Re-Scan Gemini Vision
 */

const CONFIG = {
  SPREADSHEET_ID: "1Q9lkw5LMD1u8QC206sAnPL98TjAHoYCj274ZG6I5qAg",
  FOLDER_ID: "1F37Tr9cKlnVx6CZt3e2qP_7RuEwO1Qgu",
  SHEET_DATA: "Invoices_Data",
  SHEET_KEYS: "API_Keys_Store"
};

// ============ CỘT CỐ ĐỊNH THEO SHEET THỰC TẾ ============
// A=Timestamp, B=Tên File, C=Tên Đơn Vị, D=MST, E=Ngày Ký, F=Tổng Tiền
// G=Link View, H=Link Download, I=ID File, J=Địa chỉ
const COL = {
  timestamp: 0,     // A
  fileName: 1,      // B
  tenDonVi: 2,      // C
  mst: 3,           // D
  ngayKy: 4,        // E
  tongTien: 5,      // F
  linkView: 6,      // G
  linkDownload: 7,  // H
  idFile: 8,        // I
  diaChi: 9         // J
};

// ============ ROUTER ============

function doPost(e) {
  try {
    let data = {};
    if (e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch(ex) {}
    }
    if (!data.action && e.parameter && e.parameter.action) {
      Object.assign(data, e.parameter);
    }
    const action = data.action;

    if (action === 'upload') return handleUpload(data);
    if (action === 'search') return handleSearch(data);
    if (action === 'delete_invoice') return handleDeleteInvoice(data);
    if (action === 'send_email') return handleSendEmail(data);
    if (action === 'get_history') return handleHistory(data);
    if (action === 'get_drive_count') return handleDriveCount();
    if (action === 'sync_db') return handleSyncDB();
    if (action === 'save_system_keys') return handleSaveKeys(data);
    if (action === 'get_system_keys') return handleGetKeys(data);
    if (action === 'rescan_batch') return handleRescanBatch(data);

    return jsonRes({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonRes({ status: 'error', message: err.message });
  }
}

function doGet(e) {
  return jsonRes({ status: 'ok', message: 'VAT Backend is running' });
}

function jsonRes(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============ HELPERS ============

function getSheet_(name) {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name);
}

function getFolder_() {
  return DriveApp.getFolderById(CONFIG.FOLDER_ID);
}

/** Format date → DD/MM/YYYY HH:MM:SS */
function formatTimestamp_(d) {
  if (!d) d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  var hh = String(d.getHours()).padStart(2, '0');
  var mi = String(d.getMinutes()).padStart(2, '0');
  var ss = String(d.getSeconds()).padStart(2, '0');
  return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi + ':' + ss;
}

function logHistory_(message) {
  const sheet = getSheet_('History');
  if (sheet) sheet.appendRow([formatTimestamp_(), message]);
}

/** Đọc 1 row Sheet → object với field names webapp cần */
function rowToObj_(row) {
  return {
    tenDonVi: row[COL.tenDonVi] || '',
    mst: row[COL.mst] || '',
    tongTien: row[COL.tongTien] || '',
    ngayKy: row[COL.ngayKy] || '',
    diaChi: row[COL.diaChi] || '',
    fileName: row[COL.fileName] || '',
    linkView: row[COL.linkView] || '',
    uploadDate: row[COL.timestamp] || ''
  };
}

// ============ UPLOAD ============

function handleUpload(data) {
  const sheet = getSheet_(CONFIG.SHEET_DATA);
  const folder = getFolder_();

  // Chuẩn hóa tên file: DD/MM/YYYY-MST.pdf
  let fileName = data.fileName || 'invoice.pdf';
  if (data.ngayKy && data.mst) {
    fileName = data.ngayKy + '-' + data.mst + '.pdf';
  }

  // Kiểm tra trùng trên Drive
  const existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) {
    return jsonRes({ status: 'success', message: 'File đã tồn tại, bỏ qua.', duplicate: true });
  }

  // Lưu file lên Drive
  const blob = Utilities.newBlob(Utilities.base64Decode(data.fileBase64), data.mimeType || 'application/pdf', fileName);
  const file = folder.createFile(blob);
  const linkView = file.getUrl();
  const linkDownload = 'https://drive.google.com/uc?export=download&id=' + file.getId();

  // Ghi vào Sheet — ĐÚNG THỨ TỰ CỘT: A→J
  const newRow = [];
  newRow[COL.timestamp] = formatTimestamp_();
  newRow[COL.fileName] = fileName;
  newRow[COL.tenDonVi] = data.tenDonVi || '';
  newRow[COL.mst] = data.mst || '';
  newRow[COL.ngayKy] = data.ngayKy || '';
  newRow[COL.tongTien] = data.tongTien || '';
  newRow[COL.linkView] = linkView;
  newRow[COL.linkDownload] = linkDownload;
  newRow[COL.idFile] = file.getId();
  newRow[COL.diaChi] = data.diaChi || '';
  sheet.appendRow(newRow);

  logHistory_('Upload: ' + fileName);
  return jsonRes({ status: 'success', fileName, linkView });
}

// ============ SEARCH ============

function handleSearch(data) {
  const sheet = getSheet_(CONFIG.SHEET_DATA);
  if (!sheet) return jsonRes({ status: 'error', message: 'Sheet not found' });

  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return jsonRes({ status: 'success', data: [] });

  const results = [];
  const query = (data.query || '').toLowerCase().trim();
  const limit = parseInt(data.limit) || 5000;

  for (let i = 1; i < allData.length && results.length < limit; i++) {
    const row = allData[i];
    const obj = rowToObj_(row);

    // Stringify tất cả field để đảm bảo search hoạt động
    Object.keys(obj).forEach(k => obj[k] = String(obj[k] || ''));

    if (!query || Object.values(obj).some(v => v.toLowerCase().includes(query))) {
      results.push(obj);
    }
  }

  return jsonRes({ status: 'success', data: results });
}

// ============ DELETE ============

function handleDeleteInvoice(data) {
  const fileName = data.fileName;
  if (!fileName) return jsonRes({ status: 'error', message: 'Missing fileName' });

  // Xóa file trên Drive
  const folder = getFolder_();
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) files.next().setTrashed(true);

  // Xóa dòng trong Sheet
  const sheet = getSheet_(CONFIG.SHEET_DATA);
  const allData = sheet.getDataRange().getValues();

  for (let i = allData.length - 1; i >= 1; i--) {
    if (String(allData[i][COL.fileName]) === fileName) {
      sheet.deleteRow(i + 1);
    }
  }

  logHistory_('Delete: ' + fileName);
  return jsonRes({ status: 'success', message: 'Đã xóa: ' + fileName });
}

// ============ SEND EMAIL ============

function handleSendEmail(data) {
  if (!data.email) return jsonRes({ status: 'error', message: 'Missing email' });

  const folder = getFolder_();
  const files = folder.getFilesByName(data.fileName);
  if (!files.hasNext()) return jsonRes({ status: 'error', message: 'File not found on Drive' });

  const file = files.next();
  const subject = 'Hóa đơn VAT - ' + (data.tenDonVi || data.fileName);
  const body = 'Kính gửi Quý khách,\n\nĐính kèm hóa đơn VAT:\n- Đơn vị: ' + (data.tenDonVi || 'N/A') + '\n- Tổng tiền: ' + (data.tongTien || 'N/A') + 'đ\n\nTrân trọng,\nKing\'s Grill';

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    body: body,
    attachments: [file.getAs(MimeType.PDF)]
  });

  logHistory_('Email: ' + data.fileName + ' → ' + data.email);
  return jsonRes({ status: 'success', message: 'Đã gửi email đến ' + data.email });
}

// ============ HISTORY ============

function handleHistory(data) {
  const sheet = getSheet_('History');
  if (!sheet) return jsonRes({ status: 'success', data: [] });

  const allData = sheet.getDataRange().getValues();
  const results = [];
  for (let i = Math.max(1, allData.length - 100); i < allData.length; i++) {
    results.push({ time: allData[i][0], action: allData[i][1] });
  }
  return jsonRes({ status: 'success', data: results.reverse() });
}

// ============ DRIVE COUNT ============

function handleDriveCount() {
  const folder = getFolder_();
  const files = folder.getFilesByType('application/pdf');
  let count = 0;
  while (files.hasNext()) { files.next(); count++; }
  return jsonRes({ status: 'success', total: count });
}

// ============ SYNC DB ============

function handleSyncDB() {
  const folder = getFolder_();
  const sheet = getSheet_(CONFIG.SHEET_DATA);
  const allData = sheet.getDataRange().getValues();

  // Lấy danh sách file trên Drive
  const driveFiles = new Set();
  const filesIter = folder.getFilesByType('application/pdf');
  while (filesIter.hasNext()) driveFiles.add(filesIter.next().getName());

  // Xóa dòng Sheet mà file không còn trên Drive
  let deleted = 0;
  for (let i = allData.length - 1; i >= 1; i--) {
    const fn = String(allData[i][COL.fileName] || '');
    if (fn && !driveFiles.has(fn)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  // Xóa dòng trùng lặp
  const refreshed = sheet.getDataRange().getValues();
  const seen = new Set();
  let dupes = 0;
  for (let i = refreshed.length - 1; i >= 1; i--) {
    const fn = String(refreshed[i][COL.fileName] || '');
    if (seen.has(fn)) { sheet.deleteRow(i + 1); dupes++; }
    else seen.add(fn);
  }

  const msg = 'Đồng bộ xong! Xóa ' + deleted + ' bóng ma, ' + dupes + ' trùng lặp. Drive có ' + driveFiles.size + ' file.';
  logHistory_(msg);
  return jsonRes({ status: 'success', message: msg, deleted: deleted, dupes: dupes, driveTotal: driveFiles.size });
}

// ============ API KEYS STORE ============

function handleSaveKeys(data) {
  const sheet = getSheet_(CONFIG.SHEET_KEYS);
  if (!sheet) return jsonRes({ status: 'error', message: 'Sheet API_Keys_Store not found' });

  // Xóa toàn bộ dữ liệu cũ (chỉ chừa lại dòng tiêu đề nếu có)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  }

  const now = formatTimestamp_();
  const newRows = [];
  const types = ['gemini', 'groq', 'hf', 'cerebras', 'sambanova', 'deepseek', 'mistral', 'nvidia'];
  
  // Dữ liệu từ Webapp gửi lên nằm thẳng ở data.gemini, data.groq...
  types.forEach(type => {
    let arr = data[type];
    // Chống lỗi nếu dữ liệu bị ép kiểu thành chuỗi
    if (typeof arr === 'string') {
      try { arr = JSON.parse(arr); } catch(ex) { arr = arr.split(',').map(s => s.trim()); }
    }
    if (Array.isArray(arr)) {
      arr.forEach(key => {
        if (key && key.trim()) {
          let label = type === 'hf' ? 'huggingface' : type;
          newRows.push([label, key.trim(), now]);
        }
      });
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, 3).setValues(newRows);
  }

  return jsonRes({ status: 'success', message: 'Đã cập nhật toàn bộ Keys vào Spreadsheet!' });
}

function handleGetKeys(data) {
  // Kiểm tra password từ UI (Chặn tải lậu key)
  const ADMIN_PASSWORD = '123';
  if (data.password !== ADMIN_PASSWORD) {
    return jsonRes({ status: 'error', message: 'Sai mật khẩu truy cập!' });
  }

  const sheet = getSheet_(CONFIG.SHEET_KEYS);
  if (!sheet) return jsonRes({ status: 'error', message: 'Sheet API_Keys_Store not found' });

  const allData = sheet.getDataRange().getValues();
  const keys = {
    gemini: [], groq: [], hf: [], cerebras: [],
    sambanova: [], deepseek: [], mistral: [], nvidia: []
  };

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    if (!row[0] || !row[1]) continue;
    
    const provider = String(row[0]).toLowerCase().trim();
    const key = String(row[1]).trim();
    
    if (key) {
      if (provider === 'gemini') keys.gemini.push(key);
      else if (provider === 'groq') keys.groq.push(key);
      else if (provider === 'huggingface' || provider === 'hf') keys.hf.push(key);
      else if (provider === 'cerebras') keys.cerebras.push(key);
      else if (provider === 'sambanova') keys.sambanova.push(key);
      else if (provider === 'deepseek') keys.deepseek.push(key);
      else if (provider === 'mistral') keys.mistral.push(key);
      else if (provider === 'nvidia') keys.nvidia.push(key);
    }
  }

  // Webapp VAT chờ đợi nhận thẳng res.gemini, res.groq...
  return jsonRes({
    status: 'success',
    gemini: keys.gemini,
    groq: keys.groq,
    hf: keys.hf,
    cerebras: keys.cerebras,
    sambanova: keys.sambanova,
    deepseek: keys.deepseek,
    mistral: keys.mistral,
    nvidia: keys.nvidia
  });
}

// ============ RE-SCAN GEMINI VISION ============

function handleRescanBatch(data) {
  const startIdx = parseInt(data.startIndex) || 0;
  const batchSize = parseInt(data.batchSize) || 15;

  // 1. Lấy Gemini key
  const keysSheet = getSheet_(CONFIG.SHEET_KEYS);
  const geminiKeys = [];
  if (keysSheet) {
    const kd = keysSheet.getDataRange().getValues();
    for (let i = 1; i < kd.length; i++) {
      if (kd[i][0] === 'gemini' && kd[i][1]) geminiKeys.push(String(kd[i][1]).trim());
    }
  }
  if (!geminiKeys.length) return jsonRes({ status: 'error', message: 'Không có Gemini API Key trong kho.' });

  // 2. Lấy tất cả file PDF
  const folder = getFolder_();
  const filesIter = folder.getFilesByType('application/pdf');
  const allFiles = [];
  while (filesIter.hasNext()) allFiles.push(filesIter.next());

  const total = allFiles.length;
  const batch = allFiles.slice(startIdx, startIdx + batchSize);

  // 3. Đọc Sheet
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_DATA);
  const sheetData = sheet.getDataRange().getValues();

  let updated = 0, unchanged = 0, errors = 0;
  const details = [];
  let keyIdx = 0;

  // 4. Xử lý batch
  for (const file of batch) {
    const fileName = file.getName();
    try {
      if (file.getSize() > 10 * 1024 * 1024) {
        errors++; details.push({ fileName: fileName, status: 'skip', message: 'File >10MB' }); continue;
      }

      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const key = geminiKeys[keyIdx % geminiKeys.length]; keyIdx++;

      const ai = callGeminiVision_(key, base64);
      if (!ai || !ai.tongTien || String(ai.tongTien).replace(/[^0-9]/g, '') === '0') {
        errors++; details.push({ fileName: fileName, status: 'error', message: 'AI trả tổng tiền = 0' }); continue;
      }

      // Chuẩn hóa
      ai.tongTien = String(ai.tongTien).replace(/[^0-9]/g, '');
      if (ai.mst) ai.mst = String(ai.mst).replace(/[^0-9\-]/g, '');

      // Tìm dòng trong Sheet theo fileName (cột B)
      let rowIdx = -1;
      for (let i = 1; i < sheetData.length; i++) {
        if (String(sheetData[i][COL.fileName]) === fileName) { rowIdx = i; break; }
      }

      if (rowIdx < 0) {
        // File trên Drive nhưng không có trong Sheet → thêm mới
        var newRow = [];
        newRow[COL.timestamp] = formatTimestamp_();
        newRow[COL.fileName] = fileName;
        newRow[COL.tenDonVi] = ai.tenDonVi || '';
        newRow[COL.mst] = ai.mst || '';
        newRow[COL.ngayKy] = ai.ngayKy || '';
        newRow[COL.tongTien] = ai.tongTien || '';
        newRow[COL.linkView] = file.getUrl();
        newRow[COL.linkDownload] = 'https://drive.google.com/uc?export=download&id=' + file.getId();
        newRow[COL.idFile] = file.getId();
        newRow[COL.diaChi] = ai.diaChi || '';
        sheet.appendRow(newRow);
        updated++; details.push({ fileName: fileName, status: 'added', newData: ai }); continue;
      }

      // So sánh
      const old = {
        tenDonVi: String(sheetData[rowIdx][COL.tenDonVi] || ''),
        mst: String(sheetData[rowIdx][COL.mst] || ''),
        tongTien: String(sheetData[rowIdx][COL.tongTien] || '').replace(/[^0-9]/g, ''),
        ngayKy: String(sheetData[rowIdx][COL.ngayKy] || ''),
        diaChi: String(sheetData[rowIdx][COL.diaChi] || '')
      };

      const changed = ai.tongTien !== old.tongTien ||
        (ai.tenDonVi && ai.tenDonVi !== old.tenDonVi) ||
        (ai.mst && ai.mst !== old.mst) ||
        (ai.ngayKy && ai.ngayKy !== old.ngayKy);

      if (changed) {
        const r = rowIdx + 1; // Sheet row (1-indexed)
        if (ai.tenDonVi) sheet.getRange(r, COL.tenDonVi + 1).setValue(ai.tenDonVi);
        if (ai.mst) sheet.getRange(r, COL.mst + 1).setValue(ai.mst);
        if (ai.tongTien) sheet.getRange(r, COL.tongTien + 1).setValue(ai.tongTien);
        if (ai.ngayKy) sheet.getRange(r, COL.ngayKy + 1).setValue(ai.ngayKy);
        if (ai.diaChi) sheet.getRange(r, COL.diaChi + 1).setValue(ai.diaChi);
        updated++; details.push({ fileName: fileName, status: 'updated', old: old, 'new': ai });
      } else {
        unchanged++; details.push({ fileName: fileName, status: 'unchanged' });
      }
    } catch (e) {
      errors++; details.push({ fileName: fileName, status: 'error', message: e.message });
    }
  }

  logHistory_('Re-Scan ' + (startIdx + 1) + '-' + (startIdx + batch.length) + '/' + total + ': ' + updated + ' sửa, ' + unchanged + ' giữ, ' + errors + ' lỗi');

  return jsonRes({
    status: 'success', total: total, processed: batch.length, startIndex: startIdx,
    hasMore: (startIdx + batchSize) < total, nextIndex: startIdx + batchSize,
    updated: updated, unchanged: unchanged, errors: errors, details: details
  });
}

function callGeminiVision_(key, pdfBase64) {
  var prompt = 'BẠN LÀ CHUYÊN GIA TRÍCH XUẤT HÓA ĐƠN VAT VIỆT NAM.\n\n'
    + 'NHÌN vào file PDF này và trích xuất thông tin NGƯỜI MUA HÀNG (KHÔNG PHẢI người bán/King\'s Grill).\n\n'
    + 'QUY TẮC:\n'
    + '1. tongTien = "Tổng cộng tiền thanh toán" (tiền hàng + thuế), PHẢI LỚN HƠN "Cộng tiền hàng"\n'
    + '2. Kiểm chứng bằng dòng "Bằng chữ" nếu có\n'
    + '3. tongTien là SỐ NGUYÊN không dấu chấm phẩy (VD: 660000)\n'
    + '4. TUYỆT ĐỐI KHÔNG trả về 0\n'
    + '5. mst chỉ gồm chữ số và dấu gạch ngang\n\n'
    + 'Trả về JSON: {"tenDonVi":"","mst":"","tongTien":"","ngayKy":"DD/MM/YYYY","diaChi":""}';

  var payload = {
    contents: [{ parts: [
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      { text: prompt }
    ]}],
    generationConfig: { responseMimeType: 'application/json' }
  };

  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
  );

  if (res.getResponseCode() !== 200) throw new Error('Gemini ' + res.getResponseCode());

  var json = JSON.parse(res.getContentText());
  var text = json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini empty response');

  var cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  if (cleaned.indexOf('{') >= 0) cleaned = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
  return JSON.parse(cleaned);
}
