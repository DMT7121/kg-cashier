/* ── History View — Tabbed shift detail w/ snapshot data ── */
import { getShiftHistory, deleteShiftFromHistory, getShiftSummary, getHistorySummary, saveShiftToHistory } from '../store.js';
import { getShiftsFromCloud } from '../api.js';
import { formatCurrency, formatDate, formatTime, showToast, showModal, hideModal, showConfirm, denominations } from '../utils.js';

let allHistory = [];
let cloudHistory = [];

export function render() {
  const local = getShiftHistory();
  allHistory = local;

  return `
    <div class="section-header">
      <div>
        <h3>📚 Lịch sử ca</h3>
        <p>Xem lại và tìm kiếm ca đã đóng</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnSyncHistory">
          <span class="material-symbols-rounded">cloud_sync</span> Đồng bộ Cloud
        </button>
        <button class="btn btn-outline btn-sm" id="btnExportHistory">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group" style="flex:2;">
        <input type="text" id="historySearch" class="form-input" placeholder="🔍 Tìm theo tên thu ngân, ngày, ghi chú...">
      </div>
      <div class="form-group" style="flex:1;">
        <select id="historyFilter" class="form-input">
          <option value="">Tất cả</option>
          <option value="1">Ca 1</option>
          <option value="2">Ca 2</option>
          <option value="3">Ca 3</option>
        </select>
      </div>
    </div>

    <div id="historyList">
      ${_renderHistoryCards(local)}
    </div>
  `;
}

function _renderHistoryCards(shifts) {
  if (shifts.length === 0) {
    return '<div class="empty-state" style="padding:40px;"><span class="material-symbols-rounded empty-icon">history</span><h3>Chưa có lịch sử</h3><p>Các ca đã đóng sẽ hiện ở đây</p></div>';
  }

  return shifts.map(sh => {
    const sm = getHistorySummary(sh);
    return `
      <div class="history-card" data-shift-id="${sh.id}">
        <div class="history-header">
          <div>
            <h4>Ca ${sh.shiftNumber} — ${sh.cashierName}</h4>
            <span class="text-muted">${formatDate(sh.date)} · ${formatTime(sh.startTime)} → ${formatTime(sh.endTime)}</span>
          </div>
          <div class="history-actions">
            <button class="btn btn-outline btn-sm" data-view-shift="${sh.id}" title="Xem chi tiết">
              <span class="material-symbols-rounded">visibility</span>
            </button>
            <button class="btn-icon" data-delete-shift="${sh.id}" title="Xóa" style="color:var(--danger);">
              <span class="material-symbols-rounded">delete</span>
            </button>
          </div>
        </div>
        <div class="history-stats">
          <div><span class="text-muted">Doanh thu</span><strong class="amount-in">${formatCurrency(sm.totalIncome)}</strong></div>
          <div><span class="text-muted">Chi phí</span><strong class="amount-out">${formatCurrency(sm.totalExpense)}</strong></div>
          <div><span class="text-muted">Bills</span><strong>${sm.billCount}${sm.cukcukBills > 0 ? ' <span style="font-size:10px;color:#10b981;">(' + sm.cukcukBills + ' POS)</span>' : ''}</strong></div>
          <div><span class="text-muted">Chênh lệch</span><strong style="color:${sm.discrepancy === 0 ? 'var(--success)' : 'var(--danger)'};">${sm.discrepancy === 0 ? '✅ 0' : formatCurrency(sm.discrepancy)}</strong></div>
        </div>
        ${sh.notes ? `<p class="text-muted" style="margin-top:8px;font-size:12px;">📝 ${sh.notes}</p>` : ''}
      </div>
    `;
  }).join('');
}

function _showShiftDetail(shiftId) {
  const sh = allHistory.find(s => s.id === shiftId) || cloudHistory.find(s => s.id === shiftId);
  if (!sh) return;
  const sm = getHistorySummary(sh);
  _renderShiftDetailModal(sh, sm);
}

