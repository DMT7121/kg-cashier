import { addTransaction, getCurrentShift, getSettings } from '../store.js';
import { showToast } from '../utils.js';

/**
 * CUKCUK API Helper - Official Integration
 * Documentation: https://graphapi.cukcuk.vn/document/api/index.html
 */

async function _generateSignature(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  // Convert to HEX string (MISA CUKCUK expects lowercase HEX)
  const array = new Uint8Array(signature);
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

export async function testConnection() {
  const { cukcuk } = getSettings();
  if (!cukcuk || !cukcuk.domain || !cukcuk.appId || !cukcuk.key) {
    return { success: false, message: 'Vui lòng nhập đầy đủ Domain (kinggrill.cukcuk.vn), App ID và Secret Key' };
  }

  try {
    const loginTime = new Date().toISOString().split('.')[0] + 'Z'; 
    let cleanDomain = cukcuk.domain.trim().toLowerCase();
    if (cleanDomain.endsWith('.cukcuk.vn')) {
      cleanDomain = cleanDomain.replace('.cukcuk.vn', '');
    }
    
    // MISA requires exact JSON matching the request body (usually alphabetical or exact parameter order)
    const payloadStr = JSON.stringify({
      AppID: cukcuk.appId.trim(),
      Domain: cleanDomain,
      LoginTime: loginTime
    });

    const signature = await _generateSignature(payloadStr, cukcuk.key.trim());
    
    console.log('[CUKCUK] Auth Data:', payloadStr);
    console.log('[CUKCUK] Signature:', signature);

    // To prevent overlapping toasts in UI if triggered by save
    const toastArea = document.getElementById('toastContainer');
    if (toastArea) toastArea.innerHTML = ''; // clear old toasts

    const response = await fetch('https://graphapi.cukcuk.vn/api/Account/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        AppID: cukcuk.appId.trim(),
        Domain: cleanDomain,
        LoginTime: loginTime,
        SignatureInfo: signature
      })
    });

    if (!response.ok) {
        if (response.status === 405) return { success: false, message: 'CORS Error: Trình duyệt đang chặn kết nối trực tiếp tới CUKCUK. Hãy thử tắt chặn Pop-up hoặc liên hệ kỹ thuật.' };
        throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();
    if (data.Success) {
      return { success: true, token: data.Data };
    } else {
      console.warn('[CUKCUK] Login Failed:', data);
      return { success: false, message: data.ErrorMessage || data.Message || 'Lỗi xác thực (Kiểm tra lại Domain/AppID/Key)' };
    }
  } catch (e) {
    console.error('[CUKCUK] Connection error:', e);
    return { success: false, message: 'Lỗi kết nối hoặc CORS: ' + e.message };
  }
}

export async function syncTransactions() {
  const { cukcuk } = getSettings();
  const shift = getCurrentShift();

  if (!shift) return showToast('Bạn cần mở ca trước khi đồng bộ', 'warning');
  if (!cukcuk || !cukcuk.key) return showToast('Vui lòng cấu hình API Key', 'error');

  showToast('🔄 Đang đồng bộ hóa đơn từ CUKCUK...', 'info');

  try {
    // 1. Get Token
    const auth = await testConnection();
    if (!auth.success) throw new Error(auth.message);
    const token = auth.token;

    // 2. Fetch Invoices (Paging)
    // Filter for completed invoices within shift time
    const startTime = new Date(shift.startTime).toISOString();
    const response = await fetch('https://graphapi.cukcuk.vn/api/v1/sainvoices/paging', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'CompanyCode': cukcuk.domain.trim().toLowerCase().replace('.cukcuk.vn', '')
      },
      body: JSON.stringify({
        PageIndex: 1,
        PageSize: 100,
        Filter: `OrderDate >= DateTime("${startTime}") AND IsCompleted == true`
      })
    });

    const data = await response.json();
    if (!data.Success) throw new Error(data.Message || 'Lỗi lấy danh sách hóa đơn');

    const invoices = data.Data.Items || [];
    let count = 0;

    invoices.forEach(inv => {
      const txId = `CUKCUK-${inv.ID}`;
      // Check if already synced
      const exists = shift.transactions.some(t => t.note.includes(txId));
      if (!exists) {
        addTransaction({
          type: 'income',
          category: 'Doanh thu bán hàng',
          amount: inv.TotalAmount,
          note: `[CUKCUK] Bill #${inv.OrderNo} (Ref: ${txId})`,
          paymentMethod: 'cash', // Default to cash for reconciliation
          timestamp: inv.OrderDate || new Date().toISOString()
        });
        count++;
      }
    });

    if (count > 0) {
      showToast(`Đồng bộ thành công ${count} hóa đơn mới!`, 'success');
    } else {
      showToast('Dữ liệu đã được cập nhật bản mới nhất.', 'info');
    }

  } catch (e) {
    console.error('[CUKCUK Sync Error]', e);
    showToast('Lỗi đồng bộ: ' + e.message, 'error');
  }
}
