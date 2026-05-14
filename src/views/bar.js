/* ============================================
   KG-CASHIER — Bar / Kitchen Dashboard
   Real-time ticket display for Bar or Kitchen stations
   ============================================ */
import { showToast } from '../utils.js';

// ── Config ────────────────────────────
var ORDERS_KEY = 'kg-pos-orders';
var TABLES_KEY = 'kg-pos-tables';
var _refreshTimer = null;
var _viewMode = 'bar'; // 'bar' | 'kitchen' | 'sashimi' | 'all'
var _channel = null;

function getOrders() {
  try { var s = localStorage.getItem(ORDERS_KEY); if (s) return JSON.parse(s); } catch(e){}
  return {};
}

function getTables() {
  try { var s = localStorage.getItem(TABLES_KEY); if (s) return JSON.parse(s); } catch(e){}
  return [];
}

function saveOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  // Notify other tabs
  if (_channel) {
    try { _channel.postMessage({ type: 'orders-updated', source: 'bar' }); } catch(e){}
  }
}

// ── Helpers ───────────────────────────
function _fc(n) { return (Number(n)||0).toLocaleString('vi-VN') + 'đ'; }

function _timeSince(iso) {
  if (!iso) return '';
  var ms = Date.now() - new Date(iso).getTime();
  var min = Math.floor(ms / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return min + ' phút';
  return Math.floor(min / 60) + 'h' + (min % 60) + 'p';
}

function _getTickets() {
  var orders = getOrders();
  var tables = getTables();
  var tableMap = {};
  tables.forEach(function(t) { tableMap[t.id] = t; });

  var tickets = [];
  Object.keys(orders).forEach(function(tableId) {
    var order = orders[tableId];
    if (!order || !order.items || !order.items.length) return;
    var table = tableMap[tableId] || { name: tableId, zone: '?' };

    // Group printed items by destination
    var groups = {};
    order.items.forEach(function(item) {
      if (item.status === 'cancelled') return;
      var dest = item.kitchenDest || (item.type === 'drink' ? 'bar' : 'kitchen');
      // Filter by view mode
      if (_viewMode !== 'all' && dest !== _viewMode) return;
      if (!groups[dest]) groups[dest] = { items: [], printedAt: null };
      groups[dest].items.push(item);
      if (item.printedAt && (!groups[dest].printedAt || item.printedAt < groups[dest].printedAt)) {
        groups[dest].printedAt = item.printedAt;
      }
    });

    Object.keys(groups).forEach(function(dest) {
      var g = groups[dest];
      if (!g.items.length) return;
      var allCooked = g.items.every(function(i) { return i.status === 'cooked'; });
      var hasUncooked = g.items.some(function(i) { return i.isPrinted && i.status !== 'cooked'; });
      tickets.push({
        tableId: tableId,
        tableName: table.name,
        zone: table.zone,
        dest: dest,
        items: g.items,
        printedAt: g.printedAt,
        allCooked: allCooked,
        hasUncooked: hasUncooked,
        orderId: order.id
      });
    });
  });

  // Sort: uncooked first, oldest first
  tickets.sort(function(a, b) {
    if (a.allCooked !== b.allCooked) return a.allCooked ? 1 : -1;
    var ta = a.printedAt || '9999';
    var tb = b.printedAt || '9999';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return tickets;
}

// ── Mark item as cooked ───────────────
function _markItemCooked(tableId, itemId) {
  var orders = getOrders();
  var order = orders[tableId];
  if (!order) return;
  var item = order.items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  item.status = 'cooked';
  item.cookedAt = new Date().toISOString();
  saveOrders(orders);
}

function _markAllCooked(tableId, dest) {
  var orders = getOrders();
  var order = orders[tableId];
  if (!order) return;
  order.items.forEach(function(i) {
    var iDest = i.kitchenDest || (i.type === 'drink' ? 'bar' : 'kitchen');
    if (iDest === dest && i.status !== 'cancelled' && i.status !== 'cooked') {
      i.status = 'cooked';
      i.cookedAt = new Date().toISOString();
    }
  });
  saveOrders(orders);
}

// ── RENDER ────────────────────────────
export function render() {
  var tickets = _getTickets();

  var modeLabels = {
    'bar': { icon: '🍹', label: 'Bar', color: '#6366f1' },
    'kitchen': { icon: '🍳', label: 'Bếp chính', color: '#10b981' },
    'sashimi': { icon: '🐟', label: 'Bếp Sashimi', color: '#f97316' },
    'all': { icon: '📋', label: 'Tất cả', color: 'var(--primary)' }
  };
  var mode = modeLabels[_viewMode];

  // Mode tabs
  var modeTabs = Object.keys(modeLabels).map(function(key) {
    var m = modeLabels[key];
    var isActive = key === _viewMode;
    return '<button class="bar-mode-tab' + (isActive ? ' active' : '') + '" data-bar-mode="' + key + '" ' +
      'style="' + (isActive ? 'background:' + m.color + '22;color:' + m.color + ';border-color:' + m.color + ';' : '') + '">' +
      m.icon + ' ' + m.label + '</button>';
  }).join('');

  // Stats
  var totalItems = tickets.reduce(function(s, t) {
    return s + t.items.filter(function(i) { return i.isPrinted && i.status !== 'cooked'; }).length;
  }, 0);
  var totalTickets = tickets.filter(function(t) { return !t.allCooked; }).length;

  // Ticket cards
  var ticketCards = tickets.map(function(ticket) {
    var destInfo = modeLabels[ticket.dest] || modeLabels['kitchen'];
    var elapsed = _timeSince(ticket.printedAt);
    var urgency = '';
    if (ticket.printedAt && !ticket.allCooked) {
      var min = Math.floor((Date.now() - new Date(ticket.printedAt).getTime()) / 60000);
      if (min >= 15) urgency = 'bar-ticket-urgent';
      else if (min >= 8) urgency = 'bar-ticket-warning';
    }

    var itemRows = ticket.items.map(function(item) {
      var isCooked = item.status === 'cooked';
      var isPending = !item.isPrinted;
      return '<div class="bar-item-row' + (isCooked ? ' cooked' : '') + '">' +
        '<div class="bar-item-info">' +
          '<span class="bar-item-qty">' + item.qty + '×</span>' +
          '<span class="bar-item-name">' + item.name + '</span>' +
          (item.note ? '<span class="bar-item-note">' + item.note + '</span>' : '') +
        '</div>' +
        (isCooked
          ? '<span class="bar-item-done">✔ Xong</span>'
          : isPending
            ? '<span class="bar-item-pending">⏳ Chờ</span>'
            : '<button class="bar-item-cook-btn" data-cook-table="' + ticket.tableId + '" data-cook-item="' + item.id + '">✅ Xong</button>') +
      '</div>';
    }).join('');

    return '<div class="bar-ticket ' + urgency + (ticket.allCooked ? ' bar-ticket-done' : '') + '">' +
      '<div class="bar-ticket-header">' +
        '<div class="bar-ticket-table">' +
          '<span class="bar-ticket-table-name">' + ticket.tableName + '</span>' +
          '<span class="bar-ticket-zone">' + ticket.zone + '</span>' +
        '</div>' +
        '<div class="bar-ticket-meta">' +
          '<span class="bar-ticket-dest" style="color:' + destInfo.color + ';">' + destInfo.icon + ' ' + destInfo.label + '</span>' +
          (elapsed ? '<span class="bar-ticket-time">⏱ ' + elapsed + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="bar-ticket-items">' + itemRows + '</div>' +
      (ticket.hasUncooked
        ? '<div class="bar-ticket-footer">' +
            '<button class="btn btn-sm bar-all-done-btn" data-alldone-table="' + ticket.tableId + '" data-alldone-dest="' + ticket.dest + '" ' +
              'style="background:' + destInfo.color + '22;color:' + destInfo.color + ';border:1px solid ' + destInfo.color + '33;">' +
              '<span class="material-symbols-rounded">done_all</span> Tất cả xong</button>' +
          '</div>'
        : '') +
    '</div>';
  }).join('');

  if (!ticketCards) {
    ticketCards = '<div class="bar-empty">' +
      '<span class="material-symbols-rounded" style="font-size:64px;opacity:.2;">restaurant</span>' +
      '<h3 style="margin:12px 0 4px;">Không có phiếu nào</h3>' +
      '<p style="color:var(--text-muted);">Phiếu sẽ hiện khi thu ngân báo bếp/bar</p>' +
    '</div>';
  }

  return '<div class="bar-shell">' +
    '<div class="bar-header">' +
      '<div class="bar-header-left">' +
        '<span class="material-symbols-rounded" style="color:' + mode.color + ';font-size:28px;">monitor_heart</span>' +
        '<div><h3 style="margin:0;font-size:17px;">Dashboard ' + mode.label + '</h3>' +
        '<small style="color:var(--text-muted);">' + totalTickets + ' phiếu · ' + totalItems + ' món chờ</small></div>' +
      '</div>' +
      '<div class="bar-header-right">' +
        '<div class="bar-mode-tabs">' + modeTabs + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="bar-tickets-grid">' + ticketCards + '</div>' +
  '</div>';
}

// ── INIT ──────────────────────────────
export function init() {
  // Mode tabs
  document.querySelectorAll('[data-bar-mode]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _viewMode = btn.dataset.barMode;
      window.refreshView();
    });
  });

  // Cook single item
  document.querySelectorAll('[data-cook-item]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _markItemCooked(btn.dataset.cookTable, btn.dataset.cookItem);
      showToast('✅ Xong 1 món', 'success');
      window.refreshView();
    });
  });

  // Cook all items in ticket
  document.querySelectorAll('[data-alldone-table]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _markAllCooked(btn.dataset.alldoneTable, btn.dataset.alldoneDest);
      showToast('✅ Tất cả xong!', 'success');
      window.refreshView();
    });
  });

  // BroadcastChannel: listen for order updates from POS
  try {
    _channel = new BroadcastChannel('kg-pos-sync');
    _channel.onmessage = function(e) {
      if (e.data && e.data.type === 'orders-updated' && e.data.source !== 'bar') {
        window.refreshView();
      }
    };
  } catch(e) {
    // BroadcastChannel not supported
  }

  // Auto-refresh every 5s (polling fallback for cross-device)
  _refreshTimer = setInterval(function() {
    window.refreshView();
  }, 5000);
}

// ── DESTROY ───────────────────────────
export function destroy() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  if (_channel) { try { _channel.close(); } catch(e){} _channel = null; }
}
