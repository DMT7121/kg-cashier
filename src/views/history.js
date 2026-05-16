/* ── History View — Day-based reporting & shift history ── */
import { getShiftHistory, getHistorySummary, removeHistoryTransaction, removeHistoryOtherTransaction, backfillHistoryInvoiceSnapshot, getSettings } from '../store.js';
import { getShiftsFromCloud } from '../api.js';
import { formatCurrency, formatDate, formatTime, showToast, showConfirm, denominations } from '../utils.js';
import * as histEdit from './historyEdit.js';
import { getInvoicesByDate } from '../integration/invoiceStore.js';
import { syncInvoicesForDate } from '../integration/cukcuk.js';

let currentDate = '';
let currentShifts = [];
let currentInvoices = [];
let currentTab = 'sum';

export function render() {
  const today = new Date();
  // Adjust logic: if before 6 AM, consider it previous day's shift
  if (today.getHours() < 6) today.setDate(today.getDate() - 1);
  const defaultDate = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  
  // If we came from report view with a specific date
  if (window._setReportDate) {
    currentDate = window._setReportDate();
    window._setReportDate = null;
  } else {
    currentDate = defaultDate;
  }

  return `
    <div class="section-header">
      <div>
        <h3>📚 Lịch sử & Báo cáo ngày</h3>
        <p>Quản lý số liệu gộp theo ngày làm việc</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-outline btn-sm" id="btnSyncHistory" title="Tải ca từ đám mây">
          <span class="material-symbols-rounded">cloud_sync</span> Tải Cloud
        </button>
        <button class="btn btn-outline btn-sm" id="btnExportCSV">
          <span class="material-symbols-rounded">download</span> Xuất CSV
        </button>
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px; background:var(--bg-secondary); padding:12px; border-radius:12px; align-items:center;">
      <div style="display:flex; align-items:center; gap:8px;">
        <label class="form-label" style="margin:0;">Ngày làm việc:</label>
        <input type="date" id="historyDate" class="form-input" value="${currentDate}" style="max-width:200px;">
        <button class="btn btn-outline btn-sm" id="btnPrevDay"><span class="material-symbols-rounded">chevron_left</span></button>
        <button class="btn btn-outline btn-sm" id="btnToday">Hôm nay</button>
        <button class="btn btn-outline btn-sm" id="btnNextDay"><span class="material-symbols-rounded">chevron_right</span></button>
      </div>
    </div>

    <div style="border-bottom:1px solid var(--border); margin-bottom:16px; display:flex; overflow-x:auto; gap:4px; padding-bottom:4px;" id="histTabBar">
      ${_renderTabBtn('sum', 'summarize', 'Tổng kết ngày')}
      ${_renderTabBtn('tx', 'receipt_long', 'Giao dịch')}
      ${_renderTabBtn('pos', 'point_of_sale', 'Hóa đơn POS')}
      ${_renderTabBtn('cash', 'calculate', 'Kiểm kê tiền')}
      ${_renderTabBtn('drink', 'local_bar', 'Kiểm kho')}
      ${_renderTabBtn('print', 'print', 'Phiếu bàn giao')}
    </div>

    <div id="histTabContent" style="min-height:400px; padding-bottom:40px;">
      <!-- Content loads here -->
    </div>
  `;
}

function _renderTabBtn(id, icon, label) {
  const isActive = currentTab === id;
  return `<button class="hist-tab ${isActive ? 'active' : ''}" data-htab="${id}" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;border:none;background:${isActive?'var(--primary)':'transparent'};color:${isActive?'#fff':'var(--text-muted)'};border-radius:20px;cursor:pointer;font-size:13px;font-weight:500;transition:all .2s;"><span class="material-symbols-rounded" style="font-size:18px;">${icon}</span>${label}</button>`;
}

function _loadDayData() {
  const allHistory = getShiftHistory();
  // Filter shifts strictly by the selected date
  currentShifts = allHistory.filter(s => s.date === currentDate);
  // Sort shifts by shiftNumber / startTime ASC
  currentShifts.sort((a,b) => (a.shiftNumber || 0) - (b.shiftNumber || 0) || (a.startTime > b.startTime ? 1 : -1));
  
  // Load invoices directly from invoiceStore
  currentInvoices = getInvoicesByDate(currentDate);

  _renderTabContent();
}

