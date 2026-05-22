/* ── History Edit Module — Edit transactions/cashCount on closed shifts ── */
import { addHistoryTransaction, editHistoryTransaction, removeHistoryTransaction, addHistoryOtherTransaction, removeHistoryOtherTransaction, updateHistoryCashCount, updateHistoryShiftField, editHistoryInvoicePayment, getCategories, getSettings, getHistorySummary } from '../store.js';
import { formatCurrency, formatTime, showToast, showModal, hideModal, showConfirm, denominations, moneyInput } from '../utils.js';

/** Show modal to add/edit a transaction on a history shift */
export function showEditTxModal(shiftId, type, editTx, onDone) {
  var isEdit = !!editTx;
  var cats = getCategories();
  var catList = type === 'income' ? cats.income : cats.expense;
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:'+(type==='income'?'var(--success)':'var(--danger)')+';">'+(isEdit?'edit':'add_circle')+'</span> '+(isEdit?'Sửa':'Thêm')+' giao dịch (lịch sử)</div>'+
    '<div class="form-group"><label class="form-label">Danh mục</label><select id="heTxCat" class="form-input">'+catList.map(function(c){return '<option value="'+c+'"'+(isEdit&&editTx.category===c?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Số tiền</label><input type="text" id="heTxAmt" class="form-input" value="'+(isEdit?editTx.amount:'')+'" autocomplete="off"></div>'+
    '<div class="form-group"><label class="form-label">PTTT</label><select id="heTxPay" class="form-input"><option value="cash"'+(isEdit&&editTx.paymentMethod==='cash'?' selected':'')+'>💵 Mặt</option><option value="card"'+(isEdit&&editTx.paymentMethod==='card'?' selected':'')+'>💳 Thẻ</option><option value="transfer"'+(isEdit&&editTx.paymentMethod==='transfer'?' selected':'')+'>🏦 CK</option></select></div></div>'+
    '<div class="form-group"><label class="form-label">Ghi chú</label><input type="text" id="heTxNote" class="form-input" value="'+(isEdit?(editTx.note||''):'')+'"></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn '+(type==='income'?'btn-success':'btn-danger')+'" id="heTxSave">Lưu</button></div>');
  setTimeout(function(){
    var amtEl=document.getElementById('heTxAmt');
    var mi=moneyInput(amtEl,{allowMath:true});
    if(!isEdit&&amtEl)amtEl.focus();
    var btn=document.getElementById('heTxSave');
    if(btn)btn.addEventListener('click',function(){
      var amt=mi.getValue();
      if(!amt||amt<=0){showToast('Nhập số tiền','warning');return;}
      try{
        if(isEdit){editHistoryTransaction(shiftId,editTx.id,{category:document.getElementById('heTxCat').value,amount:amt,paymentMethod:document.getElementById('heTxPay').value,note:document.getElementById('heTxNote').value});}
        else{addHistoryTransaction(shiftId,{type:type,category:document.getElementById('heTxCat').value,amount:amt,paymentMethod:document.getElementById('heTxPay').value,note:document.getElementById('heTxNote').value});}
        hideModal();showToast('✅ Đã lưu','success');if(onDone)onDone();
      }catch(e){showToast(e.message,'error');}
    });
  },100);
}

/** Show modal to add other transaction on history shift */
export function showEditOtherTxModal(shiftId, onDone) {
  showModal('<div class="modal-title"><span class="material-symbols-rounded">note_add</span> Thu chi khác (lịch sử)</div>'+
    '<div class="form-row"><div class="form-group"><label class="form-label">Loại</label><select id="heOType" class="form-input"><option value="income">Thu</option><option value="expense">Chi</option></select></div>'+
    '<div class="form-group"><label class="form-label">Số tiền</label><input type="number" id="heOAmt" class="form-input" placeholder="0"></div></div>'+
    '<div class="form-group"><label class="form-label">Danh mục</label><input type="text" id="heOCat" class="form-input" placeholder="VD: Tip..."></div>'+
    '<div class="form-group"><label class="form-label">Ghi chú</label><input type="text" id="heONote" class="form-input"></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heOSave">Lưu</button></div>');
  setTimeout(function(){
    document.getElementById('heOSave')?.addEventListener('click',function(){
      var amt=Number(document.getElementById('heOAmt').value);
      if(!amt||amt<=0){showToast('Nhập số tiền','warning');return;}
      try{
        addHistoryOtherTransaction(shiftId,{type:document.getElementById('heOType').value,category:document.getElementById('heOCat').value||'Khác',amount:amt,note:document.getElementById('heONote').value});
        hideModal();showToast('✅ Đã lưu','success');if(onDone)onDone();
      }catch(e){showToast(e.message,'error');}
    });
  },100);
}

/** Show cash count edit modal for a history shift */
export function showEditCashCountModal(shift, onDone) {
  var cc=shift.cashCount||{};var pc=shift.pinnedCash||{};var kc=shift.keepCash||{};var hc=shift.handoverCash||{};
  var rows=denominations.map(function(d){
    var pin=pc[d.value]||0,keep=kc[d.value]||0,hand=hc[d.value]||0;
    return '<tr><td style="font-weight:600;">'+d.label+'</td>'+
      '<td><input type="number" class="form-input heCc" data-he-type="pin" data-he-d="'+d.value+'" value="'+pin+'" min="0" style="width:60px;text-align:center;padding:4px;"></td>'+
      '<td><input type="number" class="form-input heCc" data-he-type="keep" data-he-d="'+d.value+'" value="'+keep+'" min="0" style="width:60px;text-align:center;padding:4px;"></td>'+
      '<td><input type="number" class="form-input heCc" data-he-type="hand" data-he-d="'+d.value+'" value="'+hand+'" min="0" style="width:60px;text-align:center;padding:4px;"></td></tr>';
  }).join('');
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--warning);">calculate</span> Chỉnh sửa kiểm kê tiền (lịch sử)</div>'+
    '<div style="max-height:55vh;overflow:auto;"><table class="report-table"><thead><tr style="background:var(--bg-secondary);"><th>Mệnh giá</th><th>📌Ghim</th><th>🔒Giữ</th><th>🤝Giao</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heCcSave"><span class="material-symbols-rounded">save</span> Lưu kiểm kê</button></div>');
  setTimeout(function(){
    document.getElementById('heCcSave')?.addEventListener('click',function(){
      var pins={},keeps={},hands={},counts={};
      document.querySelectorAll('.heCc').forEach(function(inp){
        var d=inp.dataset.heD,t=inp.dataset.heType,v=parseInt(inp.value)||0;
        if(t==='pin'&&v>0)pins[d]=v;
        if(t==='keep'&&v>0)keeps[d]=v;
        if(t==='hand'&&v>0)hands[d]=v;
        var total=(pins[d]||0)+(keeps[d]||0)+(hands[d]||0);
        if(total>0)counts[d]=total;
      });
      try{
        updateHistoryCashCount(shift.id,counts,pins,keeps,hands);
        hideModal();showToast('✅ Đã lưu kiểm kê','success');if(onDone)onDone();
      }catch(e){showToast(e.message,'error');}
    });
  },100);
}

