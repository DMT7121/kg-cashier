/* ═══════════════════════════════════════
   POS — Order, Tính tiền, In Bill
   Phase 1+2: Table map, Order cart, Kitchen/Bar routing, Catalog MGMT
   ═══════════════════════════════════════ */
import { getCurrentShift, addTransaction, getSettings } from '../store.js';
import { showToast, showModal, hideModal, formatCurrency } from '../utils.js';
import { getPosOrdersFromCloud, syncPosOrdersWithCloud } from '../api.js';

// ── Storage keys ──────────────────────
const CATALOG_KEY  = 'kg-pos-catalog';
const ORDERS_KEY   = 'kg-pos-orders';

// ── Printer config helpers ────────────
function getPrinterCfg() {
  var settings = getSettings();
  return settings.printer || { kitchenIp: '', sashimiIp: '', barIp: '', useQzTray: false };
}

// ── Catalog CRUD helpers ──────────────
function saveCatalog(catalog) {
  var settings = getSettings();
  settings.posCatalog = catalog;
  import('../store.js').then(store => store.updateSettings(settings));
}

// ── Default catalog ───────────────────
const DEFAULT_CATALOG = [
  // Đồ ăn
  { id:'f1',  name:'Bò nướng', category:'Nướng', price:89000,  type:'food',  emoji:'🥩' },
  { id:'f2',  name:'Hải sản nướng', category:'Nướng', price:129000, type:'food', emoji:'🦐' },
  { id:'f3',  name:'Rau nướng', category:'Nướng', price:35000, type:'food',  emoji:'🥬' },
  { id:'f4',  name:'Lẩu thái', category:'Lẩu', price:159000, type:'food',   emoji:'🍲' },
  { id:'f5',  name:'Lẩu hải sản', category:'Lẩu', price:189000, type:'food', emoji:'🦞' },
  { id:'f6',  name:'Cơm trắng', category:'Cơm', price:10000,  type:'food',  emoji:'🍚' },
  { id:'f7',  name:'Mì xào', category:'Cơm', price:35000,     type:'food',  emoji:'🍜' },
  // Đồ uống
  { id:'d1',  name:'Heineken 330ml', category:'Bia', price:30000, type:'drink', emoji:'🍺' },
  { id:'d2',  name:'Tiger Bạc', category:'Bia', price:28000,   type:'drink', emoji:'🍺' },
  { id:'d3',  name:'Corona', category:'Bia', price:45000,      type:'drink', emoji:'🍺' },
  { id:'d4',  name:'Coca Cola', category:'Nước ngọt', price:15000, type:'drink', emoji:'🥤' },
  { id:'d5',  name:'Pepsi', category:'Nước ngọt', price:15000, type:'drink', emoji:'🥤' },
  { id:'d6',  name:'Nước suối', category:'Nước suối', price:10000, type:'drink', emoji:'💧' },
  { id:'d7',  name:'Soju', category:'Rượu', price:89000,       type:'drink', emoji:'🍶' },
  { id:'d8',  name:'Redbull', category:'Nước tăng lực', price:25000, type:'drink', emoji:'⚡' },
];

// ── Table zones: A(25), B(10), C(20), D(10), E(10) = 75 bàn ──
var TABLES_VERSION = 2;
var TABLES_VERSION_KEY = 'kg-pos-tables-version';

function _generateDefaultTables() {
  var zones = [
    { prefix: 'A', label: 'Khu A', count: 25, seats: 4 },
    { prefix: 'B', label: 'Khu B', count: 10, seats: 4 },
    { prefix: 'C', label: 'Khu C', count: 20, seats: 4 },
    { prefix: 'D', label: 'Khu D', count: 10, seats: 6 },
    { prefix: 'E', label: 'Khu E', count: 10, seats: 6 },
  ];
  var tables = [];
  zones.forEach(function(z) {
    for (var i = 1; i <= z.count; i++) {
      tables.push({ id: z.prefix.toLowerCase() + i, name: z.prefix + i, zone: z.label, seats: z.seats });
    }
  });
  return tables;
}

// ── Data helpers ──────────────────────
function getCatalog() {
  var settings = getSettings();
  if (settings.posCatalog && settings.posCatalog.length > 0) {
    return settings.posCatalog;
  }
  // Try migrating from old localStorage
  try {
    var old = localStorage.getItem(CATALOG_KEY);
    if (old) {
      var parsed = JSON.parse(old);
      if (parsed && parsed.length > 0) {
        settings.posCatalog = parsed;
        import('../store.js').then(store => store.updateSettings(settings));
        return parsed;
      }
    }
  } catch(e) {}
  
  settings.posCatalog = DEFAULT_CATALOG.slice();
  import('../store.js').then(store => store.updateSettings(settings));
  return settings.posCatalog;
}

function getTables() {
  var settings = getSettings();
  if (settings.posTables && settings.posTables.length > 0) {
    return settings.posTables;
  }
  // Initialize default
  var tables = _generateDefaultTables();
  settings.posTables = tables;
  import('../store.js').then(store => store.updateSettings(settings));
  return tables;
}
function getOrders() {
  try { var s = localStorage.getItem(ORDERS_KEY); if (s) return JSON.parse(s); } catch(e){}
  return {};
}
// ── BroadcastChannel for cross-tab sync ──
var _posChannel = null;
try { _posChannel = new BroadcastChannel('kg-pos-sync'); } catch(e){}

let _syncing = false;
async function syncPOSWithCloud() {
  if (_syncing) return;
  _syncing = true;
  try {
    var localOrders = getOrders();
    var tables = getTables();
    var ordersToSend = [];
    
    // Active orders
    Object.keys(localOrders).forEach(function(tableId) {
      var o = localOrders[tableId];
      if (!o || !o.items || o.items.length === 0) return;
      var table = tables.find(function(t){ return t.id === tableId; }) || { name: tableId };
      var total = o.items.reduce(function(s, i) { return i.status === 'cancelled' ? s : s + i.price * i.qty; }, 0);
      
      ordersToSend.push({
        orderId: o.id || 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        tableId: tableId,
        tableName: table.name,
        status: 'active',
        itemsJson: JSON.stringify(o.items),
        total: total,
        createdAt: o.createdAt || new Date().toISOString(),
        updatedAt: o.updatedAt || new Date().toISOString(),
        createdBy: o.createdBy || '',
        updatedBy: o.updatedBy || '',
        deviceId: o.deviceId || localStorage.getItem('kg_device_id') || 'dev_unknown',
        sessionId: o.sessionId || sessionStorage.getItem('kg_session_id') || 'sess_unknown',
        revision: o.revision || 1,
        lastMutationId: o.lastMutationId || ''
      });
    });
    
    // Completed orders
    var completedSyncs = [];
    try {
      completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]');
    } catch(e) {}
    
    completedSyncs.forEach(function(o) {
      ordersToSend.push({
        orderId: o.orderId,
        tableId: o.tableId,
        tableName: o.tableName,
        status: 'completed',
        itemsJson: o.itemsJson || '[]',
        total: o.total || 0,
        createdAt: o.createdAt,
        updatedAt: new Date().toISOString(),
        createdBy: o.createdBy || '',
        updatedBy: o.updatedBy || '',
        deviceId: o.deviceId || localStorage.getItem('kg_device_id') || 'dev_unknown',
        sessionId: o.sessionId || sessionStorage.getItem('kg_session_id') || 'sess_unknown',
        revision: o.revision || 1,
        lastMutationId: o.lastMutationId || ''
      });
    });
    
    var response = await syncPosOrdersWithCloud(ordersToSend);
    if (response && response.success && response.orders) {
      var updatedLocalOrders = {};
      response.orders.forEach(function(co) {
        if (co.status === 'active') {
          var items = [];
          try { items = JSON.parse(co.itemsJson || '[]'); } catch(e) {}
          updatedLocalOrders[co.tableId] = {
            id: co.orderId,
            tableId: co.tableId,
            items: items,
            createdAt: co.createdAt,
            updatedAt: co.updatedAt,
            createdBy: co.createdBy,
            updatedBy: co.updatedBy,
            deviceId: co.deviceId,
            sessionId: co.sessionId,
            revision: Number(co.revision) || 1,
            lastMutationId: co.lastMutationId
          };
        }
      });
      
      // Update local storage directly
      localStorage.setItem(ORDERS_KEY, JSON.stringify(updatedLocalOrders));
      localStorage.setItem('kg-pos-completed-syncs', '[]');
      
      if (_posChannel) {
        try { _posChannel.postMessage({ type: 'orders-updated', source: 'pos-sync' }); } catch(e){}
      }
      
      if (typeof window.refreshView === 'function') {
        window.refreshView();
      }
    }
  } catch (error) {
    console.warn('[POS Sync] Failed to sync with cloud:', error);
  } finally {
    _syncing = false;
  }
}

