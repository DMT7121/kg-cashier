/* ════════════════════════════════════════════════
   KIỂM KHO ĐỒ UỐNG — Drink Inventory View
   DrinkStock Pro integrated into KG-Cashier
   ════════════════════════════════════════════════ */
import { getCurrentShift, addAudit } from '../store.js';
import { showToast, formatCurrency, showModal, hideModal } from '../utils.js';

// ── Storage Keys ──────────────────────────────
const DRINK_STORE_KEY = 'kg-drink-inventory';
const DRINK_PRODUCTS_KEY = 'kg-drink-products';

// ── Default Products ──────────────────────────
const DEFAULT_PRODUCTS = [
  { id: 'dp1',  name: 'Trà Sữa Trân Châu',    category: 'Trà sữa',    unit: 'ly',   emoji: '🧋', active: true, sort: 1 },
  { id: 'dp2',  name: 'Hồng Trà Kem Cheese',   category: 'Trà sữa',    unit: 'ly',   emoji: '🍵', active: true, sort: 2 },
  { id: 'dp3',  name: 'Matcha Latte',           category: 'Đặc biệt',   unit: 'ly',   emoji: '🍵', active: true, sort: 3 },
  { id: 'dp4',  name: 'Cà Phê Sữa Đá',        category: 'Cà phê',      unit: 'ly',   emoji: '☕', active: true, sort: 4 },
  { id: 'dp5',  name: 'Cà Phê Đen',            category: 'Cà phê',      unit: 'ly',   emoji: '☕', active: true, sort: 5 },
  { id: 'dp6',  name: 'Sinh Tố Xoài',          category: 'Sinh tố',     unit: 'ly',   emoji: '🥭', active: true, sort: 6 },
  { id: 'dp7',  name: 'Sinh Tố Bơ',            category: 'Sinh tố',     unit: 'ly',   emoji: '🥑', active: true, sort: 7 },
  { id: 'dp8',  name: 'Nước Chanh Muối',        category: 'Nước ép',     unit: 'ly',   emoji: '🍋', active: true, sort: 8 },
  { id: 'dp9',  name: 'Nước Ép Dưa Hấu',       category: 'Nước ép',     unit: 'ly',   emoji: '🍉', active: true, sort: 9 },
  { id: 'dp10', name: 'Bia Tiger',              category: 'Bia',         unit: 'lon',  emoji: '🍺', active: true, sort: 10 },
  { id: 'dp11', name: 'Bia Heineken',           category: 'Bia',         unit: 'lon',  emoji: '🍺', active: true, sort: 11 },
  { id: 'dp12', name: 'Bia 333',                category: 'Bia',         unit: 'lon',  emoji: '🍺', active: true, sort: 12 },
  { id: 'dp13', name: 'Coca Cola',              category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', active: true, sort: 13 },
  { id: 'dp14', name: 'Pepsi',                  category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', active: true, sort: 14 },
  { id: 'dp15', name: 'Nước Khoáng Lavie',      category: 'Nước suối',   unit: 'chai', emoji: '💧', active: true, sort: 15 },
  { id: 'dp16', name: 'Red Bull',               category: 'Nước tăng lực', unit: 'lon', emoji: '⚡', active: true, sort: 16 },
  { id: 'dp17', name: 'Sữa Tươi Không Đường',  category: 'Sữa',         unit: 'hộp', emoji: '🥛', active: true, sort: 17 },
  { id: 'dp18', name: 'Trà Đào',               category: 'Trà',         unit: 'ly',   emoji: '🍑', active: true, sort: 18 },
  { id: 'dp19', name: 'Trà Vải',               category: 'Trà',         unit: 'ly',   emoji: '🫐', active: true, sort: 19 },
  { id: 'dp20', name: 'Nước Dừa',              category: 'Tự nhiên',    unit: 'trái', emoji: '🥥', active: true, sort: 20 },
];

// ── Formula Parser ────────────────────────────
function parseFormula(input) {
  if (!input || String(input).trim() === '') return { value: 0, formula: '', isFormula: false };
  var trimmed = String(input).trim();

  // Plain number
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: parseFloat(trimmed), formula: '', isFormula: false };
  }

  // Has operators → is a formula
  if (/[+\-*/()]/.test(trimmed)) {
    try {
      // Sanitize: only allow digits, operators, spaces, dots, parens
      var sanitized = trimmed.replace(/[^0-9+\-*/().  ]/g, '');
      if (!sanitized) return { value: 0, formula: trimmed, isFormula: false, error: 'Không hợp lệ' };
      // Safe eval via Function constructor
      var result = new Function('return (' + sanitized + ')')();
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return { value: 0, formula: trimmed, isFormula: false, error: 'Kết quả không hợp lệ' };
      }
      return { value: Math.round(result * 1000) / 1000, formula: trimmed, isFormula: true };
    } catch (e) {
      return { value: 0, formula: trimmed, isFormula: false, error: 'Công thức lỗi' };
    }
  }

  // Try parse as number
  var num = parseFloat(trimmed);
  if (!isNaN(num)) return { value: num, formula: '', isFormula: false };
  return { value: 0, formula: trimmed, isFormula: false, error: 'Không hợp lệ' };
}