function _renderShiftDetailModal(sh, sm) {
  var fc = formatCurrency;
  var manualTxs = (sh.transactions||[]).filter(function(t){return t.type==='income'&&(!t.note||t.note.indexOf('[CUKCUK]')===-1);});
  var expTxs = (sh.transactions||[]).filter(function(t){return t.type==='expense';});
  var otherTxs = sh.otherTransactions||[];
  var invoices = sh.cukcukInvoicesSnapshot||[];

  function tabSummary() {
    return '<table class="report-table" style="margin-bottom:12px;"><tr><td>Thời gian</td><td>'+formatTime(sh.startTime)+' → '+(sh.endTime?formatTime(sh.endTime):'(đang mở)')+'</td></tr><tr><td>Tiền đầu ca</td><td>'+fc(sh.startingCash)+'</td></tr></table>'+
    (sm.cukcukBills>0?'<h4 style="margin:12px 0 4px;color:#10b981;">🏪 CUKCUK ('+sm.cukcukBills+' bill) — '+fc(sm.cukcukRevenue)+'</h4><table class="report-table"><tr><td>💵 TM</td><td class="text-right">'+fc(sm.cashIncome)+'</td></tr><tr><td>💳 Thẻ</td><td class="text-right">'+fc(sm.cardIncome)+'</td></tr><tr><td>🏦 CK</td><td class="text-right">'+fc(sm.transferIncome)+'</td></tr></table>':'')+
    '<h4 style="margin:16px 0 4px;color:var(--primary);">📊 Tổng kết</h4><table class="report-table" style="background:rgba(99,102,241,.04);border-radius:8px;">'+
    '<tr><td><strong>TỔNG DOANH THU ('+sm.billCount+' bill)</strong></td><td class="text-right"><strong style="color:var(--success);font-size:15px;">'+fc(sm.totalIncome)+'</strong></td></tr>'+
    '<tr><td>Chi phí</td><td class="text-right" style="color:#dc2626;">−'+fc(sm.totalExpense)+'</td></tr>'+
    '<tr style="border-top:2px solid var(--border);"><td><strong>TM kỳ vọng</strong></td><td class="text-right"><strong>'+fc(sm.expectedCash)+'</strong></td></tr>'+
    '<tr><td>TM kiểm kê</td><td class="text-right">'+fc(sm.cashCountTotal)+'</td></tr>'+
    '<tr style="background:'+(Math.abs(sm.discrepancy)>0?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)')+';"><td><strong>CHÊNH LỆCH</strong></td><td class="text-right"><strong style="color:'+(sm.discrepancy===0?'var(--success)':'var(--danger)')+';">'+(sm.discrepancy===0?'✓ 0 đ':fc(sm.discrepancy))+'</strong></td></tr></table>'+
    (sh.notes?'<p style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;"><strong>📝</strong> '+sh.notes+'</p>':'');
  }
  function tabTransactions() {
    var html='';
    if(manualTxs.length>0) html+='<h4 style="color:#16a34a;margin-bottom:6px;">✍️ Thu ('+manualTxs.length+')</h4><table class="report-table">'+manualTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right" style="color:#16a34a;">+'+fc(t.amount)+'</td></tr>';}).join('')+'</table>';
    if(expTxs.length>0) html+='<h4 style="color:#dc2626;margin:12px 0 6px;">💸 Chi ('+expTxs.length+')</h4><table class="report-table">'+expTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right" style="color:#dc2626;">−'+fc(t.amount)+'</td></tr>';}).join('')+'</table>';
    if(otherTxs.length>0) html+='<h4 style="color:var(--warning);margin:12px 0 6px;">📝 Khác ('+otherTxs.length+')</h4><table class="report-table">'+otherTxs.map(function(t){return '<tr><td>'+t.category+'</td><td class="text-right" style="color:'+(t.type==='income'?'#16a34a':'#dc2626')+';">'+(t.type==='income'?'+':'−')+fc(t.amount)+'</td></tr>';}).join('')+'</table>';
    return html||'<div class="empty-state" style="padding:20px;"><p>Không có giao dịch thu/chi</p></div>';
  }
  function tabInvoices() {
    if(invoices.length===0) return '<div class="empty-state" style="padding:20px;"><p>Không có hóa đơn POS</p><small class="text-muted">Dữ liệu POS được snapshot từ các ca đóng sau bản cập nhật này</small></div>';
    var total=0;var rows=invoices.map(function(inv){var amt=0;(inv.payments||[]).forEach(function(p){amt+=p.amount||0;});if(!amt)amt=inv.amount||0;total+=amt;var m=(inv.payments||[]).map(function(p){return p.method==='cash'?'💵':p.method==='card'?'💳':'🏦';}).join('');return '<tr><td>'+(inv.refNo||'—')+'</td><td>'+(inv.tableName||'—')+'</td><td>'+m+'</td><td class="text-right">'+fc(amt)+'</td></tr>';}).join('');
    return '<p style="margin-bottom:8px;"><strong>'+invoices.length+'</strong> hóa đơn — Tổng: <strong style="color:var(--success);">'+fc(total)+'</strong></p><table class="report-table"><tr style="background:var(--bg-secondary);"><th>Bill</th><th>Bàn</th><th>PTTT</th><th class="text-right">Số tiền</th></tr>'+rows+'</table>';
  }
  function tabCashCount() {
    var cc=sh.cashCount||{};var keys=Object.keys(cc).filter(function(k){return cc[k]>0;});
    if(keys.length===0) return '<div class="empty-state" style="padding:20px;"><p>Chưa kiểm kê tiền</p></div>';
    keys.sort(function(a,b){return Number(b)-Number(a);});var total=0;
    var rows=keys.map(function(k){var v=Number(k)*cc[k];total+=v;return '<tr><td>'+cc[k]+' x '+fc(Number(k))+'</td><td class="text-right">'+fc(v)+'</td></tr>';}).join('');
    var bk='';var pc=sh.pinnedCash||{},kc=sh.keepCash||{},hc=sh.handoverCash||{};
    if(Object.keys(pc).length||Object.keys(kc).length||Object.keys(hc).length){var ketT=0,handT=0;denominations.forEach(function(d){ketT+=d.value*((pc[d.value]||0)+(kc[d.value]||0));handT+=d.value*(hc[d.value]||0);});bk='<h4 style="margin:12px 0 4px;color:var(--primary);">📌 Két: '+fc(ketT)+' — 🤝 Giao: '+fc(handT)+'</h4>';}
    return '<table class="report-table"><tr style="background:var(--bg-secondary);"><th>Mệnh giá</th><th class="text-right">Thành tiền</th></tr>'+rows+'<tr style="border-top:2px solid var(--border);"><td><strong>Tổng</strong></td><td class="text-right"><strong>'+fc(total)+'</strong></td></tr></table>'+bk;
  }
  function tabDrinkInv() {
    var snap=sh.drinkInventorySnapshot;
    if(!snap||!snap.items) return '<div class="empty-state" style="padding:20px;"><p>Không có dữ liệu kiểm kho</p><small class="text-muted">Dữ liệu kiểm kho được snapshot từ các ca đóng sau bản cập nhật này</small></div>';
    var rows=Object.keys(snap.items).map(function(id){var it=snap.items[id];if(!it)return '';return '<tr><td>'+(it.name||id)+'</td><td class="text-right">'+(it.start!=null?it.start:'—')+'</td><td class="text-right">'+(it.end!=null?it.end:'—')+'</td><td class="text-right">'+(it.sold!=null?it.sold:'—')+'</td></tr>';}).join('');
    return '<table class="report-table"><tr style="background:var(--bg-secondary);"><th>Sản phẩm</th><th class="text-right">Đầu</th><th class="text-right">Cuối</th><th class="text-right">Bán</th></tr>'+rows+'</table>';
  }

  var tabDefs=[{id:'sum',icon:'summarize',label:'Tổng kết',fn:tabSummary},{id:'tx',icon:'receipt_long',label:'Giao dịch',fn:tabTransactions},{id:'pos',icon:'point_of_sale',label:'Hóa đơn POS',fn:tabInvoices},{id:'cash',icon:'calculate',label:'Kiểm kê tiền',fn:tabCashCount},{id:'drink',icon:'local_bar',label:'Kiểm kho',fn:tabDrinkInv}];
  var tabBar=tabDefs.map(function(t,i){return '<button class="hist-tab'+(i===0?' active':'')+'" data-htab="'+t.id+'" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border:none;background:none;color:'+(i===0?'var(--text)':'var(--text-muted)')+';cursor:pointer;font-size:12px;border-bottom:2px solid '+(i===0?'var(--primary)':'transparent')+';font-family:var(--font);"><span class="material-symbols-rounded" style="font-size:16px;">'+t.icon+'</span>'+t.label+'</button>';}).join('');

  showModal('<div class="modal-title" style="font-size:16px;"><span class="material-symbols-rounded" style="color:var(--primary);">summarize</span> Ca '+sh.shiftNumber+' — '+sh.cashierName+' — '+formatDate(sh.date)+'</div>'+
    '<div style="border-bottom:1px solid var(--border);margin:0 -20px;padding:0 20px;overflow-x:auto;white-space:nowrap;" id="histTabBar">'+tabBar+'</div>'+
    '<div style="max-height:55vh;overflow:auto;padding:8px 0;" id="histTabContent">'+tabSummary()+'</div>'+
    '<div class="modal-footer" style="margin-top:12px;"><button class="btn btn-outline" onclick="window.hideModal()">Đóng</button><button class="btn btn-primary btn-sm" id="btnOpenHandoverReport" data-shift-date="'+sh.date+'"><span class="material-symbols-rounded">print</span> Phiếu bàn giao</button></div>');

  setTimeout(function() {
    var bar=document.getElementById('histTabBar');var content=document.getElementById('histTabContent');
    if(bar) bar.addEventListener('click',function(e){var btn=e.target.closest('[data-htab]');if(!btn)return;bar.querySelectorAll('.hist-tab').forEach(function(b){b.classList.remove('active');b.style.borderBottomColor='transparent';b.style.color='var(--text-muted)';});btn.classList.add('active');btn.style.borderBottomColor='var(--primary)';btn.style.color='var(--text)';var tab=tabDefs.find(function(t){return t.id===btn.dataset.htab;});if(tab&&content)content.innerHTML=tab.fn();});
    var rbtn=document.getElementById('btnOpenHandoverReport');
    if(rbtn) rbtn.addEventListener('click',function(){hideModal();if(window._setReportDate)window._setReportDate(rbtn.dataset.shiftDate);window.navigateTo('report');});
  },100);
}