function saveOrders(orders) {
  var devId = localStorage.getItem('kg_device_id') || 'dev_unknown';
  var sessId = sessionStorage.getItem('kg_session_id') || 'sess_unknown';
  
  Object.keys(orders).forEach(function(tableId) {
    var o = orders[tableId];
    if (o) {
      o.updatedAt = new Date().toISOString();
      o.deviceId = devId;
      o.sessionId = sessId;
      o.lastMutationId = 'mut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }
  });

  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  if (_posChannel) {
    try { _posChannel.postMessage({ type: 'orders-updated', source: 'pos' }); } catch(e){}
  }
  syncPOSWithCloud();
}

// ── Kitchen routing rules ─────────────
var SASHIMI_CATEGORIES = ['Sashimi', 'Gỏi', 'Salad', 'Nướng'];
var SASHIMI_EXCEPTIONS = ['Bò nướng sốt trứng muối'];

function getKitchenDest(item) {
  if (item.type === 'drink') return 'bar';
  if (SASHIMI_EXCEPTIONS.indexOf(item.name) !== -1) return 'kitchen';
  if (SASHIMI_CATEGORIES.indexOf(item.category) !== -1) return 'sashimi';
  return 'kitchen';
}

function getKitchenDestLabel(dest) {
  if (dest === 'sashimi') return 'BẾP SASHIMI';
  if (dest === 'bar') return 'BAR';
  return 'BẾP';
}

// ── Module state ──────────────────────
var _screen = 'tables'; // 'tables' | 'order'
var _activeTableId = null;
var _activeCatFilter = 'Tất cả';
var _searchQ = '';
var _syncInterval = null;

// ── Utilities ─────────────────────────
function uid() { return 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fc(n) { return (Number(n)||0).toLocaleString('vi-VN') + 'đ'; }
function orderTotal(order) {
  return (order.items||[]).reduce(function(s,i){ return s + i.price * i.qty; }, 0);
}

// ── RENDER ────────────────────────────
export function render() {
  if (_screen === 'order' && _activeTableId) return _renderOrderScreen();
  return _renderTableMap();
}

function _renderTableMap() {
  var tables = getTables();
  var orders = getOrders();
  var zones = [];
  var zoneMap = {};
  tables.forEach(function(t) {
    if (!zoneMap[t.zone]) { zoneMap[t.zone] = []; zones.push(t.zone); }
    zoneMap[t.zone].push(t);
  });

  var zonesHtml = zones.map(function(zone) {
    var cards = zoneMap[zone].map(function(t) {
      var order = orders[t.id];
      var hasOrder = order && order.items && order.items.length > 0;
      var total = hasOrder ? orderTotal(order) : 0;
      var statusClass = hasOrder ? 'pos-table-busy' : 'pos-table-free';
      var statusLabel = hasOrder ? fc(total) : 'Trống';
      var itemCount = hasOrder ? order.items.reduce(function(s,i){return s+i.qty;},0) : 0;
      return '<div class="pos-table-card ' + statusClass + '" data-table-id="' + t.id + '">' +
        '<div class="pos-table-icon">' + (hasOrder ? '🍽️' : '⬜') + '</div>' +
        '<div class="pos-table-name">' + t.name + '</div>' +
        '<div class="pos-table-zone-badge">' + t.seats + ' chỗ</div>' +
        (hasOrder ? '<div class="pos-table-amount">' + statusLabel + '</div>' +
          '<div class="pos-table-items">' + itemCount + ' món</div>' : 
          '<div class="pos-table-free-label">Trống</div>') +
        '</div>';
    }).join('');
    return '<div class="pos-zone-block"><div class="pos-zone-label">' + zone + '</div>' +
      '<div class="pos-tables-grid">' + cards + '</div></div>';
  }).join('');

  var busy = Object.keys(orders).filter(function(tid){ var o=orders[tid]; return o&&o.items&&o.items.length>0; }).length;
  return '<div class="pos-shell">' +
    '<div class="pos-header">' +
      '<div class="pos-header-left">' +
        '<span class="material-symbols-rounded" style="color:var(--primary);font-size:28px;">point_of_sale</span>' +
        '<div><h3 style="margin:0;font-size:17px;">Sơ đồ bàn</h3>' +
        '<small style="color:var(--text-muted);">' + busy + ' bàn có khách · ' + tables.length + ' tổng số bàn</small></div>' +
      '</div>' +
      '<div class="pos-header-right">' +
        '<button class="btn btn-outline btn-sm" id="btnPosRefresh"><span class="material-symbols-rounded">refresh</span></button>' +
      '</div>' +
    '</div>' +
    '<div class="pos-zones">' + zonesHtml + '</div>' +
    '</div>';
}

function _renderOrderScreen() {
  var tables = getTables();
  var table = tables.find(function(t){ return t.id === _activeTableId; }) || { name:'?', zone:'?' };
  var orders = getOrders();
  var order = orders[_activeTableId] || { items: [] };
  var catalog = getCatalog();

  // Category list
  var cats = ['Tất cả'];
  catalog.forEach(function(p) { if (cats.indexOf(p.category) === -1) cats.push(p.category); });

  // Filtered products
  var filtered = catalog.filter(function(p) {
    var catOk = _activeCatFilter === 'Tất cả' || p.category === _activeCatFilter;
    var searchOk = !_searchQ || p.name.toLowerCase().includes(_searchQ.toLowerCase());
    return catOk && searchOk;
  });

  // Cart — show status + kitchen dest badge
  var hasUnprinted = (order.items||[]).some(function(i){ return !i.isPrinted && i.status !== 'cancelled'; });
  var hasPrinted = (order.items||[]).some(function(i){ return i.isPrinted; });
  var cartRows = (order.items||[]).map(function(item) {
    var isCancelled = item.status === 'cancelled';
    var destBadge = '';
    if (item.isPrinted && item.kitchenDest) {
      var dCol = item.kitchenDest === 'sashimi' ? '#f97316' : item.kitchenDest === 'bar' ? '#6366f1' : '#10b981';
      var dLbl = item.kitchenDest === 'sashimi' ? 'Sashimi' : item.kitchenDest === 'bar' ? 'Bar' : 'Bếp';
      destBadge = '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:' + dCol + '22;color:' + dCol + ';margin-left:4px;">' + dLbl + '</span>';
    }
    var statusIcon = isCancelled
      ? '<span title="Đã hủy" style="color:var(--danger);font-size:10px;">✖</span>'
      : item.isPrinted
        ? '<span title="Đã báo" style="color:#10b981;font-size:10px;">✔</span>'
        : '<span title="Chưa báo" style="color:var(--warning);font-size:10px;">●</span>';
    var rowStyle = isCancelled ? 'opacity:.45;text-decoration:line-through;' : '';
    var actionBtns = '';
    if (item.isPrinted && !isCancelled) {
      actionBtns = '<button class="pos-cart-cancel" data-cancel-item="' + item.id + '" title="Hủy món">🚫</button>' +
        '<button class="pos-cart-transfer-kitchen" data-transfer-item="' + item.id + '" title="Chuyển bếp">🔄</button>';
    }
    return '<div class="pos-cart-row" style="' + rowStyle + '">' +
      '<div class="pos-cart-name">' + statusIcon + ' ' + item.emoji + ' ' + item.name + destBadge +
        (item.note ? '<br><small style="color:var(--text-muted);">' + item.note + '</small>' : '') +
        (isCancelled && item.cancelReason ? '<br><small style="color:var(--danger);font-size:10px;">Lý do: ' + item.cancelReason + '</small>' : '') + '</div>' +
      (isCancelled ? '<div class="pos-cart-qty"><span style="color:var(--danger);">HỦY</span></div>' :
      '<div class="pos-cart-qty">' +
        '<button class="pos-qty-btn" data-cart-minus="' + item.id + '">−</button>' +
        '<span>' + item.qty + '</span>' +
        '<button class="pos-qty-btn" data-cart-plus="' + item.id + '">+</button>' +
      '</div>') +
      '<div class="pos-cart-price">' + fc(item.price * item.qty) + '</div>' +
      '<div class="pos-cart-actions">' + actionBtns +
        (isCancelled ? '' : '<button class="pos-cart-del" data-cart-del="' + item.id + '">×</button>') +
      '</div>' +
    '</div>';
  }).join('');

  var total = orderTotal(order);
  var catTabs = cats.map(function(c) {
    return '<button class="pos-cat-tab' + (c === _activeCatFilter ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
  }).join('');

  var productGrid = filtered.map(function(p) {
    return '<button class="pos-product-btn" data-product-id="' + p.id + '">' +
      '<span class="pos-product-emoji">' + p.emoji + '</span>' +
      '<span class="pos-product-name">' + p.name + '</span>' +
      '<span class="pos-product-price">' + fc(p.price) + '</span>' +
    '</button>';
  }).join('');

  return '<div class="pos-shell pos-order-shell">' +
    '<div class="pos-order-header">' +
      '<button class="btn btn-outline btn-sm" id="btnPosBack"><span class="material-symbols-rounded">arrow_back</span> Sơ đồ bàn</button>' +
      '<div class="pos-order-title"><span class="material-symbols-rounded">table_restaurant</span> ' + table.name + ' — ' + table.zone + '</div>' +
      '<div class="pos-header-actions">' +
        '<button class="btn btn-outline btn-sm" id="btnPosTransferTable" style="color:#0ea5e9;border-color:rgba(14,165,233,.3);"><span class="material-symbols-rounded">swap_horiz</span> Chuyển bàn</button>' +
        '<button class="btn btn-outline btn-sm" id="btnPosMergeTable" style="color:#8b5cf6;border-color:rgba(139,92,246,.3);"><span class="material-symbols-rounded">call_merge</span> Ghép bàn</button>' +
        '<button class="btn btn-outline btn-sm" id="btnPosCatalogMgr"><span class="material-symbols-rounded">menu_book</span> Menu</button>' +
      '</div>' +
    '</div>' +
    '<div class="pos-order-body">' +
      // Left: Catalog
      '<div class="pos-catalog-panel">' +
        '<div class="pos-search-bar"><span class="material-symbols-rounded">search</span>' +
          '<input id="posSearch" class="pos-search-input" placeholder="Tìm món..." value="' + (_searchQ||'') + '"></div>' +
        '<div class="pos-cat-tabs">' + catTabs + '</div>' +
        '<div class="pos-product-grid">' + (productGrid || '<div style="padding:24px;color:var(--text-muted);text-align:center;">Không có món nào</div>') + '</div>' +
      '</div>' +
      // Right: Cart
      '<div class="pos-cart-panel">' +
        '<div class="pos-cart-title"><span class="material-symbols-rounded">receipt_long</span> Order</div>' +
        '<div class="pos-cart-list">' + (cartRows || '<div class="pos-cart-empty"><span class="material-symbols-rounded" style="font-size:36px;opacity:.3;">shopping_cart</span><p>Chưa có món</p></div>') + '</div>' +
        '<div class="pos-cart-footer">' +
          '<div class="pos-cart-total-row"><span>Tổng cộng</span><strong style="color:var(--success);font-size:18px;">' + fc(total) + '</strong></div>' +
          '<div class="pos-action-row">' +
            '<button class="btn btn-outline btn-sm" id="btnPosSave">💾 Lưu & Thoát</button>' +
            '<button class="btn btn-outline btn-sm" id="btnPosPrint" style="color:var(--warning);">🖨️ Tạm tính</button>' +
            '<button class="btn btn-sm" id="btnPosKitchenBell" style="background:rgba(249,115,22,.12);color:#f97316;border:1px solid rgba(249,115,22,.3);' + (!hasUnprinted ? 'opacity:.45;' : '') + '"' + (!hasUnprinted ? ' disabled' : '') + '><span class="material-symbols-rounded">campaign</span> Báo Bếp/Bar</button>' +
            '<button class="btn btn-primary" id="btnPosCheckout" ' + (total === 0 ? 'disabled' : '') + '>💳 Thanh Toán</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ── INIT ──────────────────────────────
export function init() {
  if (_screen === 'tables') _initTableMap();
  else _initOrderScreen();

  if (!_syncInterval) {
    syncPOSWithCloud();
    _syncInterval = setInterval(syncPOSWithCloud, 10000);
  }
}

function _initTableMap() {
  document.getElementById('btnPosRefresh')?.addEventListener('click', function() {
    syncPOSWithCloud();
  });
  document.querySelectorAll('[data-table-id]').forEach(function(card) {
    card.addEventListener('click', function() {
      _activeTableId = card.dataset.tableId;
      _screen = 'order';
      _activeCatFilter = 'Tất cả';
      _searchQ = '';
      window.refreshView();
    });
  });
}

function _initOrderScreen() {
  // Back
  document.getElementById('btnPosBack')?.addEventListener('click', function() {
    _screen = 'tables';
    _activeTableId = null;
    window.refreshView();
  });

  // Category tabs
  document.querySelectorAll('[data-cat]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _activeCatFilter = btn.dataset.cat;
      window.refreshView();
    });
  });

  // Search
  var searchEl = document.getElementById('posSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function() {
      _searchQ = searchEl.value;
      // Debounce re-render
      clearTimeout(searchEl._t);
      searchEl._t = setTimeout(function() { window.refreshView(); }, 200);
    });
  }

  // Add product to cart
  var catalog = getCatalog();
  var catMap = {};
  catalog.forEach(function(p) { catMap[p.id] = p; });

  document.querySelectorAll('[data-product-id]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = btn.dataset.productId;
      var product = catMap[pid];
      if (!product) return;
      var orders = getOrders();
      if (!orders[_activeTableId]) orders[_activeTableId] = { id: uid(), tableId: _activeTableId, items: [], createdAt: new Date().toISOString() };
      var order = orders[_activeTableId];
      var existing = order.items.find(function(i) { return i.productId === pid; });
      if (existing) {
        existing.qty++;
      } else {
        order.items.push({ id: uid(), productId: pid, name: product.name, price: product.price, emoji: product.emoji || '🍽️', type: product.type, category: product.category || '', qty: 1, note: '', isPrinted: false, printedAt: null, kitchenDest: null, status: 'pending' });
      }
      saveOrders(orders);
      window.refreshView();
    });
  });

  // Cart qty buttons
  document.querySelectorAll('[data-cart-plus]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _cartQtyChange(btn.dataset.cartPlus, 1);
    });
  });
  document.querySelectorAll('[data-cart-minus]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _cartQtyChange(btn.dataset.cartMinus, -1);
    });
  });
  document.querySelectorAll('[data-cart-del]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var orders = getOrders();
      var order = orders[_activeTableId];
      if (!order) return;
      order.items = order.items.filter(function(i) { return i.id !== btn.dataset.cartDel; });
      saveOrders(orders);
      window.refreshView();
    });
  });

  // Save & Exit
  document.getElementById('btnPosSave')?.addEventListener('click', function() {
    showToast('Đã lưu order ' + (getTables().find(function(t){return t.id===_activeTableId;})||{name:''}).name, 'success');
    _screen = 'tables';
    _activeTableId = null;
    window.refreshView();
  });

  // Print temp bill
  document.getElementById('btnPosPrint')?.addEventListener('click', function() {
    var orders = getOrders();
    var order = orders[_activeTableId] || { items: [] };
    var table = (getTables().find(function(t){return t.id===_activeTableId;})||{name:'?'});
    _printBill(table, order, false);
  });

  // Checkout
  document.getElementById('btnPosCheckout')?.addEventListener('click', function() {
    var orders = getOrders();
    var order = orders[_activeTableId] || { items: [] };
    var table = (getTables().find(function(t){return t.id===_activeTableId;})||{name:'?'});
    _showCheckoutModal(table, order);
  });

  // Kitchen/Bar bell
  document.getElementById('btnPosKitchenBell')?.addEventListener('click', function() {
    var orders = getOrders();
    var order = orders[_activeTableId];
    if (!order) return;
    var table = (getTables().find(function(t){return t.id===_activeTableId;})||{name:'?'});
    _handleKitchenBell(table, order);
  });

  // ── Phase 2: Cancel item ──
  document.querySelectorAll('[data-cancel-item]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _showCancelItemModal(btn.dataset.cancelItem);
    });
  });

  // ── Phase 2: Transfer kitchen ──
  document.querySelectorAll('[data-transfer-item]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _showTransferKitchenModal(btn.dataset.transferItem);
    });
  });

  // ── Phase 2: Transfer table ──
  document.getElementById('btnPosTransferTable')?.addEventListener('click', function() {
    _showTransferTableModal();
  });

  // ── Phase 2: Merge table ──
  document.getElementById('btnPosMergeTable')?.addEventListener('click', function() {
    _showMergeTableModal();
  });

  // Catalog manager
  document.getElementById('btnPosCatalogMgr')?.addEventListener('click', _showCatalogManager);
}