/** Show starting cash edit modal */
export function showEditStartingCashModal(shift, onDone) {
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--warning);">account_balance_wallet</span> Sửa tiền đầu ca (lịch sử)</div>'+
    '<p class="text-muted">Hiện tại: <strong>'+formatCurrency(shift.startingCash)+'</strong></p>'+
    '<div class="form-group"><label class="form-label">Số tiền mới</label><input type="text" id="heStartCash" class="form-input" value="'+shift.startingCash+'" style="font-size:18px;font-weight:700;text-align:right;" autocomplete="off"></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heStartSave">Cập nhật</button></div>');
  setTimeout(function(){
    var inp=document.getElementById('heStartCash');
    var mi=moneyInput(inp,{allowMath:true});
    inp?.focus();inp?.select();
    document.getElementById('heStartSave')?.addEventListener('click',function(){
      try{
        updateHistoryShiftField(shift.id,'startingCash',mi.getValue());
        hideModal();showToast('✅ Đã cập nhật','success');if(onDone)onDone();
      }catch(e){showToast(e.message,'error');}
    });
  },100);
}

/** Show notes edit modal */
export function showEditNotesModal(shift, onDone) {
  showModal('<div class="modal-title"><span class="material-symbols-rounded">edit_note</span> Sửa ghi chú ca (lịch sử)</div>'+
    '<div class="form-group"><textarea id="heNotes" class="form-input" rows="4" placeholder="Ghi chú...">'+(shift.notes||'')+'</textarea></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heNoteSave">Lưu</button></div>');
  setTimeout(function(){
    document.getElementById('heNoteSave')?.addEventListener('click',function(){
      try{
        updateHistoryShiftField(shift.id,'notes',document.getElementById('heNotes').value);
        hideModal();showToast('✅ Đã lưu ghi chú','success');if(onDone)onDone();
      }catch(e){showToast(e.message,'error');}
    });
  },100);
}

