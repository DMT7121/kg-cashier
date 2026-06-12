<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useShiftStore } from '../stores/shift';
import { useAuditsStore } from '../stores/audits';
import { 
  formatCurrency, 
  showConfirm, 
  showToast,
  getWorkingDayRange
} from '../utils';

// ── Interfaces ──────────────────────────────
interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  emoji: string;
  image?: string;
  active: boolean;
  sort: number;
  volume?: string;
  caseSize?: number;
  caseSizeUnit?: string;
  cukcukAliases?: string[];
}

interface InventoryRow {
  id: string;
  productId: string;
  openingStock: number;
  openingFormula: string;
  newImport: number;
  newImportFormula: string;
  closingStock: number;
  closingFormula: string;
  actualSold: number;
  cukcukSold: number;
  difference: number;
  differenceType: 'MATCH' | 'SURPLUS' | 'SHORTAGE';
  notes: string;
}

interface InventorySession {
  id: string;
  date: string;
  shiftName: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  rows: InventoryRow[];
  items?: Record<string, any>;
}

// ── Default Products ──────────────────────────
const DEFAULT_PRODUCTS: Product[] = [
  // ═══ BIA ═══
  { id: 'dp1',  name: 'Corona',                 category: 'Bia',         unit: 'chai', emoji: '🍺', image: '/kiemkho/Corona.png', active: true, sort: 1,  volume: '300ml', caseSize: 24, caseSizeUnit: 'chai', cukcukAliases: ['corona'] },
  { id: 'dp3',  name: 'Heineken 330ml',          category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Heineken 330ml.png', active: true, sort: 3,  volume: '330ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['heineken 330ml'] },
  { id: 'dp4',  name: 'Heineken Silver 330ml',   category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Heineken Silver 330ml.png', active: true, sort: 4,  volume: '330ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['heineken silver 330ml'] },
  { id: 'dp5',  name: 'Heineken Silver 250ml',   category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Heineken Silver 250ml.png', active: true, sort: 5,  volume: '250ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['heineken silver 250ml'] },
  { id: 'dp6',  name: 'Tiger Nâu 330ml',         category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Tiger Nâu 330ml.png', active: true, sort: 6,  volume: '330ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['tiger nâu 330ml', 'tiger nâu'] },
  { id: 'dp7',  name: 'Tiger Bạc 330ml',         category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Tiger Bạc 330ml.png', active: true, sort: 7,  volume: '330ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['tiger bạc 330ml'] },
  { id: 'dp8',  name: 'Tiger Bạc 250ml',         category: 'Bia',         unit: 'lon',  emoji: '🍺', image: '/kiemkho/Tiger Bạc 250ml.png', active: true, sort: 8,  volume: '250ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['tiger bạc 250ml'] },
  // ═══ RƯỢU ═══
  { id: 'dp9',  name: 'Soju',                    category: 'Rượu',        unit: 'chai', emoji: '🍶', image: '/kiemkho/Soju.png', active: true, sort: 9,  volume: '360ml', caseSize: 20, caseSizeUnit: 'chai', cukcukAliases: ['soju'] },
  // ═══ NƯỚC NGỌT ═══
  { id: 'dp10', name: 'Coca Cola',               category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', image: '/kiemkho/Coca cola.png', active: true, sort: 10, volume: '320ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['coca cola'] },
  { id: 'dp11', name: 'Pepsi',                   category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', image: '/kiemkho/Pepsi.png', active: true, sort: 11, volume: '320ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['pepsi'] },
  { id: 'dp12', name: 'Sting',                   category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', image: '/kiemkho/Sting.png', active: true, sort: 12, volume: '320ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['sting'] },
  { id: 'dp13', name: '7up',                     category: 'Nước ngọt',   unit: 'lon',  emoji: '🥤', image: '/kiemkho/7up.png', active: true, sort: 13, volume: '320ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['7up'] },
  // ═══ NƯỚC TĂNG LỰC ═══
  { id: 'dp14', name: 'Redbull',                 category: 'Nước tăng lực', unit: 'lon', emoji: '⚡', image: '/kiemkho/Redbull.png', active: true, sort: 14, volume: '250ml', caseSize: 24, caseSizeUnit: 'lon',  cukcukAliases: ['redbull', 'red bull'] },
  // ═══ NƯỚC SUỐI ═══
  { id: 'dp15', name: 'Nước suối',               category: 'Nước suối',   unit: 'chai', emoji: '💧', image: '/kiemkho/Nước suối Lavie 400ml.png', active: true, sort: 15, volume: '400ml', caseSize: 20, caseSizeUnit: 'chai', cukcukAliases: ['nước suối'] },
];

const SHIFT_OPTIONS = [
  { value: 'Ca sáng', label: 'Ca sáng (6:00-14:00)', icon: '🌅' },
  { value: 'Ca chiều', label: 'Ca chiều (14:00-22:00)', icon: '🌆' },
  { value: 'Ca tối', label: 'Ca tối (22:00-6:00)', icon: '🌙' },
];

// ── Stores ──────────────────────────────────
const settingsStore = useSettingsStore();
const shiftStore = useShiftStore();
const auditsStore = useAuditsStore();

// ── Safe Math Expression Evaluator ────────────
function safeEval(expr: string): number {
  const sanitized = expr.replace(/[^0-9+\-*/().  ]/g, '').replace(/\s+/g, '');
  if (!sanitized) throw new Error('Empty');
  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < sanitized.length && (sanitized[pos] === '+' || sanitized[pos] === '-')) {
      const op = sanitized[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < sanitized.length && (sanitized[pos] === '*' || sanitized[pos] === '/')) {
      const op = sanitized[pos++];
      const right = parseFactor();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (sanitized[pos] === '(') {
      pos++; // skip '('
      const val = parseExpr();
      if (sanitized[pos] === ')') pos++; // skip ')'
      return val;
    }
    let sign = 1;
    if (sanitized[pos] === '-') {
      sign = -1;
      pos++;
    } else if (sanitized[pos] === '+') {
      pos++;
    }
    let numStr = '';
    while (pos < sanitized.length && (/[0-9.]/).test(sanitized[pos])) {
      numStr += sanitized[pos++];
    }
    if (!numStr) throw new Error('Expected number');
    return sign * parseFloat(numStr);
  }

  const result = parseExpr();
  if (pos < sanitized.length) throw new Error('Unexpected char');
  return result;
}

// ── Formula Parser ────────────────────────────
function parseFormula(input: string | number) {
  if (input === undefined || input === null || String(input).trim() === '') {
    return { value: 0, formula: '', isFormula: false };
  }
  const trimmed = String(input).trim();

  // Plain number
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: parseFloat(trimmed), formula: '', isFormula: false };
  }

  // Has operators → is a formula
  if (/[+\-*/()]/.test(trimmed)) {
    try {
      const result = safeEval(trimmed);
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return { value: 0, formula: trimmed, isFormula: false, error: 'Kết quả không hợp lệ' };
      }
      return { value: Math.round(result * 1000) / 1000, formula: trimmed, isFormula: true };
    } catch (e) {
      return { value: 0, formula: trimmed, isFormula: false, error: 'Công thức lỗi' };
    }
  }

  // Try parse as number
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return { value: num, formula: '', isFormula: false };
  return { value: 0, formula: trimmed, isFormula: false, error: 'Không hợp lệ' };
}