function _filterHistory() {
  const q = document.getElementById('historySearch')?.value.toLowerCase() || '';
  const shift = document.getElementById('historyFilter')?.value || '';
  let filtered = allHistory;
  if (q) filtered = filtered.filter(sh => (sh.cashierName + sh.date + sh.notes).toLowerCase().includes(q));
  if (shift) filtered = filtered.filter(sh => String(sh.shiftNumber) === shift);
  const el = document.getElementById('historyList');
  if (el) el.innerHTML = _renderHistoryCards(filtered);
  _bindHistoryEvents();
}

function _bindHistoryEvents() {
  document.querySelectorAll('[data-view-shift]').forEach(btn =>
    btn.addEventListener('click', () => _showShiftDetail(btn.dataset.viewShift))
  );
  document.querySelectorAll('[data-delete-shift]').forEach(btn =>
    btn.addEventListener('click', async () => {
      var ok = await showConfirm('Xóa ca này khỏi lịch sử?', { title: 'Xóa ca', confirmText: 'Xóa', type: 'danger' });
      if (ok) {
        deleteShiftFromHistory(btn.dataset.deleteShift);
        showToast('Đã xóa', 'info');
        allHistory = getShiftHistory();
        _filterHistory();
      }
    })
  );
}

export function init() {
  _bindHistoryEvents();
  document.getElementById('historySearch')?.addEventListener('input', _filterHistory);
  document.getElementById('historyFilter')?.addEventListener('change', _filterHistory);

  document.getElementById('btnSyncHistory')?.addEventListener('click', async () => {
    showToast('Đang đồng bộ...', 'info');
    const result = await getShiftsFromCloud();
    if (result.success && result.shifts) {
      cloudHistory = result.shifts;
      const localIds = new Set(allHistory.map(s => s.id));
      const newFromCloud = result.shifts.filter(s => !localIds.has(s.id));
      newFromCloud.forEach(s => {
        try { saveShiftToHistory(s); } catch(e) { /* ignore */ }
      });
      allHistory = [...allHistory, ...newFromCloud];
      _filterHistory();
      showToast(`Đã đồng bộ ${result.shifts.length} ca từ Cloud`, 'success');
    } else {
      showToast('Không thể đồng bộ: ' + (result.message || 'Lỗi'), 'error');
    }
  });

  document.getElementById('btnExportHistory')?.addEventListener('click', () => {
    if (allHistory.length === 0) { showToast('Không có dữ liệu', 'warning'); return; }
    let csv = 'Ngày,Ca,Thu ngân,Doanh thu,Chi phí,Bills,Chênh lệch,Ghi chú\n';
    allHistory.forEach(sh => {
      const sm = getHistorySummary(sh);
      csv += `"${sh.date}","${sh.shiftNumber}","${(sh.cashierName || '').replace(/"/g, '""')}",${sm.totalIncome},${sm.totalExpense},${sm.billCount},${sm.discrepancy},"${(sh.notes || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    a.href = blobUrl;
    a.download = `shift-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  });
}
