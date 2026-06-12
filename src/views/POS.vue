<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useShiftStore } from '../stores/shift';
import { useSettingsStore } from '../stores/settings';
import { getPosOrdersFromCloud, syncPosOrdersWithCloud } from '../services/api';
import { showToast, getWorkingDay } from '../utils';

// Core stores
const shiftStore = useShiftStore();
const settingsStore = useSettingsStore();

// Default POS product Catalog
const DEFAULT_CATALOG = [
  { id:'f1',  name:'Bò nướng', category:'Nướng', price:89000,  type:'food',  emoji:'🥩' },
  { id:'f2',  name:'Hải sản nướng', category:'Nướng', price:129000, type:'food', emoji:'🦐' },
  { id:'f3',  name:'Rau nướng', category:'Nướng', price:35000, type:'food',  emoji:'🥬' },
  { id:'f4',  name:'Lẩu thái', category:'Lẩu', price:159000, type:'food',   emoji:'🍲' },
  { id:'f5',  name:'Lẩu hải sản', category:'Lẩu', price:189000, type:'food', emoji:'🦞' },
  { id:'f6',  name:'Cơm trắng', category:'Cơm', price:10000,  type:'food',  emoji:'🍚' },
  { id:'f7',  name:'Mì xào', category:'Cơm', price:35000,     type:'food',  emoji:'🍜' },
  { id:'d1',  name:'Heineken 330ml', category:'Bia', price:30000, type:'drink', emoji:'🍺' },
  { id:'d2',  name:'Tiger Bạc', category:'Bia', price:28000,   type:'drink', emoji:'🍺' },
  { id:'d3',  name:'Corona', category:'Bia', price:45000,      type:'drink', emoji:'🍺' },
  { id:'d4',  name:'Coca Cola', category:'Nước ngọt', price:15000, type:'drink', emoji:'🥤' },
  { id:'d5',  name:'Pepsi', category:'Nước ngọt', price:15000, type:'drink', emoji:'🥤' },
  { id:'d6',  name:'Nước suối', category:'Nước suối', price:10000, type:'drink', emoji:'💧' },
  { id:'d7',  name:'Soju', category:'Rượu', price:89000,       type:'drink', emoji:'🍶' },
  { id:'d8',  name:'Redbull', category:'Nước tăng lực', price:25000, type:'drink', emoji:'⚡' },
];

const SASHIMI_CATEGORIES = ['Sashimi', 'Gỏi', 'Salad', 'Nướng'];
const SASHIMI_EXCEPTIONS = ['Bò nướng sốt trứng muối'];

// State
const screen = ref<'tables' | 'order'>('tables'); // 'tables' or 'order'
const activeTableId = ref<string | null>(null);
const activeCatFilter = ref('Tất cả');
const searchQ = ref('');
const orders = ref<Record<string, any>>({});
const syncInterval = ref<any>(null);
const isSyncing = ref(false);

// Modal states
const activeModal = ref<string | null>(null); // 'cancel_item' | 'transfer_kitchen' | 'transfer_table' | 'merge_table' | 'catalog' | 'checkout'
const modalTargetItemId = ref<string | null>(null);
const cancelReason = ref('');
const transferDest = ref('kitchen');
const checkoutMethod = ref('cash');
const checkoutNote = ref('');

// Catalog editor states
const catalog = ref<any[]>([]);
const isCatalogEditMode = ref(false);
const catalogEditIndex = ref(-1);
const editProduct = ref({
  id: '',
  name: '',
  category: '',
  emoji: '🍽️',
  price: 0,
  type: 'food'
});

// Generated Vietnamese Tables Structure
const tables = computed(() => {
  if (settingsStore.settings?.posTables && settingsStore.settings.posTables.length > 0) {
    return settingsStore.settings.posTables;
  }
  const zones = [
    { prefix: 'A', label: 'Khu A', count: 25, seats: 4 },
    { prefix: 'B', label: 'Khu B', count: 10, seats: 4 },
    { prefix: 'C', label: 'Khu C', count: 20, seats: 4 },
    { prefix: 'D', label: 'Khu D', count: 10, seats: 6 },
    { prefix: 'E', label: 'Khu E', count: 10, seats: 6 },
  ];
  const list: any[] = [];
  zones.forEach(z => {
    for (let i = 1; i <= z.count; i++) {
      list.push({ id: z.prefix.toLowerCase() + i, name: z.prefix + i, zone: z.label, seats: z.seats });
    }
  });
  return list;
});

// Sync POS orders local vs cloud
async function syncPOSWithCloud() {
  if (isSyncing.value) return;
  isSyncing.value = true;
  try {
    const localOrders = { ...orders.value };
    const tablesList = tables.value;
    const ordersToSend: any[] = [];

    // Active local orders
    Object.keys(localOrders).forEach(tableId => {
      const o = localOrders[tableId];
      if (!o || !o.items || o.items.length === 0) return;
      const table = tablesList.find((t: any) => t.id === tableId) || { name: tableId };
      const total = o.items.reduce((s: number, i: any) => i.status === 'cancelled' ? s : s + i.price * i.qty, 0);

      ordersToSend.push({
        orderId: o.id || 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tableId: tableId,
        tableName: table.name,
        status: 'active',
        itemsJson: JSON.stringify(o.items),
        total: total,
        createdAt: o.createdAt || new Date().toISOString(),
        updatedAt: o.updatedAt || new Date().toISOString(),
        deviceId: localStorage.getItem('kg_device_id') || 'dev_unknown',
        sessionId: sessionStorage.getItem('kg_session_id') || 'sess_unknown',
        revision: o.revision || 1
      });
    });

    // Completed local sync queue
    const completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]');
    completedSyncs.forEach((o: any) => {
      ordersToSend.push({ ...o, status: 'completed', updatedAt: new Date().toISOString() });
    });

    const res = await syncPosOrdersWithCloud(ordersToSend);
    if (res && res.success && res.orders) {
      const updatedLocal: Record<string, any> = {};
      res.orders.forEach((co: any) => {
        if (co.status === 'active') {
          let items = [];
          try { items = JSON.parse(co.itemsJson || '[]'); } catch (e) {}
          updatedLocal[co.tableId] = {
            id: co.orderId,
            tableId: co.tableId,
            items: items,
            createdAt: co.createdAt,
            updatedAt: co.updatedAt,
            revision: Number(co.revision) || 1
          };
        }
      });
      orders.value = updatedLocal;
      localStorage.setItem('kg-pos-orders', JSON.stringify(updatedLocal));
      localStorage.setItem('kg-pos-completed-syncs', '[]');
    }
  } catch (e) {
    console.warn('[POS Sync] cloud synchronization failed:', e);
  } finally {
    isSyncing.value = false;
  }
}

