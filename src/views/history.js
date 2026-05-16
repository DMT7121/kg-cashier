/* ── History View — Tabbed shift detail w/ snapshot data ── */
import { getShiftHistory, deleteShiftFromHistory, getShiftSummary, getHistorySummary, saveShiftToHistory, rebuildHistorySnapshots, removeHistoryTransaction, removeHistoryOtherTransaction, backfillHistoryInvoiceSnapshot } from '../store.js';
import { getShiftsFromCloud } from '../api.js';
import { formatCurrency, formatDate, formatTime, showToast, showModal, hideModal, showConfirm, denominations } from '../utils.js';
import * as histEdit from './historyEdit.js';
import { getInvoicesByDate } from '../integration/invoiceStore.js';
import { syncInvoicesForDate } from '../integration/cukcuk.js';

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
        <button class="btn btn-outline btn-sm" id="btnRebuildSnapshots" title="Cập nhật lại số liệu lịch sử từ dữ liệu CUKCUK mới nhất">
          <span class="material-symbols-rounded">refresh</span> Làm mới lịch sử
        </button>
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

  // Fix 3B: Dedup by compound key before rendering (no startTime — clones differ by seconds)
  var seen = {};
  shifts = shifts.filter(function(sh) {
    var key = (sh.date || '') + '_' + (sh.shiftNumber || '') + '_' + (sh.cashierName || '');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

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
  // Fallback: if snapshot is empty, query live invoiceStore by shift date
  var invoices = sh.cukcukInvoicesSnapshot || [];
  var invoicesFromLive = false;
  if (invoices.length === 0 && sh.date) {
    try {
      var liveInvs = getInvoicesByDate(sh.date);
      if (liveInvs.length > 0) {
        invoices = liveInvs;
        invoicesFromLive = true;
      }
    } catch(e) { /* ignore */ }
  }

  function tabSummary() {
    return '<table class="report-table" style="margin-bottom:12px;"><tr><td>Thời gian</td><td>'+formatTime(sh.startTime)+' → '+(sh.endTime?formatTime(sh.endTime):'(đang mở)')+'</td></tr><tr><td>Tiền đầu ca <button class="btn-icon" id="btnHTabEditStartCash" title="Sửa"><span class="material-symbols-rounded" style="font-size:14px;color:var(--primary);">edit</span></button></td><td>'+fc(sh.startingCash)+'</td></tr></table>'+
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
    var html='<div style="display:flex;gap:6px;margin-bottom:10px;"><button class="btn btn-success btn-sm" id="btnHTabAddIncome"><span class="material-symbols-rounded">add</span> Thu</button><button class="btn btn-danger btn-sm" id="btnHTabAddExpense"><span class="material-symbols-rounded">remove</span> Chi</button><button class="btn btn-outline btn-sm" id="btnHTabAddOther"><span class="material-symbols-rounded">add</span> Khác</button></div>';
    if(manualTxs.length>0) html+='<h4 style="color:#16a34a;margin-bottom:6px;">✍️ Thu ('+manualTxs.length+')</h4><table class="report-table">'+manualTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right" style="color:#16a34a;">+'+fc(t.amount)+'</td><td style="width:50px;text-align:right;"><button class="btn-icon" data-he-edit-tx="'+t.id+'"><span class="material-symbols-rounded" style="font-size:15px;color:var(--primary);">edit</span></button><button class="btn-icon" data-he-del-tx="'+t.id+'"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>';}).join('')+'</table>';
    if(expTxs.length>0) html+='<h4 style="color:#dc2626;margin:12px 0 6px;">💸 Chi ('+expTxs.length+')</h4><table class="report-table">'+expTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right" style="color:#dc2626;">−'+fc(t.amount)+'</td><td style="width:50px;text-align:right;"><button class="btn-icon" data-he-edit-tx="'+t.id+'"><span class="material-symbols-rounded" style="font-size:15px;color:var(--primary);">edit</span></button><button class="btn-icon" data-he-del-tx="'+t.id+'"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>';}).join('')+'</table>';
    if(otherTxs.length>0) html+='<h4 style="color:var(--warning);margin:12px 0 6px;">📝 Khác ('+otherTxs.length+')</h4><table class="report-table">'+otherTxs.map(function(t){return '<tr><td>'+t.category+'</td><td class="text-right" style="color:'+(t.type==='income'?'#16a34a':'#dc2626')+';">'+( t.type==='income'?'+':'−')+fc(t.amount)+'</td><td style="width:30px;text-align:right;"><button class="btn-icon" data-he-del-other="'+t.id+'"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>';}).join('')+'</table>';
    if(manualTxs.length===0&&expTxs.length===0&&otherTxs.length===0) html+='<p class="text-muted" style="padding:16px;text-align:center;">Chưa có giao dịch thu/chi</p>';
    return html;
  }
  function tabInvoices() {
    var syncBtn='<button class="btn btn-outline btn-sm" id="btnHSyncCukcuk" style="margin-left:8px;"><span class="material-symbols-rounded">sync</span> Đồng bộ</button>';
    if(invoices.length===0) return '<div class="empty-state" style="padding:20px;"><p>Không có hóa đơn POS</p><p class="text-muted" style="font-size:12px;">Bấm Đồng bộ để tải từ CUKCUK</p><div style="margin-top:10px;"><button class="btn btn-primary btn-sm" id="btnHSyncCukcuk"><span class="material-symbols-rounded">sync</span> Đồng bộ từ CUKCUK</button></div></div>';
    var srcTag = invoicesFromLive ? '<span class="tag" style="background:rgba(245,158,11,.15);color:#f59e0b;font-size:10px;margin-left:6px;">⚡ Live</span>' : '';
    var total=0;var rows=invoices.map(function(inv){var amt=0;(inv.payments||[]).forEach(function(p){amt+=p.amount||0;});if(!amt)amt=inv.amount||0;total+=amt;var m=(inv.payments||[]).map(function(p){return p.method==='cash'?'💵':p.method==='card'?'💳':'🏦';}).join('');return '<tr><td>'+(inv.refNo||'—')+'</td><td>'+(inv.tableName||'—')+'</td><td>'+m+'</td><td class="text-right">'+fc(amt)+'</td><td style="width:30px;"><button class="btn-icon" data-he-edit-inv="'+(inv.refId||'')+'" title="Sửa PTTT"><span class="material-symbols-rounded" style="font-size:15px;color:var(--primary);">edit</span></button></td></tr>';}).join('');
    return '<p style="margin-bottom:8px;"><strong>'+invoices.length+'</strong> hóa đơn — Tổng: <strong style="color:var(--success);">'+fc(total)+'</strong>'+srcTag+syncBtn+(invoicesFromLive?'<button class="btn btn-outline btn-sm" id="btnHSaveSnapshot" style="margin-left:4px;"><span class="material-symbols-rounded">save</span> Lưu</button>':'')+'</p><table class="report-table"><tr style="background:var(--bg-secondary);"><th>Bill</th><th>Bàn</th><th>PTTT</th><th class="text-right">Số tiền</th><th></th></tr>'+rows+'</table>';
  }
  function tabCashCount() {
    var cc=sh.cashCount||{};var keys=Object.keys(cc).filter(function(k){return cc[k]>0;});
    var editBtn='<div style="margin-bottom:8px;"><button class="btn btn-outline btn-sm" id="btnHTabEditCash"><span class="material-symbols-rounded">edit</span> Chỉnh sửa kiểm kê</button></div>';
    if(keys.length===0) return editBtn+'<div class="empty-state" style="padding:20px;"><p>Chưa kiểm kê tiền</p></div>';
    keys.sort(function(a,b){return Number(b)-Number(a);});var total=0;
    var rows=keys.map(function(k){var v=Number(k)*cc[k];total+=v;return '<tr><td>'+cc[k]+' x '+fc(Number(k))+'</td><td class="text-right">'+fc(v)+'</td></tr>';}).join('');
    var bk='';var pc=sh.pinnedCash||{},kc=sh.keepCash||{},hc=sh.handoverCash||{};
    if(Object.keys(pc).length||Object.keys(kc).length||Object.keys(hc).length){var ketT=0,handT=0;denominations.forEach(function(d){ketT+=d.value*((pc[d.value]||0)+(kc[d.value]||0));handT+=d.value*(hc[d.value]||0);});bk='<h4 style="margin:12px 0 4px;color:var(--primary);">📌 Két: '+fc(ketT)+' — 🤝 Giao: '+fc(handT)+'</h4>';}
    return editBtn+'<table class="report-table"><tr style="background:var(--bg-secondary);"><th>Mệnh giá</th><th class="text-right">Thành tiền</th></tr>'+rows+'<tr style="border-top:2px solid var(--border);"><td><strong>Tổng</strong></td><td class="text-right"><strong>'+fc(total)+'</strong></td></tr></table>'+bk;
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
    '<div class="modal-footer" style="margin-top:12px;flex-wrap:wrap;gap:6px;"><button class="btn btn-outline" onclick="window.hideModal()">Đóng</button><button class="btn btn-primary btn-sm" id="btnOpenHandoverReport" data-shift-date="'+sh.date+'"><span class="material-symbols-rounded">print</span> Phiếu bàn giao</button></div>');

  var _reopen = function(){ allHistory=getShiftHistory(); sh=allHistory.find(function(s){return s.id===sh.id;})||sh; sm=getHistorySummary(sh); manualTxs=(sh.transactions||[]).filter(function(t){return t.type==='income'&&(!t.note||t.note.indexOf('[CUKCUK]')===-1);}); expTxs=(sh.transactions||[]).filter(function(t){return t.type==='expense';}); otherTxs=sh.otherTransactions||[]; hideModal(); setTimeout(function(){_renderShiftDetailModal(sh,sm);_filterHistory();},200); };
  function _bindInlineEdits(){
    document.querySelectorAll('[data-he-edit-tx]').forEach(function(b){b.addEventListener('click',function(){var txId=b.dataset.heEditTx;var tx=null;(sh.transactions||[]).forEach(function(t){if(t.id===txId)tx=t;});if(tx){hideModal();histEdit.showEditTxModal(sh.id,tx.type,tx,_reopen);}});});
    document.querySelectorAll('[data-he-del-tx]').forEach(function(b){b.addEventListener('click',async function(){var ok=await showConfirm('Xóa giao dịch?',{title:'Xóa',confirmText:'Xóa',type:'danger'});if(ok){removeHistoryTransaction(sh.id,b.dataset.heDelTx);_reopen();}});});
    document.querySelectorAll('[data-he-del-other]').forEach(function(b){b.addEventListener('click',async function(){var ok=await showConfirm('Xóa?',{title:'Xóa',confirmText:'Xóa',type:'danger'});if(ok){removeHistoryOtherTransaction(sh.id,b.dataset.heDelOther);_reopen();}});});
    document.getElementById('btnHTabAddIncome')?.addEventListener('click',function(){hideModal();histEdit.showEditTxModal(sh.id,'income',null,_reopen);});
    document.getElementById('btnHTabAddExpense')?.addEventListener('click',function(){hideModal();histEdit.showEditTxModal(sh.id,'expense',null,_reopen);});
    document.getElementById('btnHTabAddOther')?.addEventListener('click',function(){hideModal();histEdit.showEditOtherTxModal(sh.id,_reopen);});
    document.getElementById('btnHTabEditStartCash')?.addEventListener('click',function(){hideModal();histEdit.showEditStartingCashModal(sh,_reopen);});
    document.getElementById('btnHTabEditCash')?.addEventListener('click',function(){hideModal();histEdit.showEditCashCountModal(sh,_reopen);});
    document.querySelectorAll('[data-he-edit-inv]').forEach(function(b){b.addEventListener('click',function(){var refId=b.dataset.heEditInv;var inv=null;invoices.forEach(function(i){if(i.refId===refId)inv=i;});if(inv){hideModal();histEdit.showEditInvoicePaymentModal(sh.id,inv,_reopen);}});});
    document.getElementById('btnHSyncCukcuk')?.addEventListener('click',async function(){
      if(!sh.date){showToast('Không xác định ngày ca','warning');return;}
      this.disabled=true;this.innerHTML='<span class="material-symbols-rounded spin">sync</span> Đang tải...';
      try{
        var result=await syncInvoicesForDate(sh.date);
        if(result.success && result.synced>0){
          var live=getInvoicesByDate(sh.date);
          if(live.length>0){backfillHistoryInvoiceSnapshot(sh.id,live);}
          _reopen();
        }else if(result.success){
          var live2=getInvoicesByDate(sh.date);
          if(live2.length>0){backfillHistoryInvoiceSnapshot(sh.id,live2);_reopen();}else{this.disabled=false;this.innerHTML='<span class="material-symbols-rounded">sync</span> Đồng bộ';}
        }else{this.disabled=false;this.innerHTML='<span class="material-symbols-rounded">sync</span> Đồng bộ';}
      }catch(e){showToast(e.message,'error');this.disabled=false;this.innerHTML='<span class="material-symbols-rounded">sync</span> Đồng bộ';}
    });
    document.getElementById('btnHSaveSnapshot')?.addEventListener('click',function(){
      try{backfillHistoryInvoiceSnapshot(sh.id,invoices);showToast('✅ Đã lưu snapshot '+invoices.length+' hóa đơn','success');_reopen();}catch(e){showToast(e.message,'error');}
    });
  }
  setTimeout(function() {
    var bar=document.getElementById('histTabBar');var content=document.getElementById('histTabContent');
    if(bar) bar.addEventListener('click',function(e){var btn=e.target.closest('[data-htab]');if(!btn)return;bar.querySelectorAll('.hist-tab').forEach(function(b){b.classList.remove('active');b.style.borderBottomColor='transparent';b.style.color='var(--text-muted)';});btn.classList.add('active');btn.style.borderBottomColor='var(--primary)';btn.style.color='var(--text)';var tab=tabDefs.find(function(t){return t.id===btn.dataset.htab;});if(tab&&content){content.innerHTML=tab.fn();_bindInlineEdits();}});
    var rbtn=document.getElementById('btnOpenHandoverReport');
    if(rbtn) rbtn.addEventListener('click',function(){hideModal();if(window._setReportDate)window._setReportDate(rbtn.dataset.shiftDate);window.navigateTo('report');});
    _bindInlineEdits();
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

  document.getElementById('btnRebuildSnapshots')?.addEventListener('click', function() {
    var count = rebuildHistorySnapshots();
    if (count > 0) {
      showToast('\u2705 Đã cập nhật ' + count + ' ca từ dữ liệu CUKCUK mới nhất', 'success');
      allHistory = getShiftHistory();
      _filterHistory();
    } else {
      showToast('Không có ca nào cần cập nhật', 'info');
    }
  });
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
