<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { showToast } from '../utils';

// Types
interface OrderItem {
  id: string;
  name: string;
  qty: number;
  type: string;
  note?: string;
  status?: string;
  isPrinted?: boolean;
  kitchenDest?: 'bar' | 'kitchen' | 'sashimi';
  printedAt?: string;
  cookedAt?: string;
}

interface TableOrder {
  id: string;
  items: OrderItem[];
}

interface Ticket {
  tableId: string;
  tableName: string;
  zone: string;
  dest: 'bar' | 'kitchen' | 'sashimi';
  items: OrderItem[];
  printedAt?: string;
  allCooked: boolean;
  hasUncooked: boolean;
  orderId: string;
}

// Config
const ORDERS_KEY = 'kg-pos-orders';
const viewMode = ref<'bar' | 'kitchen' | 'sashimi' | 'all'>('bar');
const orders = ref<Record<string, TableOrder>>({});
const now = ref<number>(Date.now());

const settingsStore = useSettingsStore();
let broadcastChannel: BroadcastChannel | null = null;
let refreshTimer: any = null;
let timeTimer: any = null;

// Load orders from local storage
function loadOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) {
      orders.value = JSON.parse(raw);
    } else {
      orders.value = {};
    }
  } catch (e) {
    orders.value = {};
  }
}

// Save orders and notify sync channel
function saveOrders() {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.value));
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'orders-updated', source: 'bar' });
    } catch (e) {}
  }
}