function _renderTabContent() {
  const contentEl = document.getElementById('histTabContent');
  if (!contentEl) return;
  
  let html = '';
  switch (currentTab) {
    case 'sum': html = _tabSummary(); break;
    case 'tx': html = _tabTransactions(); break;
    case 'pos': html = _tabInvoices(); break;
    case 'cash': html = _tabCashCount(); break;
    case 'drink': html = _tabDrinkInv(); break;
    case 'print': html = _tabPrint(); break;
  }
  contentEl.innerHTML = html;
  contentEl.style.animation = 'none';
  contentEl.offsetHeight; // reflow
  contentEl.style.animation = 'fadeIn .2s ease';
  
  _bindTabEvents();
}

// ── TAB RENDERING ──

function _tabSummary() {
  var fc = formatCurrency;
  
  // Aggregate data
  var totInc=0, totExp=0, expCash=0, countKet=0, discrepancy=0;
  var posRev=0, posBills=0, posCash=0, posCard=0, posTransfer=0;
  var manInc=0, manBills=0, manExp=0;
  
  // CUKCUK POS (from invoiceStore)
  currentInvoices.forEach(inv => {
    var invTotal = 0;
    (inv.payments||[]).forEach(p => { 
      invTotal += p.amount||0;
      if (p.method==='cash') posCash += p.amount;
      else if (p.method==='card') posCard += p.amount;
      else if (p.method==='transfer') posTransfer += p.amount;
    });
    if (!invTotal) invTotal = inv.amount||0;
    posRev += invTotal;
    totInc += invTotal;
    posBills++;
  });
  
  // Shift transactions & cash counts
  currentShifts.forEach(sh => {
    var sm = getHistorySummary(sh);
    totInc += sm.manualIncome||0;
    totInc += sm.otherIncome||0;
    totExp += sm.totalExpense||0;
    manInc += sm.manualIncome||0;
    manBills += sm.manualBills||0;
    manExp += sm.totalExpense||0;
  });
  
  // Expected cash relies on startingCash of FIRST shift and net cash movements
  var startCash = currentShifts.length > 0 ? currentShifts[0].startingCash : 0;
  
  // Calculate cash income vs expense (manual)
  var manCashInc=0, manCashExp=0;
  currentShifts.forEach(sh => {
    var sm = getHistorySummary(sh);
    manCashInc += (sm.cashIncome||0) - posCash; // getHistorySummary mixes them, we isolate manual
    if (manCashInc < 0) manCashInc = 0; // fallback if mixing is weird
    manCashExp += sm.cashExpense||0;
  });
  
  expCash = startCash + posCash + manCashInc - manCashExp;
  
  // Cash count from LAST shift
  var lastShift = currentShifts.length > 0 ? currentShifts[currentShifts.length - 1] : null;
  if (lastShift) {
    var lsm = getHistorySummary(lastShift);
    countKet = lsm.cashCountTotal || 0;
    discrepancy = countKet - expCash;
  }
  
  var emptyHtml = currentShifts.length === 0 ? '<div class="alert alert-warning" style="margin-bottom:16px;">Ngày này chưa có ca nào được đóng. (Báo cáo chỉ lấy dữ liệu POS)</div>' : '';
  
  return emptyHtml + `
    <h4 style="margin:16px 0 8px;color:var(--primary);">📊 Tổng kết ngày</h4>
    <table class="report-table" style="background:rgba(99,102,241,.04);border-radius:8px;">
      <tr><td><strong>DOANH THU TỔNG CỘNG</strong></td><td class="text-right"><strong style="color:var(--success);font-size:16px;">${fc(totInc)}</strong></td></tr>
      <tr><td>Chi phí tổng cộng</td><td class="text-right" style="color:#dc2626;">−${fc(totExp)}</td></tr>
      <tr style="border-top:2px solid var(--border);"><td><strong>Tiền mặt kỳ vọng</strong></td><td class="text-right"><strong>${fc(expCash)}</strong></td></tr>
      <tr><td>TM thực tế (Ca cuối)</td><td class="text-right">${fc(countKet)}</td></tr>
      <tr style="background:${Math.abs(discrepancy)>0?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)'};"><td><strong>CHÊNH LỆCH</strong></td><td class="text-right"><strong style="color:${discrepancy===0?'var(--success)':'var(--danger)'};">${discrepancy===0?'✓ 0 đ':fc(discrepancy)}</strong></td></tr>
    </table>
    
    <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:250px;background:white;padding:12px;border-radius:8px;border:1px solid var(--border);">
        <h4 style="color:#10b981;margin-top:0;">🏪 POS CUKCUK</h4>
        <p style="margin:4px 0;">Doanh thu: <strong>${fc(posRev)}</strong></p>
        <p style="margin:4px 0;">Số hóa đơn: <strong>${posBills}</strong></p>
        <hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">
        <p style="margin:4px 0;font-size:12px;">TM: ${fc(posCash)} | Thẻ: ${fc(posCard)} | CK: ${fc(posTransfer)}</p>
      </div>
      <div style="flex:1;min-width:250px;background:white;padding:12px;border-radius:8px;border:1px solid var(--border);">
        <h4 style="color:var(--primary);margin-top:0;">✍️ Giao dịch thủ công</h4>
        <p style="margin:4px 0;">Tổng thu: <strong>${fc(manInc)}</strong> (${manBills} món)</p>
        <p style="margin:4px 0;">Tổng chi: <strong style="color:var(--danger);">${fc(manExp)}</strong></p>
      </div>
    </div>
    
    ${currentShifts.length > 0 ? `
    <h4 style="margin:20px 0 8px;">Danh sách ca trong ngày</h4>
    <div style="display:grid;gap:8px;">
      ${currentShifts.map(sh => {
        var s = getHistorySummary(sh);
        return `<div style="padding:12px;border:1px solid var(--border);border-radius:8px;background:white;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <strong>Ca ${sh.shiftNumber} — ${sh.cashierName}</strong>
            <span class="text-muted">${formatTime(sh.startTime)} → ${sh.endTime?formatTime(sh.endTime):'Đang mở'}</span>
          </div>
          <div style="display:flex;gap:16px;font-size:13px;">
            <div>Thu: <span style="color:var(--success);">${fc(s.totalIncome)}</span></div>
            <div>Chi: <span style="color:var(--danger);">${fc(s.totalExpense)}</span></div>
            <div>Chênh: <span style="color:${s.discrepancy===0?'var(--success)':'var(--danger)'};">${fc(s.discrepancy)}</span></div>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;">
             <button class="btn btn-outline btn-sm" data-edit-note="${sh.id}"><span class="material-symbols-rounded" style="font-size:14px;">edit_note</span> Sửa ghi chú</button>
             <button class="btn btn-outline btn-sm" data-edit-startcash="${sh.id}"><span class="material-symbols-rounded" style="font-size:14px;">wallet</span> Đầu ca</button>
          </div>
          ${sh.notes ? `<p style="margin:8px 0 0;font-size:12px;color:var(--text-muted);">📝 ${sh.notes}</p>` : ''}
        </div>`;
      }).join('')}
    </div>
    ` : ''}
  `;
}