function _cartQtyChange(itemId, delta) {
  var orders = getOrders();
  var order = orders[_activeTableId];
  if (!order) return;
  var item = order.items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) order.items = order.items.filter(function(i) { return i.id !== itemId; });
  saveOrders(orders);
  window.refreshView();
}

// ── Phase 2: Cancel Item Modal ────────
function _showCancelItemModal(itemId) {
  var orders = getOrders();
  var order = orders[_activeTableId];
  if (!order) return;
  var item = order.items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var table = getTables().find(function(t) { return t.id === _activeTableId; }) || { name: '?' };

  showModal(
    '<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--danger);">cancel</span> Hủy món — ' + item.name + '</div>' +
    '<div style="padding:12px;background:var(--danger-bg);border:1px solid rgba(239,68,68,.2);border-radius:8px;margin-bottom:16px;">' +
      '<div style="font-size:14px;font-weight:600;">' + item.emoji + ' ' + item.qty + ' × ' + item.name + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Bếp: ' + getKitchenDestLabel(item.kitchenDest || 'kitchen') + '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Lý do hủy *</label>' +
      '<input type="text" id="cancelReason" class="form-input" placeholder="VD: Khách đổi ý, hết nguyên liệu...">' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-outline" id="cancelItemNo">Không</button>' +
      '<button class="btn btn-danger" id="cancelItemYes"><span class="material-symbols-rounded">delete</span> Xác nhận hủy</button>' +
    '</div>'
  );
  setTimeout(function() {
    document.getElementById('cancelItemNo')?.addEventListener('click', function() { hideModal(); });
    document.getElementById('cancelItemYes')?.addEventListener('click', function() {
      var reason = (document.getElementById('cancelReason')?.value || '').trim();
      if (!reason) { showToast('Vui lòng nhập lý do hủy', 'warning'); return; }
      // Update item status
      item.status = 'cancelled';
      item.cancelReason = reason;
      item.cancelledAt = new Date().toISOString();
      saveOrders(orders);
      // Print cancel ticket to the kitchen that has this item
      var dest = getKitchenDestLabel(item.kitchenDest || 'kitchen');
      _printCancelTicket(table, item, dest, reason);
      hideModal();
      showToast('🚫 Đã hủy: ' + item.name + ' → ' + dest, 'info');
      window.refreshView();
    });
  }, 80);
}

