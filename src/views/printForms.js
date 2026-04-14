import { getPrintForms, updatePrintForms, resetPrintForms } from '../store.js';

let _activeEditor = null;

export function render() {
  return `
    <div class="section-header">
      <div>
        <h3>🖨️ Biểu mẫu in</h3>
        <p>In checklist phục vụ và phiếu kiểm kê hàng hóa — khổ A4 dọc</p>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Checklist Card -->
      <div class="card" id="cardChecklist">
        <div class="card-body" style="text-align:center;padding:24px;">
          <span class="material-symbols-rounded" style="font-size:40px;color:var(--primary);">checklist</span>
          <h3 style="margin:12px 0 6px;">📋 Checklist Phục Vụ</h3>
          <p class="text-muted" style="font-size:12px;margin-bottom:12px;">Đầu ca — Cuối ca</p>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-primary btn-sm" id="btnPrintChecklist">🖨️ In mẫu</button>
            <button class="btn btn-outline btn-sm" id="btnEditChecklist" title="Sửa như Word">⚒️ Sửa thiết kế</button>
          </div>
        </div>
      </div>

      <!-- Inventory Card -->
      <div class="card" id="cardInventory">
        <div class="card-header" style="text-align:center;padding-bottom:0;border:none;">
          <span class="material-symbols-rounded" style="font-size:40px;color:var(--success);">inventory_2</span>
          <h3 style="margin:8px 0;">📦 Kiểm Kê Hàng Hóa</h3>
        </div>
        <div class="card-body" style="padding:16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="display:flex;flex-direction:column;gap:5px;">
              <button class="btn btn-success btn-sm" data-inv-tab="ncc">🥩 In NCC</button>
              <button class="btn btn-outline btn-sm" id="btnEditNCC" style="font-size:11px;">⚒️ Sửa mẫu NCC</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              <button class="btn btn-success btn-sm" data-inv-tab="hangkho">🧂 In Hàng Khô</button>
              <button class="btn btn-outline btn-sm" id="btnEditHangKho" style="font-size:11px;">⚒️ Sửa mẫu Khô</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              <button class="btn btn-success btn-sm" data-inv-tab="hangrau1">🥬 In Rau 1</button>
              <button class="btn btn-outline btn-sm" id="btnEditRau1" style="font-size:11px;">⚒️ Sửa mẫu Rau 1</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              <button class="btn btn-success btn-sm" data-inv-tab="hangrau">🌿 In Rau 2</button>
              <button class="btn btn-outline btn-sm" id="btnEditRau2" style="font-size:11px;">⚒️ Sửa mẫu Rau 2</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter & Options -->
    <div class="card" style="margin-top:20px;">
      <div class="card-body" style="padding:16px;">
        <h4 style="margin-bottom:12px;"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:bottom;">settings</span> Cấu hình in (Khổ A4)</h4>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Lề trên (mm)</label>
            <input type="number" id="mrgTop" class="form-input" min="0" max="30" value="8">
          </div>
          <div class="form-group">
            <label class="form-label">Lề dưới (mm)</label>
            <input type="number" id="mrgBottom" class="form-input" min="0" max="30" value="8">
          </div>
          <div class="form-group">
            <label class="form-label">Lề trái (mm)</label>
            <input type="number" id="mrgLeft" class="form-input" min="0" max="30" value="8">
          </div>
          <div class="form-group">
            <label class="form-label">Lề phải (mm)</label>
            <input type="number" id="mrgRight" class="form-input" min="0" max="30" value="8">
          </div>
        </div>
      </div>
    </div>

    <!-- Management Section -->
    <div class="card mt-24">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;">
        <span class="text-muted" style="font-size:13px;">Gặp lỗi khi sửa mẫu? Hãy khôi phục lại ban đầu.</span>
        <button class="btn btn-danger btn-sm" id="btnResetTemplates">🔄 Khôi phục mặc định</button>
      </div>
    </div>

    <!-- Preview area -->
    <div class="card mt-24" id="printPreviewCard" style="display:none;">
      <div class="card-header flex-between">
        <h3 id="previewTitle">Xem trước</h3>
        <button class="btn btn-primary" id="btnPrint">
          <span class="material-symbols-rounded">print</span> In trang này
        </button>
      </div>
      <div class="card-body" style="padding:0;overflow:auto;max-height:70vh;">
        <div id="printContent"></div>
      </div>
    </div>
  `;
}