function formatNum(v: number): string {
  if (v == null || isNaN(v)) return '0';
  if (Number.isInteger(v)) return v.toLocaleString('vi-VN');
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function uid(prefix = 'di'): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// ── Reactive State ──────────────────────────
const currentDate = ref(new Date().toISOString().split('T')[0]);
const currentShiftName = ref('Ca sáng');
const sortBy = ref<'name' | 'difference'>('name');
const showOnlyDiff = ref(false);
const expandedRow = ref<string | null>(null);
const selectedCategory = ref<string>('Tất cả');
const viewMode = ref<'table' | 'cards'>((localStorage.getItem('kg_drink_inventory_view_mode') as 'table' | 'cards') || 'cards');

watch(viewMode, (newVal) => {
  localStorage.setItem('kg_drink_inventory_view_mode', newVal);
});

const products = ref<Product[]>([]);
const sessions = ref<Record<string, InventorySession>>({});
const focusedInput = ref<{ rowId: string; field: string } | null>(null);
const isSyncing = ref(false);

// Modals State
const showProductManager = ref(false);
const showReport = ref(false);

// New Product Form State
const newProduct = ref({
  name: '',
  category: '',
  unit: 'lon',
  emoji: '🍺',
  volume: '',
  caseSize: '' as number | string,
  aliases: ''
});

// Computed properties
const sessionKey = computed(() => `${currentDate.value}_${currentShiftName.value}`);

const currentSession = computed<InventorySession | null>(() => {
  return sessions.value[sessionKey.value] || null;
});

// Stats Computed Property
const stats = computed(() => {
  const session = currentSession.value;
  if (!session || !session.rows) {
    return { total: 0, match: 0, surplus: 0, shortage: 0, totalActual: 0, totalCukcuk: 0 };
  }

  const total = session.rows.length;
  let match = 0;
  let surplus = 0;
  let shortage = 0;
  let totalActual = 0;
  let totalCukcuk = 0;

  session.rows.forEach(r => {
    totalActual += r.actualSold;
    totalCukcuk += r.cukcukSold;
    if (r.differenceType === 'MATCH') match++;
    else if (r.differenceType === 'SURPLUS') surplus++;
    else if (r.differenceType === 'SHORTAGE') shortage++;
  });

  return { total, match, surplus, shortage, totalActual, totalCukcuk };
});

// Category lookup helper
const categories = computed(() => {
  const map: Record<string, Product[]> = {};
  products.value.forEach(p => {
    if (!map[p.category]) map[p.category] = [];
    map[p.category].push(p);
  });
  return map;
});

const categoryTabs = computed(() => {
  const cats = new Set<string>();
  products.value.forEach(p => {
    if (p.active) cats.add(p.category);
  });
  return ['Tất cả', ...Array.from(cats)];
});

function getCategoryEmoji(cat: string) {
  if (cat === 'Tất cả') return '🍹';
  if (cat === 'Bia') return '🍺';
  if (cat === 'Rượu') return '🍶';
  if (cat === 'Nước ngọt') return '🥤';
  if (cat === 'Nước tăng lực') return '⚡';
  if (cat === 'Nước suối') return '💧';
  return '🥤';
}

// Cleaned/Sorted rows for UI display
const filteredRows = computed(() => {
  const session = currentSession.value;
  if (!session || !session.rows) return [];

  const pMap = products.value.reduce((map, p) => {
    map[p.id] = p;
    return map;
  }, {} as Record<string, Product>);

  let rows = session.rows.filter(r => !!pMap[r.productId]);

  // Filter by category
  if (selectedCategory.value !== 'Tất cả') {
    rows = rows.filter(r => pMap[r.productId]?.category === selectedCategory.value);
  }

  if (showOnlyDiff.value) {
    rows = rows.filter(r => r.differenceType !== 'MATCH');
  }

  if (sortBy.value === 'difference') {
    rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  } else {
    rows.sort((a, b) => {
      const pa = pMap[a.productId] || {};
      const pb = pMap[b.productId] || {};
      return (pa.name || '').localeCompare(pb.name || '');
    });
  }

  return rows;
});

// Product map for easy lookup
const productMap = computed(() => {
  return products.value.reduce((map, p) => {
    map[p.id] = p;
    return map;
  }, {} as Record<string, Product>);
});

// ── Watchers ────────────────────────────────
watch(() => shiftStore.currentShift, (shift) => {
  if (shift) {
    currentDate.value = shift.date;
    if (shift.shiftNumber === 1) currentShiftName.value = 'Ca sáng';
    else if (shift.shiftNumber === 2) currentShiftName.value = 'Ca chiều';
    else if (shift.shiftNumber === 3) currentShiftName.value = 'Ca tối';
    else currentShiftName.value = 'Ca ' + shift.shiftNumber;
  }
}, { immediate: true });

watch(sessionKey, () => {
  ensureSessionExists();
});

// ── Methods ─────────────────────────────────
function loadFromLocalStorage() {
  // Load Products
  try {
    const currentVersion = localStorage.getItem('kg-drink-products-version');
    if (currentVersion !== 'v7') {
      localStorage.setItem('kg-drink-products', JSON.stringify(DEFAULT_PRODUCTS));
      localStorage.setItem('kg-drink-products-version', 'v7');
      products.value = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    } else {
      const saved = localStorage.getItem('kg-drink-products');
      if (saved) {
        products.value = JSON.parse(saved);
      } else {
        products.value = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
      }
    }
  } catch (e) {
    products.value = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  }

  // Load Inventory sessions
  try {
    const saved = localStorage.getItem('kg-drink-inventory');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.sessions) {
        sessions.value = parsed.sessions;
      }
    }
  } catch (e) {
    sessions.value = {};
  }
}

function saveProductsToLocalStorage() {
  localStorage.setItem('kg-drink-products', JSON.stringify(products.value));
}

function saveSessionsToLocalStorage() {
  localStorage.setItem('kg-drink-inventory', JSON.stringify({ sessions: sessions.value }));
}

function syncItemsSnapshot(session: InventorySession) {
  const items: Record<string, any> = {};
  const pMap = productMap.value;

  session.rows.forEach(row => {
    const p = pMap[row.productId];
    if (p) {
      items[row.productId] = {
        name: p.name,
        start: row.openingStock,
        import: row.newImport,
        sold: row.actualSold,
        expected: row.cukcukSold,
        end: row.closingStock
      };
    }
  });
  session.items = items;
}

function createSession(date: string, shiftName: string) {
  const activeProducts = products.value.filter(p => p.active);

  // Carry forward
  const prevClosingMap: Record<string, number> = {};
  try {
    const allKeys = Object.keys(sessions.value).sort().reverse();
    const currentKey = `${date}_${shiftName}`;
    for (const key of allKeys) {
      if (key !== currentKey && sessions.value[key] && sessions.value[key].rows) {
        sessions.value[key].rows.forEach(r => {
          if (r.closingStock > 0) {
            prevClosingMap[r.productId] = r.closingStock;
          }
        });
        break;
      }
    }
  } catch (e) {}

  const rows: InventoryRow[] = activeProducts.map(p => {
    const carryForward = prevClosingMap[p.id] || 0;
    return {
      id: uid(),
      productId: p.id,
      openingStock: carryForward,
      openingFormula: '',
      newImport: 0,
      newImportFormula: '',
      closingStock: 0,
      closingFormula: '',
      actualSold: carryForward,
      cukcukSold: 0,
      difference: carryForward,
      differenceType: carryForward > 0 ? 'SURPLUS' : 'MATCH',
      notes: ''
    };
  });

  const session: InventorySession = {
    id: uid(),
    date,
    shiftName,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    rows
  };

  syncItemsSnapshot(session);
  sessions.value[`${date}_${shiftName}`] = session;
  saveSessionsToLocalStorage();

  if (Object.keys(prevClosingMap).length > 0) {
    showToast('Tự động mang tồn cuối ca trước làm tồn đầu ca mới', 'success');
  }
}

function ensureSessionExists() {
  const key = sessionKey.value;
  if (!sessions.value[key]) {
    createSession(currentDate.value, currentShiftName.value);
  } else {
    // ── Sync session rows with current product list ──
    const session = sessions.value[key];
    const rows = session.rows || [];
    const pMap = productMap.value;

    // 1. Remove ghost rows
    let validRows = rows.filter(r => !!pMap[r.productId]);

    // 2. Add rows for new products
    const existingProductIds = new Set(validRows.map(r => r.productId));
    const activeProducts = products.value.filter(p => p.active);

    let changed = validRows.length !== rows.length;

    activeProducts.forEach(p => {
      if (!existingProductIds.has(p.id)) {
        validRows.push({
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
        });
        changed = true;
      }
    });

    if (changed) {
      session.rows = validRows;
      syncItemsSnapshot(session);
      saveSessionsToLocalStorage();
    }
  }
}

function updateRowValues(row: InventoryRow) {
  row.actualSold = Math.max(0, row.openingStock + row.newImport - row.closingStock);
  const diff = Math.round((row.actualSold - row.cukcukSold) * 100) / 100;
  row.difference = diff;
  if (diff === 0) {
    row.differenceType = 'MATCH';
  } else if (diff > 0) {
    row.differenceType = 'SURPLUS';
  } else {
    row.differenceType = 'SHORTAGE';
  }

  if (currentSession.value) {
    syncItemsSnapshot(currentSession.value);
  }
  saveSessionsToLocalStorage();
}

function incrementStock(row: InventoryRow) {
  row.closingStock = (Number(row.closingStock) || 0) + 1;
  row.closingFormula = '';
  updateRowValues(row);
}

function decrementStock(row: InventoryRow) {
  const current = Number(row.closingStock) || 0;
  if (current > 0) {
    row.closingStock = current - 1;
    row.closingFormula = '';
    updateRowValues(row);
  }
}

// ── Input formula getters & handlers ───────────
function getInputValue(row: InventoryRow, field: 'openingStock' | 'newImport' | 'closingStock') {
  const isFocused = focusedInput.value && focusedInput.value.rowId === row.id && focusedInput.value.field === field;
  if (isFocused) {
    const formulaField = (field + 'Formula') as 'openingFormula' | 'newImportFormula' | 'closingFormula';
    return row[formulaField] || (row[field] || '');
  } else {
    return row[field] ? formatNum(row[field]) : '';
  }
}

function handleInputFocus(rowId: string, field: string) {
  focusedInput.value = { rowId, field };
}