function _printCancelTicket(table, item, dest, reason) {
  var now = new Date().toLocaleString('vi-VN');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>*{margin:0;padding:0;}body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}' +
    '@media print{@page{size:80mm auto;margin:0;}}' +
    'h2{font-size:22px;text-align:center;border-bottom:3px solid #000;padding-bottom:4px;margin-bottom:6px;}</style></head><body>' +
    '<h2>❌ HỦY MÓN</h2>' +
    '<div><strong>' + table.name + '</strong> → ' + dest + '</div>' +
    '<div style="font-size:11px;">' + now + '</div><hr style="border-top:1px dashed #000;margin:4px 0;">' +
    '<div style="font-size:20px;font-weight:bold;padding:8px 0;text-decoration:line-through;">' + item.qty + ' x ' + item.name.toUpperCase() + '</div>' +
    '<div style="font-size:13px;padding:4px 0;">Lý do: ' + reason + '</div>' +
    '<hr style="border-top:1px dashed #000;margin:4px 0;">' +
    '<div style="font-size:11px;text-align:center;">--- HẾT PHIẾU HỦY ---</div>' +
    '<script>window.onload=function(){window.print();window.close();}<\/script>' +
    '</body></html>';
  var cfg = getPrinterCfg();
  var ip = dest === 'BẾP' ? cfg.kitchenIp : dest === 'BẾP SASHIMI' ? cfg.sashimiIp : cfg.barIp;
  if (cfg.useQzTray && ip) {
    _printViaQzTray(ip, [{ qty: item.qty, name: '❌HỦY ' + item.name + ' (' + reason + ')' }], table.name, 'HỦY ' + dest);
  } else {
    var w = window.open('', '_blank', 'width=380,height=400');
    if (w) { w.document.write(html); w.document.close(); }
  }
}