function _replacePlaceholders(html) {
  const yyyy = new Date().getFullYear();
  return html.replace(/{{YEAR}}/g, yyyy);
}

// ─── Checklist HTML ──────────────────────────
function _buildChecklistHTML() {
  const store = getPrintForms();
  if (store.customTemplates?.checklist) {
    return _replacePlaceholders(store.customTemplates.checklist);
  }

  const yyyy = new Date().getFullYear();
  const data = store.checklist || [];

  let html = `
<div class="print-page checklist-page">
  <style>
    .print-page { font-family: 'Times New Roman', serif; color: #000; background: #fff; padding: 0mm; font-size: 10px; line-height: 1.25; }
    .print-page table { border-collapse: collapse; width: 100%; border: 1.5px solid #000; }
    .print-page th, .print-page td { border: 1px solid #000; padding: 2px 4px; text-align: left; vertical-align: top; }
    .print-page th { background: #f0f0f0; font-weight: bold; text-align: center; font-size: 10.5px; }
    .print-page .title-main { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 4px; text-transform: uppercase; }
    .print-page .section-head { background: #e8f5e9; font-weight: bold; font-size: 10px; }
    .print-page .sub-section { background: #fffde7; font-weight: bold; font-size: 9.5px; }
    .print-page .cb { width: 12px; height: 12px; border: 1.2px solid #000; display: inline-block; vertical-align: middle; margin-right: 3px; border-radius: 1px; }
    .print-page .info-block { margin-bottom: 6px; font-size: 10px; border: none !important; }
    .print-page .info-block td { border: none !important; padding: 1px 4px; }
    .print-page .sign-block { margin-top: 8px; border: none !important; }
    .print-page .sign-block td { border: none !important; text-align: center; padding: 4px 2px; font-size: 10px; }
    .print-page .note-col { font-size: 9px; color: #444; max-width: 70px; }
    .print-page .supply-box { border: 1.5px solid #000; padding: 6px; margin-top: 6px; font-size: 9px; page-break-inside: avoid; }
    @media print {
      .print-page { padding: 0mm; margin: 0; }
    }
  </style>

  <div class="title-main">BẢNG CHECKLIST CÔNG VIỆC ĐẦU CA — CUỐI CA</div>
  <div style="text-align:center;font-size:12px;margin-bottom:12px;font-style:italic;">Ngày ...... tháng ...... năm ${yyyy}</div>

  <table class="info-block" style="margin-bottom:10px;">
    <tr>
      <td style="width:50%;"><b>NHÓM:</b> _____________ &nbsp;&nbsp; <b>KHU:</b> _____________</td>
      <td style="width:50%;"><b>Tên nhân viên (khu trực - B1,2,3):</b></td>
    </tr>
    <tr>
      <td>(Điền tên nhân viên có ca trong ngày)</td>
      <td>
        __________________________ (_____) &nbsp; __________________________ (_____)<br>
        __________________________ (_____) &nbsp; __________________________ (_____)<br>
        __________________________ (_____) &nbsp; __________________________ (_____)
      </td>
    </tr>
  </table>

  <table>
    <thead>
      <tr>
        <th style="width:13%;">PHẦN</th>
        <th style="width:4%;">STT</th>
        <th style="width:60%;">HẠNG MỤC CÔNG VIỆC</th>
        <th style="width:8%;">✓</th>
        <th style="width:15%;">GHI CHÚ</th>
      </tr>
    </thead>
    <tbody>`;

  let totalStt = 1;
  data.forEach(sec => {
    html += `<tr class="section-head"><td colspan="5">${sec.section}</td></tr>`;
    sec.items.forEach(sub => {
      html += `<tr class="sub-section"><td>${sub.cat}</td><td colspan="4">${sub.title}</td></tr>`;
      sub.list.forEach(item => {
        html += `<tr><td></td><td style="text-align:center;">${totalStt++}</td><td>${item}</td><td style="text-align:center;"><span class="cb"></span></td><td class="note-col"></td></tr>`;
      });
    });
  });

  html += `
    </tbody>
  </table>

  <!-- Supply Request Form -->
  <div class="supply-box">
    <div style="text-align:center;font-weight:bold;font-size:12px;margin-bottom:6px;">CẤP VẬT TƯ CHO KHU ____ &nbsp;&nbsp; (Ngày ..../..../${yyyy})</div>
    <div style="columns:2;column-gap:16px;font-size:10.5px;">
      <p>☐ Đủ dùng (không cấp thêm)</p>
      <p>☐ Khăn giấy &nbsp;&nbsp; ☐ Ống hút &nbsp;&nbsp; ☐ Diêm</p>
      <p>☐ Tăm &nbsp;&nbsp; ☐ Xiên tre &nbsp;&nbsp; ☐ Bao tay</p>
      <p>☐ Bao rác (☐ Đen lớn, ☐ Đại, ☐ Trung, ☐ Tiểu)</p>
      <p>☐ Bọc/bịch mang về (☐ Lẩu, ☐ 3kg, ☐ 5kg)</p>
      <p>☐ Hộp mang về (☐ Xốp, ☐ Nhựa nắp rời)</p>
    </div>
    <p style="font-size:9.5px;margin-top:6px;font-style:italic;">Số lượng cấp vừa phải, đủ dùng trong ca. Nhân viên cần đề xuất cấp mỗi cuối ca. Cắt phiếu gửi cho NV kho trước 22h.</p>
    <p style="text-align:right;margin-top:8px;">Người đề xuất (ghi rõ tên): __________________________</p>
  </div>

  <!-- Signatures -->
  <table class="sign-block" style="margin-top:12px;">
    <tr>
      <td style="width:33%;"><b>Phụ trách nhận ca</b><br><br><br><br>(Ký tên & ghi rõ họ tên)</td>
      <td style="width:33%;"><b>Quản lý xác nhận</b><br><br><br><br>(Ký tên & ghi rõ họ tên)</td>
      <td style="width:33%;"><b>Phụ trách giao ca</b><br><br><br><br>(Ký tên & ghi rõ họ tên)</td>
    </tr>
  </table>
</div>`;
  return html;
}