function _tabTransactions() {
  if (currentShifts.length === 0) return '<div class="empty-state"><p>Chưa có ca nào trong ngày</p></div>';
  
  var fc = formatCurrency;
  var html = '';
  
  currentShifts.forEach(sh => {
    var manualTxs = (sh.transactions||[]).filter(t => t.type==='income'&&(!t.note||t.note.indexOf('[CUKCUK]')===-1));
    var expTxs = (sh.transactions||[]).filter(t => t.type==='expense');
    var otherTxs = sh.otherTransactions||[];
    
    html += `<div style="margin-bottom:24px;border:1px solid var(--border);border-radius:8px;padding:12px;background:white;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;color:var(--primary);">Ca ${sh.shiftNumber} — ${sh.cashierName}</h4>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-success btn-sm" data-add-tx="income" data-sid="${sh.id}">+ Thu</button>
          <button class="btn btn-danger btn-sm" data-add-tx="expense" data-sid="${sh.id}">- Chi</button>
          <button class="btn btn-outline btn-sm" data-add-other="${sh.id}">Khác</button>
        </div>
      </div>`;
      
    if (manualTxs.length===0 && expTxs.length===0 && otherTxs.length===0) {
      html += '<p class="text-muted" style="text-align:center;margin:10px 0;">Không có giao dịch</p>';
    } else {
      if (manualTxs.length>0) {
        html += `<table class="report-table">
          ${manualTxs.map(t => `<tr><td>${t.category}${t.note?' — '+t.note:''}</td><td class="text-right" style="color:#16a34a;">+${fc(t.amount)}</td><td style="width:50px;text-align:right;"><button class="btn-icon" data-edit-tx="${t.id}" data-sid="${sh.id}"><span class="material-symbols-rounded" style="font-size:15px;color:var(--primary);">edit</span></button><button class="btn-icon" data-del-tx="${t.id}" data-sid="${sh.id}"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>`).join('')}
        </table>`;
      }
      if (expTxs.length>0) {
        html += `<table class="report-table" style="margin-top:8px;">
          ${expTxs.map(t => `<tr><td>${t.category}${t.note?' — '+t.note:''}</td><td class="text-right" style="color:#dc2626;">−${fc(t.amount)}</td><td style="width:50px;text-align:right;"><button class="btn-icon" data-edit-tx="${t.id}" data-sid="${sh.id}"><span class="material-symbols-rounded" style="font-size:15px;color:var(--primary);">edit</span></button><button class="btn-icon" data-del-tx="${t.id}" data-sid="${sh.id}"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>`).join('')}
        </table>`;
      }
      if (otherTxs.length>0) {
        html += `<table class="report-table" style="margin-top:8px;">
          ${otherTxs.map(t => `<tr><td>${t.category}</td><td class="text-right" style="color:${t.type==='income'?'#16a34a':'#dc2626'};">${t.type==='income'?'+':'−'}${fc(t.amount)}</td><td style="width:30px;text-align:right;"><button class="btn-icon" data-del-other="${t.id}" data-sid="${sh.id}"><span class="material-symbols-rounded" style="font-size:15px;color:var(--danger);">delete</span></button></td></tr>`).join('')}
        </table>`;
      }
    }
    html += '</div>';
  });
  
  return html;
}