// ── Phase 2: Transfer Kitchen Modal ───
function _showTransferKitchenModal(itemId) {
  var orders = getOrders();
  var order = orders[_activeTableId];
  if (!order) return;
  var item = order.items.find(function(i) { return i.id === itemId; });
  if (!item || !item.isPrinted) return;
  var table = getTables().find(function(t) { return t.id === _activeTableId; }) || { name: '?' };
  var currentDest = item.kitchenDest || 'kitchen';

  var options = [
    { val: 'kitchen', label: '🍳 Bếp chính', color: '#10b981' },
    { val: 'sashimi', label: '🐟 Bếp Sashimi', color: '#f97316' },
    { val: 'bar', label: '🍹 Bar', color: '#6366f1' }
  ].filter(function(o) { return o.val !== currentDest; });

  var btnsHtml = options.map(function(o) {
    return '<button class="btn btn-outline btn-sm transfer-dest-btn" data-dest="' + o.val + '" style="color:' + o.color + ';border-color:' + o.color + '44;flex:1;padding:12px;">' + o.label + '</button>';
  }).join('');

  showModal(
    '<div class="modal-title"><span class="material-symbols-rounded" style="color:#0ea5e9;">swap_horiz</span> Chuyển bếp — ' + item.name + '</div>' +
    '<div style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;margin-bottom:16px;">' +
      '<div style="font-size:14px;">' + item.emoji + ' ' + item.qty + ' × ' + item.name + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Hiện tại: <strong>' + getKitchenDestLabel(currentDest) + '</strong></div>' +
    '</div>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Chọn bếp đích:</p>' +
    '<div style="display:flex;gap:8px;">' + btnsHtml + '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline" id="transferKitchenCancel">Hủy</button></div>'
  );
  setTimeout(function() {
    document.getElementById('transferKitchenCancel')?.addEventListener('click', function() { hideModal(); });
    document.querySelectorAll('.transfer-dest-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newDest = btn.dataset.dest;
        var oldDestLabel = getKitchenDestLabel(currentDest);
        var newDestLabel = getKitchenDestLabel(newDest);
        // Print cancel to old kitchen
        _printCancelTicket(table, item, oldDestLabel, 'Chuyển sang ' + newDestLabel);
        // Update destination
        item.kitchenDest = newDest;
        saveOrders(orders);
        // Print new ticket to new kitchen
        _printKitchenTicket(table, [item], newDestLabel);
        hideModal();
        showToast('🔄 Đã chuyển ' + item.name + ': ' + oldDestLabel + ' → ' + newDestLabel, 'success');
        window.refreshView();
      });
    });
  }, 80);
}

// ── Phase 2: Transfer Table Modal ─────
function _showTransferTableModal() {
  var orders = getOrders();
  var order = orders[_activeTableId];
  if (!order || !order.items || !order.items.length) {
    showToast('Bàn chưa có order để chuyển', 'warning'); return;
  }
  var tables = getTables();
  var currentTable = tables.find(function(t) { return t.id === _activeTableId; }) || { name: '?' };
  // Show available (empty) tables grouped by zone
  var zones = {};
  tables.forEach(function(t) {
    if (t.id === _activeTableId) return; // skip current
    if (!zones[t.zone]) zones[t.zone] = [];
    var hasOrder = orders[t.id] && orders[t.id].items && orders[t.id].items.length > 0;
    zones[t.zone].push({ id: t.id, name: t.name, busy: hasOrder });
  });

  var zoneHtml = Object.keys(zones).map(function(zone) {
    var btns = zones[zone].map(function(t) {
      return '<button class="btn btn-sm transfer-table-btn ' + (t.busy ? 'btn-outline' : '') + '" data-target-table="' + t.id + '" ' +
        'style="' + (t.busy ? 'opacity:.5;' : 'background:rgba(14,165,233,.1);color:#0ea5e9;border:1px solid rgba(14,165,233,.3);') + '"' +
        (t.busy ? ' title="Bàn đang có khách"' : '') + '>' + t.name + '</button>';
    }).join('');
    return '<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">' + zone + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + btns + '</div></div>';
  }).join('');

  showModal(
    '<div class="modal-title"><span class="material-symbols-rounded" style="color:#0ea5e9;">swap_horiz</span> Chuyển bàn — ' + currentTable.name + '</div>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Chọn bàn đích để chuyển toàn bộ order:</p>' +
    '<div style="max-height:50vh;overflow-y:auto;">' + zoneHtml + '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button></div>'
  );
  setTimeout(function() {
    document.querySelectorAll('.transfer-table-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.dataset.targetTable;
        var targetTable = tables.find(function(t) { return t.id === targetId; }) || { name: '?' };
        var targetOrder = orders[targetId];
        // If target has items, merge them
        if (targetOrder && targetOrder.items && targetOrder.items.length > 0) {
          targetOrder.items = targetOrder.items.concat(order.items);
        } else {
          orders[targetId] = { id: order.id, tableId: targetId, items: order.items, createdAt: order.createdAt };
        }
        // Clear old table order from cloud
        var completedSyncs = [];
        try { completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]'); } catch(e){}
        completedSyncs.push({
          orderId: order.id || 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
          tableId: _activeTableId,
          tableName: currentTable.name,
          itemsJson: JSON.stringify(order.items),
          total: orderTotal(order),
          createdAt: order.createdAt || new Date().toISOString(),
          revision: order.revision || 1,
          lastMutationId: order.lastMutationId || ''
        });
        localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

        // Remove old order
        delete orders[_activeTableId];
        saveOrders(orders);
        // Print transfer notice to all kitchens that have printed items
        var printedDests = {};
        order.items.forEach(function(i) {
          if (i.isPrinted && i.kitchenDest && i.status !== 'cancelled') printedDests[i.kitchenDest] = true;
        });
        Object.keys(printedDests).forEach(function(dest) {
          _printTransferNotice(currentTable, targetTable, getKitchenDestLabel(dest));
        });
        hideModal();
        showToast('✅ Đã chuyển ' + currentTable.name + ' → ' + targetTable.name, 'success');
        _activeTableId = targetId;
        window.refreshView();
      });
    });
  }, 80);
}

function _printTransferNotice(fromTable, toTable, dest) {
  var now = new Date().toLocaleString('vi-VN');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>*{margin:0;padding:0;}body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}' +
    '@media print{@page{size:80mm auto;margin:0;}}' +
    'h2{font-size:22px;text-align:center;border-bottom:3px solid #000;padding-bottom:4px;margin-bottom:6px;}</style></head><body>' +
    '<h2>🔄 CHUYỂN BÀN</h2>' +
    '<div style="font-size:11px;">' + now + ' → ' + dest + '</div><hr style="border-top:1px dashed #000;margin:4px 0;">' +
    '<div style="font-size:22px;font-weight:bold;text-align:center;padding:12px 0;">' + fromTable.name + ' → ' + toTable.name + '</div>' +
    '<hr style="border-top:1px dashed #000;margin:4px 0;">' +
    '<div style="font-size:11px;text-align:center;">Mang đồ sang bàn mới!</div>' +
    '<script>window.onload=function(){window.print();window.close();}<\/script>' +
    '</body></html>';
  var cfg = getPrinterCfg();
  var ip = dest === 'BẾP' ? cfg.kitchenIp : dest === 'BẾP SASHIMI' ? cfg.sashimiIp : cfg.barIp;
  if (cfg.useQzTray && ip) {
    _printViaQzTray(ip, [{ qty: 1, name: 'CHUYỂN BÀN: ' + fromTable.name + ' → ' + toTable.name }], fromTable.name, 'CHUYỂN');
  } else {
    var w = window.open('', '_blank', 'width=380,height=400');
    if (w) { w.document.write(html); w.document.close(); }
  }
}