/** Show modal to edit payment method on a POS invoice */
export function showEditInvoicePaymentModal(shiftId, inv, onDone) {
  var fc = formatCurrency;
  var payments = inv.payments || [];
  var totalAmt = 0;
  payments.forEach(function(p){ totalAmt += p.amount || 0; });
  if (!totalAmt) totalAmt = inv.amount || 0;
  var payRows = payments.length > 0 ? payments.map(function(p, idx) {
    return '<tr><td><select class="form-input heInvPay" data-idx="'+idx+'" style="padding:4px 8px;"><option value="cash"'+(p.method==='cash'?' selected':'')+'>💵 TM</option><option value="card"'+(p.method==='card'?' selected':'')+'>💳 Thẻ</option><option value="transfer"'+(p.method==='transfer'?' selected':'')+'>🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="'+idx+'" value="'+(p.amount||0)+'" style="width:120px;text-align:right;padding:4px 8px;"></td></tr>';
  }).join('') : '<tr><td><select class="form-input heInvPay" data-idx="0" style="padding:4px 8px;"><option value="cash">💵 TM</option><option value="card">💳 Thẻ</option><option value="transfer">🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="0" value="'+totalAmt+'" style="width:120px;text-align:right;padding:4px 8px;"></td></tr>';
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--primary);">credit_card</span> Sửa PTTT — Bill '+(inv.refNo||'?')+'</div>'+
    '<p style="margin-bottom:8px;"><strong>Bàn:</strong> '+(inv.tableName||'—')+' — <strong>Tổng:</strong> '+fc(totalAmt)+'</p>'+
    '<table class="report-table"><thead><tr style="background:var(--bg-secondary);"><th>Hình thức TT</th><th class="text-right">Số tiền</th></tr></thead><tbody id="heInvTbody">'+payRows+'</tbody></table>'+
    '<div style="margin-top:8px;"><button class="btn btn-outline btn-sm" id="heInvAddPay"><span class="material-symbols-rounded">add</span> Thêm dòng</button></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heInvSave"><span class="material-symbols-rounded">save</span> Lưu</button></div>');
  setTimeout(function(){
    var tbody=document.getElementById('heInvTbody');
    document.getElementById('heInvAddPay')?.addEventListener('click',function(){
      if(!tbody)return;var idx=tbody.querySelectorAll('tr').length;
      var tr=document.createElement('tr');
      tr.innerHTML='<td><select class="form-input heInvPay" data-idx="'+idx+'" style="padding:4px 8px;"><option value="cash">💵 TM</option><option value="card">💳 Thẻ</option><option value="transfer">🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="'+idx+'" value="0" style="width:120px;text-align:right;padding:4px 8px;"></td>';
      tbody.appendChild(tr);
    });
    document.getElementById('heInvSave')?.addEventListener('click',async function(){
      var np=[];
      document.querySelectorAll('.heInvPay').forEach(function(sel){
        var idx=sel.dataset.idx;
        var amtEl=document.querySelector('.heInvAmt[data-idx="'+idx+'"]');
        var amt=amtEl?Number(amtEl.value)||0:0;
        if(amt>0)np.push({method:sel.value,amount:amt});
      });
      if(np.length===0){showToast('Cần ít nhất 1 dòng thanh toán','warning');return;}
      try{await editHistoryInvoicePayment(shiftId,inv.refId,np);hideModal();showToast('✅ Đã cập nhật PTTT','success');if(onDone)onDone();}
      catch(e){showToast(e.message,'error');}
    });
  },100);
}