function handleInputBlur(event: FocusEvent, row: InventoryRow, field: 'openingStock' | 'newImport' | 'closingStock') {
  focusedInput.value = null;
  const inputEl = event.target as HTMLInputElement;
  const val = inputEl.value;

  const result = parseFormula(val);
  if (result.error) {
    inputEl.classList.add('di-input-error');
    showToast(result.error, 'warning');
    return;
  }
  inputEl.classList.remove('di-input-error');

  row[field] = result.value;
  const formulaField = (field + 'Formula') as 'openingFormula' | 'newImportFormula' | 'closingFormula';
  row[formulaField] = result.isFormula ? result.formula : '';

  updateRowValues(row);
}

function handleEnterKey(event: KeyboardEvent) {
  const el = event.target as HTMLInputElement;
  el.blur();

  // Focus next formula input sequentially for speedy workflows
  const container = document.getElementById('diTable');
  if (container) {
    const allInputs = Array.from(container.querySelectorAll('.di-formula-input')) as HTMLInputElement[];
    const idx = allInputs.indexOf(el);
    if (idx >= 0 && idx < allInputs.length - 1) {
      allInputs[idx + 1].focus();
    }
  }
}

// ── CUKCUK Integration Sync ────────────────────
async function handleSyncCukcuk() {
  isSyncing.value = true;
  showToast('Đang quét dữ liệu bán của ca từ CUKCUK...', 'info');

  try {
    const storeData = localStorage.getItem('cukcuk_invoice_store');
    if (!storeData) {
      showToast('Chưa có dữ liệu CUKCUK. Hãy đồng bộ hóa đơn CUKCUK trước.', 'warning');
      return;
    }
    const parsed = JSON.parse(storeData);
    if (!parsed || !parsed.invoices) {
      showToast('Dữ liệu hóa đơn CUKCUK rỗng', 'warning');
      return;
    }

    const range = getWorkingDayRange(currentDate.value);
    const dayStart = range.start;
    const dayEnd = range.end;

    const salesByName: Record<string, number> = {};
    let totalBills = 0;

    for (const k in parsed.invoices) {
      if (!Object.prototype.hasOwnProperty.call(parsed.invoices, k)) continue;
      const inv = parsed.invoices[k];
      let inRange = false;
      if (inv.refDate) {
        const dt = new Date(inv.refDate);
        if (!isNaN(dt.getTime())) {
          inRange = dt >= dayStart && dt < dayEnd;
        }
      }
      if (!inRange && inv.date) {
        inRange = inv.date === currentDate.value;
      }
      if (!inRange) continue;
      totalBills++;

      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach((item: any) => {
          const name = (item.name || '').trim();
          if (name) {
            if (!salesByName[name]) salesByName[name] = 0;
            salesByName[name] += item.quantity || 1;
          }
        });
      }
    }

    const session = currentSession.value;
    if (!session) {
      showToast('Chưa tạo ca kiểm kho', 'warning');
      return;
    }

    let matched = 0;
    session.rows.forEach(row => {
      const product = productMap.value[row.productId];
      if (!product) return;

      const pName = product.name.toLowerCase();
      const aliases = (product.cukcukAliases || []).map(a => a.toLowerCase());
      aliases.push(pName);

      let bestMatch = null;
      let bestQty = 0;

      for (const salesName in salesByName) {
        const sLower = salesName.toLowerCase();
        let isMatch = false;

        for (const alias of aliases) {
          if (sLower === alias) {
            isMatch = true;
            break;
          }
          if (sLower.includes(alias) || alias.includes(sLower)) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          bestQty += salesByName[salesName];
          bestMatch = salesName;
        }
      }

      if (bestMatch !== null) {
        row.cukcukSold = bestQty;
        matched++;
        updateRowValues(row);
      }
    });

    saveSessionsToLocalStorage();
    showToast(`Đồng bộ xong: ${matched} sản phẩm khớp từ ${totalBills} hóa đơn`, 'success');
    auditsStore.addAudit('DRINK_CUKCUK_SYNC', `${currentShiftName.value} — ${matched} sản phẩm`);
  } catch (e: any) {
    console.error('CUKCUK sync error:', e);
    showToast('Lỗi đồng bộ: ' + e.message, 'error');
  } finally {
    isSyncing.value = false;
  }
}

// ── Row Expanded Toggles ───────────────────────
function toggleRowExpanded(rowId: string) {
  expandedRow.value = expandedRow.value === rowId ? null : rowId;
}

function getDiffIcon(type: 'MATCH' | 'SURPLUS' | 'SHORTAGE'): string {
  if (type === 'MATCH') return 'check_circle';
  if (type === 'SURPLUS') return 'trending_up';
  return 'trending_down';
}

function getDiffLabel(row: InventoryRow): string {
  if (row.differenceType === 'MATCH') return 'Khớp';
  if (row.differenceType === 'SURPLUS') return `Dư ${formatNum(Math.abs(row.difference))}`;
  return `Thiếu ${formatNum(Math.abs(row.difference))}`;
}

// Proportional scales helper based on volumes
function getScaleFactor(p: Product): number {
  if (p.name === 'Corona') return 1.25;
  if (p.volume) {
    const ml = parseInt(p.volume.replace(/\D/g, ''));
    if (isNaN(ml)) return 1.0;
    if (ml <= 250) {
      if (p.name.includes('Tiger Bạc 250ml') || p.name.includes('Heineken Silver 250ml')) {
        return 1.0;
      }
      return 0.82;
    }
    if (ml <= 320) return 0.94;
    if (ml <= 330) return 1.0;
    if (ml <= 360) return 1.08;
    if (ml >= 400) return 1.18;
  }
  return 1.0;
}

// ── Action Buttons ────────────────────────────
function triggerForceSave() {
  saveSessionsToLocalStorage();
  showToast('Đã lưu kiểm kho đồ uống', 'success');
  auditsStore.addAudit('DRINK_INVENTORY_SAVE', `${currentShiftName.value} — ${currentDate.value}`);
}