// ── Phase 2: Merge Table Modal ────────
function _showMergeTableModal() {
  var orders = getOrders();
  var order = orders[_activeTableId];
  if (!order || !order.items || !order.items.length) {
    showToast('Bàn chưa có order để ghép', 'warning'); return;
  }
  var tables = getTables();
  var currentTable = tables.find(function(t) { return t.id === _activeTableId; }) || { name: '?' };
  // Show only tables that HAVE orders (to merge from)
  var mergeable = tables.filter(function(t) {
    if (t.id === _activeTableId) return false;
    var o = orders[t.id];
    return o && o.items && o.items.length > 0;
  });

  if (!mergeable.length) {
    showToast('Không có bàn nào khác đang có order để ghép', 'info'); return;
  }

  var btnsHtml = mergeable.map(function(t) {
    var o = orders[t.id];
    var itemCount = o.items.reduce(function(s, i) { return s + i.qty; }, 0);
    return '<button class="btn btn-outline btn-sm merge-table-btn" data-merge-table="' + t.id + '" style="color:#8b5cf6;border-color:rgba(139,92,246,.3);padding:10px 14px;">' +
      t.name + ' (' + itemCount + ' món — ' + fc(orderTotal(o)) + ')' + '</button>';
  }).join('');

  showModal(
    '<div class="modal-title"><span class="material-symbols-rounded" style="color:#8b5cf6;">call_merge</span> Ghép bàn vào ' + currentTable.name + '</div>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Chọn bàn để gộp order vào <strong>' + currentTable.name + '</strong>:</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + btnsHtml + '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Hủy</button></div>'
  );
  setTimeout(function() {
    document.querySelectorAll('.merge-table-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sourceId = btn.dataset.mergeTable;
        var sourceTable = tables.find(function(t) { return t.id === sourceId; }) || { name: '?' };
        var sourceOrder = orders[sourceId];
        if (!sourceOrder) return;
        // Clear merged source table from cloud
        var completedSyncs = [];
        try { completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]'); } catch(e){}
        completedSyncs.push({
          orderId: sourceOrder.id || 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
          tableId: sourceId,
          tableName: sourceTable.name,
          itemsJson: JSON.stringify(sourceOrder.items),
          total: orderTotal(sourceOrder),
          createdAt: sourceOrder.createdAt || new Date().toISOString(),
          revision: sourceOrder.revision || 1,
          lastMutationId: sourceOrder.lastMutationId || ''
        });
        localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

        // Merge items into current table
        order.items = order.items.concat(sourceOrder.items);
        delete orders[sourceId];
        saveOrders(orders);
        // Notify kitchens
        var printedDests = {};
        sourceOrder.items.forEach(function(i) {
          if (i.isPrinted && i.kitchenDest && i.status !== 'cancelled') printedDests[i.kitchenDest] = true;
        });
        Object.keys(printedDests).forEach(function(dest) {
          _printTransferNotice(sourceTable, currentTable, getKitchenDestLabel(dest));
        });
        hideModal();
        showToast('✅ Đã ghép ' + sourceTable.name + ' → ' + currentTable.name, 'success');
        window.refreshView();
      });
    });
  }, 80);
}

// ── Kitchen / Bar bell ───────────────
function _handleKitchenBell(table, order) {
  var unprinted = (order.items||[]).filter(function(i){ return !i.isPrinted; });
  if (!unprinted.length) { showToast('Tất cả món đã báo rồi', 'info'); return; }

  // Group by kitchen destination
  var groups = { kitchen: [], sashimi: [], bar: [] };
  unprinted.forEach(function(i) { groups[getKitchenDest(i)].push(i); });

  if (groups.kitchen.length) _printKitchenTicket(table, groups.kitchen, 'BẾP');
  if (groups.sashimi.length) _printKitchenTicket(table, groups.sashimi, 'BẾP SASHIMI');
  if (groups.bar.length)     _printKitchenTicket(table, groups.bar, 'BAR');

  // Mark printed with destination + timestamp
  var now = new Date().toISOString();
  order.items.forEach(function(i) {
    if (!i.isPrinted) {
      i.isPrinted = true;
      i.printedAt = now;
      i.kitchenDest = getKitchenDest(i);
      i.status = 'sent';
    }
  });
  var orders = getOrders();
  orders[_activeTableId] = order;
  saveOrders(orders);
  var parts = [];
  if (groups.kitchen.length) parts.push(groups.kitchen.length + ' bếp');
  if (groups.sashimi.length) parts.push(groups.sashimi.length + ' sashimi');
  if (groups.bar.length) parts.push(groups.bar.length + ' bar');
  showToast('🔔 Đã báo ' + parts.join(', '), 'success');
  window.refreshView();
}

function _printKitchenTicket(table, items, dest) {
  var now = new Date().toLocaleString('vi-VN');
  var rows = items.map(function(i) {
    return '<tr><td style="font-size:18px;padding:4px 0;font-weight:bold;">' + i.qty + ' x ' + i.name.toUpperCase() + '</td></tr>';
  }).join('');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>*{margin:0;padding:0;} body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}' +
    '@media print{@page{size:80mm auto;margin:0;}}' +
    'h2{font-size:20px;text-align:center;border-bottom:3px solid #000;padding-bottom:4px;margin-bottom:6px;}' +
    'table{width:100%;} hr{border-top:1px dashed #000;margin:4px 0;}</style></head><body>' +
    '<h2>⚡ PHIẾU ' + dest + '</h2>' +
    '<div><strong>' + table.name + '</strong></div>' +
    '<div style="font-size:11px;">' + now + '</div><hr>' +
    '<table>' + rows + '</table><hr>' +
    '<div style="font-size:11px;text-align:center;">--- HẾT PHIẾU ---</div>' +
    '<script>window.onload=function(){window.print();window.close();}<\/script>' +
    '</body></html>';
  // Try QZ Tray first, fallback to window.print()
  var cfg = getPrinterCfg();
  var ip = dest === 'BẾP' ? cfg.kitchenIp : dest === 'BẾP SASHIMI' ? cfg.sashimiIp : cfg.barIp;
  if (cfg.useQzTray && ip) {
    _printViaQzTray(ip, items, table.name, dest);
  } else {
    var w = window.open('', '_blank', 'width=380,height=500');
    if (w) { w.document.write(html); w.document.close(); }
    else showToast('Cho phép popup để in phiếu ' + dest, 'warning');
  }
}