// ─── Inventory HTML ──────────────────────────
function _buildInventoryHTML(tabKey) {
  const store = getPrintForms();
  if (store.customTemplates && store.customTemplates['inv_' + tabKey]) {
    return _replacePlaceholders(store.customTemplates['inv_' + tabKey]);
  }

  const allData = store.inventory || {};
  const data = allData[tabKey];
  if (!data) return '<p>Không tìm thấy dữ liệu</p>';
  const today = new Date();
  const yyyy = today.getFullYear();

  let html = `
<div class="print-page inv-page">
  <style>
    .inv-page { font-family: 'Times New Roman', serif; color: #000; background: #fff; padding: 0mm; font-size: 10.5px; line-height: 1.25; }
    .inv-page table { border-collapse: collapse; width: 100%; border: 1.5px solid #000; }
    .inv-page th, .inv-page td { border: 1px solid #000; padding: 1.5px 4px; }
    .inv-page th { background: #f0f0f0; font-weight: bold; text-align: center; font-size: 10px; }
    .inv-page .title-main { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 2px; text-transform: uppercase; }
    .inv-page .date-line { text-align: center; font-size: 10.5px; margin-bottom: 4px; }
    .inv-page .supplier-cell { background: #fffde7; font-weight: bold; font-size: 9.5px; white-space: pre-line; }
    .inv-page .item-cell { font-size: 10px; }
    .inv-page .input-cell { min-width: 30px; }
    @media print {
      .inv-page { padding: 0mm; margin: 0; }
    }
  </style>
  <div class="title-main">${data.title}</div>
  ${data.subtitle ? `<div class="date-line" style="margin-top:-2px; font-weight:normal; font-style:italic;">(${data.subtitle})</div>` : ''}
  <div class="date-line" style="margin-bottom:10px;">Ngày ...... tháng ...... năm ${yyyy}</div>`;

  if (tabKey === 'ncc') {
    html += `<table><thead><tr>
      <th style="width:12%;">NHÀ CUNG CẤP</th><th style="width:3%;">STT</th><th>TÊN HÀNG</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
      <th style="width:12%;">NHÀ CUNG CẤP</th><th style="width:3%;">STT</th><th>TÊN HÀNG</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
    </tr></thead><tbody>`;
    let leftFlat = [];
    let sttL = 1;
    for (const group of data.items) {
      for (let i = 0; i < group.items.length; i++) {
        leftFlat.push({supplier: i===0 ? group.supplier : '', stt: sttL++, name: group.items[i]});
      }
    }
    const rightItems = data.rightItems;
    const maxRows = Math.max(leftFlat.length, rightItems.length);
    for (let r = 0; r < maxRows; r++) {
      const left = leftFlat[r] || {supplier:'', stt:'', name:''};
      const right = rightItems[r] || '';
      const rStt = right ? (r + leftFlat.length + 1) : '';
      html += `<tr>
        <td class="supplier-cell">${left.supplier}</td>
        <td style="text-align:center;">${left.stt}</td>
        <td class="item-cell">${left.name}</td>
        <td class="input-cell"></td><td class="input-cell"></td>
        <td class="supplier-cell"></td>
        <td style="text-align:center;">${rStt}</td>
        <td class="item-cell">${right}</td>
        <td class="input-cell"></td><td class="input-cell"></td>
      </tr>`;
    }
    html += '</tbody></table>';
  } else if (tabKey === 'hangkho') {
    html += `<table><thead><tr>
      <th>NGUYÊN LIỆU THƯỜNG DÙNG</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
      <th>NGUYÊN LIỆU THƯỜNG DÙNG</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
    </tr></thead><tbody>`;
    const maxDry = Math.max(data.leftItems.length, data.rightItems.length);
    for (let r = 0; r < maxDry; r++) {
      const left = data.leftItems[r] || '';
      const right = data.rightItems[r] || '';
      html += `<tr><td class="item-cell">${left}</td><td class="input-cell"></td><td class="input-cell"></td><td class="item-cell">${right}</td><td class="input-cell"></td><td class="input-cell"></td></tr>`;
    }
    html += '</tbody></table>';
    if (data.extraLeft) {
      html += `<table style="margin-top:8px;"><thead><tr>
        <th>NGUYÊN LIỆU THƯỜNG DÙNG</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
        <th>${data.extraRightTitle || ''}</th><th class="input-cell">TỒN</th><th class="input-cell">NHẬP</th>
      </tr></thead><tbody>`;
      const maxExtra = Math.max(data.extraLeft.length, data.extraRight.length);
      for (let r = 0; r < maxExtra; r++) {
        const left = data.extraLeft[r] || '';
        const right = data.extraRight[r] || '';
        html += `<tr><td class="item-cell">${left}</td><td class="input-cell"></td><td class="input-cell"></td><td class="item-cell">${right}</td><td class="input-cell"></td><td class="input-cell"></td></tr>`;
      }
      html += '</tbody></table>';
    }
  } else if (tabKey === 'hangrau1') {
    html += `<table><thead><tr><th style="width:3%;">TT</th><th>Tên rau</th><th class="input-cell">Tồn</th><th class="input-cell">Nhập</th><th style="width:5%;">ĐVT</th>
      <th style="width:3%;">TT</th><th>Tên rau</th><th class="input-cell">Tồn</th><th class="input-cell">Nhập</th><th style="width:5%;">ĐVT</th></tr></thead><tbody>`;
    const maxVeg1 = Math.max(data.leftItems.length, data.rightItems.length);
    for (let r = 0; r < maxVeg1; r++) {
      const l = data.leftItems[r] ? data.leftItems[r].split(':') : ['',''];
      const ri = data.rightItems[r] ? data.rightItems[r].split(':') : ['',''];
      html += `<tr>
        <td style="text-align:center;">${data.leftItems[r] ? r+1 : ''}</td><td class="item-cell">${l[0]}</td><td class="input-cell"></td><td class="input-cell"></td><td style="text-align:center;font-size:9px;">${l[1]||''}</td>
        <td style="text-align:center;">${data.rightItems[r] ? r+57 : ''}</td><td class="item-cell">${ri[0]}</td><td class="input-cell"></td><td class="input-cell"></td><td style="text-align:center;font-size:9px;">${ri[1]||''}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  } else if (tabKey === 'hangrau') {
    html += `<table><thead><tr>
      <th style="width:3%;">TT</th><th>Tên rau</th><th class="input-cell">Tồn</th><th class="input-cell">Nhập 1</th><th class="input-cell">Nhập 2</th><th style="width:5%;">ĐVT</th>
      <th style="width:3%;">TT</th><th>Tên rau</th><th class="input-cell">Tồn</th><th class="input-cell">Nhập 1</th><th class="input-cell">Nhập 2</th><th style="width:5%;">ĐVT</th>
    </tr></thead><tbody>`;
    const half = Math.ceil(data.items.length / 2);
    for (let r = 0; r < half; r++) {
      const l = data.items[r] ? data.items[r].split(':') : ['',''];
      const ri = data.items[r+half] ? data.items[r+half].split(':') : ['',''];
      html += `<tr>
        <td style="text-align:center;">${r+1}</td><td class="item-cell">${l[0]}</td><td class="input-cell"></td><td class="input-cell"></td><td class="input-cell"></td><td style="text-align:center;font-size:9px;">${l[1]||''}</td>
        <td style="text-align:center;">${data.items[r+half] ? r+half+1 : ''}</td><td class="item-cell">${ri[0]}</td><td class="input-cell"></td><td class="input-cell"></td><td class="input-cell"></td><td style="text-align:center;font-size:9px;">${ri[1]||''}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  return html;
}

// ─── Print Function ──────────────────────────
function _getPrintMargins() {
  try {
    return {
      top: document.getElementById('mrgTop')?.value || '8',
      bottom: document.getElementById('mrgBottom')?.value || '8',
      left: document.getElementById('mrgLeft')?.value || '8',
      right: document.getElementById('mrgRight')?.value || '8'
    };
  } catch(e) {
    return { top: '8', bottom: '8', left: '8', right: '8' };
  }
}

function _printHTML(html) {
  const m = _getPrintMargins();
  const win = window.open('', 'printWindow', 'width=900,height=1000');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KING's GRILL — In biểu mẫu</title>
    <style>
      @page { size: A4 portrait; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
      body { margin: 0; padding: 0; background: #fff; }
      * { box-sizing: border-box; }
    </style>
  </head><body>${html}</body></html>`);
  win.document.close();
  setTimeout(function() { 
    win.focus();
    win.print(); 
  }, 400);
}

// ─── Visual Editor Logic ──────────────────────────
function _openVisualEditor(templateKey, initialHtml) {
  // Replace year with placeholder for editing
  const yyyy = new Date().getFullYear();
  const editableHtml = initialHtml.replace(new RegExp(yyyy, 'g'), '{{YEAR}}');

  import('../utils.js').then(u => {
    u.showModal(`
      <div style="display:flex;flex-direction:column;height:90vh;width:100%;">
        <div class="modal-title">🛠️ Trình thiết kế mẫu in KING's GRILL Pro</div>
        
        <!-- Toolbar -->
        <div style="background:#f8f9fa;padding:12px;display:flex;gap:12px;border-bottom:1px solid #dee2e6;flex-wrap:wrap;box-shadow:0 2px 4px rgba(0,0,0,0.05);align-items:center;">
          <!-- Text Formatting -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('bold')" title="In đậm"><b>B</b></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('italic')" title="In nghiêng"><i>I</i></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('underline')" title="Gạch chân"><u>U</u></button>
          </div>

          <!-- Color & Alignment -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;align-items:center;padding:0 4px;">
            <input type="color" id="editorColorPicker" style="width:24px;height:24px;border:none;cursor:pointer;padding:0;background:none;" title="Màu chữ">
            <div style="width:1px;height:20px;background:#eee;margin:0 4px;"></div>
            <button class="btn btn-sm btn-ghost" style="padding:4px 6px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('justifyLeft')" title="Căn trái"><span class="material-symbols-rounded" style="font-size:18px;">format_align_left</span></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 6px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('justifyCenter')" title="Căn giữa"><span class="material-symbols-rounded" style="font-size:18px;">format_align_center</span></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 6px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('justifyRight')" title="Căn phải"><span class="material-symbols-rounded" style="font-size:18px;">format_align_right</span></button>
          </div>

          <!-- Rotation -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorRotate" title="Xoay chữ trong ô (90°)">🔄 Xoay</button>
          </div>

          <!-- Table General -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorInsertTable" title="Chèn bảng">➕ Bảng</button>
          </div>

          <!-- Row/Col management -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorAddRow" title="Thêm dòng dưới">➕ Dòng</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorDelRow" style="color:red;" title="Xóa dòng">- Dòng</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddCol" title="Thêm cột phải">➕ Cột</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorDelCol" style="color:red;" title="Xóa cột">- Cột</button>
          </div>

          <!-- Cell Merging -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorMergeRight" title="Gộp ngang">🔗 Gộp Ngang</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorMergeDown" title="Gộp dọc">🔗 Gộp Dọc</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorSplitCell" title="Hủy gộp">✂️ Hủy</button>
          </div>

          <div style="flex:1;"></div>
          <span style="font-size:10px;color:#6c757d;align-self:center;white-space:nowrap;"><b>{{YEAR}}</b> | Tab: Di chuyển</span>
        </div>

        <div style="flex:1;background:#e9ecef;padding:20px;overflow:auto;display:flex;justify-content:center;">
          <iframe id="editFrame" style="width:210mm;height:297mm;background:#fff;border:none;box-shadow:0 0 20px rgba(0,0,0,0.15);border-radius:2px;"></iframe>
        </div>

        <div class="modal-footer" style="background:#fff;border-top:1px solid #eee;padding:12px 24px;">
          <button class="btn btn-outline" onclick="window.hideModal()">Hủy</button>
          <button class="btn btn-primary" id="btnEditorSave" style="padding:8px 20px;">💾 Lưu mẫu in</button>
        </div>
      </div>
    `, 'large');

    const frame = document.getElementById('editFrame');
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 10mm; font-family: 'Times New Roman', serif; color: #000; background: #fff; line-height: 1.3; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
        td, th { border: 1px solid #000; padding: 4px 6px; min-height: 20px; word-break: break-word; vertical-align: middle; }
        [contenteditable]:focus { outline: 2px solid #007bff; background: #f8faff; }
        .rotate-90 { writing-mode: vertical-rl; transform: rotate(180deg); }
        .rotate-180 { transform: rotate(180deg); }
        .rotate-270 { writing-mode: vertical-rl; }
      </style>
    </head><body contenteditable="true">${editableHtml}</body></html>`);
    doc.close();

    // Color Picker logic
    document.getElementById('editorColorPicker').oninput = (e) => {
      doc.execCommand('foreColor', false, e.target.value);
    };

    // Rotation logic
    document.getElementById('btnEditorRotate').onclick = () => {
      const { td } = getSelectionElements();
      if (!td) return;
      if (td.classList.contains('rotate-90')) {
        td.classList.remove('rotate-90');
        td.classList.add('rotate-180');
      } else if (td.classList.contains('rotate-180')) {
        td.classList.remove('rotate-180');
        td.classList.add('rotate-270');
      } else if (td.classList.contains('rotate-270')) {
        td.classList.remove('rotate-270');
      } else {
        td.classList.add('rotate-90');
      }
    };

    // Helper to get current cell/table elements
    const getSelectionElements = () => {
      const sel = frame.contentWindow.getSelection();
      if (!sel.rangeCount) return {};
      let node = sel.anchorNode;
      while (node && node.nodeName !== 'TD' && node.nodeName !== 'TH' && node.nodeName !== 'BODY') node = node.parentNode;
      const td = (node.nodeName === 'TD' || node.nodeName === 'TH') ? node : null;
      const tr = td ? td.parentNode : null;
      const table = tr ? tr.parentNode : null;
      return { td, tr, table, sel };
    };

    // --- BUTTON ACTIONS ---

    // Insert Table
    document.getElementById('btnEditorInsertTable').onclick = () => {
      const rows = prompt('Số hàng:', '3');
      const cols = prompt('Số cột:', '3');
      if (!rows || !cols) return;
      let html = '<table>';
      for(let i=0; i<rows; i++) {
        html += '<tr>';
        for(let j=0; j<cols; j++) html += '<td>&nbsp;</td>';
        html += '</tr>';
      }
      html += '</table>';
      doc.execCommand('insertHTML', false, html);
    };

    // Add Row
    document.getElementById('btnEditorAddRow').onclick = () => {
      const { td, tr } = getSelectionElements();
      if (tr) {
        const newRow = tr.cloneNode(true);
        newRow.querySelectorAll('td, th').forEach(cell => {
          cell.innerHTML = '&nbsp;';
          cell.removeAttribute('rowspan');
          cell.removeAttribute('colspan');
        });
        tr.parentNode.insertBefore(newRow, tr.nextSibling);
      }
    };

    // Delete Row
    document.getElementById('btnEditorDelRow').onclick = () => {
      const { tr } = getSelectionElements();
      if (tr && confirm('Xóa hàng hiện tại?')) tr.parentNode.removeChild(tr);
    };

    // Add Column
    document.getElementById('btnEditorAddCol').onclick = () => {
      const { td, tr, table } = getSelectionElements();
      if (td && tr) {
        const index = Array.from(tr.children).indexOf(td);
        const rows = tr.parentNode.querySelectorAll('tr');
        rows.forEach(row => {
          const newCell = doc.createElement('td');
          newCell.innerHTML = '&nbsp;';
          const target = row.children[index];
          if (target) row.insertBefore(newCell, target.nextSibling);
          else row.appendChild(newCell);
        });
      }
    };

    // Delete Column
    document.getElementById('btnEditorDelCol').onclick = () => {
      const { td, tr } = getSelectionElements();
      if (td && tr && confirm('Xóa cột hiện tại?')) {
        const index = Array.from(tr.children).indexOf(td);
        const rows = tr.parentNode.querySelectorAll('tr');
        rows.forEach(row => {
          if (row.children[index]) row.removeChild(row.children[index]);
        });
      }
    };

    // Merge Right
    document.getElementById('btnEditorMergeRight').onclick = () => {
      const { td, tr } = getSelectionElements();
      if (td && tr) {
        const next = td.nextElementSibling;
        if (next) {
          const colspan = (parseInt(td.getAttribute('colspan')) || 1) + (parseInt(next.getAttribute('colspan')) || 1);
          td.setAttribute('colspan', colspan);
          td.innerHTML += ' ' + next.innerHTML;
          tr.removeChild(next);
        }
      }
    };

    // Merge Down
    document.getElementById('btnEditorMergeDown').onclick = () => {
      const { td, tr, table } = getSelectionElements();
      if (td && tr && table) {
        const index = Array.from(tr.children).indexOf(td);
        const nextRow = tr.nextElementSibling;
        if (nextRow) {
          const targetCell = nextRow.children[index];
          if (targetCell) {
            const rowspan = (parseInt(td.getAttribute('rowspan')) || 1) + (parseInt(targetCell.getAttribute('rowspan')) || 1);
            td.setAttribute('rowspan', rowspan);
            td.innerHTML += '<br>' + targetCell.innerHTML;
            nextRow.removeChild(targetCell);
          }
        }
      }
    };

    // Split Cell
    document.getElementById('btnEditorSplitCell').onclick = () => {
      const { td } = getSelectionElements();
      if (td) {
        td.removeAttribute('colspan');
        td.removeAttribute('rowspan');
        u.showToast('Đã hủy gộp ô (bạn có thể cần thêm lại các ô trống)', 'info');
      }
    };

    document.getElementById('btnEditorSave').onclick = () => {
      const finalHtml = doc.body.innerHTML;
      const f = getPrintForms();
      if (!f.customTemplates) f.customTemplates = {};
      f.customTemplates[templateKey] = finalHtml;
      updatePrintForms(f);
      u.hideModal();
      u.showToast('Thiết kế mẫu in đã được lưu!', 'success');
      window.refreshView?.();
    };
  });
}

export function init() {
  // Load saved margins
  const f = getPrintForms();
  if (f.margins) {
    if (f.margins.top) document.getElementById('mrgTop').value = f.margins.top;
    if (f.margins.bottom) document.getElementById('mrgBottom').value = f.margins.bottom;
    if (f.margins.left) document.getElementById('mrgLeft').value = f.margins.left;
    if (f.margins.right) document.getElementById('mrgRight').value = f.margins.right;
  }

  // Save margins on change
  ['mrgTop', 'mrgBottom', 'mrgLeft', 'mrgRight'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      f.margins[id.substring(3).toLowerCase()] = document.getElementById(id).value;
      updatePrintForms(f);
    });
  });

  // Print buttons
  document.getElementById('btnPrintChecklist')?.addEventListener('click', () => {
    const html = _buildChecklistHTML();
    document.getElementById('printPreviewCard').style.display = 'block';
    document.getElementById('previewTitle').textContent = '📋 Checklist Phục Vụ';
    document.getElementById('printContent').innerHTML = html;
  });

  let currentTab = 'ncc';
  const showInventory = (tab) => {
    currentTab = tab;
    document.querySelectorAll('[data-inv-tab]').forEach(b => {
      b.className = b.dataset.invTab === currentTab ? 'btn btn-success btn-sm' : 'btn btn-outline btn-sm';
    });
    const html = _buildInventoryHTML(currentTab);
    document.getElementById('printPreviewCard').style.display = 'block';
    const allData = getPrintForms().inventory || {};
    document.getElementById('previewTitle').textContent = '📦 ' + (allData[currentTab]?.title || 'Kiểm kê');
    document.getElementById('printContent').innerHTML = html;
  };

  document.querySelectorAll('[data-inv-tab]').forEach(btn => {
    btn.addEventListener('click', () => showInventory(btn.dataset.invTab));
  });

  document.getElementById('btnPrint')?.addEventListener('click', () => {
    const content = document.getElementById('printContent').innerHTML;
    if (content) _printHTML(content);
  });

  // ── Management Buttons ──
  document.getElementById('btnEditChecklist')?.addEventListener('click', () => {
    _openVisualEditor('checklist', _buildChecklistHTML());
  });

  document.getElementById('btnEditNCC')?.addEventListener('click', () => {
    _openVisualEditor('inv_ncc', _buildInventoryHTML('ncc'));
  });

  document.getElementById('btnEditHangKho')?.addEventListener('click', () => {
    _openVisualEditor('inv_hangkho', _buildInventoryHTML('hangkho'));
  });

  document.getElementById('btnEditRau1')?.addEventListener('click', () => {
    _openVisualEditor('inv_hangrau1', _buildInventoryHTML('hangrau1'));
  });

  document.getElementById('btnEditRau2')?.addEventListener('click', () => {
    _openVisualEditor('inv_hangrau', _buildInventoryHTML('hangrau'));
  });

  document.getElementById('btnResetTemplates')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn xóa tất cả tùy chỉnh mẫu in và quay về mặc định?')) {
      resetPrintForms();
      window.refreshView?.();
    }
  });
}
