import { getPrintForms, updatePrintForms, resetPrintForms, getCurrentShift, getShiftSummary, getSettings } from '../store.js';

let _activeEditor = null;
let _activeTab = 'checklist';

export function render() {
  return `
    <div class="section-header">
      <div>
        <h3>🖨️ Biểu mẫu in</h3>
        <p>In checklist, kiểm kê, phiếu bàn giao, biên lai — khổ A4</p>
      </div>
    </div>

    <div class="settings-tabs" style="margin-bottom:20px;">
      <button class="settings-tab${_activeTab==='checklist'?' active':''}" data-pftab="checklist">
        <span class="material-symbols-rounded" style="font-size:18px;">checklist</span> Phục vụ
      </button>
      <button class="settings-tab${_activeTab==='inventory'?' active':''}" data-pftab="inventory">
        <span class="material-symbols-rounded" style="font-size:18px;">inventory_2</span> Kiểm kê
      </button>
      <button class="settings-tab${_activeTab==='handover'?' active':''}" data-pftab="handover">
        <span class="material-symbols-rounded" style="font-size:18px;">assignment_turned_in</span> Bàn giao
      </button>
      <button class="settings-tab${_activeTab==='receipt'?' active':''}" data-pftab="receipt">
        <span class="material-symbols-rounded" style="font-size:18px;">receipt_long</span> Thu/Chi
      </button>
      <button class="settings-tab${_activeTab==='config'?' active':''}" data-pftab="config">
        <span class="material-symbols-rounded" style="font-size:18px;">tune</span> Cài đặt
      </button>
    </div>

    <div id="pfTabContent"></div>

    <!-- Preview area -->
    <div class="card mt-24" id="printPreviewCard" style="display:none;">
      <div class="card-header flex-between">
        <h3 id="previewTitle">Xem trước</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" id="btnEditPreview" title="Sửa thiết kế">⚒️ Sửa</button>
          <button class="btn btn-primary" id="btnPrint">
            <span class="material-symbols-rounded">print</span> In
          </button>
        </div>
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
      /* Auto-fit container */
      .a4-autofit {
        width: 100%;
        transform-origin: top left;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      @media print {
        body { overflow: hidden; }
        .a4-autofit { page-break-after: avoid; }
      }
    </style>
  </head><body>
    <div class="a4-autofit" id="autoFitContent">${html}</div>
    <script>
      // ═══ Auto-Fit A4: shrink content to fit exactly 1 page ═══
      (function() {
        var content = document.getElementById('autoFitContent');
        if (!content) return;
        
        // A4 dimensions in px (at 96dpi): 210mm x 297mm
        // minus margins
        var mTop = ${m.top}, mBottom = ${m.bottom}, mLeft = ${m.left}, mRight = ${m.right};
        var pageH = (297 - mTop - mBottom) * 3.7795;  // mm to px
        var pageW = (210 - mLeft - mRight) * 3.7795;
        
        // Measure actual content height
        var contentH = content.scrollHeight;
        
        if (contentH > pageH) {
          // Calculate scale factor to fit
          var scale = pageH / contentH;
          // Don't shrink below 60%
          scale = Math.max(scale, 0.60);
          content.style.transform = 'scale(' + scale + ')';
          content.style.transformOrigin = 'top left';
          content.style.width = (100 / scale) + '%';
        }
      })();
    </script>
  </body></html>`);
  win.document.close();
  setTimeout(function() { 
    win.focus();
    win.print(); 
  }, 600);
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
        <div style="background:#f8f9fa;padding:8px 12px;display:flex;gap:8px;border-bottom:1px solid #dee2e6;flex-wrap:wrap;box-shadow:0 2px 4px rgba(0,0,0,0.05);align-items:center;">
          <!-- Text Formatting -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('bold')" title="In đậm"><b>B</b></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('italic')" title="In nghiêng"><i>I</i></button>
            <button class="btn btn-sm btn-ghost" style="padding:4px 8px;" onclick="document.getElementById('editFrame').contentWindow.document.execCommand('underline')" title="Gạch chân"><u>U</u></button>
          </div>

          <!-- Font Size -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;align-items:center;padding:0 4px;">
            <select id="editorFontSize" style="border:none;font-size:11px;padding:2px;cursor:pointer;background:transparent;" title="Cỡ chữ">
              <option value="1">8px</option>
              <option value="2" selected>10px</option>
              <option value="3">12px</option>
              <option value="4">14px</option>
              <option value="5">18px</option>
              <option value="6">24px</option>
            </select>
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

          <!-- Table -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorInsertTable" title="Chèn bảng">➕ Bảng</button>
          </div>

          <!-- Row/Col -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorAddRow" title="Thêm dòng dưới">+ Dòng</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorDelRow" style="color:red;" title="Xóa dòng">- Dòng</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddCol" title="Thêm cột phải">+ Cột</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorDelCol" style="color:red;" title="Xóa cột">- Cột</button>
          </div>

          <!-- Cell Merging -->
          <div class="btn-group" style="display:flex;background:#fff;border-radius:6px;border:1px solid #ddd;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorMergeRight" title="Gộp ngang">🔗 Ngang</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorMergeDown" title="Gộp dọc">🔗 Dọc</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorSplitCell" title="Hủy gộp">✂️</button>
          </div>

          <!-- Quick Insert -->
          <div class="btn-group" style="display:flex;background:#e8f5e9;border-radius:6px;border:1px solid #a5d6a7;overflow:hidden;">
            <button class="btn btn-sm btn-ghost" id="btnEditorAddText" title="Chèn đoạn văn bản" style="color:#2e7d32;">📝 Văn bản</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddHeading" title="Chèn tiêu đề" style="color:#2e7d32;">📌 Tiêu đề</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddCheckbox" title="Chèn checkbox" style="color:#2e7d32;">☑️ Check</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddSignature" title="Chèn khung ký tên" style="color:#2e7d32;">✍️ Ký tên</button>
            <button class="btn btn-sm btn-ghost" id="btnEditorAddDivider" title="Chèn đường kẻ" style="color:#2e7d32;">➖ Kẻ</button>
          </div>

          <div style="flex:1;"></div>
          <span id="editorA4Status" style="font-size:10px;color:#6c757d;align-self:center;white-space:nowrap;">📐 Đang đo...</span>
        </div>

        <div style="flex:1;background:#e9ecef;padding:20px;overflow:auto;display:flex;justify-content:center;">
          <div style="position:relative;">
            <iframe id="editFrame" style="width:210mm;height:297mm;background:#fff;border:none;box-shadow:0 0 20px rgba(0,0,0,0.15);border-radius:2px;"></iframe>
            <!-- A4 page boundary indicator -->
            <div id="a4PageLine" style="position:absolute;left:0;right:0;height:2px;background:repeating-linear-gradient(90deg,#ef4444 0,#ef4444 8px,transparent 8px,transparent 16px);opacity:0.6;pointer-events:none;display:none;" title="Giới hạn trang A4"></div>
          </div>
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
        #ctxMenu { position:fixed;z-index:9999;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:4px 0;min-width:200px;font-family:system-ui,sans-serif;font-size:12px;display:none; }
        #ctxMenu .ctx-item { padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px; }
        #ctxMenu .ctx-item:hover { background:#e3f2fd; }
        #ctxMenu .ctx-sep { height:1px;background:#eee;margin:3px 0; }
        #ctxMenu .ctx-label { font-size:10px;color:#888;padding:4px 14px;font-weight:600;text-transform:uppercase; }
      </style>
    </head><body contenteditable="true">${editableHtml}<div id="ctxMenu"></div></body></html>`);
    doc.close();

    // ── Context Menu ──
    (function() {
      var menu = doc.getElementById('ctxMenu');
      var _ctxCell = null;
      var _ctxRow = null;
      var _ctxTable = null;

      function _findCell(node) {
        while (node && node.nodeName !== 'TD' && node.nodeName !== 'TH' && node.nodeName !== 'BODY') node = node.parentNode;
        return (node && (node.nodeName === 'TD' || node.nodeName === 'TH')) ? node : null;
      }

      doc.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        _ctxCell = _findCell(e.target);
        _ctxRow = _ctxCell ? _ctxCell.parentNode : null;
        _ctxTable = _ctxRow ? _ctxRow.closest('table') : null;

        var items = '';
        items += '<div class="ctx-label">Văn bản</div>';
        items += '<div class="ctx-item" data-cmd="bold">✏️ In đậm</div>';
        items += '<div class="ctx-item" data-cmd="italic">✏️ In nghiêng</div>';
        items += '<div class="ctx-item" data-cmd="checkbox">☑️ Chèn checkbox</div>';
        items += '<div class="ctx-item" data-cmd="heading">📌 Chèn tiêu đề</div>';
        items += '<div class="ctx-item" data-cmd="divider">➖ Chèn đường kẻ</div>';
        items += '<div class="ctx-item" data-cmd="signature">✍️ Chèn khung ký tên</div>';

        if (_ctxCell) {
          items += '<div class="ctx-sep"></div>';
          items += '<div class="ctx-label">Bảng</div>';
          items += '<div class="ctx-item" data-cmd="addRowAbove">⬆️ Thêm dòng phía trên</div>';
          items += '<div class="ctx-item" data-cmd="addRowBelow">⬇️ Thêm dòng phía dưới</div>';
          items += '<div class="ctx-item" data-cmd="addCol">➡️ Thêm cột bên phải</div>';
          items += '<div class="ctx-item" data-cmd="delRow">🗑️ Xóa dòng</div>';
          items += '<div class="ctx-item" data-cmd="delCol">🗑️ Xóa cột</div>';
          items += '<div class="ctx-sep"></div>';
          items += '<div class="ctx-item" data-cmd="mergeRight">🔗 Gộp ngang →</div>';
          items += '<div class="ctx-item" data-cmd="mergeDown">🔗 Gộp dọc ↓</div>';
          items += '<div class="ctx-item" data-cmd="cellBg">🎨 Màu nền ô</div>';
        }

        menu.innerHTML = items;
        menu.style.display = 'block';
        var x = e.clientX, y = e.clientY;
        if (x + 220 > doc.documentElement.clientWidth) x = doc.documentElement.clientWidth - 220;
        if (y + 300 > doc.documentElement.clientHeight) y = Math.max(0, doc.documentElement.clientHeight - 300);
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
      });

      doc.addEventListener('click', function(e) {
        if (!menu.contains(e.target)) { menu.style.display = 'none'; return; }
        var item = e.target.closest('[data-cmd]');
        if (!item) return;
        var cmd = item.dataset.cmd;
        menu.style.display = 'none';

        if (cmd === 'bold') doc.execCommand('bold');
        else if (cmd === 'italic') doc.execCommand('italic');
        else if (cmd === 'checkbox') doc.execCommand('insertHTML', false, '<p style="margin:2px 0;">☐ Hạng mục mới</p>');
        else if (cmd === 'heading') doc.execCommand('insertHTML', false, '<div style="text-align:center;font-weight:bold;font-size:14px;margin:8px 0;text-transform:uppercase;">TIÊU ĐỀ MỚI</div>');
        else if (cmd === 'divider') doc.execCommand('insertHTML', false, '<hr style="border:none;border-top:1.5px solid #000;margin:8px 0;">');
        else if (cmd === 'signature') doc.execCommand('insertHTML', false,
          '<table style="border:none!important;margin-top:12px;"><tr>' +
          '<td style="border:none!important;text-align:center;width:33%;padding:4px;"><b>Người lập</b><br><br><br><br>(Ký tên)</td>' +
          '<td style="border:none!important;text-align:center;width:33%;padding:4px;"><b>Quản lý</b><br><br><br><br>(Ký tên)</td>' +
          '<td style="border:none!important;text-align:center;width:33%;padding:4px;"><b>Phê duyệt</b><br><br><br><br>(Ký tên)</td></tr></table>');
        else if (cmd === 'addRowAbove' && _ctxRow) {
          var nr = _ctxRow.cloneNode(true); nr.querySelectorAll('td,th').forEach(function(c){c.innerHTML='&nbsp;';c.removeAttribute('rowspan');c.removeAttribute('colspan');}); _ctxRow.parentNode.insertBefore(nr, _ctxRow);
        } else if (cmd === 'addRowBelow' && _ctxRow) {
          var nr2 = _ctxRow.cloneNode(true); nr2.querySelectorAll('td,th').forEach(function(c){c.innerHTML='&nbsp;';c.removeAttribute('rowspan');c.removeAttribute('colspan');}); _ctxRow.parentNode.insertBefore(nr2, _ctxRow.nextSibling);
        } else if (cmd === 'addCol' && _ctxCell && _ctxRow) {
          var idx = Array.from(_ctxRow.children).indexOf(_ctxCell);
          _ctxRow.parentNode.querySelectorAll('tr').forEach(function(r){var nc=doc.createElement('td');nc.innerHTML='&nbsp;';var t=r.children[idx];if(t)r.insertBefore(nc,t.nextSibling);else r.appendChild(nc);});
        } else if (cmd === 'delRow' && _ctxRow) { _ctxRow.parentNode.removeChild(_ctxRow); }
        else if (cmd === 'delCol' && _ctxCell && _ctxRow) {
          var ci = Array.from(_ctxRow.children).indexOf(_ctxCell);
          _ctxRow.parentNode.querySelectorAll('tr').forEach(function(r){if(r.children[ci])r.removeChild(r.children[ci]);});
        } else if (cmd === 'mergeRight' && _ctxCell) {
          var nx = _ctxCell.nextElementSibling;
          if(nx){var cs=(parseInt(_ctxCell.getAttribute('colspan'))||1)+(parseInt(nx.getAttribute('colspan'))||1);_ctxCell.setAttribute('colspan',cs);_ctxCell.innerHTML+=' '+nx.innerHTML;_ctxRow.removeChild(nx);}
        } else if (cmd === 'mergeDown' && _ctxCell && _ctxRow) {
          var ri = Array.from(_ctxRow.children).indexOf(_ctxCell);
          var nxr = _ctxRow.nextElementSibling;
          if(nxr&&nxr.children[ri]){var rs=(parseInt(_ctxCell.getAttribute('rowspan'))||1)+(parseInt(nxr.children[ri].getAttribute('rowspan'))||1);_ctxCell.setAttribute('rowspan',rs);_ctxCell.innerHTML+='<br>'+nxr.children[ri].innerHTML;nxr.removeChild(nxr.children[ri]);}
        } else if (cmd === 'cellBg' && _ctxCell) {
          var col = prompt('Mã màu (hex hoặc tên):', _ctxCell.style.backgroundColor || '#fffde7');
          if (col) _ctxCell.style.backgroundColor = col;
        }
      });
    })();

    // ── A4 Height Monitor ──
    var a4MaxH = 277 * 3.7795; // 297mm - 20mm margins ≈ 277mm usable
    function _checkA4Fit() {
      var statusEl = document.getElementById('editorA4Status');
      var lineEl = document.getElementById('a4PageLine');
      if (!statusEl) return;
      try {
        var h = doc.body.scrollHeight;
        var pct = Math.round(h / a4MaxH * 100);
        if (h <= a4MaxH) {
          statusEl.textContent = '✅ Vừa 1 trang A4 (' + pct + '%)';
          statusEl.style.color = '#22c55e';
          if (lineEl) lineEl.style.display = 'none';
        } else {
          statusEl.textContent = '⚠️ Tràn trang (' + pct + '%) — Sẽ tự co khi in';
          statusEl.style.color = '#ef4444';
          if (lineEl) {
            lineEl.style.display = 'block';
            lineEl.style.top = (a4MaxH + 20 * 3.7795) + 'px'; // add top padding offset
          }
        }
      } catch(e) {}
    }
    // Monitor every 500ms
    var _a4Timer = setInterval(_checkA4Fit, 500);
    // Stop when modal closes — observe overlay class change instead of overriding hideModal
    frame.addEventListener('load', function() { setTimeout(_checkA4Fit, 200); });
    var _modalOverlay = document.getElementById('modalOverlay');
    if (_modalOverlay) {
      var _a4Observer = new MutationObserver(function(muts) {
        if (!_modalOverlay.classList.contains('active')) {
          clearInterval(_a4Timer);
          _a4Observer.disconnect();
        }
      });
      _a4Observer.observe(_modalOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    // ── Font Size ──
    document.getElementById('editorFontSize').onchange = (e) => {
      doc.execCommand('fontSize', false, e.target.value);
    };

    // Color Picker logic
    document.getElementById('editorColorPicker').oninput = (e) => {
      doc.execCommand('foreColor', false, e.target.value);
    };

    // ── Quick Insert Buttons ──
    document.getElementById('btnEditorAddText')?.addEventListener('click', () => {
      doc.execCommand('insertHTML', false, '<p style="margin:4px 0;">Nhập nội dung tại đây...</p>');
      _checkA4Fit();
    });
    document.getElementById('btnEditorAddHeading')?.addEventListener('click', () => {
      doc.execCommand('insertHTML', false, '<div style="text-align:center;font-weight:bold;font-size:14px;margin:8px 0;text-transform:uppercase;">TIÊU ĐỀ MỚI</div>');
      _checkA4Fit();
    });
    document.getElementById('btnEditorAddCheckbox')?.addEventListener('click', () => {
      doc.execCommand('insertHTML', false, '<p style="margin:2px 0;">☐ Hạng mục kiểm tra mới</p>');
      _checkA4Fit();
    });
    document.getElementById('btnEditorAddSignature')?.addEventListener('click', () => {
      doc.execCommand('insertHTML', false, 
        '<table style="border:none !important;margin-top:12px;"><tr>' +
        '<td style="border:none !important;text-align:center;width:33%;padding:4px;"><b>Người lập</b><br><br><br><br>(Ký tên & ghi rõ)</td>' +
        '<td style="border:none !important;text-align:center;width:33%;padding:4px;"><b>Quản lý</b><br><br><br><br>(Ký tên & ghi rõ)</td>' +
        '<td style="border:none !important;text-align:center;width:33%;padding:4px;"><b>Phê duyệt</b><br><br><br><br>(Ký tên & ghi rõ)</td>' +
        '</tr></table>'
      );
      _checkA4Fit();
    });
    document.getElementById('btnEditorAddDivider')?.addEventListener('click', () => {
      doc.execCommand('insertHTML', false, '<hr style="border:none;border-top:1.5px solid #000;margin:8px 0;">');
      _checkA4Fit();
    });

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

// ─── Tab Content Builders ────────────────────
var _currentPreviewKey = null;

function _renderTabContent(tab) {
  var c = document.getElementById('pfTabContent');
  if (!c) return;
  // Hide preview when switching tabs
  var pv = document.getElementById('printPreviewCard');
  if (pv) pv.style.display = 'none';

  if (tab === 'checklist') {
    c.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:24px;">' +
      '<span class="material-symbols-rounded" style="font-size:40px;color:var(--primary);">checklist</span>' +
      '<h3 style="margin:12px 0 6px;">📋 Checklist Phục Vụ</h3>' +
      '<p class="text-muted" style="font-size:12px;margin-bottom:12px;">Đầu ca — Cuối ca</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
      '<button class="btn btn-primary btn-sm" id="btnPrintChecklist">🖨️ Xem & In</button>' +
      '<button class="btn btn-outline btn-sm" id="btnEditChecklist">⚒️ Sửa thiết kế</button>' +
      '</div></div></div>';
    document.getElementById('btnPrintChecklist')?.addEventListener('click', function() {
      _showPreview('📋 Checklist Phục Vụ', _buildChecklistHTML(), 'checklist');
    });
    document.getElementById('btnEditChecklist')?.addEventListener('click', function() {
      _openVisualEditor('checklist', _buildChecklistHTML());
    });
  } else if (tab === 'inventory') {
    c.innerHTML = '<div class="card"><div class="card-body" style="padding:16px;">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">' +
      ['ncc|🥩 NCC (Thịt/Hải sản)', 'hangkho|🧂 Hàng Khô/Gia vị', 'hangrau1|🥬 Rau 1', 'hangrau|🌿 Rau 2'].map(function(x) {
        var p = x.split('|');
        return '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<button class="btn btn-success btn-sm" data-inv-tab="' + p[0] + '">' + p[1] + '</button>' +
          '<button class="btn btn-outline btn-sm" data-inv-edit="' + p[0] + '" style="font-size:11px;">⚒️ Sửa mẫu</button>' +
          '</div>';
      }).join('') + '</div></div></div>';
    document.querySelectorAll('[data-inv-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var k = btn.dataset.invTab;
        var allData = getPrintForms().inventory || {};
        _showPreview('📦 ' + (allData[k]?.title || 'Kiểm kê'), _buildInventoryHTML(k), 'inv_' + k);
      });
    });
    document.querySelectorAll('[data-inv-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _openVisualEditor('inv_' + btn.dataset.invEdit, _buildInventoryHTML(btn.dataset.invEdit));
      });
    });
  } else if (tab === 'handover') {
    _renderHandoverTab(c);
  } else if (tab === 'receipt') {
    _renderReceiptTab(c);
  } else if (tab === 'config') {
    _renderConfigTab(c);
  }
}

function _showPreview(title, html, key) {
  _currentPreviewKey = key;
  document.getElementById('printPreviewCard').style.display = 'block';
  document.getElementById('previewTitle').textContent = title;
  document.getElementById('printContent').innerHTML = html;
}

// ─── Handover Tab ────────────────────────────
function _renderHandoverTab(c) {
  var shift = getCurrentShift();
  if (!shift) {
    c.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:var(--text-muted);">block</span>' +
      '<h3 style="margin:12px 0;">Chưa mở ca</h3>' +
      '<p class="text-muted">Mở ca trước để tạo phiếu bàn giao</p></div></div>';
    return;
  }
  c.innerHTML = '<div class="card"><div class="card-body" style="padding:20px;">' +
    '<h4 style="margin-bottom:12px;">📄 Phiếu bàn giao ca</h4>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px;">Tự động điền dữ liệu từ ca đang mở: Ca ' + shift.shiftNumber + ' — ' + shift.cashierName + '</p>' +
    '<div style="display:flex;gap:8px;">' +
    '<button class="btn btn-primary" id="btnGenHandover">📄 Tạo phiếu & In</button>' +
    '<button class="btn btn-outline" id="btnEditHandover">⚒️ Sửa trước khi in</button>' +
    '</div></div></div>';

  document.getElementById('btnGenHandover')?.addEventListener('click', function() {
    var html = _buildHandoverHTML();
    _showPreview('📄 Phiếu bàn giao', html, 'handover');
  });
  document.getElementById('btnEditHandover')?.addEventListener('click', function() {
    _openVisualEditor('handover', _buildHandoverHTML());
  });
}

function _buildHandoverHTML() {
  var shift = getCurrentShift();
  if (!shift) return '<p>Chưa mở ca</p>';
  var sm = getShiftSummary(shift);
  var settings = getSettings();
  var storeName = settings.storeName || "KING's GRILL";
  var fmtC = function(n) { return (n||0).toLocaleString('vi-VN'); };
  var fmtTime = function(iso) { if (!iso) return '...'; var d = new Date(iso); return d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0'); };
  var fmtDate = function(s) { if (!s) return '...'; var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };

  return '<div class="print-page" style="font-family:\'Times New Roman\',serif;color:#000;background:#fff;padding:10mm;font-size:12px;line-height:1.5;">' +
    '<div style="text-align:center;font-size:16px;font-weight:bold;margin-bottom:4px;">' + storeName + '</div>' +
    '<div style="text-align:center;font-size:14px;font-weight:bold;text-transform:uppercase;margin-bottom:2px;">PHIẾU BÀN GIAO CA</div>' +
    '<div style="text-align:center;font-size:11px;margin-bottom:16px;">Ngày ' + fmtDate(shift.date) + ' — Ca ' + shift.shiftNumber + '</div>' +
    '<table style="width:100%;border-collapse:collapse;border:1.5px solid #000;margin-bottom:12px;">' +
    '<tr><td style="border:1px solid #000;padding:4px 8px;width:50%;"><b>Thu ngân:</b> ' + shift.cashierName + '</td>' +
    '<td style="border:1px solid #000;padding:4px 8px;"><b>Bắt đầu:</b> ' + fmtTime(shift.startTime) + '</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:4px 8px;"><b>Tiền đầu ca:</b> ' + fmtC(shift.startingCash) + 'đ</td>' +
    '<td style="border:1px solid #000;padding:4px 8px;"><b>Kết thúc:</b> ' + fmtTime(shift.endTime) + '</td></tr></table>' +
    '<table style="width:100%;border-collapse:collapse;border:1.5px solid #000;margin-bottom:12px;">' +
    '<tr style="background:#e8f5e9;"><td colspan="2" style="border:1px solid #000;padding:4px 8px;font-weight:bold;">DOANH THU</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:3px 8px;">Tiền mặt</td><td style="border:1px solid #000;padding:3px 8px;text-align:right;">' + fmtC(sm.cashIncome) + 'đ</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:3px 8px;">Chuyển khoản</td><td style="border:1px solid #000;padding:3px 8px;text-align:right;">' + fmtC(sm.transferIncome) + 'đ</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:3px 8px;">Thẻ</td><td style="border:1px solid #000;padding:3px 8px;text-align:right;">' + fmtC(sm.cardIncome) + 'đ</td></tr>' +
    '<tr style="background:#f0f0f0;font-weight:bold;"><td style="border:1px solid #000;padding:4px 8px;">TỔNG DOANH THU (' + sm.billCount + ' bills)</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">' + fmtC(sm.totalIncome) + 'đ</td></tr>' +
    '<tr style="background:#fce4ec;"><td colspan="2" style="border:1px solid #000;padding:4px 8px;font-weight:bold;">CHI PHÍ</td></tr>' +
    '<tr style="font-weight:bold;"><td style="border:1px solid #000;padding:4px 8px;">Tổng chi</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;">' + fmtC(sm.totalExpense + sm.otherExpense) + 'đ</td></tr>' +
    '</table>' +
    '<table style="width:100%;border-collapse:collapse;border:1.5px solid #000;margin-bottom:12px;">' +
    '<tr style="background:#e3f2fd;"><td colspan="2" style="border:1px solid #000;padding:4px 8px;font-weight:bold;">KIỂM KÊ TIỀN MẶT</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:3px 8px;">Tiền mặt đếm được</td><td style="border:1px solid #000;padding:3px 8px;text-align:right;">' + fmtC(sm.cashCountTotal) + 'đ</td></tr>' +
    '<tr><td style="border:1px solid #000;padding:3px 8px;">Tiền mặt kỳ vọng</td><td style="border:1px solid #000;padding:3px 8px;text-align:right;">' + fmtC(sm.expectedCash) + 'đ</td></tr>' +
    '<tr style="font-weight:bold;"><td style="border:1px solid #000;padding:4px 8px;">Chênh lệch</td><td style="border:1px solid #000;padding:4px 8px;text-align:right;color:' + (sm.discrepancy >= 0 ? '#2e7d32' : '#c62828') + ';">' + (sm.discrepancy >= 0 ? '+' : '') + fmtC(sm.discrepancy) + 'đ</td></tr>' +
    '</table>' +
    '<table style="width:100%;border:none;margin-top:24px;"><tr>' +
    '<td style="border:none;text-align:center;width:50%;padding:4px;"><b>Người giao</b><br><br><br><br>(Ký tên & ghi rõ)</td>' +
    '<td style="border:none;text-align:center;width:50%;padding:4px;"><b>Người nhận</b><br><br><br><br>(Ký tên & ghi rõ)</td>' +
    '</tr></table></div>';
}

// ─── Receipt Tab ─────────────────────────────
function _renderReceiptTab(c) {
  var shift = getCurrentShift();
  if (!shift) {
    c.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:var(--text-muted);">block</span>' +
      '<h3 style="margin:12px 0;">Chưa mở ca</h3>' +
      '<p class="text-muted">Mở ca để xem danh sách giao dịch</p></div></div>';
    return;
  }
  var txs = (shift.transactions || []).concat(shift.otherTransactions || []);
  if (txs.length === 0) {
    c.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;">' +
      '<span class="material-symbols-rounded" style="font-size:48px;color:var(--text-muted);">receipt_long</span>' +
      '<h3 style="margin:12px 0;">Chưa có giao dịch</h3></div></div>';
    return;
  }
  var rows = txs.map(function(tx) {
    var isIncome = tx.type === 'income';
    return '<tr data-txid="' + tx.id + '" style="cursor:pointer;" class="tx-row-select">' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--border);">' + (isIncome ? '📥' : '📤') + ' ' + (tx.category || tx.note || '—') + '</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:right;color:' + (isIncome ? 'var(--success)' : 'var(--danger)') + ';font-weight:600;">' + (isIncome ? '+' : '-') + (tx.amount||0).toLocaleString('vi-VN') + 'đ</td>' +
      '<td style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:center;"><button class="btn btn-outline btn-sm" data-print-tx="' + tx.id + '">🖨️</button></td></tr>';
  }).join('');
  c.innerHTML = '<div class="card"><div class="card-body" style="padding:0;">' +
    '<table style="width:100%;"><thead><tr><th style="padding:8px 10px;text-align:left;">Giao dịch</th><th style="padding:8px 10px;text-align:right;">Số tiền</th><th style="padding:8px 10px;width:60px;">In</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  document.querySelectorAll('[data-print-tx]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var txId = btn.dataset.printTx;
      var tx = txs.find(function(t) { return t.id === txId; });
      if (tx) { var html = _buildReceiptHTML(tx); _showPreview('🧾 Biên lai', html, 'receipt'); }
    });
  });
}

function _buildReceiptHTML(tx) {
  var shift = getCurrentShift();
  var settings = getSettings();
  var storeName = settings.storeName || "KING's GRILL";
  var addr = settings.storeAddress || '';
  var isIncome = tx.type === 'income';
  var fmtC = function(n) { return (n||0).toLocaleString('vi-VN'); };
  var d = tx.timestamp ? new Date(tx.timestamp) : new Date();
  var dateStr = d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear() + '  ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');

  return '<div style="font-family:\'Times New Roman\',serif;color:#000;background:#fff;padding:10mm;font-size:13px;max-width:400px;margin:0 auto;">' +
    '<div style="text-align:center;font-weight:bold;font-size:16px;">' + storeName + '</div>' +
    (addr ? '<div style="text-align:center;font-size:10px;margin-bottom:8px;">' + addr + '</div>' : '') +
    '<hr style="border:none;border-top:1.5px dashed #000;margin:8px 0;">' +
    '<div style="text-align:center;font-weight:bold;font-size:14px;margin:8px 0;">PHIẾU ' + (isIncome ? 'THU' : 'CHI') + '</div>' +
    '<div style="text-align:center;font-size:11px;margin-bottom:12px;">' + dateStr + '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="padding:4px 0;">Nội dung:</td><td style="padding:4px 0;text-align:right;font-weight:bold;">' + (tx.category || '—') + '</td></tr>' +
    '<tr><td style="padding:4px 0;">Số tiền:</td><td style="padding:4px 0;text-align:right;font-weight:bold;font-size:16px;">' + fmtC(tx.amount) + 'đ</td></tr>' +
    (tx.paymentMethod ? '<tr><td style="padding:4px 0;">Hình thức:</td><td style="padding:4px 0;text-align:right;">' + ({cash:'Tiền mặt',card:'Thẻ',transfer:'Chuyển khoản'}[tx.paymentMethod]||tx.paymentMethod) + '</td></tr>' : '') +
    (tx.note ? '<tr><td style="padding:4px 0;">Ghi chú:</td><td style="padding:4px 0;text-align:right;">' + tx.note + '</td></tr>' : '') +
    '<tr><td style="padding:4px 0;">Thu ngân:</td><td style="padding:4px 0;text-align:right;">' + (shift?.cashierName||'') + '</td></tr>' +
    '</table>' +
    '<hr style="border:none;border-top:1.5px dashed #000;margin:12px 0;">' +
    '<table style="width:100%;border:none;"><tr>' +
    '<td style="border:none;text-align:center;width:50%;font-size:11px;"><b>Người lập</b><br><br><br>(Ký tên)</td>' +
    '<td style="border:none;text-align:center;width:50%;font-size:11px;"><b>Khách hàng</b><br><br><br>(Ký tên)</td>' +
    '</tr></table></div>';
}

// ─── Config Tab ──────────────────────────────
function _renderConfigTab(c) {
  var f = getPrintForms();
  var m = f.margins || {top:8,bottom:8,left:8,right:8};
  c.innerHTML = '<div class="card"><div class="card-body" style="padding:16px;">' +
    '<h4 style="margin-bottom:12px;"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:bottom;">tune</span> Cấu hình in (Khổ A4)</h4>' +
    '<div class="form-row">' +
    '<div class="form-group"><label class="form-label">Lề trên (mm)</label><input type="number" id="mrgTop" class="form-input" min="0" max="30" value="' + m.top + '"></div>' +
    '<div class="form-group"><label class="form-label">Lề dưới (mm)</label><input type="number" id="mrgBottom" class="form-input" min="0" max="30" value="' + m.bottom + '"></div>' +
    '<div class="form-group"><label class="form-label">Lề trái (mm)</label><input type="number" id="mrgLeft" class="form-input" min="0" max="30" value="' + m.left + '"></div>' +
    '<div class="form-group"><label class="form-label">Lề phải (mm)</label><input type="number" id="mrgRight" class="form-input" min="0" max="30" value="' + m.right + '"></div>' +
    '</div></div></div>' +
    '<div class="card" style="margin-top:16px;"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;">' +
    '<span class="text-muted" style="font-size:13px;">Gặp lỗi khi sửa mẫu? Khôi phục lại mặc định.</span>' +
    '<button class="btn btn-danger btn-sm" id="btnResetTemplates">🔄 Khôi phục mặc định</button></div></div>';

  ['mrgTop','mrgBottom','mrgLeft','mrgRight'].forEach(function(id) {
    document.getElementById(id)?.addEventListener('change', function() {
      var ff = getPrintForms();
      if (!ff.margins) ff.margins = {};
      ff.margins[id.substring(3).toLowerCase()] = document.getElementById(id).value;
      updatePrintForms(ff);
    });
  });
  document.getElementById('btnResetTemplates')?.addEventListener('click', async function() {
    var { showConfirm } = await import('../utils.js');
    var ok = await showConfirm('Xóa tất cả tùy chỉnh mẫu in và quay về mặc định?', { title: 'Reset mẫu in', confirmText: 'Reset', type: 'warning' });
    if (ok) { resetPrintForms(); window.refreshView?.(); }
  });
}

export function init() {
  // Tab switching
  document.querySelectorAll('[data-pftab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _activeTab = btn.dataset.pftab;
      document.querySelectorAll('[data-pftab]').forEach(function(b) { b.classList.toggle('active', b.dataset.pftab === _activeTab); });
      _renderTabContent(_activeTab);
    });
  });

  // Render initial tab
  _renderTabContent(_activeTab);

  // Print button
  document.getElementById('btnPrint')?.addEventListener('click', function() {
    var content = document.getElementById('printContent')?.innerHTML;
    if (content) _printHTML(content);
  });

  // Edit preview button
  document.getElementById('btnEditPreview')?.addEventListener('click', function() {
    if (_currentPreviewKey) {
      var content = document.getElementById('printContent')?.innerHTML;
      if (content) _openVisualEditor(_currentPreviewKey, content);
    }
  });
}