function saveOrders(newOrders: any) {
  orders.value = newOrders;
  localStorage.setItem('kg-pos-orders', JSON.stringify(newOrders));
  syncPOSWithCloud();
}

// Helpers
function uid() { return 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function orderTotal(o: any) {
  if (!o || !o.items) return 0;
  return o.items.reduce((s: number, i: any) => i.status === 'cancelled' ? s : s + i.price * i.qty, 0);
}
function getKitchenDest(item: any) {
  if (item.type === 'drink') return 'bar';
  if (SASHIMI_EXCEPTIONS.includes(item.name)) return 'kitchen';
  if (SASHIMI_CATEGORIES.includes(item.category)) return 'sashimi';
  return 'kitchen';
}
function getKitchenDestLabel(dest: string) {
  if (dest === 'sashimi') return 'BẾP SASHIMI';
  if (dest === 'bar') return 'BAR';
  return 'BẾP';
}
function formatMoney(val: number) {
  return (val || 0).toLocaleString('vi-VN') + ' đ';
}

// Load configurations
function loadCatalog() {
  if (settingsStore.settings?.posCatalog && settingsStore.settings.posCatalog.length > 0) {
    catalog.value = settingsStore.settings.posCatalog;
  } else {
    catalog.value = [...DEFAULT_CATALOG];
  }
}

onMounted(async () => {
  loadCatalog();
  try {
    const raw = localStorage.getItem('kg-pos-orders');
    if (raw) orders.value = JSON.parse(raw);
  } catch (e) {}

  await syncPOSWithCloud();
  syncInterval.value = setInterval(syncPOSWithCloud, 10000);
});

onUnmounted(() => {
  if (syncInterval.value) {
    clearInterval(syncInterval.value);
  }
});

// Category list
const categories = computed(() => {
  const cats = ['Tất cả'];
  catalog.value.forEach(p => {
    if (!cats.includes(p.category)) cats.push(p.category);
  });
  return cats;
});

// Filtered products list
const filteredProducts = computed(() => {
  return catalog.value.filter(p => {
    const catOk = activeCatFilter.value === 'Tất cả' || p.category === activeCatFilter.value;
    const searchOk = !searchQ.value || p.name.toLowerCase().includes(searchQ.value.toLowerCase());
    return catOk && searchOk;
  });
});

// Current active table
const activeTable = computed(() => {
  return tables.value.find((t: any) => t.id === activeTableId.value);
});

// Current order for active table
const activeOrder = computed(() => {
  if (!activeTableId.value) return null;
  return orders.value[activeTableId.value] || { items: [] };
});

// Check print status
const hasUnprinted = computed(() => {
  if (!activeOrder.value) return false;
  return activeOrder.value.items.some((i: any) => !i.isPrinted && i.status !== 'cancelled');
});

// Open order view
function selectTable(tableId: string) {
  activeTableId.value = tableId;
  screen.value = 'order';
  activeCatFilter.value = 'Tất cả';
  searchQ.value = '';
}

// Cart modifications
function addProductToCart(product: any) {
  if (!activeTableId.value) return;
  const currentOrders = { ...orders.value };
  if (!currentOrders[activeTableId.value]) {
    currentOrders[activeTableId.value] = {
      id: uid(),
      tableId: activeTableId.value,
      items: [],
      createdAt: new Date().toISOString()
    };
  }
  const order = currentOrders[activeTableId.value];
  const existing = order.items.find((i: any) => i.productId === product.id && i.status !== 'cancelled');

  if (existing) {
    existing.qty++;
  } else {
    order.items.push({
      id: uid(),
      productId: product.id,
      name: product.name,
      price: product.price,
      emoji: product.emoji || '🍽️',
      type: product.type,
      category: product.category || '',
      qty: 1,
      note: '',
      isPrinted: false,
      printedAt: null,
      kitchenDest: null,
      status: 'pending'
    });
  }
  saveOrders(currentOrders);
}

function adjustQty(itemId: string, delta: number) {
  if (!activeTableId.value) return;
  const currentOrders = { ...orders.value };
  const order = currentOrders[activeTableId.value];
  if (!order) return;
  const item = order.items.find((i: any) => i.id === itemId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    order.items = order.items.filter((i: any) => i.id !== itemId);
  }
  saveOrders(currentOrders);
}

function removeDirect(itemId: string) {
  if (!activeTableId.value) return;
  const currentOrders = { ...orders.value };
  const order = currentOrders[activeTableId.value];
  if (!order) return;
  order.items = order.items.filter((i: any) => i.id !== itemId);
  saveOrders(currentOrders);
}

// Cooking Instructions trigger
function handleKitchenBell() {
  if (!activeTable.value || !activeOrder.value) return;
  const unprinted = activeOrder.value.items.filter((i: any) => !i.isPrinted);
  if (unprinted.length === 0) return;

  // Print tickets separately
  const groups: Record<string, any[]> = { kitchen: [], sashimi: [], bar: [] };
  unprinted.forEach((i: any) => {
    const dest = getKitchenDest(i);
    groups[dest].push(i);
  });

  if (groups.kitchen.length > 0) printKitchenTicket(activeTable.value, groups.kitchen, 'BẾP');
  if (groups.sashimi.length > 0) printKitchenTicket(activeTable.value, groups.sashimi, 'BẾP SASHIMI');
  if (groups.bar.length > 0) printKitchenTicket(activeTable.value, groups.bar, 'BAR');

  // Mark all printed
  const currentOrders = { ...orders.value };
  const order = currentOrders[activeTableId.value!];
  const now = new Date().toISOString();
  order.items.forEach((i: any) => {
    if (!i.isPrinted) {
      i.isPrinted = true;
      i.printedAt = now;
      i.kitchenDest = getKitchenDest(i);
      i.status = 'sent';
    }
  });
  saveOrders(currentOrders);
  showToast('Đã báo bếp/bar thành công', 'success');
}

function printKitchenTicket(table: any, items: any[], dest: string) {
  const now = new Date().toLocaleString('vi-VN');
  const rows = items.map(i => `<tr><td style="font-size:18px;padding:4px 0;font-weight:bold;">${i.qty} x ${i.name.toUpperCase()}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:"Courier New",monospace;width:80mm;padding:6px;}h2{text-align:center;border-bottom:3px solid #000;padding-bottom:4px;}table{width:100%;}hr{border-top:1px dashed #000;margin:4px 0;}</style></head><body>
    <h2>⚡ PHIẾU ${dest}</h2>
    <div><strong>${table.name}</strong></div>
    <div style="font-size:11px;">${now}</div><hr>
    <table>${rows}</table><hr>
    <div style="font-size:11px;text-align:center;">--- HẾT PHIẾU ---</div>
    <scr` + `ipt>window.onload=function(){window.print();window.close();}</scr` + `ipt></body></html>`;
  
  const w = window.open('', '_blank', 'width=380,height=500');
  if (w) { w.document.write(html); w.document.close(); }
}

// Temporary bill print
function handlePrintTempBill() {
  if (!activeTable.value || !activeOrder.value) return;
  printReceipt(activeTable.value, activeOrder.value, false);
}

function printReceipt(table: any, order: any, isFinal: boolean) {
  const total = orderTotal(order);
  const now = new Date().toLocaleString('vi-VN');
  const rows = order.items.map((i: any) => `<tr><td style="padding:2px 0;">${i.name}<br><small>${i.qty} × ${formatMoney(i.price)}</small></td><td style="text-align:right;">${formatMoney(i.qty * i.price)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4px;}h2{text-align:center;margin-bottom:2px;}hr{border:none;border-top:1px dashed #000;margin:4px 0;}table{width:100%;}.total{font-size:14px;font-weight:bold;text-align:right;}</style></head><body>
    <h2>KING's GRILL</h2>
    <div style="text-align:center;font-size:10px;">34 Hoàng Văn Thụ, Phú Nhuận</div><hr>
    <div><strong>${table.name}</strong> — ${isFinal ? 'HÓA ĐƠN THANH TOÁN' : 'PHIẾU TẠM TÍNH'}</div>
    <div style="font-size:10px;">${now}</div><hr>
    <table>${rows}</table><hr>
    <div class="total">TỔNG: ${formatMoney(total)}</div>
    ${isFinal ? '<hr><div style="text-align:center;font-size:10px;margin-top:4px;">Cảm ơn quý khách!<br>Hẹn gặp lại 🙏</div>' : ''}
    <scr` + `ipt>window.onload=function(){window.print();window.close();}</scr` + `ipt></body></html>`;
  
  const w = window.open('', '_blank', 'width=400,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// Cancel item modal
function triggerCancelItem(itemId: string) {
  modalTargetItemId.value = itemId;
  cancelReason.value = '';
  activeModal.value = 'cancel_item';
}

function confirmCancelItem() {
  if (!cancelReason.value.trim()) {
    showToast('Vui lòng nhập lý do hủy món', 'warning');
    return;
  }
  if (!activeTableId.value || !modalTargetItemId.value) return;

  const currentOrders = { ...orders.value };
  const order = currentOrders[activeTableId.value];
  const item = order.items.find((i: any) => i.id === modalTargetItemId.value);
  if (item) {
    item.status = 'cancelled';
    item.cancelReason = cancelReason.value;
    item.cancelledAt = new Date().toISOString();
    saveOrders(currentOrders);
    
    // Print cancel notice to kitchen
    const dest = getKitchenDestLabel(item.kitchenDest || 'kitchen');
    printCancelTicket(activeTable.value, item, dest, cancelReason.value);
    showToast(`Đã hủy món ${item.name}`, 'info');
  }
  activeModal.value = null;
}

function printCancelTicket(table: any, item: any, dest: string, reason: string) {
  const now = new Date().toLocaleString('vi-VN');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:"Courier New",monospace;width:80mm;padding:6px;}h2{text-align:center;border-bottom:3px solid #000;padding-bottom:4px;}</style></head><body>
    <h2>❌ HỦY MÓN</h2>
    <div><strong>${table.name}</strong> → ${dest}</div>
    <div style="font-size:11px;">${now}</div><hr style="border-top:1px dashed #000;margin:4px 0;">
    <div style="font-size:20px;font-weight:bold;text-decoration:line-through;">${item.qty} x ${item.name.toUpperCase()}</div>
    <div>Lý do: ${reason}</div><hr style="border-top:1px dashed #000;margin:4px 0;">
    <scr` + `ipt>window.onload=function(){window.print();window.close();}</scr` + `ipt></body></html>`;
  const w = window.open('', '_blank', 'width=380,height=400');
  if (w) { w.document.write(html); w.document.close(); }
}

// Transfer table
function triggerTransferTable() {
  activeModal.value = 'transfer_table';
}

function confirmTransferTable(targetId: string) {
  if (!activeTableId.value) return;
  const currentOrders = { ...orders.value };
  const order = currentOrders[activeTableId.value];
  if (!order) return;

  const targetTableObj = tables.value.find(t => t.id === targetId);
  const fromTableObj = activeTable.value;

  // Print notice to kitchen
  const printedDests: Record<string, boolean> = {};
  order.items.forEach((i: any) => {
    if (i.isPrinted && i.kitchenDest && i.status !== 'cancelled') {
      printedDests[i.kitchenDest] = true;
    }
  });

  Object.keys(printedDests).forEach(dest => {
    printTransferNotice(fromTableObj, targetTableObj, getKitchenDestLabel(dest));
  });

  // Transfer logic
  if (currentOrders[targetId]) {
    currentOrders[targetId].items = currentOrders[targetId].items.concat(order.items);
  } else {
    currentOrders[targetId] = {
      id: order.id,
      tableId: targetId,
      items: order.items,
      createdAt: order.createdAt
    };
  }

  // Backup completed queue for Cloud
  const completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]');
  completedSyncs.push({
    orderId: order.id,
    tableId: activeTableId.value,
    tableName: fromTableObj.name,
    itemsJson: JSON.stringify(order.items),
    total: orderTotal(order),
    createdAt: order.createdAt
  });
  localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

  delete currentOrders[activeTableId.value];
  saveOrders(currentOrders);

  showToast(`Đã chuyển bàn ${fromTableObj.name} sang ${targetTableObj.name}`, 'success');
  activeTableId.value = targetId;
  activeModal.value = null;
}

function printTransferNotice(fromTable: any, toTable: any, dest: string) {
  const now = new Date().toLocaleString('vi-VN');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:"Courier New",monospace;width:80mm;padding:6px;}h2{text-align:center;border-bottom:3px solid #000;}</style></head><body>
    <h2>🔄 CHUYỂN BÀN</h2>
    <div style="font-size:11px;">${now} → ${dest}</div><hr style="border-top:1px dashed #000;margin:4px 0;">
    <div style="font-size:22px;font-weight:bold;text-align:center;padding:12px 0;">${fromTable.name} → ${toTable.name}</div><hr style="border-top:1px dashed #000;margin:4px 0;">
    <div style="font-size:11px;text-align:center;">Mang đồ sang bàn mới!</div>
    <scr` + `ipt>window.onload=function(){window.print();window.close();}</scr` + `ipt></body></html>`;
  const w = window.open('', '_blank', 'width=380,height=400');
  if (w) { w.document.write(html); w.document.close(); }
}

// Merge table
function triggerMergeTable() {
  activeModal.value = 'merge_table';
}

function confirmMergeTable(sourceId: string) {
  if (!activeTableId.value) return;
  const currentOrders = { ...orders.value };
  const targetOrder = currentOrders[activeTableId.value];
  const sourceOrder = currentOrders[sourceId];
  if (!targetOrder || !sourceOrder) return;

  const targetTableObj = activeTable.value;
  const sourceTableObj = tables.value.find(t => t.id === sourceId);

  // Notify kitchen print
  const printedDests: Record<string, boolean> = {};
  sourceOrder.items.forEach((i: any) => {
    if (i.isPrinted && i.kitchenDest && i.status !== 'cancelled') {
      printedDests[i.kitchenDest] = true;
    }
  });

  Object.keys(printedDests).forEach(dest => {
    printTransferNotice(sourceTableObj, targetTableObj, getKitchenDestLabel(dest));
  });

  // Merge items
  targetOrder.items = targetOrder.items.concat(sourceOrder.items);

  // Archive source order
  const completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]');
  completedSyncs.push({
    orderId: sourceOrder.id,
    tableId: sourceId,
    tableName: sourceTableObj.name,
    itemsJson: JSON.stringify(sourceOrder.items),
    total: orderTotal(sourceOrder),
    createdAt: sourceOrder.createdAt
  });
  localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

  delete currentOrders[sourceId];
  saveOrders(currentOrders);

  showToast(`Đã ghép bàn ${sourceTableObj.name} vào ${targetTableObj.name}`, 'success');
  activeModal.value = null;
}

// Checkout flow
function triggerCheckout() {
  checkoutMethod.value = 'cash';
  checkoutNote.value = '';
  activeModal.value = 'checkout';
}

function confirmCheckout() {
  if (!shiftStore.currentShift) {
    showToast('Chưa mở ca! Hãy mở ca trước khi thanh toán.', 'warning');
    return;
  }
  if (!activeTable.value || !activeOrder.value) return;

  const total = orderTotal(activeOrder.value);
  const itemsText = activeOrder.value.items.map((i: any) => `${i.qty}x ${i.name}`).join(', ');

  try {
    shiftStore.addTransaction({
      type: 'income',
      category: 'POS — ' + activeTable.value.name,
      amount: total,
      paymentMethod: checkoutMethod.value as 'cash' | 'card' | 'transfer',
      note: checkoutNote.value || itemsText
    });

    // Cloud record
    const completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]');
    completedSyncs.push({
      orderId: activeOrder.value.id,
      tableId: activeTableId.value,
      tableName: activeTable.value.name,
      itemsJson: JSON.stringify(activeOrder.value.items),
      total: total,
      createdAt: activeOrder.value.createdAt
    });
    localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

    // Print final receipt
    printReceipt(activeTable.value, activeOrder.value, true);

    const currentOrders = { ...orders.value };
    delete currentOrders[activeTableId.value!];
    saveOrders(currentOrders);

    showToast(`Đã thanh toán hóa đơn ${activeTable.value.name}`, 'success');
    activeModal.value = null;
    screen.value = 'tables';
    activeTableId.value = null;
  } catch (e: any) {
    showToast(e.message || 'Lỗi thanh toán', 'error');
  }
}

// VietQR image helper
const vietQrUrl = computed(() => {
  if (!activeTable.value || !activeOrder.value) return '';
  const ext = settingsStore.settings?.extension;
  const qrConfig = ext?.lastSelectedQr || ext?.qrTemplates?.[0];
  if (!qrConfig || !qrConfig.bank || !qrConfig.acc) return '';

  const total = orderTotal(activeOrder.value);
  const content = 'KG POS Ban ' + activeTable.value.name;
  return `https://img.vietqr.io/image/${qrConfig.bank}-${qrConfig.acc}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(qrConfig.name || '')}`;
});

// Menu manager dialog actions
function triggerCatalogMgr() {
  loadCatalog();
  activeModal.value = 'catalog';
  isCatalogEditMode.value = false;
}

function startEditProduct(index: number) {
  catalogEditIndex.value = index;
  const prod = catalog.value[index];
  editProduct.value = { ...prod };
  isCatalogEditMode.value = true;
}

function startAddProduct() {
  catalogEditIndex.value = -1;
  editProduct.value = {
    id: uid(),
    name: '',
    category: '',
    emoji: '🍽️',
    price: 0,
    type: 'food'
  };
  isCatalogEditMode.value = true;
}

function deleteProduct(index: number) {
  if (confirm('Bạn có chắc chắn muốn xóa món này khỏi Menu?')) {
    catalog.value.splice(index, 1);
    settingsStore.settings.posCatalog = [...catalog.value];
    settingsStore.updateSettings(settingsStore.settings);
    showToast('Đã xóa món ăn', 'info');
  }
}

function saveProduct() {
  if (!editProduct.value.name.trim()) {
    showToast('Nhập tên món ăn', 'warning');
    return;
  }
  const targetCatalog = [...catalog.value];
  if (catalogEditIndex.value === -1) {
    targetCatalog.push({ ...editProduct.value });
  } else {
    targetCatalog[catalogEditIndex.value] = { ...editProduct.value };
  }

  catalog.value = targetCatalog;
  settingsStore.settings.posCatalog = targetCatalog;
  settingsStore.updateSettings(settingsStore.settings);

  showToast('Đã cập nhật Menu', 'success');
  isCatalogEditMode.value = false;
}
</script>

<template>
  <div class="view-content p-6">

    <!-- 1. TABLE MAP VIEW -->
    <div v-if="screen === 'tables'" class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl border border-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <span class="material-symbols-rounded">point_of_sale</span>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-800">Sơ đồ bàn phục vụ</h3>
            <p class="text-xs text-slate-500">
              {{ Object.keys(orders).filter(k => orderTotal(orders[k]) > 0).length }} bàn có khách / {{ tables.length }} tổng bàn
            </p>
          </div>
        </div>
        <button 
          class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          :disabled="isSyncing"
          @click="syncPOSWithCloud"
        >
          <span class="material-symbols-rounded text-sm" :class="{ 'animate-spin': isSyncing }">refresh</span>
          {{ isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Cloud' }}
        </button>
      </div>

      <!-- Tables Zones Block -->
      <div class="space-y-8">
        <div 
          v-for="zone in Array.from(new Set(tables.map(t => t.zone)))" 
          :key="zone"
          class="space-y-3.5"
        >
          <h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider pl-1">{{ zone }}</h4>
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-4">
            <button 
              v-for="t in tables.filter(tbl => tbl.zone === zone)" 
              :key="t.id"
              class="group relative p-4 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between h-28 cursor-pointer overflow-hidden active:scale-97 select-none"
              :class="orders[t.id] && orders[t.id].items?.length > 0 
                ? 'bg-gradient-to-br from-indigo-50 to-purple-50/50 border-indigo-200/60 shadow-sm shadow-indigo-500/5' 
                : 'bg-white hover:bg-slate-50/50 border-slate-100 hover:border-slate-200'"
              @click="selectTable(t.id)"
            >
              <div class="flex items-center justify-between w-full">
                <span class="text-xs font-black" :class="orders[t.id] && orders[t.id].items?.length > 0 ? 'text-indigo-800' : 'text-slate-600'">
                  {{ t.name }}
                </span>
                <span class="text-[9px] font-bold text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded-md">
                  {{ t.seats }} Ghế
                </span>
              </div>

              <!-- Occupied Info vs Free Indicator -->
              <div v-if="orders[t.id] && orders[t.id].items?.length > 0">
                <div class="text-[11px] font-black text-indigo-700 leading-tight">
                  {{ formatMoney(orderTotal(orders[t.id])) }}
                </div>
                <div class="text-[9px] text-slate-500 font-medium mt-1">
                  {{ orders[t.id].items.reduce((acc: number, i: any) => i.status === 'cancelled' ? acc : acc + i.qty, 0) }} món
                </div>
              </div>
              <div v-else class="text-[10px] text-slate-400 font-semibold">
                Bàn trống
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. DETAILED ORDER SCREEN FOR SINGLE TABLE -->
    <div v-else-if="screen === 'order' && activeTable" class="space-y-6 animate-fade-in">
      <!-- Sub-header navbar -->
      <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl border border-slate-100">
        <div class="flex items-center gap-3">
          <button 
            class="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
            @click="screen = 'tables'; activeTableId = null;"
          >
            <span class="material-symbols-rounded text-base text-slate-600">arrow_back</span>
          </button>
          <div>
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <span class="material-symbols-rounded text-indigo-500 text-lg">table_restaurant</span>
              Bàn {{ activeTable.name }}
            </h3>
            <p class="text-xs text-slate-500">Khu vực: {{ activeTable.zone }}</p>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button 
            class="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-600 border border-sky-100 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            @click="triggerTransferTable"
          >
            <span class="material-symbols-rounded text-sm">swap_horiz</span>
            Chuyển bàn
          </button>
          <button 
            class="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-100 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            @click="triggerMergeTable"
          >
            <span class="material-symbols-rounded text-sm">call_merge</span>
            Ghép bàn
          </button>
          <button 
            class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            @click="triggerCatalogMgr"
          >
            <span class="material-symbols-rounded text-sm">menu_book</span>
            Chỉnh sửa Menu
          </button>
        </div>
      </div>

      <!-- POS Ordering Grid split Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        <!-- Left Column: Menu Items Selectors (2/3 width) -->
        <div class="lg:col-span-2 space-y-4 bg-white p-6 rounded-3xl border border-slate-100">
          <div class="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1">
            <span class="material-symbols-rounded text-slate-400">search</span>
            <input 
              v-model="searchQ"
              type="text" 
              class="w-full bg-transparent py-2 text-xs font-semibold text-slate-700 focus:outline-hidden"
              placeholder="Tìm kiếm món trong thực đơn..."
            />
          </div>

          <!-- Horizontal Category filters -->
          <div class="flex gap-1.5 overflow-x-auto pb-1 select-none no-scrollbar">
            <button 
              v-for="cat in categories" 
              :key="cat"
              class="px-4 py-2 text-xs font-bold rounded-xl border whitespace-nowrap transition-all cursor-pointer"
              :class="activeCatFilter === cat 
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20' 
                : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-600'"
              @click="activeCatFilter = cat"
            >
              {{ cat }}
            </button>
          </div>

          <!-- Products grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            <button 
              v-for="prod in filteredProducts" 
              :key="prod.id"
              class="p-4 bg-slate-50/50 hover:bg-blue-50/20 active:scale-97 border border-slate-100/50 hover:border-blue-200/50 rounded-2xl transition-all text-left flex flex-col justify-between h-28 cursor-pointer select-none"
              @click="addProductToCart(prod)"
            >
              <span class="text-2xl">{{ prod.emoji }}</span>
              <div>
                <div class="text-xs font-bold text-slate-800 truncate">{{ prod.name }}</div>
                <div class="text-[10px] font-extrabold text-blue-700 mt-1">{{ formatMoney(prod.price) }}</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Right Column: Cart / Active Bill Tally (1/3 width) -->
        <div class="bg-white rounded-3xl border border-slate-100 p-6 flex flex-col justify-between min-h-[65vh]">
          <div class="space-y-4">
            <h4 class="font-extrabold text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-3 flex items-center gap-1.5">
              <span class="material-symbols-rounded text-indigo-500">shopping_cart</span>
              Giỏ hàng phục vụ
            </h4>

            <!-- Cart rows list -->
            <div class="space-y-3.5 max-h-[35vh] overflow-y-auto pr-1">
              <div 
                v-for="item in activeOrder?.items" 
                :key="item.id"
                class="flex items-center justify-between gap-2.5 pb-3 border-b border-slate-50/50 transition-opacity"
                :class="{ 'opacity-40 line-through decoration-rose-500': item.status === 'cancelled' }"
              >
                <!-- Item detail -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span 
                      class="w-1.5 h-1.5 rounded-full shrink-0"
                      :class="item.status === 'cancelled' ? 'bg-rose-500' : item.isPrinted ? 'bg-emerald-500' : 'bg-amber-500'"
                      :title="item.status === 'cancelled' ? 'Đã hủy' : item.isPrinted ? 'Đã báo bếp' : 'Món mới chưa báo'"
                    ></span>
                    <span class="text-xs font-bold text-slate-800 truncate">{{ item.emoji }} {{ item.name }}</span>
                    <!-- Destination Tag -->
                    <span 
                      v-if="item.isPrinted"
                      class="text-[8px] font-bold px-1 py-0.2 rounded-sm uppercase tracking-wider shrink-0"
                      :class="item.kitchenDest === 'sashimi' 
                        ? 'bg-amber-50 text-amber-600 border border-amber-200/30' 
                        : item.kitchenDest === 'bar' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200/30'"
                    >
                      {{ item.kitchenDest }}
                    </span>
                  </div>
                  <!-- Note and Cancel reason -->
                  <div v-if="item.note" class="text-[10px] text-slate-400 mt-0.5 font-semibold">{{ item.note }}</div>
                  <div v-if="item.status === 'cancelled' && item.cancelReason" class="text-[9px] text-rose-500 mt-0.5 font-bold">Lý do hủy: {{ item.cancelReason }}</div>
                </div>

                <!-- Qty adjuster -->
                <div v-if="item.status !== 'cancelled'" class="flex items-center bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                  <button @click="adjustQty(item.id, -1)" class="w-6 h-6 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200/50 rounded-l-lg cursor-pointer border-0 bg-transparent">-</button>
                  <span class="text-xs font-extrabold text-slate-800 w-6 text-center select-none">{{ item.qty }}</span>
                  <button @click="adjustQty(item.id, 1)" class="w-6 h-6 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200/50 rounded-r-lg cursor-pointer border-0 bg-transparent">+</button>
                </div>
                <div v-else class="text-[10px] font-bold text-rose-500 shrink-0">HỦY</div>

                <!-- Price and action -->
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="text-xs font-bold text-slate-800 w-16 text-right">{{ formatMoney(item.price * item.qty) }}</span>
                  <!-- Cancel printed or remove pending -->
                  <button 
                    v-if="item.isPrinted && item.status !== 'cancelled'"
                    class="text-rose-500 hover:bg-rose-50 p-1 rounded-lg border-0 cursor-pointer"
                    title="Hủy món đã in"
                    @click="triggerCancelItem(item.id)"
                  >
                    <span class="material-symbols-rounded text-base">block</span>
                  </button>
                  <button 
                    v-else-if="item.status !== 'cancelled'"
                    class="text-slate-400 hover:bg-slate-100 p-1 rounded-lg border-0 cursor-pointer"
                    title="Xóa"
                    @click="removeDirect(item.id)"
                  >
                    <span class="material-symbols-rounded text-base">close</span>
                  </button>
                </div>
              </div>
              <div v-if="!activeOrder?.items?.length" class="text-center py-12 text-slate-400 text-xs font-semibold">
                Giỏ hàng trống. Vui lòng chọn món.
              </div>
            </div>
          </div>

          <!-- Cart calculations and triggers -->
          <div class="pt-6 border-t border-slate-100 space-y-4">
            <div class="flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Tổng cộng hóa đơn:</span>
              <span class="text-base text-emerald-600 font-extrabold">{{ formatMoney(orderTotal(activeOrder)) }}</span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs font-bold">
              <button 
                class="py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition-all cursor-pointer"
                @click="screen = 'tables'; activeTableId = null;"
              >
                Lưu & Thoát
              </button>
              <button 
                class="py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs transition-all cursor-pointer"
                @click="handlePrintTempBill"
              >
                🖨️ Tạm tính
              </button>
              <button 
                class="col-span-2 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-100 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                :disabled="!hasUnprinted"
                @click="handleKitchenBell"
              >
                <span class="material-symbols-rounded text-base">campaign</span>
                Báo bếp / bar
              </button>
              <button 
                class="col-span-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10 transition-all flex items-center justify-center gap-1 cursor-pointer"
                :disabled="!activeOrder?.items?.length"
                @click="triggerCheckout"
              >
                <span class="material-symbols-rounded text-base">credit_score</span>
                Thanh Toán kết đơn
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 3. MODALS LAYER -->
    <!-- CANCEL ITEM MODAL -->
    <div v-if="activeModal === 'cancel_item'" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 space-y-4 animate-slide-up">
        <h4 class="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
          <span class="material-symbols-rounded text-rose-500">block</span>
          Xác nhận hủy món ăn
        </h4>
        
        <div>
          <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Lý do hủy món *</label>
          <input 
            v-model="cancelReason"
            type="text" 
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            placeholder="VD: Hết nguyên liệu, đổi bàn..."
          />
        </div>

        <div class="flex gap-2 text-xs font-bold pt-2">
          <button @click="activeModal = null" class="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl cursor-pointer">Không</button>
          <button @click="confirmCancelItem" class="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer">Xác nhận hủy</button>
        </div>
      </div>
    </div>

    <!-- TRANSFER TABLE MODAL -->
    <div v-if="activeModal === 'transfer_table'" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 p-6 space-y-4 animate-slide-up">
        <div class="flex items-center justify-between border-b border-slate-50 pb-3">
          <h4 class="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-sky-500">swap_horiz</span>
            Chuyển bàn phục vụ
          </h4>
          <button @click="activeModal = null" class="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        <p class="text-xs text-slate-500">Chọn bàn trống để chuyển toàn bộ hóa đơn từ bàn {{ activeTable?.name }}:</p>

        <div class="max-h-[50vh] overflow-y-auto space-y-4">
          <div 
            v-for="zone in Array.from(new Set(tables.map(t => t.zone)))" 
            :key="zone"
            class="space-y-1.5"
          >
            <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{{ zone }}</span>
            <div class="flex flex-wrap gap-2">
              <button 
                v-for="t in tables.filter(tbl => tbl.zone === zone && tbl.id !== activeTableId)" 
                :key="t.id"
                class="px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer"
                :class="orders[t.id] && orders[t.id].items?.length > 0 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-600 border border-sky-100'"
                :disabled="orders[t.id] && orders[t.id].items?.length > 0"
                @click="confirmTransferTable(t.id)"
              >
                {{ t.name }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MERGE TABLE MODAL -->
    <div v-if="activeModal === 'merge_table'" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4 animate-slide-up">
        <div class="flex items-center justify-between border-b border-slate-50 pb-3">
          <h4 class="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-purple-500">call_merge</span>
            Ghép bàn vào {{ activeTable?.name }}
          </h4>
          <button @click="activeModal = null" class="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        <p class="text-xs text-slate-500">Chọn bàn có khách muốn gộp order vào bàn {{ activeTable?.name }}:</p>

        <div class="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          <button 
            v-for="t in tables.filter(tbl => tbl.id !== activeTableId && orders[tbl.id] && orders[tbl.id].items?.length > 0)"
            :key="t.id"
            class="w-full text-left p-3 rounded-xl border border-purple-100 bg-purple-50/30 hover:bg-purple-50 transition-all flex items-center justify-between cursor-pointer"
            @click="confirmMergeTable(t.id)"
          >
            <div>
              <span class="text-xs font-bold text-slate-800">Bàn {{ t.name }}</span>
              <div class="text-[10px] text-slate-500 mt-0.5">
                {{ orders[t.id].items.reduce((acc: number, i: any) => i.status === 'cancelled' ? acc : acc + i.qty, 0) }} món
              </div>
            </div>
            <span class="text-xs font-extrabold text-purple-700">{{ formatMoney(orderTotal(orders[t.id])) }}</span>
          </button>
          <div 
            v-if="tables.filter(tbl => tbl.id !== activeTableId && orders[tbl.id] && orders[tbl.id].items?.length > 0).length === 0"
            class="text-center py-8 text-slate-400 text-xs font-semibold"
          >
            Không có bàn khách nào khả dụng để ghép.
          </div>
        </div>
      </div>
    </div>

    <!-- CATALOG MANAGER MODAL -->
    <div v-if="activeModal === 'catalog'" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-slide-up">
        <div class="p-6 bg-slate-900 text-white flex items-center justify-between">
          <h4 class="font-extrabold text-sm flex items-center gap-1.5">
            <span class="material-symbols-rounded text-blue-500">menu_book</span>
            Quản lý Menu thực đơn
          </h4>
          <button @click="activeModal = null" class="text-slate-400 hover:text-white border-0 bg-transparent cursor-pointer">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <!-- 1. Editor panel -->
          <div v-if="isCatalogEditMode" class="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3.5 animate-fade-in">
            <span class="text-xs font-bold text-slate-800">{{ catalogEditIndex === -1 ? 'Thêm món ăn mới' : 'Sửa món ăn' }}</span>
            
            <div class="grid grid-cols-3 gap-3">
              <div class="col-span-2">
                <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1">Tên món</label>
                <input v-model="editProduct.name" type="text" class="w-full px-2.5 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl text-xs font-bold transition-all" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1">Biểu tượng</label>
                <input v-model="editProduct.emoji" type="text" class="w-full px-2.5 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl text-xs text-center transition-all" />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1">Danh mục</label>
                <input v-model="editProduct.category" type="text" class="w-full px-2.5 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl text-xs font-semibold transition-all" placeholder="VD: Nướng, Lẩu..." />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1">Giá bán (đ)</label>
                <input v-model.number="editProduct.price" type="number" class="w-full px-2.5 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl text-xs font-extrabold transition-all" />
              </div>
              <div>
                <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1">Loại món</label>
                <select v-model="editProduct.type" class="w-full px-2 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl text-xs font-semibold transition-all cursor-pointer">
                  <option value="food">Món ăn (Bếp)</option>
                  <option value="drink">Đồ uống (Bar)</option>
                </select>
              </div>
            </div>

            <div class="flex gap-2 pt-1.5 justify-end">
              <button @click="isCatalogEditMode = false" class="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold cursor-pointer">Hủy</button>
              <button @click="saveProduct" class="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer">Lưu lại</button>
            </div>
          </div>

          <!-- 2. Product list -->
          <div class="divide-y divide-slate-100">
            <div 
              v-for="(prod, idx) in catalog" 
              :key="prod.id"
              class="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
            >
              <div class="flex items-center gap-2.5">
                <span class="text-xl bg-slate-50 p-1.5 rounded-lg border border-slate-100 shrink-0">{{ prod.emoji }}</span>
                <div>
                  <span class="text-xs font-bold text-slate-800">{{ prod.name }}</span>
                  <div class="text-[10px] text-slate-400 mt-0.5">
                    {{ prod.category }} · {{ prod.type === 'food' ? 'Bếp' : 'Bar' }} · <span class="font-extrabold text-blue-600">{{ formatMoney(prod.price) }}</span>
                  </div>
                </div>
              </div>

              <div class="flex gap-1">
                <button @click="startEditProduct(idx)" class="p-1 text-blue-600 hover:bg-blue-50 border-0 rounded-lg cursor-pointer">
                  <span class="material-symbols-rounded text-base">edit</span>
                </button>
                <button @click="deleteProduct(idx)" class="p-1 text-rose-600 hover:bg-rose-50 border-0 rounded-lg cursor-pointer">
                  <span class="material-symbols-rounded text-base">delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-between">
          <button @click="activeModal = null" class="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-600">Đóng lại</button>
          <button @click="startAddProduct" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-rounded text-sm">add</span>
            Thêm món ăn
          </button>
        </div>
      </div>
    </div>

    <!-- CHECKOUT MODAL -->
    <div v-if="activeModal === 'checkout'" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
      <div class="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 animate-slide-up">
        <div class="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h4 class="font-extrabold text-sm flex items-center gap-1.5">
              <span class="material-symbols-rounded text-emerald-500">payments</span>
              Hóa đơn thanh toán bàn {{ activeTable?.name }}
            </h4>
            <p class="text-[10px] text-slate-400 mt-0.5">Xác nhận thu ngân kết toán và in hóa đơn cuối cùng.</p>
          </div>
          <button @click="activeModal = null" class="text-slate-400 hover:text-white border-0 bg-transparent cursor-pointer">
            <span class="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        <div class="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <!-- Items details billing breakdown -->
          <div class="border border-slate-100 rounded-2xl overflow-hidden text-xs">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th class="py-2.5 px-4">Tên món</th>
                  <th class="py-2.5 px-4 text-center">SL</th>
                  <th class="py-2.5 px-4 text-right">Giá</th>
                  <th class="py-2.5 px-4 text-right">Tổng</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 text-slate-700 font-medium">
                <tr v-for="item in activeOrder?.items" :key="item.id" :class="{ 'opacity-40': item.status === 'cancelled' }">
                  <td class="py-2 px-4">{{ item.emoji }} {{ item.name }}</td>
                  <td class="py-2 px-4 text-center">{{ item.qty }}</td>
                  <td class="py-2 px-4 text-right">{{ formatMoney(item.price) }}</td>
                  <td class="py-2 px-4 text-right font-bold">{{ formatMoney(item.price * item.qty) }}</td>
                </tr>
                <tr class="bg-slate-50/50 font-bold border-t border-slate-100">
                  <td colspan="3" class="py-2.5 px-4">TỔNG CỘNG THU:</td>
                  <td class="py-2.5 px-4 text-right text-emerald-600 text-sm font-extrabold">
                    {{ formatMoney(orderTotal(activeOrder)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pay Method toggle selection -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Phương thức thanh toán</label>
            <div class="flex gap-2">
              <button 
                class="flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer"
                :class="checkoutMethod === 'cash' 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'"
                @click="checkoutMethod = 'cash'"
              >
                💵 Tiền mặt
              </button>
              <button 
                class="flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer"
                :class="checkoutMethod === 'transfer' 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'"
                @click="checkoutMethod = 'transfer'"
              >
                🏦 Chuyển khoản
              </button>
              <button 
                class="flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer"
                :class="checkoutMethod === 'card' 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'"
                @click="checkoutMethod = 'card'"
              >
                💳 Quẹt thẻ
              </button>
            </div>
          </div>

          <!-- Dynamic VietQR Code widget for bank transfers -->
          <div 
            v-if="checkoutMethod === 'transfer'" 
            class="p-4 bg-sky-50/20 border border-sky-100 rounded-2xl text-center space-y-2 animate-fade-in"
          >
            <div v-if="vietQrUrl">
              <span class="text-[10px] font-black text-sky-700 uppercase tracking-widest flex items-center justify-center gap-1">
                <span class="material-symbols-rounded text-sm">qr_code_2</span> Quét VietQR nhận thanh toán
              </span>
              <div class="inline-block bg-white p-2 rounded-2xl border border-slate-100 shadow-xs mt-2">
                <img :src="vietQrUrl" class="w-40 h-40 object-cover" alt="VietQR Pay Code" />
              </div>
            </div>
            <div v-else class="text-[11px] text-slate-400 py-4 font-semibold">
              ⚠️ Chưa thiết lập cấu hình VietQR nhận tiền trong settings.
            </div>
          </div>

          <!-- Additional Notes -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Ghi chú hóa đơn (tùy chọn)</label>
            <input 
              v-model="checkoutNote" 
              type="text" 
              class="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
              placeholder="VD: Nhận phiếu voucher, giảm giá, số lượng khách..."
            />
          </div>
        </div>

        <div class="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
          <button @click="activeModal = null" class="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-600">Hủy bỏ</button>
          <button @click="confirmCheckout" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-500/10">
            <span class="material-symbols-rounded text-sm">check_circle</span>
            Xác nhận & In hóa đơn
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slide-up {
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
</style>
