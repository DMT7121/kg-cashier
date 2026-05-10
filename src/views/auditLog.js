/* ── Audit Log View (Feature 10) ────────────── */
import { getAuditLog } from '../store.js';
import { getAuditLogFromCloud } from '../api.js';
import { formatDateTime } from '../utils.js';

let combinedLogs = [];

export function render() {
  return `
    <div class="section-header">
      <div>
        <h3>📝 Nhật ký hoạt động</h3>
        <p>Ghi lại mọi thao tác — không thể chỉnh sửa hoặc xóa</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnRefreshAudit">
          <span class="material-symbols-rounded">refresh</span> Làm mới
        </button>
        <button class="btn btn-outline btn-sm" id="btnExportAudit">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="form-group">
      <input type="text" id="auditSearch" class="form-input" placeholder="🔍 Tìm kiếm theo hành động, người dùng, chi tiết...">
    </div>

    <div class="card">
      <div class="card-header"><h3>📋 Nhật ký</h3><span class="text-muted" id="auditCount"></span></div>
      <div id="auditTableWrap" class="table-wrap">
        <p class="text-muted text-center" style="padding:30px;">Đang tải...</p>
      </div>
    </div>
  `;
}

function renderTable(logs) {
  const wrap = document.getElementById('auditTableWrap');
  if (!wrap) return;
  const count = document.getElementById('auditCount');
  if (count) count.textContent = `${logs.length} mục`;

  if (logs.length === 0) {
    wrap.innerHTML = '<p class="text-muted text-center" style="padding:30px;">Chưa có nhật ký nào</p>';
    return;
  }

  const actionIcons = {
    'OPEN_SHIFT': '🟢', 'CLOSE_SHIFT': '🔴', 'ADD_TX': '💰', 'REMOVE_TX': '🗑️',
    'SYNC_SHIFT': '☁️', 'LOGIN': '🔑', 'LOGOUT': '🚪', 'ADD_INVOICE': '📎',
    'UPDATE_CASH_COUNT': '💵', 'SAVE_STAFF': '👤', 'DELETE_STAFF': '❌',
    'UPDATE_SETTINGS': '⚙️', 'ADD_OTHER_TX': '📋', 'UPLOAD_FILE': '📤',
    'DELETE_SHIFT_HISTORY': '🗑️'
  };

  wrap.innerHTML = `<table>
    <thead><tr><th style="width:150px;">Thời gian</th><th style="width:100px;">Người dùng</th><th style="width:160px;">Hành động</th><th>Chi tiết</th></tr></thead>
    <tbody>
      ${logs.slice(0, 200).map(log => `
        <tr>
          <td style="font-variant-numeric:tabular-nums;">${formatDateTime(log.timestamp)}</td>
          <td><strong>${log.user || '—'}</strong></td>
          <td>${actionIcons[log.action] || '📌'} <span style="font-size:11px;">${log.action || ''}</span></td>
          <td class="text-muted">${log.details || '—'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

async function loadLogs() {
  const localLogs = getAuditLog();
  renderTable(localLogs);

  // Also fetch from cloud
  const cloudResult = await getAuditLogFromCloud(500);
  if (cloudResult.success && cloudResult.logs) {
    // Merge and deduplicate
    const all = [...localLogs, ...cloudResult.logs];
    const seen = new Set();
    combinedLogs = all.filter(log => {
      const key = log.timestamp + log.action + log.user;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderTable(combinedLogs);
  }
}

export function init() {
  loadLogs();

  document.getElementById('btnRefreshAudit')?.addEventListener('click', loadLogs);

  document.getElementById('auditSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = (combinedLogs.length ? combinedLogs : getAuditLog()).filter(log =>
      (log.action || '').toLowerCase().includes(q) ||
      (log.user || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('btnExportAudit')?.addEventListener('click', () => {
    const logs = combinedLogs.length ? combinedLogs : getAuditLog();
    let csv = 'Thời gian,Người dùng,Hành động,Chi tiết\n';
    logs.forEach(l => {
      csv += `"${l.timestamp}","${l.user || ''}","${l.action || ''}","${(l.details || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  });
}