async function handleClearCurrentSession() {
  const ok = await showConfirm('Xóa toàn bộ dữ liệu kiểm kho ca này?\nHành động không thể hoàn tác.', {
    title: 'Xóa dữ liệu ca',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (!ok) return;

  delete sessions.value[sessionKey.value];
  saveSessionsToLocalStorage();
  expandedRow.value = null;
  showToast('Đã xóa dữ liệu ca', 'info');
  auditsStore.addAudit('DRINK_INVENTORY_DELETE', `${currentShiftName.value} — ${currentDate.value}`);
  ensureSessionExists();
}

// ── Product Management Handlers ────────────────
function addProduct() {
  const name = newProduct.value.name.trim();
  const category = newProduct.value.category.trim();
  const unit = newProduct.value.unit;
  const emoji = newProduct.value.emoji.trim();

  if (!name) { showToast('Vui lòng nhập tên sản phẩm', 'warning'); return; }
  if (!category) { showToast('Vui lòng nhập phân loại sản phẩm', 'warning'); return; }

  const volume = newProduct.value.volume.trim() || undefined;
  const caseSize = parseInt(newProduct.value.caseSize as string) || undefined;
  const aliasesStr = newProduct.value.aliases.trim();
  const aliases = aliasesStr ? aliasesStr.split(',').map(a => a.trim().toLowerCase()).filter(a => a) : [];

  const added: Product = {
    id: 'dp_' + Date.now().toString(36),
    name,
    category,
    unit,
    emoji: emoji || '🥤',
    active: true,
    sort: products.value.length + 1,
    volume,
    caseSize,
    caseSizeUnit: unit,
    cukcukAliases: aliases.length > 0 ? aliases : [name.toLowerCase()]
  };

  products.value.push(added);
  saveProductsToLocalStorage();

  // Update current session rows
  if (currentSession.value) {
    currentSession.value.rows.push({
      id: uid(),
      productId: added.id,
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
    });
    syncItemsSnapshot(currentSession.value);
    saveSessionsToLocalStorage();
  }

  showToast(`Đã thêm sản phẩm: ${name}`, 'success');
  auditsStore.addAudit('DRINK_ADD_PRODUCT', `${name} (${category})`);

  // Clear form
  newProduct.value = {
    name: '',
    category: '',
    unit: 'lon',
    emoji: '🍺',
    volume: '',
    caseSize: '',
    aliases: ''
  };
}

async function handleDeleteProduct(prodId: string) {
  const ok = await showConfirm('Xóa sản phẩm này ra khỏi danh sách kiểm kho?', {
    title: 'Xóa sản phẩm',
    confirmText: 'Xóa',
    type: 'danger'
  });
  if (!ok) return;

  products.value = products.value.filter(p => p.id !== prodId);
  saveProductsToLocalStorage();
  showToast('Đã xóa sản phẩm', 'info');

  // Trigger reactive update of current session
  ensureSessionExists();
}

function handleProductToggle(p: Product) {
  saveProductsToLocalStorage();
  ensureSessionExists();
}

async function handleResetProducts() {
  const ok = await showConfirm('Khôi phục danh sách sản phẩm về mặc định ban đầu?', {
    title: 'Khôi phục mặc định',
    confirmText: 'Khôi phục',
    type: 'warning'
  });
  if (!ok) return;

  localStorage.removeItem('kg-drink-products');
  showToast('Đã khôi phục sản phẩm về mặc định', 'info');
  loadFromLocalStorage();
  ensureSessionExists();
}

// ── Report Modal Printing and Sharing ──────────
function handlePrintReport() {
  const session = currentSession.value;
  if (!session || !session.rows || session.rows.length === 0) {
    showToast('Chưa có dữ liệu để in', 'warning');
    return;
  }

  const pMap = productMap.value;
  const dateFormatted = new Date(currentDate.value + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const reportHTML = buildPrintReport(session, products.value, pMap, stats.value, dateFormatted);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Không thể mở tab in. Vui lòng tắt chặn Pop-up của trình duyệt.', 'warning');
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8">
    <title>Báo cáo kiểm kho — ${currentShiftName.value} — ${currentDate.value}</title>
    <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Be Vietnam Pro', Arial, sans-serif; }
      img { max-width: 32px; max-height: 32px; }
    </style>
    </head><body onload="setTimeout(function(){window.print();},300);">
    ${reportHTML}
    </body></html>
  `);
  printWindow.document.close();
}

async function handlePngExport() {
  const el = document.getElementById('diReportPreview') || document.getElementById('diPrintReport');
  if (!el) {
    showToast('Không tìm thấy vùng báo cáo để chụp hình', 'warning');
    return;
  }

  try {
    if (typeof (window as any).html2canvas === 'undefined') {
      showToast('Đang tải thư viện ảnh...', 'info');
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Tải thư viện lỗi'));
        document.head.appendChild(script);
      });
    }

    const html2canvas = (window as any).html2canvas;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const link = document.createElement('a');
    link.download = `KiemKhoDoUong_${currentShiftName.value.replace(/\s/g, '')}_${currentDate.value}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
    showToast('Đã xuất ảnh PNG thành công!', 'success');
  } catch (e: any) {
    console.error('PNG export error:', e);
    showToast('Lỗi xuất ảnh: ' + e.message, 'error');
  }
}

function buildPrintReport(session: InventorySession, productsList: Product[], pMap: Record<string, Product>, s: any, dateFormatted: string) {
  const cashierName = shiftStore.currentShift?.cashierName || 'Quản lý';
  const settings = settingsStore.settings || {};
  const storeName = settings.storeName || "KING's GRILL";
  const storeAddr = settings.storeAddress || '34, Hoàng Văn Thụ, Chánh Nghĩa, TDM, Bình Dương';
  const now = new Date();

  return `
    <div id="diPrintReport" style="padding:20px 24px;font-family:'Be Vietnam Pro','Inter',Arial,sans-serif;color:#1a1a1a;font-size:11px;line-height:1.4;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e293b;padding-bottom:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="/android-chrome-192x192.png" style="width:36px;height:36px;" alt="Logo">
          <div>
            <h1 style="font-size:16px;font-weight:800;color:#1e293b;margin:0;letter-spacing:0.5px;">${storeName}</h1>
            <p style="font-size:9px;color:#64748b;margin:1px 0 0;">${storeAddr}</p>
          </div>
        </div>
        <div style="text-align:right;">
          <h2 style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin:0;color:#1e293b;">BÁO CÁO BÀN GIAO KHO NƯỚC</h2>
          <p style="font-size:10px;color:#64748b;margin:2px 0 0;">${session.shiftName} · ${dateFormatted}</p>
        </div>
      </div>

      <!-- Info row -->
      <div style="display:flex;gap:24px;margin-bottom:10px;padding:6px 0;font-size:10px;color:#475569;">
        <span>👤 <strong>${cashierName}</strong></span>
        <span>📅 <strong>${session.date}</strong></span>
        <span>⏰ <strong>${session.shiftName}</strong></span>
        <span style="margin-left:auto;">🖨️ In lúc: ${now.toLocaleString('vi-VN')}</span>
      </div>

      <!-- Summary strip -->
      <div style="display:flex;gap:6px;margin-bottom:12px;">
        <div style="flex:1;background:#f1f5f9;border-radius:6px;padding:6px 10px;text-align:center;border-left:3px solid #3b82f6;">
          <div style="font-size:8px;color:#64748b;text-transform:uppercase;font-weight:700;">Tổng SP</div>
          <div style="font-size:18px;font-weight:800;color:#1e293b;">${s.total}</div>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:6px;padding:6px 10px;text-align:center;border-left:3px solid #22c55e;">
          <div style="font-size:8px;color:#16a34a;text-transform:uppercase;font-weight:700;">Khớp ✓</div>
          <div style="font-size:18px;font-weight:800;color:#16a34a;">${s.match}</div>
        </div>
        <div style="flex:1;background:#fefce8;border-radius:6px;padding:6px 10px;text-align:center;border-left:3px solid #eab308;">
          <div style="font-size:8px;color:#ca8a04;text-transform:uppercase;font-weight:700;">Dư ▲</div>
          <div style="font-size:18px;font-weight:800;color:#ca8a04;">${s.surplus}</div>
        </div>
        <div style="flex:1;background:#fef2f2;border-radius:6px;padding:6px 10px;text-align:center;border-left:3px solid #ef4444;">
          <div style="font-size:8px;color:#dc2626;text-transform:uppercase;font-weight:700;">Thiếu ▼</div>
          <div style="font-size:18px;font-weight:800;color:#dc2626;">${s.shortage}</div>
        </div>
      </div>

      <!-- Main table -->
      <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:3%;">#</th>
            <th style="border:1px solid #334155;padding:5px 6px;text-align:left;width:22%;">Sản phẩm</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#1e40af;">Tồn đầu</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#1e40af;">Nhập mới</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#1e40af;">Tổng có</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#6d28d9;">Tồn cuối</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#c2410c;">Bán (TK)</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:8%;background:#0f766e;">Bán (App)</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:12%;">Chênh lệch</th>
            <th style="border:1px solid #334155;padding:5px 4px;text-align:center;width:15%;">Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${session.rows.map((row, i) => {
            const p = pMap[row.productId] || { name: '?', unit: '—', emoji: '🥤' };
            const isMatch = row.differenceType === 'MATCH';
            const isSurplus = row.differenceType === 'SURPLUS';
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            const diffColor = isMatch ? '#16a34a' : isSurplus ? '#d97706' : '#dc2626';
            const diffBg = isMatch ? '#dcfce7' : isSurplus ? '#fef9c3' : '#fee2e2';
            const diffText = isMatch ? '✓ Khớp' : isSurplus ? ('▲+' + formatNum(Math.abs(row.difference))) : ('▼−' + formatNum(Math.abs(row.difference)));
            const imgHtml = p.image
              ? `<img src="${p.image}" style="width:28px;height:28px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:6px;">`
              : `<span style="font-size:16px;vertical-align:middle;margin-right:4px;">${p.emoji || '🥤'}</span>`;
            return `<tr style="background:${rowBg};">
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;color:#94a3b8;font-size:9px;">${i + 1}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 6px;">${imgHtml}<strong style="font-size:10px;">${p.name}</strong> <span style="color:#94a3b8;font-size:8px;">(${p.unit})</span></td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:600;">${formatNum(row.openingStock)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:600;">${formatNum(row.newImport)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:700;background:#eff6ff;">${formatNum(row.openingStock + row.newImport)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:600;">${formatNum(row.closingStock)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:700;color:#ea580c;">${formatNum(row.actualSold)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:700;color:#0d9488;">${formatNum(row.cukcukSold)}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;text-align:center;font-weight:800;color:${diffColor};background:${diffBg};border-radius:0;">${diffText}</td>
              <td style="border:1px solid #e2e8f0;padding:3px 4px;font-size:8px;color:#64748b;">${row.notes || ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#1e293b;color:#fff;font-weight:700;">
            <td colspan="6" style="border:1px solid #334155;padding:5px 8px;text-align:right;font-size:10px;">TỔNG CỘNG</td>
            <td style="border:1px solid #334155;padding:5px 4px;text-align:center;color:#fb923c;">${formatNum(s.totalActual)}</td>
            <td style="border:1px solid #334155;padding:5px 4px;text-align:center;color:#5eead4;">${formatNum(s.totalCukcuk)}</td>
            <td style="border:1px solid #334155;padding:5px 4px;text-align:center;">${formatNum(Math.abs(s.totalActual - s.totalCukcuk))}</td>
            <td style="border:1px solid #334155;padding:5px 4px;"></td>
          </tr>
        </tfoot>
      </table>

      ${(s.surplus > 0 || s.shortage > 0) ? `
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        ${s.shortage > 0 ? `<div style="flex:1;border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;padding:8px;"><div style="font-weight:700;color:#dc2626;font-size:10px;margin-bottom:3px;">▼ THIẾU (${s.shortage} SP)</div>${session.rows.filter(r => r.differenceType === 'SHORTAGE').map(r => { const p = pMap[r.productId] || { name: '?', unit: '—' }; return `<div style="font-size:9px;color:#333;">• ${p.name}: −${formatNum(Math.abs(r.difference))} ${p.unit}</div>`; }).join('')}</div>` : ''}
        ${s.surplus > 0 ? `<div style="flex:1;border:1px solid #fde68a;background:#fefce8;border-radius:6px;padding:8px;"><div style="font-weight:700;color:#d97706;font-size:10px;margin-bottom:3px;">▲ DƯ (${s.surplus} SP)</div>${session.rows.filter(r => r.differenceType === 'SURPLUS').map(r => { const p = pMap[r.productId] || { name: '?', unit: '—' }; return `<div style="font-size:9px;color:#333;">• ${p.name}: +${formatNum(Math.abs(r.difference))} ${p.unit}</div>`; }).join('')}</div>` : ''}
      </div>` : ''}

      <!-- Signatures -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:16px;text-align:center;">
        <div><div style="height:40px;border-bottom:1px dotted #94a3b8;margin-bottom:3px;"></div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#64748b;">Người kiểm kho</div><div style="font-size:9px;color:#1e293b;font-weight:600;margin-top:2px;">${cashierName}</div></div>
        <div><div style="height:40px;border-bottom:1px dotted #94a3b8;margin-bottom:3px;"></div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#64748b;">Quản lý ca</div></div>
        <div><div style="height:40px;border-bottom:1px dotted #94a3b8;margin-bottom:3px;"></div><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#64748b;">Giám đốc</div></div>
      </div>
      <div style="text-align:center;font-size:7px;color:#94a3b8;margin-top:8px;padding-top:4px;border-top:1px solid #e2e8f0;">KG-Cashier DrinkStock · ${now.toLocaleString('vi-VN')}</div>
    </div>
  `;
}

// ── Lifecycle ───────────────────────────────
onMounted(() => {
  loadFromLocalStorage();
  ensureSessionExists();
});
</script>

<template>
  <div class="di-wrapper text-slate-800">
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
          <span class="material-symbols-rounded text-slate-400 text-[18px]">calendar_today</span>
          <input type="date" class="di-date-input" v-model="currentDate">
        </div>
        <div class="di-control-group">
          <span class="text-base">🌅</span>
          <select class="di-shift-select" v-model="currentShiftName">
            <option v-for="s in SHIFT_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>
      </div>
      <div class="di-toolbar-right flex gap-2">
        <button class="btn btn-sm btn-outline flex items-center gap-1" @click="showProductManager = true">
          <span class="material-symbols-rounded text-base">tune</span> Sản phẩm
        </button>
        <button class="btn btn-sm btn-success flex items-center gap-1" @click="showReport = true">
          <span class="material-symbols-rounded text-base">summarize</span> Báo cáo
        </button>
      </div>
    </div>

    <!-- ═══ HEADER GRADIENT ═══ -->
    <div class="di-header-card">
      <div class="di-header-top">
        <div>
          <h2 class="di-header-title">Kiểm kho đồ uống — {{ currentShiftName }}</h2>
          <p class="di-header-sub">
            {{ new Date(currentDate + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}
          </p>
        </div>
        <div class="di-header-actions">
          <button 
            class="di-sync-btn flex items-center gap-1.5" 
            @click="handleSyncCukcuk" 
            :disabled="isSyncing"
          >
            <span class="material-symbols-rounded text-base" :class="{ 'animate-spin': isSyncing }">sync</span>
            <span>{{ isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ CUKCUK' }}</span>
          </button>
        </div>
      </div>
      <div class="di-stats-row">
        <div class="di-stat di-stat-total">
          <span class="material-symbols-rounded text-[14px]">inventory_2</span>
          <span>Tổng SP: </span>
          <strong class="ml-1">{{ stats.total }}</strong>
        </div>
        <div class="di-stat di-stat-match">
          <span class="material-symbols-rounded text-[14px]">check_circle</span>
          <span>Khớp: </span>
          <strong class="ml-1">{{ stats.match }}</strong>
        </div>
        <div class="di-stat di-stat-surplus">
          <span class="material-symbols-rounded text-[14px]">trending_up</span>
          <span>Dư: </span>
          <strong class="ml-1">{{ stats.surplus }}</strong>
        </div>
        <div class="di-stat di-stat-shortage">
          <span class="material-symbols-rounded text-[14px]">trending_down</span>
          <span>Thiếu: </span>
          <strong class="ml-1">{{ stats.shortage }}</strong>
        </div>
      </div>
    </div>

    <!-- ═══ CATEGORY SLIDER BAR ═══ -->
    <div class="di-category-slider-wrapper px-6 mt-4">
      <div class="di-category-slider flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none scroll-smooth">
        <button 
          v-for="cat in categoryTabs" 
          :key="cat"
          class="di-cat-tab flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border shrink-0 cursor-pointer select-none"
          :class="selectedCategory === cat ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'"
          @click="selectedCategory = cat"
        >
          <span class="di-cat-emoji text-sm">{{ getCategoryEmoji(cat) }}</span>
          <span class="di-cat-name">{{ cat }}</span>
        </button>
      </div>
    </div>

    <!-- ═══ FILTER BAR ═══ -->
    <div class="di-filter-bar">
      <div class="di-filter-left">
        <button 
          class="di-filter-btn" 
          :class="{ active: sortBy === 'name' }" 
          @click="sortBy = 'name'"
        >
          <span class="material-symbols-rounded text-[14px]">sort_by_alpha</span> Tên A→Z
        </button>
        <button 
          class="di-filter-btn" 
          :class="{ active: sortBy === 'difference' }" 
          @click="sortBy = 'difference'"
        >
          <span class="material-symbols-rounded text-[14px]">swap_vert</span> Chênh lệch
        </button>
        <span class="di-filter-divider">|</span>
        <label class="di-filter-toggle">
          <input type="checkbox" v-model="showOnlyDiff">
          <span>Chỉ xem chênh lệch</span>
        </label>
      </div>
      <div class="di-filter-right flex items-center gap-4">
        <!-- View switcher -->
        <div class="flex bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/50 shrink-0">
          <button 
            class="px-2.5 py-1 text-[10px] font-black rounded-lg transition-all border-none bg-transparent cursor-pointer flex items-center gap-1"
            :class="viewMode === 'cards' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'cards'"
          >
            <span class="material-symbols-rounded text-xs">grid_view</span>
            <span>Thẻ chạm</span>
          </button>
          <button 
            class="px-2.5 py-1 text-[10px] font-black rounded-lg transition-all border-none bg-transparent cursor-pointer flex items-center gap-1"
            :class="viewMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'table'"
          >
            <span class="material-symbols-rounded text-xs">table_chart</span>
            <span>Bảng tính</span>
          </button>
        </div>

        <span class="text-slate-400 text-[11px] font-bold">
          Hiển thị {{ filteredRows.length }}/{{ stats.total }} sản phẩm
        </span>
      </div>
    </div>

    <!-- ═══ TOUCH CARD GRID ═══ -->
    <div v-if="viewMode === 'cards'" class="di-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6 mb-6">
      <div v-if="filteredRows.length === 0" class="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <span class="material-symbols-rounded text-[40px] opacity-30 mb-2">local_bar</span>
        <p>{{ showOnlyDiff ? 'Không có sản phẩm chênh lệch 🎉' : 'Chưa có sản phẩm nào' }}</p>
      </div>

      <div 
        v-else 
        v-for="row in filteredRows" 
        :key="row.id" 
        class="di-inventory-card bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md hover:border-blue-100 relative overflow-hidden"
        :class="row.differenceType !== 'MATCH' ? 'border-l-4 border-l-orange-500' : ''"
      >
        <!-- Card Top: Product Info and Status Badge -->
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <img 
                v-if="productMap[row.productId]?.image" 
                :src="productMap[row.productId].image" 
                :alt="productMap[row.productId].name" 
                class="di-card-image w-12 h-12 object-contain rounded-xl bg-slate-50 border border-slate-100 p-1 shrink-0"
                :style="{ '--scale-factor': getScaleFactor(productMap[row.productId]) }"
              />
              <span v-else class="di-card-emoji text-3xl w-12 h-12 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 shrink-0">
                {{ productMap[row.productId]?.emoji || '🥤' }}
              </span>
              <div class="min-w-0">
                <h4 class="text-sm font-extrabold text-slate-800 leading-snug truncate">{{ productMap[row.productId]?.name }}</h4>
                <p class="text-[10px] text-slate-400 font-semibold truncate mt-0.5">
                  {{ productMap[row.productId]?.category }} · {{ productMap[row.productId]?.unit }}
                  <span v-if="productMap[row.productId]?.volume"> · {{ productMap[row.productId].volume }}</span>
                </p>
              </div>
            </div>

            <!-- Chênh lệch badge -->
            <span 
              class="di-card-diff-badge text-[10px] font-black px-2.5 py-1 rounded-full border flex items-center gap-0.5 shadow-2xs shrink-0 cursor-pointer"
              :class="'di-diff-' + row.differenceType.toLowerCase()"
              @click="toggleRowExpanded(row.id)"
            >
              <span class="material-symbols-rounded text-xs">{{ getDiffIcon(row.differenceType) }}</span>
              {{ getDiffLabel(row) }}
            </span>
          </div>

          <!-- Card Mid: Quick Stats (Tồn đầu, Nhập, Tổng) -->
          <div class="grid grid-cols-3 gap-2 py-2.5 px-3 bg-slate-50/50 border border-slate-100/50 rounded-2xl text-center text-[10px] font-bold text-slate-500">
            <div>
              <span class="block text-slate-400 text-[9px] uppercase tracking-wider">Đầu ca</span>
              <span class="text-slate-700 text-xs font-extrabold">{{ formatNum(row.openingStock) }}</span>
            </div>
            <div>
              <span class="block text-slate-400 text-[9px] uppercase tracking-wider">Nhập mới</span>
              <span class="text-blue-600 text-xs font-extrabold">+{{ formatNum(row.newImport) }}</span>
            </div>
            <div>
              <span class="block text-slate-400 text-[9px] uppercase tracking-wider">Tổng có</span>
              <span class="text-slate-800 text-xs font-black">{{ formatNum(row.openingStock + row.newImport) }}</span>
            </div>
          </div>

          <!-- Card Input: TỒN CUỐI (with Slider and Steppers) -->
          <div class="space-y-2 pt-2 border-t border-slate-100/60">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Tồn cuối ca</span>
              <!-- Direct numeric typing input -->
              <input 
                type="number" 
                class="w-16 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 text-center text-xs font-bold text-slate-800 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                v-model.number="row.closingStock"
                @input="updateRowValues(row)"
                placeholder="0"
                min="0"
              />
            </div>

            <!-- Stepper slider control -->
            <div class="flex items-center gap-3">
              <button 
                class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition-all select-none border border-slate-200/30 cursor-pointer active:scale-90"
                @click="decrementStock(row)"
              >
                ➖
              </button>
              <input 
                type="range" 
                min="0" 
                :max="Math.max(48, row.openingStock + row.newImport + 12)" 
                v-model.number="row.closingStock" 
                @input="updateRowValues(row)"
                class="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
              />
              <button 
                class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition-all select-none border border-slate-200/30 cursor-pointer active:scale-90"
                @click="incrementStock(row)"
              >
                ➕
              </button>
            </div>
          </div>
        </div>

        <!-- Card Bottom: Sales Comparison -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
          <div class="flex gap-4">
            <span class="text-slate-400">Thực bán: <strong class="text-orange-600 text-xs font-extrabold">{{ formatNum(row.actualSold) }}</strong></span>
            <span class="text-slate-400">CUKCUK: <strong class="text-teal-600 text-xs font-extrabold">{{ formatNum(row.cukcukSold) }}</strong></span>
          </div>
          
          <button 
            class="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 bg-transparent border-0 cursor-pointer"
            @click="toggleRowExpanded(row.id)"
          >
            <span>Chi tiết</span>
            <span class="material-symbols-rounded text-xs">
              {{ expandedRow === row.id ? 'expand_less' : 'expand_more' }}
            </span>
          </button>
        </div>

        <!-- Expanded Detail panel inside Card layout -->
        <div v-if="expandedRow === row.id" class="mt-4 pt-3 border-t border-slate-100 space-y-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 text-xs text-left">
          <div>
            <span class="block font-bold text-slate-700">Lý do chênh lệch / Ghi chú:</span>
            <input 
              type="text" 
              class="w-full mt-1.5 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
              v-model="row.notes" 
              @blur="saveSessionsToLocalStorage"
              placeholder="Nhập lý do chênh lệch..."
            />
          </div>
          <div class="text-[10px] text-slate-400 font-medium leading-relaxed">
            * <strong>Công thức tính:</strong> Tồn đầu ({{ formatNum(row.openingStock) }}) + Nhập ({{ formatNum(row.newImport) }}) - Tồn cuối ({{ formatNum(row.closingStock) }}) = Thực bán ({{ formatNum(row.actualSold) }}).
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ TABLE VIEW ═══ -->
    <div v-else-if="viewMode === 'table'" class="di-table-wrap overflow-hidden">
      <table class="di-table" id="diTable">
        <thead>
          <tr class="di-thead-main">
            <th class="di-th-product" style="width: 200px;">Sản phẩm</th>
            <th class="di-th-group di-th-opening" colspan="3">
              <span class="material-symbols-rounded text-[13px] align-middle mr-0.5">light_mode</span> ĐẦU CA
            </th>
            <th class="di-th-group di-th-closing" colspan="1">
              <span class="material-symbols-rounded text-[13px] align-middle mr-0.5">dark_mode</span> CUỐI CA
            </th>
            <th class="di-th-group di-th-actual" colspan="1">
              <span class="material-symbols-rounded text-[13px] align-middle mr-0.5">calculate</span> BÁN (TK)
            </th>
            <th class="di-th-group di-th-cukcuk" colspan="1">
              <span class="material-symbols-rounded text-[13px] align-middle mr-0.5">point_of_sale</span> BÁN (APP)
            </th>
            <th class="di-th-group di-th-diff" colspan="1">
              <span class="material-symbols-rounded text-[13px] align-middle mr-0.5">compare_arrows</span> CHÊNH LỆCH
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
          <template v-if="filteredRows.length === 0">
            <tr>
              <td colspan="8" class="di-empty-row py-12 text-center text-slate-400">
                <span class="material-symbols-rounded text-[40px] opacity-30 mb-2">local_bar</span>
                <p>{{ showOnlyDiff ? 'Không có sản phẩm chênh lệch 🎉' : 'Chưa có sản phẩm nào' }}</p>
              </td>
            </tr>
          </template>
          <template v-else v-for="(row, idx) in filteredRows" :key="row.id">
            <tr class="di-row" :class="idx % 2 === 0 ? '' : 'di-row-alt'">
              <!-- Product Info -->
              <td class="di-td-product">
                <div class="di-product-cell flex items-center gap-3">
                  <img 
                    v-if="productMap[row.productId]?.image" 
                    :src="productMap[row.productId].image" 
                    :alt="productMap[row.productId].name" 
                    class="di-product-image"
                    :style="{ '--scale-factor': getScaleFactor(productMap[row.productId]) }"
                  />
                  <span v-else class="di-product-emoji">
                    {{ productMap[row.productId]?.emoji || '🥤' }}
                  </span>
                  <div class="di-product-info">
                    <span class="di-product-name">{{ productMap[row.productId]?.name }}</span>
                    <span class="di-product-meta">
                      {{ productMap[row.productId]?.category }} · {{ productMap[row.productId]?.unit }}
                      <span v-if="productMap[row.productId]?.volume"> · {{ productMap[row.productId].volume }}</span>
                      <span v-if="productMap[row.productId]?.caseSize" class="text-blue-500 font-bold ml-1">
                        [{{ productMap[row.productId].caseSize }}/{{ productMap[row.productId].caseSizeUnit || 'thùng' }}]
                      </span>
                    </span>
                  </div>
                </div>
              </td>

              <!-- Tồn đầu -->
              <td class="di-td-opening">
                <div class="di-formula-cell">
                  <input 
                    type="text" 
                    class="di-formula-input"
                    :value="getInputValue(row, 'openingStock')"
                    @focus="handleInputFocus(row.id, 'openingStock')"
                    @blur="handleInputBlur($event, row, 'openingStock')"
                    @keydown.enter="handleEnterKey"
                    placeholder="0"
                  />
                  <span 
                    v-if="row.openingFormula" 
                    class="di-formula-icon" 
                    :title="row.openingFormula + ' = ' + formatNum(row.openingStock)"
                  >
                    𝑓
                  </span>
                </div>
              </td>

              <!-- Nhập mới -->
              <td class="di-td-opening">
                <div class="di-formula-cell">
                  <input 
                    type="text" 
                    class="di-formula-input"
                    :value="getInputValue(row, 'newImport')"
                    @focus="handleInputFocus(row.id, 'newImport')"
                    @blur="handleInputBlur($event, row, 'newImport')"
                    @keydown.enter="handleEnterKey"
                    placeholder="0"
                  />
                  <span 
                    v-if="row.newImportFormula" 
                    class="di-formula-icon" 
                    :title="row.newImportFormula + ' = ' + formatNum(row.newImport)"
                  >
                    𝑓
                  </span>
                </div>
              </td>

              <!-- Tổng có -->
              <td class="di-td-opening di-td-computed text-center">
                <span class="di-computed-value di-value-blue font-bold">
                  {{ formatNum(row.openingStock + row.newImport) }}
                </span>
              </td>

              <!-- Tồn cuối -->
              <td class="di-td-closing">
                <div class="di-formula-cell">
                  <input 
                    type="text" 
                    class="di-formula-input di-input-closing"
                    :value="getInputValue(row, 'closingStock')"
                    @focus="handleInputFocus(row.id, 'closingStock')"
                    @blur="handleInputBlur($event, row, 'closingStock')"
                    @keydown.enter="handleEnterKey"
                    placeholder="0"
                  />
                  <span 
                    v-if="row.closingFormula" 
                    class="di-formula-icon" 
                    :title="row.closingFormula + ' = ' + formatNum(row.closingStock)"
                  >
                    𝑓
                  </span>
                </div>
              </td>

              <!-- Bán thực kiểm -->
              <td class="di-td-actual di-td-computed">
                <span class="di-computed-value di-value-orange">{{ formatNum(row.actualSold) }}</span>
              </td>

              <!-- Bán CUKCUK -->
              <td class="di-td-cukcuk di-td-computed">
                <span class="di-computed-value di-value-teal">{{ formatNum(row.cukcukSold) }}</span>
              </td>

              <!-- Chênh lệch badge -->
              <td class="di-td-diff">
                <button 
                  class="di-diff-badge" 
                  :class="'di-diff-' + row.differenceType.toLowerCase()"
                  @click="toggleRowExpanded(row.id)"
                >
                  <span class="material-symbols-rounded text-sm">{{ getDiffIcon(row.differenceType) }}</span>
                  <span>{{ getDiffLabel(row) }}</span>
                  <span class="material-symbols-rounded text-xs">
                    {{ expandedRow === row.id ? 'expand_less' : 'expand_more' }}
                  </span>
                </button>
              </td>
            </tr>

            <!-- Expanded row calculation panel -->
            <tr v-if="expandedRow === row.id" class="di-expanded-row" :class="'di-detail-' + row.differenceType.toLowerCase()">
              <td colspan="8">
                <div class="di-detail-card p-4 rounded-xl border m-2">
                  <div class="di-detail-header flex items-center gap-2 mb-3">
                    <span class="material-symbols-rounded text-[20px] text-slate-700">
                      {{ getDiffIcon(row.differenceType) }}
                    </span>
                    <div>
                      <strong class="text-sm block text-slate-800">
                        {{ row.differenceType === 'MATCH' ? 'Khớp số lượng' : row.differenceType === 'SURPLUS' ? `Dư ${formatNum(Math.abs(row.difference))} ${productMap[row.productId]?.unit}` : `Thiếu ${formatNum(Math.abs(row.difference))} ${productMap[row.productId]?.unit}` }}
                      </strong>
                      <p class="text-xs text-slate-500">
                        {{ row.differenceType === 'MATCH' ? 'Số lượng bán thực tế khớp với dữ liệu trên app CUKCUK' : row.differenceType === 'SURPLUS' ? 'Bán thực tế CAO hơn app ghi nhận. Kiểm tra lỗi nhập liệu hoặc bán chưa vào app.' : 'Bán thực tế THẤP hơn app ghi nhận. Kiểm tra thất thoát hoặc nhập app thừa.' }}
                      </p>
                    </div>
                  </div>
                  <div class="di-detail-grid grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Left: Calculation -->
                    <div class="di-detail-box bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                      <h5 class="text-xs font-bold text-slate-600 mb-2">📊 Tính toán thực kiểm</h5>
                      <div class="di-calc-rows space-y-1.5 text-xs">
                        <div class="di-calc-row flex justify-between">
                          <span class="text-slate-500">Tồn đầu ca</span>
                          <span class="font-semibold text-slate-700">
                            {{ formatNum(row.openingStock) }} {{ productMap[row.productId]?.unit }}
                            <code v-if="row.openingFormula" class="di-formula-tag bg-slate-100 px-1 rounded text-blue-600 ml-1">{{ row.openingFormula }}</code>
                          </span>
                        </div>
                        <div class="di-calc-row di-calc-add flex justify-between text-blue-600 font-medium">
                          <span>＋ Nhập mới</span>
                          <span>
                            {{ formatNum(row.newImport) }} {{ productMap[row.productId]?.unit }}
                            <code v-if="row.newImportFormula" class="di-formula-tag bg-blue-50 px-1 rounded ml-1">{{ row.newImportFormula }}</code>
                          </span>
                        </div>
                        <div class="di-calc-row di-calc-total flex justify-between font-bold border-t border-slate-200/60 pt-1 text-slate-800">
                          <span>＝ Tổng có</span>
                          <span class="text-blue-700">{{ formatNum(row.openingStock + row.newImport) }} {{ productMap[row.productId]?.unit }}</span>
                        </div>
                        <div class="di-calc-row di-calc-sub flex justify-between text-rose-600 font-medium mt-1">
                          <span>－ Tồn cuối ca</span>
                          <span>
                            {{ formatNum(row.closingStock) }} {{ productMap[row.productId]?.unit }}
                            <code v-if="row.closingFormula" class="di-formula-tag bg-rose-50 px-1 rounded ml-1">{{ row.closingFormula }}</code>
                          </span>
                        </div>
                        <div class="di-calc-row di-calc-result flex justify-between font-bold border-t border-slate-200 pt-1 text-slate-800">
                          <span>＝ Đã bán (thực)</span>
                          <span class="text-orange-600">{{ formatNum(row.actualSold) }} {{ productMap[row.productId]?.unit }}</span>
                        </div>
                      </div>

                      <!-- Slider Stepper controls for table view detail panel -->
                      <div class="mt-4 pt-3 border-t border-slate-200/60">
                        <label class="text-[10px] font-black text-slate-400 block mb-1.5 uppercase tracking-wider">Kéo nhanh tồn cuối ca:</label>
                        <div class="flex items-center gap-2">
                          <button 
                            class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs flex items-center justify-center cursor-pointer select-none border border-slate-200/20 active:scale-95"
                            @click="decrementStock(row)"
                          >
                            ➖
                          </button>
                          <input 
                            type="range" 
                            min="0" 
                            :max="Math.max(48, row.openingStock + row.newImport + 12)" 
                            v-model.number="row.closingStock" 
                            @input="updateRowValues(row)"
                            class="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
                          />
                          <button 
                            class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs flex items-center justify-center cursor-pointer select-none border border-slate-200/20 active:scale-95"
                            @click="incrementStock(row)"
                          >
                            ➕
                          </button>
                        </div>
                      </div>
                    </div>
                    <!-- Right: CUKCUK compare -->
                    <div class="di-detail-box bg-slate-50/50 p-3 rounded-lg border border-slate-100 flex flex-col justify-between">
                      <div>
                        <h5 class="text-xs font-bold text-slate-600 mb-2">📱 Dữ liệu CUKCUK App</h5>
                        <div class="di-calc-rows text-xs">
                          <div class="di-calc-row flex justify-between font-semibold">
                            <span>Bán theo app</span>
                            <span class="text-teal-600">{{ formatNum(row.cukcukSold) }} {{ productMap[row.productId]?.unit }}</span>
                          </div>
                        </div>
                        <div class="di-compare-result inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold mt-2" :class="'di-detail-' + row.differenceType.toLowerCase()">
                          <span class="material-symbols-rounded text-sm">{{ getDiffIcon(row.differenceType) }}</span>
                          <span>{{ row.differenceType === 'MATCH' ? 'Khớp' : (row.difference > 0 ? '+' : '') + formatNum(row.difference) }} {{ row.differenceType === 'MATCH' ? '' : productMap[row.productId]?.unit }}</span>
                        </div>
                        <p v-if="row.differenceType !== 'MATCH'" class="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                          <span class="material-symbols-rounded text-xs text-amber-500">lightbulb</span>
                          <span>{{ row.differenceType === 'SURPLUS' ? 'Gợi ý: bán chưa nhập app, tặng khách, hoặc đếm nhầm.' : 'Gợi ý: nhập app thừa hoặc thất thoát.' }}</span>
                        </p>
                      </div>
                      <div class="mt-3">
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">Ghi chú lý do chênh lệch:</label>
                        <input 
                          type="text" 
                          class="form-input w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                          v-model="row.notes" 
                          @blur="saveSessionsToLocalStorage"
                          placeholder="Nhập ghi chú cho sản phẩm..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- ═══ BOTTOM ACTIONS ═══ -->
    <div class="di-bottom-bar flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-slate-50/50 mt-auto">
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm flex items-center gap-1 bg-white" @click="triggerForceSave">
          <span class="material-symbols-rounded text-base">save</span> Lưu tất cả
        </button>
        <button class="btn btn-outline btn-sm flex items-center gap-1 text-rose-600 hover:bg-rose-50 border-rose-200 bg-white" @click="handleClearCurrentSession">
          <span class="material-symbols-rounded text-base">delete_sweep</span> Xóa ca này
        </button>
      </div>
      <button class="btn btn-sm flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold" @click="handlePrintReport">
        <span class="material-symbols-rounded text-base">print</span> In báo cáo A4
      </button>
    </div>

    <!-- ═══ PRODUCT MANAGER MODAL ═══ -->
    <div v-if="showProductManager" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" @click.self="showProductManager = false">
      <div class="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-2xl w-full p-6 animate-scale-in flex flex-col max-h-[85vh]">
        <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
          <h3 class="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-amber-500">local_bar</span>
            <span>Quản lý sản phẩm nước uống</span>
          </h3>
          <button class="text-slate-400 hover:text-slate-600" @click="showProductManager = false">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="overflow-y-auto pr-1 space-y-5 flex-1">
          <!-- Add New Product Form -->
          <div class="bg-slate-50/50 rounded-xl border border-slate-200/60 p-4 space-y-3">
            <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider">➕ Thêm sản phẩm mới</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Tên sản phẩm</label>
                <input type="text" class="form-input w-full border border-slate-200 rounded-lg p-2" v-model="newProduct.name" placeholder="VD: Trà Sữa Matcha" />
              </div>
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Phân loại</label>
                <input type="text" class="form-input w-full border border-slate-200 rounded-lg p-2" v-model="newProduct.category" placeholder="VD: Bia, Rượu, Nước ngọt..." list="diCatDatalist" />
                <datalist id="diCatDatalist">
                  <option v-for="(cat, name) in categories" :key="name" :value="name" />
                </datalist>
              </div>
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Đơn vị</label>
                <select class="form-input w-full border border-slate-200 rounded-lg p-2" v-model="newProduct.unit">
                  <option value="lon">Lon</option>
                  <option value="chai">Chai</option>
                  <option value="ly">Ly</option>
                  <option value="hộp">Hộp</option>
                  <option value="trái">Trái</option>
                  <option value="kg">Kg</option>
                  <option value="phần">Phần</option>
                </select>
              </div>
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Emoji đại diện</label>
                <input type="text" class="form-input w-full border border-slate-200 rounded-lg p-2 text-center text-lg" v-model="newProduct.emoji" style="max-width: 60px;" />
              </div>
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Dung tích</label>
                <input type="text" class="form-input w-full border border-slate-200 rounded-lg p-2" v-model="newProduct.volume" placeholder="VD: 330ml" />
              </div>
              <div class="space-y-1">
                <label class="font-semibold text-slate-600">Quy cách thùng (số lượng/thùng)</label>
                <input type="number" class="form-input w-full border border-slate-200 rounded-lg p-2" v-model="newProduct.caseSize" placeholder="VD: 24" min="1" />
              </div>
            </div>
            <div class="space-y-1 text-xs">
              <label class="font-semibold text-slate-600 block">Tên trên CUKCUK (các tên alias, cách nhau bằng dấu phẩy)</label>
              <input type="text" class="form-input w-full border border-slate-200 rounded-lg p-2 text-xs" v-model="newProduct.aliases" placeholder="VD: heineken, bia heineken silver, ken bac" />
              <p class="text-[10px] text-slate-400">Dùng để so khớp chính xác tên sản phẩm khi đồng bộ hóa đơn CUKCUK</p>
            </div>
            <button class="btn btn-primary btn-sm flex items-center gap-1 text-xs" @click="addProduct">
              <span class="material-symbols-rounded text-sm">add</span> Thêm sản phẩm
            </button>
          </div>

          <!-- Product Catalog List -->
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider">📋 Danh sách ({{ products.length }} sản phẩm)</h4>
              <button class="btn btn-sm btn-outline text-rose-600 border-rose-200 hover:bg-rose-50" @click="handleResetProducts" title="Khôi phục mặc định">
                <span class="material-symbols-rounded text-sm">restart_alt</span> Khôi phục gốc
              </button>
            </div>
            <div class="border border-slate-100 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto space-y-4 p-3 bg-white">
              <div v-for="(items, catName) in categories" :key="catName" class="space-y-1.5">
                <div class="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider border-b border-blue-50 pb-1 mb-1.5">
                  {{ catName }}
                </div>
                <div 
                  v-for="p in items" 
                  :key="p.id" 
                  class="flex items-center justify-between gap-3 text-xs border border-slate-50 bg-slate-50/20 hover:bg-slate-50/50 p-2 rounded-lg"
                >
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="text-lg shrink-0">{{ p.emoji }}</span>
                    <span class="font-bold text-slate-800 truncate">{{ p.name }}</span>
                    <span class="text-slate-400 text-[10px]">
                      ({{ p.unit }}<span v-if="p.volume"> · {{ p.volume }}</span><span v-if="p.caseSize"> · {{ p.caseSize }}/ thùng</span>)
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <label class="toggle-switch relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" class="sr-only peer" v-model="p.active" @change="handleProductToggle(p)" />
                      <div class="w-7 h-4 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <button class="btn-icon hover:bg-rose-50 p-1 rounded" @click="handleDeleteProduct(p.id)">
                      <span class="material-symbols-rounded text-rose-500 text-base">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-3 mt-4 flex justify-end">
          <button class="btn btn-outline" @click="showProductManager = false">Đóng</button>
        </div>
      </div>
    </div>

    <!-- ═══ REPORT PREVIEW MODAL ═══ -->
    <div v-if="showReport" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" @click.self="showReport = false">
      <div class="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-5xl w-full p-6 animate-scale-in flex flex-col max-h-[90vh]">
        <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
          <h3 class="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-indigo-600">summarize</span>
            <span>Báo cáo kiểm kê kho nước uống</span>
          </h3>
          <button class="text-slate-400 hover:text-slate-600" @click="showReport = false">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="flex-1 flex gap-5 overflow-hidden min-h-0 flex-col lg:flex-row">
          <!-- Left: Actions & Summary -->
          <div class="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-100 pb-4 lg:pb-0 lg:pr-5 flex flex-col gap-4 flex-shrink-0 justify-between">
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider">Xuất dữ liệu</h4>
              <button class="w-full btn btn-primary flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold" @click="handlePrintReport">
                <span class="material-symbols-rounded text-lg">print</span>
                <div class="text-left leading-tight text-xs">
                  <span class="block">In báo cáo A4</span>
                  <span class="block text-[9px] font-normal text-white/80">In trực tiếp qua máy in</span>
                </div>
              </button>
              <button class="w-full btn bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold" @click="handlePngExport">
                <span class="material-symbols-rounded text-lg text-slate-600">image</span>
                <div class="text-left leading-tight text-xs">
                  <span class="block">Xuất ảnh PNG</span>
                  <span class="block text-[9px] font-normal text-slate-400">Tải ảnh chất lượng cao</span>
                </div>
              </button>
            </div>

            <div class="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 text-xs mt-auto">
              <h5 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tóm tắt ca</h5>
              <div class="flex justify-between"><span class="text-slate-500">✅ Khớp</span><strong class="text-emerald-600">{{ stats.match }}/{{ stats.total }}</strong></div>
              <div class="flex justify-between"><span class="text-slate-500">📈 Chênh dư</span><strong class="text-amber-600">{{ stats.surplus }}</strong></div>
              <div class="flex justify-between"><span class="text-slate-500">📉 Chênh thiếu</span><strong class="text-rose-600">{{ stats.shortage }}</strong></div>
              <div class="border-t border-slate-200/80 my-2 pt-2 space-y-1">
                <div class="flex justify-between"><span class="text-slate-500">Đã bán (thực)</span><strong>{{ formatNum(stats.totalActual) }}</strong></div>
                <div class="flex justify-between"><span class="text-slate-500">Đã bán (app)</span><strong>{{ formatNum(stats.totalCukcuk) }}</strong></div>
              </div>
            </div>
          </div>

          <!-- Right: Document Preview -->
          <div class="flex-1 overflow-y-auto bg-slate-900/10 p-4 rounded-xl border border-slate-100">
            <div 
              id="diReportPreview" 
              class="bg-white rounded-lg shadow-sm border border-slate-200/80 mx-auto max-w-[800px] overflow-hidden"
              v-html="buildPrintReport(currentSession || {} as any, products, productMap, stats, new Date(currentDate + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))"
            />
          </div>
        </div>

        <div class="border-t border-slate-100 pt-3 mt-4 flex justify-end">
          <button class="btn btn-outline" @click="showReport = false">Đóng</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.di-wrapper {
  background-color: transparent;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.di-th-product {
  text-align: left;
  padding-left: 1rem;
}
.di-sub-opening {
  background-color: rgba(239, 246, 255, 0.4);
}
.di-sub-closing {
  background-color: rgba(245, 243, 255, 0.4);
}
.di-sub-actual {
  background-color: rgba(255, 247, 237, 0.4);
}
.di-sub-cukcuk {
  background-color: rgba(240, 253, 250, 0.4);
}
.di-sub-diff {
  background-color: rgba(248, 250, 252, 0.7);
}
.di-input-error {
  border-color: var(--color-danger);
  background-color: #fff1f2;
}
</style>