export function showEditDayInvoicePaymentModal(dateStr, inv, onDone) {
  var fc = formatCurrency;
  var payments = inv.payments || [];
  var totalAmt = 0;
  payments.forEach(function(p){ totalAmt += p.amount || 0; });
  if (!totalAmt) totalAmt = inv.amount || 0;
  var payRows = payments.length > 0 ? payments.map(function(p, idx) {
    return '<tr><td><select class="form-input heInvPay" data-idx="'+idx+'" style="padding:4px 8px;"><option value="cash"'+(p.method==='cash'?' selected':'')+'>💵 TM</option><option value="card"'+(p.method==='card'?' selected':'')+'>💳 Thẻ</option><option value="transfer"'+(p.method==='transfer'?' selected':'')+'>🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="'+idx+'" value="'+(p.amount||0)+'" style="width:120px;text-align:right;padding:4px 8px;"></td></tr>';
  }).join('') : '<tr><td><select class="form-input heInvPay" data-idx="0" style="padding:4px 8px;"><option value="cash">💵 TM</option><option value="card">💳 Thẻ</option><option value="transfer">🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="0" value="'+totalAmt+'" style="width:120px;text-align:right;padding:4px 8px;"></td></tr>';
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--primary);">credit_card</span> Sửa PTTT (Ngày) — Bill '+(inv.refNo||'?')+'</div>'+
    '<p style="margin-bottom:8px;"><strong>Bàn:</strong> '+(inv.tableName||'—')+' — <strong>Tổng:</strong> '+fc(totalAmt)+'</p>'+
    '<table class="report-table"><thead><tr style="background:var(--bg-secondary);"><th>Hình thức TT</th><th class="text-right">Số tiền</th></tr></thead><tbody id="heInvTbody">'+payRows+'</tbody></table>'+
    '<div style="margin-top:8px;"><button class="btn btn-outline btn-sm" id="heInvAddPay"><span class="material-symbols-rounded">add</span> Thêm dòng</button></div>'+
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heInvSave"><span class="material-symbols-rounded">save</span> Lưu</button></div>');
  setTimeout(function(){
    var tbody=document.getElementById('heInvTbody');
    document.getElementById('heInvAddPay')?.addEventListener('click',function(){
      if(!tbody)return;var idx=tbody.querySelectorAll('tr').length;
      var tr=document.createElement('tr');
      tr.innerHTML='<td><select class="form-input heInvPay" data-idx="'+idx+'" style="padding:4px 8px;"><option value="cash">💵 TM</option><option value="card">💳 Thẻ</option><option value="transfer">🏦 CK</option></select></td><td class="text-right"><input type="number" class="form-input heInvAmt" data-idx="'+idx+'" value="0" style="width:120px;text-align:right;padding:4px 8px;"></td>';
      tbody.appendChild(tr);
    });
    document.getElementById('heInvSave')?.addEventListener('click',function(){
      var np=[];
      document.querySelectorAll('.heInvPay').forEach(function(sel){
        var idx=sel.dataset.idx;
        var amtEl=document.querySelector('.heInvAmt[data-idx="'+idx+'"]');
        var amt=amtEl?Number(amtEl.value)||0:0;
        if(amt>0)np.push({method:sel.value,amount:amt});
      });
      if(np.length===0){showToast('Cần ít nhất 1 dòng thanh toán','warning');return;}
      try{
        import('../integration/invoiceStore.js').then(module => {
          module.editInvoicePayment(inv.refId, np);
          window.hideModal();
          showToast('✅ Đã cập nhật PTTT', 'success');
          if(onDone) onDone();
        });
      }
      catch(e){showToast(e.message,'error');}
    });
  },100);
}

export function showEditDrinkInventoryModal(shift, onDone) {
  var dData = shift.drinksData || {};
  var html = '<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--primary);">inventory_2</span> Sửa kiểm kho nước — Ca '+(shift.shiftNumber||1)+'</div><div class="table-container" style="max-height:60vh;overflow-y:auto;"><table class="report-table"><thead><tr><th>Tên nhóm/Món</th><th class="text-center" style="width:60px;">TồnĐ</th><th class="text-center" style="width:60px;">Nhập</th><th class="text-center" style="width:60px;">Bán</th><th class="text-center" style="width:60px;">TồnC(T)</th><th class="text-center" style="width:70px;">ThựcTế</th></tr></thead><tbody id="heDrinksTbody">';
  
  window._kgMenu?.forEach(cat => {
    var hasDrinks = cat.items.some(i => i.isDrink);
    if (!hasDrinks) return;
    html += '<tr style="background:var(--bg-secondary);font-weight:600;"><td colspan="6">'+cat.name+'</td></tr>';
    cat.items.forEach(item => {
      if (!item.isDrink) return;
      var d = dData[item.id] || { open:0, import:0, sold:0, expected:0, actual:0 };
      html += '<tr>'+
        '<td>'+item.name+'</td>'+
        '<td class="text-center">'+d.open+'</td>'+
        '<td class="text-center">'+d.import+'</td>'+
        '<td class="text-center">'+d.sold+'</td>'+
        '<td class="text-center" style="color:var(--primary);font-weight:500;">'+d.expected+'</td>'+
        '<td class="text-center"><input type="number" class="form-input heDrinkActual" data-id="'+item.id+'" value="'+(d.actual||0)+'" style="width:60px;text-align:center;padding:4px;"></td>'+
      '</tr>';
    });
  });
  html += '</tbody></table></div><div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button><button class="btn btn-primary" id="heDrinksSave"><span class="material-symbols-rounded">save</span> Lưu kiểm kho</button></div>';
  showModal(html);

  setTimeout(function(){
    document.getElementById('heDrinksSave')?.addEventListener('click', function(){
      var updates = {};
      document.querySelectorAll('.heDrinkActual').forEach(function(inp){
        updates[inp.dataset.id] = parseInt(inp.value, 10) || 0;
      });
      try {
        import('../store.js').then(module => {
          module.updateHistoryDrinkInventory(shift.id, updates);
          window.hideModal();
          showToast('✅ Đã cập nhật kiểm kho', 'success');
          if(onDone) onDone();
        });
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }, 100);
}