// ── QZ Tray integration ───────────────
let _qzLoaded = false;
function _loadQzTray() {
  return new Promise(function(resolve, reject) {
    if (window.qz) return resolve();
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js';
    script.onload = function() {
      // Suppress signature warnings for local dev/testing
      qz.security.setCertificatePromise(function(resolve, reject) { resolve(); });
      qz.security.setSignaturePromise(function(toSign) { return function(resolve, reject) { resolve(); }; });
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function _printViaQzTray(printerIp, items, tableName, dest) {
  try {
    await _loadQzTray();
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 2, delay: 1 });
    }
    
    // QZ Tray uses the printer name as installed on the OS, OR an IP for raw printing
    // For direct IP network printers: host: '192.168.1.100', port: 9100
    var config = qz.configs.create({ host: printerIp, port: 9100 });
    
    var data = [];
    // ESC/POS: initialize, bold on, double size
    data.push('\x1B\x40');    // Init
    data.push('\x1B\x45\x01'); // Bold on
    data.push('\x1D\x21\x11'); // 2x size
    data.push('PHIEU ' + dest + '\n');
    data.push('\x1D\x21\x00'); // Normal size
    data.push('\x1B\x45\x00'); // Bold off
    data.push(tableName + ' - ' + new Date().toLocaleTimeString('vi-VN') + '\n');
    data.push('------------------------\n');
    items.forEach(function(i) {
      data.push(i.qty + 'x ' + i.name + '\n');
    });
    data.push('------------------------\n');
    data.push('\x1D\x56\x41\x05'); // Cut paper
    
    await qz.print(config, data);
    showToast('🖨️ Đã gửi lệnh in tới ' + dest + ' (' + printerIp + ')', 'success');
  } catch(err) {
    console.error('QZ Tray Error:', err);
    showToast('Lỗi in QZ Tray, đang mở popup...', 'warning');
    var w = window.open('', '_blank', 'width=380,height=500');
    if (w) { w.document.write(_buildTicketHtml(tableName, items, dest)); w.document.close(); }
  }
}
function _buildTicketHtml(tableName, items, dest) {
  var rows = items.map(function(i){ return '<tr><td style="font-size:18px;padding:4px 0;font-weight:bold;">' + i.qty + ' x ' + i.name.toUpperCase() + '</td></tr>'; }).join('');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;}body{font-family:"Courier New",monospace;font-size:14px;width:80mm;padding:6px;}@media print{@page{size:80mm auto;margin:0;}}h2{font-size:20px;text-align:center;border-bottom:3px solid #000;padding-bottom:4px;margin-bottom:6px;}table{width:100%;}hr{border-top:1px dashed #000;margin:4px 0;}</style></head><body>' +
    '<h2>⚡ PHIEU ' + dest + '</h2><div><strong>' + tableName + '</strong></div><hr><table>' + rows + '</table><hr>' +
    '<script>window.onload=function(){window.print();window.close();}<\/script></body></html>';
}

// ── Catalog Manager Modal ─────────────
function _showCatalogManager() {
  var catalog = getCatalog();
  function renderList() {
    return catalog.map(function(p, idx) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<span style="font-size:18px;">' + p.emoji + '</span>' +
        '<div style="flex:1;"><strong style="font-size:13px;">' + p.name + '</strong>' +
          '<div style="font-size:11px;color:var(--text-muted);">' + p.category + ' · ' + (p.type==='food'?'🍽️ Bếp':'🍹 Bar') + ' · ' + fc(p.price) + '</div>' +
        '</div>' +
        '<button class="btn-icon pos-cat-edit" data-idx="' + idx + '" title="Sửa"><span class="material-symbols-rounded" style="font-size:16px;">edit</span></button>' +
        '<button class="btn-icon pos-cat-del" data-idx="' + idx + '" style="color:var(--danger);" title="Xóa"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>' +
      '</div>';
    }).join('');
  }
  function openEdit(p, idx) {
    var isNew = idx === -1;
    showModal('<div class="modal-title">' + (isNew?'Thêm món':'Sửa món') + '</div>' +
      '<div class="form-group"><label class="form-label">Tên món</label><input id="pName" class="form-input" value="' + (p.name||'') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label class="form-label">Danh mục</label><input id="pCat" class="form-input" value="' + (p.category||'') + '"></div>' +
        '<div class="form-group"><label class="form-label">Emoji</label><input id="pEmoji" class="form-input" value="' + (p.emoji||'🍽️') + '" style="width:80px;"></div></div>' +
      '<div class="form-row"><div class="form-group"><label class="form-label">Giá (đ)</label><input id="pPrice" class="form-input" type="number" value="' + (p.price||0) + '"></div>' +
        '<div class="form-group"><label class="form-label">Loại</label><select id="pType" class="form-input"><option value="food"' + (p.type==='food'?' selected':'') + '>🍽️ Bếp (food)</option><option value="drink"' + (p.type==='drink'?' selected':'') + '>🍹 Bar (drink)</option></select></div></div>' +
      '<div class="modal-footer"><button class="btn btn-outline" id="pCancel">Huỷ</button><button class="btn btn-primary" id="pSave">' + (isNew?'Thêm':'Lưu') + '</button></div>');
    setTimeout(function() {
      document.getElementById('pCancel')?.addEventListener('click', function(){ hideModal(); _showCatalogManager(); });
      document.getElementById('pSave')?.addEventListener('click', function() {
        var nm = document.getElementById('pName')?.value.trim();
        if (!nm) { showToast('Nhập tên món', 'warning'); return; }
        var updated = { id: isNew?uid():p.id, name:nm, category:document.getElementById('pCat')?.value.trim()||'Khác',
          emoji:document.getElementById('pEmoji')?.value.trim()||'🍽️', price:Number(document.getElementById('pPrice')?.value)||0,
          type:document.getElementById('pType')?.value||'food' };
        if (isNew) catalog.push(updated); else catalog[idx] = updated;
        saveCatalog(catalog);
        hideModal();
        _showCatalogManager();
      });
    }, 80);
  }
  showModal('<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--primary);">menu_book</span> Quản lý Menu (' + catalog.length + ' món)</div>' +
    '<div style="max-height:50vh;overflow-y:auto;" id="posCatList">' + renderList() + '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline" onclick="window.hideModal()">Đóng</button>' +
      '<button class="btn btn-primary" id="btnPosCatAdd"><span class="material-symbols-rounded">add</span> Thêm món</button></div>');
  setTimeout(function() {
    document.getElementById('btnPosCatAdd')?.addEventListener('click', function(){ openEdit({name:'',category:'',emoji:'🍽️',price:0,type:'food'},-1); });
    document.querySelectorAll('.pos-cat-edit').forEach(function(btn) {
      btn.addEventListener('click', function(){ openEdit(catalog[+btn.dataset.idx], +btn.dataset.idx); });
    });
    document.querySelectorAll('.pos-cat-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        catalog.splice(+btn.dataset.idx, 1); saveCatalog(catalog);
        document.getElementById('posCatList').innerHTML = renderList();
        // Re-bind after re-render
        document.querySelectorAll('.pos-cat-edit').forEach(function(b){ b.addEventListener('click', function(){ openEdit(catalog[+b.dataset.idx], +b.dataset.idx); }); });
        document.querySelectorAll('.pos-cat-del').forEach(function(b){ b.addEventListener('click', function(){ catalog.splice(+b.dataset.idx,1); saveCatalog(catalog); document.getElementById('posCatList').innerHTML=renderList(); }); });
      });
    });
  }, 80);
}