function formatNum(v) {
  if (v == null || isNaN(v)) return '0';
  if (Number.isInteger(v)) return v.toLocaleString('vi-VN');
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function calcActualSold(opening, newImport, closing) {
  return Math.max(0, opening + newImport - closing);
}

function calcDifference(actualSold, cukcukSold) {
  var diff = Math.round((actualSold - cukcukSold) * 100) / 100;
  if (diff === 0) return { difference: 0, type: 'MATCH' };
  if (diff > 0) return { difference: diff, type: 'SURPLUS' };
  return { difference: diff, type: 'SHORTAGE' };
}

// ── Unique ID ─────────────────────────────────
function uid() {
  return 'di_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// ── Data Store ────────────────────────────────
function getProducts() {
  try {
    var saved = localStorage.getItem(DRINK_PRODUCTS_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) { /* ignore */ }
  // First-time: save defaults
  localStorage.setItem(DRINK_PRODUCTS_KEY, JSON.stringify(DEFAULT_PRODUCTS));
  return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
}

function saveProducts(products) {
  localStorage.setItem(DRINK_PRODUCTS_KEY, JSON.stringify(products));
}

function getInventoryData() {
  try {
    var saved = localStorage.getItem(DRINK_STORE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return { sessions: {} };
}

function saveInventoryData(data) {
  localStorage.setItem(DRINK_STORE_KEY, JSON.stringify(data));
}

function getSessionKey(date, shiftName) {
  return date + '_' + shiftName;
}

function getCurrentSession(date, shiftName) {
  var data = getInventoryData();
  var key = getSessionKey(date, shiftName);
  return data.sessions[key] || null;
}

function saveCurrentSession(date, shiftName, session) {
  var data = getInventoryData();
  var key = getSessionKey(date, shiftName);
  data.sessions[key] = session;
  saveInventoryData(data);
}

function createSession(date, shiftName) {
  var products = getProducts().filter(function(p) { return p.active; });
  var rows = products.map(function(p) {
    return {
      id: uid(),
      productId: p.id,
      openingStock: 0,
      openingFormula: '',
      newImport: 0,
      newImportFormula: '',
      closingStock: 0,
      closingFormula: '',
      actualSold: 0,
      cukcukSold: 0,
      difference: 0,
      differenceType: 'MATCH',
      notes: ''
    };
  });
  var session = {
    id: uid(),
    date: date,
    shiftName: shiftName,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    rows: rows
  };
  saveCurrentSession(date, shiftName, session);
  return session;
}

// ── State ─────────────────────────────────────
var _currentDate = new Date().toISOString().split('T')[0];
var _currentShiftName = 'Ca sáng';
var _sortBy = 'name';
var _showOnlyDiff = false;
var _expandedRow = null;
var _showProductManager = false;
var _showReport = false;

const SHIFT_OPTIONS = [
  { value: 'Ca sáng', label: 'Ca sáng (6:00-14:00)', icon: '🌅' },
  { value: 'Ca chiều', label: 'Ca chiều (14:00-22:00)', icon: '🌆' },
  { value: 'Ca tối', label: 'Ca tối (22:00-6:00)', icon: '🌙' },
];

// ── RENDER ─────────────────────────────────────
export function render() {
  var session = getCurrentSession(_currentDate, _currentShiftName);
  if (!session) session = createSession(_currentDate, _currentShiftName);

  var products = getProducts();
  var rows = session.rows || [];

  // Build product lookup
  var pMap = {};
  products.forEach(function(p) { pMap[p.id] = p; });

  // Filter & sort rows
  var displayRows = rows.filter(function(r) {
    if (_showOnlyDiff) return r.differenceType !== 'MATCH';
    return true;
  });

  if (_sortBy === 'difference') {
    displayRows.sort(function(a, b) { return Math.abs(b.difference) - Math.abs(a.difference); });
  } else {
    displayRows.sort(function(a, b) {
      var pa = pMap[a.productId] || {};
      var pb = pMap[b.productId] || {};
      return (pa.name || '').localeCompare(pb.name || '');
    });
  }

  // Stats
  var stats = { total: rows.length, match: 0, surplus: 0, shortage: 0 };
  rows.forEach(function(r) {
    if (r.differenceType === 'MATCH') stats.match++;
    else if (r.differenceType === 'SURPLUS') stats.surplus++;
    else if (r.differenceType === 'SHORTAGE') stats.shortage++;
  });

  // Current shift indicator
  var currentShiftOption = SHIFT_OPTIONS.find(function(s) { return s.value === _currentShiftName; }) || SHIFT_OPTIONS[0];

  return `
    <div class="di-wrapper">
      <!-- ═══ TOOLBAR ═══ -->
      <div class="di-toolbar">
        <div class="di-toolbar-left">
          <div class="di-brand-badge">
            <span>🥤</span>
            <div>
              <strong>DrinkStock</strong>
              <small>Kiểm kho đồ uống</small>
            </div>
          </div>
        </div>
        <div class="di-toolbar-center">
          <div class="di-control-group">
            <span class="material-symbols-rounded" style="color:var(--text-muted);font-size:18px;">calendar_today</span>
            <input type="date" class="form-input di-date-input" id="diDate" value="${_currentDate}">
          </div>
          <div class="di-control-group">
            <span style="font-size:16px;">${currentShiftOption.icon}</span>
            <select class="form-input di-shift-select" id="diShift">
              ${SHIFT_OPTIONS.map(function(s) {
                return '<option value="' + s.value + '" ' + (s.value === _currentShiftName ? 'selected' : '') + '>' + s.label + '</option>';
              }).join('')}
            </select>
          </div>
        </div>
        <div class="di-toolbar-right">
          <button class="btn btn-sm btn-outline" id="btnDiManageProducts" title="Quản lý sản phẩm">
            <span class="material-symbols-rounded">tune</span> Sản phẩm
          </button>
          <button class="btn btn-sm btn-success" id="btnDiReport" title="Tạo báo cáo">
            <span class="material-symbols-rounded">summarize</span> Báo cáo
          </button>
        </div>
      </div>

      <!-- ═══ HEADER GRADIENT ═══ -->
      <div class="di-header-card">
        <div class="di-header-top">
          <div>
            <h2 class="di-header-title">Kiểm kho đồ uống — ${_currentShiftName}</h2>
            <p class="di-header-sub">${new Date(_currentDate + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div class="di-header-actions">
            <button class="di-sync-btn" id="btnDiSyncCukcuk" title="Đồng bộ số lượng bán từ CUKCUK">
              <span class="material-symbols-rounded">sync</span>
              Đồng bộ CUKCUK
            </button>
          </div>
        </div>
        <div class="di-stats-row">
          <div class="di-stat di-stat-total">
            <span class="material-symbols-rounded" style="font-size:14px;">inventory_2</span>
            <span>Tổng SP</span>
            <strong>${stats.total}</strong>
          </div>
          <div class="di-stat di-stat-match">
            <span class="material-symbols-rounded" style="font-size:14px;">check_circle</span>
            <span>Khớp</span>
            <strong>${stats.match}</strong>
          </div>
          <div class="di-stat di-stat-surplus">
            <span class="material-symbols-rounded" style="font-size:14px;">trending_up</span>
            <span>Dư</span>
            <strong>${stats.surplus}</strong>
          </div>
          <div class="di-stat di-stat-shortage">
            <span class="material-symbols-rounded" style="font-size:14px;">trending_down</span>
            <span>Thiếu</span>
            <strong>${stats.shortage}</strong>
          </div>
        </div>
      </div>

      <!-- ═══ FILTER BAR ═══ -->
      <div class="di-filter-bar">
        <div class="di-filter-left">
          <button class="di-filter-btn ${_sortBy === 'name' ? 'active' : ''}" data-sort="name">
            <span class="material-symbols-rounded" style="font-size:14px;">sort_by_alpha</span> Tên A→Z
          </button>
          <button class="di-filter-btn ${_sortBy === 'difference' ? 'active' : ''}" data-sort="difference">
            <span class="material-symbols-rounded" style="font-size:14px;">swap_vert</span> Chênh lệch
          </button>
          <span class="di-filter-divider">|</span>
          <label class="di-filter-toggle">
            <input type="checkbox" id="diFilterDiff" ${_showOnlyDiff ? 'checked' : ''}>
            <span>Chỉ xem chênh lệch</span>
          </label>
        </div>
        <div class="di-filter-right">
          <span class="text-muted" style="font-size:11px;">Hiển thị ${displayRows.length}/${rows.length} sản phẩm</span>
        </div>
      </div>

      <!-- ═══ TABLE ═══ -->
      <div class="di-table-wrap">
        <table class="di-table" id="diTable">
          <thead>
            <tr class="di-thead-main">
              <th class="di-th-product" style="width:200px;">Sản phẩm</th>
              <th class="di-th-group di-th-opening" colspan="3">
                <span class="material-symbols-rounded" style="font-size:13px;">light_mode</span> ĐẦU CA
              </th>
              <th class="di-th-group di-th-closing" colspan="1">
                <span class="material-symbols-rounded" style="font-size:13px;">dark_mode</span> CUỐI CA
              </th>
              <th class="di-th-group di-th-actual" colspan="1">
                <span class="material-symbols-rounded" style="font-size:13px;">calculate</span> BÁN (TK)
              </th>
              <th class="di-th-group di-th-cukcuk" colspan="1">
                <span class="material-symbols-rounded" style="font-size:13px;">point_of_sale</span> BÁN (APP)
              </th>
              <th class="di-th-group di-th-diff" colspan="1">
                <span class="material-symbols-rounded" style="font-size:13px;">compare_arrows</span> CHÊNH LỆCH
              </th>
            </tr>
            <tr class="di-thead-sub">
              <th></th>
              <th class="di-sub-opening">Tồn đầu</th>
              <th class="di-sub-opening">Nhập mới</th>
              <th class="di-sub-opening">Tổng</th>
              <th class="di-sub-closing">Tồn cuối</th>
              <th class="di-sub-actual">Thực kiểm</th>
              <th class="di-sub-cukcuk">CUKCUK</th>
              <th class="di-sub-diff">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            ${displayRows.length === 0 ? `
              <tr><td colspan="8" class="di-empty-row">
                <span class="material-symbols-rounded" style="font-size:40px;opacity:.3;">local_bar</span>
                <p>${_showOnlyDiff ? 'Không có sản phẩm chênh lệch 🎉' : 'Chưa có sản phẩm nào'}</p>
              </td></tr>
            ` : displayRows.map(function(row, idx) {
              var p = pMap[row.productId] || { name: '?', unit: '—', emoji: '🥤', category: '' };
              var totalOpening = row.openingStock + row.newImport;
              var diffType = row.differenceType || 'MATCH';
              var diffClass = diffType === 'MATCH' ? 'di-diff-match' : diffType === 'SURPLUS' ? 'di-diff-surplus' : 'di-diff-shortage';
              var diffIcon = diffType === 'MATCH' ? 'check_circle' : diffType === 'SURPLUS' ? 'trending_up' : 'trending_down';
              var diffLabel = diffType === 'MATCH' ? 'Khớp' : diffType === 'SURPLUS' ? ('Dư ' + formatNum(Math.abs(row.difference))) : ('Thiếu ' + formatNum(Math.abs(row.difference)));
              var isExpanded = _expandedRow === row.id;

              return `
                <tr class="di-row ${idx % 2 === 0 ? '' : 'di-row-alt'}" data-row-id="${row.id}">
                  <!-- Product -->
                  <td class="di-td-product">
                    <div class="di-product-cell">
                      <span class="di-product-emoji">${p.emoji || '🥤'}</span>
                      <div class="di-product-info">
                        <span class="di-product-name">${p.name}</span>
                        <span class="di-product-meta">${p.category} · ${p.unit}</span>
                      </div>
                    </div>
                  </td>
                  <!-- Tồn đầu -->
                  <td class="di-td-opening">
                    <div class="di-formula-cell">
                      <input type="text" class="di-formula-input" data-field="openingStock" data-row="${row.id}"
                        value="${row.openingFormula || (row.openingStock || '')}"
                        placeholder="0"
                        title="${row.openingFormula ? 'Công thức: ' + row.openingFormula + ' = ' + formatNum(row.openingStock) : ''}">
                      ${row.openingFormula ? '<span class="di-formula-icon" title="' + row.openingFormula + ' = ' + formatNum(row.openingStock) + '">𝑓</span>' : ''}
                    </div>
                  </td>
                  <!-- Nhập mới -->
                  <td class="di-td-opening">
                    <div class="di-formula-cell">
                      <input type="text" class="di-formula-input" data-field="newImport" data-row="${row.id}"
                        value="${row.newImportFormula || (row.newImport || '')}"
                        placeholder="0"
                        title="${row.newImportFormula ? 'Công thức: ' + row.newImportFormula + ' = ' + formatNum(row.newImport) : ''}">
                      ${row.newImportFormula ? '<span class="di-formula-icon" title="' + row.newImportFormula + ' = ' + formatNum(row.newImport) + '">𝑓</span>' : ''}
                    </div>
                  </td>
                  <!-- Tổng -->
                  <td class="di-td-opening di-td-computed">
                    <span class="di-computed-value di-value-blue">${formatNum(totalOpening)}</span>
                  </td>
                  <!-- Cuối ca -->
                  <td class="di-td-closing">
                    <div class="di-formula-cell">
                      <input type="text" class="di-formula-input di-input-closing" data-field="closingStock" data-row="${row.id}"
                        value="${row.closingFormula || (row.closingStock || '')}"
                        placeholder="0"
                        title="${row.closingFormula ? 'Công thức: ' + row.closingFormula + ' = ' + formatNum(row.closingStock) : ''}">
                      ${row.closingFormula ? '<span class="di-formula-icon" title="' + row.closingFormula + ' = ' + formatNum(row.closingStock) + '">𝑓</span>' : ''}
                    </div>
                  </td>
                  <!-- Bán thực kiểm -->
                  <td class="di-td-actual di-td-computed">
                    <span class="di-computed-value di-value-orange">${formatNum(row.actualSold)}</span>
                  </td>
                  <!-- Bán CUKCUK -->
                  <td class="di-td-cukcuk di-td-computed">
                    <span class="di-computed-value di-value-teal">${formatNum(row.cukcukSold)}</span>
                  </td>
                  <!-- Chênh lệch -->
                  <td class="di-td-diff">
                    <button class="di-diff-badge ${diffClass}" data-toggle-row="${row.id}">
                      <span class="material-symbols-rounded" style="font-size:14px;">${diffIcon}</span>
                      <span>${diffLabel}</span>
                      <span class="material-symbols-rounded" style="font-size:12px;">${isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>
                  </td>
                </tr>
                ${isExpanded ? _renderExpandedRow(row, p) : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- ═══ BOTTOM ACTIONS ═══ -->
      <div class="di-bottom-bar">
        <button class="btn btn-outline btn-sm" id="btnDiSaveAll">
          <span class="material-symbols-rounded">save</span> Lưu tất cả
        </button>
        <button class="btn btn-outline btn-sm" id="btnDiClearAll" style="color:var(--danger);border-color:rgba(239,68,68,.3);">
          <span class="material-symbols-rounded">delete_sweep</span> Xóa ca này
        </button>
        <div style="flex:1;"></div>
        <button class="btn btn-sm" id="btnDiPrint" style="background:rgba(99,102,241,.15);color:#6366f1;border:1px solid rgba(99,102,241,.3);">
          <span class="material-symbols-rounded">print</span> In báo cáo A4
        </button>
      </div>
    </div>
  `;
}

// ── Expanded detail row ───────────────────────
function _renderExpandedRow(row, product) {
  var diffType = row.differenceType || 'MATCH';
  var isMatch = diffType === 'MATCH';
  var isSurplus = diffType === 'SURPLUS';
  var statusClass = isMatch ? 'di-detail-match' : isSurplus ? 'di-detail-surplus' : 'di-detail-shortage';
  var statusIcon = isMatch ? 'check_circle' : isSurplus ? 'trending_up' : 'trending_down';
  var statusTitle = isMatch ? 'Khớp số lượng' : isSurplus ? ('Dư ' + formatNum(Math.abs(row.difference)) + ' ' + product.unit) : ('Thiếu ' + formatNum(Math.abs(row.difference)) + ' ' + product.unit);
  var statusDesc = isMatch
    ? 'Số lượng bán thực tế khớp với dữ liệu trên app CUKCUK'
    : isSurplus
      ? 'Bán thực tế CAO hơn app ghi nhận. Kiểm tra lỗi nhập liệu hoặc bán chưa vào app.'
      : 'Bán thực tế THẤP hơn app ghi nhận. Kiểm tra thất thoát hoặc nhập app thừa.';

  return `
    <tr class="di-expanded-row ${statusClass}">
      <td colspan="8">
        <div class="di-detail-card">
          <div class="di-detail-header">
            <span class="material-symbols-rounded" style="font-size:20px;">${statusIcon}</span>
            <div>
              <strong>${statusTitle}</strong>
              <p>${statusDesc}</p>
            </div>
          </div>
          <div class="di-detail-grid">
            <!-- Left: Calculation -->
            <div class="di-detail-box">
              <h5>📊 Tính toán thực kiểm</h5>
              <div class="di-calc-rows">
                <div class="di-calc-row">
                  <span>Tồn đầu ca</span>
                  <span>${formatNum(row.openingStock)} ${product.unit}${row.openingFormula ? ' <code class="di-formula-tag">' + row.openingFormula + '</code>' : ''}</span>
                </div>
                <div class="di-calc-row di-calc-add">
                  <span>＋ Nhập mới</span>
                  <span>${formatNum(row.newImport)} ${product.unit}${row.newImportFormula ? ' <code class="di-formula-tag">' + row.newImportFormula + '</code>' : ''}</span>
                </div>
                <div class="di-calc-row di-calc-total">
                  <span>＝ Tổng có</span>
                  <span class="di-value-blue">${formatNum(row.openingStock + row.newImport)} ${product.unit}</span>
                </div>
                <div class="di-calc-row di-calc-sub">
                  <span>－ Tồn cuối ca</span>
                  <span>${formatNum(row.closingStock)} ${product.unit}${row.closingFormula ? ' <code class="di-formula-tag">' + row.closingFormula + '</code>' : ''}</span>
                </div>
                <div class="di-calc-row di-calc-result">
                  <span>＝ Đã bán (thực)</span>
                  <span class="di-value-orange">${formatNum(row.actualSold)} ${product.unit}</span>
                </div>
              </div>
            </div>
            <!-- Right: CUKCUK compare -->
            <div class="di-detail-box">
              <h5>📱 Dữ liệu CUKCUK App</h5>
              <div class="di-calc-rows">
                <div class="di-calc-row di-calc-result">
                  <span>Bán theo app</span>
                  <span class="di-value-teal">${formatNum(row.cukcukSold)} ${product.unit}</span>
                </div>
              </div>
              <div class="di-compare-result ${statusClass}" style="margin-top:12px;">
                <span class="material-symbols-rounded">${statusIcon}</span>
                <span>${isMatch ? 'Khớp' : (isSurplus ? '+' : '') + formatNum(row.difference)} ${isMatch ? '' : product.unit}</span>
              </div>
              ${!isMatch ? `
                <div class="di-suggestion">
                  <span class="material-symbols-rounded" style="font-size:14px;color:var(--warning);">lightbulb</span>
                  <span>${isSurplus ? 'Có thể do: bán chưa nhập app, tặng kèm, hoặc lỗi đếm.' : 'Có thể do: nhập app nhiều hơn thực tế, hoặc thất thoát.'}</span>
                </div>
              ` : ''}
              <!-- Notes -->
              <div style="margin-top:10px;">
                <label class="form-label">Ghi chú:</label>
                <input type="text" class="form-input" data-note-row="${row.id}" value="${row.notes || ''}" placeholder="Ghi chú cho sản phẩm này..." style="font-size:12px;">
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  `;
}

// ── INIT ───────────────────────────────────────
export function init() {
  // Date change
  var dateInput = document.getElementById('diDate');
  if (dateInput) {
    dateInput.addEventListener('change', function() {
      _currentDate = dateInput.value;
      _expandedRow = null;
      window.refreshView();
    });
  }

  // Shift change
  var shiftSelect = document.getElementById('diShift');
  if (shiftSelect) {
    shiftSelect.addEventListener('change', function() {
      _currentShiftName = shiftSelect.value;
      _expandedRow = null;
      window.refreshView();
    });
  }

  // Sort buttons
  document.querySelectorAll('.di-filter-btn[data-sort]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _sortBy = btn.dataset.sort;
      window.refreshView();
    });
  });

  // Filter toggle
  var filterDiff = document.getElementById('diFilterDiff');
  if (filterDiff) {
    filterDiff.addEventListener('change', function() {
      _showOnlyDiff = filterDiff.checked;
      window.refreshView();
    });
  }

  // Formula inputs
  document.querySelectorAll('.di-formula-input').forEach(function(input) {
    // On focus: show formula
    input.addEventListener('focus', function() {
      var rowId = input.dataset.row;
      var field = input.dataset.field;
      var session = getCurrentSession(_currentDate, _currentShiftName);
      if (!session) return;
      var row = session.rows.find(function(r) { return r.id === rowId; });
      if (!row) return;
      var formulaField = field + 'Formula';
      if (row[formulaField]) {
        input.value = row[formulaField];
      }
      input.select();
    });

    // On blur: parse and save
    input.addEventListener('blur', function() {
      _handleFormulaBlur(input);
    });

    // On Enter: blur
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        input.blur();
        // Focus next input in same row or next row
        var allInputs = Array.from(document.querySelectorAll('.di-formula-input'));
        var idx = allInputs.indexOf(input);
        if (idx >= 0 && idx < allInputs.length - 1) {
          allInputs[idx + 1].focus();
        }
      }
      if (e.key === 'Escape') {
        input.blur();
      }
    });
  });

  // Toggle expanded rows
  document.querySelectorAll('[data-toggle-row]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var rowId = btn.dataset.toggleRow;
      _expandedRow = (_expandedRow === rowId) ? null : rowId;
      window.refreshView();
    });
  });

  // Notes inputs in expanded rows
  document.querySelectorAll('[data-note-row]').forEach(function(input) {
    input.addEventListener('blur', function() {
      var rowId = input.dataset.noteRow;
      var session = getCurrentSession(_currentDate, _currentShiftName);
      if (!session) return;
      var row = session.rows.find(function(r) { return r.id === rowId; });
      if (row) {
        row.notes = input.value;
        saveCurrentSession(_currentDate, _currentShiftName, session);
      }
    });
  });

  // Save all
  var btnSave = document.getElementById('btnDiSaveAll');
  if (btnSave) {
    btnSave.addEventListener('click', function() {
      // Already auto-saved on blur, but let's force-save
      showToast('Đã lưu kiểm kho đồ uống', 'success');
      addAudit('DRINK_INVENTORY_SAVE', _currentShiftName + ' — ' + _currentDate);
    });
  }

  // Clear
  var btnClear = document.getElementById('btnDiClearAll');
  if (btnClear) {
    btnClear.addEventListener('click', function() {
      if (!confirm('Xóa toàn bộ dữ liệu kiểm kho ca này?\nHành động không thể hoàn tác.')) return;
      var data = getInventoryData();
      var key = getSessionKey(_currentDate, _currentShiftName);
      delete data.sessions[key];
      saveInventoryData(data);
      _expandedRow = null;
      showToast('Đã xóa dữ liệu ca', 'info');
      addAudit('DRINK_INVENTORY_DELETE', _currentShiftName + ' — ' + _currentDate);
      window.refreshView();
    });
  }

  // Sync CUKCUK
  var btnSync = document.getElementById('btnDiSyncCukcuk');
  if (btnSync) {
    btnSync.addEventListener('click', _handleSyncCukcuk);
  }

  // Product manager
  var btnManage = document.getElementById('btnDiManageProducts');
  if (btnManage) {
    btnManage.addEventListener('click', _showProductManagerModal);
  }

  // Report
  var btnReport = document.getElementById('btnDiReport');
  if (btnReport) {
    btnReport.addEventListener('click', _showReportModal);
  }

  // Print
  var btnPrint = document.getElementById('btnDiPrint');
  if (btnPrint) {
    btnPrint.addEventListener('click', _handlePrintReport);
  }
}

// ── Formula blur handler ──────────────────────
function _handleFormulaBlur(input) {
  var rowId = input.dataset.row;
  var field = input.dataset.field;
  var session = getCurrentSession(_currentDate, _currentShiftName);
  if (!session) return;
  var row = session.rows.find(function(r) { return r.id === rowId; });
  if (!row) return;

  var result = parseFormula(input.value);
  if (result.error) {
    input.classList.add('di-input-error');
    showToast(result.error, 'warning');
    return;
  }
  input.classList.remove('di-input-error');

  // Update value
  row[field] = result.value;
  row[field + 'Formula'] = result.isFormula ? result.formula : '';

  // Recalculate
  row.actualSold = calcActualSold(row.openingStock, row.newImport, row.closingStock);
  var diff = calcDifference(row.actualSold, row.cukcukSold);
  row.difference = diff.difference;
  row.differenceType = diff.type;

  saveCurrentSession(_currentDate, _currentShiftName, session);

  // Show computed value in input
  input.value = result.isFormula ? formatNum(result.value) : (result.value || '');

  // Update computed cells in same row
  _updateRowUI(row);
}

function _updateRowUI(row) {
  // We refresh the entire view for simplicity
  // Preserve expanded state
  window.refreshView();
}

// ── CUKCUK Sync ───────────────────────────────
async function _handleSyncCukcuk() {
  var btn = document.getElementById('btnDiSyncCukcuk');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded di-spin">sync</span> Đang đồng bộ...';
  }

  try {
    // Read from CUKCUK Invoice Store
    var storeData = localStorage.getItem('cukcuk_invoice_store');
    if (!storeData) {
      showToast('Chưa có dữ liệu CUKCUK. Hãy đồng bộ hóa đơn CUKCUK trước.', 'warning');
      return;
    }
    var parsed = JSON.parse(storeData);
    if (!parsed || !parsed.invoices) {
      showToast('Dữ liệu CUKCUK rỗng', 'warning');
      return;
    }

    // Count sales by product name for current date
    // Working day: 12pm → 6am next day
    var workDay = new Date(_currentDate + 'T12:00:00');
    var nextDay = new Date(workDay);
    nextDay.setDate(nextDay.getDate() + 1);
    var dayStart = new Date(workDay.getFullYear(), workDay.getMonth(), workDay.getDate(), 12, 0, 0);
    var dayEnd = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 6, 0, 0);

    // This is a simplified mapping - in production, you'd match by CUKCUK product ID
    var salesByName = {};
    var totalBills = 0;
    for (var k in parsed.invoices) {
      if (!parsed.invoices.hasOwnProperty(k)) continue;
      var inv = parsed.invoices[k];
      // Check date range
      var inRange = false;
      if (inv.refDate) {
        var dt = new Date(inv.refDate);
        if (!isNaN(dt.getTime())) inRange = dt >= dayStart && dt < dayEnd;
      }
      if (!inRange && inv.date) inRange = inv.date === _currentDate;
      if (!inRange) continue;
      totalBills++;

      // Count items from invoice details
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(function(item) {
          var name = (item.name || '').trim();
          if (name) {
            if (!salesByName[name]) salesByName[name] = 0;
            salesByName[name] += item.quantity || 1;
          }
        });
      }
    }

    // Map to inventory rows
    var session = getCurrentSession(_currentDate, _currentShiftName);
    if (!session) {
      showToast('Chưa tạo ca kiểm kho', 'warning');
      return;
    }

    var products = getProducts();
    var pMap = {};
    products.forEach(function(p) { pMap[p.id] = p; });

    var matched = 0;
    session.rows.forEach(function(row) {
      var product = pMap[row.productId];
      if (!product) return;

      // Try to match by product name (case-insensitive, partial match)
      var pName = product.name.toLowerCase();
      for (var salesName in salesByName) {
        if (salesName.toLowerCase().indexOf(pName) !== -1 || pName.indexOf(salesName.toLowerCase()) !== -1) {
          row.cukcukSold = salesByName[salesName];
          matched++;
          // Recalculate
          row.actualSold = calcActualSold(row.openingStock, row.newImport, row.closingStock);
          var diff = calcDifference(row.actualSold, row.cukcukSold);
          row.difference = diff.difference;
          row.differenceType = diff.type;
          break;
        }
      }
    });

    saveCurrentSession(_currentDate, _currentShiftName, session);
    showToast('Đồng bộ xong: ' + matched + ' sản phẩm khớp từ ' + totalBills + ' bill', 'success');
    addAudit('DRINK_CUKCUK_SYNC', _currentShiftName + ' — ' + matched + ' sản phẩm');
    window.refreshView();

  } catch (e) {
    console.error('CUKCUK sync error:', e);
    showToast('Lỗi đồng bộ: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Đồng bộ CUKCUK';
    }
  }
}

// ── Product Manager Modal ─────────────────────
function _showProductManagerModal() {
  var products = getProducts();
  var categories = {};
  products.forEach(function(p) {
    if (!categories[p.category]) categories[p.category] = [];
    categories[p.category].push(p);
  });

  var html = `
    <div style="padding:24px; max-height:80vh; overflow-y:auto;">
      <div class="modal-title">
        <span class="material-symbols-rounded" style="color:var(--primary);">local_bar</span>
        Quản lý sản phẩm đồ uống
      </div>

      <!-- Add New Product -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><h3>➕ Thêm sản phẩm mới</h3></div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Tên sản phẩm</label>
              <input type="text" class="form-input" id="diNewName" placeholder="VD: Trà Sữa Matcha">
            </div>
            <div class="form-group">
              <label class="form-label">Phân loại</label>
              <input type="text" class="form-input" id="diNewCategory" placeholder="VD: Trà sữa, Bia, Nước ép..." list="diCatList">
              <datalist id="diCatList">
                ${Object.keys(categories).map(function(c) { return '<option value="' + c + '">'; }).join('')}
              </datalist>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Đơn vị</label>
              <select class="form-input" id="diNewUnit">
                <option value="ly">Ly</option>
                <option value="lon">Lon</option>
                <option value="chai">Chai</option>
                <option value="hộp">Hộp</option>
                <option value="trái">Trái</option>
                <option value="kg">Kg</option>
                <option value="phần">Phần</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Emoji</label>
              <input type="text" class="form-input" id="diNewEmoji" value="🥤" style="text-align:center;font-size:18px;width:60px;">
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btnDiAddProduct">
            <span class="material-symbols-rounded">add</span> Thêm sản phẩm
          </button>
        </div>
      </div>

      <!-- Product List -->
      <div class="card">
        <div class="card-header">
          <h3>📋 Danh sách (${products.length} sản phẩm)</h3>
          <button class="btn btn-sm btn-outline" id="btnDiResetProducts" title="Khôi phục mặc định" style="color:var(--danger);">
            <span class="material-symbols-rounded">restart_alt</span>
          </button>
        </div>
        <div class="card-body" style="max-height:400px;overflow-y:auto;">
          ${Object.entries(categories).map(function(entry) {
            var cat = entry[0];
            var items = entry[1];
            return `
              <div style="margin-bottom:12px;">
                <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${cat}</div>
                ${items.map(function(p) {
                  return `
                    <div class="di-pm-item" data-product-id="${p.id}">
                      <span class="di-pm-emoji">${p.emoji || '🥤'}</span>
                      <span class="di-pm-name">${p.name}</span>
                      <span class="di-pm-unit">${p.unit}</span>
                      <label class="toggle-switch di-pm-toggle">
                        <input type="checkbox" ${p.active ? 'checked' : ''} data-toggle-product="${p.id}">
                        <span class="toggle-slider"></span>
                      </label>
                      <button class="btn-icon" data-delete-product="${p.id}" title="Xóa">
                        <span class="material-symbols-rounded" style="color:var(--danger);font-size:18px;">delete</span>
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="window.hideModal()">Đóng</button>
      </div>
    </div>
  `;

    showModal(html);

    // Add product handler
    setTimeout(function() {
      var btnAdd = document.getElementById('btnDiAddProduct');
      if (btnAdd) {
        btnAdd.addEventListener('click', function() {
          var name = (document.getElementById('diNewName').value || '').trim();
          var category = (document.getElementById('diNewCategory').value || '').trim();
          var unit = document.getElementById('diNewUnit').value;
          var emoji = (document.getElementById('diNewEmoji').value || '🥤').trim();
          if (!name) { showToast('Nhập tên sản phẩm', 'warning'); return; }
          if (!category) { showToast('Nhập phân loại', 'warning'); return; }
          var prods = getProducts();
          var newProd = {
            id: 'dp_' + Date.now().toString(36),
            name: name,
            category: category,
            unit: unit,
            emoji: emoji,
            active: true,
            sort: prods.length + 1
          };
          prods.push(newProd);
          saveProducts(prods);

          // Also add to current session
          var session = getCurrentSession(_currentDate, _currentShiftName);
          if (session) {
            session.rows.push({
              id: uid(),
              productId: newProd.id,
              openingStock: 0, openingFormula: '',
              newImport: 0, newImportFormula: '',
              closingStock: 0, closingFormula: '',
              actualSold: 0, cukcukSold: 0,
              difference: 0, differenceType: 'MATCH', notes: ''
            });
            saveCurrentSession(_currentDate, _currentShiftName, session);
          }

          showToast('Đã thêm: ' + name, 'success');
          addAudit('DRINK_ADD_PRODUCT', name + ' (' + category + ')');
          hideModal();
          window.refreshView();
        });
      }

      // Toggle active
      document.querySelectorAll('[data-toggle-product]').forEach(function(cb) {
        cb.addEventListener('change', function() {
          var prodId = cb.dataset.toggleProduct;
          var prods = getProducts();
          var p = prods.find(function(pr) { return pr.id === prodId; });
          if (p) {
            p.active = cb.checked;
            saveProducts(prods);
          }
        });
      });

      // Delete product
      document.querySelectorAll('[data-delete-product]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var prodId = btn.dataset.deleteProduct;
          if (!confirm('Xóa sản phẩm này?')) return;
          var prods = getProducts().filter(function(p) { return p.id !== prodId; });
          saveProducts(prods);
          showToast('Đã xóa', 'info');
          hideModal();
          window.refreshView();
        });
      });

      // Reset defaults
      var btnReset = document.getElementById('btnDiResetProducts');
      if (btnReset) {
        btnReset.addEventListener('click', function() {
          if (!confirm('Khôi phục danh sách sản phẩm về mặc định?')) return;
          localStorage.removeItem(DRINK_PRODUCTS_KEY);
          showToast('Đã khôi phục mặc định', 'info');
          hideModal();
          window.refreshView();
        });
      }
    }, 100);
}

// ── Report Modal ──────────────────────────────
function _showReportModal() {
  var session = getCurrentSession(_currentDate, _currentShiftName);
  if (!session || !session.rows || session.rows.length === 0) {
    showToast('Chưa có dữ liệu kiểm kho để tạo báo cáo', 'warning');
    return;
  }

  var products = getProducts();
  var pMap = {};
  products.forEach(function(p) { pMap[p.id] = p; });

  var rows = session.rows;
  var stats = {
    total: rows.length,
    match: rows.filter(function(r) { return r.differenceType === 'MATCH'; }).length,
    surplus: rows.filter(function(r) { return r.differenceType === 'SURPLUS'; }).length,
    shortage: rows.filter(function(r) { return r.differenceType === 'SHORTAGE'; }).length,
    totalActual: rows.reduce(function(s, r) { return s + r.actualSold; }, 0),
    totalCukcuk: rows.reduce(function(s, r) { return s + r.cukcukSold; }, 0)
  };

  var dateFormatted = new Date(_currentDate + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  var reportHTML = _buildPrintReport(session, products, pMap, stats, dateFormatted);

  var html = `
    <div style="display:flex;height:90vh;">
      <!-- Left: Controls -->
      <div style="width:260px;border-right:1px solid var(--border);padding:20px;display:flex;flex-direction:column;gap:12px;flex-shrink:0;">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--primary);">summarize</span>
          Báo cáo kiểm kho
        </h3>
        <p class="text-muted" style="font-size:12px;">${_currentShiftName} — ${_currentDate}</p>

        <!-- Export buttons -->
        <button class="di-export-btn di-export-print" id="btnDiExportPrint">
          <span class="material-symbols-rounded">print</span>
          <div><strong>In A4</strong><small>In trực tiếp</small></div>
        </button>
        <button class="di-export-btn di-export-png" id="btnDiExportPng">
          <span class="material-symbols-rounded">image</span>
          <div><strong>Xuất PNG</strong><small>Hình ảnh HD</small></div>
        </button>

        <!-- Summary -->
        <div style="margin-top:auto;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">
          <h5 style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Tóm tắt</h5>
          <div class="di-summary-item"><span>✅ Khớp</span><strong>${stats.match}/${stats.total}</strong></div>
          <div class="di-summary-item"><span>📈 Dư</span><strong>${stats.surplus}</strong></div>
          <div class="di-summary-item"><span>📉 Thiếu</span><strong>${stats.shortage}</strong></div>
          <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
            <div class="di-summary-item"><span>🔢 Bán (TK)</span><strong>${formatNum(stats.totalActual)}</strong></div>
            <div class="di-summary-item"><span>📱 Bán (App)</span><strong>${formatNum(stats.totalCukcuk)}</strong></div>
          </div>
        </div>
      </div>

      <!-- Right: Preview -->
      <div style="flex:1;overflow-y:auto;padding:20px;background:rgba(0,0,0,.3);">
        <div id="diReportPreview" style="background:#fff;border-radius:8px;box-shadow:0 4px 30px rgba(0,0,0,.4);overflow:hidden;">
          ${reportHTML}
        </div>
      </div>
    </div>
  `;

    showModal(html, 'large');

    setTimeout(function() {
      // Print
      var btnPrint = document.getElementById('btnDiExportPrint');
      if (btnPrint) {
        btnPrint.addEventListener('click', function() {
          _handlePrintReport();
        });
      }

      // PNG export
      var btnPng = document.getElementById('btnDiExportPng');
      if (btnPng) {
        btnPng.addEventListener('click', function() {
          _handlePngExport();
        });
      }
    }, 100);
}

// ── Build Print Report HTML ───────────────────
function _buildPrintReport(session, products, pMap, stats, dateFormatted) {
  var rows = session.rows;
  var now = new Date();
  var shift = getCurrentShift();
  var cashierName = shift ? shift.cashierName : 'Quản lý';

  return `
    <div id="diPrintReport" style="padding:28px 32px;font-family:'Inter',Arial,sans-serif;color:#1a1a1a;font-size:12px;line-height:1.5;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a1a;padding-bottom:10px;margin-bottom:14px;">
        <div>
          <h1 style="font-size:20px;font-weight:800;color:#1a1a1a;margin:0;">KING's GRILL</h1>
          <p style="font-size:10px;color:#666;margin:2px 0 0;">34, Hoàng Văn Thụ, Chánh Nghĩa, TDM, Bình Dương</p>
        </div>
        <div style="text-align:right;">
          <h2 style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0;">BÁO CÁO KIỂM KHO ĐỒ UỐNG</h2>
          <p style="font-size:11px;color:#666;margin:3px 0 0;">${_currentShiftName} — ${dateFormatted}</p>
        </div>
      </div>

      <!-- Info grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;padding:8px 0;border-bottom:1px solid #ddd;">
        <div><span style="font-size:9px;color:#888;">Ca làm:</span><br><strong style="font-size:11px;">${_currentShiftName}</strong></div>
        <div><span style="font-size:9px;color:#888;">Ngày:</span><br><strong style="font-size:11px;">${_currentDate}</strong></div>
        <div><span style="font-size:9px;color:#888;">Người kiểm:</span><br><strong style="font-size:11px;">${cashierName}</strong></div>
        <div><span style="font-size:9px;color:#888;">Ngày tạo:</span><br><strong style="font-size:11px;">${now.toLocaleString('vi-VN')}</strong></div>
      </div>

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="border-left:4px solid #3b82f6;background:#eff6ff;padding:8px 12px;border-radius:4px;">
          <div style="font-size:9px;color:#888;text-transform:uppercase;">Tổng sản phẩm</div>
          <div style="font-size:22px;font-weight:800;color:#1a1a1a;">${stats.total}</div>
        </div>
        <div style="border-left:4px solid #22c55e;background:#f0fdf4;padding:8px 12px;border-radius:4px;">
          <div style="font-size:9px;color:#888;text-transform:uppercase;">Khớp số</div>
          <div style="font-size:22px;font-weight:800;color:#16a34a;">${stats.match}</div>
        </div>
        <div style="border-left:4px solid #eab308;background:#fefce8;padding:8px 12px;border-radius:4px;">
          <div style="font-size:9px;color:#888;text-transform:uppercase;">Dư</div>
          <div style="font-size:22px;font-weight:800;color:#ca8a04;">${stats.surplus}</div>
        </div>
        <div style="border-left:4px solid #ef4444;background:#fef2f2;padding:8px 12px;border-radius:4px;">
          <div style="font-size:9px;color:#888;text-transform:uppercase;">Thiếu</div>
          <div style="font-size:22px;font-weight:800;color:#dc2626;">${stats.shortage}</div>
        </div>
      </div>

      <!-- Main table -->
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="background:#1a1a1a;color:#fff;">
            <th style="border:1px solid #333;padding:6px;text-align:left;width:4%;">STT</th>
            <th style="border:1px solid #333;padding:6px;text-align:left;width:20%;">Sản phẩm</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Tồn đầu</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Nhập mới</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Tổng có</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Tồn cuối</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Bán (TK)</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:10%;">Bán (App)</th>
            <th style="border:1px solid #333;padding:6px;text-align:center;width:16%;">Chênh lệch</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(function(row, i) {
            var p = pMap[row.productId] || { name: '?', unit: '—', emoji: '🥤' };
            var isMatch = row.differenceType === 'MATCH';
            var isSurplus = row.differenceType === 'SURPLUS';
            var bgColor = isMatch ? '#f0fdf4' : isSurplus ? '#fefce8' : '#fef2f2';
            var diffColor = isMatch ? '#16a34a' : isSurplus ? '#d97706' : '#dc2626';
            var diffText = isMatch ? '✓ Khớp' : isSurplus ? ('▲ Dư ' + formatNum(Math.abs(row.difference))) : ('▼ Thiếu ' + formatNum(Math.abs(row.difference)));
            return `
              <tr style="background:${i % 2 === 0 ? bgColor : '#fff'};">
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;color:#888;">${i + 1}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;">
                  <span>${p.emoji} </span><strong>${p.name}</strong>
                  <span style="color:#888;font-size:9px;"> (${p.unit})</span>
                </td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;">
                  ${formatNum(row.openingStock)}
                  ${row.openingFormula ? '<br><span style="color:#999;font-size:8px;font-family:monospace;">(' + row.openingFormula + ')</span>' : ''}
                </td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;">
                  ${formatNum(row.newImport)}
                  ${row.newImportFormula ? '<br><span style="color:#999;font-size:8px;font-family:monospace;">(' + row.newImportFormula + ')</span>' : ''}
                </td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;font-weight:700;">${formatNum(row.openingStock + row.newImport)}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;">
                  ${formatNum(row.closingStock)}
                  ${row.closingFormula ? '<br><span style="color:#999;font-size:8px;font-family:monospace;">(' + row.closingFormula + ')</span>' : ''}
                </td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;font-weight:700;color:#ea580c;">${formatNum(row.actualSold)}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;font-weight:700;color:#0d9488;">${formatNum(row.cukcukSold)}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;text-align:center;font-weight:800;color:${diffColor};">${diffText}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:700;">
            <td colspan="6" style="border:1px solid #ccc;padding:6px;text-align:right;">Tổng cộng:</td>
            <td style="border:1px solid #ccc;padding:6px;text-align:center;color:#ea580c;">${formatNum(stats.totalActual)}</td>
            <td style="border:1px solid #ccc;padding:6px;text-align:center;color:#0d9488;">${formatNum(stats.totalCukcuk)}</td>
            <td style="border:1px solid #ccc;padding:6px;text-align:center;">${formatNum(Math.abs(stats.totalActual - stats.totalCukcuk))}</td>
          </tr>
        </tfoot>
      </table>

      ${(stats.surplus > 0 || stats.shortage > 0) ? `
        <!-- Difference details -->
        <div style="margin-bottom:14px;">
          <h3 style="font-size:12px;font-weight:800;margin-bottom:6px;">Chi tiết chênh lệch</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${stats.surplus > 0 ? `
              <div style="border:1px solid #fde68a;background:#fefce8;border-radius:6px;padding:10px;">
                <div style="font-weight:700;color:#d97706;font-size:11px;margin-bottom:4px;">▲ DƯ (${stats.surplus} sản phẩm)</div>
                ${rows.filter(function(r) { return r.differenceType === 'SURPLUS'; }).map(function(r) {
                  var p = pMap[r.productId] || { name: '?', unit: '—' };
                  return '<div style="font-size:10px;color:#333;">• ' + p.name + ': +' + formatNum(Math.abs(r.difference)) + ' ' + p.unit + '</div>';
                }).join('')}
              </div>
            ` : ''}
            ${stats.shortage > 0 ? `
              <div style="border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;padding:10px;">
                <div style="font-weight:700;color:#dc2626;font-size:11px;margin-bottom:4px;">▼ THIẾU (${stats.shortage} sản phẩm)</div>
                ${rows.filter(function(r) { return r.differenceType === 'SHORTAGE'; }).map(function(r) {
                  var p = pMap[r.productId] || { name: '?', unit: '—' };
                  return '<div style="font-size:10px;color:#333;">• ' + p.name + ': -' + formatNum(Math.abs(r.difference)) + ' ' + p.unit + '</div>';
                }).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Signatures -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:24px;text-align:center;">
        <div>
          <div style="height:50px;border-bottom:1px dotted #999;margin-bottom:4px;"></div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;">Người kiểm kho</div>
        </div>
        <div>
          <div style="height:50px;border-bottom:1px dotted #999;margin-bottom:4px;"></div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;">Quản lý ca</div>
        </div>
        <div>
          <div style="height:50px;border-bottom:1px dotted #999;margin-bottom:4px;"></div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;">Giám đốc / Quản lý</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align:center;font-size:8px;color:#999;margin-top:12px;padding-top:8px;border-top:1px solid #eee;">
        Báo cáo tạo tự động bởi KG-Cashier DrinkStock — ${now.toLocaleString('vi-VN')}
      </div>
    </div>
  `;
}

// ── Print handler ─────────────────────────────
function _handlePrintReport() {
  var session = getCurrentSession(_currentDate, _currentShiftName);
  if (!session || !session.rows || session.rows.length === 0) {
    showToast('Chưa có dữ liệu để in', 'warning');
    return;
  }

  var products = getProducts();
  var pMap = {};
  products.forEach(function(p) { pMap[p.id] = p; });
  var rows = session.rows;
  var stats = {
    total: rows.length,
    match: rows.filter(function(r) { return r.differenceType === 'MATCH'; }).length,
    surplus: rows.filter(function(r) { return r.differenceType === 'SURPLUS'; }).length,
    shortage: rows.filter(function(r) { return r.differenceType === 'SHORTAGE'; }).length,
    totalActual: rows.reduce(function(s, r) { return s + r.actualSold; }, 0),
    totalCukcuk: rows.reduce(function(s, r) { return s + r.cukcukSold; }, 0)
  };
  var dateFormatted = new Date(_currentDate + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  var reportHTML = _buildPrintReport(session, products, pMap, stats, dateFormatted);

  var printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8">
    <title>Báo cáo kiểm kho — ${_currentShiftName} — ${_currentDate}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', Arial, sans-serif; }
    </style>
    </head><body onload="setTimeout(function(){window.print();},300);">
    ${reportHTML}
    </body></html>
  `);
  printWindow.document.close();
}

// ── PNG Export ─────────────────────────────────
async function _handlePngExport() {
  var el = document.getElementById('diReportPreview') || document.getElementById('diPrintReport');
  if (!el) {
    showToast('Không tìm thấy báo cáo để xuất', 'warning');
    return;
  }

  try {
    // Use html2canvas if available, otherwise fallback to print
    if (typeof html2canvas !== 'undefined') {
      var canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      var link = document.createElement('a');
      link.download = 'KiemKhoDoUong_' + _currentShiftName.replace(/\s/g, '') + '_' + _currentDate + '.png';
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      showToast('Đã xuất PNG thành công!', 'success');
    } else {
      showToast('Tính năng xuất PNG cần thêm thư viện html2canvas', 'info');
      _handlePrintReport();
    }
  } catch (e) {
    console.error('PNG export error:', e);
    showToast('Lỗi xuất PNG: ' + e.message, 'error');
  }
}
