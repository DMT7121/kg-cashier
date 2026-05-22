/* ── History View — Tabbed shift detail w/ snapshot data ── */
import { getShiftHistory, deleteShiftFromHistory, getShiftSummary, getHistorySummary, saveShiftToHistory, rebuildHistorySnapshots, removeHistoryTransaction, removeHistoryOtherTransaction, backfillHistoryInvoiceSnapshot } from '../store.js';
import { getShiftsFromCloud } from '../api.js';
import { formatCurrency, formatDate, formatTime, showToast, showModal, hideModal, showConfirm, denominations } from '../utils.js';
import * as histEdit from './historyEdit.js';
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
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline btn-sm" id="btnRebuildSnapshots" title="Cập nhật lại số liệu lịch sử từ dữ liệu CUKCUK mới nhất">
          <span class="material-symbols-rounded text-[18px]">refresh</span> Làm mới lịch sử
        </button>
        <button class="btn btn-outline btn-sm" id="btnSyncHistory">
          <span class="material-symbols-rounded text-[18px]">cloud_sync</span> Đồng bộ Cloud
        </button>
        <button class="btn btn-outline btn-sm" id="btnExportHistory">
          <span class="material-symbols-rounded text-[18px]">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="flex flex-col md:flex-row gap-4 mb-4">
      <div class="form-group flex-[2] mb-0">
        <input type="text" id="historySearch" class="form-input" placeholder="🔍 Tìm theo tên thu ngân, ngày, ghi chú...">
      </div>
      <div class="form-group flex-1 mb-0">
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
    return '<div class="empty-state py-10 px-5"><span class="material-symbols-rounded empty-icon">history</span><h3>Chưa có lịch sử</h3><p>Các ca đã đóng sẽ hiện ở đây</p></div>';
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
          <div><span class="text-slate-500 block text-xs">Doanh thu</span><strong class="text-emerald-600 block">${formatCurrency(sm.totalIncome)}</strong></div>
          <div><span class="text-slate-500 block text-xs">Chi phí</span><strong class="text-rose-600 block">${formatCurrency(sm.totalExpense)}</strong></div>
          <div><span class="text-slate-500 block text-xs">Bills</span><strong class="block">${sm.billCount}${sm.cukcukBills > 0 ? ' <span class="text-[10px] text-emerald-500 font-normal">(' + sm.cukcukBills + ' POS)</span>' : ''}</strong></div>
          <div><span class="text-slate-500 block text-xs">Chênh lệch</span><strong class="block ${sm.discrepancy === 0 ? 'text-emerald-500' : 'text-rose-600'}">${sm.discrepancy === 0 ? '✅ 0' : formatCurrency(sm.discrepancy)}</strong></div>
        </div>
        ${sh.notes ? `<p class="text-slate-500 mt-2 text-xs bg-slate-50 p-2 rounded-lg">📝 ${sh.notes}</p>` : ''}
      </div>
    `;
  }).join('');
}

async function _showShiftDetail(shiftId) {
  const sh = allHistory.find(s => s.id === shiftId) || cloudHistory.find(s => s.id === shiftId);
  if (!sh) return;
  const sm = getHistorySummary(sh);
  const store = await import('../integration/invoiceStore.js');
  _renderShiftDetailModal(sh, sm, store);
}

function _renderShiftDetailModal(sh, sm, store) {
  var fc = formatCurrency;
  var manualTxs = (sh.transactions||[]).filter(function(t){return t.type==='income'&&(!t.note||t.note.indexOf('[CUKCUK]')===-1);});
  var expTxs = (sh.transactions||[]).filter(function(t){return t.type==='expense';});
  var otherTxs = sh.otherTransactions||[];
  // Fallback: if snapshot is empty, query live invoiceStore by shift date
  var invoices = sh.cukcukInvoicesSnapshot || [];
  var invoicesFromLive = false;
  if (invoices.length === 0 && sh.date) {
    try {
      var liveInvs = store.getInvoicesByShiftTime(sh.date, sh.startTime, sh.endTime);
      if (liveInvs.length > 0) {
        invoices = liveInvs;
        invoicesFromLive = true;
      }
    } catch(e) { /* ignore */ }
  }

  function tabSummary() {
    return '<table class="report-table mb-3"><tr><td>Thời gian</td><td>'+formatTime(sh.startTime)+' → '+(sh.endTime?formatTime(sh.endTime):'(đang mở)')+'</td></tr><tr><td>Tiền đầu ca <button class="btn-icon w-6 h-6 p-0" id="btnHTabEditStartCash" title="Sửa"><span class="material-symbols-rounded text-[14px] text-blue-600">edit</span></button></td><td>'+fc(sh.startingCash)+'</td></tr></table>'+
    (sm.cukcukBills>0?'<h4 class="mt-3 mb-1 text-emerald-500 font-bold">🏪 CUKCUK ('+sm.cukcukBills+' bill) — '+fc(sm.cukcukRevenue)+'</h4><table class="report-table"><tr><td>💵 TM</td><td class="text-right">'+fc(sm.cashIncome)+'</td></tr><tr><td>💳 Thẻ</td><td class="text-right">'+fc(sm.cardIncome)+'</td></tr><tr><td>🏦 CK</td><td class="text-right">'+fc(sm.transferIncome)+'</td></tr></table>':'')+
    '<h4 class="mt-4 mb-1 text-blue-600 font-bold">📊 Tổng kết</h4><table class="report-table bg-indigo-50/30 rounded-xl overflow-hidden">'+
    (sm.cukcukBills>0?'<tr><td>Tiền mặt CUKCUK ('+sm.cukcukBills+' bill)</td><td class="text-right text-emerald-600">'+fc(sm.cashIncome)+'</td></tr>':'')+
    (manualTxs.length>0?'<tr><td>Thu ngoài POS</td><td class="text-right text-emerald-600">+'+fc(sm.totalIncome - sm.cukcukRevenue)+'</td></tr>':'')+
    '<tr><td>Chi phí</td><td class="text-right text-rose-600">−'+fc(sm.totalExpense)+'</td></tr>'+
    '<tr class="border-t-2 border-slate-200"><td><strong>TM kỳ vọng</strong></td><td class="text-right"><strong>'+fc(sm.expectedCash)+'</strong></td></tr>'+
    '<tr><td>TM kiểm kê</td><td class="text-right">'+fc(sm.cashCountTotal)+'</td></tr>'+
    '<tr class="'+(Math.abs(sm.discrepancy)>0?'bg-rose-50':'bg-emerald-50')+'"><td><strong>CHÊNH LỆCH</strong></td><td class="text-right"><strong class="'+(sm.discrepancy===0?'text-emerald-500':'text-rose-600')+'">'+(sm.discrepancy===0?'✓ 0 đ':fc(sm.discrepancy))+'</strong></td></tr></table>'+
    (sh.notes?'<p class="mt-3 p-3 bg-slate-50 rounded-xl text-[13px]"><strong>📝</strong> '+sh.notes+'</p>':'');
  }
  function tabTransactions() {
    var html='<div class="flex gap-2 mb-3"><button class="btn btn-success btn-sm" id="btnHTabAddIncome"><span class="material-symbols-rounded">add</span> Thu</button><button class="btn btn-danger btn-sm" id="btnHTabAddExpense"><span class="material-symbols-rounded">remove</span> Chi</button><button class="btn btn-outline btn-sm" id="btnHTabAddOther"><span class="material-symbols-rounded">add</span> Khác</button></div>';
    if(manualTxs.length>0) html+='<h4 class="text-emerald-600 mb-1 font-bold">✍️ Thu ('+manualTxs.length+')</h4><table class="report-table">'+manualTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right text-emerald-600">+'+fc(t.amount)+'</td><td class="w-[50px] text-right"><button class="btn-icon" data-he-edit-tx="'+t.id+'"><span class="material-symbols-rounded text-[15px] text-blue-600">edit</span></button><button class="btn-icon" data-he-del-tx="'+t.id+'"><span class="material-symbols-rounded text-[15px] text-rose-600">delete</span></button></td></tr>';}).join('')+'</table>';
    if(expTxs.length>0) html+='<h4 class="text-rose-600 mt-3 mb-1 font-bold">💸 Chi ('+expTxs.length+')</h4><table class="report-table">'+expTxs.map(function(t){return '<tr><td>'+t.category+(t.note?' — '+t.note:'')+'</td><td class="text-right text-rose-600">−'+fc(t.amount)+'</td><td class="w-[50px] text-right"><button class="btn-icon" data-he-edit-tx="'+t.id+'"><span class="material-symbols-rounded text-[15px] text-blue-600">edit</span></button><button class="btn-icon" data-he-del-tx="'+t.id+'"><span class="material-symbols-rounded text-[15px] text-rose-600">delete</span></button></td></tr>';}).join('')+'</table>';
    if(otherTxs.length>0) html+='<h4 class="text-orange-500 mt-3 mb-1 font-bold">📝 Khác ('+otherTxs.length+')</h4><table class="report-table">'+otherTxs.map(function(t){return '<tr><td>'+t.category+'</td><td class="text-right '+(t.type==='income'?'text-emerald-600':'text-rose-600')+'">'+( t.type==='income'?'+':'−')+fc(t.amount)+'</td><td class="w-[30px] text-right"><button class="btn-icon" data-he-del-other="'+t.id+'"><span class="material-symbols-rounded text-[15px] text-rose-600">delete</span></button></td></tr>';}).join('')+'</table>';
    if(manualTxs.length===0&&expTxs.length===0&&otherTxs.length===0) html+='<p class="text-slate-500 p-4 text-center">Chưa có giao dịch thu/chi</p>';
    return html;
  }
  function tabInvoices() {
    var syncBtn='<button class="btn btn-outline btn-sm ml-2" id="btnHSyncCukcuk"><span class="material-symbols-rounded">sync</span> Đồng bộ</button>';
    if(invoices.length===0) return '<div class="empty-state p-5"><p>Không có hóa đơn POS</p><p class="text-slate-500 text-[12px]">Bấm Đồng bộ để tải từ CUKCUK</p><div class="mt-3"><button class="btn btn-primary btn-sm" id="btnHSyncCukcuk"><span class="material-symbols-rounded">sync</span> Đồng bộ từ CUKCUK</button></div></div>';
    var srcTag = invoicesFromLive ? '<span class="tag bg-orange-100 text-orange-600 text-[10px] ml-2">⚡ Live</span>' : '';
    var total=0;var rows=invoices.map(function(inv){var amt=0;(inv.payments||[]).forEach(function(p){amt+=p.amount||0;});if(!amt)amt=inv.amount||0;total+=amt;var m=(inv.payments||[]).map(function(p){return p.method==='cash'?'💵':p.method==='card'?'💳':'🏦';}).join('');return '<tr><td>'+(inv.refNo||'—')+'</td><td>'+(inv.tableName||'—')+'</td><td>'+m+'</td><td class="text-right">'+fc(amt)+'</td><td class="w-[30px]"><button class="btn-icon" data-he-edit-inv="'+(inv.refId||'')+'" title="Sửa PTTT"><span class="material-symbols-rounded text-[15px] text-blue-600">edit</span></button></td></tr>';}).join('');
    return '<p class="mb-2"><strong>'+invoices.length+'</strong> hóa đơn — Tổng: <strong class="text-emerald-500">'+fc(total)+'</strong>'+srcTag+syncBtn+(invoicesFromLive?'<button class="btn btn-outline btn-sm ml-1" id="btnHSaveSnapshot"><span class="material-symbols-rounded">save</span> Lưu</button>':'')+'</p><table class="report-table"><tr class="bg-slate-50"><th>Bill</th><th>Bàn</th><th>PTTT</th><th class="text-right">Số tiền</th><th></th></tr>'+rows+'</table>';
  }
  function tabCashCount() {
    var cc=sh.cashCount||{};var keys=Object.keys(cc).filter(function(k){return cc[k]>0;});
    var editBtn='<div class="mb-2"><button class="btn btn-outline btn-sm" id="btnHTabEditCash"><span class="material-symbols-rounded">edit</span> Chỉnh sửa kiểm kê</button></div>';
    if(keys.length===0) return editBtn+'<div class="empty-state p-5"><p>Chưa kiểm kê tiền</p></div>';
    keys.sort(function(a,b){return Number(b)-Number(a);});var total=0;
    var rows=keys.map(function(k){var v=Number(k)*cc[k];total+=v;return '<tr><td>'+cc[k]+' x '+fc(Number(k))+'</td><td class="text-right">'+fc(v)+'</td></tr>';}).join('');
    var bk='';var pc=sh.pinnedCash||{},kc=sh.keepCash||{},hc=sh.handoverCash||{};
    if(Object.keys(pc).length||Object.keys(kc).length||Object.keys(hc).length){var ketT=0,handT=0;denominations.forEach(function(d){ketT+=d.value*((pc[d.value]||0)+(kc[d.value]||0));handT+=d.value*(hc[d.value]||0);});bk='<h4 class="mt-3 mb-1 text-blue-600 font-bold">📌 Két: '+fc(ketT)+' — 🤝 Giao: '+fc(handT)+'</h4>';}
    return editBtn+'<table class="report-table"><tr class="bg-slate-50"><th>Mệnh giá</th><th class="text-right">Thành tiền</th></tr>'+rows+'<tr class="border-t-2 border-slate-200"><td><strong>Tổng</strong></td><td class="text-right"><strong>'+fc(total)+'</strong></td></tr></table>'+bk;
  }
  function tabDrinkInv() {
    var snap=sh.drinkInventorySnapshot;
    if(!snap||!snap.items) return '<div class="empty-state p-5"><p>Không có dữ liệu kiểm kho</p><small class="text-slate-500">Dữ liệu kiểm kho được snapshot từ các ca đóng sau bản cập nhật này</small></div>';
    var rows=Object.keys(snap.items).map(function(id){var it=snap.items[id];if(!it)return '';return '<tr><td>'+(it.name||id)+'</td><td class="text-right">'+(it.start!=null?it.start:'—')+'</td><td class="text-right">'+(it.end!=null?it.end:'—')+'</td><td class="text-right">'+(it.sold!=null?it.sold:'—')+'</td></tr>';}).join('');
    return '<table class="report-table"><tr class="bg-slate-50"><th>Sản phẩm</th><th class="text-right">Đầu</th><th class="text-right">Cuối</th><th class="text-right">Bán</th></tr>'+rows+'</table>';
  }

  var tabDefs=[{id:'sum',icon:'summarize',label:'Tổng kết',fn:tabSummary},{id:'tx',icon:'receipt_long',label:'Giao dịch',fn:tabTransactions},{id:'pos',icon:'point_of_sale',label:'Hóa đơn POS',fn:tabInvoices},{id:'cash',icon:'calculate',label:'Kiểm kê tiền',fn:tabCashCount},{id:'drink',icon:'local_bar',label:'Kiểm kho',fn:tabDrinkInv}];
  var tabBar=tabDefs.map(function(t,i){return '<button class="hist-tab'+(i===0?' active':'')+' border-b-2 '+(i===0?'border-blue-600 text-slate-900':'border-transparent text-slate-500')+' flex items-center gap-1 px-3 py-1.5 bg-transparent cursor-pointer text-xs" data-htab="'+t.id+'"><span class="material-symbols-rounded text-[16px]">'+t.icon+'</span>'+t.label+'</button>';}).join('');

  showModal('<div class="modal-title text-base"><span class="material-symbols-rounded text-blue-600">summarize</span> Ca '+sh.shiftNumber+' — '+sh.cashierName+' — '+formatDate(sh.date)+'</div>'+
    '<div class="border-b border-slate-200 -mx-5 px-5 overflow-x-auto whitespace-nowrap flex" id="histTabBar">'+tabBar+'</div>'+
    '<div class="max-h-[55vh] overflow-auto py-3" id="histTabContent">'+tabSummary()+'</div>'+
    '<div class="modal-footer mt-3 flex-wrap gap-2"><button class="btn btn-outline" onclick="window.hideModal()">Đóng</button><button class="btn btn-primary btn-sm" id="btnOpenHandoverReport" data-shift-date="'+sh.date+'" data-print-shift="'+sh.id+'"><span class="material-symbols-rounded">print</span> Phiếu bàn giao</button></div>');

  var _reopen = function(){ allHistory=getShiftHistory(); sh=allHistory.find(function(s){return s.id===sh.id;})||sh; sm=getHistorySummary(sh); manualTxs=(sh.transactions||[]).filter(function(t){return t.type==='income'&&(!t.note||t.note.indexOf('[CUKCUK]')===-1);}); expTxs=(sh.transactions||[]).filter(function(t){return t.type==='expense';}); otherTxs=sh.otherTransactions||[]; hideModal(); setTimeout(function(){_renderShiftDetailModal(sh,sm,store);_filterHistory();},200); };
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
          var live=store.getInvoicesByShiftTime(sh.date, sh.startTime, sh.endTime);
          if(live.length>0){backfillHistoryInvoiceSnapshot(sh.id,live);}
          _reopen();
        }else if(result.success){
          var live2=store.getInvoicesByShiftTime(sh.date, sh.startTime, sh.endTime);
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
    if(rbtn) rbtn.addEventListener('click',function(){
      hideModal();
      if(window._setReportDate)window._setReportDate(rbtn.dataset.shiftDate);
      window._setReportShiftId = function() { return rbtn.dataset.printShift; };
      window._historyReportMode = true;
      window.navigateTo('report');
    });
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

export function destroy() {
  allHistory = [];
  cloudHistory = [];
}