function _tabInvoices() {
  var fc = formatCurrency;
  var syncBtn = `<button class="btn btn-primary btn-sm" id="btnSyncCukcuk"><span class="material-symbols-rounded">sync</span> Đồng bộ từ CUKCUK</button>`;
  
  if (currentInvoices.length === 0) {
    return `<div class="empty-state" style="padding:40px;"><p>Không có hóa đơn POS cho ngày ${formatDate(currentDate)}</p><div style="margin-top:16px;">${syncBtn}</div></div>`;
  }
  
  var total = 0;
  var rows = currentInvoices.map(inv => {
    var amt = 0;
    (inv.payments||[]).forEach(p => amt += p.amount||0);
    if (!amt) amt = inv.amount||0;
    total += amt;
    var m = (inv.payments||[]).map(p => p.method==='cash'?'💵':p.method==='card'?'💳':'🏦').join('');
    var tag = inv.manualOverride ? '<span title="Đã chỉnh sửa PTTT thủ công (khóa)"><span class="material-symbols-rounded" style="font-size:12px;color:var(--danger);vertical-align:middle;">lock</span></span> ' : '';
    
    return `<tr>
      <td>${tag}${inv.refNo||'—'}</td>
      <td>${inv.tableName||'—'}</td>
      <td>${m}</td>
      <td class="text-right">${fc(amt)}</td>
      <td style="width:40px;text-align:right;">
        <button class="btn-icon" data-edit-inv="${inv.refId}" title="Sửa PTTT"><span class="material-symbols-rounded" style="font-size:16px;color:var(--primary);">edit</span></button>
      </td>
    </tr>`;
  }).join('');
  
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <p style="margin:0;"><strong>${currentInvoices.length}</strong> hóa đơn — Tổng: <strong style="color:var(--success);font-size:16px;">${fc(total)}</strong></p>
      ${syncBtn}
    </div>
    <table class="report-table">
      <tr style="background:var(--bg-secondary);"><th>Bill</th><th>Bàn</th><th>PTTT</th><th class="text-right">Số tiền</th><th></th></tr>
      ${rows}
    </table>
  `;
}

function _tabCashCount() {
  if (currentShifts.length === 0) return '<div class="empty-state"><p>Chưa có ca nào</p></div>';
  var lastShift = currentShifts[currentShifts.length - 1]; // Only show last shift's cash count
  var fc = formatCurrency;
  
  var cc = lastShift.cashCount || {};
  var keys = Object.keys(cc).filter(k => cc[k]>0).sort((a,b) => Number(b)-Number(a));
  
  var editBtn = `<div style="margin-bottom:12px;"><button class="btn btn-outline btn-sm" data-edit-cash="${lastShift.id}"><span class="material-symbols-rounded">edit</span> Chỉnh sửa kiểm kê (Ca cuối: ${lastShift.shiftNumber})</button></div>`;
  
  if (keys.length === 0) return editBtn + '<div class="empty-state"><p>Chưa kiểm kê tiền ca cuối</p></div>';
  
  var total = 0;
  var rows = keys.map(k => {
    var v = Number(k)*cc[k]; total+=v;
    return `<tr><td>${cc[k]} x ${fc(Number(k))}</td><td class="text-right">${fc(v)}</td></tr>`;
  }).join('');
  
  var bk = '';
  var pc = lastShift.pinnedCash||{}, kc = lastShift.keepCash||{}, hc = lastShift.handoverCash||{};
  if (Object.keys(pc).length || Object.keys(kc).length || Object.keys(hc).length) {
    var ketT=0, handT=0;
    denominations.forEach(d => {
      ketT += d.value*((pc[d.value]||0)+(kc[d.value]||0));
      handT += d.value*(hc[d.value]||0);
    });
    bk = `<h4 style="margin:16px 0 8px;color:var(--primary);">📌 Két: ${fc(ketT)} — 🤝 Giao: ${fc(handT)}</h4>`;
  }
  
  return editBtn + `
    <table class="report-table">
      <tr style="background:var(--bg-secondary);"><th>Mệnh giá</th><th class="text-right">Thành tiền</th></tr>
      ${rows}
      <tr style="border-top:2px solid var(--border);"><td><strong>Tổng cộng</strong></td><td class="text-right"><strong style="color:var(--success);font-size:15px;">${fc(total)}</strong></td></tr>
    </table>
    ${bk}
  `;
}

function _tabDrinkInv() {
  if (currentShifts.length === 0) return '<div class="empty-state"><p>Chưa có ca nào</p></div>';
  var lastShift = currentShifts[currentShifts.length - 1]; // Lấy ca cuối
  
  var snap = lastShift.drinkInventorySnapshot;
  if (!snap || !snap.items) return `<div class="empty-state"><p>Không có dữ liệu kiểm kho cho ca cuối</p><div style="margin-top:12px;"><button class="btn btn-outline btn-sm" data-edit-inv-drinks="${lastShift.id}">Cập nhật kiểm kho</button></div></div>`;
  
  var rows = Object.keys(snap.items).map(id => {
    var it = snap.items[id]; if (!it) return '';
    return `<tr>
      <td>${it.name||id}</td>
      <td class="text-right">${it.start!=null?it.start:'—'}</td>
      <td class="text-right">${it.end!=null?it.end:'—'}</td>
      <td class="text-right">${it.sold!=null?it.sold:'—'}</td>
    </tr>`;
  }).join('');
  
  return `
    <div style="margin-bottom:12px;"><button class="btn btn-outline btn-sm" data-edit-inv-drinks="${lastShift.id}"><span class="material-symbols-rounded">edit</span> Sửa kiểm kho</button></div>
    <table class="report-table">
      <tr style="background:var(--bg-secondary);"><th>Sản phẩm</th><th class="text-right">Đầu</th><th class="text-right">Cuối</th><th class="text-right">Bán</th></tr>
      ${rows}
    </table>
  `;
}

function _tabPrint() {
  return `
    <div style="text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:12px;background:var(--bg-secondary);">
      <span class="material-symbols-rounded" style="font-size:48px;color:var(--primary);margin-bottom:16px;">print</span>
      <h3 style="margin-bottom:8px;">In phiếu bàn giao</h3>
      <p class="text-muted" style="margin-bottom:24px;">Bạn muốn in phiếu gộp chung cho toàn bộ ngày hay in tách rời từng ca?</p>
      
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary" id="btnPrintDay">
          <span class="material-symbols-rounded">receipt_long</span> In gộp toàn ngày
        </button>
        ${currentShifts.map(sh => `
          <button class="btn btn-outline" data-print-shift="${sh.id}">
            <span class="material-symbols-rounded">receipt</span> In Ca ${sh.shiftNumber}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ── BINDING EVENTS ──

function _reload() {
  _loadDayData();
}

function _bindTabEvents() {
  // Sync POS
  document.getElementById('btnSyncCukcuk')?.addEventListener('click', async function() {
    this.disabled=true; this.innerHTML='<span class="material-symbols-rounded spin">sync</span> Đang tải...';
    try {
      await syncInvoicesForDate(currentDate);
      // Because invoiceStore is updated, we just need to rebuild snapshots for shifts on this day
      currentShifts.forEach(sh => backfillHistoryInvoiceSnapshot(sh.id, getInvoicesByDate(currentDate)));
      showToast('Đã đồng bộ POS', 'success');
      _reload();
    } catch(e) {
      showToast(e.message, 'error');
      this.disabled=false; this.innerHTML='<span class="material-symbols-rounded">sync</span> Đồng bộ';
    }
  });
  
  // Edits
  document.querySelectorAll('[data-edit-tx]').forEach(b => b.addEventListener('click', () => {
    var sid = b.dataset.sid; var sh = currentShifts.find(s=>s.id===sid);
    var tx = (sh.transactions||[]).find(t=>t.id===b.dataset.editTx);
    if(tx) histEdit.showEditTxModal(sid, tx.type, tx, _reload);
  }));
  document.querySelectorAll('[data-del-tx]').forEach(b => b.addEventListener('click', async () => {
    if(await showConfirm('Xóa giao dịch?')) { removeHistoryTransaction(b.dataset.sid, b.dataset.delTx); _reload(); }
  }));
  document.querySelectorAll('[data-add-tx]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditTxModal(b.dataset.sid, b.dataset.addTx, null, _reload);
  }));
  document.querySelectorAll('[data-add-other]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditOtherTxModal(b.dataset.sid, _reload);
  }));
  document.querySelectorAll('[data-del-other]').forEach(b => b.addEventListener('click', async () => {
    if(await showConfirm('Xóa?')) { removeHistoryOtherTransaction(b.dataset.sid, b.dataset.delOther); _reload(); }
  }));
  document.querySelectorAll('[data-edit-note]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditNotesModal(currentShifts.find(s=>s.id===b.dataset.editNote), _reload);
  }));
  document.querySelectorAll('[data-edit-startcash]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditStartingCashModal(currentShifts.find(s=>s.id===b.dataset.editStartcash), _reload);
  }));
  document.querySelectorAll('[data-edit-cash]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditCashCountModal(currentShifts.find(s=>s.id===b.dataset.editCash), _reload);
  }));
  document.querySelectorAll('[data-edit-inv]').forEach(b => b.addEventListener('click', () => {
    var inv = currentInvoices.find(i=>i.refId===b.dataset.editInv);
    if(inv) histEdit.showEditDayInvoicePaymentModal(currentDate, inv, _reload);
  }));
  
  document.querySelectorAll('[data-edit-inv-drinks]').forEach(b => b.addEventListener('click', () => {
    histEdit.showEditDrinkInventoryModal(currentShifts.find(s=>s.id===b.dataset.editInvDrinks), _reload);
  }));
  
  // Print routing
  document.getElementById('btnPrintDay')?.addEventListener('click', () => {
    window._setReportDate = () => currentDate; // Tell report.js to use this date for a day report
    window._setReportShiftId = null;
    window.navigateTo('report');
  });
  document.querySelectorAll('[data-print-shift]').forEach(b => b.addEventListener('click', () => {
    window._setReportDate = () => currentDate;
    window._setReportShiftId = () => b.dataset.printShift; // specific shift
    window.navigateTo('report');
  }));
}

// ── INIT & MAIN BINDINGS ──

export function init() {
  document.getElementById('btnPrevDay')?.addEventListener('click', () => {
    var d = new Date(currentDate); d.setDate(d.getDate() - 1);
    currentDate = d.toISOString().split('T')[0];
    document.getElementById('historyDate').value = currentDate;
    _loadDayData();
  });
  document.getElementById('btnNextDay')?.addEventListener('click', () => {
    var d = new Date(currentDate); d.setDate(d.getDate() + 1);
    currentDate = d.toISOString().split('T')[0];
    document.getElementById('historyDate').value = currentDate;
    _loadDayData();
  });
  document.getElementById('btnToday')?.addEventListener('click', () => {
    var today = new Date(); if(today.getHours()<6) today.setDate(today.getDate()-1);
    currentDate = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    document.getElementById('historyDate').value = currentDate;
    _loadDayData();
  });
  document.getElementById('historyDate')?.addEventListener('change', (e) => {
    if (e.target.value) { currentDate = e.target.value; _loadDayData(); }
  });
  
  document.getElementById('histTabBar')?.addEventListener('click', (e) => {
    var btn = e.target.closest('.hist-tab');
    if (btn && btn.dataset.htab) {
      document.querySelectorAll('.hist-tab').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      currentTab = btn.dataset.htab;
      _renderTabContent();
    }
  });
  
  // Cloud Sync
  document.getElementById('btnSyncHistory')?.addEventListener('click', async () => {
    showToast('Đang đồng bộ...', 'info');
    const result = await getShiftsFromCloud();
    if (result.success && result.shifts) {
      showToast('Đã tải lịch sử từ Cloud. Hãy tải lại trang nếu cần.', 'success');
      _loadDayData();
    } else {
      showToast('Lỗi tải Cloud: ' + (result.message||''), 'error');
    }
  });

  // Export CSV
  document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    var mode = confirm('Nhấn OK để xuất theo NGÀY (Gộp chung từng ngày)nNhấn Cancel để xuất theo CA (Chi tiết từng ca)');
    var all = getShiftHistory();
    if (all.length === 0) { showToast('Không có dữ liệu', 'warning'); return; }
    
    let csv = '';
    if (mode) {
      csv = 'Ngày,Số ca đóng,Doanh thu CUKCUK,Doanh thu TM,Chi phí,Chênh lệchn';
      // Group by date
      var byDate = {};
      all.forEach(sh => {
        if (!byDate[sh.date]) byDate[sh.date] = { count:0, rev:0, cash:0, exp:0, disc:0 };
        var sm = getHistorySummary(sh);
        byDate[sh.date].count++;
        byDate[sh.date].rev += sm.cukcukRevenue||0;
        byDate[sh.date].cash += sm.cashIncome||0;
        byDate[sh.date].exp += sm.totalExpense||0;
        byDate[sh.date].disc += sm.discrepancy||0;
      });
      Object.keys(byDate).sort().reverse().forEach(d => {
        var v = byDate[d];
        csv += '"' + d + '",' + v.count + ',' + v.rev + ',' + v.cash + ',' + v.exp + ',' + v.disc + 'n';
      });
    } else {
      csv = 'Ngày,Ca,Thu ngân,Doanh thu,Chi phí,Bills,Chênh lệch,Ghi chún';
      all.forEach(sh => {
        var sm = getHistorySummary(sh);
        csv += '"' + sh.date + '","' + sh.shiftNumber + '","' + (sh.cashierName || '').replace(/"/g, '""') + '",' + sm.totalIncome + ',' + sm.totalExpense + ',' + sm.billCount + ',' + sm.discrepancy + ',"' + (sh.notes || '').replace(/"/g, '""') + '"n';
      });
    }
    
    const blob = new Blob(['ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const blobUrl = URL.createObjectURL(blob);
    a.href = blobUrl;
    a.download = 'shift-history-' + (mode ? 'day' : 'shift') + '-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(blobUrl);
  });

  _loadDayData();
}