// Get time duration elapsed helper
function timeSince(iso?: string): string {
  if (!iso) return '';
  const ms = now.value - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút`;
  return `${Math.floor(min / 60)}h${min % 60}p`;
}

// Calculated urgency border class
function getUrgencyClass(printedAt?: string, allCooked?: boolean): string {
  if (!printedAt || allCooked) return '';
  const min = Math.floor((now.value - new Date(printedAt).getTime()) / 60000);
  if (min >= 15) return 'bar-ticket-urgent';
  if (min >= 8) return 'bar-ticket-warning';
  return '';
}

// Mode presets
const modes = {
  bar: { icon: '🍹', label: 'Bar', color: '#6366f1' },
  kitchen: { icon: '🍳', label: 'Bếp chính', color: '#10b981' },
  sashimi: { icon: '🐟', label: 'Bếp Sashimi', color: '#f97316' },
  all: { icon: '📋', label: 'Tất cả', color: 'var(--primary, #3b82f6)' }
};

// Process tickets list based on mode and state
const tickets = computed<Ticket[]>(() => {
  const tableList = settingsStore.settings.posTables || [];
  const tableMap = new Map<string, { name: string; zone: string }>();
  tableList.forEach(t => tableMap.set(t.id, { name: t.name, zone: t.zone }));

  const list: Ticket[] = [];

  Object.keys(orders.value).forEach(tableId => {
    const order = orders.value[tableId];
    if (!order || !order.items || !order.items.length) return;
    const table = tableMap.get(tableId) || { name: tableId, zone: '?' };

    // Group items by kitchen destination
    const groups: Record<string, { items: OrderItem[]; printedAt: string | null }> = {};
    order.items.forEach(item => {
      if (item.status === 'cancelled') return;
      const dest = item.kitchenDest || (item.type === 'drink' ? 'bar' : 'kitchen');

      // Filter by active tab selection
      if (viewMode.value !== 'all' && dest !== viewMode.value) return;

      if (!groups[dest]) {
        groups[dest] = { items: [], printedAt: null };
      }
      groups[dest].items.push(item);
      if (item.printedAt && (!groups[dest].printedAt || item.printedAt < groups[dest].printedAt!)) {
        groups[dest].printedAt = item.printedAt;
      }
    });

    Object.keys(groups).forEach(destKey => {
      const g = groups[destKey];
      if (!g.items.length) return;
      const dest = destKey as 'bar' | 'kitchen' | 'sashimi';
      const allCooked = g.items.every(i => i.status === 'cooked');
      const hasUncooked = g.items.some(i => i.isPrinted && i.status !== 'cooked');
      list.push({
        tableId: tableId,
        tableName: table.name,
        zone: table.zone,
        dest: dest,
        items: g.items,
        printedAt: g.printedAt || undefined,
        allCooked: allCooked,
        hasUncooked: hasUncooked,
        orderId: order.id
      });
    });
  });

  // Sort tickets: uncooked first, then oldest printed order first
  return list.sort((a, b) => {
    if (a.allCooked !== b.allCooked) return a.allCooked ? 1 : -1;
    const ta = a.printedAt || '9999';
    const tb = b.printedAt || '9999';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
});

// Aggregate counters
const stats = computed(() => {
  let pendingItems = 0;
  let activeTickets = 0;

  tickets.value.forEach(t => {
    if (!t.allCooked) {
      activeTickets++;
      pendingItems += t.items.filter(i => i.isPrinted && i.status !== 'cooked').length;
    }
  });

  return { pendingItems, activeTickets };
});

// Operations
function markItemCooked(tableId: string, itemId: string) {
  const tableOrder = orders.value[tableId];
  if (!tableOrder) return;
  const item = tableOrder.items.find(i => i.id === itemId);
  if (!item) return;

  item.status = 'cooked';
  item.cookedAt = new Date().toISOString();
  saveOrders();
  showToast('Đã xong 1 món', 'success');
}

function markAllCooked(tableId: string, dest: 'bar' | 'kitchen' | 'sashimi') {
  const tableOrder = orders.value[tableId];
  if (!tableOrder) return;

  tableOrder.items.forEach(i => {
    const iDest = i.kitchenDest || (i.type === 'drink' ? 'bar' : 'kitchen');
    if (iDest === dest && i.status !== 'cancelled' && i.status !== 'cooked') {
      i.status = 'cooked';
      i.cookedAt = new Date().toISOString();
    }
  });

  saveOrders();
  showToast('Tất cả món đã hoàn thành!', 'success');
}

// Lifecycle Hooks
onMounted(() => {
  loadOrders();

  // Listen on the broadcast sync channel
  try {
    broadcastChannel = new BroadcastChannel('kg-pos-sync');
    broadcastChannel.onmessage = (e) => {
      if (e.data && e.data.type === 'orders-updated' && e.data.source !== 'bar') {
        loadOrders();
      }
    };
  } catch (e) {
    console.warn('[BarDashboard] BroadcastChannel not supported in this browser');
  }

  // Periodic polling check as fallback
  refreshTimer = setInterval(() => {
    loadOrders();
  }, 5000);

  // Recalculate elapsed timer
  timeTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (timeTimer) clearInterval(timeTimer);
  if (broadcastChannel) {
    try {
      broadcastChannel.close();
    } catch (e) {}
  }
});
</script>

<template>
  <div class="view-content p-0 h-full flex flex-col bg-slate-50/50">
    <div class="bar-shell flex-1 flex flex-col h-full overflow-hidden">
      <!-- Station header & filters -->
      <div class="bar-header shrink-0 p-4 border-b border-slate-100 bg-white flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div class="bar-header-left flex items-center gap-3">
          <span class="material-symbols-rounded text-3xl" :style="{ color: modes[viewMode].color }">monitor_heart</span>
          <div>
            <h3 class="margin-0 font-bold text-lg text-slate-800">Màn hình {{ modes[viewMode].label }}</h3>
            <small class="text-slate-500 font-medium">
              {{ stats.activeTickets }} phiếu &middot; {{ stats.pendingItems }} món chờ chế biến
            </small>
          </div>
        </div>

        <div class="bar-header-right flex overflow-x-auto gap-1">
          <button 
            v-for="(info, key) in modes" 
            :key="key"
            class="bar-mode-tab cursor-pointer px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all"
            :class="{ 
              'bg-slate-50 border-slate-200 text-slate-600': viewMode !== key,
              'active': viewMode === key
            }"
            :style="viewMode === key ? { 
              backgroundColor: info.color + '12', 
              color: info.color, 
              borderColor: info.color + '44' 
            } : {}"
            @click="viewMode = key"
          >
            <span>{{ info.icon }}</span>
            <span>{{ info.label }}</span>
          </button>
        </div>
      </div>

      <!-- Tickets list grid -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <div v-if="tickets.length > 0" class="bar-tickets-grid p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
          <div 
            v-for="ticket in tickets" 
            :key="ticket.tableId + '-' + ticket.dest"
            class="bar-ticket relative"
            :class="[
              getUrgencyClass(ticket.printedAt, ticket.allCooked),
              { 'bar-ticket-done': ticket.allCooked }
            ]"
          >
            <!-- Card Header -->
            <div class="bar-ticket-header">
              <div class="bar-ticket-table">
                <span class="bar-ticket-table-name">{{ ticket.tableName }}</span>
                <span class="bar-ticket-zone">{{ ticket.zone }}</span>
              </div>
              <div class="bar-ticket-meta">
                <span class="bar-ticket-dest" :style="{ color: modes[ticket.dest]?.color }">
                  {{ modes[ticket.dest]?.icon }} {{ modes[ticket.dest]?.label }}
                </span>
                <span v-if="ticket.printedAt && !ticket.allCooked" class="bar-ticket-time">
                  ⏱ {{ timeSince(ticket.printedAt) }}
                </span>
              </div>
            </div>

            <!-- Items list -->
            <div class="bar-ticket-items">
              <div 
                v-for="item in ticket.items" 
                :key="item.id"
                class="bar-item-row flex items-center justify-between p-2 rounded-xl hover:bg-slate-50/75 transition-all border border-transparent"
                :class="{ 'cooked bg-slate-50/50 opacity-60': item.status === 'cooked' }"
              >
                <div class="bar-item-info flex-1 pr-2">
                  <div class="flex items-baseline gap-1.5">
                    <span class="bar-item-qty font-extrabold text-sm" :class="item.status === 'cooked' ? 'text-slate-400' : 'text-blue-600'">
                      {{ item.qty }}×
                    </span>
                    <span class="bar-item-name font-bold text-sm text-slate-800" :class="{ 'line-through text-slate-400 font-medium': item.status === 'cooked' }">
                      {{ item.name }}
                    </span>
                  </div>
                  <div v-if="item.note" class="bar-item-note text-xs text-rose-500 font-semibold bg-rose-50/40 px-2 py-0.5 rounded-lg mt-0.5 border border-rose-100/30 w-fit">
                    📝 {{ item.note }}
                  </div>
                </div>

                <!-- Cook triggers -->
                <div>
                  <span v-if="item.status === 'cooked'" class="bar-item-done text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                    ✔ Xong
                  </span>
                  <span v-else-if="!item.isPrinted" class="bar-item-pending text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                    ⏳ Chờ
                  </span>
                  <button 
                    v-else
                    class="bar-item-cook-btn cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 hover:border-blue-200 font-bold text-xs px-2.5 py-1 rounded-xl transition-all"
                    @click="markItemCooked(ticket.tableId, item.id)"
                  >
                    ✅ Xong
                  </button>
                </div>
              </div>
            </div>

            <!-- Card Footer (Bulk Done) -->
            <div v-if="ticket.hasUncooked" class="bar-ticket-footer border-t border-slate-50 p-3 flex justify-end">
              <button 
                class="btn btn-sm cursor-pointer flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                :style="{ 
                  backgroundColor: (modes[ticket.dest]?.color || '#10b981') + '15',
                  color: modes[ticket.dest]?.color || '#10b981',
                  border: '1px solid ' + (modes[ticket.dest]?.color || '#10b981') + '25'
                }"
                @click="markAllCooked(ticket.tableId, ticket.dest)"
              >
                <span class="material-symbols-rounded text-sm">done_all</span> 
                Tất cả xong
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="bar-empty flex flex-col items-center justify-center py-24 text-center">
          <span class="material-symbols-rounded text-6xl text-slate-200 mb-4">restaurant</span>
          <h3 class="font-bold text-lg text-slate-700 mb-1">Trống trải & Sạch sẽ</h3>
          <p class="text-xs text-slate-400 max-w-[280px]">Không có phiếu chế biến nào. Phiếu sẽ tự động xuất hiện khi thu ngân gửi lệnh báo bếp hoặc bar.</p>
        </div>
      </div>
    </div>
  </div>
</template>
