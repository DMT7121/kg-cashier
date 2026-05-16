// ══════════════════════════════════════════════
// THÊM ĐOẠN CODE NÀY VÀO GOOGLE APPS SCRIPT CỦA VAT MASTER
// VÀ GỌI NÓ TRONG HÀM doPost(e) KHI action === 'get_system_keys'
// ══════════════════════════════════════════════

const VAT_KEYS_SPREADSHEET_ID = '1Q9lkw5LMD1u8QC206sAnPL98TjAHoYCj274ZG6I5qAg';

/**
 * Lấy danh sách API Keys từ Spreadsheet
 */
function handleGetSystemKeys(password) {
  // Thay thế mật khẩu này bằng mật khẩu Admin thực tế của bạn
  const ADMIN_PASSWORD = '123'; 
  
  if (password !== ADMIN_PASSWORD) {
    return { status: 'error', message: 'Sai mật khẩu truy cập!' };
  }
  
  try {
    const ss = SpreadsheetApp.openById(VAT_KEYS_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0]; // Đọc sheet đầu tiên
    const data = sheet.getDataRange().getValues();
    
    const keys = {
      gemini: [], groq: [], hf: [], cerebras: [],
      sambanova: [], deepseek: [], mistral: [], nvidia: []
    };
    
    // Bỏ qua dòng 1 (tiêu đề Type | Key | Updated At)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || !row[1]) continue; // Bỏ qua dòng trống
      
      const type = String(row[0]).toLowerCase().trim();
      const key = String(row[1]).trim();
      
      if (key) {
        if (type === 'gemini') keys.gemini.push(key);
        else if (type === 'groq') keys.groq.push(key);
        else if (type === 'huggingface' || type === 'hf') keys.hf.push(key);
        else if (type === 'cerebras') keys.cerebras.push(key);
        else if (type === 'sambanova') keys.sambanova.push(key);
        else if (type === 'deepseek') keys.deepseek.push(key);
        else if (type === 'mistral') keys.mistral.push(key);
        else if (type === 'nvidia') keys.nvidia.push(key);
      }
    }
    
    return {
      status: 'success',
      gemini: keys.gemini,
      groq: keys.groq,
      hf: keys.hf,
      cerebras: keys.cerebras,
      sambanova: keys.sambanova,
      deepseek: keys.deepseek,
      mistral: keys.mistral,
      nvidia: keys.nvidia
    };
  } catch (e) {
    return { status: 'error', message: 'Lỗi đọc Google Sheet: ' + e.toString() };
  }
}

/**
 * (Tùy chọn) Lưu API Key mới vào Spreadsheet
 */
function handleSaveSystemKeys(data) {
  try {
    const ss = SpreadsheetApp.openById(VAT_KEYS_SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    
    // Xóa toàn bộ dữ liệu cũ (trừ dòng tiêu đề)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
    }
    
    const now = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
    const newRows = [];
    
    const types = ['gemini', 'groq', 'hf', 'cerebras', 'sambanova', 'deepseek', 'mistral', 'nvidia'];
    
    types.forEach(type => {
      if (data[type] && Array.isArray(data[type])) {
        data[type].forEach(key => {
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
    
    return { status: 'success', message: 'Đã cập nhật Keys vào Spreadsheet!' };
  } catch (e) {
    return { status: 'error', message: 'Lỗi lưu Google Sheet: ' + e.toString() };
  }
}
