/* ── Invoices View (Enhanced w/ Drive Upload) ── */
import { getCurrentShift, addInvoice, removeInvoice } from '../store.js';
import { showToast, showModal, hideModal, formatTime } from '../utils.js';
import { uploadFileToCloud, deleteFileFromCloud } from '../api.js';

export function render() {
  const shift = getCurrentShift();
  if (!shift) return '<div class="empty-state"><span class="material-symbols-rounded empty-icon">description</span><h2>Chưa mở ca</h2><p>Mở ca để quản lý hóa đơn</p><button class="btn btn-primary" onclick="window.navigateTo(\'shift\')">Mở ca</button></div>';

  const invs = shift.invoices || [];

  return `
    <div class="section-header">
      <div>
        <h3>📑 Hóa đơn / Chứng từ</h3>
        <p>Upload ảnh hóa đơn, lưu trữ trên Google Drive</p>
      </div>
    </div>

    <!-- Upload Zone -->
    <div class="upload-zone" id="uploadZone">
      <span class="material-symbols-rounded" style="font-size:48px;color:var(--primary);">cloud_upload</span>
      <h3>Kéo thả file vào đây</h3>
      <p class="text-muted">hoặc click để chọn file (ảnh, PDF — tối đa 5MB)</p>
      <input type="file" id="fileInput" accept="image/*,.pdf" multiple style="display:none;">
    </div>

    <!-- Category selector -->
    <div class="form-row" style="margin:16px 0;">
      <div class="form-group" style="flex:1;">
        <label class="form-label">📂 Thư mục lưu trữ</label>
        <select id="uploadCategory" class="form-input">
          <option value="income">KHOẢN THU</option>
          <option value="expense">KHOẢN CHI</option>
          <option value="debt">BILL NỢ</option>
        </select>
      </div>
    </div>

    <!-- Upload progress -->
    <div id="uploadProgress" style="display:none;margin-bottom:16px;">
      <div class="upload-progress-bar"><div class="upload-progress-fill" id="uploadFill"></div></div>
      <p id="uploadStatus" class="text-muted text-center">Đang upload...</p>
    </div>

    <!-- Invoice list -->
    <div class="card">
      <div class="card-header"><h3>📋 Chứng từ đã lưu (${invs.length})</h3></div>
      ${invs.length === 0 ? '<div class="card-body"><p class="text-muted text-center" style="padding:24px;">Chưa có chứng từ nào</p></div>' : `
        <div class="card-body">
          <div class="invoice-grid">
            ${invs.map(inv => `
              <div class="invoice-card">
                <div class="invoice-preview" data-preview="${inv.id}">
                  ${inv.thumbnailUrl
                    ? `<img src="${inv.thumbnailUrl}" alt="${inv.name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`
                    : inv.data && inv.fileType !== 'pdf'
                      ? `<img src="${inv.data}" alt="${inv.name}" style="width:100%;height:100%;object-fit:cover;">`
                      : `<span class="material-symbols-rounded" style="font-size:36px;color:var(--primary);">${inv.fileType === 'pdf' ? 'picture_as_pdf' : 'image'}</span>`}
                </div>
                <div class="invoice-info">
                  <strong>${inv.name}</strong>
                  <small class="text-muted">${formatTime(inv.timestamp)} ${inv.driveUrl ? '☁️' : '💾'}</small>
                </div>
                <div class="invoice-actions">
                  ${inv.driveUrl ? `<a href="${inv.driveUrl}" target="_blank" class="btn-icon" title="Xem trên Drive"><span class="material-symbols-rounded">open_in_new</span></a>` : ''}
                  <button class="btn-icon" data-delete-inv="${inv.id}" data-drive-id="${inv.driveFileId || ''}" style="color:var(--danger);" title="Xóa"><span class="material-symbols-rounded">delete</span></button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`}
    </div>
  `;
}

async function _handleFiles(files) {
  const category = document.getElementById('uploadCategory')?.value || 'income';
  const shift = getCurrentShift();
  if (!shift) { showToast('Chưa mở ca', 'warning'); return; }

  const progressEl = document.getElementById('uploadProgress');
  const fillEl = document.getElementById('uploadFill');
  const statusEl = document.getElementById('uploadStatus');
  if (progressEl) progressEl.style.display = 'block';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} quá lớn (>5MB)`, 'warning'); continue; }

    const pct = Math.round(((i + 0.5) / files.length) * 100);
    if (fillEl) fillEl.style.width = pct + '%';
    if (statusEl) statusEl.textContent = `Đang upload ${file.name}... (${i + 1}/${files.length})`;

    // Read file as base64
    const fileData = await _readFileAsBase64(file);
    const isImage = file.type.startsWith('image/');

    // Upload to Drive
    const result = await uploadFileToCloud({
      fileName: file.name,
      fileData: fileData,
      mimeType: file.type,
      category: category,
      user: shift.cashierName
    });

    // Save to local store
    addInvoice({
      name: file.name,
      fileType: isImage ? 'image' : 'pdf',
      data: isImage ? fileData : null,
      driveFileId: result.success ? result.fileId : null,
      driveUrl: result.success ? result.fileUrl : null,
      thumbnailUrl: result.success ? result.thumbnailUrl : null,
      note: category
    });

    if (result.success) {
      showToast(`☁️ ${file.name} → ${result.folder}`, 'success');
    } else {
      showToast(`💾 ${file.name} lưu cục bộ (Cloud lỗi)`, 'warning');
    }
  }

  if (fillEl) fillEl.style.width = '100%';
  if (statusEl) statusEl.textContent = 'Hoàn tất!';
  setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 1500);
  window.refreshView?.();
}

function _readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function init() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  zone?.addEventListener('click', () => fileInput?.click());
  zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) _handleFiles(e.dataTransfer.files);
  });
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) _handleFiles(e.target.files);
  });

  // Delete
  document.querySelectorAll('[data-delete-inv]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xóa chứng từ này?')) return;
      const driveId = btn.dataset.driveId;
      if (driveId) await deleteFileFromCloud(driveId).catch(() => {});
      removeInvoice(btn.dataset.deleteInv);
      showToast('Đã xóa', 'info');
      window.refreshView?.();
    });
  });

  // Preview
  document.querySelectorAll('[data-preview]').forEach(el => {
    el.addEventListener('click', () => {
      const shift = getCurrentShift();
      const inv = shift?.invoices?.find(i => i.id === el.dataset.preview);
      if (!inv) return;
      const src = inv.driveUrl || inv.data;
      if (src) {
        showModal(`
          <div class="modal-title">${inv.name}</div>
          ${inv.fileType === 'pdf' ? `<iframe src="${src}" style="width:100%;height:60vh;border:none;border-radius:8px;"></iframe>` : `<img src="${inv.thumbnailUrl || inv.data}" style="width:100%;max-height:60vh;object-fit:contain;border-radius:8px;">`}
          <div class="modal-footer" style="margin-top:12px;">
            ${inv.driveUrl ? `<a href="${inv.driveUrl}" target="_blank" class="btn btn-primary btn-sm">Mở trên Drive</a>` : ''}
            <button class="btn btn-outline" onclick="window.hideModal()">Đóng</button>
          </div>
        `);
      }
    });
  });
}