// ── Checkout Modal ────────────────────
function _showCheckoutModal(table, order) {
  var total = orderTotal(order);
  var itemsList = (order.items||[]).map(function(i) {
    return '<tr><td>' + i.emoji + ' ' + i.name + '</td><td style="text-align:right;">' + i.qty + ' × ' + fc(i.price) + '</td><td style="text-align:right;font-weight:600;">' + fc(i.qty * i.price) + '</td></tr>';
  }).join('');

  showModal(
    '<div class="modal-title"><span class="material-symbols-rounded" style="color:var(--success);">payments</span> Thanh toán — ' + table.name + '</div>' +
    '<table class="report-table" style="margin-bottom:12px;">' +
    '<tr style="background:var(--bg-secondary);"><th>Món</th><th style="text-align:right;">SL × Giá</th><th style="text-align:right;">Thành tiền</th></tr>' +
    itemsList +
    '<tr style="border-top:2px solid var(--border);"><td><strong>TỔNG CỘNG</strong></td><td></td><td style="text-align:right;"><strong style="color:var(--success);font-size:16px;">' + fc(total) + '</strong></td></tr>' +
    '</table>' +
    '<div class="form-group">' +
      '<label class="form-label">Phương thức thanh toán</label>' +
      '<div id="posPayMethodRow" style="display:flex;gap:8px;">' +
        '<button class="btn btn-primary pos-pay-method-btn active" data-method="cash">💵 Tiền mặt</button>' +
        '<button class="btn btn-outline pos-pay-method-btn" data-method="transfer">🏦 Chuyển khoản</button>' +
        '<button class="btn btn-outline pos-pay-method-btn" data-method="card">💳 Quẹt thẻ</button>' +
      '</div>' +
      '<div id="posCheckoutQrContainer" style="display:none; text-align:center; margin-top:12px; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; animation: fadeIn 0.2s ease;"></div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Ghi chú (tuỳ chọn)</label>' +
      '<input type="text" id="posCheckoutNote" class="form-input" placeholder="Số khách, voucher...">' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-outline" onclick="window.hideModal()">Huỷ</button>' +
      '<button class="btn btn-outline" id="btnPosPrintFinal">🖨️ In tạm tính</button>' +
      '<button class="btn btn-primary" id="btnPosConfirmPay">✅ Xác nhận thanh toán</button>' +
    '</div>'
  );

  setTimeout(function() {
    var selectedMethod = 'cash';

    function updateCheckoutQr() {
      var qrContainer = document.getElementById('posCheckoutQrContainer');
      if (!qrContainer) return;
      if (selectedMethod === 'transfer') {
        var settings = getSettings();
        var lastSelected = settings.extension && settings.extension.lastSelectedQr;
        var firstTpl = settings.extension && settings.extension.qrTemplates && settings.extension.qrTemplates[0];
        var qrConfig = lastSelected || firstTpl;

        if (qrConfig && qrConfig.bank && qrConfig.acc) {
          var bank = qrConfig.bank;
          var acc = qrConfig.acc;
          var name = qrConfig.name || '';
          var content = 'KG POS Ban ' + table.name;
          var qrUrl = 'https://img.vietqr.io/image/' + bank + '-' + acc + '-compact2.png?amount=' + total + '&addInfo=' + encodeURIComponent(content) + '&accountName=' + encodeURIComponent(name);
          
          qrContainer.innerHTML = 
            '<div style="font-weight:700;font-size:12px;color:#0ea5e9;margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:4px;">' +
              '<span class="material-symbols-rounded" style="font-size:16px;">qr_code_2</span> QUÉT MÃ VIETQR CHUYỂN KHOẢN' +
            '</div>' +
            '<div style="display:inline-block;background:white;padding:6px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);margin:6px 0;">' +
              '<img src="' + qrUrl + '" style="width:160px;height:160px;object-fit:cover;border-radius:8px;">' +
            '</div>' +
            '<div style="font-size:12px;font-weight:800;color:var(--text-main);">' + bank + ' - ' + acc + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">' + name + '</div>' +
            '<div style="font-size:11px;color:#0ea5e9;font-weight:700;margin-top:2px;">Nội dung: ' + content + '</div>';
          qrContainer.style.display = 'block';
        } else {
          qrContainer.innerHTML = 
            '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">' +
              '⚠️ Chưa cấu hình tài khoản nhận chuyển khoản.<br>' +
              '<span style="font-size:11px;color:#a855f7;cursor:pointer;font-weight:700;" onclick="window.hideModal(); window.navigateTo(\'extension\')">Cấu hình ngay tại đây →</span>' +
            '</div>';
          qrContainer.style.display = 'block';
        }
      } else {
        qrContainer.style.display = 'none';
      }
    }

    document.querySelectorAll('.pos-pay-method-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectedMethod = btn.dataset.method;
        document.querySelectorAll('.pos-pay-method-btn').forEach(function(b) {
          b.classList.remove('active');
          b.classList.remove('btn-primary');
          b.classList.add('btn-outline');
        });
        btn.classList.add('active');
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
        updateCheckoutQr();
      });
    });

    document.getElementById('btnPosPrintFinal')?.addEventListener('click', function() {
      _printBill(table, order, false);
    });

    document.getElementById('btnPosConfirmPay')?.addEventListener('click', function() {
      var shift = getCurrentShift();
      if (!shift) { showToast('⚠️ Chưa mở ca! Hãy mở ca trước khi thanh toán.', 'warning'); return; }
      var note = document.getElementById('posCheckoutNote')?.value || '';
      var itemNames = (order.items||[]).map(function(i){ return i.qty + 'x ' + i.name; }).join(', ');
      try {
        addTransaction({
          type: 'income',
          category: 'POS — ' + table.name,
          amount: total,
          paymentMethod: selectedMethod,
          note: note || itemNames
        });
        // Clear order & record completed sync
        var completedSyncs = [];
        try { completedSyncs = JSON.parse(localStorage.getItem('kg-pos-completed-syncs') || '[]'); } catch(e){}
        completedSyncs.push({
          orderId: order.id || 'pos_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
          tableId: _activeTableId,
          tableName: table.name,
          itemsJson: JSON.stringify(order.items),
          total: total,
          createdAt: order.createdAt || new Date().toISOString(),
          revision: order.revision || 1,
          lastMutationId: order.lastMutationId || ''
        });
        localStorage.setItem('kg-pos-completed-syncs', JSON.stringify(completedSyncs));

        var orders = getOrders();
        delete orders[_activeTableId];
        saveOrders(orders);
        hideModal();
        // Print final bill
        _printBill(table, order, true);
        showToast('✅ Thanh toán ' + table.name + ' — ' + fc(total), 'success');
        _screen = 'tables';
        _activeTableId = null;
        window.refreshView();
      } catch(e) {
        showToast(e.message, 'error');
      }
    });
  }, 100);
}

// ── Print bill K80 ────────────────────
function _printBill(table, order, isFinal) {
  var total = orderTotal(order);
  var now = new Date().toLocaleString('vi-VN');
  var rows = (order.items||[]).map(function(i) {
    return '<tr><td style="padding:2px 0;">' + i.name + '<br><small>' + i.qty + ' × ' + fc(i.price) + '</small></td>' +
      '<td style="text-align:right;vertical-align:middle;">' + fc(i.qty * i.price) + '</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}' +
    'body{font-family:\'Courier New\',monospace;font-size:12px;width:80mm;padding:4px;}' +
    '@media print{@page{size:80mm auto;margin:0;}}' +
    'h2{font-size:14px;text-align:center;margin-bottom:2px;}' +
    '.center{text-align:center;} .right{text-align:right;}' +
    'hr{border:none;border-top:1px dashed #000;margin:4px 0;}' +
    'table{width:100%;border-collapse:collapse;}' +
    '.total{font-size:15px;font-weight:bold;}</style></head><body>' +
    '<h2>KING\'s GRILL</h2>' +
    '<div class="center" style="font-size:10px;margin-bottom:4px;">34 Hoàng Văn Thụ, Phú Nhuận</div>' +
    '<hr>' +
    '<div>' + table.name + (isFinal ? ' — HÓA ĐƠN THANH TOÁN' : ' — PHIẾU TẠM TÍNH') + '</div>' +
    '<div style="font-size:10px;color:#555;">' + now + '</div>' +
    '<hr>' +
    '<table>' + rows + '</table>' +
    '<hr>' +
    '<div class="right total">TỔNG: ' + fc(total) + '</div>' +
    (isFinal ? '<hr><div class="center" style="font-size:10px;margin-top:4px;">Cảm ơn quý khách!<br>Hẹn gặp lại 🙏</div>' : '') +
    '<script>window.onload=function(){window.print();window.close();}<\/script>' +
    '</body></html>';

  var w = window.open('', '_blank', 'width=400,height=600');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('Vui lòng cho phép popup để in bill', 'warning');
}

export function destroy() {
  // Reset state when leaving view
  _screen = 'tables';
  _activeTableId = null;
  _searchQ = '';
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}
